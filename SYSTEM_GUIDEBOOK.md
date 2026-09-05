# 📘 Moon Hands System Guidebook (Master Snapshot)

> **Snapshot date:** 2026-09-05 · **Codebase:** `PixelVaultSG/moon-hands-backend` @ `main` (verified working in production)
> **Purpose:** This is the single source of truth for how the Moon Hands platform works today — settings, logic, configuration, dependencies, and design. All new clinics are cloned from this mould. When the system changes, update this document in the same commit.

---

## 1. What the System Is

Moon Hands is a managed AI receptionist platform for Singapore aesthetic clinics:

- **WhatsApp AI receptionist** (via 360dialog) — chats with customers, answers questions, books appointments with a guided, button-driven flow, captures name + phone, computes price totals (incl. ranges), and confirms bookings.
- **Telegram Admin Bot** (Moon Hands team) — clinic-first dashboard to view/edit any clinic's config, monitor health/security/usage, and approve clinic change requests.
- **Telegram Clinic Bot** (per-clinic staff) — booking notifications, daily summaries, staff takeover, and `/req_*` change requests that require Moon Hands admin approval.
- **Voice AI** (VAPI) and **SMS** (Twilio) — optional per-clinic channels.
- **Google Calendar** sync — per-clinic OAuth, bookings written to the clinic's calendar with .ics invites.

Everything is **config-driven per clinic**: one codebase, one deployment, N clinics. Clinics differ only by their database rows (`clients` + `client_configs`), never by code forks (see `docs/PER_CLINIC_CONTAINERIZATION.md`).

---

## 2. Runtime & Deployment

| Item | Value |
|---|---|
| Runtime | Node.js **22** on Render (⚠️ sandbox Node 20 breaks Supabase realtime — production-only symptom) |
| Entry | `server.js` (Express) |
| Scheduler | `telegram/scheduler.js` (`npm run scheduler`) |
| Hosting | Render web service, auto-deploys from `main` — **always deploy with "Clear Build Cache & Deploy"** |
| Database | Supabase (Postgres, JSONB configs, RLS) |
| Repo | GitHub `PixelVaultSG/moon-hands-backend` |

### Environment variables
| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Yes | Database |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID` | Yes | Admin bot + alerts |
| `API_KEY`, `WEBHOOK_SECRET` | Yes | Webhook auth (HMAC) |
| `OPENAI_API_KEY` | AI | GPT-4o-mini router/fallback |
| `D360_API_KEY` | WhatsApp | 360dialog send API |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Calendar | Per-clinic OAuth |
| `VAPI_API_KEY` | Voice | Optional |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | SMS | Optional |

### Dependencies (`package.json`)
`@supabase/supabase-js ^2.103.3` · `telegraf ^4.16.3` · `openai ^4.28.0` · `googleapis ^133.0.0` · `nodemailer ^6.9.7` · `node-cron ^3.0.3` · `dotenv ^16.6.1` · dev: `nodemon ^3.1.9`

---

## 3. Directory Map

```
server/          Express routes: webhook.js (WhatsApp/voice/onboarding), calendar-service.js
ai/              Smart router, state machine, intent handlers, WhatsApp interactive builders,
                 expert-system (function calling), scenario test harness
telegram/        bot.js (admin+clinic bot), commands/, change-requests.js, approvals,
                 alerts/, booking-notifications.js, multi-clinic-sender.js, scheduler.js
middleware/      security, cost-protection, smart-rate-limiter, per-customer-rate-limiter,
                 loop-protection, staff-takeover, usage-tracker
supabase/        schema.sql + migrations, client.js (data access), usage-logger.js
utils/           price.js (price engine), date-helpers, ical-generator, welcome-email
jobs/            Cron: reminders, weekly reports, waitlist
docs/            Design + operations docs
```

---

## 4. Data Model (the mould every clinic is stamped from)

### `clients` (one row per clinic)
`slug` (unique, e.g. `pixelvault`) · `name` · `contact_name/email/phone` · `industry` · `plan` (`starter|professional`) · `status` (`setup|active|paused|cancelled`) · `whatsapp_number` · `google_calendar_id`

### `client_configs` (one row per clinic — the entire personality & menu)
| Field | Type | Notes |
|---|---|---|
| `agent_name` | text | Default `Sophia` |
| `greeting` | text | `{businessName}` placeholder supported |
| `tone` / `enthusiasm` | text | friendly/professional/casual · low/medium/high |
| `services` | JSONB | `[{ name, price, duration, category? }]` — **price stored exactly as typed, `$` kept** (`$380`, `$50-$100`) |
| `operating_hours` | JSONB | Per-day `isOpen/open_time/close_time` |
| `faqs` | JSONB | `[{ question, answer }]` |
| `appointment_duration` | int | Default 60 |
| `buffer_time` | int | Default 15 |
| `max_per_day` | int | Default 12 |
| `cancellation_policy` | text | |
| `languages` | text[] | Default `['en']` |
| `automations` | JSONB | bookingConfirmation, reminder24h, reminder1h, followup48h |
| `vapi_assistant_id`, `twilio_phone_sid`, … | text | Optional channel wiring |

Other tables: `bookings` (pending/confirmed), `change_requests` (two-sided approval), usage tracking, security events, audit log, kv_store, onboarding submissions.

**Invariants enforced in code:**
- `addService` **dedupes by name (case-insensitive)** — re-adding updates in place (prevents duplicate WhatsApp row IDs).
- Prices are never mutated on display — every renderer strips a leading `$` before prefixing its own (idempotent `$`).

---

## 5. WhatsApp Receptionist Logic

### 5.1 Booking state machine (`ai/conversation-state.js`)
```
IDLE → BOOKING_OFFERED → AWAITING_DATE → AWAITING_TIME
     → SELECTING_CATEGORY → AWAITING_TREATMENT → TREATMENT_INFO
     → (EDITING_BOOKING) → AWAITING_NAME → AWAITING_PHONE
     → AWAITING_CONFIRMATION → READY_TO_BOOK
```
- 60-minute in-memory TTL per customer; off-topic messages and cancel words escape the flow at any state.
- `MULTI_INTENT_CONFIRM` handles "book X and also ask about Y".

### 5.2 Name & phone capture (required for clinic callback)
- WhatsApp profile name captured automatically from every inbound message (`value.contacts[0].profile.name`) into a 180-day known-name store.
- On Confirm: if no name known → `AWAITING_NAME` gate asks; `extractValidName` strips "my name is / call me / I'm", rejects digits, service names, yes/no words, <2 or >40 chars.
- Confirmation card shows `👤 name`, `📱 +phone`, date/time, treatments, duration, total.

### 5.3 Price engine (`utils/price.js`)
- `parsePrice(str)` — `"$50-$100"` → `{min:50, max:100, isRange:true}`; `"$350"` → `{min:350,max:350}`; handles commas, `–/—`, "to"; `null` if unparseable.
- `normalizePrice(str)` — canonical storage: `"$50-$100"` / `"$350"` (keeps `$`, exactly as typed).
- `sumServicePrices(services)` — `{min, max, isRange, hasPrice}` across a booking.
- `formatPriceTotal(min, max)` — `"$880"` or `"$130-$380"`.
- ⚠️ Never `parseInt(price.replace(/[^0-9]/g,''))` — that turns `$50-$100` into `$50,100` (the original bug).
- Range totals are labelled *"(final price confirmed at the clinic)"* in customer-facing text.

### 5.4 WhatsApp interactive message limits (360dialog) — hard rules
Violating **any** limit rejects the **entire** message silently (dead air). `ai/whatsapp-interactive.js` enforces all of these automatically:
| Element | Limit | Guard |
|---|---|---|
| List rows / section | ≤ 10 | `slice(0,10)` |
| Row title | ≤ 24 chars | `clampText` (+`…`) |
| Row description | ≤ 72 chars | `clampText` |
| Row IDs | unique, ≤ 200 | `uniqueIds` dedupe |
| Quick-reply buttons | ≤ 3 | `slice(0,3)` |
| Button title | ≤ 20 chars | `clampText` |
| Header | ≤ 60 chars | `clampText` |

Plus a **plain-text numbered fallback**: if every interactive endpoint rejects, the same options are re-sent as a numbered text list, so the customer is never met with silence.

### 5.5 Service categorisation
One ruleset shared by list-builder and tap-filter (`intent-handlers.handleServiceList` ≡ `smart-router.getCategory`) — Facials, Laser, Injectables, Body, Other. Category counts shown in the list; tapping a category filters services deterministically.

---

## 6. Telegram Bots Logic

### 6.1 Auth & safety
- `bot.use` gate: Moon Hands admin **or** linked clinic chat **or** `/start` only.
- Callback guard: only whitelisted prefixes (`menu_`, `act:`, `clinic_`, `chg_`, `clinicdash:`) processed.
- `adminCmd` wrapper for admin-only commands; `safeHandler` for clinic commands.
- Stale-message drop on resume (no reply flood); per-customer rate limiting; staff takeover pauses AI.

### 6.2 Admin flow — **clinic-first**
1. `/start` or `/menu` → **"Which clinic do you want to check/edit?"** — dynamic keyboard: global tools (Status / Clinics / Security / Full Command List) + one button per clinic (`clinicdash:<slug>`).
2. Tapping a clinic → per-clinic dashboard: View Config · Usage · Add Service · Update Price · Update Hours · Add FAQ · Voice · Pause · Resume · 🔙 Back.
3. Add Service / Update Price exist **only inside a selected clinic** — never on the top menu.

### 6.3 Admin commands
`/viewconfig /addservice /updateprice /removeservice /updatehours /addfaq /removefaq /updatevoice /pause /resume /usage /health /security /threats /authlog /debug /clients /requests /pending /approve /reject`

Price syntax accepts quoted ranges:
```
/addservice pixelvault "Consultation" "$50-$100" 60
/updateprice pixelvault "Consultation" "$50-$100"
```
Both validate + canonicalise via `normalizePrice`.

### 6.4 Two-sided change requests (`telegram/change-requests.js`)
Clinic staff: `/req_addservice /req_updateprice /req_hours /req_faq /req_voice` → admin gets **Approve/Reject** buttons → both sides notified; nothing changes without admin approval.

### 6.5 Clinic staff commands
`/menu` (own clinic dashboard) · My Bookings · `/patientpause /patientresume /patientstatus` · `/takeover` · `/testsummary`

### 6.6 Markdown safety
Markdown v1 escaper `esc1` (`\_\*\`\[`) for v1 messages; safeReplyMD fallback strips escape backslashes and stray `*_` before plain-text retry — no literal `50\-$100` or `PicoSure Laser \ + Botox`.

---

## 7. Safety & Cost Middleware

`security.js` (HMAC webhook verification, threat log) · `cost-protection.js` (OpenAI spend caps) · `smart-rate-limiter.js` + `per-customer-rate-limiter.js` · `loop-protection.js` (bot-loop detection) · `staff-takeover.js` (human override pauses AI per customer) · `usage-tracker.js` (per-clinic metering for billing).

---

## 8. Git & Release Protocol

1. Work on `main` locally in the repo clone; commit logically-scoped changes (`git add` **named files only** — never `git add -A`).
2. Verify: `node --check` every touched file; run focused unit checks for parsers.
3. Push (sandbox uses GitHub Git Data API: blobs → tree → commit → PATCH ref).
4. Deploy on Render: **Clear Build Cache & Deploy**.
5. Verify in production with the exact user flow that motivated the change.
6. Update this guidebook in the same commit when behavior/config changes.

---

## 9. Current Production Clinics

| Slug | Name | Status | Notes |
|---|---|---|---|
| `pixelvault` | Pixel Vault Aesthetics | active (test clinic) | Reference implementation — the mould |

---

## 10. Known Constraints / Non-Bugs

- Supabase realtime fails on Node 20 (sandbox) — production Node 22 is fine.
- Booking state is in-memory (60-min TTL) — restarts clear in-flight bookings; customers simply restart the flow.
- Existing DB rows created before the `$`-storage fix may show `50-100`; re-adding the same service name updates in place to `$50-$100`.
