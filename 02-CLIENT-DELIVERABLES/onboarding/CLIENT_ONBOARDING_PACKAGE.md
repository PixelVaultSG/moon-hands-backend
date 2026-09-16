# Moon Hands — Client Onboarding Package
## Everything a New Clinic Receives When They Sign Up

**Purpose:** Professional, warm, and legally complete welcome experience  
**Delivery method:** Email + Telegram welcome message  
**Tone:** Friendly expert, not corporate robot. Singapore context.

---

## PART 1: THE WELCOME EMAIL

**Subject:** Welcome to Moon Hands, [Clinic Name]! Your AI receptionist is almost ready 🌙

**From:** Mei Ling <pixelvaultsg@gmail.com>  
**Reply-to:** pixelvaultsg@gmail.com

---

Dear Dr. [Doctor Name] / [Owner Name],

Welcome to the Moon Hands family! We're thrilled that [Clinic Name] has chosen to let us handle your front desk — so you and your team can focus on what you do best: caring for your patients.

Over the next 48 hours, we'll have your AI receptionist trained on your clinic's treatments, brand voice, and booking preferences. Here's what happens next:

---

### 📋 Step 1: Review Your Onboarding Form (Attached)

I've attached a copy of the onboarding form you submitted. Please review it and let me know if anything needs updating — treatment prices, operating hours, staff names, or your FAQ.

**If anything looks off, just reply to this email or WhatsApp me.**

---

### 📄 Step 2: Legal Documents (Attached)

For your records, I've attached:

1. **Terms of Use** — Our service agreement covering billing, data handling, and what we promise
2. **Privacy Policy** — How we protect your patients' data under Singapore PDPA

Please keep these for your records. If you have questions about any section, I'm happy to walk through it with you.

---

### 📱 Step 3: Telegram Setup

Today, you'll receive a Telegram message from our admin bot. This is where you'll:
- Approve bookings (one tap ✅)
- Receive daily summaries of tomorrow's appointments
- Update your treatment menu or FAQ anytime
- Chat directly with our team

**Please save the bot's number and enable notifications.**

---

### 🧪 Step 4: Testing (Day 2-3)

Once your AI is configured, I'll send you a test WhatsApp message so you can see exactly how your patients will experience it. We'll do 2-3 test conversations together to fine-tune the responses.

**Nothing goes live to your patients until YOU say it's ready.**

---

### 💰 Your Subscription

| Detail | Value |
|--------|-------|
| Plan | [Starter / Professional] |
| Monthly fee | S$[347 / 547] |
| WhatsApp messages | [1,000 / 5,000] per month |
| Billing | Prepaid monthly, invoice sent on the 1st |
| Payment | Bank transfer to Pixel Vault Pte Ltd |
| First invoice | Due on [Date] |

**Your 14-day pilot starts now.** If Moon Hands isn't delivering value by [Date], let me know and we'll part as friends — no questions asked, no invoice issued.

(After the pilot, billing is monthly prepaid. No refunds for partial months. Cancellation requires 30 days' written notice.)

---

### 📞 How to Reach Me

| Channel | For |
|---------|-----|
| **Email** (pixelvaultsg@gmail.com) | Detailed requests, document sharing, billing queries |
| **Telegram** (admin bot) | Quick updates, booking approvals, urgent issues |
| **WhatsApp** (this number) | Informal check-ins, voice notes welcome |

I typically respond within a few hours during business hours, and always within 24 hours.

---

### 🌙 A Personal Note

I started Moon Hands because I watched too many Singapore clinics lose patients to missed WhatsApp messages and after-hours enquiries. Your patients are messaging you at 11pm, on Sundays, during lunch breaks — and every unanswered message is a potential booking walking to your competitor.

Moon Hands exists to make sure that never happens to [Clinic Name].

I'm personally involved in every clinic we onboard. You're not a ticket number — you're a partner. If something isn't working, I want to know. If you have a wild idea for a feature, I want to hear it.

Welcome aboard. Let's make your front desk unstoppable.

Warmly,

Mei Ling  
Founder, Moon Hands by Pixel Vault Pte Ltd  
pixelvaultsg@gmail.com  
moonhands.sg

---

**Attachments:**
- [Clinic Name] — Onboarding Form.pdf
- Moon Hands — Terms of Use.pdf
- Moon Hands — Privacy Policy.pdf

---

## PART 2: THE TELEGRAM WELCOME MESSAGE

Sent immediately after the email, via the admin bot:

```
🌙 Welcome to Moon Hands, [Clinic Name]!

I'm your admin assistant. From today, I'll send you:

📋 New booking requests → Tap [✅ Approve] or [❌ Decline]
📅 Daily closing summary → Tomorrow's appointments at 6pm
📊 Weekly roundups → Every Sunday

🔧 Quick commands:
/status — See your plan usage
/bookings — View upcoming appointments
/settings — Update treatment menu or FAQ
/help — See all commands

Need me? Just type your message. I'm here. 💚
```

---

## PART 3: DAY 2 FOLLOW-UP MESSAGE

Sent via Telegram 24 hours after signup:

```
Good morning! ☀️

Your AI receptionist is now trained on [Clinic Name]'s 
treatments and brand voice. 

Let's do a quick test! I'll send you a WhatsApp message 
from our test number in 5 minutes. Just reply naturally 
— ask about a treatment, try to book an appointment, 
ask about pricing. 

See how it feels from your patient's perspective. 
Then we can fine-tune anything together.

Ready? 🧪
```

---

## PART 4: ONBOARDING CHECKLIST (Internal)

Use this to track every new clinic:

```
□ Onboarding form received and reviewed
□ Email collected (primary + billing contact)
□ Terms of Use sent and acknowledged
□ Privacy Policy sent and acknowledged
□ Clinic added to Supabase (client_configs row)
□ Treatments configured in database
□ Operating hours set
│
□ Telegram bot configured for clinic
□ Staff Telegram IDs added
□ Clinic staff sent welcome message
│
□ Welcome email sent (with attachments)
□ Test WhatsApp conversation completed
□ AI responses fine-tuned based on clinic feedback
│
□ Clinic approves: "Ready to go live"
□ 360dialog WhatsApp number connected (or sandbox active)
□ First live patient conversation monitored
□ Day 7 check-in: "How's it going?"
□ Day 14 check-in: Pilot review + convert to paid
```

---

## PART 5: EMAIL COLLECTION POINTS

We collect clinic email addresses at multiple touchpoints:

| Stage | Where | Field Label |
|-------|-------|-------------|
| **Website onboarding form** | Required field | "Primary contact email" |
| **Website onboarding form** | Optional field | "Billing email (if different)" |
| **Welcome email** | Auto-filled | Sent TO the email they provided |
| **Telegram setup** | Optional | "Share your email for monthly invoices" |
| **Day 3 follow-up** | If missing | "I notice we don't have your email — may I have it for invoices?" |

**Why we need email:**
- Send invoices and payment reminders
- Deliver Terms of Use and Privacy Policy
- Notify of service updates or maintenance
- Monthly usage reports
- Enhancement request follow-ups

**Why we DON'T use email for:**
- Patient communications (WhatsApp only)
- Booking alerts (Telegram only)
- Marketing (we don't do this without explicit opt-in)

---

## PART 6: ATTACHMENTS BUNDLE

When you onboard a clinic, send these 3 documents:

### Document 1: Filled Onboarding Form
- Export their onboarding form submission as PDF
- Include all 34 fields they filled
- Highlight any fields that need verification

### Document 2: Terms of Use
- File: `TERMS_OF_USE_CLIENT.md` → convert to PDF
- Clinic should keep for their records
- Key sections to highlight: billing (prepaid), cancellation (30-day notice), no refunds

### Document 3: Privacy Policy
- File: `PRIVACY_POLICY.md` → convert to PDF
- Clinic should display in their premises
- Key for their own PDPA compliance — they must reference Moon Hands as data intermediary

---

*Package version: 1.0*  
*Last updated: 2026-05-18*  
*Next review: After first 3 clinic onboardings*
