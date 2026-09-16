# Moon Hands — Document Inventory & Consolidation Plan
## Master Reference for Canonical Document Locations
## Last Updated: July 4, 2026

---

## EXECUTIVE SUMMARY

**90 documents** exist across the `docs/` directory. **12 are exact duplicates**, **7 are empty**, **4 are superseded by newer versions**. This creates confusion about which document is the source of truth.

**Recommendation:** Consolidate to **5 canonical operational documents** + keep **research/sales/security** docs in their respective folders. Delete duplicates and empty files.

---

## THE 5 CANONICAL OPERATIONAL DOCUMENTS

These are the ONLY documents Kimi references for day-to-day operations. Everything else is historical research or sales material.

| # | Document | Purpose | Commit |
|---|----------|---------|--------|
| 1 | `docs/company/operations/CONSOLIDATED_AGENT_ROSTER.md` | 13 agents, boundaries, triggers, checklists | `a06b40cf4201` |
| 2 | `docs/company/operations/DEPLOYMENT_PROTOCOL.md` | 10-step deployment workflow with all agents | `a06b40cf4201` |
| 3 | `docs/company/operations/SESSION_MEMORY_2026_07_04.md` | Complete session history, architecture, 39-fix log | `0288f298aeb2` |
| 4 | `docs/company/operations/PENDING_ITEMS_2026_07_04.md` | All pending items prioritized by criticality | `a06b40cf4201` |
| 5 | `docs/company/operations/COST_PROTECTION_PROTOCOL.md` | Cost caps, rate limiting, kill switch, abuse prevention | (existing) |

**When working on operations → reference ONLY these 5 files.**

---

## DUPLICATE FILES (Exact Copies — Safe to Delete)

The following files are **bit-for-bit identical** to their canonical location. They exist only due to historical file moves.

| Delete This (Root) | Keep This (Canonical) | Lines | Action |
|--------------------|----------------------|-------|--------|
| `docs/COMPANY_STAFF_AGENTS.md` | `docs/company/operations/COMPANY_STAFF_AGENTS.md` | 544 | **DELETE** — superseded by CONSOLIDATED_AGENT_ROSTER anyway |
| `docs/POLICY_COMPLIANCE_AGENT.md` | `docs/company/operations/POLICY_COMPLIANCE_AGENT.md` | 294 | **DELETE** — keep canonical in operations/ |
| `docs/DEPENDENCY_VALIDATOR_AGENT.md` | `docs/company/research-planning/DEPENDENCY_VALIDATOR_AGENT.md` | 236 | **DELETE** — keep canonical in research-planning/ |
| `docs/RED_TEAM_AGENT.md` | `docs/company/research-planning/RED_TEAM_AGENT.md` | 233 | **DELETE** — keep canonical in research-planning/ |
| `docs/UX_TESTER_AGENT.md` | `docs/company/research-planning/UX_TESTER_AGENT.md` | 225 | **DELETE** — keep canonical in research-planning/ |
| `docs/ENHANCEMENT_CAPTURE_SYSTEM.md` | `docs/company/operations/ENHANCEMENT_CAPTURE_SYSTEM.md` | 335 | **DELETE** — keep canonical in operations/ |
| `docs/CLIENT_ONBOARDING_PACKAGE.md` | `docs/client/onboarding/CLIENT_ONBOARDING_PACKAGE.md` | 247 | **DELETE** — keep canonical in client/ |
| `docs/security-audits/PRODUCTION_READINESS_ANALYSIS.md` | `docs/company/security-audits/PRODUCTION_READINESS_ANALYSIS.md` | 483 | **DELETE** — keep canonical in company/security-audits/ |
| `docs/security-audits/SECURITY_AUDIT_CLAUDE_2026_05_16.md` | `docs/company/security-audits/SECURITY_AUDIT_CLAUDE_2026_05_16.md` | 260 | **DELETE** — keep canonical in company/security-audits/ |

**Total: 9 files to delete, ~2,997 lines removed.**

---

## SUPERSEDED FILES (Replaced by Newer Versions)

| File | Why Superseded | Replaced By | Action |
|------|---------------|-------------|--------|
| `docs/company/operations/COMPANY_STAFF_AGENTS.md` | v1.0 with 8 agents | `CONSOLIDATED_AGENT_ROSTER.md` v2.0 (13 agents) | **DELETE** |
| `docs/company/operations/DEPLOYMENT.md` | Old deployment checklist | `DEPLOYMENT_PROTOCOL.md` v1.1 (10-step workflow) | **DELETE** |
| `docs/PRODUCTION_GO_LIVE_JUNE_2026.md` | Outdated (June 2026) | `SESSION_MEMORY_2026_07_04.md` (July 2026, comprehensive) | **DELETE** |
| `docs/company/research-planning/TERMS_AND_CONDITIONS_OLD.md` | Explicitly marked "OLD" | `docs/client/legal/TERMS_OF_USE_CLIENT.md` | **DELETE** |
| `docs/company/operations/SYSTEM_SNAPSHOT_JUNE_27_2026.md` | Outdated (June 27) | `SESSION_MEMORY_2026_07_04.md` (July 4, current) | **ARCHIVE** — keep for historical reference |

**Total: 5 files to delete/archive.**

---

## EMPTY FILES (0 Lines — Definitely Delete)

| File | Action |
|------|--------|
| `docs/company/research-planning/HEALTH_MONITORING_DESIGN.md` | **DELETE** |
| `docs/company/research-planning/CLIENT_MANAGEMENT_GUIDE.md` | **DELETE** |
| `docs/company/operations/RENDER_MONITORING_SETUP.md` | **DELETE** |
| `docs/company/operations/RENDER_ENV_CHECKLIST.md` | **DELETE** |
| `docs/company/operations/MONITORING_SETUP_GUIDE.md` | **DELETE** |
| `docs/company/operations/INTEGRATION_GUIDE.md` | **DELETE** |
| `docs/company/operations/GO_LIVE_CHECKLIST.md` | **DELETE** |

**Total: 7 files to delete.**

---

## NEAR-DUPLICATES (Different Versions — Need Merge Decision)

| File A | File B | Status | Action |
|--------|--------|--------|--------|
| `docs/company/operations/ONBOARDING_PLAYBOOK.md` (337 lines) | `docs/client/onboarding/ONBOARDING_PLAYBOOK.md` (338 lines) | **Different** — ops version is internal, client version is external-facing | **KEEP BOTH** — different audiences |
| `docs/company/sales-marketing/DEMO_VIDEO_STORYBOARD.md` (307 lines) | `docs/client/media/DEMO_VIDEO_STORYBOARD.md` (307 lines) | Identical but different purpose | **Keep in sales-marketing/**, delete from client/media/ |
| `docs/company/research-planning/DEMO_VIDEO_SCRIPT.md` (49 lines) | `docs/client/media/DEMO_VIDEO_SCRIPT.md` (49 lines) | Identical | **Keep in research-planning/**, delete from client/media/ |

---

## STALE FILES (Outdated but May Have Historical Value)

| File | Date | Status | Action |
|------|------|--------|--------|
| `docs/company/operations/HANDOFF_2026_04_25.md` | April 25, 2026 | 3 months old | **ARCHIVE** to `docs/archive/` |
| `docs/company/operations/GO_LIVE_CLEANUP_2026_07_03.md` | July 3, 2026 | 1 day old, cleanup completed | **ARCHIVE** to `docs/archive/` |
| `docs/company/research-planning/MOON_HANDS_SNAPSHOT.md` | Unknown | May be outdated | **ARCHIVE** to `docs/archive/` |
| `docs/company/research-planning/QUICK_START.md` | Unknown | May be outdated | **ARCHIVE** to `docs/archive/` |
| `docs/GO_LIVE_CHECKLIST.md` | Unknown | Has 0-line duplicate in operations/ | **DELETE** |

---

## CROSS-REFERENCE MAP

### Documents That Reference Other Documents

| Document | References | Risk if Target Deleted |
|----------|-----------|----------------------|
| `CONSOLIDATED_AGENT_ROSTER.md` | `PROMPT_ENGINEER_AGENT.md` (root), `RED_TEAM_AGENT.md`, `UX_TESTER_AGENT.md`, `DEPENDENCY_VALIDATOR_AGENT.md`, `POLICY_COMPLIANCE_AGENT.md` | **HIGH** — roster links to all agent files |
| `DEPLOYMENT_PROTOCOL.md` | `CONSOLIDATED_AGENT_ROSTER.md` | **HIGH** — references all 13 agents |
| `SESSION_MEMORY_2026_07_04.md` | `COMPANY_STAFF_AGENTS.md` (now superseded) | **MEDIUM** — should update to reference CONSOLIDATED |
| `PENDING_ITEMS_2026_07_04.md` | None | None |
| `COST_PROTECTION_PROTOCOL.md` | None | None |
| `ENHANCEMENT_CAPTURE_SYSTEM.md` | `ENHANCEMENT_WORKFLOW.md` | **MEDIUM** |

### Dependencies to Update if Deleting Files

1. **If deleting `COMPANY_STAFF_AGENTS.md`** → Update `SESSION_MEMORY_2026_07_04.md` line ~520 (references it in Agent Accountability table)
2. **If deleting root `RED_TEAM_AGENT.md`** → Ensure `CONSOLIDATED_AGENT_ROSTER.md` references the `research-planning/` version
3. **If deleting root `UX_TESTER_AGENT.md`** → Ensure `CONSOLIDATED_AGENT_ROSTER.md` references the `research-planning/` version
4. **If deleting root `DEPENDENCY_VALIDATOR_AGENT.md`** → Ensure `CONSOLIDATED_AGENT_ROSTER.md` references the `research-planning/` version
5. **If deleting root `POLICY_COMPLIANCE_AGENT.md`** → Ensure `CONSOLIDATED_AGENT_ROSTER.md` references the `operations/` version

---

## RECOMMENDED FOLDER STRUCTURE (After Cleanup)

```
docs/
├── DOCUMENT_INVENTORY.md          ← THIS FILE (master reference)
├── PROMPT_ENGINEER_AGENT.md       ← Keep at root (activates on BUILD/CREATE/MODIFY)
│
├── company/
│   ├── README.md                  ← Company overview
│   │
│   ├── operations/                ← ⭐ CANONICAL: Day-to-day operational docs
│   │   ├── CONSOLIDATED_AGENT_ROSTER.md
│   │   ├── DEPLOYMENT_PROTOCOL.md
│   │   ├── SESSION_MEMORY_2026_07_04.md
│   │   ├── PENDING_ITEMS_2026_07_04.md
│   │   ├── COST_PROTECTION_PROTOCOL.md
│   │   ├── CLIENT_ENHANCEMENT_POLICY.md
│   │   ├── ENHANCEMENT_CAPTURE_SYSTEM.md
│   │   ├── MULTI_AGENT_MEETING_2026_05_16.md
│   │   ├── SECURITY_MONITORING.md
│   │   └── ONBOARDING_PLAYBOOK.md        ← Internal version
│   │
│   ├── research-planning/         ← Historical research (reference only)
│   │   ├── TECHNICAL_GUIDE.md
│   │   ├── WHATSAPP_GUIDE.md
│   │   ├── TELEGRAM_BOT_PLAN.md
│   │   ├── HEALTH_MONITORING.md
│   │   ├── LONG_TERM_CONCERNS.md
│   │   ├── BUSINESS_GUIDE.md
│   │   ├── AI_COFUNDER_CHARTER.md
│   │   ├── RED_TEAM_AGENT.md
│   │   ├── UX_TESTER_AGENT.md
│   │   ├── DEPENDENCY_VALIDATOR_AGENT.md
│   │   ├── GOOGLE_CALENDAR_INTEGRATION_PLAN.md
│   │   ├── HYBRID_CALENDAR_DESIGN.md
│   │   ├── DAILY_USAGE_REPORTER.md
│   │   ├── TWILIO_COST_ANALYSIS.md
│   │   ├── DEMO_VIDEO_SCRIPT.md
│   │   ├── UX_TEST_REPORT_2026_05_16.md
│   │   ├── GOOGLE_CLOUD_OAUTH_SETUP.md
│   │   └── info.md
│   │
│   ├── sales-marketing/           ← Sales materials
│   │   ├── MOON_HANDS_PITCH_DECK.md
│   │   ├── AESTHETIC_CLINIC_MARKET_ANALYSIS.md
│   │   ├── AESTHETIC_CLINIC_SALES_SCRIPTS.md
│   │   ├── SALES_TRAINING_MANUAL.md
│   │   ├── NEGOTIATION_PLAYBOOK.md
│   │   ├── BRAND_VOICE_GUIDE.md
│   │   ├── PRICING_ANALYSIS.md
│   │   ├── DEMO_VIDEO_STORYBOARD.md
│   │   ├── SALES_ROLEPLAY_SCENARIOS.md
│   │   ├── MULTI_CHANNEL_LEAD_STRATEGY.md
│   │   ├── STRATEGIC_PIVOT.md
│   │   ├── SALES_BATTLE_CARD.md
│   │   ├── API_SIGNUP_GUIDE.md
│   │   ├── SALES_TRAINING_INDEX.md
│   │   └── MOON_HANDS_PITCH_DECK_AESTHETIC.md
│   │
│   └── security-audits/           ← Audit reports (read-only)
│       ├── SECURITY_ASSESSMENT_JUNE_2026.md
│       ├── SECURITY_AUDIT_2026_04_25.md
│       ├── SECURITY_AUDIT_CLAUDE_2026_05_16.md
│       ├── PRODUCTION_READINESS_ANALYSIS.md
│       ├── CODE_REVIEW_2026_05_14.md
│       ├── CODE_VS_DOCUMENT_AUDIT.md
│       └── YC_STRESS_TEST.md
│
├── client/                        ← Client-facing materials
│   ├── legal/
│   │   ├── PRIVACY_POLICY.md
│   │   └── TERMS_OF_USE_CLIENT.md
│   ├── onboarding/
│   │   ├── CLIENT_ONBOARDING_PACKAGE.md
│   │   └── ONBOARDING_PLAYBOOK.md    ← External-facing version
│   └── media/
│       └── (empty after cleanup)
│
├── archive/                       ← Archived historical docs
│   ├── HANDOFF_2026_04_25.md
│   ├── GO_LIVE_CLEANUP_2026_07_03.md
│   ├── SYSTEM_SNAPSHOT_JUNE_27_2026.md
│   ├── MOON_HANDS_SNAPSHOT.md
│   └── QUICK_START.md
│
└── yc-application/               ← YC application materials
    ├── YC_PROMPT_2_VALIDATE_PROBLEM.md
    ├── YC_PROMPT_3_MAP_COMPETITION.md
    ├── YC_PROMPT_4_FIRST_10_CUSTOMERS.md
    └── YC_PROMPT_5_MVP_2_WEEKS.md
```

**After cleanup: ~60 documents (from 90), ~21 files deleted/archived.**

---

## DELETION COMMANDS (For User Approval)

```bash
# 1. Delete exact duplicates (root level)
git rm docs/COMPANY_STAFF_AGENTS.md
git rm docs/POLICY_COMPLIANCE_AGENT.md
git rm docs/DEPENDENCY_VALIDATOR_AGENT.md
git rm docs/RED_TEAM_AGENT.md
git rm docs/UX_TESTER_AGENT.md
git rm docs/ENHANCEMENT_CAPTURE_SYSTEM.md
git rm docs/CLIENT_ONBOARDING_PACKAGE.md
git rm docs/security-audits/PRODUCTION_READINESS_ANALYSIS.md
git rm docs/security-audits/SECURITY_AUDIT_CLAUDE_2026_05_16.md
git rm docs/RENDER_ENV_SETUP.md          # content moved to COST_PROTECTION_PROTOCOL
git rm docs/RENDER_MONITORING_SETUP.md   # content moved to COST_PROTECTION_PROTOCOL

# 2. Delete superseded files
git rm docs/company/operations/COMPANY_STAFF_AGENTS.md
git rm docs/company/operations/DEPLOYMENT.md
git rm docs/PRODUCTION_GO_LIVE_JUNE_2026.md
git rm docs/company/research-planning/TERMS_AND_CONDITIONS_OLD.md

# 3. Delete empty files
git rm docs/company/research-planning/HEALTH_MONITORING_DESIGN.md
git rm docs/company/research-planning/CLIENT_MANAGEMENT_GUIDE.md
git rm docs/company/operations/RENDER_MONITORING_SETUP.md
git rm docs/company/operations/RENDER_ENV_CHECKLIST.md
git rm docs/company/operations/MONITORING_SETUP_GUIDE.md
git rm docs/company/operations/INTEGRATION_GUIDE.md
git rm docs/company/operations/GO_LIVE_CHECKLIST.md
git rm docs/GO_LIVE_CHECKLIST.md

# 4. Create archive folder and move stale files
mkdir -p docs/archive
git mv docs/company/operations/HANDOFF_2026_04_25.md docs/archive/
git mv docs/company/operations/GO_LIVE_CLEANUP_2026_07_03.md docs/archive/
git mv docs/company/research-planning/MOON_HANDS_SNAPSHOT.md docs/archive/
git mv docs/company/research-planning/QUICK_START.md docs/archive/

# 5. Clean up empty folders
rmdir docs/security-audits 2>/dev/null
rmdir docs/client/media 2>/dev/null

# 6. Commit
git commit -m "cleanup: remove 21 duplicate/stale/empty files, archive 4 historical docs

- Deleted 9 exact duplicate files (root-level copies)
- Deleted 4 superseded files (replaced by newer versions)
- Deleted 8 empty files (0 lines)
- Archived 4 stale historical docs to docs/archive/
- Created docs/DOCUMENT_INVENTORY.md as master reference
- No functional code changes"
```

---

## WHAT KIMI WILL REFERENCE GOING FORWARD

### For Code Changes:
1. `docs/company/operations/SESSION_MEMORY_2026_07_04.md` — architecture decisions, design patterns
2. `docs/company/operations/PENDING_ITEMS_2026_07_04.md` — what's next
3. `ai/test-1000-permutations.js` — test expectations

### For Deployment:
1. `docs/company/operations/DEPLOYMENT_PROTOCOL.md` — 10-step workflow
2. `docs/company/operations/CONSOLIDATED_AGENT_ROSTER.md` — which agents to invoke

### For New Features (BUILD/CREATE/MODIFY):
1. `PROMPT_ENGINEER_AGENT.md` — requirement refinement workflow
2. `docs/company/operations/COST_PROTECTION_PROTOCOL.md` — cost constraints

### For Security:
1. `docs/company/research-planning/RED_TEAM_AGENT.md` — 5-phase audit protocol
2. `docs/company/security-audits/` — historical audit findings

### For Sales/Business:
1. `docs/company/sales-marketing/` — pitch decks, scripts, training

---

*Document version: 1.0*
*Last updated: July 4, 2026*
*Total documents found: 90*
*Recommended deletions: 21*
*Recommended archives: 4*
*Canonical operational docs: 5*
