# Moon Hands — Code vs Document Audit Report
## Multi-Agent Analysis: 7 Conflicts, 3 Mismatches, 2 Gaps

**Date:** 2026-05-15  
**Auditors:** Security Agent, Business Ops Agent, DevOps Agent, AI Manager Agent  
**Scope:** 30+ source files, 15+ policy documents

---

# EXECUTIVE SUMMARY

| Category | Count | Severity |
|----------|-------|----------|
| **CRITICAL (breaks production)** | 1 | Pricing mismatch between website and sales docs |
| **HIGH (wrong defaults)** | 2 | Schema default contradicts onboarding; Two Terms docs conflict |
| **MEDIUM (not wired up)** | 3 | Grace period not in UI; Smart rate limiter unused; Cost protection partially wired |
| **LOW (cosmetic)** | 2 | Tone enum mismatch; RLS disabled in schema |

---

# 🔴 CONFLICT 1: PRICING — THE $50 QUESTION

## The Problem

Our pricing is inconsistent across every document and the live website:

| Source | Starter | Professional |
|--------|---------|--------------|
| **Live website** (Payments.tsx, Onboarding.tsx) | **$347** | **$547** |
| HANDOFF_2026_04_25.md | $297 | $497 |
| TERMS_AND_CONDITIONS.md | $297 | $497 |
| SALES_TRAINING_INDEX.md | $297 | $497 |
| BUSINESS_GUIDE.md | $297 | $497 |
| SALES_TRAINING_INDEX.md ("floor price") | — | $447 |
| YC_PROMPT_3_MAP_COMPETITION.md | $347 | — |
| STRATEGIC_PIVOT.md | — | $497 |
| PRICING_ANALYSIS.md | $297 | $497 | $997 Enterprise |

### Multi-Agent Discussion

**🎙️ Business Ops Agent:** "$297/$497 is our documented price across 7 documents. The $347/$547 on the website was a later change we discussed but never formally updated in the policy docs."

**🎙️ Sales Agent:** "The $297 Starter is critical for the pitch — 'less than $10 a day.' At $347, we're $50 above our own floor price documented in SALES_TRAINING_INDEX. Every sales script references $297/$497."

**🎙️ DevOps Agent:** "The website hardcodes $347/$547. If we change the price, we need to update Payments.tsx line 4, Onboarding.tsx, and the simulator."

**🎙️ AI Manager:** "The cost analysis in PRICING_ANALYSIS.md uses $297/$497. If we keep $347/$547, the margin analysis is wrong."

### ⚠️ DECISION NEEDED
**Which is the real price?**
- **Option A:** $347/$547 (current website) → Update ALL documents to match
- **Option B:** $297/$497 (majority of docs) → Update website to match
- **Option C:** $347/$547 with $297/$497 as "introductory pricing" → Document both

---

# 🔴 CONFLICT 2: booking_after_hours_action — WRONG DEFAULT IN DATABASE

## The Problem

When a clinic's onboarding form submits `"booking_auto_confirm": false` (the default), what happens to after-hours bookings depends on WHICH code path creates the clinic:

| Code Path | Default Value | Behavior |
|-----------|--------------|----------|
| **SQL direct INSERT** (schema.sql line 84) | `'auto_confirm'` | After-hours bookings auto-confirmed WITHOUT clinic approval |
| **Onboarding form** (onboarding.js line 205) | `'hold_for_approval'` | After-hours bookings held for clinic approval |
| **Demo config** (bot-engine.js line 110) | `'hold_for_approval'` | After-hours bookings held for clinic approval |

### The Risk
If you manually insert a clinic via SQL (Step 3 of the onboarding playbook), the clinic gets `auto_confirm` by default. Patients can book at 2am without the clinic knowing until the next morning. This is a **silent bug** — no error, just wrong behavior.

### Multi-Agent Discussion

**🎙️ Security Agent:** "Auto-confirm by default is dangerous. A patient books at midnight, shows up at 9am, clinic has no record because they never approved it."

**🎙️ Business Ops Agent:** "Hold for approval is the safe default. Clinics can opt into auto-confirm after they trust the system."

**🎙️ DevOps Agent:** "Simple fix: change schema.sql line 84 from DEFAULT 'auto_confirm' to DEFAULT 'hold_for_approval'. 1-line change."

### ✅ RECOMMENDATION (No decision needed — this is a bug)
Change schema.sql DEFAULT to `'hold_for_approval'` to match onboarding.js and bot-engine.js.

---

# 🔴 CONFLICT 3: TWO TERMS DOCUMENTS — CONFLICTING POLICIES

## The Problem

We have TWO legally-binding terms documents:

| Policy | TERMS_AND_CONDITIONS.md (old) | TERMS_OF_USE_CLIENT.md (new) |
|--------|-------------------------------|------------------------------|
| **Brand** | Pixel Vault | Moon Hands |
| **Cancellation notice** | 7 days | 30 days |
| **Payment overdue before termination** | 30 days | 14 days |
| **Data retention after cancel** | 30 days export | 90 days retention + 30 days export |
| **Free trial** | Not mentioned | 14 days |
| **Overage grace period** | ✅ 50% absorbed | ❌ Not mentioned |
| **SLA uptime** | 99.5% | 99.5% |
| **Service credits** | ✅ Detailed tiers | ❌ Not mentioned |

### The Risk
If a client disputes termination, which document governs? 14 days or 30 days? If they dispute cancellation, 7 days or 30 days? Having two documents = legal ambiguity.

### Multi-Agent Discussion

**🎙️ Business Ops Agent:** "TERMS_OF_USE_CLIENT.md is the newer, more comprehensive document. But it doesn't include the 50% overage grace period — that only exists in TERMS_AND_CONDITIONS.md."

**🎙️ Security Agent:** "The 14-day overdue termination in TERMS_OF_USE is more aggressive than the 30-day in TERMS_AND_CONDITIONS. Tighter cash flow protection, but might alienate clinics."

**🎙️ Sales Agent:** "The 7-day cancellation in TERMS_AND_CONDITIONS is easier to sell — 'cancel anytime with just a week's notice.' The 30-day in TERMS_OF_USE feels like a lock-in."

### ⚠️ DECISION NEEDED
**Which document is the authoritative one?**
- **Option A:** Merge both into one unified Moon Hands Terms of Use
- **Option B:** Keep TERMS_OF_USE_CLIENT.md as primary, add missing grace period
- **Option C:** Keep both but assign different purposes (ToU for clients, T&C for service agreement)

---

# 🟠 MISMATCH 1: "PAYMENT BUFFER" = 50% OVERAGE GRACE PERIOD (Not in UI)

## The Discovery

The user asked about the "payment buffer." After tracing all files, the answer is in **TERMS_AND_CONDITIONS.md Section 3.1**:

> "We absorb **50% overage at no charge** each month."

| Plan | Voice Grace | WhatsApp Grace |
|------|-------------|----------------|
| Starter | Up to 750 min (500 + 50%) | Up to 1,500 msgs (1,000 + 50%) |
| Professional | Up to 3,000 min (2,000 + 50%) | Up to 7,500 msgs (5,000 + 50%) |

This is our **competitive differentiator** — we give clinics a 50% buffer before charging overage fees. But:

- ❌ **Payments.tsx** does NOT show the grace period
- ❌ **Payments.tsx** does NOT show 80%/100%/150% usage warning tiers
- ❌ **No backend code** implements overage tracking or notifications
- ❌ **No backend code** implements the 50% grace absorption

### What the Payments UI SHOULD show:
```
Usage: 312 of 500 messages (62%)
Grace period: up to 750 messages at no charge
Status: Within normal range
```

When at 80%: Warning notification  
When at 100%: "Grace period active — 50% extra at no charge"  
When at 150%: "Final warning — overage fees apply after 750 messages"

### Multi-Agent Discussion

**🎙️ Sales Agent:** "The 50% grace period is a massive selling point. 'Even if you go over by 50%, we absorb it.' None of our competitors offer this. But it's invisible to clinics right now."

**🎙️ DevOps Agent:** "Implementing this requires: (1) updating the usage tracking to count against grace limits, (2) adding notification triggers at 80/100/150%, (3) updating Payments UI. About 1 day of work."

**🎙️ Business Ops Agent:** "This is our 'payment buffer' — the degree of flexibility we give clients. We need it visible."

### ✅ RECOMMENDATION
Add the 50% grace period display to Payments.tsx. Implement the 80%/100%/150% notification tier system in the daily usage tracking.

---

# 🟠 MISMATCH 2: SMART RATE LIMITER EXISTS BUT NOT USED

## The Problem

**smart-rate-limiter.js** exists with sophisticated 3-layer protection:
- Layer 1: Repeat detector (5 identical in 10 min)
- Layer 2: Flood detector (10 in 5 sec = 60s block)
- Layer 3: Hourly budget (30/hour per phone)
- Plus: Warm, on-brand responses ("clinic is attending to other patients")

But **webhook.js imports per-customer-rate-limiter.js instead**, which has:
- 10 per 5 min (burst)
- 30 per hour
- 80 per day
- 3 identical in a row

### The Risk
The smart-rate-limiter.js has **better UX** (warm responses instead of technical errors) but is completely unused. We're using the older per-customer-rate-limiter with harsher error messages.

### Multi-Agent Discussion

**🎙️ AI Manager:** "The smart-rate-limiter has on-brand responses. Instead of 'You've reached your daily limit,' it says 'I'm receiving a lot of messages. Please take a moment, and I'll be with you shortly.' This is the difference between a clinic owner feeling helped vs feeling rate-limited."

**🎙️ DevOps Agent:** "Two rate limiters is confusing. We should either: (a) migrate webhook.js to use smart-rate-limiter, or (b) copy the warm responses into per-customer-rate-limiter, or (c) delete smart-rate-limiter and standardize on one."

**🎙️ Security Agent:** "The per-customer-rate-limiter has daily limits (80/day) which smart-rate-limiter lacks. Smart-rate-limiter has flood detection (10 in 5 sec) which is faster. They're complementary. Best approach: merge both into one."

### ⚠️ DECISION NEEDED
**What to do with dual rate limiters?**
- **Option A:** Replace per-customer-rate-limiter with smart-rate-limiter in webhook.js
- **Option B:** Merge both into a single unified rate limiter
- **Option C:** Keep both, use per-customer for numeric limits + smart-rate-limiter for warm responses

---

# 🟠 MISMATCH 3: COST PROTECTION PARTIALLY WIRED

## The Problem

**cost-protection.js** has comprehensive kill-switch and cost-ceiling system:
- Per-clinic daily caps: 500 OpenAI calls, $20 spend, 1000 WhatsApp msgs
- Anomaly detection: 3x = flag, 5x = auto-kill
- /KILL and /RESUME commands
- Circuit breaker pattern

But in **webhook.js**, only `isKilled()` is imported and checked. The actual cost tracking (`trackSpend`, `checkLimit`, `checkAnomaly`) is **never called**.

### The Risk
The kill switch works (can shut everything down), but the per-clinic cost ceilings and anomaly detection that PREVENT the need for a kill switch are dormant.

### Multi-Agent Discussion

**🎙️ DevOps Agent:** "To wire it up properly, we need to call checkLimit before each OpenAI call, trackSpend after each call, and checkAnomaly periodically. About 10 lines of code in webhook.js."

**🎙️ Business Ops Agent:** "The $25K lesson from the Reddit post in COST_PROTECTION_PROTOCOL is exactly why this exists. If we don't wire it up, we're vulnerable."

### ✅ RECOMMENDATION
Wire cost-protection.js into webhook.js message processing flow. Add checkLimit before OpenAI calls, trackSpend after.

---

# 🟡 GAP 1: TONE ENUM MISMATCH

| Source | Valid Tones |
|--------|------------|
| schema.sql (client_configs) | friendly, professional, casual |
| onboarding.js (validator) | friendly, professional, casual, **luxury** |
| Onboarding.tsx (UI) | friendly, professional, **luxury**, casual |

The `luxury` tone was added to the onboarding form but the database schema doesn't include it. It will still work (text field, not enum), but there's no validation at the DB level.

### ✅ RECOMMENDATION
Add `luxury` to schema.sql comments. No code change needed since it's a TEXT field, not an ENUM.

---

# 🟡 GAP 2: RLS STATUS

| Source | RLS Status |
|--------|-----------|
| schema.sql (line 238-240) | "Disabled. Enable after testing." |
| HANDOFF_2026_04_25.md | "RLS enabled on all tables" |
| FINAL_MIGRATION_2026_04_25.sql | Has RLS policies |

The schema has RLS commented out. The migration has RLS policies. If you run schema.sql first, then the migration, it works. But if you only run schema.sql, RLS is never enabled.

### ✅ RECOMMENDATION
Uncomment the RLS enable lines in schema.sql. RLS should be on by default.

---

# DECISION MATRIX

| # | Issue | My Recommendation | Your Decision |
|---|-------|-------------------|---------------|
| 1 | **Pricing** $297/$497 vs $347/$547 | Document both — $347/$547 as current, $297/$497 as "early adopter" | ❓ |
| 2 | **Schema default** auto_confirm → hold_for_approval | Fix schema.sql (1-line bug fix) | ✅ Auto-fix |
| 3 | **Two Terms docs** conflicting policies | Merge into one authoritative Moon Hands Terms | ❓ |
| 4 | **50% grace period** not in UI | Add to Payments.tsx + backend tracking | ❓ |
| 5 | **Dual rate limiters** | Merge into one with warm responses | ❓ |
| 6 | **Cost protection** partially wired | Wire checkLimit + trackSpend into webhook | ❓ |
| 7 | **RLS** disabled in schema | Enable by default | ✅ Auto-fix |

---

# WHAT I WILL DO NOW (Without Your Approval)
- Fix schema.sql DEFAULT 'auto_confirm' → 'hold_for_approval'
- Enable RLS in schema.sql
- Add 'luxury' to tone documentation

# WHAT I WILL NOT DO UNTIL YOU APPROVE
- Change any pricing
- Merge/delete terms documents
- Add grace period UI
- Merge rate limiters
- Wire cost protection

**Awaiting your decisions on items 1, 3, 4, 5, 6.**
