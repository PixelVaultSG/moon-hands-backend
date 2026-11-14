-- ============================================================================
-- Migration 010: A-4 double-booking hard wall (v2.5.26)
-- Moon Hands by Pixel Vault Pte Ltd
-- Date: 2026-11-14
--
-- Additive only — no existing columns, tables, or data are modified or dropped.
-- Safe to run on production. Idempotent (DROP IF EXISTS first).
--
-- WHY: createBooking checks for conflicts and THEN inserts. Two requests
-- landing in the same millisecond window both pass the check and both insert
-- — a double-booking the code can never fully prevent. This exclusion
-- constraint makes the DATABASE refuse the second overlapping write
-- (SQLSTATE 23P01), so the bad state is physically impossible. The app code
-- (v2.5.26) catches 23P01 and tells the patient honestly that the slot was
-- just taken.
--
-- SCOPE: guards real interval overlap (appointment_time .. +duration) per
-- clinic per day, for rows whose status occupies a slot:
--   confirmed, pending, pending_approval, booked, pending_alternative
-- cancelled / completed / no_show rows do NOT block — cancelling or
-- completing frees the slot automatically. Buffer time stays a code-level
-- nicety, deliberately NOT part of the hard wall.
--
-- PRE-CHECK (done 2026-11-14): zero overlapping active rows exist, so the
-- constraint builds cleanly.
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
-- Verify after: queries at the bottom of this file.
-- ============================================================================

-- ─── 1. btree_gist — required for = on uuid/date inside a gist constraint ──
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─── 2. The hard wall ──────────────────────────────────────────────────────
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS no_overlapping_active_bookings;

ALTER TABLE appointments
  ADD CONSTRAINT no_overlapping_active_bookings
  EXCLUDE USING gist (
    client_id WITH =,
    appointment_date WITH =,
    (tsrange(
      (appointment_date + appointment_time)::timestamp,
      (appointment_date + appointment_time)::timestamp
        + make_interval(mins => COALESCE(duration, 30))
    )) WITH &&
  )
  WHERE (status IN ('confirmed', 'pending', 'pending_approval', 'booked', 'pending_alternative'));

-- ─── 3. Verify ─────────────────────────────────────────────────────────────
-- (a) Constraint exists with the expected definition:
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'no_overlapping_active_bookings';
-- expected: exactly 1 row

-- (b) Behavioral proof — copying an existing active booking onto the same
-- slot MUST fail. Run as one statement; expect an ERROR:
--   ERROR: conflicting key value violates exclusion constraint
--   "no_overlapping_active_bookings"
-- INSERT INTO appointments (client_id, customer_name, customer_phone, service,
--   appointment_date, appointment_time, duration, status)
-- SELECT client_id, 'TEST DOUBLE', '6500000000', service,
--   appointment_date, appointment_time, duration, 'pending'
-- FROM appointments
-- WHERE status IN ('confirmed', 'pending')
-- ORDER BY appointment_date DESC
-- LIMIT 1;
-- (The insert is commented out so the migration itself stays clean — uncomment
-- to prove the wall, or let the assistant prove it via the API.)

-- ─── 4. Rollback (if ever needed) ──────────────────────────────────────────
-- ALTER TABLE appointments DROP CONSTRAINT IF EXISTS no_overlapping_active_bookings;
