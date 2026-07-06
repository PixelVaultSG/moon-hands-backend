-- Security Events Table — Audit trail
-- BULLETPROOF: Handles partial previous runs gracefully

-- Step 1: Drop if exists (in case previous partial run created bad table)
DROP TABLE IF EXISTS security_events;

-- Step 2: Create fresh
CREATE TABLE security_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL DEFAULT 'system_alert',
  actor text NOT NULL DEFAULT 'unknown',
  target text NOT NULL DEFAULT 'unknown',
  details text,
  severity text NOT NULL DEFAULT 'low',
  created_at timestamptz DEFAULT now()
);

-- Step 3: Create indexes
CREATE INDEX idx_security_events_target ON security_events(target);
CREATE INDEX idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX idx_security_events_type ON security_events(event_type);
