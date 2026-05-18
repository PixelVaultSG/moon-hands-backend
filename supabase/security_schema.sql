-- Pixel Vault - Security Monitoring Schema
-- Run this in Supabase SQL Editor AFTER schema.sql

-- ─── SECURITY EVENTS TABLE ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL, -- critical, high, medium, low, info
  category TEXT NOT NULL, -- auth, api_abuse, credential_exposure, data_exfil, cost_anomaly, injection, rate_limit
  service TEXT, -- vapi, twilio, supabase, telegram, instagram
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  details JSONB DEFAULT '{}',
  source_ip TEXT,
  user_agent TEXT,
  triggered_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,
  auto_mitigated BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_security_severity ON security_events(severity, triggered_at);
CREATE INDEX IF NOT EXISTS idx_security_category ON security_events(category, triggered_at);
CREATE INDEX IF NOT EXISTS idx_security_client ON security_events(client_id);
CREATE INDEX IF NOT EXISTS idx_security_unresolved ON security_events(resolved_at) WHERE resolved_at IS NULL;

-- ─── API ACCESS LOG TABLE ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  endpoint TEXT,
  method TEXT,
  source_ip TEXT,
  api_key_prefix TEXT, -- Last 4 chars only for identification
  request_size INT,
  response_status INT,
  latency_ms INT,
  user_agent TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_access_service ON api_access_log(service, timestamp);
CREATE INDEX IF NOT EXISTS idx_api_access_ip ON api_access_log(source_ip, timestamp);

-- ─── COST ANOMALY BASELINE TABLE ─────────────────────────────────

CREATE TABLE IF NOT EXISTS cost_baselines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  service TEXT NOT NULL, -- voice, whatsapp, total
  avg_daily_cost DECIMAL(10,4) DEFAULT 0,
  max_daily_cost DECIMAL(10,4) DEFAULT 0,
  avg_hourly_cost DECIMAL(10,4) DEFAULT 0,
  std_deviation DECIMAL(10,4) DEFAULT 0,
  last_calculated_at TIMESTAMPTZ DEFAULT NOW(),
  sample_size INT DEFAULT 0,
  UNIQUE(client_id, service)
);

-- ─── FAILED AUTH ATTEMPTS TABLE ──────────────────────────────────

CREATE TABLE IF NOT EXISTS failed_auth_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service TEXT NOT NULL,
  identifier TEXT, -- email, phone, ip
  attempt_type TEXT, -- login, api_key, webhook
  source_ip TEXT,
  user_agent TEXT,
  failure_reason TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_failed_auth_service ON failed_auth_attempts(service, timestamp);
CREATE INDEX IF NOT EXISTS idx_failed_auth_identifier ON failed_auth_attempts(identifier, timestamp);
CREATE INDEX IF NOT EXISTS idx_failed_auth_ip ON failed_auth_attempts(source_ip, timestamp);

-- ─── SECURITY MONITORING VIEWS ───────────────────────────────────

-- Active threats (unresolved critical/high)
CREATE OR REPLACE VIEW active_threats AS
SELECT 
  se.*,
  c.name as client_name,
  c.slug as client_slug
FROM security_events se
LEFT JOIN clients c ON se.client_id = c.id
WHERE se.resolved_at IS NULL 
  AND se.severity IN ('critical', 'high')
ORDER BY se.triggered_at DESC;

-- Hourly failed auth summary
CREATE OR REPLACE VIEW hourly_failed_auth AS
SELECT 
  date_trunc('hour', timestamp) as hour,
  service,
  identifier,
  source_ip,
  count(*) as attempt_count
FROM failed_auth_attempts
WHERE timestamp > NOW() - INTERVAL '24 hours'
GROUP BY 1, 2, 3, 4
HAVING count(*) >= 3
ORDER BY attempt_count DESC;

-- Cost anomaly detection view
CREATE OR REPLACE VIEW cost_anomalies AS
SELECT 
  du.client_id,
  c.name as client_name,
  du.date,
  du.cost as actual_cost,
  cb.avg_daily_cost,
  cb.max_daily_cost,
  cb.std_deviation,
  CASE 
    WHEN du.cost > cb.max_daily_cost * 1.5 THEN 'critical'
    WHEN du.cost > cb.avg_daily_cost + (3 * cb.std_deviation) THEN 'high'
    WHEN du.cost > cb.avg_daily_cost + (2 * cb.std_deviation) THEN 'medium'
    ELSE 'normal'
  END as anomaly_level
FROM daily_usage du
LEFT JOIN cost_baselines cb ON du.client_id = cb.client_id AND cb.service = 'total'
LEFT JOIN clients c ON du.client_id = c.id
WHERE du.date > CURRENT_DATE - 7
  AND cb.avg_daily_cost > 0;

-- ─── SECURITY DASHBOARD VIEW ─────────────────────────────────────

CREATE OR REPLACE VIEW security_dashboard AS
SELECT 
  (SELECT count(*) FROM security_events WHERE resolved_at IS NULL AND severity = 'critical') as unresolved_critical,
  (SELECT count(*) FROM security_events WHERE resolved_at IS NULL AND severity = 'high') as unresolved_high,
  (SELECT count(*) FROM security_events WHERE triggered_at > NOW() - INTERVAL '24 hours') as events_24h,
  (SELECT count(*) FROM failed_auth_attempts WHERE timestamp > NOW() - INTERVAL '1 hour') as failed_auth_1h,
  (SELECT count(*) FROM failed_auth_attempts WHERE timestamp > NOW() - INTERVAL '24 hours' GROUP BY source_ip HAVING count(*) > 10 LIMIT 1) as brute_force_ips,
  (SELECT count(*) FROM active_threats) as active_threats_count;

-- ─── AUTO-MITIGATION FUNCTION ────────────────────────────────────

CREATE OR REPLACE FUNCTION auto_mitigate_security_event()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-mitigate based on category
  CASE NEW.category
    WHEN 'rate_limit' THEN
      -- Log and flag for review
      NEW.auto_mitigated := true;
      NEW.resolution_notes := 'Auto: Rate limit enforced, flagged for review';
      NEW.resolved_at := NOW();
      
    WHEN 'cost_anomaly' THEN
      -- If critical cost spike, auto-pause if 3x normal
      IF NEW.severity = 'critical' AND NEW.details->>'anomaly_multiplier' IS NOT NULL 
         AND (NEW.details->>'anomaly_multiplier')::float > 3 THEN
        -- Would trigger pause here (need careful implementation)
        NEW.auto_mitigated := true;
        NEW.resolution_notes := 'Auto: Flagged for immediate review - potential abuse';
      END IF;
      
    WHEN 'credential_exposure' THEN
      -- Never auto-mitigate - always require human
      NEW.auto_mitigated := false;
      
    WHEN 'injection' THEN
      -- Log pattern, block if repeat offender
      NEW.auto_mitigated := true;
      NEW.resolution_notes := 'Auto: Pattern logged, source flagged';
      
    ELSE
      NEW.auto_mitigated := false;
  END CASE;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger
DROP TRIGGER IF EXISTS security_auto_mitigate ON security_events;
CREATE TRIGGER security_auto_mitigate
  BEFORE INSERT ON security_events
  FOR EACH ROW
  EXECUTE FUNCTION auto_mitigate_security_event();

-- ─── SEED: Cost baseline for demo client ─────────────────────────

INSERT INTO cost_baselines (client_id, service, avg_daily_cost, max_daily_cost, std_deviation, sample_size)
SELECT id, 'total', 5.00, 15.00, 2.50, 30
FROM clients WHERE slug = 'demo-clinic'
ON CONFLICT DO NOTHING;

INSERT INTO cost_baselines (client_id, service, avg_daily_cost, max_daily_cost, std_deviation, sample_size)
SELECT id, 'voice', 2.00, 8.00, 1.50, 30
FROM clients WHERE slug = 'demo-clinic'
ON CONFLICT DO NOTHING;

INSERT INTO cost_baselines (client_id, service, avg_daily_cost, max_daily_cost, std_deviation, sample_size)
SELECT id, 'whatsapp', 1.00, 5.00, 1.00, 30
FROM clients WHERE slug = 'demo-clinic'
ON CONFLICT DO NOTHING;
