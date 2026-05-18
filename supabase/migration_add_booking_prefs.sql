-- Migration: Add booking preference columns to client_configs
-- and reminder columns to appointments
-- Run this in Supabase SQL Editor

-- Add booking preference columns to client_configs
ALTER TABLE client_configs
  ADD COLUMN IF NOT EXISTS booking_auto_confirm BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_after_hours_action TEXT DEFAULT 'auto_confirm',
  ADD COLUMN IF NOT EXISTS booking_waitlist_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_max_advance_days INT DEFAULT 30,
  ADD COLUMN IF NOT EXISTS booking_min_notice_hours INT DEFAULT 2,
  ADD COLUMN IF NOT EXISTS booking_require_phone BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_allow_same_day BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_reminder_24h BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_reminder_1h BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_followup_48h BOOLEAN DEFAULT true;

-- Add reminder columns to appointments
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS reminder_24h_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_1h_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS followup_48h_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_notified BOOLEAN DEFAULT false;

-- Add status 'pending_approval' to appointments if not exists
-- (appointments.status should already handle this as TEXT)

-- Add google_refresh_token to clients for calendar access
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS google_refresh_token TEXT;

-- Create index for pending approvals
CREATE INDEX IF NOT EXISTS idx_appointments_pending_approval 
  ON appointments(client_id, status) 
  WHERE status = 'pending_approval';

-- Create index for reminders
CREATE INDEX IF NOT EXISTS idx_appointments_reminders
  ON appointments(appointment_date, status, reminder_24h_sent, reminder_1h_sent)
  WHERE status = 'confirmed';
