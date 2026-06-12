-- Migration 001: Create wheelchair_requests table
-- Run this before migration 002

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS wheelchair_requests (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id           UUID        NOT NULL,
  passenger_name         VARCHAR(100),
  passenger_phone        VARCHAR(20),
  station_code           VARCHAR(20),
  platform_number        VARCHAR(10),
  pickup_location        VARCHAR(255),
  destination_location   VARCHAR(255),
  accessibility_notes    TEXT,
  status                 VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                           CHECK (status IN ('PENDING','ACCEPTED','IN_PROGRESS','COMPLETED','CANCELLED')),
  assigned_attendant_id  UUID,
  assigned_attendant_name VARCHAR(100),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at           TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ
);

-- Index for passenger's own requests (my-requests endpoint)
CREATE INDEX IF NOT EXISTS idx_wheelchair_requests_passenger_id
  ON wheelchair_requests (passenger_id);

-- Index for attendant polling open requests
CREATE INDEX IF NOT EXISTS idx_wheelchair_requests_status
  ON wheelchair_requests (status);

-- Index for attendant's assigned requests
CREATE INDEX IF NOT EXISTS idx_wheelchair_requests_attendant_id
  ON wheelchair_requests (assigned_attendant_id);

-- Auto-update updated_at on every row change
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_wheelchair_requests_updated_at ON wheelchair_requests;

CREATE TRIGGER set_wheelchair_requests_updated_at
  BEFORE UPDATE ON wheelchair_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
