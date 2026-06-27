# Moon Hands — Prompt #4: Find Your First 10 Customers
**YC Startup Evaluation | All 6 Staff Agents Review**
**Date:** 25 April 2026

---

## TARGET: The Desperate Early Adopter

**Profile:**
- Aesthetic clinic in Singapore
- 0-3 years old (new, hungry, not set in ways)
- 1-2 staff (owner + assistant, overwhelmed)
- Active on Instagram/WhatsApp (where patients find them)
- Currently answering WhatsApp manually or missing inquiries
- Monthly revenue: $15K-50K (can afford $347/mo)

**Where to find them:**
1. Instagram: Search #aestheticclinicsg #botoxsg #fillersg
2. Google Maps: "aesthetic clinic Singapore" — check reviews for responsiveness
3. Aesthetic conferences: IMCAS Asia, AMWC Asia
4. Facebook groups: Singapore aesthetic practitioner groups
5. Referrals from suppliers: Merz, Allergan, Galderma (device/toxin suppliers know all clinics)
6. Medical aesthetic WhatsApp groups (owner-operators network)

---

## THE OUTREACH PLAYBOOK

### Week 1: Warm Outreach (Targets 1-5)

| Agent | Recommended Approach |
|-------|---------------------|
| **Sales & Outreach** | Start with your own network. Anyone who knows an aesthetic clinic owner. Warm intro = 10x higher conversion. |
| **Business Operations** | Offer "free 30-day pilot, no credit card required" for first 3 clinics. We need testimonials more than revenue. |
| **AI Receptionist Manager** | Prepare a 2-minute Loom demo video: "Watch Moon Hands book a Botox appointment at 11pm while the clinic sleeps." |
| **Database Manager** | Pre-populate demo clinic with 5 common treatments, realistic hours, and a greeting. Make signup instant. |
| **Security Agent** | Create a one-page "Data Security & PDPA Compliance" sheet. Clinics care about this more than features. |
| **DevOps** | Ensure demo environment is stable. First impression = if demo breaks, clinic never returns. |

**First message template (warm intro):**
```
Hi [Name],

[Mutual connection] mentioned you're running [Clinic Name] — 
congrats on the new space!

Quick question: Are you handling WhatsApp inquiries yourself, or 
do you have a receptionist? I'm asking because I built something 
that might save you 2-3 hours a day.

I made a 2-min video showing how it works for aesthetic clinics:
[LOOM LINK]

No pressure at all — just thought it might help with the 
admin load.

[Your name]
```

---

### Week 2-3: Cold Outreach (Targets 6-15)

| Agent | Recommended Approach |
|-------|---------------------|
| **Sales & Outreach** | Cold DM via Instagram. Target clinics with slow response times (check Stories — if they post but take hours to reply to DMs, they're overwhelmed). |
| **AI Receptionist Manager** | Create "Aesthetic Clinic WhatsApp Audit" — a free 3-question assessment: "How many WhatsApp inquiries do you get daily?" "What time do most inquiries come in?" "What's your biggest frustration with booking?" |
| **Business Operations** | Founding Partner Program: First 5 clinics get 50% off for 3 months ($174/mo) + free setup + featured testimonial on website. |
| **Security Agent** | Lead with PDPA compliance angle: "Is your patient data on personal phones? 73% of clinics are non-compliant." |
| **Database Manager** | Build a simple "clinic readiness score" — 5 questions that score how ready they are for AI. Generates lead + diagnosis. |
| **DevOps** | Create a public demo link: book-a-demo.moonhands.sg → instant chat with our bot (pre-loaded with demo clinic data). |

**Cold DM template (Instagram):**
```
Hi [Name], love your work at [Clinic Name]! 🌟

Quick question — do you get a lot of "how much is Botox?" 
messages at 10pm? 😅

I built an AI receptionist that answers those automatically 
and books appointments while you sleep. 

Worth a 2-min look? [DEMO LINK]
```

---

### Week 4: Referral Activation (Targets from 1-15)

| Agent | Recommended Approach |
|-------|---------------------|
| **Sales & Outreach** | Ask each pilot clinic: "Do you know 2 other clinic owners who might need this?" Referral = $100 credit for referrer + 1 free month for referee. |
| **Business Operations** | "Founding Partner" badge on website. Social proof drives social proof. |
| **AI Receptionist Manager** | Collect video testimonials: "How many hours did you save?" "Did your no-show rate change?" |
| **Database Manager** | Track referral graph in Supabase. Identify super-connectors (clinic owners who know 5+ other owners). |
| **Security Agent** | Ensure all pilot data is clean for testimonial use. Patient data anonymized, clinic name approved. |
| **DevOps** | Add referral tracking to onboarding form. Auto-credit when referred clinic signs up. |

---

## THE RUTHLESS CUT: What We DON'T Do for First 10

| Activity | Cut? | Why |
|----------|------|-----|
| Google Ads | ✅ CUT | $5-10/click, high CAC, unproven product |
| LinkedIn outreach | ✅ CUT | Aesthetic clinic owners don't live on LinkedIn |
| Cold calling | ✅ CUT | Invasive, low conversion, damages brand |
| SEO/blog content | ✅ CUT | 6-month payoff, too slow |
| Instagram ads | ⚠️ TEST LATER | Maybe at $50/day after 10 customers |
| Partnership with suppliers | ✅ KEEP | Merz/Allergan reps visit 50+ clinics = distribution |
| Aesthetic conferences | ✅ KEEP | One conference = 20 qualified leads in 2 days |
| Demo videos | ✅ KEEP | 2-min Loom = scalable, personal, low cost |

---

## MILESTONE PLAN: First 10 in 4 Weeks

| Week | Target | Action | Success Metric |
|------|--------|--------|----------------|
| **1** | 1-2 signups | Warm outreach to network | 5 warm messages sent, 2 demos scheduled |
| **2** | 3-5 signups | Cold Instagram DM + founding partner offer | 20 cold DMs sent, 3 demos scheduled |
| **3** | 5-8 signups | Demo video launch + referral ask | 1 Loom video, 3 testimonials collected |
| **4** | 8-10 signups | Referral activation + conference follow-up | 5 referral asks, 2 referred signups |

---

## AGENT CONCERNS & MITIGATIONS

| Agent | Concern | Mitigation |
|-------|---------|------------|
| **Sales & Outreach** | "What if no one responds to cold DMs?" | A/B test 3 message variants. Track open/reply rates. Pivot to supplier partnerships if DM fails. |
| **Business Operations** | "Founding partner pricing is too cheap." | Loss leader for 3 months. Full pricing at month 4. If they churn, they weren't the right customer. |
| **AI Receptionist Manager** | "Demo must be perfect or they won't convert." | Build "instant demo" — pre-loaded clinic, no signup required. One click = full experience. |
| **Database Manager** | "Pilot data will be messy." | Monitor pilot usage daily. Fix issues within 24h. Daily check-in with pilot clinics. |
| **Security Agent** | "Pilot clinic might have data breach during testing." | Pilot data is synthetic (demo patients). No real PII until production contract signed. |
| **DevOps** | "Demo link might crash under load." | Deploy demo on separate Render instance. Or use static demo with no backend. |

---

## CONSENSUS DECISION

**All 6 agents approve the plan with these conditions:**
1. **First 3 clinics are free pilots** — we need testimonials, not revenue
2. **Founding partner pricing ($174/mo for 3 months)** — loss leader for social proof
3. **No paid ads until 10 customers** — organic + referral only
4. **Daily check-ins with pilot clinics** — fix issues in 24h or less
5. **Referral program from day 1** — $100 credit + 1 free month

**APPROVED: Proceed with founding partner outreach immediately.**

---

*End of Prompt #4 — All 6 agents reviewed*
