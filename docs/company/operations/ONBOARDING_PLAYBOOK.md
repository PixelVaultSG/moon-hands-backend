# Moon Hands — Clinic Onboarding Playbook

## Overview

This is your step-by-step guide for bringing a new clinic onto Moon Hands. Read this before your first client signs up.

**Time per clinic:** 30-45 minutes (manual setup)  
**Your role:** Admin — you receive the submission, configure everything, and activate the clinic.

---

## The Full Process (Clinic Sign-Up → Go Live)

```
Step 1: Clinic fills onboarding form (on your website)
    ↓
Step 2: You get Telegram alert with their details
    ↓
Step 3: You create their clinic in Supabase (SQL insert)
    ↓
Step 4: You create their 360dialog account
    ↓
Step 5: You connect their WhatsApp Business number
    ↓
Step 6: You configure the webhook URL
    ↓
Step 7: You test — send a message, confirm reply works
    ↓
Step 8: You mark clinic as active in Supabase
    ↓
Step 9: Clinic receives WhatsApp confirmation from you
```

---

## Step 1: Clinic Fills the Form

**Where:** Your website → Onboarding tab  
**What clinic does:** Fills in 4 pages:
- Clinic info (name, address, WhatsApp number, MRT, parking)
- Treatments they offer (select from 8 options with pricing)
- Operating hours (toggle each day, set open/close times)
- Their contact details (name, email)
- Selected plan (Basic S$347/mo or Premium S$547/mo)

**What happens automatically:**
- ✅ Form data saved to Supabase `onboarding_submissions` table
- ✅ You get Telegram alert (see Step 2)
- ✅ Submission ID generated (shown to clinic on success screen)

---

## Step 2: You Receive Telegram Alert

You'll get a message like this in your admin Telegram bot:

```
🆕 NEW CLINIC ONBOARDING

Glow Aesthetic Clinic
📧 glow@example.com
📱 +65 9123 4567
👤 Dr. Sarah Chen

Plan: Basic (S$347/mo)
Treatments: 5 selected
Submitted: 2026-05-14 10:30 AM

View in Supabase →
```

**Action:** Open Supabase Dashboard and find their submission in the Table Editor → `onboarding_submissions`

---

## Step 3: Create Clinic in Supabase

Go to Supabase Dashboard → SQL Editor. Run this SQL (replace values with clinic's actual info):

```sql
-- Step 3a: Create the clinic
INSERT INTO clients (
  id,          -- e.g., 'glow-aesthetic'
  name,        -- e.g., 'Glow Aesthetic Clinic'
  slug,        -- e.g., 'glow-aesthetic'
  email,       -- e.g., 'sarah@glowclinic.sg'
  phone,       -- e.g., '+65 6123 4567'
  status,      -- 'pending' (change to 'active' after testing)
  plan,        -- 'basic' or 'premium'
  google_calendar_id,  -- NULL for now (configured later if needed)
  created_at,
  updated_at
) VALUES (
  'glow-aesthetic',
  'Glow Aesthetic Clinic',
  'glow-aesthetic',
  'sarah@glowclinic.sg',
  '+65 6123 4567',
  'pending',
  'basic',
  NULL,
  NOW(),
  NOW()
);

-- Step 3b: Create their config (treatments, hours, etc.)
INSERT INTO client_configs (
  client_id,
  config
) VALUES (
  'glow-aesthetic',
  '{
    "agent_name": "Sophia",
    "tone": "warm and professional",
    "greeting": "Hello! Welcome to Glow Aesthetic Clinic.",
    "phone": "+65 6123 4567",
    "whatsapp_number": "+65 6123 4567",
    "address": "123 Orchard Road, #05-01, Singapore 238863",
    "nearest_mrt": "Orchard MRT (NS22) — 3 min walk",
    "landmarks": "ION Orchard, Wisma Atria",
    "parking_info": "Complimentary parking at ION Orchard",
    "services": [
      {"name": "Botox", "price": "$380", "duration": "30min", "description": "Reduces fine lines and wrinkles", "category": "Injectables"},
      {"name": "HydraFacial", "price": "$280", "duration": "60min", "description": "Deep cleansing and hydration", "category": "Facials"}
    ],
    "operating_hours": [
      {"day": "Monday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Tuesday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Wednesday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Thursday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Friday", "open_time": "10:00", "close_time": "20:00", "isOpen": true},
      {"day": "Saturday", "open_time": "10:00", "close_time": "18:00", "isOpen": true},
      {"day": "Sunday", "open_time": null, "close_time": null, "isOpen": false}
    ]
  }'::jsonb
);
```

**Note:** The `config` JSON field contains everything the AI needs to answer patient questions. Make sure the treatments, pricing, and hours match what the clinic submitted in the form.

---

## Step 4: Create 360dialog Account for the Clinic

**Current limitation:** Moon Hands uses YOUR 360dialog account. Each clinic shares your API key.

**For production (future):** Each clinic should have their own 360dialog account for proper WhatsApp Business API separation.

**For now (MVP):**
1. Use your existing 360dialog sandbox/production account
2. The clinic's WhatsApp number is the one patients message
3. Your backend handles all clinics through your single 360dialog API key

**No action needed in this step for MVP.** Skip to Step 5.

---

## Step 5: Connect Clinic's WhatsApp Number

**Important:** The clinic needs a **WhatsApp Business Account**, not a personal WhatsApp.

**Process:**
1. Ask the clinic to install WhatsApp Business app (free)
2. Ask them to register their business number on it
3. Get their WhatsApp Business number from the onboarding form
4. This number is what patients will message

**For 360dialog integration:**
- In production with individual 360dialog accounts: Each clinic registers their number with 360dialog
- In MVP (shared account): You handle all numbers through your single 360dialog setup

**No technical action needed for MVP.** The clinic just needs to have WhatsApp Business installed.

---

## Step 6: Configure Webhook URL

**What the webhook does:** Tells 360dialog where to send incoming WhatsApp messages.

**Your webhook URL:** `https://moon-hands-backend.onrender.com/webhook/whatsapp`

**For MVP (sandbox):**
```bash
curl --request POST \
  --url https://waba-sandbox.360dialog.io/v1/configs/webhook \
  --header 'Content-Type: application/json' \
  --header 'D360-API-KEY: YOUR_SANDBOX_KEY' \
  --data '{"url": "https://moon-hands-backend.onrender.com/webhook/whatsapp"}'
```

**For production:**
```bash
curl --request POST \
  --url https://waba.360dialog.io/v1/configs/webhook \
  --header 'Content-Type: application/json' \
  --header 'D360-API-KEY: YOUR_PRODUCTION_KEY' \
  --data '{"url": "https://moon-hands-backend.onrender.com/webhook/whatsapp"}'
```

**Action:** I can do this for you — just share the clinic's details and I'll configure it.

---

## Step 7: Test the Bot

**Before going live, you MUST test:**

1. Message the clinic's WhatsApp number with: "Hello"
2. You should get a reply within 2 seconds
3. Try: "What treatments do you offer?"
4. Try: "How much is Botox?"
5. Try: "What are your opening hours?"
6. Check Render logs for `[360DIALOG] Reply sent`

**If no reply:**
- Check Render logs for errors
- Verify webhook URL is correct in 360dialog
- Verify clinic exists in Supabase `clients` table
- Verify `client_configs` has correct JSON

---

## Step 8: Mark Clinic as Active

Once testing passes, activate the clinic:

```sql
UPDATE clients
SET status = 'active', updated_at = NOW()
WHERE id = 'glow-aesthetic';
```

**This enables:**
- ✅ AI receptionist handles their WhatsApp messages
- ✅ Usage tracking starts for this clinic
- ✅ They appear in your daily business report

---

## Step 9: Notify the Clinic

Send them a WhatsApp message from your personal number:

```
Hi [Name]! Your Moon Hands AI receptionist is now live on your WhatsApp Business number.

Patients can now message you and get instant replies about:
✓ Treatment information and pricing
✓ Operating hours and location
✓ Booking inquiries

Your 14-day free trial starts today. I'll send you the dashboard login details shortly.

Questions? Just reply here.
```

---

## After Onboarding: Ongoing

| Task | Frequency | How |
|------|-----------|-----|
| Check daily reports | Daily | Telegram message at midnight SGT |
| Monitor 90% usage alerts | As needed | Telegram alert when clinic nears limit |
| Add new treatments | As requested | Update `client_configs` JSON in Supabase |
| Handle rate limit issues | Rare | Check Telegram alerts, contact clinic if abuse |
| Monthly billing | Monthly | Check Payments tab in admin dashboard |

---

## What the Clinic Can Do (Self-Service)

| Feature | How |
|---------|-----|
| View their dashboard | You give them the Dashboard tab URL |
| See message stats | Dashboard shows daily/weekly stats |
| Update treatments | They contact you, you update Supabase |
| Change hours | They contact you, you update Supabase |
| Upgrade plan | Payments tab → Change Plan |

**Note:** There is no true self-service yet. Clinic changes require you to update Supabase manually. This is acceptable for the first 10 clients.

---

## What Happens When a Clinic Cancels

```sql
-- Soft delete: mark as inactive
UPDATE clients SET status = 'inactive' WHERE id = 'glow-aesthetic';

-- Their WhatsApp messages will get the "not configured" response
-- They stop appearing in daily reports
-- Their data is preserved for record-keeping
```

---

## Current Limitations (Acceptable for MVP)

| Limitation | Impact | Workaround |
|------------|--------|------------|
| No true self-service portal | You manually update clinic configs | Clinic emails/WhatsApps you changes |
| Shared 360dialog account | All clinics use your API key | Fine for first 10-20 clients |
| No Google Calendar booking | Bot can't actually book appointments | Bot collects intent, clinic follows up manually |
| No payment collection | You invoice manually | Send invoice via email/WhatsApp |
| No multi-location per clinic | Each location = separate client entry | Create separate `clients` rows |

---

## Checklist Template (Print This)

When a new clinic signs up, copy this into your notes:

```
Clinic: _______________________
Submitted: ____________________
Submission ID: ________________

[ ] Step 3: Created in Supabase (clients + client_configs)
[ ] Step 4: 360dialog account ready
[ ] Step 5: WhatsApp Business confirmed
[ ] Step 6: Webhook configured
[ ] Step 7: Tested — bot replies correctly
[ ] Step 8: Marked as active
[ ] Step 9: Notified clinic
[ ] Trial end date: ____________ (14 days from today)
```

---

## Questions?

Ask me anything about this process. I can:
- Run the SQL for you (just paste clinic details)
- Configure 360dialog webhooks
- Test the bot after setup
- Generate custom reports
