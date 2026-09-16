-- Moon Hands — Billing & Subscription Tracking (2026-09-09)
-- Run once in Supabase SQL Editor. Safe to re-run (idempotent).

-- 1. Add billing fields to clients table
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_day INTEGER DEFAULT 1,       -- day of month payment is due (1-31)
  ADD COLUMN IF NOT EXISTS last_paid_date DATE,                -- most recent payment received
  ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'active', -- active | grace_period | overdue | suspended
  ADD COLUMN IF NOT EXISTS monthly_amount INTEGER DEFAULT 347;  -- SGD amount charged (347 = Basic, 547 = Premium)

-- 2. Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,          -- SGD
  currency TEXT NOT NULL DEFAULT 'SGD',
  method TEXT NOT NULL,                   -- bank_transfer | paynow | stripe | cash | other
  reference TEXT,                         -- transaction reference / receipt number
  status TEXT NOT NULL DEFAULT 'completed', -- pending | completed | failed | refunded
  billing_period TEXT NOT NULL,           -- YYYY-MM this payment covers
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_period ON payments(billing_period);
CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(created_at);

-- 3. Seed existing clients (set billing_day = 1st of month, monthly_amount based on plan)
-- Use last_paid_date IS NULL as the condition because billing_day has DEFAULT 1
-- and would already be filled, causing the UPDATE to match zero rows.
UPDATE clients
  SET billing_day = 1,
      monthly_amount = CASE WHEN LOWER(TRIM(plan)) = 'premium' THEN 547 ELSE 347 END,
      last_paid_date = CURRENT_DATE,
      payment_status = 'active'
  WHERE last_paid_date IS NULL;

-- 4. Backfill monthly_usage table (aggregated from daily_usage for current month)
-- This ensures the new cost/profit columns are populated
INSERT INTO monthly_usage (month, client_id, voice_minutes, whatsapp_messages, cost, bookings, revenue)
SELECT
  TO_CHAR(date, 'YYYY-MM') AS month,
  client_id,
  SUM(voice_minutes) AS voice_minutes,
  SUM(whatsapp_messages) AS whatsapp_messages,
  SUM(cost) AS cost,
  SUM(bookings) AS bookings,
  0 AS revenue
FROM daily_usage
WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY TO_CHAR(date, 'YYYY-MM'), client_id
ON CONFLICT (month, client_id) DO UPDATE SET
  whatsapp_messages = EXCLUDED.whatsapp_messages,
  cost = EXCLUDED.cost,
  bookings = EXCLUDED.bookings;

-- Verify:
-- SELECT slug, name, plan, billing_day, last_paid_date, payment_status, monthly_amount FROM clients;
