# Moon Hands — Production Go-Live Status
# June 14, 2026 Update

---

## EXECUTIVE SUMMARY

All critical infrastructure is operational. The backend is stable on Render. Telegram bot commands are working. The `/clients` command issue is resolved. We're ready for the first clinic pending the Pixel Vault Support AI setup.

---

## 1. TIER 1 / TIER 2 ONBOARDING (Built)

### How It Works

When a clinic submits the onboarding form, Kimi automatically detects their tier:

**Tier 1 ("Yes" to ALL 360dialog questions):**
- Clinic gets self-service email with Embedded Signup link
- 3-minute setup, Kimi auto-configures everything
- Nudge sequence at 24h, 48h, 72h if no progress

**Tier 2 (any "Not Sure"):**
- Kimi INITIATES WhatsApp conversation with clinic (proactive, not reactive)
- Sends step-by-step guidance based on their specific gaps
- Follows up every 24h until complete
- Owner (you) gets Telegram alert with gap summary

### The 360dialog Questions (Added to Onboarding Form)

1. Do you have WhatsApp Business installed? (Yes / No / Not Sure)
2. Do you have a Meta Business Portfolio? (Yes / No / Not Sure)
3. Is your Meta Business Portfolio verified? (Yes / No / Not Sure)
4. Is your WhatsApp Business app online? (Yes / No / Not Sure)
5. Is your phone number ready for Business API? (Yes / No / Not Sure)

### What Happens for "Not Sure" Answers

Kimi identifies the gaps and initiates the FIRST step automatically within 1 hour. No waiting for clinic to contact us. Example:

Clinic selects "Not Sure" for Meta Business Portfolio → Kimi WhatsApps them:

> "Hi [Clinic Name]! I'm Alex from Moon Hands. Great news — your onboarding form is received! I noticed you selected 'Not Sure' for a few items, so I'm here to walk you through it.
>
> First, let's tackle: Do you have a Meta Business Portfolio?
>
> If not, here's how to create one:
> 1. Go to business.facebook.com
> 2. Click 'Create Account'
> 3. Enter your clinic name and your personal email
> 4. Add your business details (UEN, address)
>
> This takes about 5 minutes. Just reply 'Done' when you've completed this step, or ask me anything if you're stuck. I'm here 24/7."

---

## 2. FIVE ESSENTIAL MESSAGE TEMPLATES (Built)

All templates are stored in Supabase and customizable per clinic. Meta UTILITY category (not marketing — no additional approval needed).

| # | Template | When Sent | Key Content |
|---|----------|-----------|-------------|
| 1 | **Booking Confirmation** | Immediately after booking created | Date, time, treatment, clinic name. "Need to reschedule? Just reply 'reschedule'." |
| 2 | **Appointment Reminder** | 24 hours before appointment | "Reply CONFIRM to confirm, or CANCEL if you need to reschedule." |
| 3 | **Follow-Up After Treatment** | 48 hours after appointment | "How was your experience? Ready for your next session? Reply 'book'." |
| 4 | **Welcome New Patient** | First time patient messages | "I'm [AI Name], your virtual assistant. I can help you with booking, treatment info, and questions." |
| 5 | **Cancellation Confirmation** | After cancellation confirmed | "No worries — when you're ready to rebook, just send us a message anytime." |

### Delivery Status Tracking

Every template message is tracked:
- **Sent** → Message left our server
- **Delivered** → WhatsApp confirmed delivery to patient's device
- **Read** → Patient opened the message
- **Failed** → Invalid number, blocked, or other error

Failed deliveries trigger an instant Telegram alert to you with the patient's number and error reason.

---

## 3. PIXEL VAULT SUPPORT AI (Pending Your Setup)

### What This Is

You will sign up for a NEW WABA number specifically for clinic support. This becomes the "Moon Hands Support" WhatsApp line.

### What It Does

- Tier 2 clinics can WhatsApp this number 24/7 for onboarding help
- Kimi (our AI) responds instantly with guided instructions
- Answers questions like: "How do I create a Meta Business Portfolio?" "What documents do I need?" "I'm stuck on step 3."
- If Kimi can't resolve → escalates to you via Telegram with full context
- **You don't need to be available 24/7 for onboarding support**

### What You Need to Do

1. Sign up a new WABA number for Pixel Vault Support (separate from your personal +65 9125 2297)
2. Complete the 360dialog onboarding for this number
3. Share the API key + phone number ID with me
4. I configure Kimi as the support AI
5. Test: You message the support number, Kimi responds correctly

### Why a Separate Number

- Your personal number stays private
- Support line is clearly branded "Moon Hands"
- Can be handed off to a team member later
- Clean separation between personal and business

---

## 4. 360DIALOG ACCOUNT STRATEGY

### Final Decision: Hybrid Model

**Clinic owns their WABA, we manage via Embedded Signup.**

Why not one shared Pixel Vault account per clinic?
- If Pixel Vault account gets banned → ALL clinics go down (single point of failure)
- Meta requires business verification for each clinic anyway
- Clinic retains ownership if they leave (no lock-in complaints)
- Clean separation of concerns

What Pixel Vault DOES own:
- Our own WABA number for the Support AI
- Our 360dialog partner account (for Embedded Signup)
- All backend infrastructure (Render, Supabase, OpenAI)

---

## 5. WHAT'S PENDING BEFORE GO-LIVE

| # | Item | Who | ETA |
|---|------|-----|-----|
| 1 | **Pixel Vault Support AI WABA** | You | This week |
| 2 | **First friendly clinic** | You | Ongoing |
| 3 | **Privacy Policy (PDPA)** | Kimi | On request |
| 4 | **360dialog production account** | You | After 3+ clinics |
| 5 | **Self-pilot with own number** | You | After Support AI ready |

---

## 6. TELEGRAM BOT COMMANDS (All Working)

| Command | Status | Notes |
|---------|--------|-------|
| `/help` | ✅ Working | Plain text, no markdown crashes |
| `/clients` | ✅ Working | Lists all clinics |
| `/viewconfig` | ✅ Working | View clinic config |
| `/addservice` | ✅ Working | Add treatment |
| `/updateprice` | ✅ Working | Update price |
| `/updatehours` | ✅ Working | Update hours |
| `/addfaq` | ✅ Working | Add FAQ |
| `/pause` | ✅ Working | Pause clinic |
| `/resume` | ✅ Working | Resume clinic |
| `/health` | ✅ Working | System status |
| `/debug` | ✅ Working | Server diagnostics |
| `/security` | ✅ Working | Security dashboard |

---

*Moon Hands by Pixel Vault Pte Ltd*
*Last updated: June 14, 2026*
