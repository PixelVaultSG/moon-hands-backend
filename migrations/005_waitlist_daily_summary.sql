-- Migration 005: Waitlist Re-engagement + Daily Booking Summary
-- Run this in Supabase SQL Editor after deploying the new jobs.

-- 1. Add fields to waitlist table for re-engagement tracking
ALTER TABLE waitlist 
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notified_slot_date DATE,
  ADD COLUMN IF NOT EXISTS notified_slot_time VARCHAR(10),
  ADD COLUMN IF NOT EXISTS notified_service VARCHAR(100);

-- Index for fast waitlist queries
CREATE INDEX IF NOT EXISTS idx_waitlist_active_notify 
  ON waitlist(client_id, status, preferred_date) 
  WHERE status = 'active';

-- 2. Add fields to appointments table for attendance tracking
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS attendance_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_marked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attendance_marked_by VARCHAR(50);

-- Index for finding un-checked appointments
CREATE INDEX IF NOT EXISTS idx_appointments_attendance_check 
  ON appointments(client_id, appointment_date, status, attendance_checked_at)
  WHERE status IN ('confirmed', 'pending');

COMMENT ON TABLE waitlist IS 'Patient waitlist entries with re-engagement tracking';
