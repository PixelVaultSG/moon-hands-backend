# Render Environment Variables — Setup Checklist

Your backend is deployed and healthy. Complete these steps to activate all security and monitoring features.

---

## Step 1: WhatsApp Sandbox (Critical — Do First)

360dialog's sandbox cannot send custom authentication headers. You MUST disable webhook auth for sandbox mode.

| Variable | Value | Where |
|----------|-------|-------|
| `WEBHOOK_AUTH_REQUIRED` | `false` | Render Dashboard → Environment |

**Path:** [dashboard.render.com](https://dashboard.render.com) → Select `moon-hands-backend` → Environment → Add

> ⚠️ **Remove this variable in production** — when you get a 360dialog production account, set it to `true` or delete it entirely.

---

## Step 2: Monitoring Secrets (Required for Intrusion Detection)

The audit system needs two secrets to distinguish you (Master) from unknown actors.

Generate secrets (run in terminal):

```bash
openssl rand -hex 32  # MASTER_SECRET
openssl rand -hex 16  # MOONHANDS_AGENT_SECRET
```

| Variable | Value | Purpose |
|----------|-------|---------|
| `MASTER_SECRET` | `[32-char hex]` | Protects /api/register-device endpoint |
| `MOONHANDS_AGENT_SECRET` | `[16-char hex]` | Identifies Kimi agent calls |
| `MASTER_DEVICE_FPS` | _(leave empty for now)_ | Filled in Step 3 |

---

## Step 3: Register Your Devices

Call this **once from each device** you use (laptop, phone, tablet):

```bash
curl -X POST https://moon-hands-backend.onrender.com/api/register-device \
  -H "Content-Type: application/json" \
  -H "x-master-secret: YOUR_MASTER_SECRET" \
  -d '{"name":"Master"}'
```

**Response:**
```json
{
  "deviceId": "abc123...",
  "message": "Device registered. Add deviceId to MASTER_DEVICE_FPS env var."
}
```

### Add each deviceId to Render:

| Variable | Value |
|----------|-------|
| `MASTER_DEVICE_FPS` | `deviceId1,deviceId2` (comma-separated) |

After adding, redeploy (Render auto-redeploys on env change).

---

## Step 4: Supabase Schema

Run this SQL in your Supabase SQL Editor:

```sql
-- Audit log table for intrusion detection
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL, -- 'Master', 'Kimi', 'unknown'
  device_id TEXT,
  ip_address TEXT,
  path TEXT,
  method TEXT,
  details JSONB DEFAULT '{}',
  risk_score INTEGER DEFAULT 0
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor ON audit_log(actor);
CREATE INDEX IF NOT EXISTS idx_audit_log_event ON audit_log(event_type);

-- Row Level Security (admin only)
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full access" ON audit_log
  FOR ALL USING (auth.role() = 'service_role');
```

---

## Step 5: Verify Telegram Notifications

Your booking notifications go to Telegram. Confirm:

1. `TELEGRAM_BOT_TOKEN` — set (from @BotFather)
2. `TELEGRAM_ADMIN_CHAT_ID` — set (from @userinfobot)
3. `TELEGRAM_ALERT_CHAT_ID` — set (alerts channel)

**Test:** Send a booking via the simulator → check Telegram.

---

## Complete Environment Variable Reference

| Variable | Status | Notes |
|----------|--------|-------|
| `SUPABASE_URL` | ✅ Required | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ Required | service_role key |
| `OPENAI_API_KEY` | ✅ Required | platform.openai.com |
| `DIALOG360_API_KEY` | ✅ Required | 360dialog Hub |
| `WHATSAPP_PHONE_NUMBER_ID` | ✅ Required | Your WABA number ID |
| `TELEGRAM_BOT_TOKEN` | ✅ Required | @BotFather |
| `TELEGRAM_ADMIN_CHAT_ID` | ✅ Required | @userinfobot |
| `TELEGRAM_ALERT_CHAT_ID` | ✅ Required | Alerts channel |
| `API_KEY` | ✅ Required | Webhook auth key |
| `WEBHOOK_AUTH_REQUIRED` | ⚠️ Set to `false` | For sandbox only |
| `MASTER_SECRET` | 🔲 Add now | `openssl rand -hex 32` |
| `MOONHANDS_AGENT_SECRET` | 🔲 Add now | `openssl rand -hex 16` |
| `MASTER_DEVICE_FPS` | 🔲 Add after Step 3 | From /api/register-device |
| `WEBHOOK_SECRET` | 🔲 Optional | For signature verification |
| `MAX_DAILY_COST_PER_CLINIC` | ✅ Has default | S~5 USD default |

---

## Verification Checklist

After completing all steps:

- [ ] `WEBHOOK_AUTH_REQUIRED=false` set on Render
- [ ] `MASTER_SECRET` generated and set
- [ ] `MOONHANDS_AGENT_SECRET` generated and set
- [ ] Device registered from laptop → `MASTER_DEVICE_FPS` updated
- [ ] Device registered from phone → `MASTER_DEVICE_FPS` updated
- [ ] Supabase `audit_log` table created
- [ ] WhatsApp sandbox message → receives AI response
- [ ] Booking created → Telegram notification received
- [ ] Booking cancelled → Telegram notification received

---

## What Each Component Does

| Component | File | Purpose |
|-----------|------|---------|
| **Intrusion Detection** | `monitoring/audit-system.js` | Tracks every access, classifies actor (Master/Kimi/unknown), sends Telegram alerts for suspicious activity |
| **Booking Notifications** | `telegram/booking-notifications.js` | Real-time Telegram alerts for new/cancelled/rescheduled bookings |
| **Closing Summary** | `jobs/closing-summary.js` | Runs every 15 min, sends daily booking summary at clinic closing time |
| **Smart Rate Limiter** | `middleware/smart-rate-limiter.js` | 3-layer protection: repeat detection, flood protection, hourly caps |
| **Cost Protection** | `middleware/cost-protection.js` | Per-clinic daily spend caps |
| **Audit Log Schema** | `supabase/audit_log_schema.sql` | Database table for security events |
