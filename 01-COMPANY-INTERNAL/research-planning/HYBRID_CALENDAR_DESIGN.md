# Moon Hands — Hybrid Calendar Integration Design
**On-Demand Read + Hardcoded Holidays (NOT polling)**

---

## Architecture: NO Polling. On-Demand Only.

**Previous bad idea:** Bot reads calendar every 5 minutes (wasteful, complex, unnecessary).

**Correct approach:** Bot reads calendar ONLY when patient asks for slots.

```
Patient: "What slots do you have on Tuesday?"

  ↓ Intent: check_availability

  ↓ Bot calls checkAvailability()

  ↓ Step 1: Check hardcoded public holidays
            Is Tuesday a public holiday? → YES → "We're closed"
            
  ↓ Step 2: Read Google Calendar (ONE API call, right now)
            Fetch events for Tuesday from calendar_events cache
            If cache is stale (>15 min old), refresh from Google API
            
  ↓ Step 3: Generate available slots
            Operating hours 9am-6pm
            Minus: calendar busy events
            Minus: existing confirmed appointments from Supabase
            = Available slots returned to patient

  ↓ Patient picks slot → Bot calls createBooking()
    
  ↓ Step 4: Write booking to Supabase + Google Calendar
            Creates event: "[Patient Name] - [Treatment], [Time]"
            Doctor sees it instantly in their calendar

Done. No background polling. No cron jobs. No wasted API calls.
```

---

## Hardcoded Singapore Public Holidays 2026

Stored in a simple JSON file — no API calls needed.

```json
{
  "2026-01-01": "New Year's Day",
  "2026-02-17": "Chinese New Year (Day 1)",
  "2026-02-18": "Chinese New Year (Day 2)",
  "2026-04-03": "Good Friday",
  "2026-05-01": "Labour Day",
  "2026-05-12": "Hari Raya Puasa",
  "2026-05-31": "Vesak Day",
  "2026-07-20": "Hari Raya Haji",
  "2026-08-09": "National Day",
  "2026-10-25": "Deepavali",
  "2026-12-25": "Christmas Day"
}
```

**Updated annually.** One file. Zero API dependency.

---

## Google Calendar: On-Demand Refresh

**Cache strategy:**
- Calendar events cached in Supabase `calendar_events` table
- Cache TTL: 15 minutes
- On `checkAvailability()` call:
  - If cache < 15 min old → use cached data (fast, 0 Google API calls)
  - If cache > 15 min old → ONE Google API call → refresh cache → return

**Why 15 minutes?**
- Doctor changes calendar rarely during work hours
- Patient booking via bot → instantly written to calendar (bypasses cache)
- 15 min staleness acceptable for slot checking
- ZERO background API calls unless actively booking

**Two-way sync (write):**
- On `createBooking()` → write event to Google Calendar immediately
- On `cancelBooking()` → delete event from Google Calendar immediately
- On `rescheduleBooking()` → delete old + create new in Google Calendar

---

## Clinic Onboarding for Calendar

**Step 1 (during onboarding form):**
- Checkbox: "Connect your Google Calendar for real-time availability?"
- If YES → show instructions + service account email

**Step 2 (automated email after signup):**
```
Subject: Connect Moon Hands to Your Google Calendar (3 steps)

Hi [Clinic Name],

To ensure your AI receptionist only offers REAL available slots,
please share your Google Calendar with us. It takes 2 minutes.

Step 1: Open Google Calendar
Step 2: Find your calendar → Click the 3 dots → "Settings and sharing"
Step 3: Under "Share with specific people", add:
       moon-hands@project.iam.gserviceaccount.com
       Permission: "See all event details"

Done! Our bot will now read your calendar in real-time.

Questions? Reply to this email or WhatsApp us.
```

**Step 3 (we verify):**
- Admin tests calendar read via Telegram `/test_calendar [clinic_id]`
- If successful → bot starts using calendar
- If failed → notify clinic owner to check sharing settings

---

## Implementation Effort

| Component | Days | Notes |
|-----------|------|-------|
| Hardcoded holidays JSON | 0.5 | Already have 2026 list |
| Holiday check in `checkAvailability` | 0.5 | Simple date lookup |
| Google Service Account setup | 0.5 | One-time config |
| Calendar read (on-demand) | 1 | Cache logic + refresh |
| Calendar write (booking → calendar) | 1 | Event creation |
| Calendar delete (cancel → calendar) | 0.5 | Event deletion |
| Clinic onboarding flow | 1 | Email + verification |
| Testing with real calendar | 1 | End-to-end |
| **TOTAL** | **~6 days** | **Not 15. Not 5. 6.** |

---

## Why This is Better Than Polling

| Aspect | Polling (every 5 min) | On-Demand |
|--------|----------------------|-----------|
| API calls/day at 10 clinics | 2,880 wasted calls | ~200 actual calls |
| API calls/day at 100 clinics | 28,800 wasted calls | ~1,500 actual calls |
| Cost | $$ | $0 (free tier) |
| Complexity | Cron job + queue + retry | Simple cache check |
| Reliability | Background failures = stale data | Failures visible immediately |
| Patient experience | Same (both return slots) | Same |

---

## AGENT CONSENSUS

All 6 agents agree: **On-demand + hardcoded holidays is the correct architecture.**

- Database Manager: Cache table is simple, 15-min TTL is reasonable
- Security Agent: Service account model, no OAuth, revocable
- AI Manager: No background jobs = fewer failure modes
- DevOps: 6 days, not 15. Manageable within 4-week MVP
- Sales: "Real-time calendar sync" pitch is still valid
- Business Ops: Correct balance of quality and speed

**APPROVED. Proceed with hybrid implementation.**
