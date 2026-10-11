-- Migration 008: Fix missing columns in onboarding_submissions
-- Run this in Supabase SQL Editor to fix form submission errors

-- Add missing column that backend tries to insert
ALTER TABLE onboarding_submissions
  ADD COLUMN IF NOT EXISTS booking_require_phone BOOLEAN DEFAULT true;

-- Verify columns exist
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'onboarding_submissions' 
AND column_name LIKE 'booking_%';
