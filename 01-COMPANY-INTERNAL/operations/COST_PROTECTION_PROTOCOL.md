# MOON HANDS — COST PROTECTION PROTOCOL
## "The $25K Lesson" — Preventing API Key Abuse & Runaway Bills
### Classification: CRITICAL INTERNAL — Enforced Before Go-Live
### Date: 2026-04-21

---

## THE INCIDENT THAT MOTIVATED THIS DOCUMENT

**Reddit post (r/googlecloud):** A developer went to bed with a $10 budget alert on Google Cloud. Woke up to a **$25,672.86 bill** from 60,000 unauthorized API requests through a compromised API key. Google's support was useless — AI chatbots, wrong advice, account silently bumped to higher tier, billing suspension destroyed logs.

**What went wrong (their side):**
1. API key exposed somewhere (GitHub, logs, leaked in conversation)
2. No hard spending cap on the API key
3. No rate limiting tied to cost
4. No anomaly detection (60K requests overnight should have triggered shutdown)
5. No auto-shutdown on budget breach
6. No credential rotation on suspicious activity

**This will NOT happen to Moon Hands. The protections below are mandatory, not optional.**

---

## 1. ZERO-TRUST COST ARCHITECTURE

Every API key we hold has a **kill switch**. Every spend action has a **ceiling**. Every anomaly triggers a **shutdown**.

### 1.1 Per-API Cost Ceilings (Hard Caps)

| API Service | Cost Per Unit | Hard Daily Cap | Monthly Cap | Kill Trigger |
|------------|---------------|----------------|-------------|--------------|
| **VAPI.ai Voice** | $0.12/min | $50/day | $1,500/mo | 417 min/day |
| **Twilio WhatsApp** | $0.005/msg + Meta rates | $30/day | $900/mo | ~2,000 msgs/day |
| **Twilio SMS (backup)** | ~$0.02/msg | $10/day | $300/mo | 500 SMS/day |
| **360dialog (if used)** | Per-message via Meta | $30/day | $900/mo | ~1,500 msgs/day |
| **OpenAI (text AI)** | ~$0.006/conversation | $20/day | $600/mo | ~3,300 convos/day |
| **Supabase** | Free tier (500MB) | N/A (free) | $0 (free) | N/A |
| **Render Hosting** | $7-25/mo | N/A (fixed) | $25/mo | N/A |
| **Telegram Bot** | Free | N/A (free) | $0 | N/A |

**Total maximum daily spend across all APIs: ~$140/day = ~$4,200/month**
**This is the WORST CASE if ALL APIs max out simultaneously.**

### 1.2 Per-Clinic Cost Ceilings (Within Our Platform)

Every clinic gets internal cost quotas:

| Tier | Monthly Voice Minutes | Monthly Messages | Monthly Conversations | Daily Hard Cap |
|------|----------------------|-----------------|----------------------|----------------|
| **Starter** | 500 min ($60 VAPI) | 1,000 ($12 Twilio) | 1,000 ($6 AI) | $5/day |
| **Professional** | 2,000 min ($240 VAPI) | 5,000 ($60 Twilio) | 5,000 ($30 AI) | $15/day |
| **Overage** | $0.12/min | Per-msg rate | Per-convo rate | **BLOCKED** |

**When a clinic hits their daily cap: AI responds with "I'm currently at capacity, please contact the clinic directly."**

**When a clinic hits their monthly cap: Service paused until next billing cycle or upgrade.**

---

## 2. THE KILL SWITCH SYSTEM (Emergency Shutdown)

### 2.1 Automatic Kill Switches (No Human Required)

| Trigger Condition | Action | Response Time |
|-------------------|--------|---------------|
| **Single API spend >2x daily cap** | Pause that API service only | 60 seconds |
| **Single API spend >3x daily cap** | **HALT ALL services**, alert admin | 30 seconds |
| **Total daily spend >$100** | **HALT ALL services**, alert admin | 60 seconds |
| **Requests from unknown IP using our API key** | Block IP, alert admin | Instant |
| **API requests at >5x normal rate** | Rate limit to 10% capacity | 10 seconds |
| **Weekend/holiday usage spike >4x normal** | Require manual approval to continue | 5 minutes |

### 2.2 The Emergency Stop Command

From Telegram admin bot, type:
```
/KILL
```
Result: **All API services immediately suspended.** No voice calls. No WhatsApp messages. No AI responses. Zero spend.

```
/RESUME
```
Result: Services restored after manual verification.

**The /KILL command works even if the API key is actively being abused. It cuts off at OUR server level, not at the API provider level.**

### 2.3 The Circuit Breaker Pattern

```
NORMAL OPERATION
       ↓
  Cost spike detected
       ↓
  CIRCUIT OPENS (services halt)
       ↓
  Admin investigates via Telegram
       ↓
  If OK: /RESUME
  If compromised: Rotate keys first, then /RESUME
```

**The circuit breaker prevents a $25K bill. It trades temporary service interruption for financial survival.**

---

## 3. API KEY PROTECTION LAYERS

### 3.1 Key Storage (Already Implemented ✅)

| Rule | Status |
|------|--------|
| No keys in code | ✅ Env vars only |
| No keys in logs | ✅ Regex filter strips all secrets |
| No keys in chat | ✅ Credential exposure detection (60+ patterns) |
| No keys in git | ✅ .gitignore blocks .env files |
| Server refuses to start if key missing | ✅ Validation on startup |

### 3.2 Key Usage Monitoring (NEW — This Document)

Every API call tracked:
```javascript
api_access_log: {
  service: "vapi|twilio|360dialog|openai",
  key_prefix: "sk_va_***789",     // Last 3 chars only
  endpoint: "/voice/call",
  cost_usd: 0.12,
  clinic_id: "lumina_aesthetics", // Which clinic triggered it
  ip_address: "xxx.xxx.xxx.xxx",
  timestamp: "2026-04-21T14:30:00Z"
}
```

### 3.3 Key Rotation Schedule

| Key Type | Rotation Frequency | Triggered By |
|----------|-------------------|--------------|
| VAPI API key | Every 90 days | Calendar + credential exposure alert |
| Twilio credentials | Every 90 days | Calendar + credential exposure alert |
| 360dialog API key | Every 90 days | Calendar + credential exposure alert |
| Supabase service_role | Every 90 days | Calendar + credential exposure alert |
| OpenAI API key | Every 90 days | Calendar + credential exposure alert |
| Telegram bot token | Every 90 days | Calendar + any suspicious bot activity |
| Webhook secret | Every 90 days | Calendar |
| Admin API key | Every 30 days | Calendar + any failed auth attempts |

**If a credential exposure is detected: IMMEDIATE rotation within 15 minutes. No exceptions.**

### 3.4 Key Scope Limitation (NEW)

Where supported, API keys are scoped to minimum required permissions:

| API | Scoping Available | Our Setting |
|-----|-------------------|-------------|
| VAPI | Limited (account-wide) | Monitor only |
| Twilio | ✅ Subaccounts | Each clinic = separate Twilio subaccount |
| 360dialog | Limited (per-number) | Per-number API keys |
| OpenAI | ✅ Project-based keys | Separate key per clinic |
| Supabase | ✅ Service role only | RLS enforces per-clinic isolation |

**Twilio subaccounts = if one clinic's credentials leak, other clinics are NOT affected.**

---

## 4. COST ANOMALY DETECTION (Real-Time)

### 4.1 Detection Rules (Every 10 Minutes)

```
RULE 1: Hourly spend > 2x rolling average
  → YELLOW alert: "Cost spike detected: $X (normal: $Y)"
  → Action: Flag for review, continue service

RULE 2: Hourly spend > 3x rolling average
  → RED alert: "CRITICAL: Cost 3x normal. Auto-limiting to 50% capacity."
  → Action: Reduce service to 50%, require /RESUME for full

RULE 3: Hourly spend > 5x rolling average
  → BLACK alert: "EMERGENCY: Possible API key abuse. Halting services."
  → Action: /KILL automatically triggered

RULE 4: Requests from new IP using valid API key
  → RED alert: "API key used from unknown IP: xxx.xxx.xxx"
  → Action: Block IP, require key rotation

RULE 5: Weekend/holiday usage > 3x weekday average
  → YELLOW alert: "Unusual weekend activity"
  → Action: Require manual confirmation

RULE 6: Single clinic cost > 2x their tier allocation
  → RED alert: "Clinic X exceeding allocated budget"
  → Action: Pause that clinic's service only
```

### 4.2 Baseline Learning (7-Day Rolling Window)

```
Day 1-7: Baseline established (manual review of all alerts)
Day 8+: Auto-detection active

Baseline updates: Every 24 hours
Outlier exclusion: Top 10% and bottom 10% of hours excluded from baseline
Seasonal adjustment: Weekend vs weekday baselines maintained separately
```

### 4.3 The $25K Scenario — How We'd Stop It

**Their scenario:** 60,000 API requests overnight = $25K

**How our system would respond:**

```
Hour 1: 2,500 requests (normal: 100/hour)
  → RULE 2 triggered: Cost 25x normal
  → Service auto-limited to 50%
  → RED alert sent to Telegram

Hour 2: 5,000 requests (service limited, but still flowing)
  → RULE 3 triggered: Cost 50x normal
  → /KILL executed — ALL services halted
  → BLACK alert sent to Telegram
  → Total damage: ~$200 (not $25,000)

Admin wakes up:
  → Sees BLACK alert in Telegram
  → Checks api_access_log: Unknown IP using VAPI key
  → Rotates VAPI key
  → Blocks offending IP
  → /RESUME after verification
  → Total financial damage: ~$200 + 4 hours of downtime
```

**$200 instead of $25,000. That's the difference between having a kill switch and not having one.**

---

## 5. BILLING PROTECTION (Provider-Level)

### 5.1 VAPI.ai

| Setting | Value | How |
|---------|-------|-----|
| Spending limit | $1,500/mo hard cap | Set in VAPI dashboard |
| Daily alert threshold | $50/day | Our monitoring |
| Auto-shutdown on limit | Enabled | VAPI feature |
| Low balance alert | At $100 remaining | VAPI feature |

### 5.2 Twilio

| Setting | Value | How |
|---------|-------|-----|
| Usage triggers | $50/day → alert | Set in Twilio Console |
| Hard spending cap | $100/day | Request via Twilio support (Enterprise) |
| Subaccount isolation | One per clinic | Prevents cross-clinic leak |
| Geo-restriction | Singapore only | Block requests from outside SG |

### 5.3 360dialog (if used)

| Setting | Value | How |
|---------|-------|-----|
| Prepaid balance model | Not postpaid | Never bill-after-use |
| Low balance alert | At €20 remaining | Our monitoring |
| Hard cap | €100/day | Request via 360dialog support |

### 5.4 OpenAI

| Setting | Value | How |
|---------|-------|-----|
| Usage tier | Tier 1 (default) | Limits to $100/mo until verified |
| Hard limit | $50/day | Request via OpenAI support |
| Rate limits | 60 RPM | Default — prevents burst abuse |
| Project isolation | Separate project per clinic | Prevents cross-clinic leak |

### 5.5 Render.com (Hosting)

| Setting | Value | How |
|---------|-------|-----|
| Plan | Hobby ($7) → Pro ($25) | Fixed cost, no surprises |
| Spending cap | N/A (fixed pricing) | Cannot exceed plan cost |
| Auto-scale | DISABLED | Never auto-scale without approval |

---

## 6. THE EVIDENCE PRESERVATION PROTOCOL

**The Reddit victim's second mistake:** Disabling billing destroyed their logs.

### 6.1 Logs Are Never Deleted

| Log Type | Retention | Stored In |
|----------|-----------|-----------|
| API access logs | 30 days | Supabase (not API provider) |
| Security events | 90 days | Supabase |
| Cost records | 90 days | Supabase |
| Conversation data | Per ToU (90 days post-cancel) | Supabase |
| Telegram bot commands | 30 days | Supabase |

**These logs are in OUR database, not in the API provider's system. Disabling an API service does NOT delete our logs.**

### 6.2 Audit Trail on Key Rotation

Every key rotation creates an immutable record:
```javascript
{
  action: "key_rotation",
  api: "vapi",
  old_key_prefix: "***abc",
  new_key_prefix: "***xyz",
  triggered_by: "credential_exposure_alert",
  rotated_by: "admin_telegram_id",
  timestamp: "2026-04-21T03:15:00Z"
}
```

---

## 7. THE HUMAN RESPONSE PROTOCOL

### 7.1 Alert Escalation

| Alert Level | Response Time | Who | Action |
|-------------|--------------|-----|--------|
| **BLACK** (auto-shutdown) | Immediate | On-call admin | Wake up. Investigate. Rotate keys. /RESUME. |
| **RED** (threat detected) | 15 minutes | Admin | Review. Decide: rotate keys or false positive. |
| **YELLOW** (anomaly flagged) | 1 hour | Admin | Review at next convenience. Monitor. |

### 7.2 The Decision Tree

```
ALERT RECEIVED
      ↓
Is it a credential exposure? → YES → Rotate keys immediately → Document → Resume
      ↓ NO
Is it a cost spike? → YES → Check api_access_log
      ↓
Unknown IP? → Block IP → Rotate keys → Resume
      ↓
Known IP but abnormal? → Limit to 50% → Monitor for 1 hour
      ↓
False positive? → Update baseline → Resume full service
```

---

## 8. IMPLEMENTATION CHECKLIST

### Before First Client Go-Live (MANDATORY)

| # | Task | Status | Who |
|---|------|--------|-----|
| 1 | Set VAPI spending cap ($1,500/mo) | ⬜ | You (VAPI dashboard) |
| 2 | Set Twilio usage trigger ($50/day) | ⬜ | You (Twilio Console) |
| 3 | Request Twilio hard spending cap | ⬜ | You (Twilio support ticket) |
| 4 | Create OpenAI project keys (per-clinic isolation) | ⬜ | You (OpenAI dashboard) |
| 5 | Set OpenAI usage tier to Tier 1 ($100/mo limit) | ⬜ | You (OpenAI dashboard) |
| 6 | Implement kill switch code (/KILL command) | ⬜ | Me |
| 7 | Implement per-clinic cost ceilings | ⬜ | Me |
| 8 | Implement circuit breaker pattern | ⬜ | Me |
| 9 | Wire cost anomaly detection to Telegram alerts | ⬜ | Me |
| 10 | Test /KILL → /RESUME cycle | ⬜ | Both |
| 11 | Document key rotation schedule in calendar | ⬜ | You |
| 12 | Create Twilio subaccount for first clinic | ⬜ | You |

---

## 9. LESSONS FROM THE $25K BILL

| Their Mistake | Our Protection |
|---------------|---------------|
| No spending cap on API | Hard daily/monthly caps on ALL APIs |
| No rate limiting | 3-tier rate limiting + circuit breaker |
| No anomaly detection | Real-time cost anomaly detection every 10 min |
| No auto-shutdown | /KILL command — services halt in 30 seconds |
| Logs destroyed by billing change | Logs in OUR database, never in API provider's |
| Support was useless | Kill switch is self-controlled, not vendor-dependent |
| Single API key for everything | Per-clinic subaccounts, scoped permissions |
| No credential rotation schedule | 90-day rotation, immediate on exposure |

---

## 10. THE PROMISE

> **We will NOT wake up to a $25K bill.**
>
> We have kill switches. We have hard caps. We have anomaly detection.
> We have per-clinic isolation. We have circuit breakers.
> We have evidence preservation. We have key rotation.
>
> **The most expensive API call is the one we didn't authorize.**
> **This protocol exists to ensure that call never happens.**

---

**Document Owner: Moon Hands Technical Lead**
**Last Updated: 2026-04-21**
**Next Review: Before first client go-live**
**Classification: INTERNAL — Implement Before Go-Live**
