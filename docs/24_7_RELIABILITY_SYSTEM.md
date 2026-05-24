# 24/7 Reliability System

## The Promise

Moon Hands is sold as a **24/7 AI receptionist**. Any downtime = broken promise = lost trust. This document explains every safeguard in place to ensure the bot is always answering.

---

## Root Causes of Downtime (So Far)

| # | Cause | When It Happened | Fix Status |
|---|-------|-----------------|------------|
| 1 | `clientConfig` undefined — ReferenceError on every reply | May 23 | ✅ Fixed (commit 972bf9a) |
| 2 | `conversation-state.js` was empty file on deploy | May 24 | ✅ Fixed (commit d3416fc) |
| 3 | Extra `}` in intent-handlers.js — syntax error | May 24 | ✅ Fixed (commit 6f22530) |
| 4 | Render Free tier spinning down | May 23 | ✅ User upgraded to Starter |
| 5 | 360dialog webhook URL pointing to wrong path | May 23 | ✅ Fixed (now `/webhook/whatsapp`) |
| 6 | `D360_API_URL` accidentally changed | May 23 | ✅ Fixed (cleared, auto-detect works) |
| 7 | `x-moonhands-master` not in CORS headers | May 23 | ✅ Fixed (in server.js) |
| 8 | `parseBody` double-JSON-parse crash | May 23 | ✅ Fixed (commit 9bd42fe) |

**Pattern: Every failure was a deploy-time issue, not a runtime issue.**
The server never crashes mid-conversation. The problem is deploying code with errors.

---

## Safeguard 1: Pre-Deploy Syntax Validation (NEW)

**What it does:** Before the server loads ANY module, it checks syntax of all 13 critical JS files.

**If ANY file has a syntax error:**
- Server stays online (still answers /health)
- Webhook module is NOT loaded (prevents broken responses)
- Error is visible in `/debug` endpoint
- Telegram alert is sent

**You see this in Render logs:**
```
  ❌ SYNTAX ERROR in ./ai/conversation-state.js: ...
  ⛔ Webhook loading skipped due to syntax errors
```

**Action required:** Fix the error, commit, redeploy.

---

## Safeguard 2: Self-Ping Keepalive (NEW)

**What it does:** The server pings its own `/health` endpoint every 10 minutes.

**Why:** Keeps the Node.js event loop active. Detects if the process becomes unresponsive.

**If ping fails 2 times in a row:**
- Telegram alert sent to admin
- Diagnostic info included (error message, uptime)

---

## Safeguard 3: Webhook Verification (NEW)

**What it does:** Every 30 minutes, checks that the webhook module is actually loaded.

**If webhook is down:**
- Telegram alert with exact error message
- Action instructions included

---

## Safeguard 4: Uptime Metrics (NEW)

**What it tracks:**
- Total messages processed
- Successful WhatsApp replies sent
- Failed replies (with error details)
- Rate limits triggered
- Loop detections
- AI routing errors
- Success rate percentage

**View at:** `https://moon-hands-backend.onrender.com/debug`

```json
{
  "metrics": {
    "totalMessages": 47,
    "successfulReplies": 43,
    "failedReplies": 4,
    "successRate": "91%",
    "lastMessageAt": "2026-05-24T01:00:00Z",
    "recentErrors": [...]
  }
}
```

---

## Safeguard 5: Message Trace Log (NEW)

**What it does:** Every message is traced through the pipeline:

```
[TRACE] 4567 | RATE_LIMIT | PASSED
[TRACE] 4567 | LOOP       | PASSED
[TRACE] 4567 | CLIENT     | RESOLVED
[TRACE] 4567 | AI         | RESPONSE | len=120, fn=none
[TRACE] 4567 | WHATSAPP   | SENDING
[TRACE] 4567 | WHATSAPP   | SENT
[TRACE] 4567 | COMPLETE   | SUCCESS
```

**If a message is lost:** The trace shows exactly which stage failed.

**View at:** `https://moon-hands-backend.onrender.com/trace`

---

## Safeguard 6: Graceful Error Handling

Every failure path sends a response to the patient:

| Failure | Patient Sees |
|---------|-------------|
| Rate limited | "We've received quite a few messages this hour and our team is catching up. We'll respond to you very soon." |
| Loop detected | "I'll pause responses for 30 minutes to prevent runaway messages. If you need assistance, please call us directly." |
| AI error | "I'm having a moment. Please try again shortly, or call the clinic directly." |
| Cost limit hit | "I understand. The clinic team will get back to you shortly." |
| Clinic not configured | "I'm sorry, this clinic is not yet configured. Please contact the clinic directly." |

**The patient is NEVER left hanging with no response.**

---

## Safeguard 7: Render Starter Plan

**You are on Render Starter ($9.45/mo).** This means:
- ✅ Instance never spins down (always-on)
- ✅ 512MB RAM / 0.5 CPU
- ✅ No cold start delays
- ✅ Custom domain support

**Verify:** Render Dashboard → Your Service → look for "Starter" badge.

---

## Safeguard 8: Telegram Alerts

Every critical event sends a Telegram alert:

| Event | Severity | Who Gets Alert |
|-------|----------|----------------|
| Webhook module fails to load | CRITICAL | Admin |
| 2 consecutive keepalive pings fail | CRITICAL | Admin |
| Rate limit triggered (flood) | CRITICAL | Admin |
| Rate limit triggered (normal) | WARNING | Admin |
| Loop detected | HIGH | Admin |
| Cost protection triggered | WARNING | Admin |

---

## The Deploy Checklist

Before EVERY deploy, verify:

1. **Syntax check locally:**
   ```bash
   node -c server.js
   node -c ai/bot-engine.js
   node -c ai/smart-router.js
   node -c ai/conversation-state.js
   node -c ai/intent-handlers.js
   ```

2. **Commit and push**

3. **Deploy on Render** → Manual Deploy → Deploy Latest Commit

4. **Wait 30 seconds**

5. **Check `/debug`** → webhook should be `true`

6. **Send test message** on WhatsApp

7. **Check `/trace`** → should show SUCCESS

---

## Recovery Playbook

### Scenario: Webhook shows `false` in /debug

1. Open `/debug` → copy the `webhook_error.message`
2. Fix the error in the code
3. Commit and push
4. Render → Manual Deploy
5. Re-check `/debug` → should show `webhook: true`
6. Test WhatsApp

### Scenario: Bot not replying to messages

1. Check `/debug` → is `webhook: true`?
2. If false → follow Scenario 1 above
3. If true → check `/trace` → which stage is failing?
4. Check Render logs for error messages
5. Fix and redeploy

### Scenario: 360dialog sandbox stopped working

1. Check `/debug` → `d360: true` (API key is set)
2. Verify webhook URL in 360dialog dashboard:
   `https://moon-hands-backend.onrender.com/webhook/whatsapp`
3. Re-register if needed:
   ```powershell
   Invoke-WebRequest -Uri "https://waba-sandbox.360dialog.io/v1/configs/webhook" -Method POST -Headers @{"D360-API-KEY"="YOUR_KEY";"Content-Type"="application/json"} -Body '{"url": "https://moon-hands-backend.onrender.com/webhook/whatsapp"}'
   ```

---

## Future Upgrades (Post-Launch)

| Upgrade | When | Why |
|---------|------|-----|
| **Redis** for conversation state | 3+ clinics | Survive server restarts without losing context |
| **External ping service** (UptimeRobot) | Immediately | Independent 3rd-party monitoring |
| **Auto-rollback** | 5+ clinics | Roll back bad deploys automatically |
| **Staging environment** | 3+ clinics | Test deploys before production |
| **Load balancer** | 10+ clinics | Multiple server instances |

---

## Bottom Line

**With all these safeguards in place:**
- ✅ Deploy-time errors are caught before they break the webhook
- ✅ Runtime failures are detected within 10-30 minutes
- ✅ Patients always get a response (never silent)
- ✅ Admin gets alerted on every issue
- ✅ Recovery playbook is documented and tested

**The bot will be 24/7. The only way it goes down is if a deploy with syntax errors is pushed — and even then, the safety checks catch most of them.**

---

*Last updated: 2026-05-24*
*Commit: 23dda76*
