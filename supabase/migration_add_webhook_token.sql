-- Migration: Add webhook_token for per-clinic query parameter authentication
-- Each clinic gets a unique token embedded in their 360dialog webhook URL
-- URL format: /webhook/whatsapp?clinic_id=ABC123&token=xyz789

-- Add webhook_token column to clients table
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS webhook_token TEXT UNIQUE;

-- Add webhook_token column index for fast lookups
CREATE INDEX IF NOT EXISTS idx_clients_webhook_token ON clients(webhook_token);

-- Generate tokens for existing active clinics that don't have one
UPDATE clients 
SET webhook_token = encode(gen_random_bytes(24), 'hex')
WHERE webhook_token IS NULL AND status = 'active';

-- Set NOT NULL constraint after backfill
-- ALTER TABLE clients ALTER COLUMN webhook_token SET NOT NULL;
-- ^ Uncomment after verifying all rows have tokens

-- Add webhook_url virtual column helper (optional — can compute in app)
-- This is just documentation of the URL format
COMMENT ON COLUMN clients.webhook_token IS 
  'Unique per-clinic token for webhook authentication. Format in URL: ?clinic_id={id}&token={webhook_token}';
