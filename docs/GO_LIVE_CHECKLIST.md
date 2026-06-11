# Moon Hands — Go-Live Readiness Checklist

**Last updated:** 2026-06-11
**Status:** Infrastructure ready. Clinic onboarding flow ready. Need first clinic.

---

## ✅ COMPLETED — Infrastructure

| # | Item | Status | Notes |
|---|------|--------|-------|
| 1 | Backend deployed on Render | ✅ Live | 20h+ uptime, healthy |
| 2 | Supabase database | ✅ Live | All tables, RLS policies |
| 3 | 360dialog WhatsApp API | ✅ Sandbox ready | Per-clinic webhook URLs |
| 4 | Telegram bot | ✅ Live | Admin alerts + booking notifications |
| 5 | Query param authentication | ✅ Built | Each clinic gets `?clinic_id=XXX&token=YYY` |
| 6 | Intrusion detection | ✅ Built | Device fingerprinting, actor classification |
| 7 | Booking notifications | ✅ Built | Real-time Telegram alerts + closing summary |
| 8 | Cost protection | ✅ Built | Per-clinic daily caps, dual-routing alerts |
| 9 | Smart rate limiter | ✅ Built | 3-layer: repeat, flood, hourly |
| 10 | Loop protection | ✅ Built | Prevents bot↔bot infinite loops |
| 11 | Prompt injection blocking | ✅ Built | 18 patterns, 2000-char limit |
| 12 | Security audit | ✅ All 15 fixed | Claude red team findings remediated |
| 13 | Cancellation safety | ✅ Built | Requires exact "CANCEL MY BOOKING" |
| 14 | No auto-confirm | ✅ Built | All bookings start `pending` |
| 15 | Verified phone injection | ✅ Built | Prevents patient impersonation |
| 16 | 11 staff agents | ✅ Documented | All playbooks in `docs/COMPANY_STAFF_AGENTS.md` |
| 17 | Onboarding form (30+ fields) | ✅ Built | 7-step form at `/onboarding` |
| 18 | Clinic activation API | ✅ Built | `POST /api/activate-clinic` |
| 19 | Welcome email system | ✅ Built | Gmail SMTP, warm copy |
| 20 | iCal feed | ✅ Built | `GET /ical/{token}.ics` for clinic calendars |
| 21 | 5 honesty/accuracy rules | ✅ Built | Injected into AI system prompt |
| 22 | Multi-clinic routing | ✅ Built | Supabase-resolved per clinic |
| 23 | Audit logging | ✅ Built | `security_events` + `audit_log` tables |
| 24 | 15 security vulnerabilities | ✅ Fixed | From Claude red team audit |
| 25 | GitHub repo | ✅ Current | `PixelVaultSG/moon-hands-backend` |

---

## 🔲 PENDING — Before First Clinic

### Immediate (This Week)

| # | Item | Owner | ETA |
|---|------|-------|-----|
| 1 | **Run Supabase migration** for `webhook_token` column | You | 5 min |
| 2 | **Generate MASTER_SECRET + MOONHANDS_AGENT_SECRET** | You | 2 min |
| 3 | **Add secrets to Render env vars** | You | 5 min |
| 4 | **Register your devices** via `/api/register-device` | You | 10 min |
| 5 | **Test end-to-end WhatsApp flow** | You | 15 min |
| 6 | **Deploy updated code to Render** (new commit) | Auto | Immediate |
| 7 | **Write Privacy Policy** (PDPA requirement) | You/Kimi | 1 hour |

### Near-Term (Next 2 Weeks)

| # | Item | Owner | ETA |
|---|------|-------|-----|
| 8 | **Find first friendly clinic** | You | Ongoing |
| 9 | **Sales pitch + demo** | You | Per clinic |
| 10 | **Clinic onboarding** (form + activation) | System | 30 min |
| 11 | **Clinic configures 360dialog** with webhook URL | Clinic | 15 min |
| 12 | **Clinic tests → goes LIVE** | Clinic + You | 1 hour |
| 13 | **Apply for 360dialog production** (when ready to scale) | You | 3-5 days |

### Scale (3+ Clinics)

| # | Item | Owner | ETA |
|---|------|-------|-----|
| 14 | Google Calendar integration (Phase 2) | Dev | Post-revenue |
| 15 | Instagram DM integration | Dev | Post-revenue |
| 16 | Automated billing (Stripe) | Dev | Post-revenue |
| 17 | Clinic self-service dashboard | Dev | Post-revenue |

---

## 🔧 Step-by-Step: This Week's Actions

### Step 1: Run Supabase Migration (5 min)

```sql
-- In Supabase SQL Editor
ALTER TABLE clients ADD COLUMN IF NOT EXISTS webhook_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_clients_webhook_token ON clients(webhook_token);
UPDATE clients SET webhook_token = encode(gen_random_bytes(24), 'hex')
WHERE webhook_token IS NULL AND status = 'active';
```

### Step 2: Generate Secrets (2 min)

On your Mac Terminal:
```bash
openssl rand -hex 32   # Copy output → MASTER_SECRET
openssl rand -hex 16   # Copy output → MOONHANDS_AGENT_SECRET
```

### Step 3: Add to Render (5 min)

[Render Dashboard](https://dashboard.render.com) → `moon-hands-backend` → Environment:

| Variable | Value |
|----------|-------|
| `MASTER_SECRET` | `32-char hex from Step 2` |
| `MOONHANDS_AGENT_SECRET` | `16-char hex from Step 2` |
| `MASTER_DEVICE_FPS` | _(leave empty for now)_ |

Deploys automatically on save.

### Step 4: Register Devices (10 min)

From your Mac:
```bash
curl -X POST https://moon-hands-backend.onrender.com/api/register-device \
  -H "Content-Type: application/json" \
  -H "x-master-secret: YOUR_MASTER_SECRET" \
  -d '{"name":"Master MacBook"}'
```

From your iPhone (use a REST client app like HTTPBot):
```
POST https://moon-hands-backend.onrender.com/api/register-device
Header: x-master-secret: YOUR_MASTER_SECRET
Body: {"name":"Master iPhone"}
```

Take both `deviceId` values and update Render:
```
MASTER_DEVICE_FPS=deviceId1,deviceId2
```

### Step 5: Test End-to-End (15 min)

1. Message your 360dialog sandbox number
2. Verify AI responds
3. Book an appointment
4. Verify Telegram notification
5. Try to cancel — confirm "CANCEL MY BOOKING" required
6. Confirm booking stays `pending` (no auto-confirm)

---

## 📋 What's Required Per New Clinic

### You Do (5 minutes)

1. Clinic fills onboarding form → submits
2. You call `POST /api/activate-clinic` with `submission_id`
3. System returns `webhook_url` — copy it

### Clinic Does (15 minutes)

1. Sign up for 360dialog account (if they don't have one)
2. Configure webhook URL in 360dialog dashboard
3. Test by messaging their WhatsApp number
4. Goes LIVE

---

## 🚨 Critical Assumptions

| # | Assumption | Mitigation |
|---|-----------|------------|
| 1 | Clinic has WhatsApp Business API via 360dialog | We guide them through setup |
| 2 | Clinic gives us their operating hours | Captured in onboarding |
| 3 | Clinic approves bookings manually | All bookings start `pending` |
| 4 | OpenAI API key has sufficient quota | Monitor via Telegram alerts |
| 5 | Render Starter plan stays active | S~9.45/mo — set and forget |

---

## 📊 Confidence Level

| Component | Confidence | Why |
|-----------|-----------|-----|
| Infrastructure | 95% | Render + Supabase proven stable |
| AI responses | 90% | Simulator tested, 5 honesty rules |
| Security | 90% | 15 vulnerabilities fixed, audit logged |
| Booking flow | 85% | Needs real clinic test |
| Notifications | 85% | Telegram tested, closing summary logic verified |
| Onboarding | 80% | Form built, activation API ready, needs first run |
| **Overall go-live** | **85%** | **Ready for first friendly clinic** |

---

## 🎯 Definition of "Go-Live"

A clinic is LIVE when:
- [ ] Onboarding form submitted
- [ ] Clinic activated in system
- [ ] Webhook URL configured in 360dialog
- [ ] Patient messages → AI responds accurately
- [ ] Booking created → Clinic receives Telegram notification
- [ ] Booking stays `pending` until clinic approves
- [ ] Cancellation requires explicit confirmation
- [ ] Closing summary sends at clinic's closing time
- [ ] You (Master) receive no intrusion alerts for legitimate traffic

---

*Moon Hands by Pixel Vault Pte Ltd*
*S$347/S$547 per month | Prepaid | No refunds*
*11 agents | 15 security fixes | Query param auth | Ready for clinic #1*
