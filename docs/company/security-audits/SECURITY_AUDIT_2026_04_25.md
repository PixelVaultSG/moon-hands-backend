# Moon Hands — Security, Vulnerability & Data Audit Report
**Date:** 25 April 2026
**Auditor:** AI System Review
**Scope:** Database, Backend Code, Infrastructure, Credential Management, Data Protection

---

## EXECUTIVE SUMMARY

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 2 | Fix provided — requires immediate user action |
| HIGH | 3 | 2 fixed in code, 1 requires credential rotation |
| MEDIUM | 4 | 1 fixed in code, 3 documented for future hardening |
| LOW | 3 | Documented for awareness |

**Bottom line:** Two critical database vulnerabilities were present in the migration SQL you ran. The fix SQL has been prepared. You must run it immediately. Additionally, real-looking API credentials are sitting in a `.env` file inside the code directory — these must be rotated even though `.gitignore` excludes the file.

---

## 1. DATABASE SECURITY FINDINGS

### 1.1 CRITICAL — RLS Policies Allow Open Access
**File:** `FINAL_MIGRATION_2026_04_25.sql` lines 56 and 114 (as originally written)

**Finding:** Both `waitlist` and `onboarding_submissions` tables had policies:
```sql
CREATE POLICY "Service role full access" ON waitlist FOR ALL USING (true) WITH CHECK (true);
```

**Why this is dangerous:**
- `USING (true)` means the policy evaluates to TRUE for every row
- In Supabase, if an anon or authenticated key makes a request, this policy would allow them to read ALL patient waitlist entries or ALL clinic onboarding submissions
- Patient waitlist contains: names, phone numbers, preferred dates, preferred treatments
- Onboarding submissions contain: clinic emails, business registration numbers, contact details, operating hours, pricing data

**Fix:** `SECURITY_REMEDIATION_2026_04_25.sql` drops these policies. After running it, zero policies remain on these tables. Only the `service_role` key (backend server) can access them.

### 1.2 CRITICAL — waitlist Uses ON DELETE CASCADE
**File:** `FINAL_MIGRATION_2026_04_25.sql` line 33 (original)

**Finding:** `waitlist.client_id` referenced `clients(id)` with `ON DELETE CASCADE`.

**Why this is dangerous:**
- Deleting a clinic record permanently erases ALL associated waitlist patient records
- Patient data should never be silently destroyed when a business relationship ends
- This violates data retention best practices and potentially Singapore PDPA principles

**Fix:** The remediation SQL changes this to `ON DELETE SET NULL`, which keeps the waitlist entry but removes the clinic link. Patient contact history is preserved (or can be manually purged later with a separate, audited process).

### 1.3 HIGH — RLS Enabled Without Verification
**Finding:** The migration enables RLS but we could not verify the live database state.

**Action required:** Run the verification queries in `SECURITY_REMEDIATION_2026_04_25.sql` (Section 3, 4, 5) to confirm:
- `waitlist` has `rls_enabled = true` and `policy_count = 0`
- `onboarding_submissions` has `rls_enabled = true` and `policy_count = 0`
- No policies exist with `qual = true`
- `waitlist.delete_rule = 'SET NULL'`

---

## 2. CREDENTIAL & CODE SECURITY FINDINGS

### 2.1 HIGH — Real Credentials in `.env` File Inside Code Directory
**File:** `/pixel-vault/backend/.env`

**Finding:** The `.env` file contained what appear to be real API credentials:
- Supabase project URL (`grbimwhndcijmpkvyiiu.supabase.co`)
- Twilio Account SID (`AC12ecfab...`)
- Twilio Auth Token (`9c9d65de...`)
- Telegram Bot Token (`8741368796:AAGbeXv...`)
- VAPI API Key (UUID format)

**Why this is dangerous:**
- `.gitignore` does exclude `.env`, but the file is physically present in the code directory
- If you ever zip the folder, copy it to another machine, or accidentally remove `.gitignore`, the keys are exposed
- Anyone with access to the Render filesystem can read them
- Stolen Telegram bot token = attacker can impersonate your admin bot
- Stolen Twilio credentials = attacker can send SMS/voice calls at your expense

**Fix applied:** The sandbox `.env` file has been overwritten with placeholder values (`your_..._here`).

**Action required (YOU must do this):**
1. Rotate every credential listed above immediately:
   - Supabase: Project Settings → API → Generate new service_role key
   - Twilio: Console → Settings → Generate new Auth Token
   - Telegram: Talk to @BotFather → /revoke → get new token
   - VAPI: Dashboard → API Keys → Regenerate
2. Store real credentials ONLY in Render's Environment Variables dashboard, NEVER in the code directory
3. Delete `.env` from your local machine entirely and rely on Render dashboard

### 2.2 HIGH — Environment Variable Name Mismatch
**Finding:** The backend code, `.env`, and `render.yaml` used inconsistent names for Supabase key:
- `client.js` and `server.js` required `SUPABASE_SERVICE_KEY`
- `render.yaml` defined `SUPABASE_SERVICE_ROLE_KEY`
- If deployed to Render, the server would crash on startup because the env var name didn't match

**Fix applied:** Standardized everything to `SUPABASE_SERVICE_ROLE_KEY` (the explicit, correct name). Updated:
- `backend/supabase/client.js`
- `backend/server.js`
- `backend/.env`
- `backend/.env.example`

### 2.3 MEDIUM — Webhook Security Keys Had Random Fallbacks
**File:** `backend/server/webhook.js` lines 24-25 (original)

**Finding:**
```js
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
const API_KEY = process.env.API_KEY || crypto.randomBytes(16).toString('hex');
```

**Why this is dangerous:**
- If `API_KEY` is not set, a random key is generated on every server restart
- 360dialog/VAPI webhooks use a fixed API key — after a restart, authentication would fail
- Silent failure pattern: server starts but webhooks break unpredictably

**Fix applied:** Removed fallbacks. Server now exits immediately with a clear error if `API_KEY` is missing:
```js
const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error('[FATAL] API_KEY environment variable is required.');
  process.exit(1);
}
```

### 2.4 LOW — CORS Allow-Origin Set to `*`
**File:** `backend/server/webhook.js` line 357

**Finding:** `res.setHeader('Access-Control-Allow-Origin', '*');`

**Risk:** Webhook endpoints should not need CORS at all (they're server-to-server). The wildcard allows any website to make cross-origin requests to your webhook endpoints.

**Mitigation:** Low risk in practice because:
- All webhook endpoints require API key authentication
- Preflight OPTIONS requests are handled
- No browser-based client should call these endpoints

**Future hardening:** Remove CORS headers from webhook server entirely, or restrict to known origins.

---

## 3. DATA PROTECTION & PRIVACY FINDINGS

### 3.1 MEDIUM — In-Memory Rate Limiter Resets on Restart
**File:** `backend/middleware/security.js` and `backend/middleware/cost-protection.js`

**Finding:** Rate limits and cost protection counters are stored in memory (`Map`). On Render free tier, instances restart at least once per day and on every deploy.

**Risk:** An attacker could trigger a restart (e.g., by causing a crash or waiting for daily restart) and bypass rate limits.

**Mitigation:** Current limits are reasonable (30 req/min per IP, 10 req/sec burst). For go-live, consider:
- Using Redis or Supabase for distributed rate limiting
- Or accept the risk for MVP and upgrade before scaling

### 3.2 MEDIUM — Security Middleware False-Positive Risk
**File:** `backend/middleware/security.js`

**Finding:** The `data_extraction` pattern list includes `'AC'` (matches Twilio Account SIDs) and `'show contact details'`. The threshold is 3 points, and data_extraction matches score 3 each.

**Risk:** A single innocent message containing "show contact details" would score exactly 3 and be blocked. A patient asking "Can I update my contact details?" could be blocked.

**Mitigation:** The pattern `'AC'` should be removed (it's too broad — it blocks any message containing "AC"). Consider requiring 2 pattern matches from the same category before blocking, or add an allowlist for common legitimate phrases.

### 3.3 LOW — Telegram Alerts Expose Partial UUID
**File:** `backend/server/onboarding.js` line 277

**Finding:** Telegram onboarding alert includes `/review ${submission.id?.substring(0, 8)}`.

**Risk:** First 8 characters of a UUID are not enough to reconstruct the full ID, but they do expose a partial identifier in Telegram's cloud.

**Mitigation:** Low risk. If Telegram security is a concern, switch to admin web dashboard for sensitive data.

### 3.4 LOW — Missing Audit Trail for Admin Approvals
**File:** `backend/telegram/commands/approvals.js`

**Finding:** Booking approvals/rejections via Telegram are not written to a database audit log. Only the Telegram chat history records who approved what.

**Risk:** If Telegram messages are lost or the bot is compromised, there's no tamper-proof audit trail.

**Mitigation:** For MVP, acceptable. For scale, add an `approval_audit_log` table.

---

## 4. INFRASTRUCTURE & DEPLOYMENT FINDINGS

### 4.1 MEDIUM — Render Free Tier Limitations
**Finding:** Render free tier instances spin down after 15 minutes of inactivity and restart on the next request.

**Impact on security:**
- Cost protection counters reset on every spin-down
- In-memory rate limiters reset
- First request after spin-down has ~30-second cold start

**Mitigation:** Upgrade to Render Starter ($7/mo) for always-on instance before go-live. This is required for production anyway.

### 4.2 LOW — `.env.example` Contains Fake-Looking URLs
**File:** `backend/.env.example`

**Finding:** The example file had a fake Supabase URL (`sb_publishable_OoF9e2Q2i0KVWyksSPt8lw_y4sUHLzo.supabase.co`) that looks like it could be real.

**Fix applied:** Updated `.env.example` to use `https://your-project-id.supabase.co` and `your_service_role_key_here`.

---

## 5. REMEDIATION CHECKLIST

### IMMEDIATE (Do Today)
- [ ] Run `SECURITY_REMEDIATION_2026_04_25.sql` in Supabase SQL Editor
- [ ] Verify the SELECT queries in that file return expected results (zero policies with `qual=true`, waitlist delete_rule = `SET NULL`)
- [ ] Rotate ALL credentials that were in the old `.env` file (Supabase, Twilio, Telegram, VAPI)
- [ ] Delete `.env` from your local machine. Use Render dashboard only.
- [ ] Set `API_KEY` and `WEBHOOK_SECRET` in Render dashboard before first deploy

### BEFORE GO-LIVE
- [ ] Upgrade Render from Free to Starter ($7/mo) for always-on instance
- [ ] Add Redis or database-backed rate limiting (replace in-memory Maps)
- [ ] Review security middleware patterns — remove `'AC'` from data_extraction list
- [ ] Add HTTPS redirect middleware (if not handled by Render edge)
- [ ] Create `approval_audit_log` table for tamper-proof booking approval records
- [ ] Lawyer review of Terms of Use for data processing consent

### ONGOING
- [ ] Monitor `access_audit_log` table for anomalies
- [ ] Review Supabase RLS policies monthly
- [ ] Rotate API keys every 90 days
- [ ] Enable Supabase Point-in-Time Recovery (PITR) for database backups

---

## FILES MODIFIED IN THIS AUDIT

| File | Change |
|------|--------|
| `backend/supabase/SECURITY_REMEDIATION_2026_04_25.sql` | NEW — Fix RLS policies, CASCADE, verification queries |
| `backend/supabase/FINAL_MIGRATION_2026_04_25.sql` | FIXED — Changed CASCADE to SET NULL, removed dangerous policies |
| `backend/supabase/client.js` | FIXED — `SUPABASE_SERVICE_KEY` → `SUPABASE_SERVICE_ROLE_KEY` |
| `backend/server.js` | FIXED — `SUPABASE_SERVICE_KEY` → `SUPABASE_SERVICE_ROLE_KEY` |
| `backend/server/webhook.js` | FIXED — Removed random fallbacks for `API_KEY` |
| `backend/server/onboarding.js` | FIXED — Added `booking_require_phone` to sanitized output |
| `backend/.env` | CLEANED — All real-looking values replaced with placeholders |
| `backend/.env.example` | FIXED — Consistent env var naming, clearer placeholders |

---

*End of Report*
