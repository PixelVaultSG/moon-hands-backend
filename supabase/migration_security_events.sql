-- Security Events Table — Audit trail for admin actions, auth events, invite usage
-- Run this in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS security_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL CHECK (event_type IN (
    'auth_failure', 'unauthorized', 'config_change', 
    'invite_created', 'invite_redeemed', 'invite_revoked',
    'staff_takeover', 'patient_booking', 'approval_action', 'system_alert'
  )),
  actor text NOT NULL DEFAULT 'unknown',
  target text NOT NULL DEFAULT 'unknown',
  details text,
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  created_at timestamptz DEFAULT now(),
  ip_address text
);

-- Index for fast queries by clinic and date range
CREATE INDEX IF NOT EXISTS idx_security_events_target ON security_events(target);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_type ON security_events(event_type);

-- RLS: Only admin can read all events; clinics can only see their own
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access" ON security_events
  FOR ALL USING (current_user = 'admin' OR auth.role() = 'service_role');

-- Grant access to service role (backend API)
GRANT ALL ON security_events TO service_role;

COMMENT ON TABLE security_events IS 'Audit trail for security-relevant events across all clinics';
