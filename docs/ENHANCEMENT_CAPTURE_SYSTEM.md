# Moon Hands — Enhancement Capture System Specification
## How Clinics Request Features + How We Ensure Cross-Clinic Isolation

**Status:** Design spec (not yet built)  
**Trigger:** Clinic staff messages their AI with an idea, suggestion, or wish  
**Output:** Tracked enhancement request, clinic-isolated implementation

---

## PART 1: HOW CLINICS REQUEST ENHANCEMENTS

### The Flow (Step by Step)

```
CLINIC STAFF (WhatsApp/Telegram)
  ↓
"I wish the bot could send before/after photos to patients"
  ↓
MOON HANDS AI
  ↓
[Intent detected: enhancement_request]
  ↓
1. Acknowledge: "Thank you! I've noted your suggestion about sharing 
    before/after photos with patients. Reference: #ENH-047. 
    Our team will review this and update you."
  ↓
2. Log to Supabase: enhancement_requests table
  ↓
3. Telegram alert to YOU:
    "New enhancement request from Clinic: Beautiful You Aesthetics
     Ref: #ENH-047
     Suggestion: Share before/after photos via bot
     Context: Staff asked on WhatsApp at 3:42pm
     Patient impact: All future photo inquiries"
  ↓
YOU review → Approve / Decline / Ask for more info
  ↓
If approved → Agent #11 (Policy Guardian) runs 7-check protocol
  ↓
If policy passes → Development → Deploy
  ↓
After deploy → AI notifies clinic: 
    "Great news! Your suggestion (#ENH-047) for sharing before/after 
     photos is now live. Patients can now view approved photos 
     when they ask about treatments."
```

### What the AI Recognizes as Enhancement Requests

The AI is trained to detect these patterns:

| Pattern Type | Examples |
|-------------|----------|
| **Wish/I wish** | "I wish the bot could...", "It would be great if..." |
| **Suggestion** | "Can you add...", "Why don't you...", "Have you considered..." |
| **Complaint → Feature gap** | "The bot doesn't know about...", "Patients keep asking about X and the bot can't answer" |
| **Comparison** | "My friend's clinic bot can do...", "Other clinics have..." |
| **Direct ask** | "I want a feature that...", "Can we get..." |
| **Frustration** | "This is annoying — every time I have to..." |

### What the AI NEVER Does

- ❌ Promises timelines ("we'll build this next week")
- ❌ Commits to building ("yes, we'll add that")
- ❌ Discusses other clinics ("Clinic B has this already")
- ❌ Shares pricing for custom work ("this will cost S$X")
- ❌ Redirects to email (forces them to break their flow)

**Standard response:** *"Thank you, I've noted your suggestion (Reference: #ENH-XXX) and shared it with our team. We'll review this and keep you updated."*

---

## PART 2: CROSS-CLINIC ISOLATION ARCHITECTURE

### The Core Rule

> **Configuration is per-clinic. Code is shared. RLS makes cross-tenant access structurally impossible.**

### How Different Enhancement Types Are Handled

| Enhancement Type | Example | Isolation Mechanism | Risk to Other Clinics |
|-----------------|---------|-------------------|----------------------|
| **A. Clinic-specific config** | "Add my new HIFU treatment" | Stored in clinic's `client_configs.treatments` JSON | **Zero** — only that clinic's row is updated |
| **B. Feature toggle** | "I want voice calls enabled" | Boolean flag in clinic's config row: `voice_enabled: true` | **Zero** — flag only affects that clinic |
| **C. Shared code improvement** | "Make cancellation confirmation shorter" | Deploy new version to all clinics | **Positive** — all clinics benefit |
| **D. New shared feature** | "Add Instagram DM support" | Deploy to all, but `instagram_enabled` flag per clinic | **Low** — opt-in per clinic |
| **E. Custom integration** | "Connect to my CRM" | Requires new third-party → Agent #11 blocks until DPA | **Medium** — must assess data leakage |
| **F. Architecture change** | "Use different AI model" | Affects ALL clinics | **High** — requires your approval + full testing |

### The Decision Matrix (For You)

```
When a clinic asks for something:
  |
  ├── Is it just updating their config? (Type A)
  │   └── DO IT IMMEDIATELY. Zero risk. Update their treatment list, FAQ, hours.
  │
  ├── Is it enabling a feature we already built? (Type B)
  │   └── DO IT IMMEDIATELY. Just flip the flag in their config.
  │
  ├── Is it improving something for everyone? (Type C)
  │   └── BUILD IT. All clinics benefit. Run standard deploy protocol.
  │
  ├── Is it a new feature? (Type D)
  │   └── ASSESS: Does it benefit multiple clinics? 
  │       YES → Build with per-clinic toggle. Default off.
  │       NO → Assess if worth maintaining for one clinic.
  │
  ├── Is it a third-party integration? (Type E)
  │   └── BLOCK. Agent #11 must run 7-check protocol. DPA required.
  │       Only proceed if clinic pays for integration cost.
  │
  └── Is it an architecture change? (Type F)
      └── BLOCK. Requires full team review (all agents).
          Your explicit approval needed. High risk.
```

### Technical Safeguards (Already in Place)

1. **Row-Level Security (RLS):** Every database query automatically filters by `clinic_id`. Clinic A's data is physically unreachable from Clinic B's queries.
2. **Per-clinic config:** Each clinic has its own `client_configs` row. Updating one row doesn't affect others.
3. **Feature flags:** New features ship as `enabled: false` by default. You explicitly enable per clinic.
4. **Environment isolation:** Each clinic's Telegram bot token, WhatsApp number, and API keys are separate.
5. **Cost caps:** Per-clinic daily spending limits prevent one clinic's usage from affecting others.

### What We'd Need to Build (The Enhancement Tracking System)

**Database table:**
```sql
CREATE TABLE enhancement_requests (
  id SERIAL PRIMARY KEY,
  reference_number VARCHAR(20) UNIQUE NOT NULL, -- ENH-001, ENH-002, etc.
  clinic_id UUID REFERENCES client_configs(id),
  suggested_by TEXT, -- Staff member name or "AI-detected"
  original_message TEXT, -- What they actually said
  suggestion_summary TEXT, -- AI-generated summary
  category TEXT CHECK (category IN ('config', 'feature_toggle', 'shared_code', 
                                     'new_feature', 'integration', 'architecture')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'under_review', 
                                    'approved', 'building', 'testing', 'deployed', 
                                    'declined', 'deferred')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  assessed_by TEXT, -- Which agent reviewed it
  cross_clinic_impact TEXT CHECK (cross_clinic_impact IN ('none', 'low', 'medium', 'high')),
  privacy_policy_update_needed BOOLEAN DEFAULT false,
  tc_update_needed BOOLEAN DEFAULT false,
  your_decision TEXT, -- Your final call
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**AI intent detection:** Add to bot-engine system prompt:
```
If the user is suggesting an improvement, asking for a new feature, or 
expressing dissatisfaction with current capabilities, DO NOT promise to 
build it. Instead:
1. Thank them warmly
2. Generate reference number format: "#ENH-XXX"
3. Say you'll share it with the team
4. Log the request internally
5. Move on to helping with their immediate need
```

**Telegram alert to you:**
```
🆕 Enhancement Request #ENH-047
From: Beautiful You Aesthetics (Dr. Lim)
Via: WhatsApp at 3:42pm

Suggestion: "I wish the bot could send before/after photos 
             to patients who ask about treatments"

Category: New Feature (Type D)
Cross-clinic impact: Low (toggleable per clinic)
Patient benefit: High (reduces repetitive questions)
Effort estimate: Medium (requires photo approval queue)

Policy check: Requires Agent #11 review (photo = new data type)

Your options:
[Approve for design] [Decline] [Ask for more info] [Defer]
```

---

## PART 3: TELEGRAM COMMUNITY GROUP CONCEPT

### The Idea

Instead of (or in addition to) individual Telegram bot chats per clinic, create a **private Telegram community group** where:

- You (Pixel Vault) are the admin
- Each clinic gets their own **topic/thread** within the group (Telegram's "Topics" feature)
- Clinic staff can see other clinics' threads (read-only) — creates community learning
- Each clinic can only post in their own thread
- You can broadcast announcements to all clinics at once
- Clinics can share best practices (with your approval)

### Telegram Topics Feature (Built-in)

Telegram supports "Topics" in groups (like Discord channels):
- One group, multiple organized threads
- Each thread = one clinic
- Notifications are per-thread
- Works on both mobile and desktop

### Structure

```
📱 Moon Hands Clinic Community (Private Group)
│
├── 📌 General
│   ├── Welcome & Guidelines
│   ├── Feature Announcements
│   ├── Tips & Best Practices
│   └── Industry News
│
├── 🏥 Clinic: Beautiful You Aesthetics
│   ├── Booking Alerts
│   ├── Daily Summaries
│   ├── Configuration Requests
│   └── General Chat
│
├── 🏥 Clinic: Glow Skin Clinic
│   ├── Booking Alerts
│   ├── Daily Summaries
│   ├── Configuration Requests
│   └── General Chat
│
├── 🏥 Clinic: [Future clinics...]
│
└── 💬 Community Lounge
    ├── Success Stories
    ├── Q&A with Moon Hands Team
    └── Networking
```

### Benefits

| For You | For Clinics |
|---------|------------|
| One group to manage, not 20 individual chats | See how other clinics use Moon Hands (learn from peers) |
| Broadcast announcements to all at once | Community support — clinics help each other |
| Monitor all clinic activity in one place | Feels like being part of a network, not isolated |
| Showcase success stories from Clinic A to motivate Clinic B | Direct access to you for questions |

### Technical Implementation

1. **Create a private Telegram group** with Topics enabled
2. **Create one topic per clinic** when they onboard
3. **Bot posts booking alerts** to the clinic's specific topic
4. **Daily summaries** posted to clinic's topic
5. **Broadcast announcements** posted to "General" topic
6. **Permission settings:** Clinic members can only write in their own topic + General (read-only)

### Concerns & Mitigations

| Concern | Mitigation |
|---------|------------|
| Clinic A sees Clinic B's patient names | Booking alerts show first name only + last initial. No phone numbers in shared topics. |
| Clinics competing with each other | Community Lounge is opt-in. Clinics can mute it. |
| Information leakage between clinics | RLS still applies. Telegram topics are just a view layer. No data crosses in backend. |
| Too noisy for you | Each topic has its own mute settings. You can mute individual clinics. |

### Recommendation

**Phase 1 (Now):** Keep individual bot chats. Simpler. No change needed.  
**Phase 2 (After 5+ clinics):** Migrate to community group with Topics. The peer learning effect becomes valuable once there's a critical mass.

---

## PART 4: AGENT REVIEW — ENHANCEMENT SYSTEM

### Agent #1: Database Manager
- ✅ Enhancement table schema is sound
- ✅ Reference numbers auto-generated
- ✅ Cross-clinic impact field aligns with isolation architecture
- ⚠️ **Note:** Add index on `clinic_id` + `status` for performance

### Agent #2: Security Agent
- ✅ No new security risks in the logging mechanism
- ✅ RLS policies extend naturally to enhancement_requests table
- ✅ Telegram alerts don't expose patient data
- ⚠️ **Action:** Ensure `original_message` field doesn't contain patient PII

### Agent #3: AI Receptionist Manager
- ✅ Intent detection patterns are comprehensive
- ✅ Response template is warm but non-committal
- ✅ Reference number format is clear
- ⚠️ **Action:** Add training examples to system prompt

### Agent #4: Sales & Outreach
- ✅ Enhancement requests = free market research
- ✅ Tracking system enables "you asked, we built" marketing
- 💡 **Idea:** Monthly "Feature Friday" — showcase enhancements built from clinic feedback

### Agent #5: DevOps
- ✅ Deploy process unchanged — feature flags handle per-clinic rollout
- ✅ No new infrastructure needed for tracking system
- ⚠️ **Action:** Add enhancement_requests table migration to deploy checklist

### Agent #6: Business Operations
- ✅ System gives you structured decision data (category, impact, effort)
- ✅ Reference numbers enable professional follow-up
- ✅ "Status" field lets you track pipeline

### Agent #7: File Guardian
- ✅ No canonical value conflicts
- ✅ Consistent with existing naming conventions

### Agent #8: UX Tester
- ✅ Flow is intuitive — clinic staff doesn't need to learn anything new
- ✅ They just talk to their AI as they already do
- ⚠️ **Action:** Test that the AI doesn't over-detect (false positives on normal chat)

### Agent #9: Red Team Auditor
- ✅ No new attack surfaces
- ⚠️ **Action:** Verify that reference numbers don't leak clinic count or business info

### Agent #10: Dependency Validator
- ✅ No new dependencies
- ✅ Supabase table creation is standard migration

### Agent #11: Policy & Compliance Guardian
- ✅ Enhancement logging doesn't collect new patient data
- ✅ Telegram alerts to you are business data, not patient data
- ✅ Cross-clinic isolation is structurally enforced by RLS
- ⚠️ **Action:** When enhancement involves new data type → Trigger Check 1 of 7-check protocol

---

*Status: Design spec complete. Ready to build when you approve.*
*All 11 agents reviewed: APPROVED with minor notes.*
