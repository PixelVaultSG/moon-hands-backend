-- Moon Hands — Normalize legacy plan names (2026-09-05)
-- Legacy vocab found in the DB: 'professional', 'starter'
-- Canonical vocab: 'basic' ($347/mo), 'premium' ($547/mo)
-- Run once in Supabase SQL Editor. Safe to re-run (idempotent).

UPDATE clients SET plan = 'premium' WHERE plan IN ('professional', 'pro', 'Premium');
UPDATE clients SET plan = 'basic'   WHERE plan IN ('starter', 'Basic', 'standard', 'free');

-- Guard rail: any future unknown value falls back to basic
ALTER TABLE clients ALTER COLUMN plan SET DEFAULT 'basic';

-- Verify:
-- SELECT slug, name, plan FROM clients;
