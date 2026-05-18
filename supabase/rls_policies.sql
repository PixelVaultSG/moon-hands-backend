-- Pixel Vault - Row Level Security (RLS) Enforcement
-- THIS IS MANDATORY. Run this immediately after schema.sql and security_schema.sql
-- Prevents users from accessing other users' data. Critical for multi-tenant security.

-- ─── ENABLE RLS ON ALL TABLES ────────────────────────────────────

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_baselines ENABLE ROW LEVEL SECURITY;

-- ─── SERVICE ROLE BYPASS ─────────────────────────────────────────
-- Our backend uses service_role key which bypasses RLS
-- These policies only apply to anon/authenticated keys (future client portal)

-- ─── CLIENTS TABLE POLICIES ──────────────────────────────────────

-- Only admins can see all clients (via service_role)
-- Future: authenticated users can only see their own client record
CREATE POLICY clients_select_own ON clients
  FOR SELECT USING (
    -- Service role bypasses (no check needed)
    -- Authenticated user sees only their own clinic
    auth.uid() IN (SELECT id FROM clients WHERE contact_email = auth.email())
  );

CREATE POLICY clients_update_own ON clients
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM clients WHERE contact_email = auth.email())
  );

-- ─── CLIENT CONFIGS TABLE POLICIES ───────────────────────────────

CREATE POLICY client_configs_select_own ON client_configs
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM clients WHERE id = client_configs.client_id)
  );

CREATE POLICY client_configs_update_own ON client_configs
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM clients WHERE id = client_configs.client_id)
  );

-- ─── CONVERSATIONS TABLE POLICIES ────────────────────────────────

CREATE POLICY conversations_select_own ON conversations
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM clients WHERE id = conversations.client_id)
  );

CREATE POLICY conversations_insert_own ON conversations
  FOR INSERT WITH CHECK (
    auth.uid() IN (SELECT id FROM clients WHERE id = conversations.client_id)
  );

-- ─── APPOINTMENTS TABLE POLICIES ─────────────────────────────────

CREATE POLICY appointments_select_own ON appointments
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM clients WHERE id = appointments.client_id)
  );

CREATE POLICY appointments_update_own ON appointments
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM clients WHERE id = appointments.client_id)
  );

-- ─── USAGE TABLES POLICIES ──────────────────────────────────────

CREATE POLICY daily_usage_select_own ON daily_usage
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM clients WHERE id = daily_usage.client_id)
  );

CREATE POLICY monthly_usage_select_own ON monthly_usage
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM clients WHERE id = monthly_usage.client_id)
  );

-- ─── SECURITY TABLES - ADMIN ONLY ────────────────────────────────

-- Security events: no client access
CREATE POLICY security_events_admin_only ON security_events
  FOR ALL USING (false); -- Block all public access, service_role bypasses

-- API access log: no client access
CREATE POLICY api_access_log_admin_only ON api_access_log
  FOR ALL USING (false);

-- Failed auth: no client access
CREATE POLICY failed_auth_admin_only ON failed_auth_attempts
  FOR ALL USING (false);

-- Health checks: no client access
CREATE POLICY health_checks_admin_only ON health_checks
  FOR ALL USING (false);

-- ─── ENFORCEMENT FUNCTION ────────────────────────────────────────

-- Function to check if a client can access another client's data
CREATE OR REPLACE FUNCTION check_client_access(requested_client_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- Service role always passes (checked before this function)
  -- Authenticated users only see their own
  RETURN EXISTS (
    SELECT 1 FROM clients 
    WHERE id = requested_client_id 
    AND contact_email = auth.email()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── AUDIT LOGGING ──────────────────────────────────────────────

-- Table to log all access attempts (for compliance)
CREATE TABLE IF NOT EXISTS access_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  client_id UUID,
  table_name TEXT NOT NULL,
  action TEXT NOT NULL, -- SELECT, INSERT, UPDATE, DELETE
  row_id UUID,
  ip_address TEXT,
  user_agent TEXT,
  success BOOLEAN NOT NULL,
  reason TEXT,
  accessed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_access_audit_user ON access_audit_log(user_id, accessed_at);
CREATE INDEX IF NOT EXISTS idx_access_audit_client ON access_audit_log(client_id, accessed_at);

-- Trigger function to log access
CREATE OR REPLACE FUNCTION log_access_attempt()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO access_audit_log (user_id, client_id, table_name, action, row_id, success)
  VALUES (
    auth.uid(),
    NEW.client_id,
    TG_TABLE_NAME,
    TG_OP,
    NEW.id,
    true
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to conversations
DROP TRIGGER IF EXISTS audit_conversations ON conversations;
CREATE TRIGGER audit_conversations
  AFTER INSERT OR UPDATE ON conversations
  FOR EACH ROW
  EXECUTE FUNCTION log_access_attempt();
