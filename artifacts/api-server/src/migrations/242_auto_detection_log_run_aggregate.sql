-- Migration 242: make auto_detection_log match its only writer (run aggregates)
--
-- Context: lib/autoViolationEngine.ts logDetectionRun() logs ONE row per
-- auto-detection run with aggregate counters
--   ("companyId","targetDate",detected,"violationsCreated","memosCreated",
--    skipped,errors,details,"createdAt")
-- but migration 105 created auto_detection_log as a *per-detection* table
--   ("ruleType" NOT NULL, "employeeId", "detectedAt", severity, "violationId", status)
-- and nothing ever wrote that per-detection shape. So every run-log INSERT
-- failed with 42703 (missing targetDate/detected/... ) — or 23502 on the
-- NOT NULL ruleType — and was swallowed by a self-heal try/catch in the
-- engine. The HR-discipline summary that reads this table therefore had
-- nothing to report.
--
-- The engine is the sole writer, so we align the table to the run-aggregate
-- shape it actually produces (additive), and relax the per-detection
-- ruleType NOT NULL that no writer ever satisfied. detectedAt (migration
-- 105, DEFAULT NOW()) is kept so the 30-day window still works; createdAt is
-- added because the engine orders/filters on it. Additive + idempotent;
-- zero-downtime. The matching self-heal hack is removed from the engine and
-- the HR-discipline summary is switched to run-aggregate semantics in the
-- same change.
--
-- @rollback:
--   ALTER TABLE auto_detection_log
--     DROP COLUMN IF EXISTS "targetDate", DROP COLUMN IF EXISTS detected,
--     DROP COLUMN IF EXISTS "violationsCreated", DROP COLUMN IF EXISTS "memosCreated",
--     DROP COLUMN IF EXISTS skipped, DROP COLUMN IF EXISTS errors,
--     DROP COLUMN IF EXISTS "createdAt";
--   ALTER TABLE auto_detection_log ALTER COLUMN "ruleType" SET NOT NULL;

ALTER TABLE auto_detection_log
  ADD COLUMN IF NOT EXISTS "targetDate"        DATE,
  ADD COLUMN IF NOT EXISTS detected            INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "violationsCreated" INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "memosCreated"      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped             INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS errors              INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "createdAt"         TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE auto_detection_log ALTER COLUMN "ruleType" DROP NOT NULL;
