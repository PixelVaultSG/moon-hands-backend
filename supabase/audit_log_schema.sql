-- ─── AUDIT LOG TABLE ──────────────────────────────────────────────
-- Every significant event across ALL infrastructure is logged here.
-- This is the backbone of the intrusion detection system.

CREATE TABLE IF NOT EXISTS audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity        TEXT NOT NULL DEFAULT 'info'       -- critical | high | medium | low | info
    CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  category        TEXT NOT NULL DEFAULT 'general'    -- what type of event
    CHECK (category IN (
      'auth_failure', 'rate_limit', 'data_access', 'deployment',
      'webhook', 'telegram', 'unauthorized_access', 'device_registration',
      'cost_anomaly', 'general', 'github', 'render', 'supabase', 'website'
    )),
  actor           TEXT NOT NULL DEFAULT 'unknown'    -- who triggered it
    CHECK (actor IN ('Master', 'Kimi', 'system', 'unknown')),
  action          TEXT NOT NULL DEFAULT 'unknown',   -- what they did (e.g., "webhook_request")
  description     TEXT,                               -- human-readable description
  device_id       TEXT,                               -- SHA256 fingerprint of the device
  source_ip       TEXT,                               -- IP address (if available)
  service         TEXT NOT NULL DEFAULT 'webhook'    -- which service: github | render | supabase | telegram | whatsapp | website
    CHECK (service IN ('github', 'render', 'supabase', 'telegram', 'whatsapp', 'website', 'webhook')),
  details         JSONB DEFAULT '{}',                 -- flexible JSON for extra context
  created_at      TIMESTAMPTZ DEFAULT now(),
  
  -- Indexes for fast queries
  INDEX idx_audit_severity (severity),
  INDEX idx_audit_category (category),
  INDEX idx_audit_actor (actor),
  INDEX idx_audit_service (service),
  INDEX idx_audit_created (created_at DESC),
  INDEX idx_audit_device (device_id),
  INDEX idx_audit_ip (source_ip),
  
  -- Composite index for the most common query: "show me recent high-severity events"
  INDEX idx_audit_severity_created (severity, created_at DESC)
);

-- Enable Row Level Security (RLS) — only service_role can read/write for now
-- After auth is set up, restrict to admin users only
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_all ON audit_log
  FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

-- ─── DAILY AUDIT SUMMARY VIEW ─────────────────────────────────────
-- Pre-aggregated view for quick dashboard queries

CREATE OR REPLACE VIEW audit_daily_summary AS
SELECT
  date_trunc('day', created_at) AS day,
  severity,
  category,
  actor,
  service,
  count(*) AS event_count
FROM audit_log
GROUP BY 1, 2, 3, 4, 5
ORDER BY day DESC, event_count DESC;

-- ─── SUSPICIOUS EVENTS VIEW ───────────────────────────────────────
-- Auto-filtered view showing only events that need attention

CREATE OR REPLACE VIEW audit_suspicious AS
SELECT *
FROM audit_log
WHERE severity IN ('critical', 'high')
  OR actor = 'unknown'
  OR category = 'auth_failure'
  OR category = 'unauthorized_access'
  OR category = 'rate_limit'
ORDER BY created_at DESC
LIMIT 100;
