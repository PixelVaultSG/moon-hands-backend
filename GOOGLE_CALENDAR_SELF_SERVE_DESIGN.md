# Google Calendar Self-Serve Integration

**Status:** Design document — ready for implementation
**Effort:** 1-2 days

---

## User Experience

### On the Onboarding Form (Step 7)

```
📅 Connect Your Calendar (Optional)

We automatically sync all bookings to your calendar.

[🔄 Connect Google Calendar]  ← Button

Don't use Google Calendar? No problem — we'll give you an iCal feed
that works with Apple Calendar, Outlook, and any calendar app.
```

### Flow

```
Clinic clicks "Connect Google Calendar"
  ↓
Popup opens to Google's OAuth consent screen
  ↓
Clinic selects their Google account
  ↓
Clinic grants permission: "Manage your calendars"
  ↓
Google redirects to our callback URL with auth code
  ↓
Backend exchanges code for refresh token
  ↓
Backend stores: refresh_token + primary_calendar_id
  ↓
Backend shows: "✅ Google Calendar connected!"
  ↓
Clinic continues with form submission
```

---

## Technical Implementation

### 1. Google Cloud Console Setup (You Do This)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create new project: "Moon Hands Calendar Sync"
3. Enable Google Calendar API
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URI:
   `https://moon-hands-backend.onrender.com/auth/google/callback`
6. Download client credentials (Client ID + Client Secret)
7. Add to Render env vars:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=https://moon-hands-backend.onrender.com/auth/google/callback
   ```

### 2. Backend Endpoints (Already Partially Built)

**A. Initiate OAuth — GET `/auth/google`**

Already exists in `server/webhook.js`:
```javascript
} else if (url.pathname === '/auth/google/callback' && req.method === 'GET') {
    await handleGoogleCallback(req, res, url);
}
```

Need to add:
```javascript
} else if (url.pathname === '/auth/google' && req.method === 'GET') {
    await handleGoogleAuth(req, res, url);
}
```

**B. Handle Callback — GET `/auth/google/callback`**

Already exists but needs refinement for self-serve:

```javascript
async function handleGoogleAuth(req, res, url) {
  const clientId = url.searchParams.get('client_id'); // Pass clinic ID from onboarding form
  
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  
  // Generate URL with state parameter (contains clinic ID)
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',        // Request refresh token
    prompt: 'consent',             // Always show consent screen (forces refresh token)
    scope: ['https://www.googleapis.com/auth/calendar'],
    state: clientId,               // Pass clinic ID through OAuth flow
  });
  
  res.writeHead(302, { Location: authUrl });
  res.end();
}

async function handleGoogleCallback(req, res, url) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // clinic ID
  const error = url.searchParams.get('error');
  
  if (error) {
    return sendHTMLResponse(res, 400, 'Calendar connection cancelled', 
      'You cancelled the Google Calendar connection. You can try again or use the iCal feed instead.');
  }
  
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    const { tokens } = await oauth2Client.getToken(code);
    
    if (!tokens.refresh_token) {
      return sendHTMLResponse(res, 400, 'Connection incomplete',
        'No refresh token received. Please revoke Moon Hands access in your Google Account settings and try again.');
    }
    
    // Get primary calendar
    oauth2Client.setCredentials({ refresh_token: tokens.refresh_token });
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarList = await calendar.calendarList.list();
    const primaryCalendar = calendarList.data.items.find(c => c.primary) || calendarList.data.items[0];
    
    // If state contains a clinic ID, update that clinic
    if (state && state !== 'demo') {
      const { error: updateErr } = await supabase
        .from('clients')
        .update({
          google_refresh_token: tokens.refresh_token,
          google_calendar_id: primaryCalendar.id,
          calendar_provider: 'google'
        })
        .eq('id', state);
      
      if (updateErr) throw updateErr;
    }
    
    sendHTMLResponse(res, 200, '✅ Google Calendar Connected!',
      `Your clinic bookings will now sync to <strong>${escapeHtml(primaryCalendar.summary)}</strong>.<br><br>You can close this window and continue with your onboarding.`);
    
  } catch (err) {
    console.error('[GOOGLE_OAUTH] Callback error:', err.message);
    sendHTMLResponse(res, 500, 'Connection Failed',
      'Something went wrong. Please try again or contact support.');
  }
}

function sendHTMLResponse(res, status, title, message) {
  res.writeHead(status, { 'Content-Type': 'text/html' });
  res.end(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:sans-serif;text-align:center;padding:50px;max-width:500px;margin:0 auto;}
h1{font-size:24px;margin-bottom:20px;}p{color:#555;line-height:1.6;}</style></head>
<body><h1>${title}</h1><p>${message}</p></body></html>`);
}

function escapeHtml(text) {
  return text.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
```

### 3. Frontend Button (Add to Onboarding Form)

```tsx
// In Onboarding.tsx, Step 7

const [calendarConnected, setCalendarConnected] = useState(false);
const [calendarName, setCalendarName] = useState('');

const connectGoogleCalendar = () => {
  // Open OAuth in popup
  const width = 500;
  const height = 600;
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  
  const popup = window.open(
    `https://moon-hands-backend.onrender.com/auth/google?client_id=${pendingClientId}`,
    'googleOAuth',
    `width=${width},height=${height},left=${left},top=${top}`
  );
  
  // Listen for popup closing (naive check)
  const checkClosed = setInterval(() => {
    if (popup.closed) {
      clearInterval(checkClosed);
      setCalendarConnected(true); // Assume success (verify on submit)
    }
  }, 1000);
};

// In the form:
{!calendarConnected ? (
  <button type="button" onClick={connectGoogleCalendar} className="...">
    🔄 Connect Google Calendar
  </button>
) : (
  <div className="text-green-600">
    ✅ Google Calendar connected{calendarName && ` (${calendarName})`}
  </div>
)}

<p className="text-sm text-gray-500 mt-2">
  Don't use Google Calendar? We'll provide an iCal feed that works with any calendar app.
</p>
```

### 4. How Bookings Sync to Google Calendar

When a patient books via WhatsApp:

```javascript
// In bot-engine.js, after booking is confirmed

if (clientConfig.googleCalendarId && clientConfig.googleRefreshToken) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET
    );
    oauth2Client.setCredentials({ refresh_token: clientConfig.googleRefreshToken });
    
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    // Calculate end time based on treatment duration
    const treatment = clientConfig.services.find(s => s.name === booking.service);
    const duration = treatment?.duration || 60;
    const startDateTime = new Date(`${booking.date}T${booking.time}:00+08:00`);
    const endDateTime = new Date(startDateTime.getTime() + duration * 60000);
    
    const event = await calendar.events.insert({
      calendarId: clientConfig.googleCalendarId,
      requestBody: {
        summary: `${booking.service} - ${booking.patient_name}`,
        description: `Booking via Moon Hands AI\nPhone: ${booking.patient_phone}\nStatus: ${booking.status}`,
        start: { dateTime: startDateTime.toISOString(), timeZone: 'Asia/Singapore' },
        end: { dateTime: endDateTime.toISOString(), timeZone: 'Asia/Singapore' },
      }
    });
    
    // Store event ID for updates/cancellations
    await supabase.from('appointments').update({ google_event_id: event.data.id }).eq('id', booking.id);
    
  } catch (err) {
    console.error('[CALENDAR] Sync error:', err.message);
    // Don't fail the booking if calendar sync fails
  }
}
```

---

## iCal Feed (Fallback — Always Available)

Even without Google Calendar, every clinic gets an iCal feed:

```
https://moon-hands-backend.onrender.com/ical/[TOKEN].ics
```

**How to use:**
- **Apple Calendar:** File → New Calendar Subscription → Paste URL
- **Outlook:** Add Calendar → From Internet → Paste URL
- **Google Calendar:** Settings → Add Calendar → From URL → Paste URL

**Auto-refresh:** Most calendar apps check every 15-60 minutes.

---

## Summary

| Feature | Google Calendar | iCal Feed |
|---------|----------------|-----------|
| Setup | 1 click (OAuth) | Copy-paste URL |
| Sync speed | Instant (real-time) | 15-60 min lag |
| Two-way sync | Yes (edit in Google) | No (read-only) |
| Best for | Clinic uses Google Workspace | Clinic uses Apple/Outlook |

**Both are always available.** Clinic picks what works for them.

---

*Design complete. Ready for implementation.*
