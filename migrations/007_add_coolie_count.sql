ALTER TABLE wheelchair_requests
ADD COLUMN IF NOT EXISTS coolie_count INTEGER NOT NULL DEFAULT 1
CHECK (coolie_count > 0);

COMMENT ON COLUMN wheelchair_requests.coolie_count IS
'Number of coolies requested. One coolie can handle up to 40kg load.';