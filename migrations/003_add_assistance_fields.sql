-- Migration 003: Evolve wheelchair_requests into passenger_assistance_requests
-- Adds service type, luggage info, cost estimation, and coolie assignment fields
-- Safe to run on existing table — uses ADD COLUMN IF NOT EXISTS

ALTER TABLE wheelchair_requests
  ADD COLUMN IF NOT EXISTS service_type          VARCHAR(20)     NOT NULL DEFAULT 'WHEELCHAIR'
    CHECK (service_type IN ('WHEELCHAIR', 'COOLIE', 'BOTH')),

  ADD COLUMN IF NOT EXISTS bag_count             INTEGER         NOT NULL DEFAULT 0
    CHECK (bag_count >= 0),

  ADD COLUMN IF NOT EXISTS estimated_cost        NUMERIC(10, 2)  NOT NULL DEFAULT 0.00,

  ADD COLUMN IF NOT EXISTS assigned_coolie_id    UUID            NULL,
  ADD COLUMN IF NOT EXISTS assigned_coolie_name  VARCHAR(255)    NULL,
  ADD COLUMN IF NOT EXISTS assigned_coolie_phone VARCHAR(20)     NULL;

-- Index for filtering requests by service type (useful for attendant/coolie dashboards)
CREATE INDEX IF NOT EXISTS idx_wheelchair_requests_service_type
  ON wheelchair_requests (service_type);

COMMENT ON COLUMN wheelchair_requests.service_type     IS 'Type of assistance: WHEELCHAIR, COOLIE, or BOTH';
COMMENT ON COLUMN wheelchair_requests.bag_count        IS 'Number of bags for coolie service';
COMMENT ON COLUMN wheelchair_requests.estimated_cost   IS 'Pre-calculated cost estimate at time of request';
COMMENT ON COLUMN wheelchair_requests.assigned_coolie_id    IS 'UUID of the assigned coolie (from token or manual entry)';
COMMENT ON COLUMN wheelchair_requests.assigned_coolie_name  IS 'Display name of assigned coolie';
COMMENT ON COLUMN wheelchair_requests.assigned_coolie_phone IS 'Contact phone of assigned coolie';
