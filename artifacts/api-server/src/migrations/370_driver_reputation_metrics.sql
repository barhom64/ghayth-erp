-- 369_driver_reputation_metrics.sql
-- TA-T18-DR (audit file 20 §10) — Driver Reputation Scoring, Phase 1
-- (storage + compute service + read API). The engine-integration phase
-- arrives in a follow-up PR after this data has had time to populate
-- and the rebalanced weights are validated.
--
-- Adds six columns to `fleet_drivers` to store the computed reputation
-- + its three components, plus the timestamp of the last recompute.
-- The score formula (per the audit doc):
--
--   reputationScore = 0.4·onTimeRate + 0.4·completionRate + 0.2·startRate
--
-- All four numeric columns are nullable — NULL means «no reputation
-- computed yet for this driver» and the engine treats it as neutral
-- (no positive or negative pull) in the upcoming integration. This
-- keeps fresh hires from being penalised on their first day.
--
-- @policy:safe
-- @rollback: ALTER TABLE fleet_drivers DROP COLUMN IF EXISTS "reputationScore", DROP COLUMN IF EXISTS "reputationOnTimeRate", DROP COLUMN IF EXISTS "reputationCompletionRate", DROP COLUMN IF EXISTS "reputationStartRate", DROP COLUMN IF EXISTS "reputationTripsConsidered", DROP COLUMN IF EXISTS "reputationComputedAt"; DROP INDEX IF EXISTS idx_fleet_drivers_reputation_score;

ALTER TABLE public.fleet_drivers
  ADD COLUMN IF NOT EXISTS "reputationScore"           NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS "reputationOnTimeRate"      NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS "reputationCompletionRate"  NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS "reputationStartRate"       NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS "reputationTripsConsidered" INTEGER,
  ADD COLUMN IF NOT EXISTS "reputationComputedAt"      TIMESTAMPTZ;

-- Range guards so a bad recompute can't poison the column with a
-- 200% rate. Idempotent guard so a re-run on a partially-applied DB
-- doesn't fail with 42710.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fleet_drivers_reputation_score_range'
  ) THEN
    ALTER TABLE public.fleet_drivers
      ADD CONSTRAINT fleet_drivers_reputation_score_range CHECK (
        "reputationScore" IS NULL OR
        ("reputationScore" >= 0 AND "reputationScore" <= 100)
      ),
      ADD CONSTRAINT fleet_drivers_reputation_on_time_range CHECK (
        "reputationOnTimeRate" IS NULL OR
        ("reputationOnTimeRate" >= 0 AND "reputationOnTimeRate" <= 100)
      ),
      ADD CONSTRAINT fleet_drivers_reputation_completion_range CHECK (
        "reputationCompletionRate" IS NULL OR
        ("reputationCompletionRate" >= 0 AND "reputationCompletionRate" <= 100)
      ),
      ADD CONSTRAINT fleet_drivers_reputation_start_range CHECK (
        "reputationStartRate" IS NULL OR
        ("reputationStartRate" >= 0 AND "reputationStartRate" <= 100)
      );
  END IF;
END$$;

-- Index for the engine's «top drivers by reputation» tie-breaker
-- (will be exercised in the integration phase). NULLS LAST so
-- unscored drivers don't crowd the top of the list.
CREATE INDEX IF NOT EXISTS idx_fleet_drivers_reputation_score
  ON public.fleet_drivers ("companyId", "reputationScore" DESC NULLS LAST)
  WHERE "deletedAt" IS NULL;
