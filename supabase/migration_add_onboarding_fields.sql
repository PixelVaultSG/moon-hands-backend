-- Migration: Add clinic aftercare + escalation fields to client_configs
-- Run in Supabase SQL Editor

-- Add aftercare_instructions (JSONB array of per-treatment instructions)
ALTER TABLE client_configs 
ADD COLUMN IF NOT EXISTS aftercare_instructions JSONB DEFAULT '[]';

-- Add clinic Telegram username for escalation alerts
ALTER TABLE client_configs
ADD COLUMN IF NOT EXISTS clinic_telegram_username TEXT;

-- Add escalation_phone (backup phone for urgent patient issues)
ALTER TABLE client_configs
ADD COLUMN IF NOT EXISTS escalation_phone TEXT;

-- Example aftercare_instructions format:
-- [
--   {
--     "treatment": "HydraFacial",
--     "instructions": "Keep skin hydrated. Avoid direct sun for 48h. Skip retinol and acids tonight.",
--     "concerns_protocol": "If redness or irritation persists beyond 24h, escalate to clinic immediately."
--   },
--   {
--     "treatment": "Botox",
--     "instructions": "No lying down for 4 hours. No rubbing the injection area. Avoid alcohol and strenuous exercise for 24h.",
--     "concerns_protocol": "If swelling, bruising, or drooping occurs, clinic must assess within 24h."
--   }
-- ]
