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
- **Breaks-if-you-change:** positional→named hours transform; dual-schema services normalizer (dur/desc/cat + duration/description/category + unit); FAQ blank-row filter; jsonb+column sync (v2.5.3, superseded at write-time by Invariant 19); NO WhatsApp on reject (v2.5.5); welcome WA on approve only; handlers take `refArg` (Invariant 5). **F7 closed (v2.5.17):** the approval card must report REAL outcomes — welcome WA is attempted BEFORE the card (recipient-guarded, outcome `sent ✅ / FAILED ⚠️ / skipped — no number`) and a config-insert failure appears as "CONFIG INSERT FAILED — bot REFUSES all patients" (was: console-only while the card claimed LIVE). Copy honesty (v2.5.18, Ash picked option a): welcome WA says the assistant "is being set up — we'll confirm as soon as it's ready to take patient inquiries" instead of claiming "ready 24/7" before calendar/D360 wiring exists.
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


## Invariant 19 (v2.5.19) — config jsonb is canonical; every mutation syncs column + jsonb atomically

`client_configs` stores config twice: the `config` jsonb (the bot reads it FIRST — getConfig nested wins) and top-level columns (the `/config` display mirror). Before v2.5.19 all 7 mutation helpers in `supabase/client.js` (addService, updateServicePrice, removeService, updateOperatingHours, addFaq, removeFaq, updateBrandVoice) wrote ONLY the column — the bot kept serving stale data while `/config` showed the clinic their change "worked". Fix: `syncConfigJsonb(row, patch)` merges the patch into the jsonb (services patches also rebuild derived `service_categories`) and every helper writes `{ <column>, config }` in ONE atomic `.update()`, always scoped `.eq('client_id', clientId)` — cross-clinic containment non-negotiable (Ash 2026-11-14). Both clinic self-service (telegram/commands/index.js) and Moon Hands admin change-requests (telegram/change-requests.js) flow through these helpers. Demo clinic reconciled same day (jsonb → columns for greeting/tone/special_notes, which had drifted). Harness: T86 (11 pins incl. behavioral payload capture + containment).


## Invariant 20 (v2.5.20) — a booking confirmation may only be sent if create_booking succeeded THIS turn

Ash live-tested the chiro demo in Malay (2026-11-14): the whole deterministic layer (intent matcher, keyword fallback, availability detector, sticky booking context) was English-only, so the conversation bypassed the BOOKING expert and the model role-played a full booking — "confirmed" with NO appointment row, no admin Telegram, no patient WA. Fixes: (1) `MULTILINGUAL_BOOKING` / `MULTILINGUAL_AVAILABILITY` (ms/zh/ta — every language selectable at onboarding: en/zh/ms/ta) wired into classifyMessage + sticky context; availability questions in any language force the real check (Invariant 17 extended). (2) `claimsBookingConfirmation` (en/ms/zh/ta patterns) + `honestBookingHandoff` (4 languages) in bot-engine guard ALL THREE LLM reply paths (expert, generalist-with-function, generalist-direct): a confirmation claim without a successful create_booking this turn is replaced with an honest team-handoff + admin stall alert. Reschedule/update/hold-for-approval deterministic messages verified non-matching. BOOKING prompt rules 12 (never claim confirmation without a successful write) + 13 (reply in the patient's language). F9 same release: handleLocation mock fallbacks ('River Valley' etc.) REMOVED — optional onboarding fields save as '', mocks fired per-field and stitched fabricated directions into real addresses; now omitted honestly, no-address = honest ask. Harness: T87 (5 pins) + T88 (9 pins), 731/731.


## v2.5.21 (Nov 14 2026) — forced-call gate fix + deterministic-message localization

Root cause found after the v2.5.20 live Malay replay (turns 1/3/4 logged `generalist:*`): a FORCED function call returns null prose, and bot-engine gated the whole expert block on `if (expertResult.text)` — so forced availability checks silently skipped function execution, deterministic replacement, and the Invariant 20 guard, and fell through to the generalist (double OpenAI cost, free paraphrase). Fix: gate is now `if (expertResult.text || expertResult.functionCall)`. Deterministic fnResult messages (English-authored) are localized for zh/ms/ta patients via `localizeDeterministicMessage` (translate-only prompt, facts preserved, English fallback on failure); `detectPatientLanguage` shared by the handoff/fallback paths. Also fixed a generalist prompt CONTRADICTION: "Confirm name and phone before creating any booking" vs the NEVER-ask-phone hard rule — the model followed the weaker one and asked a WhatsApp patient for their number (live test). Now name-only confirm + same-language rule on the generalist. Harness: T89 (6 pins), 737/737.


## v2.5.24 (Nov 14 2026) — audit A-2: multilingual red-flag detection + localized Path A

The deterministic medical pre-layer was English-only: zh/ms/ta emergencies fell through to the LLM classifier, which fails OPEN to booking on error (CLASSIFIER_ERROR_PASS) with an English-only heuristic fallback. Added `RED_FLAG_PATTERNS_MULTILINGUAL` (ms/zh/ta: chest/breathing, neuro/trauma, stroke, fracture, pregnancy complications, infection/oncological) to red-flag-detector.js, recall-biased by design (false positive costs a careful message, false negative costs a patient). `PATH_A_RESPONSES` localized en/ms/zh/ta, selected via detectPatientLanguage in both madsGate branches. Live-proven: Malay chest-pain → mads-red-flag + Malay Path A; benign Malay back pain → normal flow. Harness: T90 (6 pins, 12 fire + 9 benign corpus), 743/743.


## v2.5.25 (Nov 14 2026) — audit A-1 + A-3: SG-time booking window + clinic-editable booking preferences

A-1 [was Certain]: same-day availability dead via the AI path — checkAvailability compared UTC-midnight of the requested date against the live clock, so "today" measured NEGATIVE hours from 8am SGT and every same-day request failed min-notice; generateTimeSlots had no past-time filter; booking_allow_same_day unchecked on the read path. Fix (function-handlers.js): `daysDiffSG` calendar-day math on `getTodaySG()`; same-day honors the clinic preference via `resolveBookingPref` (jsonb canonical per Invariant 19, flat fallback, ?? so OFF/0 survive); same-day slots filtered to >= now + min_notice per slot (`filterSlotsByMinNotice`, mirrors availability-engine so CHECK and BOOK agree); honest copy for same-day-off and window-closed. createBooking's same-day gate compares SG dates (UTC compare let bookings slip through midnight–8am SGT).

A-3: every UTC "today" in live code moved to SG time — daily_usage write (incrementDailyUsage) + reads (/usage, daily report), health/security reports, closing-summary tomorrow, /appointments list, patient-history visit dates, delivery report, calendar upcoming-availability window, getFutureAppointments. Left untouched deliberately: weekly-optimization period labels (7-day analytics, hour drift is noise), waitlist-reengagement date-string loop (self-consistent), ical ±90d windows, dead structured-flow trio in bot-engine (handleCheckAvailability/handleCreateBooking/getNextBusinessDay — no callers).

Clinic booking preferences editable end-to-end (Ash: clinic control panel OR Moon Hands admin): clinic `/req_booking` (change request → approval) and admin `/setbooking` both land in `updateBookingSettings` — flat column + config jsonb in ONE client-scoped atomic update (no drift possible); `validateBookingSetting` guards field/range. Pre-deploy drift repair: chiro demo jsonb min_notice was 24 vs flat 2 (pre-F8 residue) — reset jsonb→2 to preserve effective behavior under nested-wins. Aesthetic clinic jsonb lacks the keys; ?? falls to flat, no repair needed. Harness: T91 (15 pins), 759/759. Live-proven: Sat 13:57 SGT same-day → honest window-closed (Sat closes 14:00); Monday → 14 real slots; settings round-trip 2→3→2 synced both stores.


## v2.5.26 (Nov 14 2026) — audit A-4: double-booking hard wall (DB constraint)

createBooking checked conflicts then inserted — two same-millisecond requests both pass and both book. Ash chose Option 2 (DB constraint) over post-write re-check. `migrations/010_no_double_booking.sql` (Ash runs it SQL-side, d360-key precedent): btree_gist + exclusion constraint `no_overlapping_active_bookings` on (client_id, appointment_date, tsrange(time, time+duration)) for occupying statuses only (confirmed/pending/pending_approval/booked/pending_alternative) — cancelled/completed/no_show free the slot; per-clinic (containment); buffer stays code-level. Pre-check: zero existing overlaps. Code catches SQLSTATE 23P01 on all four write paths (createBooking insert — reschedule rides through it with rollback intact; updateBooking slot move; both approval confirm paths in commands/approvals.js) and answers honestly ("slot was just taken", never raw SQL). Harness: T92 (5 pins), 764/764. The wall went LIVE 2026-11-14 (Ash ran migration 010): behaviorally proven — overlapping pending insert BLOCKED (23P01), cancelled-overlap allowed, free slot allowed, other clinic same slot allowed (containment holds).


## v2.5.27 (Nov 14 2026) — audit B-1: multi-expert function-call survival + merge hygiene

A multi-expert turn kept only the FIRST functionCall and dropped the rest, then the merge LLM stitched prose from EMPTY expert texts (function-call turns return null prose) — a "price + availability" message could get an invented price while only the availability check really ran. Fix in patient-experts.js executeExperts: `pickSurvivingFunctionCall` (deterministic CALL_PRIORITY: create_booking > check_availability > reschedule/update/cancel > waitlist > pricing/info, console trail on drops); only real-prose experts join the merge; zero-prose turns skip the merge LLM entirely (the executed call's deterministic result is the reply, Invariant 17); single-prose turns skip it too (one less LLM call). Single-expert turns untouched. Known limitation (pre-existing, v2.5.13 design): a two-intent turn ("price + slots") answers only the deterministic intent — composing both in one reply is a design question for Ash. Harness: T93 (5 pins), 769/769. Live-proven: price+availability probe → honest real availability answer, no invented price.

## v2.5.28 (Nov 14 2026) — multi-bubble replies (merge LLM deleted)

Closes the B-1 known limitation Ash confirmed a design for: a two-intent turn answered only the deterministic intent (the price question went unanswered). patient-experts `executeExperts` now returns an ordered `texts[]` bubble list whenever the turn has 2+ things to say (prose answers + surviving function call): `orderBubbles` fixes the order (EMPATHY → informational → BOOKING prose) and `MAX_BUBBLES = 3` caps it (one slot reserved for the action bubble when a call survives); the merge LLM is GONE — no more paying to blend an unverified paraphrase into a deterministic answer. bot-engine assembles: deterministic fnResult rides as the FINAL bubble (Invariant 17 — BOOKING prose dropped when an action bubble exists), Invariant 20 runs PER BUBBLE, booking_offered reads the last bubble, card attaches to the last bubble only (its body IS that bubble's text), conversation log stores the joined text. webhook: per-bubble sanitize + card-body sync, send loop with ~400ms spacing, first bubble quotes the patient, card on the final bubble only; partial failure = sent bubbles stand + admin alert + break (never resend the batch). Single-thing turns keep the untouched legacy path end-to-end (`bubbleCount === 1`, `!isMultiBubble` gates). Harness: T94 (17 pins incl. behavioral order/cap), 785/785 — T88/T93 pins updated for the new guard gate and the deleted merge. Live-proven: worried+Saturday probe → 2 bubbles (empathy prose → deterministic "8 slots available on 2026-11-21"); single-intent availability → unchanged single reply. Known cosmetic: a prose expert can echo facts from conversation history that the deterministic bubble then restates (parallel experts see history, not each other).

## v2.5.29 (Nov 14 2026) — multi-intent confirmation gate REMOVED (Ash live failure)

Ash's first real compound message after v2.5.28 ("What time do you open on Tuesday and what treatment do you offer and the price?") never reached multi-bubble: the smart-router's pre-multi-bubble STEP 3 gate intercepted 2+-substantive-intent messages, burned a round trip on an "Is that accurate?" confirmation (garbled — `params.treatment` parsed "the" from "the price"), then CRASHED on "Yes": `executeMultiIntents`/`combineResponses` assumed string handler returns, but service list/info handlers return `{text, whatsappInteractive}` objects — `.toLowerCase()` on an object threw, patient got "I'm having trouble right now". Reproduced byte-for-byte on the synthetic driver (both turns) before fixing. Ash chose Option A: gate deleted — `handleMultiIntentConfirmation`, `executeMultiIntents`, `combineResponses`, the MULTI_INTENT_CONFIRM state branch + constant all gone; 2+ substantive intents now route straight to the expert system (v2.5.28 multi-bubble answers each question as its own bubble). Single-intent hardcoded paths ($0) untouched; booking state machine still precedes intent routing. Harness: T95 (6 pins), 791/791. Live-proven: Ash's exact message → 2 bubbles (hours+treatments, then price list + Book Consult card); "Yes" follow-up → graceful category browse; zero residue.

## v2.5.30 (Nov 14 2026) — self-describing time-button IDs + stale-tap supersede guard

Closes UVT item E (tapping a time button on an OLD list could silently book a stale slot). Time-slot buttons are now self-describing: `time_YYYY-MM-DD_HH-MM` — `getTimeSlotButtons` gains a 4th `forDate` arg (ISO-guarded; a non-ISO value falls back to the legacy undated ID rather than shipping a broken one), and all 9 smart-router call sites pass the exact ISO date the slots were fetched for. bot-engine parses the dated ID and compares its date against the patient's CURRENT flow date (`hydrateState` first — cold-start safe): date MATCH → normal time pick; MISMATCH → stale tap SUPERSEDED, never silently accepted — the router re-anchors on the current flow date and an honesty note ("That time list was out of date…") is prepended to BOTH the reply text and the interactive card body (WhatsApp drops plain text when a card rides); NO active flow date → tapped date+time routes as a fresh booking request through the normal tap-time gates (A-4 wall decides). Legacy undated `time_HH-MM` buttons still sitting in old chats behave exactly as before. smart-router AWAITING_TIME gains a same-date refresh branch: a bare re-statement of the current date (what a superseded tap becomes — also what a patient typing the same day again produces) re-fetches and re-shows that day's REAL slots with fresh dated buttons, replacing the old "didn't catch the time" dead-end; day-full → honest slotRefusalResponse. Drift pin lands with this release (T96): the harness now fails if the interactive-gate inventory (30 static + 6 dynamic prefixes), the BOOKING_STATES count (14), or this census's freshness changes without the map being updated in the same commit. Live-proven: fresh tap / stale tap / legacy ID / idle tap — see release report.

## Message-path gate census (v2.5.29 — every interception point, enumerated after the gate miss)

**webhook.js (transport/security):** L1 DDoS · L2 per-clinic token auth · L3 body parse/size · L4 signature (internal) · L5 extract/validate · L6 prompt-injection · L7 sanitize · L8 smart rate-limit (repeat/flood/budget) · L9 loop protection · L9.5 client resolve (F2 refuse-loudly) · L9.6 staff-takeover check · L9.7 stale pre-resume guard · L10 AI routing · L10.5 auto-pause on complaint/handoff · L11 send (+v2.5.28 bubble loop). Status: pinned in harness + abuse-batch live-tested (B5: dupe wamid, loop, silence); F2 refusal live-proven.

**bot-engine.js (AI entry):** MADS red-flag gate + doctor-callback choice (T90, live B4 3/3) → interactive-ID routing (static map + dynamic date/time/category/service/waitlist maps; live-proven via UVT-B + Batches 1-3; v2.5.30: time IDs self-describing `time_YYYY-MM-DD_HH-MM` + stale-tap supersede guard, legacy undated IDs unchanged) → deterministic cancel choice (v2.4.4, live) → smart router → expert system (multi-bubble assembly v2.5.28) → generalist fallback → Invariant 20 guard on all three LLM reply paths.

**smart-router.js (fast/$0 layer):** STEP 0 pending-alt-confirmations (live B3) → suggestion flow → STEP 1 booking state machine (heavily live-tested) → STEP 1c IDLE compare/what-is → STEP 1b greeting freshness → STEP 2 intent detection → STEP 3 multi-intent → **experts (v2.5.29)** → STEP 4 single-intent (incl. booking-fields fallthrough — CAN eat compound phrasings with date+time/treatment into the treatment-not-found path; deterministic, characterized 2026-11-14, acceptable for now) → SERVICE/BOOK SELECTED → STEP 4b context-dependent → STEP 4c edit/reschedule no-state → STEP 5 hardcoded handlers (hours/pricing/services/location — single-intent paths live-tested).

Rule going forward: any NEW gate added to this path gets a census row + harness pin in the same commit, and release live-probes must include plain-language compound phrasings through the router, not only expert-path probes.

## Standing gate discipline (Ash directive 2026-11-14 — every release, every feature)

Ash: "This multiple gates of entries must be considered on all possible features that we have. Checks must be made each time."

1. **Census covers ALL feature surfaces**, risk order: (1) patient message path — DONE above; (2) Telegram admin commands + approval cards; (3) cron/scheduler jobs (reminders, reports, waitlist re-engagement, trial expiry); (4) onboarding pipeline; (5) calendar sync paths; (6) config mutation paths (sync helpers + booking settings).
2. **Every release:** harness green + release report lists WHICH census sections the changes pass through + live probes for touched sections.
3. **New gate → census row + harness pin in the same commit.** A drift pin fails the harness when a gate marker appears without a census update.
4. **Release reports state coverage scope precisely** ("tested on path X") — never a bare "it's working".

### Census surface 2 — Telegram admin + clinic-staff gates (2026-11-14)

**Wrapper gates:** `safeHandler` (audit-log + crash-catch on EVERY command/action) and `adminCmd` (adminOnly guard) — 30+ admin commands behind adminCmd; clinic-staff commands (/req_*, /patientpause, /takeover…) behind safeHandler with clinic scoping inside handlers. **Card gates:** approve_/reject_/cancelgo_ → `isAuthorizedForBooking` (chat↔clinic binding via clients.telegram_chat_ids) + status idempotency (alreadyProcessed → no double-notify) + 23P01 wall catch (A-4) + ack-first (v2.3.3 redelivery fix) + markup removal + honest patient-notify/calendar outcome lines (v2.4.0, T57/T68). cancelreq_ two-step with cancelno_ abort. onboarding_approve/reject (pending-only, containment — Invariant 8). act: change-requests (updateBookingSettings pinned T91). appt_yes/no/flip, cbdone/cbcancel, staffctx, linkme. **Ordering gate:** the catch-all `bot.on('callback_query')` runs BEFORE bot.action registrations and owns confirm_alt_ (v2.4.6 marker guard) — new callback prefixes must be checked against BOTH. **Coverage:** harness T30/T44/T50/T56/T57/T68/T91/T92 + live approval rounds (R-3a/R-3b, UVT-B full lifecycle). **Open findings: none.**

### Census surface 3 — cron/scheduler jobs (2026-11-14)

13 scheduled jobs. Patient-facing: reminders 24h/1h/48h + post-appointment checks + waitlist-reengagement. Clinic-facing: closing-summary, daily-booking-summary, trial-expiry, billing-reminders. Admin-facing: daily usage/security/health reports, weekly-roundup, weekly-optimization, high-value-lead (15-min). **Gates verified:** F4 asleep-clinic filtering on reminders/trial-expiry/waitlist (T82 behavioral, fail-closed); SG-time math (v2.5.25 A-3 sweep; the 2026-10-29 1h-reminder-7h-late prod bug class is pinned); `inSendWindow` business-hours gate in reminders. **OPEN (flagged 2026-11-14, awaiting Ash decision):** patient-facing jobs do NOT check staff-takeover pause — an automated reminder/post-check/waitlist message can land while a human staff member is mid-conversation with the patient. Reminders are booking-scoped so this may be acceptable; suppressing sends while paused is a behavior change that needs Ash's call.

### Census surfaces 4-6 — from established verification (2026-11-14)

(4) **Onboarding pipeline:** public form honeypot/rate-limit/sanitize → quarantine table → pending-only approval → NEW rows only (Invariant 8); v2.4.2 public e2e + honeypot pinned; F3 deferred (dead-code proof needed). (5) **Calendar sync:** Invariant 15 (one live event per booking — patch-or-create in approvals, delete-on-reschedule in updateBooking); R-3a/R-3b live-proven; v2.5.28 boot canary reports sync health. (6) **Config mutations:** Invariant 19 (jsonb canonical, column+jsonb in ONE atomic update); 8 syncConfigJsonb helpers (T86 count pin); booking settings end-to-end round-trip live-proven (v2.5.25).

## Audit batch one — CLOSED (Nov 14 2026)
A-1 ✓ v2.5.25 · A-2 ✓ v2.5.24 · A-3 ✓ v2.5.25 · A-4 ✓ v2.5.26 (migration pending Ash) · B-1 ✓ v2.5.27 · B-2 parked by Ash (Malay cancel quality, backlog).
