-- Add endpointHash column for deterministic lookup of encrypted push subscription endpoints
-- The endpoint column will store AES-256-CBC encrypted values
-- The endpointHash stores a SHA-256 HMAC of the original endpoint for unique lookup/deduplication

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS "endpointHash" TEXT;

-- Drop old unique constraint on endpoint (raw URLs) and replace with hash-based unique constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'push_subscriptions_endpoint_key'
  ) THEN
    ALTER TABLE push_subscriptions DROP CONSTRAINT "push_subscriptions_endpoint_key";
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS "push_subscriptions_endpointHash_key"
  ON push_subscriptions ("companyId", "endpointHash")
  WHERE "endpointHash" IS NOT NULL;

COMMENT ON COLUMN push_subscriptions."endpointHash" IS 'HMAC-SHA256 of original endpoint URL for deterministic deduplication when endpoint is encrypted';
