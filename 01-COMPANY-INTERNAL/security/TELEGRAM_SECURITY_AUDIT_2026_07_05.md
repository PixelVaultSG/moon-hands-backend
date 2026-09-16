# TELEGRAM ENTRY POINTS — SECURITY AUDIT
**Date:** 2026-07-05
**Auditor:** Security SME Review
**Scope:** All Telegram bot entry points, multi-clinic sender, booking notifications, staff takeover, command handlers
**Risk Rating:** 3 CRITICAL | 7 HIGH | 12 MEDIUM | 9 LOW

---

## EXECUTIVE SUMMARY

The Telegram bot has **3 CRITICAL vulnerabilities** that must be fixed before multi-clinic go-live. The most severe is a **completely broken clinic linking flow** caused by duplicate handlers — clinic staff cannot link their Telegram accounts. Additionally, **PII leakage across clinics** exists in the approval commands, and **multi-clinic isolation is bypassed** by legacy notification functions.

The good news: The core security middleware (injection blocking, rate limiting, input sanitization) is well-designed and effective. The admin-only auth model (single ADMIN_CHAT_ID) is correctly enforced. The vulnerabilities are primarily in multi-clinic edge cases and legacy code paths that bypass the new isolation layer.

**Recommendation:** Fix all CRITICAL and HIGH findings before onboarding any clinic. MEDIUM findings should be fixed within 1 week. LOW findings are acceptable for launch but should be addressed in the next sprint.

---

## CRITICAL FINDINGS (Fix Before Go-Live)

### C-001: Clinic Linking Completely Broken — Duplicate `bot.start()` Handlers
**File:** `telegram/bot.js` — Lines 141 and 408
**Severity:** CRITICAL | **Impact:** Functional | **Exploitability:** N/A (broken feature)

**Issue:** There are TWO `bot.start()` handlers registered. The first (line 141) sends a generic welcome message. The second (line 408, wrapped in `safeHandler`) contains the entire clinic linking logic (`/start GLOW001`). In Telegraf, the first matching handler executes and does NOT call subsequent handlers. Therefore, the clinic linking code at line 408 **never executes**.

**Impact:**
- Clinic staff CANNOT link their Telegram account to their clinic
- The entire `/start GLOW001` onboarding flow is non-functional
- Clinic staff cannot receive booking notifications
- Multi-clinic Telegram separation is effectively dead on arrival

**Fix:** Remove the first `bot.start()` at line 141. Keep only the second one at line 408.

**Verification:** After fix, sending `/start GLOW001` should trigger the clinic linking flow instead of the generic welcome message.

---

### C-002: Massive Cross-Clinic PII Leak — `/pending` Shows ALL Clinics' Patient Data
**File:** `telegram/commands/approvals.js` — Line 17-51, `handlePending()`
**Severity:** CRITICAL | **Impact:** Data Breach | **Exploitability:** HIGH (any admin can trigger)

**Issue:** The `handlePending()` function queries ALL pending bookings across ALL clinics with NO clinic filtering:
```javascript
const { data: bookings } = await db.supabase
  .from('appointments')
  .select('*, clients(name)')
  .eq('status', 'pending_approval')  // No .eq('client_id', ...) filter!
```

The response includes:
- Patient full names (`customer_name`)
- Patient phone numbers (`customer_phone`)
- Treatment types (`service`)
- Appointment dates and times
- Clinic names (cross-referencing which patient goes to which clinic)

**Impact:**
- Any user with Telegram bot access can see ALL patients from ALL clinics
- This is a clear PDPA violation — patient data must be isolated per clinic
- Could destroy clinic trust and result in legal liability

**Fix:** Filter appointments by the requesting user's linked clinic(s). Only show bookings where `client_id` matches the clinic(s) the user's chat_id is linked to.

```javascript
// Get clinic IDs this user is authorized for
const { data: linkedClinics } = await db.supabase
  .from('clients')
  .select('id')
  .contains('telegram_chat_ids', [chatId]);

const clinicIds = linkedClinics?.map(c => c.id) || [];
// Then filter: .in('client_id', clinicIds)
```

---

### C-003: Multi-Clinic Isolation Bypassed by Legacy Notification Functions
**Files:** `telegram/booking-notifications.js` — Lines 103, 125, 159, 290
**Severity:** CRITICAL | **Impact:** Data Leak | **Exploitability:** MEDIUM (triggered by system events)

**Issue:** Four notification functions still use the legacy `sendTelegramMessage()` helper which sends to a single hardcoded `chatId`, bypassing the multi-clinic sender entirely:

| Function | Line | Uses Multi-Clinic Sender? |
|----------|------|---------------------------|
| `notifyBookingCreated()` | 54 | YES (with fallback) |
| `notifyBookingCancelled()` | 103 | **NO — legacy only** |
| `notifyBookingRescheduled()` | 125 | **NO — legacy only** |
| `sendWeeklyRoundup()` | 159 | **NO — legacy only** |
| `sendDailyClosingSummary()` | 290 | **NO — legacy only** |

When these functions are called without a `clinicId`, the notification goes to `clinicConfig.telegram_chat_id` (a single chat ID) or `ADMIN_CHAT_ID` — NOT the clinic's `telegram_chat_ids[]` array.

**Impact:**
- Cancellation notifications may go to the wrong clinic's staff
- Weekly roundups and daily summaries may not reach the correct clinic
- In the worst case, Clinic A's data could be sent to Clinic B's Telegram chat

**Fix:** Update all four functions to use `sendClinicNotification(clinicId, message)` consistently. Remove the legacy `sendTelegramMessage()` helper entirely.

---

## HIGH FINDINGS (Fix Within 48 Hours)

### H-001: All Clinics' WhatsApp Numbers Exposed in `/clients` Command
**File:** `telegram/commands/index.js` — Line 116
**Severity:** HIGH | **Impact:** PII Leak | **Exploitability:** HIGH

**Issue:** `handleClients()` selects `whatsapp_number` for ALL clinics and displays it in the Telegram message. While only the admin can currently access this, once clinic staff are given access, they could see competitors' WhatsApp business numbers.

**Fix:** Remove `whatsapp_number` from the SELECT clause. It's not needed for the clinic list view.

---

### H-002: Booking Approval Commands Have No Clinic Authorization
**File:** `telegram/commands/approvals.js` — Lines 55, 136, 200, 262
**Severity:** HIGH | **Impact:** Unauthorized Action | **Exploitability:** MEDIUM

**Issue:** `handleApprove()`, `handleReject()`, `handleApproveById()`, and `handleRejectById()` do NOT check if the requesting user is authorized for the clinic that owns the booking. Any admin can approve/reject ANY clinic's bookings.

**Fix:** Before approving/rejecting, verify the booking's `client_id` matches one of the clinics the user's `chat_id` is linked to.

---

### H-003: `sanitizeInput()` Vulnerable to ReDoS — Length Limit Applied After Regex
**File:** `middleware/security.js` — Lines 100-118
**Severity:** HIGH | **Impact:** DoS / Service Unavailability | **Exploitability:** MEDIUM

**Issue:** The `sanitizeInput()` function applies the 4000-character limit at the END (line 117), AFTER running multiple regex `.replace()` operations. A malicious input of ~10MB with crafted patterns could cause regex catastrophic backtracking, blocking the event loop for seconds.

**Fix:** Apply length limit at the START of the function, before any regex operations:
```javascript
function sanitizeInput(input) {
  if (!input || typeof input !== 'string') return '';
  // Apply length limit FIRST to prevent ReDoS
  input = input.substring(0, 10000); // 10K max before processing
  // ... then run regex operations
}
```

---

### H-004: Database Error Messages Leaked to Users
**File:** `telegram/commands/index.js` — Lines 121, 152, 221, and others
**Severity:** HIGH | **Impact:** Information Disclosure | **Exploitability:** LOW

**Issue:** Multiple command handlers expose raw database error messages to Telegram users:
```javascript
return ctx.reply(`⚠️ Database error: ${error.message}`);  // Line 121
ctx.reply(`⚠️ Database error: ${err.message}`);            // Line 152
```

These error messages can reveal:
- Database schema details
- Table names and column names
- Supabase internal structure
- Connection details

**Fix:** Log the detailed error internally. Show a generic message to users:
```javascript
console.error('[TELEGRAM /clients] DB Error:', error.message);
return ctx.reply('⚠️ Unable to process your request. Please try again later.');
```

---

### H-005: `showClinicMenu()` Displays Clinic's Own WhatsApp Number
**File:** `telegram/commands/index.js` — Line 198
**Severity:** HIGH | **Impact:** PII Exposure | **Exploitability:** LOW

**Issue:** The clinic menu shows the clinic's WhatsApp number: `Phone: ${client.whatsapp_number || 'N/A'}`. If clinic staff share their Telegram device or screenshot, the business number is exposed.

**Fix:** Remove the phone number from the clinic menu display. Staff already know their own number.

---

### H-006: `pendingAlternatives` Map — No Size Limit or Cleanup
**File:** `telegram/booking-notifications.js` — Lines 22-23
**Severity:** HIGH | **Impact:** Memory Exhaustion | **Exploitability:** LOW

**Issue:** The `pendingAlternatives` Map has no maximum size limit and no cleanup of expired entries. Old entries that are never accessed remain in memory forever. A malicious or buggy flow could fill memory.

**Fix:** Add a max size (1000 entries) with LRU eviction, and a periodic cleanup of expired entries.

---

### H-007: Callback Query Handler — No `ctx.from` Validation
**File:** `telegram/bot.js` — Line 486-488
**Severity:** HIGH | **Impact:** Crash / DoS | **Exploitability:** LOW

**Issue:** The callback query handler accesses `ctx.callbackQuery.message.chat.id` without checking if `ctx.callbackQuery` or `ctx.callbackQuery.message` exists. A malformed callback query from Telegram (or a crafted update) could cause an unhandled exception.

**Fix:** Add validation:
```javascript
if (!ctx.callbackQuery || !ctx.callbackQuery.message) {
  return ctx.answerCbQuery('Invalid query');
}
const data = ctx.callbackQuery.data;
const chatId = ctx.callbackQuery.message.chat.id;
```

---

## MEDIUM FINDINGS (Fix Within 1 Week)

### M-001: `bot.command('menu')` Registered Twice
**File:** `telegram/bot.js` — Lines 151 and 392
**Severity:** MEDIUM | **Impact:** Code Quality / Dead Code | **Exploitability:** N/A

**Issue:** The `/menu` command handler is registered twice. The second one (line 392, with the QUICK_MENU_KEYBOARD) never executes because the first one catches the command.

**Fix:** Remove the first `bot.command('menu')` at line 151. Keep only the second one at line 392.

---

### M-002: `ctx.from.first_name` Used Without Sanitization in Replies
**File:** `telegram/bot.js` — Lines 410, 425, 437, 448, 455, 476
**Severity:** MEDIUM | **Impact:** Markdown Injection | **Exploitability:** LOW

**Issue:** User's Telegram `first_name` is interpolated into reply messages with `parse_mode: 'Markdown'`. A user with a name like `*[HACKED](evil.com)*` could inject Markdown formatting. Currently only the admin uses the bot, so risk is low. When clinic staff are added, this becomes more relevant.

**Fix:** Sanitize `ctx.from.first_name` with `escapeMarkdown()` before using in replies.

---

### M-003: Clinic Cache — No Maximum Size Limit
**File:** `telegram/multi-clinic-sender.js` — Line 18
**Severity:** MEDIUM | **Impact:** Memory Growth | **Exploitability:** LOW

**Issue:** The `clinicCache` Map has no maximum size. With many clinics, memory usage could grow.

**Fix:** Use a Map with max 500 entries and LRU eviction.

---

### M-004: Staff Takeover State — No Maximum Size
**File:** `middleware/staff-takeover.js` — Line 22
**Severity:** MEDIUM | **Impact:** Memory Growth | **Exploitability:** LOW

**Issue:** The `takeoverState` Map has no maximum size limit.

**Fix:** Add max 10,000 entries with LRU eviction for the oldest entries.

---

### M-005: `alternativeTimeText` Not Sanitized Before Sending to Patient
**File:** `telegram/booking-notifications.js` — Line 415
**Severity:** MEDIUM | **Impact:** Content Injection | **Exploitability:** LOW

**Issue:** The alternative time text from clinic staff is inserted directly into a WhatsApp message to the patient without sanitization. A compromised staff account could inject malicious content.

**Fix:** Run `sanitizeInput()` on `alternativeTimeText` before including it in the patient message.

---

### M-006: `handlePatientConfirmAlternative()` — No Patient Authorization Check
**File:** `telegram/booking-notifications.js` — Line 432
**Severity:** MEDIUM | **Impact:** Unauthorized Action | **Exploitability:** LOW

**Issue:** When a patient confirms an alternative time, there's no verification that the confirming patient is the actual owner of the booking. A patient with knowledge of another booking ID could potentially confirm it.

**Fix:** Verify the patient's phone number matches the booking's `patient_phone` before confirming.

---

### M-007: Command Log — In-Memory Only, Lost on Restart
**File:** `telegram/bot.js` — Lines 37-54
**Severity:** MEDIUM | **Impact:** Audit Trail Gap | **Exploitability:** N/A

**Issue:** The `commandLog` array is purely in-memory. All audit data is lost on server restart or crash.

**Fix:** Persist security-relevant audit events to the `security_events` Supabase table.

---

### M-008: Injection Detection — Substring Matching Causes False Positives
**File:** `middleware/security.js` — Lines 66-68
**Severity:** MEDIUM | **Impact:** Legitimate Messages Blocked | **Exploitability:** N/A

**Issue:** The `analyzeInjection()` function uses `.includes()` for substring matching. Patterns like "show me all" will match legitimate messages like "show me allergies treatment options". The `data_extraction` category has a severity score of 3, meaning a single match blocks the message.

**Fix:** Use word-boundary regex matching (`\bpattern\b`) instead of substring matching for multi-word patterns.

---

### M-009: Credential Pattern Detection — Overly Broad
**File:** `middleware/security.js` — Line 290
**Severity:** MEDIUM | **Impact:** False Positive Logging | **Exploitability:** N/A

**Issue:** The pattern `'AC'` matches words like "ACCOUNT", "ACNE", "PLACE", "TRACK" — generating unnecessary security logs.

**Fix:** Use more specific patterns or word boundaries.

---

### M-010: `linkChatToClinic()` — No Rate Limiting
**File:** `telegram/multi-clinic-sender.js` — Line 173
**Severity:** MEDIUM | **Impact:** Abuse | **Exploitability:** LOW

**Issue:** No rate limiting on the clinic linking operation. An attacker with access could rapidly link/unlink.

**Fix:** Add rate limiting: max 5 linking attempts per chat ID per hour.

---

### M-011: Error Handler Doesn't Persist Errors
**File:** `telegram/bot.js` — Line 791
**Severity:** MEDIUM | **Impact:** Observability Gap | **Exploitability:** N/A

**Issue:** The `bot.catch()` handler logs to console but doesn't persist to the database. On Render, console logs rotate and errors are lost.

**Fix:** Insert errors into a `bot_errors` or `security_events` table.

---

### M-012: `handleSecurity()` and `handleThreats()` — No Clinic Scoping
**File:** `telegram/commands/index.js` — Lines 598, 630
**Severity:** MEDIUM | **Impact:** Info Leak | **Exploitability:** LOW

**Issue:** Security dashboard and threats are global, not scoped per clinic. When clinic staff get access, they'll see system-wide security data.

**Fix:** Scope security views to the requesting user's linked clinic(s).

---

## LOW FINDINGS (Address in Next Sprint)

### L-001: `takeoverState` Stores Full Phone Numbers in Memory
**File:** `middleware/staff-takeover.js` — Line 22
**Severity:** LOW | **Impact:** Memory Disclosure | **Exploitability:** VERY LOW

**Impact:** If server memory is dumped, patient phone numbers are visible. However, this is in-memory only (not persisted to disk), and server compromise would expose all data anyway. Acceptable risk.

---

### L-002: `handlePauseCommand()` — `clinicId` Always `null`
**File:** `telegram/bot.js` — Line 343, `middleware/staff-takeover.js` — Line 162
**Severity:** LOW | **Impact:** Functional Gap | **Exploitability:** N/A

**Impact:** Paused conversations are not associated with any clinic. In multi-clinic mode, the status command shows ALL paused conversations across ALL clinics. Will become HIGH once multi-clinic auth is opened.

---

### L-003: `pauseBot()` — No Phone Number Format Validation
**File:** `middleware/staff-takeover.js` — Line 59
**Severity:** LOW | **Impact:** Data Integrity | **Exploitability:** LOW

**Impact:** Any string can be used as a patient phone in the takeover state. Non-phone strings could pollute the state.

---

### L-004: Cleanup Timer — No Error Handling
**File:** `middleware/staff-takeover.js` — Line 154
**Severity:** LOW | **Impact:** Reliability | **Exploitability:** N/A

**Impact:** If `cleanupExpiredPauses()` throws, the interval stops. Unlikely given the simple function.

---

### L-005: `handleAddService()` — No Input Length Validation
**File:** `telegram/commands/index.js` — Line 270
**Severity:** LOW | **Impact:** Data Quality | **Exploitability:** LOW

**Impact:** Very long service names could cause issues in Telegram messages or database storage.

---

### L-006: Dynamic `require()` Inside `handleClinicSuggestAlternative()`
**File:** `telegram/booking-notifications.js` — Line 412
**Severity:** LOW | **Impact:** Runtime Error | **Exploitability:** N/A

**Impact:** If the whatsapp module is missing, the error is caught by the try/catch at line 422. But this defers load-time errors to runtime.

---

### L-007: `RateLimiter.cleanup()` — Could Block Event Loop
**File:** `middleware/security.js` — Line 228
**Severity:** LOW | **Impact:** Performance | **Exploitability:** LOW

**Impact:** If Maps grow very large, synchronous cleanup could block the event loop. With current limits, not an issue.

---

### L-008: `handleDebug()` — Exposes System Information
**File:** `telegram/commands/index.js` — Line 685
**Severity:** LOW | **Impact:** Info Disclosure | **Exploitability:** VERY LOW

**Impact:** Shows Node version, platform, memory usage, uptime. Admin-only access mitigates risk.

---

### L-009: `bot.use()` Middleware — Only Checks `ctx.from.id`
**File:** `telegram/bot.js` — Line 58-98
**Severity:** LOW | **Impact:** Auth Model Limitation | **Exploitability:** N/A

**Impact:** The current auth model only allows ONE admin (ADMIN_CHAT_ID). When multi-clinic staff need access, this must be expanded to check `telegram_chat_ids[]` arrays. This is a known design limitation, not a vulnerability per se.

---

## FIX PRIORITY MATRIX

| ID | Severity | File | Effort | Fix Before Go-Live? |
|----|----------|------|--------|---------------------|
| C-001 | CRITICAL | `telegram/bot.js` | 5 min | **YES — BLOCKER** |
| C-002 | CRITICAL | `telegram/commands/approvals.js` | 30 min | **YES — BLOCKER** |
| C-003 | CRITICAL | `telegram/booking-notifications.js` | 45 min | **YES — BLOCKER** |
| H-001 | HIGH | `telegram/commands/index.js` | 2 min | **YES** |
| H-002 | HIGH | `telegram/commands/approvals.js` | 30 min | **YES** |
| H-003 | HIGH | `middleware/security.js` | 5 min | **YES** |
| H-004 | HIGH | `telegram/commands/index.js` | 15 min | **YES** |
| H-005 | HIGH | `telegram/commands/index.js` | 2 min | **YES** |
| H-006 | HIGH | `telegram/booking-notifications.js` | 20 min | **YES** |
| H-007 | HIGH | `telegram/bot.js` | 5 min | **YES** |
| M-001 | MEDIUM | `telegram/bot.js` | 2 min | Recommended |
| M-002 | MEDIUM | `telegram/bot.js` | 10 min | Recommended |
| M-003 | MEDIUM | `telegram/multi-clinic-sender.js` | 15 min | Recommended |
| M-004 | MEDIUM | `middleware/staff-takeover.js` | 15 min | Recommended |
| M-005 | MEDIUM | `telegram/booking-notifications.js` | 5 min | Recommended |
| M-006 | MEDIUM | `telegram/booking-notifications.js` | 15 min | Recommended |
| M-007 | MEDIUM | `telegram/bot.js` | 20 min | Next sprint |
| M-008 | MEDIUM | `middleware/security.js` | 30 min | Next sprint |
| M-009 | MEDIUM | `middleware/security.js` | 5 min | Next sprint |
| M-010 | MEDIUM | `telegram/multi-clinic-sender.js` | 15 min | Next sprint |
| M-011 | MEDIUM | `telegram/bot.js` | 10 min | Next sprint |
| M-012 | MEDIUM | `telegram/commands/index.js` | 15 min | Next sprint |

---

## SECURITY POSITIVES (What We Got Right)

1. **Admin-only access enforced** — The `bot.use()` middleware at line 58 correctly rejects ALL non-admin users before any command processing
2. **Rate limiting active** — Telegram commands are rate-limited (1 per 2 seconds, 20 per minute max)
3. **Input sanitization** — All text messages go through `sanitizeInput()` before processing
4. **Prompt injection blocking** — The `processIncomingMessage()` pipeline blocks injection attempts with a score-based system
5. **Safe error handling** — The `safeHandler()` wrapper catches ALL async errors, preventing server crashes
6. **Unhandled rejection protection** — Lines 15-22 prevent the server from crashing on unhandled promise rejections
7. **Multi-clinic sender architecture** — The `sendClinicNotification()` function correctly enforces clinic isolation with proper fallbacks
8. **Markdown escaping** — `escapeMarkdown()` is used consistently for patient data in Telegram messages
9. **No secrets in code** — All sensitive values (bot token, admin chat ID) come from environment variables
10. **Supabase parameterized queries** — All database queries use Supabase's parameterized API, preventing SQL injection

---

## RECOMMENDATIONS

### Immediate (Before Go-Live)
1. Fix C-001: Remove duplicate `bot.start()` handler
2. Fix C-002: Scope `/pending` to clinic's bookings only
3. Fix C-003: Migrate all notification functions to multi-clinic sender
4. Fix H-001 through H-007: PII leaks, ReDoS, error disclosure, memory limits

### Short-Term (Within 1 Week)
5. Fix M-001 through M-006: Duplicate handlers, input sanitization, cache limits
6. Implement clinic-scoped authorization for ALL command handlers
7. Add audit log persistence to database

### Medium-Term (Next Sprint)
8. Fix M-007 through M-012: False positives, error persistence, security scoping
9. Implement word-boundary matching for injection detection
10. Add comprehensive integration tests for multi-clinic isolation

### Ongoing
11. Run this audit monthly as new features are added
12. Monitor `security_events` table for anomalies
13. Review clinic staff access quarterly
