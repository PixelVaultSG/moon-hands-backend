-- Pixel Vault - Supabase Database Schema
-- Run this in your Supabase SQL Editor after creating the project

-- ─── CLIENTS TABLE ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  industry TEXT DEFAULT 'aesthetic', -- aesthetic, dental, chiro, physio
  plan TEXT NOT NULL DEFAULT 'starter', -- starter, professional
  status TEXT NOT NULL DEFAULT 'setup', -- setup, active, paused, cancelled
  phone_number TEXT,
  whatsapp_number TEXT,
  google_calendar_id TEXT,
  onboarding_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for slug lookups
CREATE INDEX IF NOT EXISTS idx_clients_slug ON clients(slug);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

-- ─── CLIENT CONFIGS TABLE ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS client_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,

  -- AI Personality
  agent_name TEXT DEFAULT 'Sophia',
  greeting TEXT DEFAULT 'Hello! Welcome to {businessName}. How can I help you today?',
  tone TEXT DEFAULT 'friendly', -- friendly, professional, casual
  enthusiasm TEXT DEFAULT 'medium', -- low, medium, high
  special_notes TEXT,

  -- Services (JSON array)
  services JSONB DEFAULT '[]',

  -- Operating Hours (JSON array)
  operating_hours JSONB DEFAULT '[
    {"day":"Monday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Tuesday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Wednesday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Thursday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Friday","isOpen":true,"open_time":"09:00","close_time":"18:00"},
    {"day":"Saturday","isOpen":true,"open_time":"09:00","close_time":"14:00"},
    {"day":"Sunday","isOpen":false,"open_time":"","close_time":""}
  ]',

  -- FAQs (JSON array)
  faqs JSONB DEFAULT '[]',

  -- Booking Rules
  appointment_duration INT DEFAULT 60,
  buffer_time INT DEFAULT 15,
  max_per_day INT DEFAULT 12,
  cancellation_policy TEXT DEFAULT '24 hours notice required',

  -- Languages
  languages TEXT[] DEFAULT ARRAY['en'],

  -- Automations
  automations JSONB DEFAULT '{
    "bookingConfirmation": true,
    "reminder24h": true,
    "reminder1h": false,
    "followup48h": true
  }',

  -- Integrations
  vapi_assistant_id TEXT,
  vapi_phone_number TEXT,
  twilio_phone_sid TEXT,
  instagram_connected BOOLEAN DEFAULT false,
  facebook_connected BOOLEAN DEFAULT false,

  -- Clinic Booking Preferences (configurable per clinic)
  booking_auto_confirm BOOLEAN DEFAULT false,
  booking_after_hours_action TEXT DEFAULT 'hold_for_approval',
  booking_waitlist_enabled BOOLEAN DEFAULT true,
  booking_max_advance_days INT DEFAULT 30,
  booking_min_notice_hours INT DEFAULT 2,
  booking_require_phone BOOLEAN DEFAULT true,
  booking_allow_same_day BOOLEAN DEFAULT true,
  booking_reminder_24h BOOLEAN DEFAULT true,
  booking_reminder_1h BOOLEAN DEFAULT true,
  booking_followup_48h BOOLEAN DEFAULT true,

  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_client_configs_client_id ON client_configs(client_id);

-- ─── DAILY USAGE TABLE ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  voice_minutes INT DEFAULT 0,
  voice_calls INT DEFAULT 0,
  whatsapp_messages INT DEFAULT 0,
  whatsapp_conversations INT DEFAULT 0,
  instagram_messages INT DEFAULT 0,
  cost DECIMAL(10,4) DEFAULT 0,
  bookings INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, client_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_date ON daily_usage(date);
CREATE INDEX IF NOT EXISTS idx_daily_usage_client ON daily_usage(client_id);

-- ─── MONTHLY USAGE TABLE ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS monthly_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL, -- YYYY-MM
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  voice_minutes INT DEFAULT 0,
  whatsapp_messages INT DEFAULT 0,
  cost DECIMAL(10,2) DEFAULT 0,
  bookings INT DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  UNIQUE(month, client_id)
);

CREATE INDEX IF NOT EXISTS idx_monthly_usage_month ON monthly_usage(month);

-- ─── CONVERSATIONS TABLE ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  channel TEXT NOT NULL, -- whatsapp, voice, instagram, facebook
  customer_phone TEXT,
  customer_name TEXT,
  message TEXT,
  ai_response TEXT,
  intent TEXT, -- booking, inquiry, pricing, complaint, etc
  summary TEXT,
  budget_mentioned TEXT,
  recommended_action TEXT,
  is_high_value BOOLEAN DEFAULT false,
  is_booked BOOLEAN DEFAULT false,
  notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_client ON conversations(client_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_high_value ON conversations(client_id, is_high_value, notified) WHERE is_high_value = true AND notified = false;

-- ─── APPOINTMENTS TABLE ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id),
  customer_name TEXT,
  customer_phone TEXT,
  service TEXT,
  appointment_date DATE,
  appointment_time TIME,
  duration INT DEFAULT 60,
  status TEXT DEFAULT 'confirmed', -- confirmed, pending_approval, pending, completed, cancelled, no_show
  notes TEXT,
  reminder_24h_sent BOOLEAN DEFAULT false,
  reminder_1h_sent BOOLEAN DEFAULT false,
  followup_48h_sent BOOLEAN DEFAULT false,
  approval_notified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);

-- ─── WAITLIST TABLE ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  preferred_service TEXT,
  preferred_date DATE,
  preferred_time_range TEXT, -- 'morning', 'afternoon', 'evening', 'any'
  status TEXT DEFAULT 'active', -- active, notified, converted, expired
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_waitlist_client ON waitlist(client_id);
CREATE INDEX IF NOT EXISTS idx_waitlist_status ON waitlist(status);
CREATE INDEX IF NOT EXISTS idx_waitlist_date ON waitlist(preferred_date);

CREATE TRIGGER update_waitlist_updated_at BEFORE UPDATE ON waitlist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── HEALTH CHECKS TABLE ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL, -- vapi, twilio, supabase, calendar, instagram, telegram
  status TEXT NOT NULL, -- healthy, degraded, down
  latency_ms INT,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_checks_service ON health_checks(service, checked_at);

-- ─── PENDING CHANGES TABLE ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- add_service, update_price, update_hours, etc
  payload JSONB NOT NULL,
  requested_by BIGINT NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, processing, completed, failed
  result TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_changes_status ON pending_changes(status);

-- ─── ROW LEVEL SECURITY (ENABLED BY DEFAULT) ─────────────────────

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_configs ENABLE ROW LEVEL SECURITY;

-- ─── TRIGGER: AUTO-UPDATE updated_at ─────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_client_configs_updated_at BEFORE UPDATE ON client_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── SEED DATA: Sample Client (for testing) ──────────────────────

INSERT INTO clients (slug, name, contact_name, contact_email, industry, plan, status)
VALUES (
  'demo-clinic',
  'Demo Aesthetic Clinic',
  'Dr. Sarah Tan',
  'sarah@democlinic.sg',
  'aesthetic',
  'professional',
  'active'
)
ON CONFLICT DO NOTHING;

INSERT INTO client_configs (client_id, agent_name, greeting, tone, services, special_notes)
SELECT
  id,
  'Sophia',
  'Hi there! Welcome to Demo Aesthetic Clinic. I''m Sophia, your virtual assistant. How can I help you today?',
  'friendly',
  '[
    {"name":"HydraFacial","price":"$280","duration":60,"description":"Deep cleansing and hydration"},
    {"name":"Botox","price":"From $300","duration":30,"description":"Anti-wrinkle injections"},
    {"name":"Dermal Fillers","price":"From $600","duration":45,"description":"Volume restoration"},
    {"name":"HIFU","price":"$1,500","duration":90,"description":"Non-surgical face lifting"},
    {"name":"Consultation","price":"Free","duration":30,"description":"Free initial consultation"}
  ]'::jsonb,
  'Always be warm and professional. Never give medical advice. Always recommend consultation for treatment-specific questions.'
FROM clients WHERE slug = 'demo-clinic'
ON CONFLICT DO NOTHING;
