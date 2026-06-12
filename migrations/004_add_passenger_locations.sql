-- Migration 004: Add passenger pickup/drop map-ready location fields
-- Keeps existing text locations intact while adding structured coordinates.

ALTER TABLE wheelchair_requests
  ADD COLUMN IF NOT EXISTS pickup_mode VARCHAR(20) NOT NULL DEFAULT 'MANUAL'
    CHECK (pickup_mode IN ('CURRENT_LOCATION', 'MANUAL')),

  ADD COLUMN IF NOT EXISTS pickup_address VARCHAR(500),
  ADD COLUMN IF NOT EXISTS pickup_lat NUMERIC(10, 7)
    CHECK (pickup_lat IS NULL OR (pickup_lat >= -90 AND pickup_lat <= 90)),
  ADD COLUMN IF NOT EXISTS pickup_lng NUMERIC(10, 7)
    CHECK (pickup_lng IS NULL OR (pickup_lng >= -180 AND pickup_lng <= 180)),

  ADD COLUMN IF NOT EXISTS drop_address VARCHAR(500),
  ADD COLUMN IF NOT EXISTS drop_lat NUMERIC(10, 7)
    CHECK (drop_lat IS NULL OR (drop_lat >= -90 AND drop_lat <= 90)),
  ADD COLUMN IF NOT EXISTS drop_lng NUMERIC(10, 7)
    CHECK (drop_lng IS NULL OR (drop_lng >= -180 AND drop_lng <= 180));

COMMENT ON COLUMN wheelchair_requests.pickup_mode IS 'Pickup source: CURRENT_LOCATION from device or MANUAL entered address';
COMMENT ON COLUMN wheelchair_requests.pickup_address IS 'Human-readable pickup address, ready for future geocoding';
COMMENT ON COLUMN wheelchair_requests.pickup_lat IS 'Pickup latitude, ready for future directions lookup';
COMMENT ON COLUMN wheelchair_requests.pickup_lng IS 'Pickup longitude, ready for future directions lookup';
COMMENT ON COLUMN wheelchair_requests.drop_address IS 'Human-readable drop address, ready for future geocoding';
COMMENT ON COLUMN wheelchair_requests.drop_lat IS 'Drop latitude, ready for future directions lookup';
COMMENT ON COLUMN wheelchair_requests.drop_lng IS 'Drop longitude, ready for future directions lookup';
