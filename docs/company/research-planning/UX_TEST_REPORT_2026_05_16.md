# UX Tester Report #1 — Website Journey Assessment
## Date: 16 May 2026 | Tester: Agent #8 (End-to-End UX Tester)

---

## EXECUTIVE SUMMARY

| Page | Score | Status |
|------|-------|--------|
| Homepage | 8/10 | ✅ Good |
| Simulator | 7/10 | ✅ Good |
| Onboarding | 9/10 | ✅ Excellent |
| Payments | 8/10 | ✅ Good |
| Dashboard | — | ⚠️ Timed out (needs retest) |
| **OVERALL** | **8/10** | **Ready with minor fixes** |

---

## PAGE 1: HOMEPAGE

### What Works ✅
- Dark luxury aesthetic consistent with brand (gold + dark navy)
- "Your 24/7 Receptionist Among the Stars" — clear value prop in 5 seconds
- Two clear CTAs: "Try on WhatsApp" (primary) + "See How It Works" (secondary)
- "Built in Singapore for Singapore aesthetic clinics" — local credibility
- Navigation: Website, Dashboard, Simulator, Onboarding, Payments — all accessible

### ⚠️ Friction
| Issue | Severity | Suggested Fix |
|-------|----------|---------------|
| "By Pixel Vault" in header | Medium | Should say "By Pixel Vault Pte Ltd" or just "Moon Hands" to reinforce brand |
| "Book Demo" CTA links to `wa.me/551146733492` (Brazilian number) | Medium | Replace with Singapore number or remove until real demo number ready |
| "Try on WhatsApp" button also links to Brazilian number | Medium | Same as above — either fix number or label as "Coming Soon" |
| No trust signals (no client logos, no testimonials) | Low | Add "Trusted by X clinics in Singapore" after first real client |

### ❌ Blockers
None.

---

## PAGE 2: SIMULATOR

### What Works ✅
- Authentic WhatsApp-like UI — dark chat bubbles, timestamps, "AI Online" status
- Clinic avatar, name, and online indicator feel real
- Pre-programmed quick-reply buttons: "What treatments?", "How much is Botox?", "Opening hours?", "Where located?"
- Disclaimer: "Demo simulator — responses are pre-programmed for demonstration" — honest
- "By Pixel Vault" branding in header

### ⚠️ Friction
| Issue | Severity | Suggested Fix |
|-------|----------|---------------|
| "By Pixel Vault" — inconsistent branding | Low | Should be "By Pixel Vault Pte Ltd" or hidden |
| Cannot type custom messages (only quick-reply buttons) | Medium | Add a text input field so visitors can test any question |
| Only 4 pre-programmed responses | Low | Add 2-3 more: "Do you have HIFU?", "Is it painful?", "Book appointment" |
| No scroll-to-bottom on new messages | Low | Auto-scroll chat to latest message |

### ❌ Blockers
None.

---

## PAGE 3: ONBOARDING (7-Step Form)

### What Works ✅
- **Step 1 (Clinic Info):** Plan selection with feature lists, business reg number, separate clinic phone, postal code, MRT, parking — comprehensive
- **Step 2 (Treatments):** 8 default treatments with checkboxes + custom treatment builder (name, price, unit, duration, description, category) — excellent flexibility
- **Step 3 (Hours):** Day-by-day toggles with time pickers + slot duration, buffer time, max appointments — exactly what backend expects
- **Step 4 (AI Personality):** Agent name, tone selector (4 options), custom greeting, language toggles (EN/ZH/MS/TA) — full control
- **Step 5 (Booking):** Auto-confirm toggle, after-hours action (3 options), same-day toggle, notice hours, 5 toggle switches, cancellation policy — complete
- **Step 6 (FAQ):** FAQ builder (add Q&A pairs) + special notes text area — captures clinic-specific knowledge
- **Step 7 (Review):** Full summary with edit buttons per section + contact role dropdown — polished finish
- Progress bar at top — clear sense of progress
- Back/Continue navigation — intuitive
- Form validation — Continue button disabled until required fields filled

### ⚠️ Friction
| Issue | Severity | Suggested Fix |
|-------|----------|---------------|
| Form is long (7 steps) — clinic owner may abandon | Medium | Add "Save progress" button or note "Takes ~8 minutes" |
| No indication that "Business Reg No" is optional | Low | Add "(optional)" label |
| FAQ builder starts empty — intimidating | Low | Pre-fill with 2-3 common FAQs as examples |
| No preview of how AI will sound | Medium | Add "Preview AI Personality" button that shows a sample greeting |
| Submit button says "Complete Setup" — sounds final | Low | Change to "Submit for Review" to set expectation that we review first |

### ❌ Blockers
None.

---

## PAGE 4: PAYMENTS

### What Works ✅
- Current plan clearly displayed: "Starter · $347/month · Monthly (Prepaid)"
- Usage bar: 312 of 500 messages with percentage
- "17 days left in cycle" — clear timeline
- Two side-by-side plan cards with feature lists
- "Current" badge on active plan — no confusion
- Invoice history table with dates, amounts, status
- Billing terms panel: prepaid, no refunds, 30-day cancellation, 7-day suspension — all transparent
- "Demo data shown" disclaimer at bottom — honest

### ⚠️ Friction
| Issue | Severity | Suggested Fix |
|-------|----------|---------------|
| No "Upgrade" action on Starter card (only on Professional) | Low | Add "Current Plan" badge + disabled "Upgrade" on Starter for clarity |
| Usage bar has no color warning at 80%+ | Low | Turn bar amber at 80%, red at 100% |
| No cost breakdown (OpenAI cost vs our margin) | Low | Not needed for client-facing — internal only |
| Invoice history is demo data — might confuse | Low | Label more prominently: "Sample invoice history" |

### ❌ Blockers
None.

---

## PAGE 5: DASHBOARD

### Status: ⚠️ Timed out during test
- Page exists in code (tested earlier in session)
- Likely a loading issue with the static deployment
- **Needs retest after next deploy**

---

## PERSONA-SPECIFIC FINDINGS

### As The Anxious First-Timer (Emily, 28)
- **Homepage:** "Your 24/7 Receptionist Among the Stars" — tagline is reassuring
- **Simulator:** Quick-reply buttons make it easy to ask without typing
- **Missing:** No FAQ about "Is it safe for first-timers?" in the quick replies
- **Fix:** Add a "First-timer guide" or FAQ about safety/consultation

### As The Price Shopper (Karen, 45)
- **Payments page:** Clear pricing — $347 vs $547, feature comparison helps
- **Missing:** No mention of "What's included" on homepage (have to click through to see)
- **Fix:** Add 3 key features on homepage below the hero (e.g., "Instant Replies · 8 Treatments · 14-Day Trial")

### As The Non-English Speaker (林小姐, 35)
- **Onboarding:** Language toggle available (EN/ZH/MS/TA) — excellent
- **Simulator:** Only English responses — expected (it's hardcoded)
- **Missing:** No indication on homepage that we support Chinese
- **Fix:** Add "Supports English, Chinese, Malay, Tamil" as a badge on homepage

### As The Clinic Owner (Dr. Sarah, 40)
- **Onboarding:** Form captures everything I need — treatments, hours, AI personality, booking rules
- **Missing:** No "Preview AI Personality" before submitting
- **Fix:** Add preview so clinic owners can hear how their AI will sound

---

## RECOMMENDED FIXES (Priority Order)

### High Priority (Before First Client)
1. **Fix WhatsApp numbers** — Replace `wa.me/551146733492` (Brazil) with actual Singapore number or label as "Coming Soon"
2. **Add "Save progress" note** to onboarding — "Takes ~8 minutes. Your progress is saved automatically."
3. **Retest Dashboard page** — Timed out, may need debugging

### Medium Priority (Week 1)
4. **Add custom text input to Simulator** — Let visitors type any question, not just quick-replies
5. **Add language support badge** to homepage — "English · Chinese · Malay · Tamil"
6. **Add 3 key features** below hero on homepage
7. **Pre-fill FAQ builder** with 2-3 example FAQs
8. **Add "Preview AI Personality"** button to onboarding Step 4

### Low Priority (Nice to Have)
9. Usage bar color warning at 80%+
10. "Submit for Review" instead of "Complete Setup"
11. Add "First-timer guide" quick-reply to simulator
12. Add "(optional)" labels to non-required fields

---

## VERDICT

> **The website is 8/10 and ready for first client with 2-3 quick fixes.**
>
> The onboarding form is the standout — comprehensive, well-designed, captures everything the backend needs. The Payments page is clean and honest about terms. The Simulator is good for demo purposes.
>
> **The #1 fix:** Replace the Brazilian WhatsApp number. Everything else can wait until after the first client.

---

*Tested by: UX Tester Agent #8*  
*Test date: 16 May 2026*  
*Device: Desktop browser*  
*URL: https://wzejxaudglkym.kimi.page*
