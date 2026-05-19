# Moon Hands — Multi-Agent Strategic Meeting
## Date: 16 May 2026 | Attendees: All 7 Staff Agents

---

## MINUTES

**Chair:** Business Operations Agent  
**Secretary:** File Guardian Agent  
**Status:** LIVE — Render deployment in progress

---

# AGENDA 1: SECURITY ASSESSMENT
### Lead: 🔒 Security Agent

### What's Working ✅
| Layer | Status | Details |
|-------|--------|---------|
| DDoS protection (IP-based) | ✅ Active | 100 req/min per IP |
| Input sanitization | ✅ Active | XSS/injection stripping on every message |
| Loop detection | ✅ Active | Prevents infinite bot↔bot loops |
| Smart rate limiting | ✅ Active (just deployed) | 3-layer: repeat, flood, hourly |
| Cost protection kill switch | ✅ Active | /KILL and /RESUME commands |
| Prompt injection blocking | ✅ Active | Security middleware on every message |
| Request size limits | ✅ Active | 10KB max body |
| Telegram admin alerts | ✅ Active | Rate limit + cost alerts just wired |

### What's NOT Working ❌
| Gap | Risk Level | Detail |
|-----|-----------|--------|
| Per-clinic cost ceilings | ⚠️ Code deployed but untested | `checkLimit` + `trackSpend` wired for first time. May have bugs. |
| RLS policies | ⚠️ Enabled in schema but NOT enforced | `service_role` key bypasses ALL RLS. Need to switch to `anon` key for client reads. |
| Webhook signature verification | ⚠️ Code exists but 360dialog doesn't send signatures | HMAC check never actually runs. We rely on API key auth instead. |
| API key auth | ⚠️ Optional for sandbox | Currently `if (API_KEY && !checkAuth)` — sandbox works but production must enforce. |
| SSL/TLS | ✅ Render handles | Automatic on Render. No action needed. |

### Security Agent's Verdict
> "We're at 7/10. The 12-layer protection exists in code. But two critical gaps:
> 1. **RLS is theatre** — `service_role` key bypasses everything. Until we use `anon` key + proper policies, any Supabase leak exposes all clinic data.
> 2. **Cost protection is untested** — first time live. If `trackSpend` double-counts or `checkLimit` false-positives, we either burn budget or block legitimate patients.
> 
> **Recommendation:** Before first clinic goes live, run a 24-hour stress test on cost protection with synthetic traffic."

---

# AGENDA 2: LEGAL & COMPLIANCE
### Lead: 📋 Business Operations Agent

### Current State
| Document | Status | Issue |
|----------|--------|-------|
| TERMS_OF_USE_CLIENT.md | ✅ Updated | Prepaid, no refunds, Moon Hands branded |
| TERMS_AND_CONDITIONS.md | ⚠️ Superseded | Still exists. Should archive to avoid confusion. |
| PDPA compliance | ⚠️ Partial | Terms mention PDPA. No formal privacy policy document. |
| Business registration | ✅ Verified | Pixel Vault Pte Ltd, UEN 202504500D |
| Data retention | ✅ Documented | 90 days retention, 30 days export window |
| Payment terms | ✅ Updated | Prepaid, 7-day suspension, 14-day termination |
| Overage policy | ✅ Internal-only | Vague external terms protect us. 50% grace kept internal. |

### Legal Risks Identified
1. **No Privacy Policy** — Singapore PDPA requires a standalone privacy policy. We only have Terms of Use. Risk: complaint to PDPC.
2. **Two Terms documents** — Old `TERMS_AND_CONDITIONS.md` still in repo. Client could reference wrong one. Risk: contract dispute.
3. **No data processing agreement (DPA)** — For clinics sharing patient data. Required under PDPA for business users. Risk: clinic refuses to sign without it.
4. **WhatsApp Business API compliance** — Meta's Business Messaging Policy requires opt-in consent. Our bot doesn't verify patient consent before messaging. Risk: Meta account suspension.
5. **No service level agreement (SLA)** — We claim 99.5% uptime in docs but no formal SLA with credits. Risk: client demands compensation during outage.

### Business Operations Agent's Verdict
> "Legal is 5/10. We have the basics but PDPA compliance has gaps. Before going live:
> 1. Write a proper Privacy Policy (1 day)
> 2. Archive old Terms document (15 min)
> 3. Create a simple DPA template (2 hours)
> 4. Add patient consent verification to AI responses (e.g., 'Reply STOP to opt out')
> 
> The 50% grace period being internal-only is the right call. Competitive advantage without creating client entitlement."

---

# AGENDA 3: PRODUCTION READINESS
### Lead: 🚀 DevOps Agent + 🤖 AI Receptionist Manager

### Infrastructure Status
| Component | Status | Notes |
|-----------|--------|-------|
| Render deployment | 🔄 IN PROGRESS | Commit `b36ce11` deploying now |
| Render tier | ⚠️ FREE | Sleeps after 15 min. Must upgrade to Starter ($7/mo) for production. |
| Supabase | ✅ Active | Free tier, 500MB. Sufficient for first 10 clinics. |
| OpenAI API | ✅ Active | Key set. gpt-4o-mini model. |
| 360dialog sandbox | ✅ Working | Test messages replying successfully. |
| 360dialog production | ❌ NOT APPLIED | Still on sandbox. Need business verification for production. |
| Telegram bot | ✅ Active | Admin alerts working. 409 conflict handled. |

### AI Receptionist Quality Assessment
| Capability | Score | Evidence |
|------------|-------|----------|
| Basic FAQ responses | 8/10 | Handles treatment questions well from config |
| Booking requests | 6/10 | Suggests slots but doesn't create real bookings (no calendar yet) |
| Multi-language | 5/10 | System prompt supports it but not tested with Chinese/Malay input |
| Tone calibration | 7/10 | 4 tones selectable but not tested in live conversations |
| Price quoting | 8/10 | Reads directly from clinic config — accurate |
| Complaint handling | 4/10 | Generic empathy response. No escalation pathway to human. |
| Medical question refusal | 9/10 | "Consult your doctor" fallback works consistently |
| Context memory | 7/10 | 10-turn memory with 30-min TTL. Adequate for most conversations. |
| **OVERALL AI QUALITY** | **6.5/10** | Good for basic receptionist. Not yet sophisticated enough for complex scenarios. |

### What Happens If Render Deploy Fails?
**DevOps Agent contingency:**
1. Check Render logs for the specific error
2. Most likely causes: (a) missing `smart-rate-limiter.js` import, (b) `sendAdminAlert` async not awaited, (c) cost-protection circular dependency
3. Fix, commit, push. Render auto-deploys.
4. If Render is unstable, fall back to previous commit `e605199` and hot-fix.

### DevOps + AI Manager Verdict
> "Infrastructure: 6/10. AI: 6.5/10. Combined: 6/10.
>
> **Blockers before first clinic:**
> 1. **Upgrade Render to Starter** ($7/mo) — non-negotiable. Free tier sleeping = missed patient messages.
> 2. **Apply for 360dialog production** — sandbox has limitations (message caps, no custom headers). Production needed for real clinic volume.
> 3. **Test smart-rate-limiter live** — verify warm responses, verify Telegram alerts fire.
> 4. **Run 20-conversation test suite** — verify AI handles edge cases (complaints, medical questions, Chinese input).
>
> **Not blockers but should do in Week 1:**
> - Privacy Policy
> - DPA template
> - Real dashboard (not demo data)"

---

# AGENDA 4: ONBOARDING WITHOUT A KNOWN TRIAL USER
### Lead: 💼 Sales & Outreach Agent

### The Challenge
We don't have a friendly clinic ready to pilot. We need to find and close our first client cold. How?

### Option A: Direct Outreach (Recommended)
**Timeline: 1-2 weeks to first conversation**
1. **Target list:** Build a list of 50 aesthetic clinics in Singapore (Orchard, Novena, Bugis clusters)
2. **Method:** WhatsApp message to clinic's business number
3. **Script:** "Hi, I'm [Name] from Moon Hands. We help aesthetic clinics like yours automate patient inquiries on WhatsApp — instant replies 24/7 for common questions about treatments, pricing, and bookings. Would you be open to a 14-day free trial with no commitment?"
4. **Follow-up:** 3-message sequence over 7 days
5. **Close:** Onboarding form → manual setup → go live

**Pros:** Fast, direct feedback, real patient interactions immediately
**Cons:** Rejection rate high (~5-10% response rate), manual setup for each

### Option B: Network Leverage
**Timeline: 1-3 weeks**
1. Ask friends/family if they know any clinic owners
2. LinkedIn outreach to clinic managers
3. Attend aesthetic industry events (if any upcoming)
4. Partner with 360dialog — they have clinic relationships, could introduce us

**Pros:** Warmer introduction, higher conversion
**Cons:** Depends on network strength, timing uncertain

### Option C: Self-Pilot (Our Own Number)
**Timeline: Immediate**
1. Use YOUR personal WhatsApp Business number as the first "clinic"
2. Configure it with demo treatments and hours
3. Send test messages from a friend's phone
4. Verify end-to-end: message → AI response → booking request
5. Document the experience, use as demo for prospects

**Pros:** Zero risk, immediate feedback, controlled environment
**Cons:** Not real patient interactions, but validates the flow

### Option D: Partnership with Clinic Aggregator
**Timeline: 2-4 weeks**
1. Partner with platforms like DoctorXDentist, HealthHub, or similar
2. Offer revenue share for referrals
3. They introduce us to clinics in their network

**Pros:** Scale, credibility by association
**Cons:** Negotiation time, revenue share eats margins

### Sales Agent's Recommendation
> "Do ALL of them simultaneously. Start with Option C TODAY — configure your own number and test. In parallel, start Option A outreach to 50 clinics this week. Begin Option B network conversations. Keep Option D as a Phase 2 strategy.
>
> **The first clinic doesn't need to be perfect.** It needs to be REAL. A real clinic with real patients asking real questions. That's when we learn what actually breaks."

---

# AGENDA 5: CROSS-AGENT READINESS SCORECARD

| Dimension | Score | Blockers | Next Action |
|-----------|-------|----------|-------------|
| **Security** | 7/10 | RLS bypass, cost protection untested | Stress test cost protection for 24h |
| **Legal** | 5/10 | No Privacy Policy, no DPA, two Terms docs | Write Privacy Policy, archive old Terms |
| **Infrastructure** | 6/10 | Free Render tier, 360dialog sandbox only | Upgrade Render, apply for production |
| **AI Quality** | 6.5/10 | No real-world testing, no complaint escalation | 20-conversation test suite |
| **Onboarding** | 7/10 | Form is complete, but 9 manual steps remain | Self-pilot today, cold outreach this week |
| **Sales Materials** | 7/10 | Website complete, simulator works, deck exists | Remove "Pixel Vault" from any remaining materials |
| **OVERALL** | **6.5/10** | **3 blockers, 5 gaps** | **See 72-hour action plan below** |

---

# THE 72-HOUR ACTION PLAN

### Day 1 (Today) — Validate & Test
| # | Action | Owner | Time |
|---|--------|-------|------|
| 1 | Monitor Render deployment, fix any errors | DevOps Agent | Now |
| 2 | Self-pilot: configure YOUR WhatsApp as demo clinic | AI Manager | 1 hour |
| 3 | Run 20-conversation test suite | AI Manager | 2 hours |
| 4 | Write Privacy Policy document | Business Ops Agent | 3 hours |
| 5 | Build target list of 50 aesthetic clinics | Sales Agent | 2 hours |

### Day 2 — Outreach & Fixes
| # | Action | Owner | Time |
|---|--------|-------|------|
| 6 | Upgrade Render to Starter ($7/mo) | DevOps Agent | 15 min |
| 7 | Archive old TERMS_AND_CONDITIONS.md | File Guardian | 15 min |
| 8 | Create DPA template | Business Ops Agent | 2 hours |
| 9 | Send first 10 WhatsApp outreach messages | Sales Agent | 1 hour |
| 10 | Fix any issues from self-pilot | AI Manager | 2 hours |

### Day 3 — Production
| # | Action | Owner | Time |
|---|--------|-------|------|
| 11 | Apply for 360dialog production account | DevOps Agent | 30 min |
| 12 | Stress test cost protection (synthetic traffic) | Security Agent | 2 hours |
| 13 | Follow up on outreach responses | Sales Agent | 1 hour |
| 14 | Update File Guardian with new canonical values | File Guardian | 30 min |
| 15 | **GO/NO-GO decision for first real clinic** | YOU | — |

---

# AGENT CONSENSUS

**All 7 agents agree:**

> "We are at 6.5/10. The product works. The website works. The AI responds. But we have not yet validated the full stack under real load with a real clinic.
>
> **The only way to get from 6.5 to 9 is to put a real clinic live and learn.**
>
> We recommend a 72-hour sprint to close the 3 blockers (Render upgrade, Privacy Policy, cost protection test), then go live with the first clinic immediately after.
>
> **Do not wait for perfection. Wait for 'good enough to learn from.'"

---

*Meeting convened by Business Operations Agent*  
*Minutes recorded by File Guardian Agent*  
*Security, DevOps, AI Manager, Sales, Database Manager agents present*  
*Render deployment status: b36ce11 deploying — all agents monitoring*
