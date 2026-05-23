-- ─── CALENDAR INTEGRATION SCHEMA ──────────────────────────────────
-- Adds columns for Google Calendar, iCal feed, and calendar provider tracking

-- Clinic's chosen calendar provider
ALTER TABLE clients ADD COLUMN IF NOT EXISTS calendar_provider TEXT 
  CHECK (calendar_provider IN ('google', 'ical', 'dashboard', 'none')) 
  DEFAULT 'none';

-- Google Calendar OAuth refresh token (encrypted at rest via RLS)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

-- Google Calendar ID (the specific calendar to sync events to)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;

-- iCal feed token (UUID for the public feed URL)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ical_token UUID DEFAULT gen_random_uuid();

-- Google Calendar event ID (to enable update/delete)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS google_event_id TEXT;

-- iCal sequence number (for .ics updates)
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS ical_sequence INTEGER DEFAULT 0;

-- Index for looking up appointments by Google event ID
CREATE INDEX IF NOT EXISTS idx_appointments_google_event 
  ON appointments (google_event_id) 
  WHERE google_event_id IS NOT NULL;

-- Update the test clinic to have an iCal token
UPDATE clients SET ical_token = gen_random_uuid() WHERE id = '13d447cf-d0bb-47b3-a39e-9d6d987411d6' AND ical_token IS NULL;

-- Show the iCal feed URL for the test clinic
SELECT 
  name,
  calendar_provider,
  CONCAT('https://moon-hands-backend.onrender.com/ical/', ical_token::text, '.ics') AS ical_feed_url
FROM clients 
WHERE id = '13d447cf-d0bb-47b3-a39e-9d6d987411d6';
