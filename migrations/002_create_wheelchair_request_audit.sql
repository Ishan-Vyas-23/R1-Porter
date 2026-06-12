-- Migration 002: Create wheelchair_request_audit table
-- Depends on: 001_create_wheelchair_requests.sql

CREATE TABLE IF NOT EXISTS wheelchair_request_audit (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID        NOT NULL
                  REFERENCES wheelchair_requests(id) ON DELETE CASCADE,
  action        VARCHAR(50) NOT NULL,
  performed_by  UUID        NOT NULL,
  old_status    VARCHAR(20),
  new_status    VARCHAR(20),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fetching audit trail of a specific request
CREATE INDEX IF NOT EXISTS idx_audit_request_id
  ON wheelchair_request_audit (request_id);

-- Index for querying actions by a specific user
CREATE INDEX IF NOT EXISTS idx_audit_performed_by
  ON wheelchair_request_audit (performed_by);
