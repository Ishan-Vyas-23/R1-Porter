-- Migration 006: Add Google Routes estimate fields to wheelchair requests
-- Route calculation is optional and must not block request creation.

ALTER TABLE wheelchair_requests
  ADD COLUMN IF NOT EXISTS route_distance_meters INTEGER NULL,
  ADD COLUMN IF NOT EXISTS route_duration_seconds INTEGER NULL,
  ADD COLUMN IF NOT EXISTS route_status VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUESTED'
    CHECK (route_status IN ('NOT_REQUESTED', 'SKIPPED_MISSING_COORDINATES', 'SUCCESS', 'FAILED')),
  ADD COLUMN IF NOT EXISTS route_calculated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS route_error TEXT NULL;

COMMENT ON COLUMN wheelchair_requests.route_distance_meters IS 'Google Routes distance between pickup and drop, in meters';
COMMENT ON COLUMN wheelchair_requests.route_duration_seconds IS 'Google Routes estimated duration between pickup and drop, in seconds';
COMMENT ON COLUMN wheelchair_requests.route_status IS 'Route estimate status: NOT_REQUESTED, SKIPPED_MISSING_COORDINATES, SUCCESS, or FAILED';
COMMENT ON COLUMN wheelchair_requests.route_calculated_at IS 'Timestamp when route estimate was successfully calculated';
COMMENT ON COLUMN wheelchair_requests.route_error IS 'Non-blocking route estimate error, if Google Routes failed';
