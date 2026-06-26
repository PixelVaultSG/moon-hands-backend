-- Migration 004: Weekly Optimization Reports Table
-- Required for the Premium tier "AI Learning Loop" feature
-- Run this in Supabase SQL Editor

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Weekly reports table: stores AI-generated optimization reports
CREATE TABLE IF NOT EXISTS weekly_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    period_from DATE NOT NULL,
    period_to DATE NOT NULL,
    insights JSONB DEFAULT '[]'::jsonb,
    suggestions JSONB DEFAULT '[]'::jsonb,
    weekly_stats JSONB DEFAULT '{}'::jsonb,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast retrieval of recent reports per clinic
CREATE INDEX IF NOT EXISTS idx_weekly_reports_client_period 
    ON weekly_reports(client_id, period_from DESC);

-- Index for admin dashboard queries
CREATE INDEX IF NOT EXISTS idx_weekly_reports_generated 
    ON weekly_reports(generated_at DESC);

-- RLS: Enable but only allow service role access (backend only)
ALTER TABLE weekly_reports ENABLE ROW LEVEL SECURITY;

-- No anon policies — only accessible via Service Role Key from backend
-- This matches the security model of other sensitive tables

COMMENT ON TABLE weekly_reports IS 'Stores weekly AI optimization loop reports for Premium tier clinics';
