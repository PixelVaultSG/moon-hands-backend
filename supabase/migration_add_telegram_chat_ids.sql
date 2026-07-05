-- Add telegram_chat_ids column to clients table
-- This is REQUIRED for the multi-clinic Telegram sender to work.
-- 
-- Run this in Supabase SQL Editor before deploying the multi-clinic update.

-- Add the column as an array of integers (Telegram chat IDs are 64-bit integers)
ALTER TABLE clients 
  ADD COLUMN IF NOT EXISTS telegram_chat_ids INTEGER[] DEFAULT '{}';

-- Index for fast lookups of clinics by chat ID
CREATE INDEX IF NOT EXISTS idx_clients_telegram_chat_ids 
  ON clients USING GIN (telegram_chat_ids);

COMMENT ON COLUMN clients.telegram_chat_ids IS 
  'Array of Telegram chat IDs linked to this clinic. Staff receive notifications here.';
