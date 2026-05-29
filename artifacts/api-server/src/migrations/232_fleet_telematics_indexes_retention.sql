-- ===========================================================================
-- 232_fleet_telematics_indexes_retention.sql — Performance + retention (#1354)
-- ---------------------------------------------------------------------------
-- WHAT:    Two follow-up hardening items the scorecard commit (6a24728)
--          implicitly created:
--            (1) Driver derivation in persistAlert does:
--                  SELECT driverId FROM fleet_trips
--                   WHERE vehicleId = $1
--                     AND status = 'in_progress'
--                     AND startTime <= $2
--                   ORDER BY startTime DESC LIMIT 1
--                Without an index on (vehicleId, status, startTime DESC)
--                this scans the trips table for every AI alert insert.
--                At 100 vehicles × ~5 alerts/min that's 500 scans/min on
--                a growing table.
--            (2) fleet_video_access_logs has no retention column on the
--                integrations table — it just keeps growing. The
--                migration 230 added positionRetentionDays and
--                syncLogRetentionDays but skipped this third audit
--                table. Add a parallel `videoAccessLogRetentionDays`
--                column so the retention cron can sweep it the same
--                way it sweeps the other two.
--
-- WHY:     The scorecard commit added driver derivation without an
--          index, and the video security commit added the access log
--          table without a retention plan. Both are production
--          bottlenecks waiting to happen — close them now while the
--          tables are still pilot-sized.
--
-- SAFETY:  Additive only. CREATE INDEX uses IF NOT EXISTS; the column
--          add has a sane default + range check.
--
-- @policy:breaking
-- Reason: the DROP CONSTRAINT IF EXISTS line is idempotency only —
-- the constraint being dropped is created by THIS migration in the
-- line below. Same shape as 229/230.
--
-- @rollback:
--   DROP INDEX IF EXISTS public.idx_fleet_trips_vehicle_status_starttime;
--   ALTER TABLE public.fleet_telematics_integrations
--     DROP COLUMN IF EXISTS "videoAccessLogRetentionDays";
-- ===========================================================================

-- (1) Driver-derivation index. Partial index on status='in_progress'
-- because that's the only status the persistAlert lookup ever queries,
-- and it's typically <1% of total trip rows — a slim partial index is
-- faster to maintain than a full one.
CREATE INDEX IF NOT EXISTS idx_fleet_trips_vehicle_status_starttime
  ON public.fleet_trips ("vehicleId", "startTime" DESC)
  WHERE status = 'in_progress';

COMMENT ON INDEX public.idx_fleet_trips_vehicle_status_starttime
  IS 'Driver derivation for AI alerts (#1354) — partial index on in_progress trips for fast WHERE vehicleId AND startTime <= alert.occurredAt lookups.';

-- (2) Video access log retention. Default 90 days matches positions
-- (audit logs are the same general retention class as the data they
-- audit). Range 1..365 — operators with tight compliance windows can
-- shorten, those with audit retention requirements can lengthen up
-- to a year.
ALTER TABLE public.fleet_telematics_integrations
  ADD COLUMN IF NOT EXISTS "videoAccessLogRetentionDays" SMALLINT NOT NULL DEFAULT 90;

ALTER TABLE public.fleet_telematics_integrations
  DROP CONSTRAINT IF EXISTS fleet_telematics_integrations_video_log_retention_check;
ALTER TABLE public.fleet_telematics_integrations
  ADD CONSTRAINT fleet_telematics_integrations_video_log_retention_check CHECK (
    "videoAccessLogRetentionDays" BETWEEN 1 AND 365
  );

COMMENT ON COLUMN public.fleet_telematics_integrations."videoAccessLogRetentionDays"
  IS 'Days of fleet_video_access_logs history kept before nightly retention cron deletes (default 90).';
