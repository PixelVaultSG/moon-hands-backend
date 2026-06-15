-- Migration: Add Tier 1/Tier 2 onboarding fields + 360dialog readiness + clinic email
-- Run this in Supabase SQL Editor

-- Add clinic email (separate from contact email)
ALTER TABLE onboarding_submissions 
ADD COLUMN IF NOT EXISTS clinic_email TEXT;

-- Add 360dialog readiness assessment (JSON for flexibility)
ALTER TABLE onboarding_submissions 
ADD COLUMN IF NOT EXISTS dialog360_readiness JSONB DEFAULT '{}'::jsonb;

-- Add tier classification
ALTER TABLE onboarding_submissions 
ADD COLUMN IF NOT EXISTS onboarding_tier INTEGER DEFAULT 2; -- 1 = Tier 1 (self-service), 2 = Tier 2 (guided)

-- Add onboarding status tracking
ALTER TABLE onboarding_submissions 
ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'submitted'; 
-- submitted → processing → tier_assigned → awaiting_clinic → in_progress → completed / abandoned

-- Add guided onboarding tracker table
CREATE TABLE IF NOT EXISTS guided_onboarding_trackers (
  id BIGSERIAL PRIMARY KEY,
  clinic_id TEXT REFERENCES clients(id),
  onboarding_submission_id BIGINT REFERENCES onboarding_submissions(id),
  gaps JSONB DEFAULT '[]'::jsonb, -- array of {id, question, answer, priority, instruction, completed}
  current_step INTEGER DEFAULT 0,
  total_steps INTEGER DEFAULT 0,
  kimi_initiated BOOLEAN DEFAULT false,
  last_nudge_sent TIMESTAMPTZ,
  nudge_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active', -- active → stalled → completed → abandoned
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for finding stalled onboardings
CREATE INDEX IF NOT EXISTS idx_guided_status ON guided_onboarding_trackers(status);
CREATE INDEX IF NOT EXISTS idx_guided_clinic ON guided_onboarding_trackers(clinic_id);

-- Message templates table
CREATE TABLE IF NOT EXISTS message_templates (
  id BIGSERIAL PRIMARY KEY,
  clinic_id TEXT REFERENCES clients(id), -- null = global default
  template_key TEXT NOT NULL, -- 'booking_confirmation', 'appointment_reminder', etc.
  name TEXT NOT NULL,
  category TEXT DEFAULT 'UTILITY', -- UTILITY | MARKETING | AUTHENTICATION
  language TEXT DEFAULT 'en',
  body TEXT NOT NULL,
  footer TEXT,
  variables JSONB DEFAULT '[]'::jsonb, -- array of variable names
  meta_template_id TEXT, -- Meta's approved template ID
  approval_status TEXT DEFAULT 'draft', -- draft → submitted → approved → rejected
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(clinic_id, template_key)
);

-- Seed default templates
INSERT INTO message_templates (template_key, name, category, body, footer, variables) VALUES
('booking_confirmation', 'Booking Confirmation', 'UTILITY', 
 'Hi {{patient_name}}! ✨\n\nYour appointment is confirmed:\n📅 {{date}} at {{time}}\n💉 {{treatment_name}}\n📍 {{clinic_name}}\n\nNeed to reschedule? Just reply "reschedule" and we''ll find a new slot for you.\n\nSee you soon!\n— {{ai_agent_name}}',
 'Reply STOP to opt out of notifications.',
 '["patient_name", "treatment_name", "date", "time", "clinic_name", "ai_agent_name"]'),

('appointment_reminder', 'Appointment Reminder', 'UTILITY',
 'Hi {{patient_name}}! Reminder:\n\nYour {{treatment_name}} appointment is {{date}} at {{time}}.\n\nReply CONFIRM to confirm, or CANCEL if you need to reschedule.\n\n— {{clinic_name}}',
 'Reply STOP to opt out of notifications.',
 '["patient_name", "treatment_name", "date", "time", "clinic_name"]'),

('follow_up', 'Follow-Up After Treatment', 'UTILITY',
 'Hi {{patient_name}}! 👋\n\nHow was your {{treatment_name}} experience? We''d love your feedback.\n\nReady for your next session? Reply "book" and we''ll find you a slot.\n\n— {{ai_agent_name}} at {{clinic_name}}',
 'Reply STOP to opt out of notifications.',
 '["patient_name", "treatment_name", "clinic_name", "ai_agent_name"]'),

('welcome_new_patient', 'Welcome New Patient', 'UTILITY',
 'Welcome to {{clinic_name}}! 🌟\n\nI''m {{ai_agent_name}}, your virtual assistant. I can help you with:\n• Booking appointments\n• Treatment information and pricing\n• Answering your questions\n\nWhat can I help you with today?',
 'Reply STOP to opt out of notifications.',
 '["patient_name", "clinic_name", "ai_agent_name"]'),

('cancellation_confirmation', 'Cancellation Confirmation', 'UTILITY',
 'Hi {{patient_name}}!\n\nYour appointment for {{treatment_name}} on {{date}} at {{time}} has been cancelled.\n\nNo worries — when you''re ready to rebook, just send us a message anytime.\n\n— {{ai_agent_name}}',
 'Reply STOP to opt out of notifications.',
 '["patient_name", "treatment_name", "date", "time", "ai_agent_name"]')

ON CONFLICT (clinic_id, template_key) DO NOTHING;

-- Delivery status tracking table
CREATE TABLE IF NOT EXISTS message_delivery_log (
  id BIGSERIAL PRIMARY KEY,
  message_id TEXT NOT NULL,
  clinic_id TEXT REFERENCES clients(id),
  phone_number TEXT NOT NULL,
  template_key TEXT,
  status TEXT DEFAULT 'sent', -- sent → delivered → read → failed
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_status ON message_delivery_log(status);
CREATE INDEX IF NOT EXISTS idx_delivery_clinic ON message_delivery_log(clinic_id);
CREATE INDEX IF NOT EXISTS idx_delivery_phone ON message_delivery_log(phone_number);

-- Comments for documentation
COMMENT ON COLUMN onboarding_submissions.dialog360_readiness IS 'JSON: {has_whatsapp_business, has_meta_portfolio, meta_portfolio_verified, whatsapp_app_online, phone_number_ready}';
COMMENT ON COLUMN onboarding_submissions.onboarding_tier IS '1 = Tier 1 (self-service, all Yes), 2 = Tier 2 (guided, any Not Sure)';
COMMENT ON COLUMN onboarding_submissions.onboarding_status IS 'Pipeline: submitted → processing → tier_assigned → awaiting_clinic → in_progress → completed / abandoned';
