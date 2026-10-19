-- ============================================================================
-- Migration 009: Chiro Expansion
-- Moon Hands by Pixel Vault Pte Ltd
-- Date: 2026-10-19
--
-- Additive only — no existing columns, tables, or data are modified or dropped.
-- Safe to run on production. Idempotent (IF NOT EXISTS / DROP IF EXISTS first).
--
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
-- Verify after: SELECT tobename checks at the bottom of this file.
-- ============================================================================

-- ─── 1. clients.industry — CHECK constraint ────────────────────────────────
-- Column already exists (DEFAULT 'aesthetic'). This adds the value guard.
-- NOT VALID first so existing rows are never scanned/locked, then validate.
ALTER TABLE clients
  DROP CONSTRAINT IF EXISTS clients_industry_check;
ALTER TABLE clients
  ADD CONSTRAINT clients_industry_check
  CHECK (industry IN ('aesthetic', 'chiropractic')) NOT VALID;
ALTER TABLE clients
  VALIDATE CONSTRAINT clients_industry_check;

-- ─── 2. onboarding_submissions.industry ────────────────────────────────────
ALTER TABLE onboarding_submissions
  ADD COLUMN IF NOT EXISTS industry TEXT NOT NULL DEFAULT 'aesthetic';
ALTER TABLE onboarding_submissions
  DROP CONSTRAINT IF EXISTS onboarding_submissions_industry_check;
ALTER TABLE onboarding_submissions
  ADD CONSTRAINT onboarding_submissions_industry_check
  CHECK (industry IN ('aesthetic', 'chiropractic')) NOT VALID;
ALTER TABLE onboarding_submissions
  VALIDATE CONSTRAINT onboarding_submissions_industry_check;

-- ─── 3. onboarding_submissions.approved_at / approved_by ───────────────────
-- telegram/commands/onboarding-approvals.js writes these on approval.
-- They never existed in the live DB, so approvals were silently failing
-- their status update. This fixes that drift.
ALTER TABLE onboarding_submissions
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE onboarding_submissions
  ADD COLUMN IF NOT EXISTS approved_by BIGINT;

-- ─── 4. client_configs.config JSONB ────────────────────────────────────────
-- bot-engine.js (loadClientConfig) and onboarding-approvals.js both read/
-- write this column. It never existed live — config inserts during clinic
-- approval were silently failing. Also the home of per-clinic feature flags
-- (config.features.*) per handoff doc Section 20.
ALTER TABLE client_configs
  ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ─── 5. callback_requests (Handoff Section 3.2.2) ──────────────────────────
-- Doctor callback workflow: patient asks medical question → Sophia refuses →
-- offers doctor callback → row created here → clinic notified via Telegram.
CREATE TABLE IF NOT EXISTS callback_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  patient_phone TEXT NOT NULL,
  patient_name TEXT,
  topic TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_callback_requests_client_status
  ON callback_requests(client_id, status);

-- ─── 6. patient_history (Handoff Section 3.2.3) ────────────────────────────
-- First-time vs returning patient lookup by phone, per clinic.
CREATE TABLE IF NOT EXISTS patient_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  patient_phone TEXT NOT NULL,
  patient_name TEXT,
  first_visit_date DATE,
  total_visits INTEGER DEFAULT 0,
  last_visit_date DATE,
  last_treatment TEXT,
  treatment_plan JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_patient_history_client_phone
  ON patient_history(client_id, patient_phone);

-- ─── 7. Row Level Security on the two new tables ───────────────────────────
-- Backend uses the service role key (bypasses RLS). Enabling RLS with no
-- public policies = anon/unauthenticated access is denied by default.
ALTER TABLE callback_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE patient_history ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- VERIFY (run after migration):
--   SELECT conname FROM pg_constraint WHERE conname LIKE '%industry%';
--     → clients_industry_check, onboarding_submissions_industry_check
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='client_configs' AND column_name='config';
--     → 1 row
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='onboarding_submissions'
--       AND column_name IN ('industry','approved_at','approved_by');
--     → 3 rows
--   SELECT table_name FROM information_schema.tables
--     WHERE table_name IN ('callback_requests','patient_history');
--     → 2 rows
-- ============================================================================
