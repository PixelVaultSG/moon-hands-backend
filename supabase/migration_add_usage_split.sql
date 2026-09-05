-- Migration: split usage counter into hardcoded (free) vs AI (payable) replies
-- Run in Supabase SQL Editor. Safe to re-run.
-- Date: 2026-09-05

ALTER TABLE daily_usage ADD COLUMN IF NOT EXISTS hardcoded_messages INT DEFAULT 0;
ALTER TABLE daily_usage ADD COLUMN IF NOT EXISTS ai_messages INT DEFAULT 0;

COMMENT ON COLUMN daily_usage.hardcoded_messages IS 'Template/hardcoded replies — free, no OpenAI cost. Shown only to Moon Hands admin, never to clinics.';
COMMENT ON COLUMN daily_usage.ai_messages IS 'AI-powered replies (OpenAI etc.) — payable. Shown only to Moon Hands admin.';
