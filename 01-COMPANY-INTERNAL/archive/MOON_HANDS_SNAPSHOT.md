# Pixel Vault - Snapshot of Decisions to Date

**Date:** April 17, 2026  
**Status:** LOCKED IN - Ready for Implementation

---

## 🎯 Target Market

**Primary:** Aesthetic Clinics in Singapore  
**Secondary:** Medical Aesthetics, Beauty/Wellness  
**Focus:** Newly opened clinics (0-6 months) and boutique clinics (1-3 locations)

---

## 💰 Final Pricing Plans (LOCKED)

### Starter — $347/month
- 500 voice minutes/month
- 1,000 WhatsApp messages/month
- 1 business phone line + WhatsApp Business
- Treatment-specific AI training
- Calendar integration (Google, Outlook, Apple)
- Analytics dashboard (inquiries, bookings, response time)

### Professional — $547/month ⭐ MOST POPULAR
- 2,000 voice minutes/month
- 5,000 WhatsApp messages/month
- Up to 3 business phone lines + WhatsApp Business
- Treatment-specific AI training
- **Custom AI voice & personality training**
- Calendar integration (Google, Outlook, Apple)
- Share treatment photos with patients
- Full analytics suite (trends, peak hours, conversion tracking)
- **Instagram & Facebook DM integration***
- Priority support (4h response)
- **Feature request priority**
- Monthly optimization call

**Footnote for Professional:**  
*Instagram & Facebook DM integration is included with Professional. During onboarding, we will discuss whether to activate it based on your needs. Note: AI responds to appointment-related inquiries only; non-business messages (complaints, HR, spam) are escalated to your team.

---

## ✅ Key Decisions Made

### 1. Phone Lines
- **Starter:** 1 business phone line (clear language)
- **Professional:** Up to 3 business phone lines
- Clarified that we connect to their existing phone numbers, not provide new ones

### 2. Setup Time Consistency
- **Standardized to:** "Under 10 minutes" across all materials
- Previously had inconsistency: "5 minutes" vs "<10 minutes"

### 3. Payment Integration (Stripe)
- **Decision:** NO Stripe integration
- **Reason:** AI agent should NOT handle financial transactions
- Appointment booking ≠ payment processing
- Too risky for an AI agent to handle payments

### 4. Per-Message Costs Display
- **Decision:** REMOVE all per-message cost displays from client-facing UI
- Per-message costs are OUR backend costs, not client-facing
- Clients see message limits (1,000/5,000) in pricing plans
- Showing per-message costs creates confusion
- Automations section now shows: "All messages count toward your monthly WhatsApp limit"

### 2. Support Tiers
- **Starter:** Support provided but not stated in pricing (mentioned during onboarding)
- **Professional:** Priority support (4h response) + Feature request priority

### 3. Calendar Integration
- **Both tiers:** All calendar integrations (Google, Outlook, Apple)
- Differentiation in analytics depth, not calendar access

### 4. Instagram/Facebook Integration
- **Included in Professional** as a listed feature
- **Optional during onboarding** — discussed and activated only if client wants it
- **Limitations disclosed:** AI only handles appointment-related inquiries; non-business messages escalated to human team

### 5. Analytics Differentiation
- **Starter:** Basic metrics (inquiries, bookings, response time)
- **Professional:** Full suite (trends, peak hours, conversion tracking)

### 6. Custom AI Voice Training
- **Professional only** — additional value add
- Starter gets standard AI training

### 7. Photo Sharing
- Rephrased from "Before/after photo sharing" to "Share treatment photos with patients"
- More professional, less clinical

---

## 🚫 What's NOT Included (Intentionally)

- No Enterprise tier (kept simple with 2 tiers)
- No unlimited messaging (clear limits set)
- No performance guarantees on website
- No fabricated testimonials (real ones collected after 2 months)
- No specific conversion rate promises

---

## 📋 Onboarding Process (Agreed)

1. **30-minute setup call**
2. Collect treatment menu and pricing
3. Connect WhatsApp Business account
4. Connect calendar (Google/Outlook/Apple)
5. **For Professional:** Discuss Instagram/Facebook integration (optional activation)
6. **For Professional:** Discuss custom AI voice/personality preferences
7. AI training and testing (24-48 hours)
8. Go live

---

## 🔒 Technical Stack (Confirmed)

- **Voice AI:** VAPI.ai (~$0.12/min)
- **WhatsApp:** Twilio (~$0.005/msg) ✅ SWITCHED FROM 360dialog
- **Instagram/Facebook:** Meta Business API (when activated)
- **Database:** Supabase (free tier)
- **Notifications:** Telegram Bot
- **Frontend:** React + TypeScript + Tailwind

### Why Twilio (Not 360dialog):
- No monthly subscription (€49 saved)
- Pay-per-use aligns with our cost model
- Better margins: Starter ~$224/mo profit vs ~$158 with 360dialog
- Official Meta BSP with excellent documentation

---

## 📊 Grace Period & Overage Policy (Confirmed)

- **50% overage absorbed at no charge** each month
- Grace limits: Starter (750 min / 1,500 msgs), Pro (3,000 min / 7,500 msgs)
- **Overage fees beyond grace:** $0.15/min voice, $0.01/msg WhatsApp
- **Usage alerts:** 80% warning, 100% grace notice, 150% final warning, 200% upgrade recommendation
- Monthly billing, alerts via WhatsApp/Telegram
- Documented in full T&C: `TERMS_AND_CONDITIONS.md`

---

## 🎨 Branding

- **Name:** Pixel Vault
- **Tagline:** "Never Miss a WhatsApp. Never Miss a Patient."
- **Colors:** Violet to Pink gradient
- **AI Agent Names:** Customizable (Sophia, Emma, etc.)

---

## 🏥 Health Monitoring (Zero Tolerance for Downtime)

### Alert Levels:
| Level | Trigger | Action |
|-------|---------|--------|
| INFO | Latency >200ms | Log and monitor |
| WARNING | 3-5 fails/hour | Telegram alert to admin |
| CRITICAL | Service down | Telegram + SMS + auto-recovery |
| EMERGENCY | Multiple services down | Emergency call + failover |

### Auto-Recovery:
- VAPI: Switch to backup key after 3 retries
- Twilio: Exponential backoff retry (1s, 2s, 4s)
- Supabase: Queue writes if disconnected
- Calendar: Mark pending, retry every minute
- Instagram: Auto-refresh expired tokens

### Client-Facing:
- Status page at status.pixelvault.sg
- Incident history and ETAs
- SLA credits for missed targets

Full design: `HEALTH_MONITORING_DESIGN.md`

---

## 📁 Files Created to Date

| File | Purpose |
|------|---------|
| `App.tsx` | Main website (live) |
| `Simulator.tsx` | End-to-end demo |
| `OnboardingForm.tsx` | Client onboarding |
| `AdminDashboard.tsx` | Client management |
| `PaymentDashboard.tsx` | Billing & usage |
| `SALES_TRAINING_MANUAL.md` | Complete sales training |
| `SALES_BATTLE_CARD.md` | Quick reference for calls |
| `SALES_ROLEPLAY_SCENARIOS.md` | Practice drills |
| `NEGOTIATION_PLAYBOOK.md` | Pricing negotiation |
| `AESTHETIC_CLINIC_MARKET_ANALYSIS.md` | Market research |
| `AESTHETIC_CLINIC_SALES_SCRIPTS.md` | Industry-specific scripts |
| `PIXEL_VAULT_PITCH_DECK_AESTHETIC.md` | 12-slide pitch deck |
| `PIXEL_VAULT_SNAPSHOT.md` | This document |

---

## 🚀 Next Steps (To Be Discussed)

1. Create actual API accounts (VAPI, 360dialog, Supabase)
2. Build production backend with real integrations
3. Set up Telegram bot for daily reports
4. Create onboarding workflow in Make.com
5. Test end-to-end with first client
6. Collect real testimonials after 2 months

---

## 💬 Agreements

- ✅ No performance guarantees on website
- ✅ Real testimonials only (collected after 2 months)
- ✅ Honest pricing differentiation
- ✅ IG/FB limitations disclosed upfront
- ✅ 14-day free trial for both tiers
- ✅ Transparent about what AI can/cannot do
- ✅ Twilio selected as WhatsApp API provider
- ✅ Health monitoring system designed (before go live)
- ✅ Overage fees defined in T&C

---

## 📝 CONSISTENCY INSTRUCTION (STORED)

**For all future changes:**

When enhancing or tweaking any feature, I must consider **everything else** about the company that is related to that feature:

- Website content
- Pitch deck
- Agent scripts
- Pricing plans
- Onboarding materials
- Simulator scenarios
- Documentation

**Any change must be reflected consistently across ALL materials.**

---

---

**This document is LOCKED. Any changes require explicit discussion and agreement.**

**Live Website:** https://xrdv3s64x4fyq.ok.kimi.link
