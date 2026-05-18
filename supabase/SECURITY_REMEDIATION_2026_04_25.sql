-- ═══════════════════════════════════════════════════════════════════
-- Moon Hands — CRITICAL SECURITY REMEDIATION
-- Run IMMEDIATELY in Supabase SQL Editor to fix vulnerabilities
-- ═══════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════
-- 1. DROP DANGEROUS RLS POLICIES (CRITICAL)
--    "USING (true)" policies allow ANY authenticated key to read
--    ALL patient waitlist data and ALL clinic onboarding data.
-- ═══════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Service role full access" ON waitlist;
DROP POLICY IF EXISTS "Service role full access" ON onboarding_submissions;

-- Verify: these tables should now have ZERO policies
-- RLS is still ENABLED — only service_role key can access (backend)
-- Anon/authenticated keys are BLOCKED completely

-- ═══════════════════════════════════════════════════════════════════
-- 2. FIX waitlist ON DELETE CASCADE → SET NULL (CRITICAL)
--    CASCADE permanently destroys patient waitlist records when a
--    clinic is deleted. Patient data must NEVER be silently deleted.
--    Note: If waitlist has rows, we must handle carefully.
-- ═══════════════════════════════════════════════════════════════════

-- First, set any orphaned rows to NULL (safety)
UPDATE waitlist
SET client_id = NULL
WHERE client_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM clients WHERE clients.id = waitlist.client_id);

-- Drop existing FK constraint and recreate with SET NULL
ALTER TABLE waitlist
DROP CONSTRAINT IF EXISTS waitlist_client_id_fkey;

ALTER TABLE waitlist
ADD CONSTRAINT waitlist_client_id_fkey
FOREIGN KEY (client_id) REFERENCES clients(id)
ON DELETE SET NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 3. VERIFY RLS STATE (run this to confirm security posture)
-- ═══════════════════════════════════════════════════════════════════

SELECT
  c.relname AS tablename,
  c.relrowsecurity AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'clients', 'client_configs', 'appointments', 'conversations',
    'daily_usage', 'monthly_usage', 'waitlist', 'onboarding_submissions',
    'health_checks', 'security_events', 'api_access_log',
    'failed_auth_attempts', 'cost_baselines', 'pending_changes'
  )
ORDER BY c.relname;

-- Expected output:
--   All 14 tables: rls_enabled = true
--   waitlist: policy_count = 0
--   onboarding_submissions: policy_count = 0
--   Other tables: policy_count should match rls_policies.sql (e.g., 1-2 each)

-- ═══════════════════════════════════════════════════════════════════
-- 4. VERIFY NO PERMISSIVE POLICIES WITH "USING (true)" (CRITICAL)
-- ═══════════════════════════════════════════════════════════════════

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE qual::text LIKE '%true%' OR with_check::text LIKE '%true%'
ORDER BY tablename;

-- Expected: ZERO rows returned.
-- If any rows appear, those policies allow open access — drop them.

-- ═══════════════════════════════════════════════════════════════════
-- 5. VERIFY FOREIGN KEY DELETE RULES (DATA PROTECTION)
-- ═══════════════════════════════════════════════════════════════════

SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints rc ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN ('waitlist', 'onboarding_submissions', 'appointments', 'conversations', 'client_configs', 'daily_usage', 'monthly_usage')
ORDER BY tc.table_name;

-- Verify waitlist.delete_rule = 'SET NULL' (NOT CASCADE)
-- Verify onboarding_submissions.delete_rule = 'SET NULL'
-- All other patient-data tables should also be SET NULL or RESTRICT (never CASCADE)

-- ═══════════════════════════════════════════════════════════════════
-- 6. ADD ADMIN-ONLY POLICIES FOR waitlist AND onboarding_submissions
--    (Optional — only if you ever need authenticated client portal)
--    For now: NO policies = safest. Service_role only.
-- ═══════════════════════════════════════════════════════════════════

-- If you ever add a client portal, use policies like this:
-- CREATE POLICY waitlist_own_clinic ON waitlist
--   FOR ALL USING (auth.uid() IN (SELECT id FROM clients WHERE id = waitlist.client_id));

-- For now: leave ZERO policies. Backend uses service_role key.

-- ═══════════════════════════════════════════════════════════════════
-- 7. VERIFY COLUMN INTEGRITY (Confirm migration applied correctly)
-- ═══════════════════════════════════════════════════════════════════

-- Check client_configs has all 10 booking preference columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'client_configs'
  AND column_name LIKE 'booking_%'
ORDER BY column_name;

-- Expected: 10 rows (auto_confirm, after_hours_action, waitlist_enabled,
--   max_advance_days, min_notice_hours, require_phone, allow_same_day,
--   reminder_24h, reminder_1h, followup_48h)

-- Check appointments has reminder columns
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'appointments'
  AND column_name IN ('reminder_24h_sent', 'reminder_1h_sent', 'followup_48h_sent', 'approval_notified')
ORDER BY column_name;

-- Expected: 4 rows

-- Check clients has google_refresh_token
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clients' AND column_name = 'google_refresh_token';

-- Expected: 1 row

-- ═══════════════════════════════════════════════════════════════════
-- 8. AUDIT LOG TABLE (if not exists — tracks all access attempts)
-- ═══════════════════════════════════════════════════════════════════

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
CREATE INDEX IF NOT EXISTS idx_access_audit_table ON access_audit_log(table_name, accessed_at);

ALTER TABLE access_audit_log ENABLE ROW LEVEL SECURITY;
-- No policies = service_role only

-- ═══════════════════════════════════════════════════════════════════
-- ✅ REMEDIATION COMPLETE
-- After running this SQL, verify the SELECT queries above show:
--   • waitlist.policy_count = 0
--   • onboarding_submissions.policy_count = 0
--   • waitlist.delete_rule = SET NULL
--   • No policies with qual = true
-- ═══════════════════════════════════════════════════════════════════
