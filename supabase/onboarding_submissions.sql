-- Moon Hands - Onboarding Submissions Table
-- Stores raw intake data from clinic onboarding form
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Clinic Identity
  clinic_name TEXT NOT NULL,
  clinic_email TEXT NOT NULL,
  clinic_phone TEXT NOT NULL,
  clinic_address TEXT,
  clinic_postal_code TEXT,
  business_registration_number TEXT, -- UEN for Singapore

  -- Contact Person
  contact_name TEXT NOT NULL,
  contact_role TEXT, -- e.g. "Owner", "Manager", "Receptionist"

  -- Selected Plan
  selected_plan TEXT NOT NULL DEFAULT 'starter', -- starter, professional

  -- WhatsApp Business Number (the number they want to connect)
  whatsapp_number TEXT NOT NULL,

  -- Languages they serve patients in
  languages TEXT[] DEFAULT ARRAY['en'],

  -- Treatment Menu (JSON array of services with pricing)
  -- Format: [{"name":"HydraFacial","price":"$280","duration":60,"category":"Facial"}]
  treatment_menu JSONB DEFAULT '[]',

  -- Operating Hours (JSON array)
  -- Format: [{"day":"Monday","isOpen":true,"open_time":"09:00","close_time":"18:00"}]
  operating_hours JSONB DEFAULT '[
    {"day":"Monday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Tuesday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Wednesday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Thursday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Friday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Saturday","isOpen":true,"open_time":"09:00","close_time":"14:00"},
    {"day":"Sunday","isOpen":false,"open_time":"","close_time":""}
  ]',

  -- Appointment Settings
  appointment_duration_minutes INT DEFAULT 60,
  buffer_between_appointments_minutes INT DEFAULT 15,
  max_appointments_per_day INT DEFAULT 12,
  cancellation_policy TEXT DEFAULT '24 hours notice required',

  -- Brand & Voice Preferences
  preferred_agent_name TEXT DEFAULT 'Sophia',
  preferred_tone TEXT DEFAULT 'friendly', -- friendly, professional, casual
  preferred_greeting TEXT DEFAULT 'Hello! Welcome to {clinicName}. How can I help you today?',
  special_notes TEXT, -- e.g. "Never mention competitor names. Always upsell package."

  -- Integrations
  has_google_calendar BOOLEAN DEFAULT false,
  google_calendar_email TEXT,

  -- Clinic Booking Preferences (configurable per clinic)
  booking_auto_confirm BOOLEAN DEFAULT false, -- true = bot auto-confirms bookings, false = clinic approves via Telegram
  booking_after_hours_action TEXT DEFAULT 'auto_confirm', -- 'auto_confirm', 'hold_for_approval', 'next_business_day'
  booking_waitlist_enabled BOOLEAN DEFAULT true, -- true = offer waitlist when fully booked
  booking_max_advance_days INT DEFAULT 30, -- how far ahead patients can book
  booking_min_notice_hours INT DEFAULT 2, -- minimum hours before appointment for new bookings
  booking_require_phone BOOLEAN DEFAULT true, -- require phone number before booking
  booking_allow_same_day BOOLEAN DEFAULT true, -- allow same-day bookings
  booking_reminder_24h BOOLEAN DEFAULT true, -- send 24h reminder
  booking_reminder_1h BOOLEAN DEFAULT true, -- send 1h reminder
  booking_followup_48h BOOLEAN DEFAULT true, -- send follow-up 48h after appointment

  -- FAQ knowledge base (JSON array)
  -- Format: [{"question":"Where do you park?","answer":"Free parking at the back of the building."}]
  faqs JSONB DEFAULT '[]',

  -- Aftercare instructions (JSON array)
  -- Format: [{"treatment":"HydraFacial","instructions":"Keep skin hydrated..."}]
  aftercare_instructions JSONB DEFAULT '[]',

  -- Uploads (stored as Supabase Storage references)
  business_registration_file_url TEXT,
  treatment_menu_file_url TEXT,
  logo_file_url TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending', -- pending, review, in_progress, completed, rejected

  -- Admin Review
  admin_notes TEXT,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,

  -- Linked client record (once created)
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_submissions(status);
CREATE INDEX IF NOT EXISTS idx_onboarding_email ON onboarding_submissions(clinic_email);
CREATE INDEX IF NOT EXISTS idx_onboarding_created ON onboarding_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_client ON onboarding_submissions(client_id);

-- Enable RLS
ALTER TABLE onboarding_submissions ENABLE ROW LEVEL SECURITY;

-- Policy: Only service_role (backend) can read all rows
CREATE POLICY "Service role full access" ON onboarding_submissions
  FOR ALL USING (true) WITH CHECK (true);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_onboarding_updated_at BEFORE UPDATE ON onboarding_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
