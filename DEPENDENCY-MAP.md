# DEPENDENCY-MAP — Moon Hands Backend
**Standing order:** update this file in the same commit as any change that touches a listed module. A map entry that drifts is a bug. Companion: the harness (`test_v220.js`) is the executable half — if a behavior matters, pin it there AND list it here.
Seeded 2026-11-13 from the booking-flow audit (v2.5.5). Updated v2.5.6 (F1 keys), v2.5.7 (F2 refusal + /trace), v2.5.8 (B2-1 clinic-id property bug — found by the first synthetic scenario run). Format per module: **Reads / Writes / Breaks-if-you-change / Pinned-by.**

---

## Invariants (never break these)

1. **Hours schema:** engine-consumable `operating_hours` = NAMED `[{day:'Monday',open_time,close_time,isOpen}]`. The form stores POSITIONAL `{open,close,isOpen}` (Mon-first) — only `onboarding-approvals.js` transforms. Any new writer of `operating_hours` MUST write the named schema.
2. **Config truth:** the engine reads `client_configs.config` **jsonb first**, columns second (bot-engine `loadClientConfig`). Reminders + `/config` read columns. New fields → jsonb AND column, or document why not.
3. **`??` for falsy-meaningful values:** `false`, `0` are real settings (auto-confirm OFF, 0h notice, 0 buffer). `||` anywhere in a config path is a bug.
4. **Telegram legacy Markdown:** escape set is `/[_*`\[]/g` only — escaping MarkdownV2 chars (`.` `-` etc.) leaks literal backslashes into messages.
5. **`ctx.message` is getter-only** (telegraf). Never assign it; pass refs explicitly to handlers.
6. **`dropPendingUpdates: false`** — deploys must not discard in-flight taps. Replay safety depends on: onboarding resolveSubmission matches `status='pending'` only; `confirm_alt_` has the v2.4.6 marker guard.
7. **Clinic sleep vocabulary:** asleep = `clients.status != 'active'`. ~~There is no `'asleep'` value~~ — F6 introduced a literal `status='asleep'` (Pixel Vault Aesthetics carries it); the `!= 'active'` comparison remains the contract. Any new status value must be checked against every `= 'active'` filter (see Cron/jobs below). **F4 closed (v2.5.15):** reminders.js (24h/1h/48h — `filterActiveClientIds`), trial-expiry-checker.js (all 3 queries), waitlist-reengagement.js (findRecentlyCancelledAppointments) all filter `status='active'`, fail-closed on filter error (a skipped cycle retries; a message from a sleeping clinic does not unsend).
8. **Onboarding containment:** submissions quarantine in `onboarding_submissions` until approval creates NEW `clients`+`client_configs` rows. Nothing in onboarding may UPDATE an existing clinic.
9. **MADS:** no medical advice, ever — refusal + ER redirect + doctor callback. Non-negotiable regardless of prompt changes.
10. **Watchdog:** `startBot` retry-on-409/network is infinite by design; non-retryable = alert + `process.exit(1)`. Never reintroduce a give-up-and-run-deaf path.
11. **Form inline handlers:** no bare `form.*` references in inline handlers on form controls (the `.form` DOM-shadowing trap, v2.4.9) — always function indirection.
12. **D360 key resolution (v2.5.6):** outbound WhatsApp key = `clients.d360_api_key ?? env D360_API_KEY`, resolved ONLY via `utils/d360-keys.js resolveD360ApiKey(clinicUUID)`. Never pass the URL slug. Never read `process.env.D360_API_KEY` directly in a patient-facing send path. The resolver latches on 42703 (column pre-migration) and fails safe to env — deploy order vs the SQL migration is irrelevant by design. Cache 5 min; rotation takes effect within that window. Two deliberate env-only sends: the onboarding welcome (clinic has no account at approval time) and stalled-conversation follow-ups (state records are phone-keyed, no clinic id — residual).
13. **Config failure = REFUSAL (v2.5.7, F2 closed):** `loadClientConfig` returns null on any load failure; `processMessage` replies with an honest "temporarily unavailable" (`model: 'config-refusal'`) and a throttled critical admin alert fires. The demo config is NEVER served to a real clinic's patients. `getDemoConfig()` survives for tooling only — nothing in the serving path may call it.
14. **Clinic UUID property (v2.5.8, finding B2-1):** on engine configs (loadClientConfig, DIRECT_BYPASS) the clinic UUID is `.id` — the jsonb NEVER carries `client_id`. Any handler querying `appointments`/`client_configs` by clinic MUST use `clinicConfig.client_id || clinicConfig.id` (defensive both-shapes). A bare `.client_id` reference is a silent-match-nothing bug (patient cancel/reschedule/check were dead from birth until v2.5.8).
15. **One live calendar event per booking (v2.5.10, findings R-2/R-3):** approval NEVER blind-creates — `createOrPatchBookingEvent` (telegram/commands/approvals.js) PATCHES when `google_event_id` exists, creates otherwise. `updateBooking` (function-handlers) DELETES the old event via SA `deleteBookingEvent` on any schedule change and nulls the reference (fail-loud, keeps the id on failure so the approval patch can still move it). A blind `createBookingEvent` in an approval path is a duplicate-event bug; a schedule write without event handling is a ghost-slot bug (B2-2 class). State fields extracted from a patient message must be PERSISTED before any early return — the smart-router AWAITING_TIME no-time return dropped a mid-flow date change and silently booked the stale day (R-2).
16. **LLMs never do calendar math (v2.5.11/v2.5.12, finding P-1):** every patient-facing prompt gets `getSGDateContext(14)` (utils/date-helpers — today + 14-day weekday table, built on getDayOfWeekUTC). A bare "today is Friday" anchor is NOT enough: gpt-4o-mini still computed forward and told a patient "Wednesday is actually the 17th, not the 18th" (false). **And even the table was not enough (v2.5.12):** with the correct table in context the model still insisted "18 November falls on a Friday" (training-era memory — 18 Nov 2022 was a Friday). So `annotateDateConsistency` now verifies weekday+date combos in CODE and stamps an authoritative verdict onto the patient message before any LLM sees it (experts + generalist paths). Any new LLM entry point must pass patient text through it. P-2 corollary (v2.5.11): first messages that carry a real question must be ANSWERED — greetings are for small talk only, never a substitute for the answer.
17. **Availability claims must come from an executed check (v2.5.13, finding P-3):** with `function_call: 'auto'` the experts model could skip `check_availability` and IMPROVISE ("[After checking] yes, 10am is free" — no check ran; a booked slot would have been sold as free; one reply even claimed the demo clinic "cannot access real-time booking information"). Now `isAvailabilityQuestion` (patient-experts) detects slot questions deterministically — excluding pricing "free" ("is the consult free?") and patient-own-availability ("I'm free Saturday") — and FORCES `function_call: {name: 'check_availability'}`. The deterministic `fnResult.message` replaces the model's prose downstream, so closed-day/past-date/min-notice/max-advance in `checkAvailability` return `success:true` + empty slots + a patient-facing message (they are honest ANSWERS, not failures — `success:false` would keep the model's empty prose and fire a false stall alert; rescheduleBooking's refusal logic is unaffected). `checkAvailability` also finally HONOURS `preferred_time` (accepted-but-ignored since birth): the answer says whether the asked time is free, or names the nearest openings. Forced-call failure never sends a blank bubble (bot-engine fallback text). Any new availability-answering path must execute the check, never let the model assert availability from prose.
18. **LLM function args never reach the DB unvalidated (v2.5.16, F5):** `createBooking`, `updateBooking`, `rescheduleBooking` all pass date/time through `normalizeTo24h` + strict `isValidDateStr` (YYYY-MM-DD, real calendar date, leap-aware) / `isValidTimeStr` (HH:MM 24h) gates BEFORE any write. Model-hallucinated values ("next Friday", "25:99") are rejected with a re-ask; "2pm"-style values are normalized, not rejected. Smart-router values are already well-formed — the gate only bites malformed input. Any new function that writes appointment dates/times must pass through the same gate.

## Data-flow backbone

```
onboarding.html (public form)
  → POST /api/onboarding → server/onboarding-submission.js  [rate-limit, honeypot, sanitize]
  → onboarding_submissions (status=pending) ─ quarantine
  → Telegram card (onboarding_approve/reject buttons)
  → telegram/commands/onboarding-approvals.js  [slug gen, schema transforms, normalizer]
  → clients + client_configs  →  bot-engine loadClientConfig (jsonb-first)
  → patient-facing flows

Patient WhatsApp → 360dialog → /webhook/whatsapp?clinic_id&token → server/webhook.js
  → extractMessage → ai/bot-engine processMessage → ai/smart-router routeMessage
  → ai/intent-handlers / ai/expert-system/function-handlers
  → appointments row → telegram/booking-notifications (admin card) → patient reply via D360
```

## Module map

### server/webhook.js (1960 LOC) — the front door
- **Reads:** `clients` (webhook_token, status, whatsapp_number), `client_configs` (DIRECT_BYPASS loader), conversation state.
- **Writes:** security_events, traces; patient replies via D360.
- **Breaks-if-you-change:** auth order (DDoS → clinic token → parse → signature(skip for WA) → extract); staff-reply auto-pause (`from == clinic WABA`); DIRECT_BYPASS loader returns null on failure → falls through to processMessage refusal (Invariant 13 — consistent since v2.5.7); reply sends resolve per-clinic keys via Invariant 12; **`/trace` is the auth-gated observability endpoint (v2.5.7)** — message traces (200-ring), bot telemetry, admin command log, D360 key resolutions; keep it behind `checkAuth`, never log key material.
- **Pinned-by:** T57/T58 gates, T60s security pins.

### server/onboarding-submission.js — intake
- **Reads:** POST body. **Writes:** `onboarding_submissions` (+ self-heal retry dropping optional columns), Telegram card.
- **Breaks-if-you-change:** record keys must match form camelCase (`data.nearestMrt`, `data.contactEmail`); self-heal regex must cover every optional column; industry whitelist collapses non-chiro → aesthetic (F12); escape set (Invariant 4).
- **Pinned-by:** T66/T67.

### telegram/commands/onboarding-approvals.js — approval forge
- **Reads:** onboarding_submissions, clients (slug collision). **Writes:** clients, client_configs (jsonb + columns), submission status.
- **Breaks-if-you-change:** positional→named hours transform; dual-schema services normalizer (dur/desc/cat + duration/description/category + unit); FAQ blank-row filter; jsonb+column sync (v2.5.3); NO WhatsApp on reject (v2.5.5); welcome WA on approve only; handlers take `refArg` (Invariant 5). **F7 closed (v2.5.17):** the approval card must report REAL outcomes — welcome WA is attempted BEFORE the card (recipient-guarded, outcome `sent ✅ / FAILED ⚠️ / skipped — no number`) and a config-insert failure appears as "CONFIG INSERT FAILED — bot REFUSES all patients" (was: console-only while the card claimed LIVE). Copy honesty (v2.5.18, Ash picked option a): welcome WA says the assistant "is being set up — we'll confirm as soon as it's ready to take patient inquiries" instead of claiming "ready 24/7" before calendar/D360 wiring exists.
- **Pinned-by:** T67–T72.

### ai/bot-engine.js — brain stem
- **Reads:** clients+client_configs (loadClientConfig), appointments. **Writes:** appointments, conversation state.
- **Breaks-if-you-change:** config failure refusal contract (Invariant 13); calculateAvailability expects named hours + `config.buffer_time` + per-service duration; loadClientConfig jsonb-first merge (Invariant 2); **its GCal freebusy block is DEAD** (guarded on googleRefreshToken which loadClientConfig never returns) — the LIVE availability path is `ai/availability-engine.js` (appointments incl. pending* statuses + mergeExternalBusy SA freebusy, v2.3.9). All cancel paths delete GCal events via calendar-service SA `deleteBookingEvent` (v2.5.9, B2-2) — never the OAuth getCalendarClient path.
- **Pinned-by:** T57/T58 availability gates.

### ai/smart-router.js (3277 LOC) — flow conductor
- **Breaks-if-you-change:** STEP 0 pending-alternative check requires clinic id (fail-closed warn, v2.4.7); 1-hour conversation freshness; multi-intent confirm/execute order; matchServiceByName (v2.4.4 cancel path); waitlistHint gates.
- **Pinned-by:** T57–T64 flow pins.

### telegram/commands/approvals.js + booking-notifications.js — admin booking actions
- **Reads:** appointments, client_configs (`config.buffer_time ?? buffer_time ?? 15`). **Writes:** appointments status, patient WA (env key, F1), Telegram cards.
- **Breaks-if-you-change:** approve_/reject_/suggest_alt_ callback contracts; alt-accept idempotency (Invariant 6); cancel is deterministic (v2.4.4).

### jobs/ (scheduler: telegram/scheduler.js — sends only, NEVER polls)
- reminders.js — clinic-status filter ✓ (F4 closed v2.5.15); reads client_configs columns for toggles; sendWhatsAppMessage chokepoint (per-clinic key threaded v2.5.6).
- daily-booking-summary / weekly-roundup / weekly-optimization-loop / closing-summary — filter `status='active'` ✓.
- trial-expiry-checker / waitlist-reengagement — status filter ✓ (F4 closed v2.5.15).
- **Breaks-if-you-change:** Invariant 7 — every job's client query must respect sleep vocabulary.

### telegram/bot.js — admin surface
- **Breaks-if-you-change:** launch supervisor (Invariant 10); telemetry tap is FIRST middleware; adminOnly gate; outcome-gated button toasts (v2.5.1); safeHandler catches → "Command failed" (when Ash reports this, a handler threw).

### server/onboarding.js (LEGACY) — live at /api/activate-clinic only (F3)
- Contains live `||`-collapse bugs. Shadowed for /api/onboarding. Removal decision pending.

## Send-site inventory (v2.5.6 — F1 closed)
| Path | File | Key |
|---|---|---|
| Patient replies (live, incl. typing + interactive fallback) | webhook.js sendWhatsAppReply/sendTypingIndicator | per-clinic ✓ |
| Reminders 24h/1h/48h + approval confirmation | jobs/reminders.js ×4 | per-clinic ✓ |
| Booking approve/reject/cancel notify | commands/approvals.js ×3 | per-clinic ✓ |
| Alt-time suggestion | booking-notifications.js | per-clinic ✓ |
| Waitlist re-engagement | waitlist-reengagement.js ×2 | per-clinic ✓ |
| Staff WABA takeover alert | middleware/staff-takeover.js | per-clinic ✓ |
| Onboarding welcome (approve) | onboarding-approvals.js | env — DELIBERATE (no clinic account yet) |
| Stalled-conversation follow-ups | webhook.js processFollowUps | env — RESIDUAL (state records lack clinic_id) |
| Diagnostic /test-360dialog, scripts/* | webhook.js, scripts/ | env — by design |
| Clinic Telegram alerts | multi-clinic-sender.js | per-clinic chat_ids ✓ (different channel) |

## Schema hot zones
- `clients`: status (Invariant 7), d360_api_key (Invariant 12 — SQL migration `ALTER TABLE clients ADD COLUMN IF NOT EXISTS d360_api_key text;` runs Ash-side; code is safe either order), webhook_token, google_calendar_id (manual set only — v2.3.9 lesson).
- `client_configs`: jsonb canonical (Invariant 2); columns display/cache; hours named schema.
- `onboarding_submissions`: quarantine; optional columns self-heal (contact_email/phone, nearest_mrt, parking_info).
- `appointments`: status vocabulary {pending, confirmed, cancelled, completed} — reminders select `confirmed`, follow-ups `completed`.
