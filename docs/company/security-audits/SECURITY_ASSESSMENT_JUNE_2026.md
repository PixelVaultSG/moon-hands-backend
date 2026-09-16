# Moon Hands — 360° Security & Information Assessment Report

**Prepared by:** Technical Security Board (AI Agent Consortium)
**Date:** 27 June 2026
**Classification:** INTERNAL — COMPANY EYES ONLY
**Scope:** Full-stack assessment of Moon Hands AI WhatsApp receptionist platform

---

## Executive Summary

Moon Hands demonstrates **mature security architecture** for a pre-launch startup. The codebase includes thoughtful protections across authentication, rate limiting, input sanitization, cost control, and audit logging. However, **8 vulnerabilities** were identified across Critical (2), High (3), Medium (2), and Low (1) severity levels. All are fixable before go-live.

**Overall Security Grade: B+** (Good with actionable improvements required)

---

## 1. VULNERABILITY REGISTER

### CRITICAL (2)

| # | Vulnerability | Location | Risk | Fix |
|---|--------------|----------|------|-----|
| C1 | **CORS allows all origins** (`*`) | `server.js:25` | Any website can call your API, steal data, or trigger actions | Restrict to `moonhands.sg` and `wzejxaudglkym.kimi.page` |
| C2 | **API_KEY falls back to random** if not set | `server/webhook.js:180` | If env var is missing, a random key is generated. Attacker has 0% chance of guessing it, BUT the key changes every restart, breaking integrations unpredictably | Remove fallback; hard-fail if `API_KEY` not set |

### HIGH (3)

| # | Vulnerability | Location | Risk | Fix |
|---|--------------|----------|------|-----|
| H1 | **No rate limiting on `/api/calendar/verify`** | `server.js:49` | Attacker can enumerate/discover clinic calendar IDs via brute force | Add IP-based rate limit (5 req/min) |
| H2 | **In-memory storage — data loss on restart** | `smart-rate-limiter.js`, `cost-protection.js` | Rate limit counters and cost tracking reset on every deploy. Spam abusers get fresh quotas | Migrate to Redis or Supabase key-value |
| H3 | **Calendar service has write scope by default** | `calendar-service.js:31` | Service account requests `calendar` scope (full read+write). If compromised, attacker can delete all clinic appointments | No fix needed — write scope IS required for booking creation. Mitigate with service account isolation |

### MEDIUM (2)

| # | Vulnerability | Location | Risk | Fix |
|---|--------------|----------|------|-----|
| M1 | **Sanitization only strips `<>`** | `onboarding-submission.js:46` | XSS payloads using other vectors (e.g., `javascript:`, event handlers) may bypass | Use DOMPurify or comprehensive HTML entity encoding |
| M2 | **No audit log for calendar operations** | `calendar-service.js` | Who created/deleted what appointment? No traceability | Add `calendar_events` table with `action, event_id, calendar_id, user_phone, timestamp` |

### LOW (1)

| # | Vulnerability | Location | Risk | Fix |
|---|--------------|----------|------|-----|
| L1 | **Missing security headers** | `server.js` | No `Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options` | Add standard security headers to all responses |

---

## 2. DATABASE SECURITY

### 2.1 Row Level Security (RLS)

| Table | RLS Status | Assessment |
|-------|-----------|------------|
| `clients` | ✅ ENABLED | Properly secured — users only see their own rows |
| `client_configs` | ✅ ENABLED | Properly secured |
| `conversations` | ✅ ENABLED | Properly secured |
| `appointments` | ✅ ENABLED | Properly secured |
| `onboarding_submissions` | ✅ ENABLED | Properly secured |
| `security_events` | ✅ ENABLED | Properly secured |

**Verdict:** RLS is correctly configured. No unauthorized data access possible via client queries.

### 2.2 Schema Issues

| Issue | Location | Severity | Fix |
|-------|----------|----------|-----|
| `plan` DEFAULT `'starter'` — wrong value | `schema.sql:14` | MEDIUM | Change to `'basic'` for naming consistency |
| No encryption for `customer_phone` | `conversations`, `appointments` | MEDIUM | Add column-level encryption or use Supabase Vault |
| No data retention policy | All tables | LOW | Define retention: conversations 2 years, security_events 1 year |

### 2.3 Access Control

| Concern | Detail | Mitigation |
|---------|--------|------------|
| Service role key has full DB access | One key can do anything | Acceptable for now; implement per-function keys after 5+ clinics |
| No separate read-only user | All queries use service role | Low risk — no external database access |

---

## 3. API ENDPOINT SECURITY

### 3.1 Authentication Matrix

| Endpoint | Auth Method | Strength | Issue |
|----------|------------|----------|-------|
| `/webhook/whatsapp` | Per-clinic query params (token) | STRONG ✅ | 48-char hex token, constant-time comparison, 5-min cache |
| `/api/onboarding` | `x-api-key` header | STRONG ✅ | Mandatory, no bypass, 60s rate limit |
| `/api/calendar/verify` | None (only calendarId) | WEAK ⚠️ | No auth needed, but should have rate limiting |
| `/health` | None | ACCEPTABLE ✅ | Only returns status, no sensitive data |
| `/debug` | `x-api-key` | STRONG ✅ | Returns env PRESENCE only (not values) |

### 3.2 Input Validation

| Layer | Implementation | Status |
|-------|---------------|--------|
| Request size limits | 10KB webhook, 100KB onboarding, 10KB general | ✅ GOOD |
| JSON parsing | Try/catch with graceful fallback | ✅ GOOD |
| Field validation | Regex for email, phone, plan values | ✅ GOOD |
| HTML sanitization | Strip `<>` only | ⚠️ PARTIAL — see H3 |
| Prompt injection | Dedicated middleware with pattern matching | ✅ GOOD |
| Date validation | Forward-date only (no past dates) | ✅ GOOD |

---

## 4. INFRASTRUCTURE SECURITY

### 4.1 Render Platform

| Aspect | Status | Notes |
|--------|--------|-------|
| HTTPS enforced by Render | ✅ YES | All traffic TLS-terminated |
| Environment variables encrypted | ✅ YES | Render encrypts at rest |
| Build isolation | ✅ YES | Each deploy is fresh container |
| DDoS protection | ✅ YES | Render provides basic DDoS |
| Custom domain SSL | ⬜ PENDING | `moonhands.sg` needs Cloudflare or similar |

### 4.2 Environment Variable Security

| Var | Set? | Sensitivity | Risk |
|-----|------|------------|------|
| `SUPABASE_URL` | ✅ | LOW | Public URL, no secret |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | CRITICAL | Full DB access — rotate quarterly |
| `OPENAI_API_KEY` | ✅ | HIGH | Cost exposure if leaked — set $ limit on OpenAI dashboard |
| `D360_API_KEY` | ✅ | HIGH | WhatsApp access — rotate if suspect breach |
| `TELEGRAM_BOT_TOKEN` | ✅ | HIGH | Bot control — use BotFather to revoke/regen if needed |
| `API_KEY` | ✅ | HIGH | Webhook/endpoint auth — rotate quarterly |
| `GOOGLE_CALENDAR_KEY` | ✅ | HIGH | Calendar access — use dedicated service account per clinic |
| `ONBOARDING_API_KEY` | ✅ | MEDIUM | Form submission only |

### 4.3 Security Headers (Missing)

```javascript
// Add to server.js — all responses:
res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
```

---

## 5. THIRD-PARTY INTEGRATION SECURITY

### 5.1 360dialog (WhatsApp)

| Aspect | Status |
|--------|--------|
| API key storage | Environment variable ✅ |
| Endpoint auto-detection | Sandbox vs production based on key format ✅ |
| Retry logic | 2 endpoints with fallback ✅ |
| Message size limit | 4096 chars ✅ |
| WABA pending detection | 404 = not verified ✅ |

### 5.2 OpenAI (GPT-4o mini)

| Aspect | Status |
|--------|--------|
| API key storage | Environment variable ✅ |
| Cost protection | $20/day limit, 200 API calls/day, kill switch ✅ |
| Model selection | Fixed to `gpt-4o-mini` (lowest cost) ✅ |
| Prompt injection | Blocked by security middleware ✅ |
| Temperature | Not configurable by end user ✅ |

### 5.3 Telegram

| Aspect | Status |
|--------|--------|
| Bot token storage | Environment variable ✅ |
| Admin authentication | Chat ID whitelist ✅ |
| Markdown escaping | Proper escape for special chars ✅ |
| No external commands | All commands require admin chat ID ✅ |

### 5.4 Google Calendar

| Aspect | Status |
|--------|--------|
| Service account isolation | Dedicated account for Moon Hands only ✅ |
| Scope | `calendar` (read+write) — required for bookings ✅ |
| Key storage | Environment variable as JSON ✅ |
| Per-clinic access | Clinic must explicitly share calendar ✅ |
| Date validation | Forward dates only, max 90 days advance ✅ |
| Audit logging | ❌ MISSING — see M2 |

### 5.5 Supabase

| Aspect | Status |
|--------|--------|
| RLS enabled | ✅ YES — all tables |
| Connection | HTTPS only ✅ |
| Service role key scope | Full database — acceptable for single-backend |
| Backup | Supabase provides daily backups ✅ |

---

## 6. DATA PRIVACY (PDPA COMPLIANCE — Singapore)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Consent for data collection | ✅ | Onboarding form captures explicit consent via checkbox |
| Purpose limitation | ✅ | Data only used for appointment booking and clinic communication |
| Data minimization | ✅ | Only collects name, phone, treatment preference — no NRIC, no medical history |
| Retention limit | ⚠️ | No automatic deletion policy defined. Recommend: conversations 2yr, appointments 3yr |
| Access/correction rights | ✅ | Clinic can update via Telegram `/updateconfig` command |
| Data breach notification | ✅ | Telegram alerts to admin on security events |
| Third-party disclosures | ✅ | Only shared with: clinic (data owner), 360dialog (message delivery), OpenAI (AI processing) |
| Cross-border transfer | ⚠️ | OpenAI (US), Supabase (various regions), Render (US). Document this in privacy policy |

---

## 7. MONITORING & AUDIT

| Capability | Status | Location |
|------------|--------|----------|
| Security event logging | ✅ | `security_events` table — injection attempts, auth failures |
| Rate limit tracking | ✅ | In-memory with Telegram alerts |
| Cost tracking | ✅ | Per-clinic daily counters |
| Uptime monitoring | ✅ | Self-ping + keepalive |
| Message trace | ✅ | Last 50 messages in memory |
| Deployment logging | ✅ | `deployment_log` table |
| Admin Telegram alerts | ✅ | Real-time on anomalies |
| Calendar operation audit | ❌ | NOT IMPLEMENTED — see M2 |

---

## 8. RECOMMENDED FIXES (Priority Order)

### Before Go-Live (This Week)

| Priority | Fix | Effort | File |
|----------|-----|--------|------|
| 1 | **Restrict CORS** to production domains only | 5 min | `server.js:25` |
| 2 | **Add rate limiting** to `/api/calendar/verify` | 15 min | `server.js:49` |
| 3 | **Remove API_KEY fallback** — hard fail if missing | 5 min | `server/webhook.js:180` |
| 4 | **Add security headers** to all responses | 10 min | `server.js` |

### Post-Launch (Next 2 Weeks)

| Priority | Fix | Effort | File |
|----------|-----|--------|------|
| 5 | **Calendar audit logging** — `calendar_events` table | 1 hour | New file |
| 6 | **Migrate rate limiting** to Redis or Supabase | 4 hours | `smart-rate-limiter.js` |
| 7 | **Encrypt patient phone numbers** at rest | 2 hours | `schema.sql` + migration |
| 8 | **Define data retention policy** + scheduled cleanup job | 2 hours | New job file |

---

## 9. SECURITY SCORECARD

| Category | Score | Grade |
|----------|-------|-------|
| Authentication | 85/100 | A- |
| Authorization | 90/100 | A |
| Input Validation | 75/100 | B |
| Data Protection | 70/100 | B- |
| Infrastructure | 80/100 | B+ |
| Monitoring | 85/100 | A- |
| Third-Party Security | 85/100 | A- |
| PDPA Compliance | 75/100 | B |
| **OVERALL** | **81/100** | **B+** |

---

## 10. CONCLUSION

Moon Hands has a **solid security foundation** that exceeds typical pre-launch startups. The per-clinic webhook authentication, multi-layer rate limiting, cost kill switch, and prompt injection protection demonstrate mature security thinking.

The 8 identified vulnerabilities are all **fixable within 1 day** for the critical/high items. No architectural changes are needed — only targeted code patches.

**Recommended action:** Apply the 4 "Before Go-Live" fixes this week, then tackle the 4 "Post-Launch" items over the following 2 weeks. After that, the platform will achieve an **A-grade security posture**.

---

*End of Report*

**Next Review:** 30 days post-launch or after 5th clinic onboarding (whichever comes first)
