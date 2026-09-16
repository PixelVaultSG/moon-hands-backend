# CLINIC ONBOARDING RUNBOOK
## Moon Hands — Step-by-Step for Clinic #1 (Pixel Vault)

---

## PRE-ONBOARDING CHECKLIST (Do Before Clinic Visit)

| # | Task | Status |
|---|------|--------|
| 1 | WABA is active and connected to 360dialog | |
| 2 | `telegram_chat_ids` column added to Supabase | |
| 3 | `security_events` table created in Supabase | |
| 4 | Render env vars: `TELEGRAM_BOT_TOKEN`, `ADMIN_CHAT_ID`, `D360-API-KEY` verified | |
| 5 | This runbook printed or open on laptop | |

---

## STEP 1: Clinic Information Gathering (15 min)

Collect from clinic:

```
Clinic Name: _________________________
Clinic Slug (auto): PIXELVAULT

Official WhatsApp Number: _________________________
(This is the WABA number patients will message)

Doctor/Owner Name: _________________________
Doctor Telegram Username: _________________________
(For notifications — optional, can add later)

Receptionist Telegram Username: _________________________
(For day-to-day booking notifications — optional)

Google Calendar ID: _________________________
(For auto-syncing bookings)

Operating Hours:
  Monday:    ___ Open ___ Close
  Tuesday:   ___ Open ___ Close
  Wednesday: ___ Open ___ Close
  Thursday:  ___ Open ___ Close
  Friday:    ___ Open ___ Close
  Saturday:  ___ Open ___ Close
  Sunday:    ___ Open ___ Close

Services (name | price | duration):
  1. _________________________
  2. _________________________
  3. _________________________
  4. _________________________
  5. _________________________
  (Continue on back if needed)
```

---

## STEP 2: Create Clinic in Supabase (5 min)

Run in Supabase SQL Editor:

```sql
INSERT INTO clients (
  slug, name, status, whatsapp_number, 
  google_calendar_id, telegram_chat_ids
) VALUES (
  'PIXELVAULT',
  'Pixel Vault Aesthetics',
  'active',
  '+65________',
  '________@gmail.com',
  '{}'
);
```

Note the returned `id` (UUID) — you'll need it for config.

---

## STEP 3: Add Clinic Config (5 min)

```sql
INSERT INTO client_configs (
  client_id, services, operating_hours
) VALUES (
  '<UUID from Step 2>',
  '[
    {"name": "Botox", "price": "S$350", "price_unit": "area", "duration": 30},
    {"name": "HIFU", "price": "S$800", "price_unit": "session", "duration": 60}
  ]'::jsonb,
  '[
    {"day": "Monday", "isOpen": true, "open_time": "10:00", "close_time": "20:00"},
    {"day": "Tuesday", "isOpen": true, "open_time": "10:00", "close_time": "20:00"}
  ]'::jsonb
);
```

---

## STEP 4: Generate Invite Link for Clinic Staff (2 min)

In your Telegram bot:
```
/clinicinvite PIXELVAULT
```

Bot replies with:
- One-time invite code
- Shareable link: `https://t.me/MoonHandsBot?start=XXXXXX`

**Share this link with the clinic staff** (via WhatsApp, email, or in person).

---

## STEP 5: Staff Links Their Telegram (Staff does this)

1. Staff taps the invite link
2. Telegram opens with your bot
3. Staff taps START
4. Bot confirms: "You're now linked to Pixel Vault Aesthetics"

**You get a Telegram notification:**
```
📋 [Pixel Vault Aesthetics]
👤 Staff linked via invite code
💬 Chat ID: 123456789
```

---

## STEP 6: Test WhatsApp Booking (10 min)

1. Send a WhatsApp message to the clinic's WABA number
2. Test these conversations:
   - "Hi" → should get greeting
   - "What services do you have?" → should list services
   - "Book botox tomorrow 2pm" → should ask for name
   - Provide name → should confirm phone
   - Reply YES → should show booking summary
   - Reply YES → should create booking

3. Check you get Telegram notification:
   ```
   ✅ NEW BOOKING
   📅 [date] at [time]
   👤 [Name]
   📱 [Phone]
   🩺 [Treatment]
   ```

---

## STEP 7: Test Staff Controls (5 min)

In clinic staff's Telegram:
1. Tap ⏸️ Pause AI
2. Send patient's phone number
3. Bot pauses for that patient
4. Send message to that patient from clinic's WABA
5. Bot should NOT reply
6. Tap ▶️ Resume AI
7. Bot resumes

---

## STEP 8: Test Approval Flow (5 min)

If bookings require approval:
1. Create a booking that needs approval
2. Clinic staff taps ✅ Approve on Telegram notification
3. Patient gets WhatsApp confirmation

---

## TROUBLESHOOTING

### WABA not responding
- Check Render logs for `D360_API_KEY` presence
- Check 360dialog dashboard for webhook URL pointing to Render
- Check `[SECURITY] API_KEY` warning (this is OK, doesn't affect WhatsApp)

### Telegram notifications not arriving
- Check `TELEGRAM_BOT_TOKEN` env var
- Check `TELEGRAM_ADMIN_CHAT_ID` env var
- Run `/clinicinvite` again and verify staff linked

### Cannot find module '../server/supabase/client'
- This is FIXED in latest code — just means Render hasn't deployed latest commit
- Check Render dashboard for auto-deploy status

### 409 Conflict on Telegram bot
- This is normal on Render redeploys — bot auto-retries with exponential backoff
- Wait 1-2 minutes, bot should reconnect

---

## ROLLBACK PLAN

If anything goes wrong:
1. `/pause PIXELVAULT` — pause the clinic
2. Set `clinic.status = 'paused'` in Supabase
3. Messages will get: "We're currently updating our system. Please call us."
4. Fix the issue
5. `/resume PIXELVAULT` — reactivate

---

## POST-LAUNCH MONITORING (First Week)

| Day | Check |
|-----|-------|
| Day 1 | 5 test bookings, verify all notifications arrive |
| Day 2 | Check security_events table for any anomalies |
| Day 3 | Verify Google Calendar sync (if enabled) |
| Day 5 | Ask clinic staff for feedback on Telegram notifications |
| Day 7 | Review booking accuracy, fix any intent matching issues |
