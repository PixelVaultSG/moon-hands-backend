# Moon Hands — End-to-End Onboarding Workflow

**From: Clinic clicks "Get Started" → To: Clinic is LIVE with AI receptionist**

**Duration:** 5-10 minutes of clinic effort, 0-24 hours of automated processing

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  CLINIC PERSPECTIVE                                                  │
│                                                                      │
│  1. Visit moonhands.io → Click "Get Started"                         │
│  2. Fill 7-step onboarding form (~5 min)                             │
│  3. Click "Connect Google Calendar" (optional, 1 click)              │
│  4. Pay subscription via Stripe (1 min)                              │
│  5. Receive welcome email with WhatsApp number + iCal link           │
│  6. Test by sending "Hi" to the WhatsApp number                      │
│  7. DONE — AI receptionist is LIVE                                   │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│  SYSTEM / PIXEL VAULT PERSPECTIVE                                    │
│                                                                      │
│  A. Form submitted → Auto-saved to Supabase                          │
│  B. Stripe processes payment                                         │
│  C. System auto-creates clinic record (client + config)              │
│  D. System provisions WhatsApp number (360dialog)                    │
│  E. System generates iCal token                                      │
│  F. System sends welcome email to clinic                             │
│  G. System sends Telegram alert to Pixel Vault                       │
│  H. Clinic tests → Bot responds with configured greeting             │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Detail

---

### STEP 1: Clinic Visits Website

**What clinic sees:**
- Website at `moonhands.io` (or your domain)
- Clear "Get Started" or "Start Free Trial" CTA
- Trust signals: testimonials, pricing, demo simulator

**System actions:**
- None (static website)

---

### STEP 2: Clinic Fills Onboarding Form (7 Steps)

**URL:** `moonhands.io/onboarding`

**Step 2.1: Clinic Info**
- Clinic name
- Clinic address
- Clinic email
- Clinic phone

**Step 2.2: Contact Person**
- Your name
- Your role (owner, manager, receptionist)
- Your email (for notifications)
- Your mobile (for Telegram alerts)

**Step 2.3: WhatsApp Number**
- The phone number patients will message
- Must be a WhatsApp Business number
- Verification: we send a test message to confirm

**Step 2.4: Services & Treatments**
- Checkbox list of common treatments:
  - [ ] Hydrating Facial
  - [ ] Anti-Aging Treatment
  - [ ] Acne Clear Facial
  - [ ] Laser Skin Rejuvenation
  - [ ] Botox Consultation
  - [ ] Dermal Filler
  - [ ] HIFU
  - [ ] Thread Lift
  - [ ] Chemical Peel
- Custom treatment input field
- For each selected: duration + price

**Step 2.5: Operating Hours**
- Day-by-day:
  - Monday: Open ___ Close ___
  - Tuesday: Open ___ Close ___
  - ...
  - Sunday: Closed (default)

**Step 2.6: AI Personality**
- Tone: [Friendly | Professional | Casual | Luxury]
- Greeting message (with default): "Hey there! Welcome to {clinicName}"
- Special notes / instructions

**Step 2.7: Plan Selection + Google Calendar**
- Plan: [Basic S$347/mo | Premium S$547/mo]
- Calendar: [Connect Google Calendar] button (optional)
  - Click → Google OAuth consent screen
  - Authorize → Redirect back with success message
- [ ] I agree to Terms of Service
- [ ] I agree to Privacy Policy
- **Submit button**

---

### STEP 3: Form Submission → Auto-Processing

**On submit, system executes automatically:**

```javascript
// 1. Validate all fields
// 2. Sanitize inputs
// 3. Save to onboarding_submissions table
// 4. Trigger auto-provision workflow
```

**Auto-Provision Workflow:**

```sql
-- 5. Create client record
INSERT INTO clients (id, name, slug, whatsapp_number, status, email, phone)
VALUES (
  gen_random_uuid(),
  '${clinic_name}',
  '${slugified_name}',
  '${whatsapp_number}',
  'active',
  '${clinic_email}',
  '${clinic_phone}'
);

-- 6. Create client config
INSERT INTO client_configs (
  client_id, operating_hours, services, faqs,
  booking_auto_confirm, booking_after_hours_action,
  booking_waitlist_enabled, booking_max_advance_days,
  booking_min_notice_hours, booking_allow_same_day,
  booking_require_phone, buffer_time
)
VALUES (...);

-- 7. Generate iCal token
UPDATE clients SET ical_token = gen_random_uuid() WHERE id = '${client_id}';

-- 8. Store Google Calendar credentials (if connected)
UPDATE clients SET 
  google_refresh_token = '${token}',
  google_calendar_id = '${calendar_id}',
  calendar_provider = 'google'
WHERE id = '${client_id}';
```

---

### STEP 4: Payment Processing (Stripe)

**What clinic sees:**
- Stripe checkout page embedded or redirect
- Plan: Basic S$347/mo or Premium S$547/mo
- Card input + billing details
- Pay button

**System actions:**
```javascript
// 9. Create Stripe customer
const customer = await stripe.customers.create({
  email: clinic_email,
  name: clinic_name,
  phone: clinic_phone,
});

// 10. Create subscription
const subscription = await stripe.subscriptions.create({
  customer: customer.id,
  items: [{ price: plan_price_id }], // Basic or Premium
  billing_cycle_anchor: now,
});

// 11. Store subscription info
UPDATE clients SET 
  stripe_customer_id = '${customer.id}',
  stripe_subscription_id = '${subscription.id}',
  plan = '${selected_plan}',
  status = 'active'
WHERE id = '${client_id}';
```

---

### STEP 5: Welcome Email

**Sent to:** Clinic email address
**From:** hello@moonhands.io (or pixelvault.sg)
**Subject:** "🎉 Your AI Receptionist is Ready — Let's Get Started!"

**Email body:**
```
Subject: 🎉 Your AI Receptionist is Ready — Let's Get Started!

Hi [Contact Name],

Welcome to Moon Hands! Your AI receptionist for [Clinic Name] is now live and ready to handle patient bookings.

Here's everything you need:

📱 YOUR WHATSAPP NUMBER
Patients can now message: +65 XXXX XXXX
Try it now — send "Hi" and see your AI respond!

📅 CALENDAR SYNC
Your AI receptionist pushes all bookings to your calendar automatically.
• iCal Feed (works with Apple Calendar, Outlook, Google Calendar):
  https://moon-hands-backend.onrender.com/ical/[YOUR_TOKEN].ics
• Google Calendar: Connected ✅

📊 TELEGRAM ALERTS
Get instant notifications for every booking.
• Download Telegram
• Search for @MoonHandsBot
• Send /start to activate alerts

📋 WHAT YOUR AI CAN DO
• Answer treatment questions
• Book, reschedule, cancel appointments
• Send instant confirmations to patients
• Handle after-hours enquiries 24/7

💬 QUICK START
1. Share your WhatsApp number with patients
2. Add it to your website, Instagram, Google Business
3. Watch bookings come in automatically

📞 SUPPORT
Need help? Reply to this email or WhatsApp us at +65 XXXX XXXX.

Welcome aboard!

Pixel Vault Pte Ltd
Moon Hands by Pixel Vault
```

---

### STEP 6: Pixel Vault Alert

**Sent to:** Your Telegram admin chat

```
✅ NEW CLINIC ONBOARDED

Clinic: [Clinic Name]
Contact: [Name] ([Email])
Phone: +65 XXXX XXXX
Plan: Premium (S$547/mo)
Calendar: Google Calendar ✅
Status: ACTIVE

Stripe: [subscription_id]
iCal: https://moon-hands-backend.onrender.com/ical/[token].ics

Action: Monitor first 48h for any issues.
```

---

### STEP 7: Clinic Tests

**What clinic does:**
1. Opens WhatsApp
2. Messages their clinic number: "Hi"
3. Bot responds with configured greeting + services list

**What you verify:**
- [ ] Bot responds within 5 seconds
- [ ] Greeting uses clinic name
- [ ] Services list is accurate
- [ ] Booking flow works (date → time → treatment)
- [ ] Telegram alert received for test booking
- [ ] Booking appears in Google Calendar (if connected)

---

### STEP 8: Clinic Goes LIVE

**Clinic actions:**
- [ ] Add WhatsApp number to website
- [ ] Add to Instagram bio
- [ ] Add to Google Business Profile
- [ ] Update business cards (optional)
- [ ] Tell front desk: "AI handles after-hours, you handle approvals"

**System state:**
- Clinic status: `active`
- Subscription: `active`
- Bot: Ready 24/7
- Alerts: Flowing to clinic Telegram
- Calendar: Syncing all bookings

---

## The 48-Hour Monitoring Window

After each clinic goes live, Pixel Vault monitors:

| Hour | Action |
|------|--------|
| 0-1 | Verify first message exchange works |
| 1-4 | Check Telegram alerts are received |
| 4-12 | Monitor for any error spikes |
| 12-24 | Check first real patient interaction (if any) |
| 24-48 | Review conversation quality, refine if needed |

**If issues detected:**
- Check `/debug` endpoint
- Review `/trace` logs
- Adjust AI responses via system prompt
- Contact clinic if needed

---

## Files to Build for This Workflow

| # | File | Purpose |
|---|------|---------|
| 1 | `server/onboarding.js` | Handle form submission + auto-provision |
| 2 | `server/stripe.js` | Stripe subscription creation |
| 3 | `utils/welcome-email.js` | Welcome email template + sending |
| 4 | `server/google-oauth.js` | Google Calendar self-serve OAuth |
| 5 | `supabase/auto_provision.sql` | Trigger: form → client creation |
| 6 | `jobs/daily-monitor.js` | 48h monitoring for new clinics |

---

*Last updated: 2026-05-24*
*Next step: Build the auto-provision + welcome email code*
