# 🔧 Technical Implementation Guide

## Overview

This guide shows you how to build the actual AI voice agent backend that powers your service.

---

## Option 1: VAPI.ai (Recommended for Beginners)

### Step 1: Sign Up
1. Go to https://vapi.ai
2. Create account (free trial available)
3. Add credits ($10-20 to start)

### Step 2: Create Your First Assistant

```javascript
// Example assistant configuration
{
  "name": "Dental Receptionist",
  "voice": {
    "provider": "11labs",
    "voiceId": "sarah" // or any voice you prefer
  },
  "model": {
    "provider": "openai",
    "model": "gpt-4",
    "systemPrompt": `You are Sarah, a friendly receptionist at Bright Dental Clinic in Singapore.
    
Your job is to:
1. Answer calls professionally
2. Book dental appointments
3. Answer basic questions about services
4. Qualify leads

Services offered:
- General checkups and cleanings ($150)
- Teeth whitening ($400)
- Dental implants (consultation required)
- Emergency services (available 24/7)

Working hours: Monday-Saturday, 9 AM - 6 PM
Location: 123 Orchard Road, Singapore

Always be polite, professional, and helpful. If you don't know something, offer to have someone call them back.`
  },
  "functions": [
    {
      "name": "bookAppointment",
      "description": "Book an appointment for the caller",
      "parameters": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "phone": { "type": "string" },
          "service": { "type": "string" },
          "date": { "type": "string" },
          "time": { "type": "string" }
        },
        "required": ["name", "phone", "service", "date", "time"]
      }
    },
    {
      "name": "checkAvailability",
      "description": "Check available time slots",
      "parameters": {
        "type": "object",
        "properties": {
          "date": { "type": "string" }
        },
        "required": ["date"]
      }
    }
  ]
}
```

### Step 3: Set Up Webhook Handler

Create a simple webhook server to handle function calls:

```javascript
// webhook-server.js
const express = require('express');
const app = express();
app.use(express.json());

// Handle booking requests
app.post('/webhook/book-appointment', async (req, res) => {
  const { name, phone, service, date, time } = req.body;
  
  // 1. Add to Google Calendar
  await addToCalendar({ name, phone, service, date, time });
  
  // 2. Send confirmation SMS
  await sendSMS(phone, `Hi ${name}, your appointment for ${service} is confirmed for ${date} at ${time}. See you then!`);
  
  // 3. Add to CRM/Spreadsheet
  await addToSheet({ name, phone, service, date, time });
  
  res.json({ 
    success: true, 
    message: `Appointment booked for ${name} on ${date} at ${time}` 
  });
});

// Handle availability checks
app.post('/webhook/check-availability', async (req, res) => {
  const { date } = req.body;
  const slots = await getAvailableSlots(date);
  res.json({ availableSlots: slots });
});

app.listen(3000, () => console.log('Webhook server running'));
```

### Step 4: Google Calendar Integration

```javascript
// calendar.js
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

async function addToCalendar(appointment) {
  const event = {
    summary: `Appointment: ${appointment.name}`,
    description: `Service: ${appointment.service}\nPhone: ${appointment.phone}`,
    start: {
      dateTime: `${appointment.date}T${appointment.time}:00`,
      timeZone: 'Asia/Singapore',
    },
    end: {
      dateTime: `${appointment.date}T${parseInt(appointment.time) + 1}:00:00`,
      timeZone: 'Asia/Singapore',
    },
  };
  
  await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });
}

async function getAvailableSlots(date) {
  // Query calendar for existing appointments
  // Return available time slots
  const events = await calendar.events.list({
    calendarId: 'primary',
    timeMin: `${date}T09:00:00+08:00`,
    timeMax: `${date}T18:00:00+08:00`,
  });
  
  // Logic to find free slots
  return ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
}
```

### Step 5: Deploy and Test

1. Deploy webhook server (Railway, Render, or Vercel)
2. Add webhook URL to VAPI assistant
3. Buy a phone number in VAPI
4. Test by calling the number

---

## Option 2: Retell AI (More Customization)

### Step 1: Sign Up
1. Go to https://retellai.com
2. Create account
3. Get API key

### Step 2: Create Agent

```javascript
// create-agent.js
const Retell = require('retell-sdk');

const retell = new Retell({ apiKey: process.env.RETELL_API_KEY });

async function createAgent() {
  const agent = await retell.agent.create({
    voice_id: '11labs-Sarah',
    llm_websocket_url: 'wss://your-server.com/llm-websocket',
    begin_message: 'Hello! Thank you for calling Bright Dental. This is Sarah. How can I help you today?',
  });
  
  console.log('Agent created:', agent.agent_id);
  return agent;
}
```

### Step 3: WebSocket LLM Handler

```javascript
// llm-websocket.js
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('Client connected');
  
  ws.on('message', async (message) => {
    const data = JSON.parse(message);
    
    // Process with OpenAI
    const response = await processWithLLM(data);
    
    // Send response back
    ws.send(JSON.stringify({
      response_id: data.response_id,
      content: response,
    }));
  });
});

async function processWithLLM(data) {
  // Call OpenAI API with conversation history
  // Return appropriate response
}
```

---

## Option 3: Make.com + VAPI (No-Code)

For simpler setups, use Make.com to connect everything:

### Workflow:
1. **VAPI** receives call
2. **Make.com** webhook triggers
3. **Make.com** adds to Google Calendar
4. **Make.com** sends SMS via Twilio
5. **Make.com** adds to Google Sheets

### Make.com Scenario:
```
Webhook (VAPI) → Parse Data → Google Calendar (Create Event) 
                                      ↓
                              Google Sheets (Add Row)
                                      ↓
                              Twilio (Send SMS)
```

---

## 📊 Dashboard Backend

### Database Schema (Supabase/PostgreSQL)

```sql
-- Calls table
CREATE TABLE calls (
  id UUID DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  caller_phone TEXT,
  call_started_at TIMESTAMP,
  call_ended_at TIMESTAMP,
  duration_seconds INTEGER,
  outcome TEXT, -- 'booked', 'info_request', 'not_qualified', etc.
  recording_url TEXT,
  transcript TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Clients table
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid(),
  business_name TEXT,
  email TEXT,
  phone TEXT,
  plan TEXT, -- 'starter', 'professional', 'enterprise'
  vapi_assistant_id TEXT,
  vapi_phone_number TEXT,
  google_calendar_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Appointments table
CREATE TABLE appointments (
  id UUID DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  call_id UUID REFERENCES calls(id),
  customer_name TEXT,
  customer_phone TEXT,
  service TEXT,
  appointment_date DATE,
  appointment_time TIME,
  status TEXT DEFAULT 'confirmed',
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API Endpoints

```javascript
// server.js - Dashboard API
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Get dashboard stats
app.get('/api/stats/:clientId', async (req, res) => {
  const { clientId } = req.params;
  
  // Get calls this week
  const { data: calls } = await supabase
    .from('calls')
    .select('*')
    .eq('client_id', clientId)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
  
  // Calculate stats
  const stats = {
    totalCalls: calls.length,
    appointmentsBooked: calls.filter(c => c.outcome === 'booked').length,
    conversionRate: Math.round(calls.filter(c => c.outcome === 'booked').length / calls.length * 100),
    avgDuration: Math.round(calls.reduce((a, b) => a + b.duration_seconds, 0) / calls.length),
  };
  
  res.json(stats);
});

// Get recent calls
app.get('/api/calls/:clientId', async (req, res) => {
  const { clientId } = req.params;
  const { data: calls } = await supabase
    .from('calls')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(50);
  
  res.json(calls);
});

// Get analytics data
app.get('/api/analytics/:clientId', async (req, res) => {
  const { clientId } = req.params;
  
  // Get daily stats for last 7 days
  const { data } = await supabase
    .rpc('get_daily_stats', { client_id: clientId });
  
  res.json(data);
});

app.listen(3000);
```

---

## 🔐 Environment Variables

Create a `.env` file:

```env
# VAPI
VAPI_API_KEY=your_vapi_key
VAPI_ASSISTANT_ID=your_assistant_id

# Google Calendar
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# Twilio (for SMS)
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890

# OpenAI
OPENAI_API_KEY=your_openai_key
```

---

## 🚀 Deployment

### Deploy Webhook Server (Railway)

1. Push code to GitHub
2. Connect Railway to GitHub repo
3. Add environment variables
4. Deploy automatically

### Deploy Dashboard (Vercel)

```bash
# Build the React app
npm run build

# Deploy to Vercel
vercel --prod
```

---

## 💰 Cost Breakdown

| Service | Cost/Month | Notes |
|---------|-----------|-------|
| VAPI | ~$50-200 | Per client, usage-based |
| OpenAI | ~$20-50 | GPT-4 API calls |
| Supabase | Free tier | Database + auth |
| Railway/Vercel | Free tier | Hosting |
| Twilio | ~$10-20 | SMS notifications |
| **Total per client** | **~$100-300** | |
| **Your charge** | **$347-997** | |
| **Profit** | **$197-697/mo per client** | |

---

## 🧪 Testing Checklist

Before launching a client:

- [ ] Call the number, does AI answer?
- [ ] Can AI book an appointment?
- [ ] Does appointment appear in calendar?
- [ ] Is confirmation SMS sent?
- [ ] Does dashboard show the call?
- [ ] Are analytics accurate?
- [ ] Can client pause/resume agent?
- [ ] Edge cases handled (no availability, etc.)

---

## 📞 Support & Resources

- **VAPI Docs:** https://docs.vapi.ai
- **Retell Docs:** https://docs.retellai.com
- **Make.com:** https://make.com
- **Community:** Join VAPI Discord for help

---

**Need help building this?** I'm here to code it with you! 🦞
