# Moon Hands — Go-Live Checklist
## Comprehensive: All Pending Tasks from All Sessions

**Company:** Pixel Vault Pte Ltd (UEN: 202504500D)  
**Product:** Moon Hands — AI WhatsApp Receptionist for Singapore Aesthetic Clinics  
**Pricing:** S$347/mo (Starter) | S$547/mo (Professional) — prepaid, no refunds  
**Email:** pixelvaultsg@gmail.com  
**Status:** Backend LIVE on Render | Telegram working | Website pending | WhatsApp sandbox skipped

---

## 🔴 CRITICAL (Must Complete Before Revenue)

### 1. Privacy Policy (PDPA Compliance)
**Status:** NOT STARTED  
**Why:** Singapore PDPA requires this BEFORE collecting any patient/clinic data. Operating without it = legal liability.  
**What we need:**
- What data we collect (patient phone numbers, names, appointment details, clinic info)
- How we use it (AI processing, booking management, Telegram alerts)
- Where it's stored (Supabase, Singapore-hosted)
- Who has access (clinic staff via Telegram, Moon Hands admin)
- Data retention policy
- Contact for data queries (pixelvaultsg@gmail.com)
- PDPA opt-out mechanism
**Effort:** 1-2 hours to draft. Can adapt from a PDPA template.

### 2. Pitch Deck Updates (moonhands-final.pptx)
**Status:** NEEDS UPDATES  
**Changes required:**
| Slide | Current | Should Be |
|-------|---------|-----------|
| 4 — How It Works | "Booking confirmed, calendar synced" | "Booking request sent — clinic approves via Telegram" |
| 5 — Features | "Calendar sync + reminders" | "Telegram booking alerts + daily closing summary" |
| 5 — Features | "Singapore-Hosted" line | Add "Every booking needs clinic approval — nothing auto-confirms" |
| 7 — Pricing | "$347 / $547" | "S$347 / S$547" |
| 7 — Pricing | "Calendar sync" in feature list | "Telegram approval system + daily closing summary" |
| 9 — Trust | "Singapore-hosted data" | Keep + add "Staff control via Telegram — approve/reject bookings" |
| 10 — Contact | moonhandssg@gmail.com | **pixelvaultsg@gmail.com** |
| 10 — Contact | "+65 8xxx xxxx" | Remove or replace with website URL |
| 10 — CTA | "Free 14-day pilot" + "$174 founding partner" | Simplify to "Book a demo" or "Start your pilot" — remove $174 (we're prepaid full price) |
**Also:** Remove all references to "voice minutes" if we don't have voice AI yet. Or clarify it's a future feature.

### 3. Terms of Use (Final Review)
**Status:** Drafted (`TERMS_OF_USE_CLIENT.md`)  
**Needs:**
- Final legal review (even if informal)
- Ensure email is pixelvaultsg@gmail.com throughout
- Confirm: prepaid, no refunds, no grace period disclosure
- Add PDPA reference once Privacy Policy is done

---

## 🟡 HIGH (Required for First Clinic)

### 4. 360dialog Production Account
**Status:** NOT STARTED  
**Why:** Sandbox has shared number, message limits, and unreliable delivery. Production = dedicated WhatsApp Business number.  
**Steps:**
1. Apply at 360dialog.com (takes 1-3 business days)
2. Verify business (need ACRA biz profile for Pixel Vault Pte Ltd)
3. Configure webhook URL with signature auth
4. Remove `WEBHOOK_AUTH_REQUIRED=false` from Render
5. Set `WEBHOOK_SECRET` for HMAC verification
6. Test end-to-end with real number

### 5. Monitoring Env Vars on Render
**Status:** NOT SET  
**Vars to add:**
| Variable | Value | Purpose |
|----------|-------|---------|
| `MASTER_SECRET` | Random 32+ char string | For registering your devices |
| `MOONHANDS_AGENT_SECRET` | Random 32+ char string | Identifies "Kimi" in audit log |
| `MASTER_DEVICE_FPS` | Leave empty initially | Auto-filled after device registration |
**Why:** Without these, audit system can't distinguish "Master" from "unknown" actors. All your access shows as suspicious.

### 6. Register Your Devices
**Status:** NOT DONE  
**Steps:**
```bash
# From your laptop (set MASTER_SECRET in Render first):
curl -X POST https://moon-hands-backend.onrender.com/api/register-device \
  -H "x-master-secret: YOUR_MASTER_SECRET" \
  -H "Content-Type: application/json"

# Do the same from your phone. Add both deviceIds to MASTER_DEVICE_FPS env var.
```

### 7. Find First Friendly Clinic
**Status:** YOUR TASK  
**What to look for:**
- Single-location aesthetic clinic (simpler than chains)
- Currently uses WhatsApp for patient inquiries
- Feels pain from missed calls/after-hours messages
- Willing to try 30-day prepaid pilot
- Ideally someone you know (trust = faster feedback)
**Onboarding them:**
1. They fill out the 30-field onboarding form
2. You configure their treatments, hours, FAQ in Supabase
3. Connect their WhatsApp Business number via 360dialog
4. Test with real conversations
5. They approve bookings via Telegram

---

## 🟢 MEDIUM (Post-Launch Improvements)

### 8. Website Deployment
**Status:** User needs time  
**What's built:** Simulator, Onboarding form, Pricing page, Dashboard preview  
**Blocker:** You want to review before deploying — fair.

### 9. Booking Notification Polish
**Status:** Built, needs testing  
- Real-time Telegram alerts on new/cancelled bookings ✅
- Daily closing summary at clinic closing time ✅
- Clinic approval workflow (pending → confirmed) ✅
- Cancellation safety (explicit confirmation) ✅
**Need to test:** Full flow with real clinic data once first clinic is onboarded.

### 10. Cost Tracking Accuracy
**Status:** Working, needs calibration  
- Per-clinic daily caps ✅
- Token-based cost estimates ✅
- Usage logging to Supabase ✅
**To verify:** After ~50 real conversations, compare estimated costs vs actual OpenAI invoice.

### 11. Staff Agent #10 Integration
**Status:** Documented, needs activation  
- 6-check protocol written ✅
- Post-deploy checklist template ✅
**Next:** Run through the protocol after each future deployment.

---

## 📋 PRIORITY ORDER (What To Do This Week)

| Day | Task | Owner |
|-----|------|-------|
| **Today** | Privacy Policy draft | Kimi |
| **Today** | Update pitch deck (pptx) | Kimi |
| **Tomorrow** | Add monitoring env vars to Render | You |
| **Tomorrow** | Register your devices | You |
| **This Week** | 360dialog production application | You |
| **This Week** | Find first friendly clinic | You |
| **This Week** | Website review + deploy | You + Kimi |
| **After first clinic** | Full booking flow test | Together |

---

## ⚠️ RISKS & MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|------------|
| 360dialog approval takes >1 week | Can't onboard first clinic | Apply NOW. In parallel, use Telegram-only pilot (clinic gets alerts, approves there). |
| First clinic has complex needs | Scope creep | Start with simple single-location clinic. Say no to custom dev for first 3 clients. |
| OpenAI costs exceed estimates | Lose money | Per-clinic daily cap is S$12. If hit, warm response kicks in. Monitor weekly. |
| Competitor launches similar product | Market share loss | Speed to first 3 paying clinics is the moat. Don't perfect — ship and iterate. |

---

*Compiled: 2026-05-18*  
*Next review: After first clinic is onboarded*
