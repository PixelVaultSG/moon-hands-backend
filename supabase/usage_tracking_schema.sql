-- ============================================================
-- Moon Hands Usage Tracking Schema
-- Every message and every AI call is logged here.
-- This is the SINGLE SOURCE OF TRUTH for billing and reports.
-- ============================================================

-- ─── 1. MESSAGE LOGS ─────────────────────────────────────────
-- Every patient message received and every reply sent

CREATE TABLE IF NOT EXISTS message_logs (
  id              BIGSERIAL PRIMARY KEY,
  client_id       TEXT NOT NULL,              -- clinic identifier
  patient_phone   TEXT NOT NULL,              -- patient WhatsApp number (hashed)
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type    TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'template')),
  content_preview TEXT,                       -- First 100 chars (for reporting, not full content)
  response_source TEXT NOT NULL DEFAULT 'unknown' CHECK (response_source IN ('ai', 'hardcoded', 'error', 'rate_limited')),
  -- response_source: how the outbound message was generated
  --   'ai' = OpenAI was called
  --   'hardcoded' = Pattern match, no AI cost
  --   'error' = Something went wrong
  --   'rate_limited' = Client exceeded budget, hardcoded fallback
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
);

-- ─── 2. AI USAGE LOGS ────────────────────────────────────────
-- Every OpenAI API call with ACTUAL token counts and cost

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id                BIGSERIAL PRIMARY KEY,
  client_id         TEXT NOT NULL,
  message_log_id    BIGINT REFERENCES message_logs(id),
  model             TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  
  -- ACTUAL token counts from OpenAI response
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  
  -- ACTUAL cost in USD (calculated from token counts)
  -- GPT-4o-mini: $0.15/million input, $0.60/million output
  cost_usd          DECIMAL(10, 6) NOT NULL DEFAULT 0,
  
  -- Response time for performance tracking
  response_time_ms  INTEGER,
  
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
);

-- ─── 3. DAILY USAGE SUMMARY ──────────────────────────────────
-- Pre-aggregated per-client per-day (populated by midnight cron)
-- This table makes reports fast — no need to sum millions of rows

CREATE TABLE IF NOT EXISTS daily_usage_summary (
  id                  BIGSERIAL PRIMARY KEY,
  client_id           TEXT NOT NULL,
  date                DATE NOT NULL,
  
  -- Message counts
  total_messages      INTEGER NOT NULL DEFAULT 0,
  inbound_messages    INTEGER NOT NULL DEFAULT 0,
  outbound_messages   INTEGER NOT NULL DEFAULT 0,
  
  -- AI breakdown
  ai_responses        INTEGER NOT NULL DEFAULT 0,     -- Messages that used AI
  hardcoded_responses INTEGER NOT NULL DEFAULT 0,     -- Messages that didn't use AI
  rate_limited        INTEGER NOT NULL DEFAULT 0,      -- Messages sent under rate limit
  
  -- Actual costs (from ai_usage_logs)
  openai_input_tokens  INTEGER NOT NULL DEFAULT 0,
  openai_output_tokens INTEGER NOT NULL DEFAULT 0,
  openai_total_cost    DECIMAL(10, 6) NOT NULL DEFAULT 0,
  
  -- Business metrics
  daily_revenue        DECIMAL(10, 2) NOT NULL DEFAULT 0,  -- plan_price / 30
  daily_profit         DECIMAL(10, 2) NOT NULL DEFAULT 0,  -- revenue - openai cost
  
  -- Rollover tracking
  base_limit           INTEGER NOT NULL DEFAULT 17,
  rollover_from_prev   INTEGER NOT NULL DEFAULT 0,
  available_today      INTEGER NOT NULL DEFAULT 17,
  used_today           INTEGER NOT NULL DEFAULT 0,
  unused_today         INTEGER NOT NULL DEFAULT 0,
  new_rollover         INTEGER NOT NULL DEFAULT 0,
  
  UNIQUE(client_id, date),
);

-- ─── 4. RATE LIMIT EVENTS ────────────────────────────────────
-- Every time a rate limit triggers (for audit trail)

CREATE TABLE IF NOT EXISTS rate_limit_events (
  id          BIGSERIAL PRIMARY KEY,
  client_id   TEXT NOT NULL,
  patient_phone TEXT NOT NULL,
  limit_type  TEXT NOT NULL CHECK (limit_type IN ('repeat', 'flood', 'budget')),
  trigger_count INTEGER NOT NULL DEFAULT 1,
  action_taken  TEXT NOT NULL DEFAULT 'throttled' CHECK (action_taken IN ('throttled', 'blocked', 'alerted')),
  graceful_response_sent TEXT,  -- What we told the patient
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 5. VIEW: REAL-TIME CLIENT DASHBOARD ─────────────────────
-- Fast query for the admin dashboard

CREATE OR REPLACE VIEW client_usage_realtime AS
SELECT 
  ml.client_id,
  DATE(ml.created_at) as date,
  COUNT(*) FILTER (WHERE ml.direction = 'inbound') as inbound_today,
  COUNT(*) FILTER (WHERE ml.direction = 'outbound') as outbound_today,
  COUNT(*) FILTER (WHERE ml.response_source = 'ai') as ai_replies_today,
  COUNT(*) FILTER (WHERE ml.response_source = 'hardcoded') as hardcoded_today,
  COALESCE(SUM(aul.cost_usd), 0) as openai_cost_today,
  AVG(aul.response_time_ms) FILTER (WHERE aul.response_time_ms IS NOT NULL) as avg_response_time_ms
FROM message_logs ml
LEFT JOIN ai_usage_logs aul ON ml.id = aul.message_log_id
WHERE ml.created_at >= CURRENT_DATE
GROUP BY ml.client_id, DATE(ml.created_at);

-- ─── ENABLE ROW LEVEL SECURITY ────────────────────────────────
-- Only service_role can write. Admin can read all. No public access.

ALTER TABLE message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_usage_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limit_events ENABLE ROW LEVEL SECURITY;

-- ─── CREATE INDEXES (Supabase requires these as separate statements) ─

CREATE INDEX IF NOT EXISTS idx_message_logs_client_date ON message_logs (client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_logs_patient ON message_logs (patient_phone, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_client_date ON ai_usage_logs (client_id, created_at);
CREATE INDEX IF NOT EXISTS idx_daily_summary_date ON daily_usage_summary (date);
CREATE INDEX IF NOT EXISTS idx_rate_events_client ON rate_limit_events (client_id, created_at);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────

CREATE POLICY service_role_all ON message_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON ai_usage_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON daily_usage_summary FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all ON rate_limit_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ============================================================
-- HOW TO RUN THIS:
-- 1. Go to Supabase Dashboard → SQL Editor
-- 2. Paste this entire file
-- 3. Click Run
-- 4. Verify: Tables should appear in Table Editor
-- ============================================================
