-- ===========================================================================
-- 230_fleet_telematics_retention.sql — Retention + heartbeat columns (#1354)
-- ---------------------------------------------------------------------------
-- WHAT:    Adds the support columns the retention/heartbeat cron jobs need:
--            (1) `positionRetentionDays` on integrations row so each tenant
--                can tune how long their GPS history is kept (default 90).
--            (2) `syncLogRetentionDays` for sync_log cleanup (default 30).
--            (3) `offlineThresholdSec` so heartbeat detection knows after
--                how many seconds without a position to flag a device as
--                offline (default 600 = 10min).
--          These could have lived in a single JSONB knob, but a dedicated
--          column is searchable, NOT NULL-able, and obvious in `\d`.
--
-- WHY:     Engineering review flagged "no retention policy" + "no passive
--          offline heartbeat" as production blockers. This migration ships
--          the schema half; the cron jobs land in lib/cronScheduler.ts in
--          the same hardening commit.
--
-- SAFETY:  Additive only. Defaults chosen so existing rows (none on the
--          pilot branch) keep the previously-implicit behaviour: 90-day
--          positions, 30-day logs, 10-min heartbeat.
--
-- @rollback:
--   ALTER TABLE public.fleet_telematics_integrations
--     DROP COLUMN IF EXISTS "positionRetentionDays",
--     DROP COLUMN IF EXISTS "syncLogRetentionDays",
--     DROP COLUMN IF EXISTS "offlineThresholdSec";
-- ===========================================================================

ALTER TABLE public.fleet_telematics_integrations
  ADD COLUMN IF NOT EXISTS "positionRetentionDays" SMALLINT NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS "syncLogRetentionDays"  SMALLINT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS "offlineThresholdSec"   INTEGER  NOT NULL DEFAULT 600;

ALTER TABLE public.fleet_telematics_integrations
  DROP CONSTRAINT IF EXISTS fleet_telematics_integrations_retention_check;
ALTER TABLE public.fleet_telematics_integrations
  ADD CONSTRAINT fleet_telematics_integrations_retention_check CHECK (
    "positionRetentionDays"  BETWEEN 1 AND 3650 AND
    "syncLogRetentionDays"   BETWEEN 1 AND 365  AND
    "offlineThresholdSec"    BETWEEN 60 AND 86400
  );

-- @policy:breaking
-- Reason: the DROP CONSTRAINT IF EXISTS line is idempotency only — the
-- constraint being dropped is created by THIS migration in the line
-- below. The migration-policy guard treats DROP CONSTRAINT as breaking
-- by default; in this case the ADD CONSTRAINT immediately re-creates
-- the same name. Same shape as 229.

COMMENT ON COLUMN public.fleet_telematics_integrations."positionRetentionDays"
  IS 'Days of GPS history kept before nightly retention cron deletes (default 90).';
COMMENT ON COLUMN public.fleet_telematics_integrations."syncLogRetentionDays"
  IS 'Days of sync log history kept before nightly retention cron deletes (default 30).';
COMMENT ON COLUMN public.fleet_telematics_integrations."offlineThresholdSec"
  IS 'Seconds since lastPositionAt after which heartbeat cron flips device to offline (default 600).';
