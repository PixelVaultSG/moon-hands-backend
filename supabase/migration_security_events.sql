-- Security Events Table — Audit trail for admin actions, auth events, invite usage
-- Run this in Supabase SQL Editor

-- Step 1: Create the table first
CREATE TABLE IF NOT EXISTS security_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  actor text NOT NULL DEFAULT 'unknown',
  target text NOT NULL DEFAULT 'unknown',
  details text,
  severity text NOT NULL DEFAULT 'low',
  created_at timestamptz DEFAULT now()
);

-- Step 2: Create indexes (separate statement)
CREATE INDEX IF NOT EXISTS idx_security_events_target ON security_events(target);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);

-- Step 3: Add constraint on severity (if not already exists)
DO $$ 
BEGIN
  ALTER TABLE security_events 
    ADD CONSTRAINT security_events_severity_check 
    CHECK (severity IN ('low', 'medium', 'high', 'critical'));
EXCEPTION 
  WHEN duplicate_object THEN NULL;
END $$;

-- Step 4: Add constraint on event_type (if not already exists)
DO $$ 
BEGIN
  ALTER TABLE security_events 
    ADD CONSTRAINT security_events_type_check 
    CHECK (event_type IN (
      'auth_failure', 'unauthorized', 'config_change', 
      'invite_created', 'invite_redeemed', 'invite_revoked',
      'staff_takeover', 'patient_booking', 'approval_action', 'system_alert'
    ));
EXCEPTION 
  WHEN duplicate_object THEN NULL;
END $$;
