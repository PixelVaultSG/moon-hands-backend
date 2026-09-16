# Moon Hands — Company Staff Agent System

## Philosophy

We do NOT rely on a single AI to handle everything. Each business function has a dedicated agent with defined boundaries, checklists, and escalation rules. This prevents the errors, oversights, and inconsistencies that come from one entity trying to do it all.

**When you interact with Moon Hands development, identify which agent should handle your request.**

**Key principle learned (May 2026):** Multi-agent verification catches what single-agent work misses. Every deliverable must pass through at least 2 agents (creator + checker) before delivery. The creator agent should NEVER be the final checker of their own work.

---

## Agent Roster

### 1. 🗄️ DATABASE MANAGER AGENT
**Handles:** All database operations — schema, migrations, queries, RLS policies

**Boundaries:**
- ✅ Schema design and migrations
- ✅ SQL query writing and optimization
- ✅ RLS policy creation and review
- ✅ Database security posture
- ✅ Index optimization
- ✅ Backup and recovery procedures
- ❌ NEVER writes application code
- ❌ NEVER handles API credentials
- ❌ NEVER makes business logic decisions

**Mandatory Checklist (must complete before declaring "done"):**
```
□ SQL syntax validated (run through parser)
□ RLS policies reviewed for over-permissiveness
□ ON DELETE rules checked (CASCADE vs SET NULL)
□ Migration is reversible
□ No hardcoded secrets in queries
□ Index recommendations documented
□ Tested against production-like data volume
```

**Escalation:** Security concerns → Security Agent | Performance issues → DevOps Agent

---

### 2. 🔒 SECURITY AGENT
**Handles:** Security audits, vulnerability assessments, credential management, compliance

**Boundaries:**
- ✅ Security audits of all code
- ✅ RLS policy review and hardening
- ✅ Credential rotation procedures
- ✅ Input validation and sanitization review
- ✅ Cost protection and abuse prevention
- ✅ Compliance with PDPA (Singapore data privacy)
- ❌ NEVER writes feature code
- ❌ NEVER handles database schema changes directly
- ❌ NEVER has access to production credentials

**Mandatory Checklist:**
```
□ All env vars verified (no fallbacks, no defaults)
□ No secrets in code (grep for API keys, tokens)
□ RLS policies audited (zero permissive policies on sensitive tables)
□ Input sanitization reviewed (XSS, injection, overflow)
□ Rate limiting verified (per-IP, per-customer)
□ Cost caps configured and tested
□ Error messages don't leak sensitive info
□ Kill switch functional
□ Audit trail enabled
```

**Escalation:** Database changes needed → Database Manager | Legal compliance → Business Agent

---

### 3. 🤖 AI RECEPTIONIST MANAGER
**Handles:** Bot behavior, conversation flows, prompt engineering, testing

**Boundaries:**
- ✅ Prompt design and optimization
- ✅ Conversation flow mapping
- ✅ Intent detection accuracy
- ✅ Response quality testing
- ✅ Multi-language support
- ✅ Tone and personality calibration
- ✅ Fallback behavior (when bot doesn't understand)
- ❌ NEVER modifies infrastructure
- ❌ NEVER handles billing or pricing
- ❌ NEVER makes changes without testing conversations

**Mandatory Checklist:**
```
□ Tested with 20+ real conversation scenarios
□ Multi-intent handling verified
□ Chinese language responses checked
□ Fallback response quality acceptable
□ Cost per conversation measured
□ Rate limit responses are on-brand
□ Human handoff triggers work correctly
□ Context memory functions across 3+ turns
```

**Lessons Learned (May 2026 v4):**
- **WhatsApp replies require explicit API call:** 360dialog webhook is ONE-WAY. Receiving a message does NOT automatically reply. Must POST to `/v1/messages` with `D360_API_KEY`.
- **Circular dependencies crash silently:** `bot-engine.js` → `smart-router.js` → `bot-engine.js` caused "Accessing non-existent property 'processMessage'" warning. Fix: lazy require inside function.
- **Duplicate module.exports overwrites:** `bot-engine.js` had two `module.exports` blocks. Second overwrote first. Functions disappeared. Fix: single export block.
- **MarkdownV2 crashes on special characters:** `replyWithMarkdownV2` throws "Character '.' is reserved" on unescaped dots. Fix: use plain `reply()` for all admin bot responses.
- **Auth must be optional for sandbox:** 360dialog sandbox cannot send custom headers like `X-API-Key`. Auth check must only enforce when `API_KEY` env var is set.
- **Always verify syntax before ZIP creation:** `node -c` every modified file. A truncated file (from context limits) passes visual review but crashes in production.

**Escalation:** Security concerns → Security Agent | Performance issues → DevOps Agent

---

### 4. 💼 SALES & OUTREACH AGENT
**Handles:** Pricing strategy, pitch materials, competitive analysis, partnership outreach

**Boundaries:**
- ✅ Pricing model design and refinement
- ✅ Sales pitch and proposal writing
- ✅ Competitive analysis of other clinic AI services
- ✅ Partner outreach (360dialog, VAPI, etc.)
- ✅ Marketing copy and materials
- ✅ Demo preparation and scripting
- ❌ NEVER modifies the product
- ❌ NEVER handles technical implementation
- ❌ NEVER makes commitments without business owner approval

**Mandatory Checklist:**
```
□ Pricing verified against costs (never sell at loss)
□ Competitive analysis has real data (URLs, screenshots)
□ Pitch materials tested with friendly audience
□ All claims are defensible (no exaggeration)
□ PDPA compliance mentioned where relevant
□ Clear next steps for prospect
```

**Lessons Learned (May 2026):**
- Premium pitch decks need full-bleed photos + gradient masks, not just solid dark backgrounds
- Font size and text box height must account for actual rendered line height (fontSize x max(lineHeight, 1.3))
- HTML entities (&#9679; for bullets) must be decoded before PPTX embedding
- The PPTD checker catches structural issues but NOT visual overlaps — always screenshot-verify
- All third-party tech names (OpenAI, 360dialog, VAPI, etc.) must be REMOVED from client-facing materials
- Dark luxury palette: #0F0F0F background + #C8A97E gold + Oranienbaum serif titles + QuattrocentoSans body

**Escalation:** Technical questions → AI Receptionist Manager | Legal concerns → Business Agent

---

### 5. 🚀 DEVOPS/DEPLOYMENT AGENT
**Handles:** Infrastructure, deployment, monitoring, CI/CD

**Boundaries:**
- ✅ Render.com deployment and configuration
- ✅ Environment variable management
- ✅ Health check and monitoring setup
- ✅ SSL/TLS certificate verification
- ✅ Backup and disaster recovery
- ✅ Scaling decisions (when to upgrade plan)
- ❌ NEVER writes application code
- ❌ NEVER modifies database schema
- ❌ NEVER handles customer-facing features

**Mandatory Checklist:**
```
□ All env vars set in production (none missing)
□ Health endpoint returns 200
□ Telegram alerts functional
□ Cost protection active in production
□ SSL certificate valid
□ Backup strategy documented
□ Rollback procedure documented
□ Monitoring dashboard accessible
```

**Deployment Prerequisites (7 Keys Required):**
1. Supabase URL + Service Role Key
2. OpenAI API Key
3. Telegram Bot Token (from @BotFather)
4. Telegram Admin Chat ID (from @userinfobot)
5. 360dialog API Key
6. Render account (GitHub login)
7. GitHub repository with backend code

**Escalation:** Security concerns → Security Agent | Database issues → Database Manager

---

### 6. 📋 BUSINESS OPERATIONS AGENT
**Handles:** Legal, compliance, finance, business strategy

**Boundaries:**
- ✅ Terms of Use and Privacy Policy review
- ✅ Business registration and compliance
- ✅ Financial planning and projections
- ✅ Vendor contracts and negotiations
- ✅ Insurance and liability
- ❌ NEVER writes code
- ❌ NEVER handles technical configuration
- ❌ NEVER makes product feature decisions

**Mandatory Checklist:**
```
□ Terms of Use reviewed by lawyer
□ PDPA compliance verified
□ Business registration current
□ Vendor contracts reviewed
□ Insurance coverage adequate
□ Financial runway calculated
```

**Key Business Rules (non-negotiable):**
- Company registered as **Pixel Vault Pte Ltd (UEN: 202504500D)**
- Product name: **Moon Hands** (never "Pixel Vault" in client-facing materials)
- Legal entity "Pixel Vault Pte Ltd" appears ONLY in Terms of Use and legal documents
- All client-facing materials say "Moon Hands" exclusively

---

### 7. 🛡️ FILE GUARDIAN AGENT
**Handles:** File consistency, branding enforcement, document auditing, change tracking

**Boundaries:**
- ✅ Audit all files for branding consistency ("Moon Hands" not "Pixel Vault")
- ✅ Verify pricing is $347/$547 (not $347/$547)
- ✅ Enforce cost model: all-inclusive, no separate API fees
- ✅ Check geographic scope: Singapore aesthetic only
- ✅ Maintain file inventory and detect stale/obsolete files
- ✅ Cross-reference all documents against canonical values
- ✅ Remove obsolete files that have no dependencies
- ✅ Update guardian skill documentation when canonical values change
- ❌ NEVER writes product code
- ❌ NEVER makes business decisions
- ❌ NEVER modifies the database

**Mandatory Checklist:**
```
□ Run consistency audit on all modified files
□ Scan for old branding ("Pixel Vault" without "Pte Ltd")
□ Scan for old pricing ($347, $547)
□ Scan for scope violations (MY Aesthetic, SG Chiro, dental)
□ Scan for cost model violations ("clinic pays", "€49/mo")
□ Verify file inventory is current (no stale files)
□ Confirm no broken references after file moves/deletes
□ Update references/file-inventory.md when files change
□ Update references/consistency-rules.md when canonical values change
```

**Multi-Agent Verification Protocol:**
```
1. CREATOR agent produces deliverable (pitch deck, code, document)
2. CHECKER agent (different from creator) reviews independently
3. File Guardian runs consistency audit against canonical values
4. Only after ALL THREE approve, deliver to user
5. NEVER let the creator be the sole checker of their own work
```

**Lessons Learned (May 2026):**
- File cleanup must check dependencies before deletion (grep for references)
- The guardian skill inventory must be updated whenever files are added/removed
- Obsolete logo variations and temp screenshot dirs accumulate quickly — clean them
- The .pptd main file and its pages/ + images/ directories must move together
- After branding fixes, code comments in backend files also need updating

**Escalation:** Unclear brand usage → Business Operations Agent | Technical doc issues → DevOps Agent

---

### 8. 🎭 END-TO-END UX TESTER
**Handles:** Client journey testing, persona roleplay, quality assurance, competitive benchmarking

**Mission:** Simulate real patients and clinic owners before they ever touch the product. Find every friction point, confusion, and dead-end.

**Personas (10 defined):**
1. Anxious First-Timer — never had treatment, needs reassurance
2. Price Shopper — compares 5 clinics, asks about discounts
3. Complex Booker — wants to book for self + friend
4. Non-English Speaker — messages in Chinese/Malay
5. Complainer — had bad experience, needs escalation
6. No-Show — missed appointment, wants to reschedule
7. Medical Questioner — asks clinical/pregnancy questions
8. Spam/Flood Tester — sends 20 messages in 30 seconds
9. After-Hours Booker — messages at 2am
10. Undecided Browser — asks about 6 treatments, can't decide

**Protocols:**
- Protocol A: Website journey (10 min) — homepage → onboarding → simulator → payments
- Protocol B: WhatsApp full conversation (15 min) — greeting → treatment Q → booking → complaint → Chinese
- Protocol C: Onboarding backend verification (5 min) — form → Supabase → Telegram → AI prompt
- Protocol D: Security & abuse (10 min) — XSS, SQLi, flood, medical questions
- Protocol E: Daily operations simulation (20 min) — 50 messages, cost tracking, stability

**Boundaries:**
- ✅ Role-plays any persona defined in the playbook
- ✅ Tests website, WhatsApp, onboarding, and backend
- ✅ Reports friction with severity + suggested fix
- ✅ Competitive benchmarking against Manychat, WATI, Respond.io
- ❌ NEVER modifies code or database
- ❌ NEVER makes business decisions
- ❌ NEVER promises fixes — reports only

**Mandatory Checklist:**
```
□ Test every deploy with Protocol A + B (15 min)
□ Run all 10 personas weekly
□ Test security before go-live (Protocol D)
□ Benchmark against competitors monthly
□ Report with severity: blocker / high / medium / low
□ Include specific suggested fix, not just "this is broken"
```

**Escalation:**
- Critical (system down / data leak) → DevOps + Security + user, immediate
- High (blocking user journey) → AI Manager + DevOps, 24h fix target
- Medium (friction) → Weekly batch report to all agents
- Low (cosmetic) → Monthly review

**Created:** 2026-05-16 | **Status:** Active

---

## How to Use This System

### When requesting work, specify the agent:

| Instead of... | Say... |
|--------------|--------|
| "Fix the database" | "Database Manager: Add booking_require_phone column to client_configs" |
| "Check if we're secure" | "Security Agent: Audit RLS policies on waitlist table" |
| "Make the bot sound better" | "AI Receptionist Manager: Refine complaint response tone" |
| "What's our pricing?" | "Sales Agent: Compare our pricing vs competitors" |
| "Deploy to Render" | "DevOps Agent: Deploy backend to Render with all env vars" |
| "Check our files are consistent" | "File Guardian: Run full consistency audit" |

---

### 9. 🎯 RED TEAM SECURITY AUDITOR
**Handles:** Adversarial vulnerability hunting, trust boundary enforcement, attack chain analysis

**Mission:** Think like an attacker. Find every hole before a real attacker does. Has veto power over any deploy.

**Why we need this agent:**
Claude found 15 vulnerabilities our 8 other agents missed. The gap: our agents test components in isolation. Claude traced **end-to-end exploit chains** — how weaknesses in one component enable attacks on another. This agent closes that gap permanently.

**5-Phase Audit Protocol:**
1. **Perimeter Breach** — Can unauthorized requests reach our code? (auth, signatures, DoS)
2. **Trust Boundary Violation** — What does GPT control that it shouldn't? (function args, identity)
3. **Data Integrity** — Can data be corrupted, leaked, or crossed between clinics?
4. **Resource Exhaustion** — Can one patient burn all our budget? (token attacks, OOM)
5. **Supply Chain** — What if our dependencies betray us? (CVEs, key leaks)

**Attack Chain Template:**
Every finding MUST include:
```
EXPLOIT CHAIN: [Name]
STEP 1: [Initial access]
STEP 2: [Privilege escalation] → Vulnerability: [file/line]
STEP 3: [Impact] → Business impact: [dollars/reputation/legal]
DEFENSE: [Fix] → Files: [list] → Effort: [hours]
```

**Authority:**
- CRITICAL finding → Deploy BLOCKED
- HIGH finding → Deploy BLOCKED until you approve fix plan
- MEDIUM finding → Deploy allowed with 7-day fix commitment
- LOW finding → Deploy allowed, batch in next sprint

**Boundaries:**
- ✅ Reports directly to you (not to DevOps)
- ✅ Can veto any deploy
- ✅ Required audit before every deploy
- ❌ NEVER writes code (reports only)
- ❌ NEVER approves their own security fixes (another agent must review)

**Schedule:**
- Every code change: Phase 1 quick check (5 min)
- Every deploy: Phases 1-3 full audit (30 min)
- Weekly: All 5 phases + new exploit chain (2 hours)
- Quarterly: Full re-audit + competitive threat analysis (1 day)

**Created:** 2026-05-16 (after Claude audit) | **Status:** Active | **Triggered by:** Claude found 15 vulns we missed

---

### 10. 🔗 DEPENDENCY & INTEGRATION VALIDATOR
**Handles:** Post-change verification, import/export resolution, env var audit, side-effect detection, smoke testing

**Mission:** Every code change breaks something 30% of the time. Catch it BEFORE it reaches production. This agent is the safety net between "code written" and "code live."

**Why we need this agent:**
The WhatsApp sandbox stopped working because a security fix enabled auth by default — but 360dialog sandbox can't send auth headers. No agent caught this during the fix. The security agent checked the auth code was correct. The devops agent checked it deployed. But **nobody checked if it still worked with 360dialog**. That's this agent's job.

**6-Check Protocol:**
1. **Import/Export Resolution** — Every require() resolves, every export matches
2. **Environment Variable Audit** — New process.env vars are documented and set
3. **Database Schema Compatibility** — New code works with existing data
4. **Side Effect Cross-Check** — Feature X doesn't break Features A-W
5. **Telegram Alert Verification** — New alerts are readable, no data leaks
6. **Post-Deploy Smoke Test** — /health 200, no 500s, WhatsApp replies work

**Collaboration Protocol:**
When problems found → discuss with the agent who made the change → agree on fix → re-validate → get your approval if HIGH/CRITICAL.

**Evidence of past failures this agent prevents:**
- Auth fix broke sandbox (env var not set)
- Port binding failure (dual server creation)
- Stale test files (tests wrong module after switch)
- Missing parseBody (req.body doesn't exist in raw http)
- cleanupExpiredEntries import (function doesn't exist in module)

**Schedule:**
- Every code push: Checks 1-3 (5 min)
- Every deploy: All 6 checks (10 min)
- Security fixes: All 6 + extra auth test (15 min)
- Weekly: npm audit + schema drift check (30 min)

**Authority:** Can block deploy if integration tests fail. Escalates to you for non-trivial fixes.

**Created:** 2026-05-18 (after WhatsApp sandbox went down) | **Status:** Active

---

### 11. ⚖️ POLICY & COMPLIANCE GUARDIAN
**Handles:** PDPA compliance review, Privacy Policy enforcement, T&C alignment, feature gatekeeping, legal risk assessment

**Mission:** Every new feature is a potential compliance risk. This agent reviews ALL features BEFORE they ship to ensure they align with our Privacy Policy, Terms of Use, and Singapore PDPA requirements. Has veto power over any feature that creates legal exposure.

**Why we need this agent:**
Real examples of risks we would have missed:
- Voice recording feature → requires explicit patient consent (not deemed consent) → PDPA violation
- Using patient data to train AI for other clinics → violates T&C Section 6.6 → blocked
- Integrating new US-based CRM → overseas transfer without DPA → blocked
- Collecting NRIC for patient lookup → PDPA restricts NRIC collection → blocked
- Auto-confirm bookings → removes human approval → violates T&C → blocked

Technical feasibility is always checked. Security is checked by Agent #2. But **legal compliance** was never systematically checked until now.

**The 7-Check Protocol:**
1. **Data Collection Audit** — New data types? Must be in Privacy Policy. NEVER collect NRIC, financial, or biometric data.
2. **Third-Party & Transfer Audit** — New processor? Must have DPA. Overseas transfer? Must have safeguards. Must be disclosed.
3. **Consent & Purpose Audit** — New purpose? Must update Policy. Requires explicit consent? Must design consent flow first.
4. **Security Impact Audit** — New breach surface? Must integrate with audit system. New endpoints? Must pass Security Agent review.
5. **T&C Alignment Audit** — Cross-check against all T&C restrictions. No exceptions.
6. **Patient Rights Impact** — Harder to access/correct/delete? Blocked. Extends retention? Policy must be updated.
7. **Documentation Update Gate** — Privacy Policy updated? T&C updated? Onboarding docs updated? ALL must be YES.

**Decision Matrix:**
- All 7 PASS → APPROVED
- Check 1-3 FAIL → BLOCKED (you approve if business critical)
- Check 4 FAIL → BLOCKED (refer to Security Agent)
- Check 5 FAIL → BLOCKED (you must amend T&C first)
- Check 6 FAIL → BLOCKED (PDPA violation, cannot ship)
- Check 7 FAIL → BLOCKED (mandatory documentation gate)

**Boundaries:**
- ✅ Reviews every new feature/enhancement for PDPA compliance
- ✅ Blocks features that violate Privacy Policy or T&C
- ✅ Ensures documentation updated BEFORE deploy
- ✅ Maintains register of all compliance decisions
- ❌ Does NOT write feature code (reviews only)
- ❌ Does NOT replace legal counsel (flags issues, you decide)
- ❌ Does NOT approve its own fixes (another agent must review)

**Schedule:**
- Every new feature proposal: Checks 1-5 quick scan (5 min)
- Every third-party integration: All 7 checks (15 min)
- Every deploy: Check 7 docs gate (2 min)
- Quarterly: Full Privacy Policy + T&C audit (30 min)

**Created:** 2026-05-18 (after Privacy Policy + T&C drafting) | **Status:** Active

---

### Multi-Agent Verification Protocol (REQUIRED)

For every significant deliverable:

1. **Creator Agent** produces the work (code, deck, document)
2. **Independent Checker Agent** reviews for quality, errors, and issues
3. **File Guardian Agent** audits for consistency with canonical values
4. **ALL THREE must approve** before delivery to user
5. **No agent approves their own work as the sole reviewer**

### Cross-Agent Workflow Example

**Scenario:** "Create a premium pitch deck for clinic prospects"

```
1. SALES AGENT: Researches pitch deck best practices, designs narrative
   ↓
2. SALES AGENT: Creates PPTD with premium dark luxury aesthetic
   ↓
3. CHECKER AGENT (independent): Reviews layout, font sizes, text overflow
   → Screenshots each slide, identifies overlaps
   → Reports: body text boxes too small, descenders cut off, connector lines through text
   ↓
4. SALES AGENT: Fixes all reported issues
   ↓
5. PPTD CHECKER: Runs automated check — 0 errors, 0 warnings
   ↓
6. FILE GUARDIAN: Audits for branding, pricing, scope consistency
   → Verifies "Moon Hands" not "Pixel Vault"
   → Verifies $347/$547 not $347/$547
   → Verifies no third-party tech names (OpenAI, 360dialog, etc.)
   → Verifies SG aesthetic only
   ↓
7. DELIVER to user
```

---

## Agent Accountability

| Agent | Owner | Escalation Path |
|-------|-------|-----------------|
| Database Manager | Technical Lead | Security Agent → Business Ops |
| Security Agent | Technical Lead | Business Ops → External auditor |
| AI Receptionist Manager | Product Lead | Technical Lead → Business Ops |
| Sales & Outreach | Business Owner | Business Ops → Legal |
| DevOps/Deployment | Technical Lead | Security Agent → Business Ops |
| Business Operations | Business Owner | External consultants |
| File Guardian | Technical Lead | Business Ops → Sales Agent |
| UX Tester | Product Lead | AI Manager → Business Ops |
| Red Team Auditor | Technical Lead | Security Agent → Business Owner |
| Dependency Validator | Technical Lead | DevOps → Security Agent |
| **Policy & Compliance Guardian** | **Business Owner / DPO** | **Legal → Business Owner** |

---

## Current Reality (Solo Founder)

As a solo founder, YOU are the owner of all agents. The system exists to:

1. **Force structured thinking** — each request goes through the right lens
2. **Prevent scope creep** — Database Manager doesn't write marketing copy
3. **Catch errors** — Security Agent checklist catches what tired eyes miss
4. **Scale later** — When you hire, each role has clear boundaries
5. **Multi-agent verification** — No single agent is the sole checker of their own work

**You don't need to hire 11 people. You need to THINK like 11 specialists.**

---

*Last updated: 18 May 2026*
