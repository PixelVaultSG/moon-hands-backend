# 🏢 Pixel Vault Client Management Guide

## Overview

As your AI agency grows, you'll have multiple clients with different needs. This guide explains how to manage them efficiently using the **Admin Dashboard** and **Client Configuration System**.

---

## 🎯 The Problem You're Solving

| Challenge | Solution |
|-----------|----------|
| Client A is a beauty salon | Different services, friendly voice |
| Client B is a medical clinic | Professional tone, strict compliance |
| Client C is a fitness studio | Enthusiastic, early morning hours |
| **How to manage all at once?** | **Admin Dashboard + Per-Client Configs** |

---

## 📊 Admin Dashboard Features

**Live Demo:** https://xrdv3s64x4fyq.ok.kimi.link → Click "Admin" tab

### 1. **Client Overview**
- See all clients in one table
- Filter by status: Active, Setup, Paused
- Search by business name or contact
- Quick stats: Total clients, MRR, bookings

### 2. **Usage Monitoring**
- Voice minutes used vs. limit
- WhatsApp messages used vs. limit
- Monthly booking counts
- Last activity timestamp

### 3. **Quick Actions**
- Edit client details
- Configure AI settings
- Pause/resume agents
- View recent activity

---

## ⚙️ Client Configuration System

Each client has a unique configuration that customizes their AI agent.

### Configuration Categories

```typescript
interface ClientConfig {
  // 1. Business Identity
  businessName: string;
  industry: string;
  address: string;
  
  // 2. Services (DIFFERENT FOR EACH CLIENT)
  services: Array<{
    name: string;        // e.g., "Hair Coloring"
    price: string;       // e.g., "From $150"
    duration: string;    // e.g., "120" minutes
    description: string; // What's included
  }>;
  
  // 3. Operating Hours (DIFFERENT FOR EACH CLIENT)
  operatingHours: Array<{
    day: string;      // "Monday"
    isOpen: boolean;  // true/false
    openTime: string; // "09:00"
    closeTime: string;// "18:00"
  }>;
  
  // 4. AI Personality (DIFFERENT FOR EACH CLIENT)
  agentName: string;           // "Emma", "Alex", "Sophie"
  brandVoice: string;          // "friendly", "professional"
  enthusiasmLevel: string;     // "high", "medium", "low"
  customGreeting: string;      // Unique welcome message
  
  // 5. FAQ (DIFFERENT FOR EACH CLIENT)
  faqs: Array<{
    question: string; // "Do you have parking?"
    answer: string;   // "Yes, free parking at the back"
  }>;
  
  // 6. Booking Rules (DIFFERENT FOR EACH CLIENT)
  appointmentDuration: string; // Default: "60" minutes
  bufferTime: string;          // Between appointments: "15"
  maxPerDay: string;           // Max bookings: "12"
  cancellationPolicy: string;  // Their specific policy
  specialNotes: string;        // "Always mention free drinks"
  
  // 7. Languages (DIFFERENT FOR EACH CLIENT)
  languages: string[]; // ["en", "zh"] or ["en", "ms"]
  
  // 8. Automations (DIFFERENT FOR EACH CLIENT)
  automations: {
    bookingConfirmation: boolean;
    reminder24h: boolean;
    reminder1h: boolean;
    // etc.
  };
}
```

---

## 🔄 How to Configure a New Client

### Step 1: Client Submits Onboarding Form
- They fill out the 8-step form
- Data comes to you (via Telegram bot - to be built)

### Step 2: You Review in Admin Dashboard
1. Open Admin Dashboard
2. Click on client row → "View Details"
3. Review all information
4. Click "AI Config" to customize

### Step 3: Customize Their AI Agent

**Example: Beauty Salon vs. Medical Clinic**

#### Client 1: Glow Beauty Studio
```javascript
{
  agentName: 'Emma',
  brandVoice: 'friendly',
  enthusiasmLevel: 'high',
  customGreeting: 'Hey gorgeous! Welcome to Glow Beauty!',
  services: [
    { name: 'Hair Coloring', price: 'From $150', duration: '120' },
    { name: 'Facial Treatment', price: '$120', duration: '90' }
  ],
  faqs: [
    { q: 'Do you have parking?', a: 'Yes, complimentary parking!' }
  ],
  specialNotes: 'Always mention complimentary drinks and magazines'
}
```

#### Client 2: Wellness Clinic
```javascript
{
  agentName: 'Sophie',
  brandVoice: 'professional',
  enthusiasmLevel: 'medium',
  customGreeting: 'Good day, thank you for calling Wellness Clinic.',
  services: [
    { name: 'General Consultation', price: '$120', duration: '30' },
    { name: 'Health Screening', price: 'From $350', duration: '120' }
  ],
  faqs: [
    { q: 'Do you accept insurance?', a: 'Yes, most major plans accepted' }
  ],
  specialNotes: 'MUST be professional. Never give medical advice. Always refer to doctors.'
}
```

### Step 4: Save & Deploy
- Click "Save Configuration"
- System updates the AI agent
- Client's AI is now live with their custom settings

---

## 📝 How I Help You Manage Configurations

### Option 1: You Edit in Admin Dashboard (Self-Service)
- Log into admin panel
- Click on client's "AI Config"
- Edit fields directly
- Save changes

### Option 2: You Tell Me, I Code the Changes

**Example Workflow:**

**You:** "My 2nd client Elite Fitness wants to add a new service 'Group HIIT Class' for $35, 45 minutes"

**Me:** I'll update their config:
```javascript
// Add to clientConfigs['2'].services
{
  name: 'Group HIIT Class',
  price: '$35',
  duration: '45',
  description: 'High-intensity interval training in a group setting'
}
```

**You:** "Also change their agent name from 'Alex' to 'Jordan'"

**Me:** Done:
```javascript
clientConfigs['2'].agentName = 'Jordan';
```

### Option 3: Build a Config Management API

For scale, we can build:

```javascript
// API endpoint to update client config
POST /api/clients/:clientId/config
{
  "services": [...],
  "agentName": "Jordan"
}

// You can update via:
// - Admin dashboard UI
// - Direct API calls
// - Telegram bot commands
```

---

## 🗂️ Recommended File Structure

```
/mnt/okcomputer/output/
├── app/                          # Frontend React app
│   ├── src/
│   │   ├── App.tsx              # Main app with tabs
│   │   ├── OnboardingForm.tsx   # Client onboarding
│   │   ├── AdminDashboard.tsx   # Your admin panel
│   │   └── ...
│   └── dist/                    # Built files
│
├── backend/                     # To be built
│   ├── src/
│   │   ├── clients/             # Client management
│   │   │   ├── client1.json     # Glow Beauty config
│   │   │   ├── client2.json     # Elite Fitness config
│   │   │   └── client3.json     # Wellness Clinic config
│   │   ├── vapi/                # Voice AI integration
│   │   ├── whatsapp/            # WhatsApp integration
│   │   └── telegram/            # Your alert bot
│   └── server.js
│
├── docs/
│   ├── BUSINESS_GUIDE.md
│   ├── TECHNICAL_GUIDE.md
│   ├── WHATSAPP_GUIDE.md
│   └── CLIENT_MANAGEMENT_GUIDE.md  # This file
│
└── scripts/
    └── deploy-client.sh         # Deploy new client
```

---

## 💡 Best Practices for Managing Multiple Clients

### 1. **Create Industry Templates**

Instead of starting from scratch:

```javascript
// templates/salon.json
{
  "industry": "Beauty & Wellness",
  "brandVoice": "friendly",
  "enthusiasmLevel": "high",
  "commonFAQs": [
    { "q": "Do you have parking?", "a": "..." },
    { "q": "What products do you use?", "a": "..." }
  ]
}

// templates/medical.json
{
  "industry": "Medical",
  "brandVoice": "professional",
  "enthusiasmLevel": "medium",
  "specialNotes": "Never give medical advice. Always refer to doctors."
}
```

### 2. **Version Control Configs**

Track changes to client configs:
```
client1-config-v1.json  # Initial setup
client1-config-v2.json  # Added new service
client1-config-v3.json  # Changed operating hours
```

### 3. **Client Communication Log**

Keep notes on each client:
```javascript
{
  clientId: '1',
  notes: [
    { date: '2024-01-15', note: 'Initial setup complete' },
    { date: '2024-02-01', note: 'Added 2 new services' },
    { date: '2024-03-10', note: 'Client requested more enthusiastic tone' }
  ]
}
```

### 4. **Monitoring & Alerts**

Set up alerts for:
- Client approaching usage limits
- Unusual activity (spike in calls)
- Failed bookings
- Customer complaints

---

## 🚀 Scaling Your Operations

### Phase 1: 1-5 Clients (Now)
- Manual config updates via Admin Dashboard
- You handle all changes
- I help with complex modifications

### Phase 2: 5-20 Clients
- Build config management API
- Clients can request changes via form
- You approve and deploy

### Phase 3: 20+ Clients
- Self-service portal for minor changes
- Automated deployment pipeline
- Hire VA for first-level support

---

## 📞 Example Client Request Workflow

### Scenario: Client Wants to Add a Service

**Day 1 - Client Request:**
> "Hi, we want to add 'Bridal Package' for $500, 3 hours. Can you update our AI?"

**Your Options:**

**Option A - Do It Yourself (2 minutes):**
1. Open Admin Dashboard
2. Find client
3. Click "AI Config"
4. Add service to list
5. Save

**Option B - Ask Me (I do it in 1 minute):**
> "Add Bridal Package $500, 180 mins to client 1"

I update the config file, you deploy.

**Option C - Build Self-Service (Future):**
Client logs into their portal, adds service themselves.

---

## ✅ Quick Reference: Common Changes

| Change | Where to Edit | Time |
|--------|---------------|------|
| Add/remove service | Admin → AI Config → Services | 1 min |
| Change prices | Admin → AI Config → Services | 30 sec |
| Update operating hours | Admin → AI Config → Hours | 1 min |
| Change agent name | Admin → AI Config → Voice | 30 sec |
| Add FAQ | Admin → AI Config → FAQ | 1 min |
| Modify greeting | Admin → AI Config → Voice | 30 sec |
| Enable/disable automations | Admin → AI Config → Advanced | 30 sec |
| Change languages | Admin → AI Config → Advanced | 30 sec |

---

## 🎯 Next Steps

1. **Review the Admin Dashboard** - https://xrdv3s64x4fyq.ok.kimi.link → Admin tab
2. **Practice with mock clients** - Click around, edit configs
3. **Decide on your workflow** - Self-service vs. asking me
4. **Build the backend** - Store configs, deploy to VAPI/WhatsApp

---

## 🤔 Questions to Consider

1. **How do you want to receive client change requests?**
   - Email? WhatsApp? Form submission?

2. **How quickly do you want to deploy changes?**
   - Immediately? Within 24 hours?

3. **Do you want clients to see a preview before going live?**
   - Test environment?

4. **Should we build a client portal?**
   - Where they can see their own stats?

---

**Ready to add your first real client?** 🚀
