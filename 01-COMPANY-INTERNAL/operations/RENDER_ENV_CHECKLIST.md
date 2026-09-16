# Render Environment Variables — Setup Checklist

## ⚠️ CRITICAL: WhatsApp Sandbox Blocked

**Status:** Webhook returns 503 "Authentication not configured"
**Root cause:** API_KEY not set, and WEBHOOK_AUTH_REQUIRED defaults to true
**Fix:** Set these two env vars in Render Dashboard

---

## Step 1: Go to Render Dashboard

1. https://dashboard.render.com
2. Select your `moon-hands-backend` service
3. Click **Environment** tab on the left

---

## Step 2: Add These Env Vars

| Variable | Value | Why |
|----------|-------|-----|
| `WEBHOOK_AUTH_REQUIRED` | `false` | **CRITICAL:** Allows 360dialog sandbox to send webhooks without auth headers. ONLY for sandbox — remove in production. |
| `API_KEY` | *(generate a random string)* | Required when WEBHOOK_AUTH_REQUIRED is not false. For sandbox, this can be anything since auth is disabled. |
| `MASTER_SECRET` | *(generate a random string, 32+ chars)* | Secret key for "Master" device registration. You use this to register your laptop/phone. |
| `MOONHANDS_AGENT_SECRET` | *(generate a random string, 32+ chars)* | Secret header I send to identify myself ("Kimi") to the audit system. |
| `MASTER_DEVICE_FPS` | *(leave empty for now)* | Will be filled after you register devices via `/api/register-device`. Comma-separated list. |

---

## Step 3: Deploy

After adding env vars, click **Manual Deploy** → **Deploy latest commit**
Wait 2-3 minutes for service to restart.

---

## Step 4: Verify

Test these URLs after deploy:

```bash
# Should return 200 (not 503)
curl -X POST https://moon-hands-backend.onrender.com/webhook/whatsapp \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"from":"+6591234567","text":{"body":"Hi"}}]}'

# Should return health ok
curl https://moon-hands-backend.onrender.com/health

# Should return all modules loaded
curl https://moon-hands-backend.onrender.com/debug
```

---

## ⚠️ SECURITY REMINDER

- `WEBHOOK_AUTH_REQUIRED=false` is **sandbox only**
- Before going to production: set it to `true` and configure 360dialog to send `X-API-Key` header
- `MASTER_SECRET`, `MOONHANDS_AGENT_SECRET` should be 32+ character random strings
- Never commit these values to GitHub

---

*Generated: 2026-05-18*
*Next step after this: Register your devices + test WhatsApp end-to-end*
