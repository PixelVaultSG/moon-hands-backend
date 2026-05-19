# Moon Hands — Prompt #5: Build Your MVP in 2 Weeks
**YC Startup Evaluation | All 6 Staff Agents Review**
**Date:** 25 April 2026

---

## THE CORE ASSUMPTION

**What must be TRUE for this business to work?**

> "Aesthetic clinics in Singapore will pay $347/mo for an AI WhatsApp receptionist that can answer common questions AND create real appointments in their system, because it saves them 2-3 hours/day and prevents lost revenue from missed after-hours inquiries."

**If this assumption is wrong, the business dies.** No amount of features, branding, or marketing can save a product no one pays for.

**How we validate it:**
1. Deploy the bot (Render + OpenAI + 360dialog)
2. Get 3 pilot clinics to use it for 30 days
3. Measure: conversations handled, appointments booked, time saved, clinic satisfaction
4. If 2/3 pilots renew at full price → assumption validated
5. If 0/3 renew → assumption wrong, pivot or die

---

## THE RUTHLESS CUT: What Gets CUT vs. What Stays

### WHAT STAYS (Core MVP — Must Have)

| Feature | Why It's Essential |
|---------|-------------------|
| **WhatsApp webhook receiving messages** | The entire product is WhatsApp-native. Without this, nothing works. |
| **Smart router ($0 responses)** | 60-70% of queries = hours, pricing, services. If these don't work, API costs explode. |
| **OpenAI fallback** | Complex queries need AI. Without it, bot breaks on anything non-trivial. |
| **create_booking function** | Must create REAL appointments in Supabase. If this is fake, clinic sees no value. |
| **cancel_booking function** | Patients WILL ask to cancel. Without this, bot is useless. |
| **check_availability function** | Must show real slots. Without this, can't book. |
| **Supabase database** | All data lives here. Without it, no persistence, no multi-tenancy. |
| **Per-clinic configuration** | Each clinic has different hours, services, pricing. Without this, bot gives wrong answers. |
| **Basic security (API key, rate limit, input sanitization)** | Without this, bot gets abused or hacked on day 1. |
| **Telegram admin alerts** | We need to know when bookings happen, when errors occur. Without this, we fly blind. |

### WHAT GETS CUT (Post-MVP — Nice to Have)

| Feature | Why It Gets Cut |
|---------|----------------|
| **Google Calendar sync** | Clinics can manually export from Supabase. Nice but not essential for validation. |
| **Voice AI (VAPI.ai)** | Professional tier feature. Not needed for core assumption test. |
| **Instagram DM integration** | Only 15-20% of inquiries. WhatsApp first, channels later. |
| **Advanced upsell expert** | Revenue optimization, not core functionality. Add after clinics are retained. |
| **Patient feedback collection** | Post-visit survey. Nice for retention, not for acquisition. |
| **Multi-language (Malay, Tamil)** | English + Chinese covers 90% of Singapore. Add if clinic requests. |
| **Detailed analytics dashboard** | Clinics don't need dashboards until month 3+. Basic metrics in Telegram suffice. |
| **Stripe/PayNow billing** | Manual invoicing for first 10 clinics. Billing automation at 20+ clinics. |
| **Advanced RLS policies** | Service_role only is sufficient for first 10. Granular policies at scale. |
| **Redis for distributed rate limiting** | In-memory is fine for <50 clinics. Upgrade when needed. |
| **Staging environment** | Test in production with demo clinics first. Separate staging at 5+ clinics. |
| **CI/CD pipeline** | Manual deploy to Render is fine for solo founder. CI/CD when team grows. |
| **Automated email sequences** | Manual follow-up for first 10. Automation at 20+. |
| **Slack/Teams integration** | Telegram is sufficient for admin alerts. |
| **Referral tracking system** | Track in spreadsheet/Airtable for first 10. Build into app at 20+. |
| **Public API** | No external integrations needed yet. |
| **Custom domain per clinic** | moon-hands.sg/clinic-name is fine. White-label at enterprise tier. |
| **EMR integration** | Way too complex for MVP. Export CSV if clinic needs it. |

---

## THE 2-WEEK SPRINT PLAN

### Week 1: Core Infrastructure

| Day | Task | Agent Owner |
|-----|------|-------------|
| **Day 1** | Deploy to Render Starter | DevOps |
| **Day 1** | Set all env vars (API keys, Supabase, Telegram) | DevOps |
| **Day 2** | Test /health endpoint | DevOps |
| **Day 2** | Test Telegram bot /pending command | AI Receptionist Manager |
| **Day 3** | Wire 8 functions to real Supabase | Database Manager |
| **Day 3** | Test create_booking with real data | AI Receptionist Manager |
| **Day 4** | Test smart router (20 conversation scenarios) | AI Receptionist Manager |
| **Day 4** | Test OpenAI fallback (10 complex scenarios) | AI Receptionist Manager |
| **Day 5** | Security audit: check env vars, RLS, fallbacks | Security Agent |
| **Day 5** | Cost protection stress test | Security Agent |
| **Day 6** | End-to-end test: WhatsApp message → bot response → Supabase record | All agents |
| **Day 7** | Fix bugs from Week 1 testing | All agents |

### Week 2: Pilot Readiness

| Day | Task | Agent Owner |
|-----|------|-------------|
| **Day 8** | Create demo clinic config (5 treatments, realistic hours) | Sales & Outreach |
| **Day 8** | Record 2-minute Loom demo video | Sales & Outreach |
| **Day 9** | Create onboarding form (simplified: 3 steps max) | Database Manager |
| **Day 9** | Test onboarding → Supabase → Telegram alert flow | DevOps |
| **Day 10** | Create founding partner offer ($174/mo for 3 months) | Business Operations |
| **Day 10** | Write Terms of Use + Privacy Policy (draft) | Business Operations |
| **Day 11** | Prepare 10 warm outreach messages | Sales & Outreach |
| **Day 11** | Create "Data Security & PDPA" one-pager | Security Agent |
| **Day 12** | Identify 20 target clinics (Instagram + Google Maps) | Sales & Outreach |
| **Day 13** | Send first 5 warm outreach messages | Sales & Outreach |
| **Day 14** | Review Week 2 results, plan Week 3 | All agents |

---

## AGENT CONCERNS ABOUT THE CUT LIST

| Agent | Concern | Resolution |
|-------|---------|------------|
| **Database Manager** | "Cutting Google Calendar sync means clinics need manual export." | Acceptable for first 3 pilots. Add Calendar sync as Phase 2 commitment if pilots demand it. |
| **Security Agent** | "Cutting advanced RLS means one bug could expose all clinic data." | Service_role + zero policies on sensitive tables is sufficient for <10 clinics. Add policies at 10+. |
| **AI Receptionist Manager** | "Cutting multi-expert composition means responses might feel robotic for complex queries." | Generalist fallback handles 95% of cases. Add expert system if pilot feedback demands it. |
| **Sales & Outreach** | "Cutting Stripe means manual invoicing. That's friction." | Manual invoicing for 3 pilots is fine. Stripe at month 2 if pilots convert. |
| **DevOps** | "Cutting staging environment means testing in production." | Use demo clinic data (synthetic patients) for testing. Real patient data only after contract signed. |
| **Business Operations** | "Cutting lawyer review means liability exposure." | Draft Terms of Use ourselves. Add "pending lawyer review" clause. Get lawyer review within 30 days of first paid clinic. |

---

## THE "IF WE ONLY HAD 3 DAYS" EMERGENCY CUT

If we had to launch in 3 days instead of 2 weeks, what stays?

| Feature | Cut or Keep? |
|---------|-------------|
| WhatsApp webhook | ✅ KEEP |
| Smart router | ✅ KEEP |
| OpenAI fallback | ✅ KEEP |
| create_booking | ✅ KEEP |
| cancel_booking | ✅ KEEP |
| check_availability | ✅ KEEP |
| Supabase + RLS | ✅ KEEP |
| Per-clinic config | ✅ KEEP |
| API key + basic security | ✅ KEEP |
| Telegram alerts | ✅ KEEP |
| Onboarding form | ✅ KEEP (but simplified to 2 steps) |
| Expert system | ❌ CUT (use generalist only) |
| Loop protection | ❌ CUT (add after first abuse incident) |
| Cost protection kill switch | ⚠️ MANUAL (watch dashboard, disable manually) |
| Reminder cron jobs | ❌ CUT (manual reminders via Telegram) |
| Multi-intent composition | ❌ CUT (handle one intent at a time) |
| Chinese language | ⚠️ KEEP basic patterns only |

**The 3-day MVP is bare bones but functional.** The 2-week MVP is significantly better.

---

## CONSENSUS DECISION

**All 6 agents approve the 2-week MVP scope.**

**Key agreements:**
1. Google Calendar sync = Phase 2 (post-pilot)
2. Voice AI = Phase 2 (Professional tier only)
3. Instagram DM = Phase 3 (post-10 clinics)
4. Stripe billing = Month 2 (manual invoicing for pilots)
5. Lawyer review = Within 30 days of first paid clinic
6. Expert system = Included (already built, no reason to cut)
7. Security layers = All 12 stay (too risky to cut)

**APPROVED: Proceed with 2-week MVP. Launch target = Day 14.**

---

*End of Prompt #5 — All 6 agents reviewed*
