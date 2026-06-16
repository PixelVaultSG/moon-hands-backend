-- SAFE Migration — No Foreign Key Constraints (avoids type mismatch errors)
-- Run this in Supabase SQL Editor

-- ─── PART 1: Onboarding Submissions Columns ───

ALTER TABLE onboarding_submissions 
ADD COLUMN IF NOT EXISTS clinic_email TEXT;

ALTER TABLE onboarding_submissions 
ADD COLUMN IF NOT EXISTS dialog360_readiness JSONB DEFAULT '{}'::jsonb;

ALTER TABLE onboarding_submissions 
ADD COLUMN IF NOT EXISTS onboarding_tier INTEGER DEFAULT 2;

ALTER TABLE onboarding_submissions 
ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'submitted';

-- ─── PART 2: Guided Onboarding Trackers ───

CREATE TABLE IF NOT EXISTS guided_onboarding_trackers (
  id BIGSERIAL PRIMARY KEY,
  clinic_id TEXT,
  onboarding_submission_id BIGINT,
  gaps JSONB DEFAULT '[]'::jsonb,
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 0,
  kimi_initiated BOOLEAN DEFAULT false,
  last_nudge_sent TIMESTAMPTZ,
  nudge_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_guided_status ON guided_onboarding_trackers(status);
CREATE INDEX IF NOT EXISTS idx_guided_clinic ON guided_onboarding_trackers(clinic_id);

-- ─── PART 3: Message Templates ───

CREATE TABLE IF NOT EXISTS message_templates (
  id BIGSERIAL PRIMARY KEY,
  clinic_id TEXT,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'UTILITY',
  language TEXT DEFAULT 'en',
  body TEXT NOT NULL,
  footer TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  meta_template_id TEXT,
  approval_status TEXT DEFAULT 'draft',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_clinic ON message_templates(clinic_id);
CREATE INDEX IF NOT EXISTS idx_templates_key ON message_templates(template_key);

-- ─── PART 4: Seed Default Templates ───

DELETE FROM message_templates WHERE clinic_id IS NULL;

INSERT INTO message_templates (clinic_id, template_key, name, category, body, footer, variables) VALUES
(NULL, 'booking_confirmation', 'Booking Confirmation', 'UTILITY', 
 'Hi {{patient_name}}! ✨\n\nYour appointment is confirmed:\n📅 {{date}} at {{time}}\n💉 {{treatment_name}}\n📍 {{clinic_name}}\n\nNeed to reschedule? Just reply "reschedule" and we''ll find a new slot for you.\n\nSee you soon!\n— {{ai_agent_name}}',
 'Reply STOP to opt out of notifications.',
 '["patient_name", "treatment_name", "date", "time", "clinic_name", "ai_agent_name"]'),

(NULL, 'appointment_reminder', 'Appointment Reminder', 'UTILITY',
 'Hi {{patient_name}}! Reminder:\n\nYour {{treatment_name}} appointment is {{date}} at {{time}}.\n\nReply CONFIRM to confirm, or CANCEL if you need to reschedule.\n\n— {{clinic_name}}',
 'Reply STOP to opt out of notifications.',
 '["patient_name", "treatment_name", "date", "time", "clinic_name"]'),

(NULL, 'follow_up', 'Follow-Up After Treatment', 'UTILITY',
 'Hi {{patient_name}}! 👋\n\nHow was your {{treatment_name}} experience? We''d love your feedback.\n\nReady for your next session? Reply "book" and we''ll find you a slot.\n\n— {{ai_agent_name}} at {{clinic_name}}',
 'Reply STOP to opt out of notifications.',
 '["patient_name", "treatment_name", "clinic_name", "ai_agent_name"]'),

(NULL, 'welcome_new_patient', 'Welcome New Patient', 'UTILITY',
 'Welcome to {{clinic_name}}! 🌟\n\nI''m {{ai_agent_name}}, your virtual assistant. I can help you with:\n• Booking appointments\n• Treatment information and pricing\n• Answering your questions\n\nWhat can I help you with today?',
 'Reply STOP to opt out of notifications.',
 '["patient_name", "clinic_name", "ai_agent_name"]'),

(NULL, 'cancellation_confirmation', 'Cancellation Confirmation', 'UTILITY',
 'Hi {{patient_name}}!\n\nYour appointment for {{treatment_name}} on {{date}} at {{time}} has been cancelled.\n\nNo worries — when you''re ready to rebook, just send us a message anytime.\n\n— {{ai_agent_name}}',
 'Reply STOP to opt out of notifications.',
 '["patient_name", "treatment_name", "date", "time", "ai_agent_name"]');

-- ─── PART 5: Delivery Status Tracking ───

CREATE TABLE IF NOT EXISTS message_delivery_log (
  id BIGSERIAL PRIMARY KEY,
  message_id TEXT NOT NULL,
  clinic_id TEXT,
  phone_number TEXT NOT NULL,
  template_key TEXT,
  status TEXT DEFAULT 'sent',
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_status ON message_delivery_log(status);
CREATE INDEX IF NOT EXISTS idx_delivery_clinic ON message_delivery_log(clinic_id);

-- ─── PART 6: Simple Bookings Table (for Basic tier availability) ───

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  patient_name TEXT,
  treatment TEXT NOT NULL,
  booking_date DATE NOT NULL,
  booking_time TIME NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  status TEXT DEFAULT 'pending',
  -- pending → confirmed → cancelled → completed
  source TEXT DEFAULT 'ai',
  -- ai = booked by AI, manual = clinic added manually
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_clinic ON bookings(clinic_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- ─── PART 7: Monthly Performance Report Table ───

CREATE TABLE IF NOT EXISTS monthly_reports (
  id BIGSERIAL PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  report_month TEXT NOT NULL,
  -- Format: "2026-06"
  total_enquiries INTEGER DEFAULT 0,
  total_bookings INTEGER DEFAULT 0,
  confirmed_bookings INTEGER DEFAULT 0,
  cancelled_bookings INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2) DEFAULT 0,
  avg_response_time_seconds INTEGER DEFAULT 0,
  peak_hour TEXT,
  top_treatment TEXT,
  no_show_count INTEGER DEFAULT 0,
  no_show_rate DECIMAL(5,2) DEFAULT 0,
  revenue_opportunity DECIMAL(10,2) DEFAULT 0,
  report_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, report_month)
);

CREATE INDEX IF NOT EXISTS idx_reports_clinic ON monthly_reports(clinic_id);
CREATE INDEX IF NOT EXISTS idx_reports_month ON monthly_reports(report_month);

-- ─── Comments ───
COMMENT ON COLUMN onboarding_submissions.dialog360_readiness IS 'JSON: {has_whatsapp_business, has_meta_portfolio, meta_portfolio_verified, whatsapp_app_online, phone_number_ready}';
COMMENT ON COLUMN onboarding_submissions.onboarding_tier IS '1 = Tier 1 (self-service), 2 = Tier 2 (guided)';
COMMENT ON COLUMN bookings.status IS 'pending → confirmed → cancelled → completed';
