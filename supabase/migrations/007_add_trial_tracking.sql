-- Add trial tracking columns to onboarding_submissions
ALTER TABLE onboarding_submissions 
  ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_reminder_sent BOOLEAN DEFAULT FALSE;

-- Add telegram_chat_id to clients for clinic owner Telegram linking
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT,
  ADD COLUMN IF NOT EXISTS owner_phone_verified BOOLEAN DEFAULT FALSE;

-- Add trial tracking to clients (for clinics that convert from trial to paid)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_trial BOOLEAN DEFAULT FALSE;

-- Add 360dialog API key per clinic (for multi-channel Hub API)
ALTER TABLE client_configs
  ADD COLUMN IF NOT EXISTS d360_api_key TEXT;

-- Index for fast trial expiry queries
CREATE INDEX IF NOT EXISTS idx_clients_trial_expires 
  ON clients(trial_expires_at) 
  WHERE is_trial = TRUE;

-- Index for onboarding trial expiry
CREATE INDEX IF NOT EXISTS idx_onboarding_trial_expires 
  ON onboarding_submissions(trial_expires_at) 
  WHERE status = 'trial_active';