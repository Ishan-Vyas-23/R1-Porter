-- Migration 005: Mark legacy text location columns as deprecated.
-- The columns remain in place for backwards-compatible requests/responses.

COMMENT ON COLUMN wheelchair_requests.pickup_location IS 'Deprecated: use pickup_address plus pickup_lat/pickup_lng instead';
COMMENT ON COLUMN wheelchair_requests.destination_location IS 'Deprecated: use drop_address plus drop_lat/drop_lng instead';
