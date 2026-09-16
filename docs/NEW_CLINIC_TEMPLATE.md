# 🧩 New Clinic Template & Provisioning Guide

> **Last synced:** 2026-09-05

> Every new clinic starts as an exact copy of the **Pixel Vault mould** (see `SYSTEM_GUIDEBOOK.md`). A clinic = 2 database rows + channel wiring. **No code changes are needed to onboard a clinic.**

---

## 1. The Template (what every clinic inherits)

| Component | Default (from mould) |
|---|---|
| AI agent | Name `Sophia`, friendly tone, medium enthusiasm |
| Booking flow | Full state machine: date → time → category → treatment → name/phone → confirm |
| Pricing | Fixed (`$380`) or range (`$50-$100`); totals auto-computed on WhatsApp |
| Hours | Mon–Fri 09:00–18:00, Sat 09:00–14:00, Sun closed |
| Booking rules | 60-min appointments, 15-min buffer, max 12/day, 24-h cancellation |
| Automations | Confirmation ✅ · 24h reminder ✅ · 1h reminder ❌ · 48h follow-up ✅ |
| Languages | English (add `zh`, `ms`, `ta` per clinic) |
| Telegram | Clinic staff bot: bookings, summaries, takeover, `/req_*` change requests |
| Safety | Rate limits, cost caps, loop protection, staff takeover — all on |

---

## 2. Provisioning Checklist (≈30 min per clinic)

### Step 1 — Create the clinic rows (2 min)
Run `supabase/setup-clinic-template.sql` in the Supabase SQL Editor after filling in the placeholders at the top, **or** run this minimal version:

```sql
-- 1. Clinic row
INSERT INTO clients (name, slug, contact_name, contact_email, contact_phone, whatsapp_number, plan, status, industry)
VALUES ('{{Clinic Name}}', '{{slug}}', '{{Owner}}', '{{email}}', '{{phone}}', '{{whatsapp}}', 'starter', 'setup', 'aesthetic');

-- 2. Config row (inherits every default; customise below)
INSERT INTO client_configs (client_id, agent_name, greeting)
SELECT id, 'Sophia', 'Hello! Welcome to {businessName}. How can I help you today?'
FROM clients WHERE slug = '{{slug}}';
```

**Slug rules:** lowercase, one word, no spaces — it appears in every Telegram command (`/addservice {{slug}} …`).

### Step 2 — Load services & FAQs (10 min, via Telegram admin bot)
```
/addservice {{slug}} "Consultation" "$50-$100" 60
/addservice {{slug}} "HIFU Treatment" "$350" 60
/addfaq {{slug}} "Do you have parking?" "Yes — validated parking at …"
```
- Quote the service name and any range price.
- Re-adding an existing name updates it in place (no duplicates).

### Step 3 — Set hours (if different from default)
```
/updatehours {{slug}} saturday 10:00-16:00
/updatehours {{slug}} sunday closed
```

### Step 4 — Wire channels
- **WhatsApp:** point the clinic's 360dialog number webhook to `POST /webhook/whatsapp` with the shared secret; set `clients.whatsapp_number`.
- **Telegram clinic bot:** owner opens the bot in the clinic's staff group → `/start` links the chat (see `migration_add_telegram_chat_ids.sql`).
- **Google Calendar (optional):** OAuth via the onboarding link; sets `google_calendar_id`.

### Step 5 — Go-live checks (use `GO_LIVE_CHECKLIST.md`)
1. `/viewconfig {{slug}}` — services, prices, hours all correct.
2. WhatsApp the clinic number: greeting → book a treatment → confirm card shows name, phone, total.
3. Book → clinic Telegram receives notification; customer receives confirmation.
4. `/pause {{slug}}` then `/resume {{slug}}` — verify no reply flood.
5. Set `status = 'active'`.

---

## 3. Clinic-Specific Customisation (instructions to your AI engineer)

To change **one** clinic without touching others, give instructions scoped by slug, e.g.:

> "For `glowclinic` only: greeting in Singlish, add service 'Gold Facial' $188 90min, Sundays closed."

Everything in `client_configs` is per-clinic by construction. For **behavioural** changes beyond config (unique flows, integrations), follow `docs/PER_CLINIC_CONTAINERIZATION.md` — feature flags in `client_configs.automations`/JSONB, never code forks.

---

## 4. What a New Clinic Does NOT Get Automatically

| Item | Why | How to add |
|---|---|---|
| Google Calendar | Per-clinic OAuth consent | Owner completes OAuth link |
| Custom booking rules | Vary by clinic | Set `appointment_duration`, `buffer_time`, `max_per_day` |
| Non-English replies | Per-clinic | Set `languages` array (EN/ZH/MS offered) |
| ~~Voice AI / SMS~~ | ⚠️ Not part of the current offering (2026-09-05) | Do not provision without a product decision |

**Plan field:** set `clients.plan` to the purchased tier (`basic` = S$347, `premium` = S$547). Note: plan is currently billing/record-keeping only — no per-plan feature gating is live yet (see `SYSTEM_GUIDEBOOK.md` §4a).
