-- Task #299 — Direct bank delivery for WPS runs.
-- Tracks the SFTP / API drop-zone push from the ERP to the bank
-- and the subsequent ack-file pull, so the operator no longer has
-- to upload the file through the bank's portal.

ALTER TABLE wps_runs
  ADD COLUMN IF NOT EXISTS "deliveryChannel"  TEXT,
  ADD COLUMN IF NOT EXISTS "deliveryRef"      TEXT,
  ADD COLUMN IF NOT EXISTS "deliveredAt"      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "lastPolledAt"     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pollAttempts"     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "deliveryError"    TEXT;

-- Constrain the channel to known values; NULL means not yet delivered
-- (legacy operator-uploads-manually flow).
ALTER TABLE wps_runs
  DROP CONSTRAINT IF EXISTS chk_wps_runs_delivery_channel;
ALTER TABLE wps_runs
  ADD CONSTRAINT chk_wps_runs_delivery_channel
  CHECK ("deliveryChannel" IS NULL
         OR "deliveryChannel" IN ('manual', 'sftp', 'https'));

-- The poller walks rows in ('submitted','partial') status with a
-- non-null deliveryChannel and a stale lastPolledAt — index that
-- hot path. Predicate matches pollPendingWpsAcks's WHERE clause so
-- the planner can use this index for the cron sweep.
CREATE INDEX IF NOT EXISTS idx_wps_runs_delivery_pending
  ON wps_runs ("deliveryChannel", status, "lastPolledAt")
  WHERE "deliveryChannel" IS NOT NULL
    AND status IN ('submitted', 'partial');
