# Moon Hands — Clinic Enhancement Request Workflow

**Last updated:** 2026-06-14
**Status:** Active — Telegram bot operational, all commands working

---

## The Workflow (3 Steps)

```
Clinic emails you → You tell me → I make the change
```

**Your email:** `pixelvaultsg@gmail.com`
**Communication:** Copy-paste clinic requests into our chat. I confirm, then execute.

---

## What's New (June 2026)

| Feature | Status |
|---------|--------|
| 5 essential message templates | ✅ Built (booking confirmation, reminder, follow-up, welcome, cancellation) |
| Delivery status tracking | ✅ Built (sent → delivered → read → failed alerts) |
| Tier 1/Tier 2 onboarding | ✅ Built (auto-detection + guided flow) |
| Tier 2: Kimi initiates support | ✅ Built (Kimi WhatsApps clinic proactively, not reactive) |
| Pixel Vault Support AI | 🔄 Pending your 360dialog WABA setup |
| Query param auth | ✅ Deployed (no more WEBHOOK_AUTH_REQUIRED=false) |
| Security audit (15 findings) | ✅ All fixed |
| 1002-scenario AI test suite | ✅ Built |
| 11 staff agents documented | ✅ Complete |
| `/clients` command | ✅ Fixed (plain text, no more crashes) |
| `/help` command | ✅ Fixed (plain text, no more silent failures) |
| Keepalive false alerts | ✅ Fixed (only alerts on actual server failures) |
| Supabase sb_secret_ key format | ✅ Fixed (supports both old JWT and new Secret API keys) |
| 360dialog research | ✅ Completed (costs accurate, features identified) |

---

## Cost Accuracy (Verified)

Our projections were validated against actual 360dialog and Meta pricing:

| Cost Item | Our Projection | Actual | Status |
|-----------|---------------|--------|--------|
| 360dialog API fee | ~S$72/month (shared) | €49/month (~S$72) | ✅ Accurate |
| Per-message cost | ~S$10/clinic/month | S$0 (service msgs free) + ~S$5 templates | ✅ Conservative |
| OpenAI cost | ~S$0.01/message | ~S$0.008/message | ✅ Accurate |
| Render hosting | S$9.45/month | S$9.45/month Starter | ✅ Exact |
| **Total per clinic** | **S$150-200/month** | **S$100-150/month actual** | ✅ **Conservative buffer** |
| **Our charge** | **S$347-547/month** | — | ✅ **50-70% gross margin** |

### Step 1: Clinic Emails You

Clinic replies to their welcome email (or any Moon Hands email) with requests like:

> "Hi, we added PicoSure Laser. Price: $650, duration: 45min. Also, our Saturday hours changed to 9am-6pm."

**Your email:** `pixelvaultsg@gmail.com`

### Step 2: You Forward to Me

**Best method:** Copy-paste the clinic's request into our chat. I will:
1. Parse what needs to change
2. Confirm the change with you
3. Execute via the admin Telegram bot or direct code change

**Alternative:** If you prefer async, forward the email to a shared inbox and I'll pick it up.

### Step 3: I Execute the Change

Depending on the request type, I use the appropriate tool:

| Request Type | How I Execute | Time |
|-------------|---------------|------|
| Add/remove treatment | Telegram bot: `/addservice` or `/removeservice` | 1 min |
| Update price | Telegram bot: `/updateprice` | 1 min |
| Update hours | Telegram bot: `/updatehours` | 1 min |
| Add/remove FAQ | Telegram bot: `/addfaq` or `/removefaq` | 1 min |
| Change AI greeting/tone | Telegram bot: `/updatevoice` | 1 min |
| Pause/resume clinic | Telegram bot: `/pause` or `/resume` | 1 min |
| Complex changes (code) | Direct code edit + GitHub push + deploy | 5-30 min |

---

## What Clinics CAN Request

### Simple (via Telegram bot — instant)

- Add new treatment to menu
- Remove discontinued treatment
- Update pricing
- Change operating hours
- Add/remove FAQs
- Change AI agent name, greeting, or tone
- Pause clinic (e.g., holiday closure)
- Resume clinic

### Complex (requires code change)

- New booking features (e.g., group booking)
- New AI capabilities (e.g., new language support)
- Calendar integration changes
- Custom notification rules
- New onboarding fields
- Website changes
- Pricing plan changes

---

## Telegram Bot Commands Reference

All commands require your admin access. Clinic cannot use these directly.

```
/clients              — List all clinics
/viewconfig <id>      — View clinic's full config
/addservice <id> <name> <price> <duration> <category>
                      — Add a treatment
/removeservice <id> <name>
                      — Remove a treatment
/updateprice <id> <name> <newprice>
                      — Update treatment price
/updatehours <id> <day> <open> <close>
                      — Update operating hours
/addfaq <id> <question> | <answer>
                      — Add FAQ
/removefaq <id> <number>
                      — Remove FAQ by number
/updatevoice <id> <field> <value>
                      — Update AI tone/greeting/name
/pause <id>           — Pause clinic
/resume <id>          — Resume clinic
/usage                — View usage stats
/health               — System health check
```

---

## Example Workflow

**Clinic email:**
> "We want to add EMSculpt to our menu. It's $580 per session, 30 minutes, under Body Contouring category. Also please update our Saturday hours — we now close at 5pm instead of 6pm."

**You tell me:**
> "Glow Aesthetics: Add EMSculpt $580/30min Body Contouring. Change Saturday close to 17:00."

**I execute:**
```
/addservice glow-aesthetic-clinic EMSculpt $580 30min Body Contouring
/updatehours glow-aesthetic-clinic Saturday 10:00 17:00
```

**Done.** Clinic gets the updated menu immediately (no restart needed).

---

## Communication Protocol Between Us

**For fastest turnaround, message me with:**

1. **Clinic name** (or ID)
2. **What changed** (be specific)
3. **New values** (exact text/numbers)

**Example:**
```
Clinic: Glow Aesthetics
Change: Add treatment
Name: PicoSure Laser
Price: $650
Duration: 45min
Category: Laser
```

**I will confirm before executing.** No changes made without your approval.

---

## Future: Automated Enhancement Capture

When ready, we can build:

1. **Structured email parser** — Clinic emails trigger automatic ticket creation
2. **Approval queue** — You review and approve/reject with one click
3. **Audit log** — All changes tracked with who, what, when
4. **Clinic confirmation** — Clinic gets notified when their change is live

This is Phase 2. For now, manual workflow above is sufficient for 1-5 clinics.

---

*Moon Hands by Pixel Vault Pte Ltd*
