# 🌱 Clinic Onboarding Guide (Client-Facing)

> **Last synced:** 2026-09-09 · moonhands.space

> **Welcome to Moon Hands.** This guide takes your clinic from sign-up to a live AI receptionist on WhatsApp — typically within 1–2 working days. You need **no technical skills**; we do the setup with you.

---

## 1. What You're Getting

| Channel | What happens |
|---|---|
| 💬 **WhatsApp AI** | Replies instantly, 24/7. Answers FAQs, shows your treatment menu with prices, books appointments with guided buttons, collects the customer's **name & phone**, and confirms with a total cost (ranges like `$50–$100` shown as-is). |
| 📅 **Smart booking** | Respects your hours, buffers, and daily cap. Every booking lands in your Telegram staff group instantly; optional Google Calendar sync. |
| 📱 **Telegram staff bot** | Booking alerts, daily summary, one-tap AI pause/resume per customer, human takeover. |
| 🛡️ **Managed service** | We host, monitor, and update everything. You just message us (or use `/req_*` commands) to change anything. |

---

## 1a. Plans & Pricing

| Plan | WhatsApp messages / month | Locations | Monthly price (SGD) | Best for |
|---|---|---|---|---|
| **Basic** | 500 | 1 | S$347/mo | Solo clinics, starting out |
| **Premium** | Unlimited | Unlimited | S$547/mo | Multi-location, high-volume clinics |

**What's included in both plans:**
- 24/7 AI receptionist on WhatsApp
- Smart booking with Telegram alerts
- Staff Telegram bot with pause / resume / takeover
- Change requests (menu, prices, hours, FAQs) — same-day turnaround
- Monthly usage summary

**Premium adds:**
- Unlimited WhatsApp conversations (no usage anxiety)
- Multiple clinic locations under one account
- Priority support & custom voice / personality tuning

---

## 1b. How Billing Works

We keep this simple — no credit card forms, no auto-deductions.

1. **Invoice:** We send you a monthly invoice (WhatsApp or email — your choice).
2. **Pay:** Bank transfer or PayNow to Pixel Vault Pte Ltd. Due date is the same day each month (e.g., 1st of the month).
3. **Confirm:** Reply with a screenshot or reference number; we mark it paid within the hour.

**Payment is due on your billing day each month.** If you're a few days late, no drama — your bot keeps running. We'll remind you politely. If it stretches past a week, we may pause auto-replies and your patients will see a "Please contact the clinic directly" message until payment is sorted. We hate doing this, so we'll nudge you plenty of times before it gets there.

---

## 1c. Usage Alerts (Basic plan only)

If you're on Basic, you'll get a friendly heads-up as you approach your 500-message monthly limit:

| When | What you see |
|---|---|
| **80% used** (400 msgs) | *"You've used 400 out of 500 messages this month. Consider upgrading to Premium for unlimited messages."* |
| **95% used** (475 msgs) | *"You're at 95% of your monthly limit. Upgrade to Premium to keep chatting without worry."* |
| **100% used** (500 msgs) | *"You've reached your 500 message limit. Service continues — but consider Premium for unlimited volume."* |

**Important:** Your AI never stops replying. These are friendly nudges, not hard cuts. If a busy month pushes you past 500, your patients still get answers. We just want you to know where you stand.

Premium clinics never see these alerts — unlimited means unlimited.

---

## 2. What We Need From You (Day 1, ~15 minutes)

1. **Treatment menu** — name, price (fixed `$380` or range `$50–$100`), duration in minutes. A photo of your menu is fine.
2. **Operating hours** — per day, including breaks.
3. **FAQs** — the 5–10 questions customers always ask (parking, first-timer tips, downtime, payment modes…).
4. **Booking rules** — default slot length, buffer between appointments, max bookings per day, cancellation policy.
5. **WhatsApp Business number** — the number customers will message (we connect it via 360dialog; we guide you through the Meta/360dialog verification).
6. **Telegram staff group** — create a group, add our bot; that's your mission control.
7. *(Optional)* **Google Calendar** — owner clicks one consent link; bookings then appear in your calendar.

---

## 3. The Journey

```
Day 1   Kickoff call → we collect the above → your clinic is provisioned from our template
Day 1–2 We load your menu, hours, FAQs; you review a test chat together with us
Day 2   Go-live checks (below) → your WhatsApp AI receptionist is LIVE
Ongoing Request changes anytime; approve them in Telegram; weekly summary reports
```

---

## 4. Your First Test Drive (go-live checklist — we do this together)

- [ ] WhatsApp your clinic number → instant greeting with your clinic's name
- [ ] Ask "how much is a consultation?" → correct price shown
- [ ] Book a treatment → pick category → pick treatment → pick date/time
- [ ] Enter your name when asked → confirmation card shows 👤 name, 📱 phone, 📅 date, 🕐 time, 💰 total
- [ ] Staff Telegram group receives the booking alert
- [ ] Staff types `/patientstatus` → sees the booking; test `/takeover` to pause the AI for that customer
- [ ] We run `/pause` → `/resume` → confirm no message flood
- [ ] ✅ Live

---

## 5. Day-to-Day: How to Change Anything

You never touch code or dashboards. Three ways:

### A) Ask us (WhatsApp/Telegram to your Moon Hands contact)
"Add 'Gold Facial' at $188, 90 minutes" — done same day.
"Upgrade us to Premium" — we'll confirm, update your plan, and invoice the difference.

### B) Self-serve change requests from your staff Telegram group
```
/req_addservice "Gold Facial" "$188" 90
/req_updateprice "Consultation" "$50-$100"
/req_hours saturday 10:00-16:00
/req_faq "Is there parking?" "Yes — validated parking at…"
/req_voice friendly
```
Each request pings the Moon Hands admin with **Approve / Reject** buttons; you're notified either way. Nothing changes without approval — your live agent stays consistent.

### C) Plan upgrade
Message your Moon Hands contact or use `/req_upgrade premium` in your staff group. We'll confirm the new billing rate (S$547/mo) and activate unlimited messages immediately.

---

## 6. House Rules Your AI Follows (so you can trust it)

- It only knows your **approved** menu, prices, hours, and FAQs — it won't invent treatments or discounts.
- Price ranges are shown as ranges; the confirmation always notes *"final price confirmed at the clinic"* for range-priced items.
- It always collects the customer's **name and phone number** before completing a booking, so your team can call back.
- It respects your hours, buffers, and daily cap — no double-bookings beyond your rules.
- Any staff member can pause the AI for any customer (`/takeover`) and take over the chat manually.
- Stuck or unhappy customers are surfaced to your staff group rather than looped.

---

## 7. Your Monthly Report

Usage, bookings, and conversion stats are metered automatically; ask your Moon Hands contact anytime for a snapshot (`/usage` from the admin side). Weekly summaries can be enabled per clinic.

**Basic plan clinics:** your report includes your message usage vs. the 500-message monthly limit, plus any upgrade recommendations if you're consistently near the cap.

**Premium plan clinics:** your report shows unlimited usage with a breakdown of AI vs. template replies for transparency.

---

## 8. Getting Help

- 💬 Message your Moon Hands contact (fastest — anything from menu changes to billing questions)
- 📱 Staff group: `/menu` shows everything your bot can do
- 💰 Billing or plan questions: reply to your monthly invoice or message your Moon Hands contact directly
- 🔒 Something looks wrong? `/patientpause <number>` pauses the AI for that customer immediately while we investigate.

*Welcome aboard — your receptionist never sleeps now.* 🌙
