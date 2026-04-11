-- Add encryption marker column for push subscription endpoints
-- The endpoint URLs should be encrypted at rest for PDPL compliance

ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS "endpointEncrypted" BOOLEAN NOT NULL DEFAULT false;

-- Add comment to document encryption requirement
COMMENT ON COLUMN push_subscriptions.endpoint IS 'Push notification endpoint URL — should be encrypted at rest when endpointEncrypted=true';
COMMENT ON COLUMN push_subscriptions."endpointEncrypted" IS 'Flag indicating whether endpoint is stored encrypted';
