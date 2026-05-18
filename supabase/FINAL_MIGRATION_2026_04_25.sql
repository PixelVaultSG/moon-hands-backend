-- ═══════════════════════════════════════════════════════════════════
-- Moon Hands — Final Go-Live Migration (WITH RLS)
-- Run in Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Booking preferences on client_configs
ALTER TABLE client_configs
  ADD COLUMN IF NOT EXISTS booking_auto_confirm BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_after_hours_action TEXT DEFAULT 'auto_confirm',
  ADD COLUMN IF NOT EXISTS booking_waitlist_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_max_advance_days INT DEFAULT 30,
  ADD COLUMN IF NOT EXISTS booking_min_notice_hours INT DEFAULT 2,
  ADD COLUMN IF NOT EXISTS booking_require_phone BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_allow_same_day BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_reminder_24h BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_reminder_1h BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_followup_48h BOOLEAN DEFAULT true;

-- 2. Reminder tracking on appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_48h_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_notified BOOLEAN DEFAULT false;

-- 3. Google Calendar refresh token
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

-- 4. Waitlist table + RLS
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  preferred_service TEXT,
  preferred_date DATE,
  preferred_time_range TEXT DEFAULT 'any',
  status TEXT DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_client ON waitlist(client_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_date ON waitlist(preferred_date);

-- Drop trigger if exists, then create (PostgreSQL doesn't support IF NOT EXISTS for triggers)
DROP TRIGGER IF EXISTS update_waitlist_updated_at ON waitlist;
CREATE TRIGGER update_waitlist_updated_at 
  BEFORE UPDATE ON waitlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS but create NO policies — service_role key only (backend)
-- This prevents any anon/authenticated key from accessing patient waitlist data
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
-- DO NOT create policies here. Zero policies = safest for backend-only access.

-- 5. Onboarding submissions table + RLS
CREATE TABLE IF NOT EXISTS onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_name TEXT NOT NULL,
  clinic_email TEXT NOT NULL,
  clinic_phone TEXT NOT NULL,
  clinic_address TEXT,
  clinic_postal_code TEXT,
  business_registration_number TEXT,
  contact_name TEXT NOT NULL,
  contact_role TEXT,
  selected_plan TEXT NOT NULL DEFAULT 'starter',
  whatsapp_number TEXT NOT NULL,
  languages TEXT[] DEFAULT ARRAY['en'],
  treatment_menu JSONB DEFAULT '[]',
  operating_hours JSONB DEFAULT '[
    {"day":"Monday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Tuesday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Wednesday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Thursday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Friday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Saturday","isOpen":true,"open_time":"09:00","close_time":"14:00"},
    {"day":"Sunday","isOpen":false,"open_time":"","close_time":""}
  ]',
  appointment_duration_minutes INT DEFAULT 60,
  buffer_between_appointments_minutes INT DEFAULT 15,
  max_appointments_per_day INT DEFAULT 12,
  cancellation_policy TEXT DEFAULT '24 hours notice required',
  preferred_agent_name TEXT DEFAULT 'Sophia',
  preferred_tone TEXT DEFAULT 'friendly',
  preferred_greeting TEXT DEFAULT 'Hello! Welcome to {clinicName}. How can I help you today?',
  special_notes TEXT,
  has_google_calendar BOOLEAN DEFAULT false,
  google_calendar_email TEXT,
  faqs JSONB DEFAULT '[]',
  aftercare_instructions JSONB DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  admin_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_submissions(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_email ON onboarding_submissions(clinic_email);
CREATE INDEX IF NOT EXISTS idx_onboarding_created ON onboarding_submissions(created_at DESC);

-- Drop trigger if exists, then create
DROP TRIGGER IF EXISTS update_onboarding_updated_at ON onboarding_submissions;
CREATE TRIGGER update_onboarding_updated_at 
  BEFORE UPDATE ON onboarding_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE onboarding_submissions ENABLE ROW LEVEL SECURITY;
-- DO NOT create policies here. Zero policies = safest for backend-only access.
-- Anon/authenticated keys cannot read clinic onboarding data.
-- Backend uses service_role key which bypasses RLS.

-- 6. Booking preferences on onboarding_submissions
ALTER TABLE onboarding_submissions
  ADD COLUMN IF NOT EXISTS booking_auto_confirm BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_after_hours_action TEXT DEFAULT 'hold_for_approval',
  ADD COLUMN IF NOT EXISTS booking_waitlist_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_max_advance_days INT DEFAULT 30,
  ADD COLUMN IF NOT EXISTS booking_min_notice_hours INT DEFAULT 2,
  ADD COLUMN IF NOT EXISTS booking_allow_same_day BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_reminder_24h BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_reminder_1h BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_followup_48h BOOLEAN DEFAULT true;

-- 7. Performance indexes
CREATE INDEX IF NOT EXISTS idx_appointments_pending_approval 
  ON appointments(client_id, status) WHERE status = 'pending_approval';

CREATE INDEX IF NOT EXISTS idx_appointments_reminders
  ON appointments(appointment_date, status, reminder_24h_sent, reminder_1h_sent)
  WHERE status = 'confirmed';

CREATE INDEX IF NOT EXISTS idx_conversations_lookup
  ON conversations(client_id, customer_phone, created_at DESC);