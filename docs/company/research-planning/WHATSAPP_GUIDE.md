# 📱 WhatsApp Business API Integration Guide

## Why WhatsApp is CRITICAL for Your Business

| Statistic | Impact |
|-----------|--------|
| **2+ billion users** worldwide | Massive reach |
| **98% open rate** vs 20% email | Messages get seen |
| **45-60% response rate** | Highly engaged users |
| **Singapore: 4.9M users** (83% of population) | Essential for SG market |
| **Average response time: 90 seconds** | Instant communication |

**Bottom line:** Businesses that don't use WhatsApp are leaving money on the table.

---

## 🛠️ WhatsApp Business API Options

### Option 1: Meta's Official WhatsApp Business API (Recommended)

**Best for:** Serious businesses, scale, reliability

**Pros:**
- ✅ Official Meta product
- ✅ No message limits (with approval)
- ✅ Green checkmark verification
- ✅ High deliverability
- ✅ Rich media support (images, buttons, catalogs)

**Cons:**
- ❌ Requires Facebook Business verification
- ❌ Must use approved Business Solution Provider (BSP)
- ❌ Costs ~$0.005-0.08 per conversation

**BSPs to Consider:**
| Provider | Pricing | Best For |
|----------|---------|----------|
| **360dialog** | ~$0.005/msg | Developers, custom builds |
| **WATI** | $49/mo + usage | Small businesses, easy setup |
| **MessageBird** | Pay per use | Multi-channel (SMS + WhatsApp) |
| **Twilio** | $0.005/msg + $1/mo | Existing Twilio users |

### Option 2: WhatsApp Business App (Free)

**Best for:** Solopreneurs, testing, very small volume

**Pros:**
- ✅ Completely free
- ✅ Easy to set up
- ✅ Works on phone

**Cons:**
- ❌ Limited to 1 device
- ❌ No API/webhooks
- ❌ Can't automate at scale
- ❌ No green checkmark

### Option 3: Unofficial APIs (NOT Recommended)

**Avoid:** WhatsApp Web automation, third-party libraries

**Why:**
- ❌ Against WhatsApp ToS
- ❌ Account will get banned
- ❌ Unreliable
- ❌ No support

---

## 🚀 Implementation: Meta Official API + 360dialog

### Step 1: Sign Up with 360dialog

1. Go to https://360dialog.com
2. Create account
3. Complete Facebook Business verification
4. Get API key

### Step 2: Set Up Webhook Handler

```javascript
// whatsapp-webhook.js
const express = require('express');
const axios = require('axios');
const app = express();

const DIALOG360_API_KEY = process.env.DIALOG360_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Receive incoming WhatsApp messages
app.post('/webhook/whatsapp', async (req, res) => {
  const { messages, contacts } = req.body;
  
  for (const message of messages) {
    const { from, text, type } = message;
    
    if (type === 'text') {
      // Process with AI
      const aiResponse = await processWithAI(text.body, from);
      
      // Send response back
      await sendWhatsAppMessage(from, aiResponse);
    }
  }
  
  res.sendStatus(200);
});

// Process message with OpenAI
async function processWithAI(userMessage, phoneNumber) {
  const systemPrompt = `You are Sarah, a friendly AI assistant for Pixel Vault.
  
Your job:
1. Answer questions about our services
2. Book appointments
3. Qualify leads
4. Be helpful and professional

Services:
- AI Voice Receptionist ($347/mo)
- WhatsApp Automation ($347/mo)
- Complete Package ($547/mo)

Working hours: Monday-Saturday, 9 AM - 6 PM
Location: Singapore

Keep responses concise (1-2 sentences max).
Use emojis occasionally but not excessively.
Always offer to book a call for complex inquiries.`;

  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ],
    temperature: 0.7,
    max_tokens: 150
  }, {
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
  });
  
  return response.data.choices[0].message.content;
}

// Send WhatsApp message
async function sendWhatsAppMessage(to, message) {
  await axios.post('https://waba.360dialog.io/v1/messages', {
    to: to,
    type: 'text',
    text: { body: message }
  }, {
    headers: { 
      'D360-API-KEY': DIALOG360_API_KEY,
      'Content-Type': 'application/json'
    }
  });
}

// Send message with buttons
async function sendWhatsAppButtons(to, message, buttons) {
  await axios.post('https://waba.360dialog.io/v1/messages', {
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: message },
      action: {
        buttons: buttons.map((btn, idx) => ({
          type: 'reply',
          reply: { id: `btn_${idx}`, title: btn }
        }))
      }
    }
  }, {
    headers: { 
      'D360-API-KEY': DIALOG360_API_KEY,
      'Content-Type': 'application/json'
    }
  });
}

app.listen(3000, () => console.log('WhatsApp webhook running on port 3000'));
```

### Step 3: Appointment Booking Flow

```javascript
// booking-flow.js
const { google } = require('googleapis');

// Handle booking intent
async function handleBookingIntent(phoneNumber, message) {
  // Extract date/time from message
  const extractedInfo = await extractBookingInfo(message);
  
  if (extractedInfo.date && extractedInfo.time) {
    // Check availability
    const available = await checkAvailability(extractedInfo.date, extractedInfo.time);
    
    if (available) {
      // Book appointment
      await bookAppointment({
        phone: phoneNumber,
        date: extractedInfo.date,
        time: extractedInfo.time,
        service: extractedInfo.service || 'General Consultation'
      });
      
      return `✅ Perfect! I've booked you for ${extractedInfo.date} at ${extractedInfo.time}. 

You'll receive a confirmation shortly. See you then! 👋`;
    } else {
      // Offer alternatives
      const alternatives = await getAlternativeSlots(extractedInfo.date);
      return `That time isn't available. How about one of these?
${alternatives.map(a => `• ${a}`).join('\n')}`;
    }
  }
  
  return "I'd be happy to book an appointment! What date and time works for you? 📅";
}

// Extract booking info using AI
async function extractBookingInfo(message) {
  const response = await axios.post('https://api.openai.com/v1/chat/completions', {
    model: 'gpt-4',
    messages: [{
      role: 'system',
      content: `Extract booking information from the user message.
      Return JSON with: date (YYYY-MM-DD), time (HH:MM), service (string)
      Today's date is ${new Date().toISOString().split('T')[0]}`
    }, {
      role: 'user',
      content: message
    }],
    temperature: 0
  }, {
    headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}` }
  });
  
  return JSON.parse(response.data.choices[0].message.content);
}

// Check Google Calendar availability
async function checkAvailability(date, time) {
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  
  const startTime = new Date(`${date}T${time}:00+08:00`);
  const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour
  
  const response = await calendar.freebusy.query({
    requestBody: {
      timeMin: startTime.toISOString(),
      timeMax: endTime.toISOString(),
      items: [{ id: 'primary' }]
    }
  });
  
  return response.data.calendars.primary.busy.length === 0;
}
```

### Step 4: Rich Message Templates

```javascript
// templates.js

// Welcome message for new contacts
const welcomeTemplate = {
  name: 'welcome_message',
  language: { code: 'en' },
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: '{{customer_name}}' }
      ]
    }
  ]
};

// Appointment confirmation
const confirmationTemplate = {
  name: 'appointment_confirmation',
  language: { code: 'en' },
  components: [
    {
      type: 'body',
      parameters: [
        { type: 'text', text: '{{customer_name}}' },
        { type: 'text', text: '{{service}}' },
        { type: 'text', text: '{{date}}' },
        { type: 'text', text: '{{time}}' }
      ]
    }
  ]
};

// Send template message
async function sendTemplateMessage(to, templateName, params) {
  await axios.post('https://waba.360dialog.io/v1/messages', {
    to: to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: 'en' },
      components: [{
        type: 'body',
        parameters: params.map(p => ({ type: 'text', text: p }))
      }]
    }
  }, {
    headers: { 
      'D360-API-KEY': DIALOG360_API_KEY,
      'Content-Type': 'application/json'
    }
  });
}
```

---

## 💰 WhatsApp API Costs

### 360dialog Pricing (as of 2025)

| Plan | Monthly Fee | Per Conversation |
|------|-------------|------------------|
| **Starter** | Free | $0.008 |
| **Pro** | $49 | $0.006 |
| **Enterprise** | Custom | Custom |

### Conversation Types (Meta's pricing)

| Type | Definition | Cost |
|------|------------|------|
| **User-initiated** | Customer messages first | ~$0.005-0.08 |
| **Business-initiated** | You message first (24h window) | ~$0.005-0.15 |

**Note:** First 1,000 conversations/month are FREE!

---

## 📊 Expected Volume & Costs

### Small Business (1 location)
- ~500 WhatsApp messages/month
- Cost: ~$4-8/month
- Your charge: $347/month
- **Profit: $289-293/month**

### Medium Business (3-5 locations)
- ~2,000 WhatsApp messages/month
- Cost: ~$16-20/month
- Your charge: $547/month
- **Profit: $477-481/month**

### Enterprise (10+ locations)
- ~10,000+ WhatsApp messages/month
- Cost: ~$80-100/month
- Your charge: $997/month
- **Profit: $897-917/month**

---

## 🎯 WhatsApp Best Practices

### Response Time
- ✅ Respond within 5 minutes (ideal)
- ✅ Use auto-reply for after-hours
- ❌ Don't leave messages unanswered for hours

### Message Style
- ✅ Keep it conversational
- ✅ Use emojis sparingly (1-2 per message)
- ✅ Break long messages into chunks
- ✅ Include clear CTAs

### Example Good Responses:

```
👋 Hi John! Thanks for reaching out to Pixel Vault.

I'd love to help you automate your customer communication. 

Are you looking for:
1️⃣ Voice call automation
2️⃣ WhatsApp automation  
3️⃣ Both

Let me know and I can share more details! 😊
— Sarah
```

### Example Bad Response:

```
Thank you for your message. We will get back to you as soon as possible. Regards, Company.
```

---

## 🔧 Integration with Your Dashboard

### Update Stats to Include WhatsApp

```javascript
// Add to dashboard stats
const stats = [
  { label: 'Calls Handled', value: '128', change: '+23%', icon: Phone },
  { label: 'WhatsApp Messages', value: '342', change: '+31%', icon: MessageCircle },
  { label: 'Appointments Booked', value: '93', change: '+18%', icon: Calendar },
  { label: 'Conversion Rate', value: '73%', change: '+5%', icon: TrendingUp },
];
```

### Recent Activity Table

```javascript
const recentActivity = [
  { type: 'call', time: '2:34 PM', from: '+65 9123 4567', outcome: 'Appointment booked' },
  { type: 'whatsapp', time: '2:28 PM', from: '+65 8765 4321', outcome: 'Question answered' },
  { type: 'whatsapp', time: '2:15 PM', from: '+65 9876 5432', outcome: 'Appointment booked' },
  { type: 'call', time: '1:58 PM', from: '+65 9345 6789', outcome: 'Not qualified' },
];
```

---

## 🚀 Quick Start Checklist

### Week 1: Setup
- [ ] Sign up for 360dialog
- [ ] Complete Facebook Business verification
- [ ] Set up webhook server
- [ ] Test with your own number

### Week 2: Integration
- [ ] Connect to OpenAI
- [ ] Add calendar integration
- [ ] Create message templates
- [ ] Test booking flow

### Week 3: Client Onboarding
- [ ] Document the process
- [ ] Create client onboarding guide
- [ ] Set up monitoring
- [ ] Launch first client

---

## 📞 Support Resources

- **360dialog Docs:** https://docs.360dialog.com
- **Meta WhatsApp API:** https://business.whatsapp.com/products/business-platform
- **Community:** WhatsApp Business API Facebook Group

---

**Ready to add WhatsApp to your service?** This is a game-changer for Singapore businesses! 🚀
