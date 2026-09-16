# Moon Hands — Deployment Protocol v1.0
## For Future Enhancements and Go-Live Maintenance

---

## 1. DEPLOYMENT PHILOSOPHY

**NEVER deploy on Friday. NEVER deploy before a demo. ALWAYS have a rollback plan.**

Every deployment follows this sequence:
1. Code → 2. Test → 3. Review → 4. Stage → 5. Deploy → 6. Verify → 7. Monitor

---

## 2. THE 13 AGENTS INVOLVED

| # | Agent | Role | When Called | Reference |
|---|-------|------|-------------|-----------|
| 1 | **Kimi (AI Engineer)** | Writes code, runs tests, pushes to GitHub | Always | (this system) |
| 2 | **Prompt Engineer** | Intercepts BUILD/CREATE/MODIFY, crafts precise prompts | When Ash says "BUILD/CREATE/MODIFY" | `PROMPT_ENGINEER_AGENT.md` |
| 3 | **Security Agent** | Security audits, credential management, PDPA compliance | Every deploy, "AUDIT", "SECURE" | `CONSOLIDATED_AGENT_ROSTER.md` |
| 4 | **Red Team Auditor** | Adversarial pentesting, exploit chain analysis, deploy VETO | Pre-deploy, "PENTEST" | `CONSOLIDATED_AGENT_ROSTER.md` |
| 5 | **Database Manager** | Schema, migrations, RLS policies, query optimization | "DB", "SQL", "SCHEMA", "MIGRATION" | `CONSOLIDATED_AGENT_ROSTER.md` |
| 6 | **AI Receptionist Mgr** | Bot behavior, conversation flows, prompt optimization | Bot quality issues | `CONSOLIDATED_AGENT_ROSTER.md` |
| 7 | **DevOps/Deployment** | Render config, env vars, SSL, monitoring, rollback | "DEPLOY", infrastructure | `CONSOLIDATED_AGENT_ROSTER.md` |
| 8 | **UX Tester** | 10-persona roleplay, end-to-end conversation testing | Post-deploy, "TEST" | `CONSOLIDATED_AGENT_ROSTER.md` |
| 9 | **Dependency Validator** | Import resolution, env var audit, side-effect detection | Every code push | `CONSOLIDATED_AGENT_ROSTER.md` |
| 10 | **Policy & Compliance** | PDPA review, Privacy Policy enforcement, feature gatekeeping | New features, third-party integrations | `CONSOLIDATED_AGENT_ROSTER.md` |
| 11 | **Sales & Outreach** | Pricing, pitches, competitive analysis | Pricing changes, sales materials | `CONSOLIDATED_AGENT_ROSTER.md` |
| 12 | **Business Operations** | Legal, finance, contracts, vendor negotiations | Legal, financial decisions | `CONSOLIDATED_AGENT_ROSTER.md` |
| 13 | **File Guardian** | Branding consistency, document auditing, file inventory | File changes, branding reviews | `CONSOLIDATED_AGENT_ROSTER.md` |

---

## 3. THE 5 LAYERS OF DEFENSE

### Layer 1: Syntax Validation (Pre-Commit)
```bash
# Run on EVERY modified .js file
node -c ai/smart-router.js
node -c ai/conversation-state.js
node -c ai/intent-matcher.js
node -c ai/intent-handlers.js
node -c ai/bot-engine.js
node -c server/webhook.js
node -c server/calendar-service.js
# ALL MUST RETURN "Syntax OK" — no exceptions
```

### Layer 2: Unit Test Suite (Pre-Push)
```bash
node ai/test-1000-permutations.js
# Expected: 300 passed, 0 failed, 100.0%
# If ANY test fails: fix before pushing
```

### Layer 3: Integration Test (Post-Render-Deploy)
```
Send these EXACT messages to the WABA number:

1. "Hi"                              → Should get clinic greeting (NOT generic)
2. "What services do you offer"      → Should list treatments with prices + durations
3. "How much is botox"               → Should show Botox price
4. "What time do you open"           → Should show today's hours
5. "Where are you located"           → Should show address + MRT
6. "Book botox tomorrow 2pm"         → Should ask for confirmation
7. "Yes"                             → Should confirm booking
8. "next Sunday at 1pm"              → Should reject (closed Sundays)
9. "Thread lift and laser Monday 2pm"→ Should show multi-treatment summary
10. "Such as?"                       → Should show full service list
11. "no"                              → Should acknowledge politely
12. "Thanks bye"                      → Should say goodbye

ALL 12 must pass. If ANY fail: investigate, fix, redeploy.
```

### Layer 4: Safety Guards (Runtime)
These run continuously in production:

| Guard | File | What It Does |
|-------|------|--------------|
| Loop protection | `middleware/loop-protection.js` | Silences bot after 20 exchanges in 3 minutes |
| Cost protection | `middleware/cost-protection.js` | Blocks if OpenAI spend exceeds threshold |
| Rate limiting | `middleware/smart-rate-limiter.js` | IP-based rate limiting per endpoint |
| Response sanitizer | `ai/response-sanitizer.js` | Strips forbidden phrases from ALL AI output |
| Calendar health | `ai/smart-router.js:639-671` | Falls back after 30min of calendar failures |

### Layer 5: Monitoring (Continuous)

```bash
# Check these after every deploy:

# 1. Render deploy status
# Dashboard → https://dashboard.render.com/
# Must show "Deployed successfully" (not "Build failed")

# 2. Error logs (first 30 minutes)
# Render → Logs → Search for "ERROR" or "CRITICAL"
# Zero errors expected

# 3. Webhook health
# Send "ping" to webhook URL → should return 200

# 4. 360dialog connectivity
# Send WhatsApp message → should receive reply within 5 seconds

# 5. Telegram notifications
# Create booking → should receive approval notification in Telegram

# 6. Google Calendar (if clinic has calendar)
# Approve booking → should see event in clinic's calendar
```

---

## 4. DEPLOYMENT WORKFLOW (Step-by-Step)

### When Ash Says "BUILD/CREATE/MODIFY":
```
Ash: "BUILD a [feature]"
  ↓
Prompt Engineer (#7): Asks 3-5 clarifying questions (scope, UX, security, edge cases)
  ↓
Ash: Answers
  ↓
Prompt Engineer (#7): Crafts refined prompt, shows to Ash for approval
  ↓
Ash: "Yes" (or provides changes)
  ↓
Kimi (#1): Executes against refined prompt
```

### When Code Is Ready (Pre-Deploy):

#### Step 1: Code Changes
```bash
# Work on feature branch (not main!)
git checkout -b feature/new-thing

# Make changes
# ... edit files ...
```

#### Step 2: Syntax Validation (Syntax Validator)
```bash
# Check EVERY modified file
for f in $(git diff --name-only | grep '\.js$'); do
  node -c "$f" || exit 1
done
echo "ALL SYNTAX OK"
```

#### Step 3: Run Test Suite (Test Runner)
```bash
node ai/test-1000-permutations.js
# MUST show: 300 passed, 0 failed, 100.0%
```

#### Step 4: Security Audit (Security Agent + Red Team)
```bash
# Security Agent checklist:
□ grep -ri "api_key\|token\|secret\|password" ai/ server/ --include="*.js"
  # Must return ONLY process.env references, NO hardcoded values
□ Check new endpoints have auth
□ Check input validation on all new user inputs
□ Verify RLS policies if touching database

# Red Team Auditor: 5-phase quick check (5 min)
□ Phase 1: Perimeter — Can unauthorized requests reach new code?
□ Phase 2: Trust Boundary — Does GPT control anything it shouldn't?
□ Phase 3: Data Integrity — Can data be crossed between clinics?
□ Phase 4: Resource Exhaustion — Can one patient burn budget?
□ Phase 5: Supply Chain — New dependencies? CVE check?
```

#### Step 5: Dependency Validation (Dependency Validator)
```bash
# 6-check protocol:
□ 1. Every require() resolves — no broken imports
□ 2. New process.env vars are documented
□ 3. DB schema compatible with existing data
□ 4. No side effects on unrelated features
□ 5. Telegram alerts still readable
□ 6. /health endpoint returns 200
```

#### Step 6: Code Review Checklist (File Guardian + Kimi)
Before committing, verify:
- [ ] `getConfig()` used for ALL clinic data access (not direct property access)
- [ ] No hardcoded clinic names, prices, or treatment names
- [ ] No `console.log` left in production code (use `console.error` for errors only)
- [ ] No API keys or secrets in code
- [ ] Booking state checked BEFORE multi-intent confirm (order matters!)
- [ ] New intents added to `INTENT_PATTERNS` AND test suite
- [ ] Response sanitizer updated if adding new response patterns
- [ ] Branding: "Moon Hands" not "Pixel Vault" in any user-facing text

#### Step 7: Policy & Compliance Check (Policy Guardian)
```bash
# For new features only:
□ Data collection audit — new data types in Privacy Policy?
□ Third-party audit — new processor? DPA signed?
□ Patient rights — harder to access/correct/delete? (if yes, BLOCKED)
□ Documentation — Privacy Policy, T&C, onboarding docs updated?
```

#### Step 8: Commit and Push
```bash
git add -A
git commit -m "feat: clear description of what changed and why"
git push origin feature/new-thing
```

#### Step 9: Merge and Deploy
```bash
git checkout main
git pull origin main
git merge feature/new-thing
git push origin main
# Render auto-deploys within 2-3 minutes
```

#### Step 10: Post-Deploy Verification (UX Tester + DevOps)
```
UX Tester runs Protocol A + B (15 min):
  1. "Hi" → Greeting received? (NOT generic)
  2. "What services do you offer" → Full list with prices + durations?
  3. "How much is botox" → Botox price shown?
  4. "Book botox tomorrow 2pm" → Confirmation summary?
  5. "Yes" → Booking confirmed?
  6. "next Sunday at 1pm" → Rejected? (closed Sundays)
  7. "Thread lift and laser Monday 2pm" → Multi-treatment summary?
  8. "Such as?" → Full service list?
  9. "no" → Polite acknowledgment?
  10. "Thanks bye" → Goodbye?

DevOps monitors for 30 minutes:
  □ Render logs: zero ERROR entries
  □ /health returns 200
  □ WhatsApp replies within 5 seconds
  □ Telegram notifications arrive
  □ Google Calendar sync works (if clinic has calendar)
```

If ANY check fails → `git revert HEAD && git push origin main` (rollback).

---

## 5. EMERGENCY ROLLBACK

If production breaks:

```bash
# Option 1: Revert last commit
git revert HEAD
git push origin main

# Option 2: Reset to known good commit
git reset --hard 0288f298aeb2  # or any known good commit
git push origin main --force

# Render will auto-deploy the previous version within 2-3 minutes
```

---

## 6. WHEN TO USE OPENAI vs HARDCODED

| Query Type | Handler | Cost |
|------------|---------|------|
| Greeting (first contact) | Hardcoded | $0 |
| Service list | Hardcoded | $0 |
| Pricing (specific treatment) | Hardcoded | $0 |
| Operating hours | Hardcoded | $0 |
| Location | Hardcoded | $0 |
| Booking flow | Hardcoded | $0 |
| Confirmation yes/no | Hardcoded | $0 |
| Complaint | OpenAI | ~$0.02 |
| Vague question | OpenAI | ~$0.02 |
| Emotional support | OpenAI | ~$0.02 |
| Complex multi-part | OpenAI | ~$0.03 |

**Target: 80%+ of queries handled by hardcoded (zero OpenAI cost).**

---

## 7. MODIFYING INTENT MATCHER RULES

When adding a new intent or changing an existing one:

1. **Add to `INTENT_PATTERNS`** in `ai/intent-matcher.js`
2. **Add handler** to `ai/intent-handlers.js` (or map to existing handler)
3. **Add tests** to `ai/test-1000-permutations.js`:
   - At least 3 positive tests (should match)
   - At least 2 negative tests (should NOT match)
   - 1 typo/short-form test
4. **Run test suite** → must show 100%
5. **Check for regressions** — ensure no existing tests break

### Golden Rules for Intent Patterns:
- **Regex first, keywords as fallback** — regex is more precise
- **Word boundaries for single-word keywords** — prevents "hifu" matching "hi"
- **Extract function validates** — reject generic words like "consultation", "service"
- **Confidence >= 0.7** for routing to hardcoded handler
- **Confidence >= 0.85** for multi-intent triggering

---

## 8. ADDING A NEW CLINIC

1. **Onboarding form** → Clinic fills: name, address, phone, hours, treatments, prices
2. **Database insert** → One row in `client_configs`:
```sql
INSERT INTO client_configs (slug, name, config, webhook_token) VALUES (
  'glow-aesthetics',
  'Glow Aesthetics',
  '{"greeting":"...","services":[...],"operating_hours":[...]}'::jsonb,
  generate_token()
);
```
3. **Generate webhook URL** → Share with clinic:
```
https://moon-hands-backend.onrender.com/webhook/whatsapp?clinic_id=GLOW001&token=abc123
```
4. **Clinic connects WhatsApp** → They configure 360dialog with the webhook URL
5. **Test** → Send "Hi" to their number → should work immediately

**No code changes. No redeploy. Just 1 database row.**

---

## 9. ENVIRONMENT VARIABLES REFERENCE

| Variable | Required | Purpose |
|----------|----------|---------|
| `DIALOG360_API_KEY` | ✅ | 360dialog WhatsApp API authentication |
| `SUPABASE_URL` | ✅ | Database connection |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Database auth (admin level) |
| `OPENAI_API_KEY` | ✅ | AI responses for complex queries |
| `TELEGRAM_BOT_TOKEN` | ✅ | Clinic owner notifications |
| `GOOGLE_CALENDAR_KEY` | ❌ | Google Calendar service account JSON |
| `WEBHOOK_BASE_URL` | ❌ | Base URL for clinic webhooks |
| `NODE_ENV` | ❌ | Set to `production` |

---

*Document version: 1.0*
*Last updated: July 4, 2026*
*Applies to: All future enhancements post commit 0288f298aeb2*
