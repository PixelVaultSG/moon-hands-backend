# Google Calendar Integration — Technical Feasibility Plan

## Summary
**YES, this is 100% technically executable.** The recommended approach is **Service Account sharing** — clinics add our service account email to their calendar during onboarding. The backend reads free/busy times and writes bookings automatically.

---

## Option Analysis

| Approach | Read Calendar | Write Bookings | Clinic Effort | Our Effort | Recommended |
|----------|--------------|----------------|---------------|------------|-------------|
| A. Public ical link | Yes | **No** | Low | Low | **No** — cannot create appointments |
| B. Service account sharing | Yes | Yes | Low | Medium | **Yes** — best balance |
| C. OAuth2 consent flow | Yes | Yes | Medium | Medium | Viable but adds friction |
| D. CalDAV | Yes | Yes | Medium | High | Overkill for our use case |

**Recommendation: Option B (Service Account)**

---

## Option B: Service Account — Full Implementation Plan

### Step 1: Google Cloud Setup (we do this once)
1. Create Google Cloud project: `moon-hands-calendar`
2. Enable Google Calendar API
3. Create Service Account: `calendar@moon-hands-calendar.iam.gserviceaccount.com`
4. Download JSON key → store as `GOOGLE_CALENDAR_KEY` env var on Render
5. Save the service account email for onboarding

### Step 2: Onboarding Form Update
Add to Step 1 (Clinic Info):
```
Google Calendar Integration * [Optional for now]

To connect your calendar:
1. Open your Google Calendar
2. Find "My calendars" → click ⋮ next to your calendar → Settings
3. Scroll to "Share with specific people"
4. Add: calendar@moon-hands-calendar.iam.gserviceaccount.com
5. Set permission: "Make changes to events"
6. Paste your Calendar ID below (found in Settings → Integrate calendar)

Calendar ID: [____________________]
```

### Step 3: Backend Integration
```javascript
// server/calendar-service.js
const { google } = require('googleapis');

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_CALENDAR_KEY),
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

async function getAvailableSlots(calendarId, date) {
  const calendar = google.calendar({ version: 'v3', auth });
  
  // Get existing events for the date
  const { data } = await calendar.events.list({
    calendarId,
    timeMin: `${date}T00:00:00+08:00`,
    timeMax: `${date}T23:59:59+08:00`,
    singleEvents: true,
    orderBy: 'startTime',
  });
  
  // Calculate free slots from operating hours minus existing events
  const busyTimes = data.items.map(e => ({
    start: new Date(e.start.dateTime),
    end: new Date(e.end.dateTime),
  }));
  
  return calculateFreeSlots(busyTimes, date);
}

async function createBooking(calendarId, { summary, start, end, description }) {
  const calendar = google.calendar({ version: 'v3', auth });
  
  return calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `📋 ${summary}`,
      description,
      start: { dateTime: start, timeZone: 'Asia/Singapore' },
      end: { dateTime: end, timeZone: 'Asia/Singapore' },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 60 },
        ],
      },
    },
  });
}
```

### Step 4: Bot Engine Integration
```javascript
// In ai/bot-engine.js — when patient requests booking:

// 1. Get clinic's calendar ID from client_configs
const { data: config } = await supabase
  .from('client_configs')
  .select('google_calendar_id, operating_hours, slot_duration')
  .eq('client_id', clientId)
  .single();

// 2. If calendar connected, check real availability
if (config.google_calendar_id) {
  const freeSlots = await getAvailableSlots(
    config.google_calendar_id,
    preferredDate
  );
  // Show only genuinely available slots
} else {
  // Fall back to operating_hours from database
}

// 3. On booking confirmation, create the event
await createBooking(config.google_calendar_id, {
  summary: `Botox — Sarah Lim`,
  start: '2026-07-15T14:00:00+08:00',
  end: '2026-07-15T14:30:00+08:00',
  description: 'Patient: +65 9123 4567\\nBooking via Moon Hands',
});
```

### Step 5: Database Update
```sql
-- Already exists in client_configs:
ALTER TABLE client_configs 
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;

-- Add calendar sync status tracking
ALTER TABLE client_configs
ADD COLUMN IF NOT EXISTS calendar_sync_enabled BOOLEAN DEFAULT false;

ALTER TABLE client_configs
ADD COLUMN IF NOT EXISTS calendar_sync_error TEXT;
```

---

## User Experience Flow

### Clinic Onboarding (Step 1)
```
Clinic Name: [Glow Aesthetics]
WhatsApp: [+65 8123 4567]
Google Calendar ID: [glowclinic@gmail.com] ← optional field
[?] How to find my Calendar ID
```

### If Calendar Connected
- Patient: "Can I book Botox for Tuesday 2pm?"
- AI: Checks ACTUAL calendar → "Let me check... that slot is available!"
- Confirmed booking appears instantly in clinic's Google Calendar

### If Calendar NOT Connected
- Patient: "Can I book Botox for Tuesday 2pm?"
- AI: Uses operating_hours from database → "Based on your hours, that should work. I'll hold it for approval."
- Booking goes to pending queue in Telegram dashboard

---

## Cost

| Item | Cost |
|------|------|
| Google Cloud project | Free tier (1M Calendar API calls/month) |
| Service account key storage | Free (env var) |
| Additional API calls beyond free tier | ~S$0.004 per 100 calls |
| **Monthly estimate** | **S$0 (within free tier)** |

---

## Security

- Service account has NO access to clinic calendar until clinic explicitly shares it
- We only request "Make changes to events" permission (not full account access)
- Calendar ID stored encrypted in Supabase
- Clinic can revoke access anytime by removing the service account from sharing

---

## Implementation Timeline

| Phase | Task | Effort |
|-------|------|--------|
| 1 | Google Cloud project + service account | 30 min |
| 2 | Backend calendar service module | 2 hours |
| 3 | Onboarding form Calendar ID field | 30 min |
| 4 | Bot engine integration (check availability) | 2 hours |
| 5 | Bot engine integration (create events) | 1 hour |
| 6 | Testing + edge cases | 2 hours |
| **Total** | | **~8 hours** |

---

## Verdict

**100% executable. Smooth. Zero cost.**

The service account approach gives us:
- ✅ Read clinic calendar for real availability
- ✅ Write confirmed bookings directly to clinic calendar
- ✅ Low friction for clinics (just add an email to sharing)
- ✅ No OAuth complexity
- ✅ Free within Google Cloud free tier
- ✅ Secure (clinic controls access)

The only clinic effort is pasting a Calendar ID and adding our email to sharing settings — takes 2 minutes.
