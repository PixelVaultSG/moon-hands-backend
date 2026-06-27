-- Migration 007: Key-Value Store for Runtime State Persistence
-- Enables rate limiter and cost protection counters to survive server restarts.
-- 
-- Tables created:
--   kv_store — generic key-value persistence for runtime state

-- ─── KV_STORE TABLE ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS kv_store (
  key TEXT PRIMARY KEY NOT NULL,
  data JSONB DEFAULT NULL,
  counters JSONB DEFAULT NULL,
  anomalies JSONB DEFAULT NULL,
  kill_switch JSONB DEFAULT NULL,
  ai_calls INT DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_kv_store_key ON kv_store(key);

-- RLS: Only service role can access (no external access needed)
ALTER TABLE kv_store ENABLE ROW LEVEL SECURITY;

-- No read/write policies — service role only (internal backend use only)

COMMENT ON TABLE kv_store IS 'Generic key-value store for persisting runtime state (rate limits, cost counters) across server restarts';
