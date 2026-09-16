# Moon Hands — Client Enhancement Request Policy
## Classification: INTERNAL — Not for client distribution
## Last Updated: 2026-04-21

---

## 1. THE RED LINE (Auto-Decline — No Exceptions)

These requests touch our core infrastructure, business model, security architecture, or multi-tenant design. **We never do these, no matter how big the client is or how much they offer to pay.**

### 1.1 Architecture & Infrastructure (NEVER)

| Request Category | Example Request | Why Declined |
|-----------------|-----------------|--------------|
| **Database access** | "Can we get direct SQL access to our data?" | RLS enforces per-client isolation. Direct DB access breaks our security model. |
| **API access** | "Can we have API keys to build our own dashboard?" | Exposes our data layer. Clients interact via Telegram bot only. |
| **Code changes** | "Can you add a custom module for us?" | Diverges codebase. Maintenance nightmare. We sell a standardized product. |
| **Custom hosting** | "Can you deploy on our AWS account?" | Breaks our multi-tenant architecture. Security becomes unmanageable. |
| **Custom infra** | "Can you use our database instead?" | Impossible. Our RLS policies, views, and triggers depend on our schema. |
| **Webhook changes** | "Can you send webhooks to our server?" | Exposes internal event flow. Could leak other clinic data. |
| **Server access** | "Can our developer SSH in to check?" | Never. Zero access to production servers for anyone except us. |
| **Schema changes** | "Can you add a column for patient NRIC?" | Schema changes affect all clinics. Use our existing JSONB fields for custom data. |

### 1.2 Business Model & Pricing (NEVER)

| Request Category | Example Request | Why Declined |
|-----------------|-----------------|--------------|
| **Custom pricing** | "Can we pay per consultation instead?" | Our unit economics depend on flat monthly fees. Per-unit pricing destroys margins. |
| **Revenue share** | "Can we pay you a % of bookings instead?" | No. We don't track clinic revenue. Creates accounting/legal complexity. |
| **Enterprise tier** | "We need an Enterprise plan with unlimited" | We intentionally have only 2 tiers. Keeps support simple. |
| **Annual discounts** | "Can we get 20% off if we pay yearly?" | Cash flow consideration only. Not a product change. Discuss internally — not a dev decision. |
| **White-label** | "Can we remove Moon Hands branding?" | Not on the roadmap before Year 2. Brand presence = trust signal for other clinics. |
| **Reseller terms** | "We want to sell this to our network" | Requires legal entity changes, revenue sharing, SLA guarantees. Not until 100+ clinics. |
| **Payment processing** | "Can patients pay through the AI?" | **NEVER.** AI does not handle money. Manual invoicing only. |

### 1.3 Security & Data (NEVER)

| Request Category | Example Request | Why Declined |
|-----------------|-----------------|--------------|
| **Disable injection blocking** | "The AI is too strict, can you loosen it?" | No. One clinic's convenience ≠ compromising security for all clinics. |
| **Custom rate limits** | "Can you increase our message limit?" | Tier limits exist to protect our margins. Upgrade to Professional. |
| **Turn off RLS** | "We want our data fully accessible" | RLS is non-negotiable. It's the law (PDPA) and protects all clinics. |
| **Export raw logs** | "Can we export all conversation logs?" | Available via Telegram `/usage` command. Raw logs contain system data. |
| **Access other clinic data** | "Can we see industry benchmarks?" | Zero cross-tenant data access. Even anonymized aggregates require legal review. |
| **Disable security alerts** | "We don't want Telegram alerts" | Security alerts are mandatory. Client doesn't control our security posture. |
| **Custom auth methods** | "Can we use our clinic's SSO?" | Our auth is Telegram-based with ID whitelist. No exceptions. |

### 1.4 Vendor & Technology Stack (NEVER)

| Request Category | Example Request | Why Declined |
|-----------------|-----------------|--------------|
| **Switch WA provider** | "Can you use Twilio instead of 360dialog?" | Stack is locked. 360dialog is architecturally superior for our model. |
| **Switch voice engine** | "Can you use [competitor] instead of VAPI?" | Stack is locked. Prompt library, voice training, and integration are built around VAPI. |
| **Switch database** | "Can you move us to [other DB]?" | Impossible. Our entire backend depends on Supabase PostgreSQL + RLS. |
| **Add integrations** | "Can you connect to our EMR system?" | Not before Year 2. EMR integration requires Singapore HSA compliance review. |
| **Custom AI model** | "Can you use GPT-5 / Claude / [other]?" | We use VAPI's AI engine. Switching models requires retraining all voice prompts. |

---

## 2. THE GREEN ZONE (Accepted Within Tier Limits)

These are **within the scope of what they already paid for.** No extra dev work required.

### 2.1 Always Approved (Same Day)

| Request | How Fulfilled |
|---------|---------------|
| "Update our treatment menu" | `/addservice`, `/removeservice` via Telegram |
| "Change our operating hours" | `/updatehours` via Telegram |
| "Add a new FAQ" | `/addfaq` via Telegram |
| "Update pricing" | `/updateprice` via Telegram |
| "Change AI voice style" | `/updatevoice` via Telegram |
| "Pause our service" | `/pause <id>` via Telegram |
| "Resume our service" | `/resume <id>` via Telegram |
| "Send us our usage report" | `/usage <id>` via Telegram |

### 2.2 Approved Within Tier Limits

| Request | Starter | Professional |
|---------|---------|--------------|
| Add more treatments to menu | Up to 15 | Up to 30 |
| Add more FAQs | Up to 20 | Up to 50 |
| Custom voice training | Standard voices only | Yes — custom voice clone |
| Share treatment photos | No | Yes — approval queue |
| Instagram/Facebook DM | No | Yes — optional activation |
| Additional phone lines | 1 only | Up to 3 |
| Priority support | Standard | 4h response |

---

## 3. THE GREY ZONE (Evaluated Case-by-Case)

These **might** be possible but require a business case analysis before approval.

### Evaluation Framework

Before considering any grey zone request, answer these 5 questions:

| # | Question | If YES | If NO |
|---|----------|--------|-------|
| 1 | Does it benefit **multiple clinics**, not just one? | Consider for product roadmap | Decline |
| 2 | Does it **increase revenue** or **reduce churn**? | Strong case | Weak case |
| 3 | Does it require **code changes**? | Estimate dev hours | May be trivial |
| 4 | Does it **break our security model**? | Auto-decline | Proceed |
| 5 | Would it **complicate support**? | Weigh against benefit | Proceed |

**Rule: 4+ YES answers = Consider. 3 or fewer = Decline.**

### Grey Zone Examples

| Request | Analysis | Likely Decision |
|---------|----------|-----------------|
| "Can the AI send follow-up messages 3 days after treatment?" | Benefits all clinics. Increases retention. Simple cron job. | **Approved** — Add to scheduled jobs |
| "Can we have a custom greeting message?" | Per-clinic config. No code change. Use existing field. | **Approved** — Add to client_configs JSONB |
| "Can the AI speak Malay/Tamil?" | Benefits Singapore market. VAPI supports it. Requires prompt work. | **Evaluated** — If 3+ clinics request it |
| "Can you add SMS appointment reminders?" | Benefits all clinics. Uses Twilio backup. Simple implementation. | **Approved** — Uses existing infra |
| "Can patients reschedule via the AI?" | Benefits all clinics. Complex state management. Requires testing. | **Evaluated** — Requires 2-week dev cycle |
| "Can we have different AI personalities per channel?" | Professional only. Complex to manage. | **Declined** — Too complex for support |
| "Can the AI handle complaint escalation?" | Benefits all clinics. Security risk if mishandled. | **Evaluated** — Requires careful prompt design |
| "Can we have a referral program?" | Revenue driver. But requires tracking infrastructure. | **Declined until 50+ clinics** |

---

## 4. HOW TO SAY NO (Communication Templates)

### Template A: Infrastructure Request
> "Thank you for the suggestion! Our infrastructure is standardized across all clinics to ensure security and reliability. We can't make architecture-level changes for individual accounts, but your feedback helps us prioritize our product roadmap. Is there a specific workflow problem we can help solve within our existing features?"

### Template B: Custom Development Request
> "We appreciate you thinking of ways to improve the system! We keep a standardized product to ensure every clinic gets the same secure, reliable experience. Custom development isn't part of our service model. If this is a challenge multiple clinics face, we'd love to hear more — it may become a standard feature in the future."

### Template C: Pricing/Contract Request
> "Our pricing is designed to be simple and transparent across all clinics. We don't offer custom pricing structures, but I'd be happy to walk you through how Professional tier clinics typically see a 27x ROI in their first month. Would you like me to show you the numbers?"

### Template D: Security-Related Request
> "Great question! Our security framework is standardized across all clinics and can't be modified for individual accounts. This protects your patient data — and every other clinic's data too. It's one of the reasons clinics trust Moon Hands. Is there a specific workflow challenge I can help you work around?"

### Template E: "But [competitor] does it"
> "I hear you. Different products make different architectural choices. We prioritize security and standardization over customization — which is why we've never had a data breach or cross-clinic leak. If [feature] becomes important for the majority of our clinics, it will become a standard feature. For now, let me show you how our existing features solve your core challenge..."

---

## 5. THE ESCALATION PATH

When a client pushes back on a declined request:

```
Client asks for RED LINE item
         ↓
You: Decline using Template A-E
         ↓
Client pushes back ("We're paying $547/mo!")
         ↓
You: Acknowledge + reframe ("I understand this matters to you. Our architecture
     protects your data. Let me show you what we CAN do...")
         ↓
Client still insists
         ↓
You: "Let me discuss this with our technical team and get back to you"
         ↓
Internal discussion (you + me, not with the client)
         ↓
Final answer: Yes / No / Compromise / Grey zone evaluation
         ↓
You respond with clear reasoning
```

**Critical rule:** Never promise anything to the client before internal discussion. Never say "I'll ask my developer" — it implies the developer might say yes. Say "I'll discuss this with our team."

---

## 6. WHAT'S PROTECTED BY THIS POLICY

| Asset | What This Policy Protects |
|-------|--------------------------|
| **12-table PostgreSQL schema** | No schema changes per client. Use JSONB for flexibility. |
| **RLS policies** | Never disabled, never bypassed, never modified per client. |
| **12-layer security** | All 12 layers apply to all clients equally. No exceptions. |
| **2-tier pricing model** | Keeps support simple, prevents margin erosion. |
| **Tech stack lock** | No vendor switching per client. Stack decisions are strategic. |
| **Code standardization** | Single codebase. Zero custom branches per client. |
| **Multi-tenant isolation** | One client can never affect another's data, performance, or experience. |
| **Margin structure** | Our 75-85% gross margins depend on standardized delivery. |

---

## 7. THE "CONVENIENCE TAX" PRINCIPLE

> **Every exception we make for one client becomes a maintenance burden for us and a support nightmare forever.**

When evaluating grey zone requests, apply the **Convenience Tax:**

| If the request... | The tax is... |
|-------------------|---------------|
| Requires a code change | 2x the estimated dev time (maintenance forever) |
| Requires a new table/column | 5x the estimated effort (migrations, RLS, views) |
| Requires a new integration | 10x the estimated effort (vendor management, auth, monitoring) |
| Breaks our 2-tier model | Infinite — we don't do it |
| Requires disabling a security layer | **Infinite — we NEVER do this** |

**Example:** A client asks for "just a small custom field for patient preferences." Seems tiny. But:
- Add column → migration script
- Update RLS policy → security review
- Update Telegram commands → bot testing
- Update simulator → UI testing
- Document the feature → support knowledge base
- Handle edge cases → "What if they add 500 preferences?"

**"Small" requests are never small. The Convenience Tax is real.**

---

*This policy is non-negotiable. It protects our business, our code, our margins, and every clinic on our platform. Every enhancement request gets filtered through this document before any work begins.*
