-- Migration 279 — Per-company scoring weight overrides (#1799 HR-020)
--
-- @rollback:
--   DROP TABLE IF EXISTS scoring_weights_per_company CASCADE;
--
-- @policy:additive — new table only, no destructive ops on existing data.
--
-- The audit (docs/audit/HR_OPERATING_FOUNDATION_AUDIT.md §6 R4) flagged
-- that the 6 scoring dimensions' weights (20/15/35/15/10/5) were hardcoded
-- in `lib/employeeScoringEngine.ts:DEFAULT_WEIGHTS`. Every company has the
-- same weights — meaning a sales-driven company can't make productivity
-- weigh 50% and a public-service company can't make quality weigh 30%
-- without a code change.
--
-- This table lets HR admins override any/all of the 6 weights per company.
-- The engine reads it at the start of each scoring run; companies without
-- a row use the DEFAULT_WEIGHTS untouched. Optional `categoryKey` lets you
-- override per category too (e.g. drivers vs office workers).
--
-- Validation contract:
--   - Every weight ∈ [0, 1].
--   - The 6 weights MUST sum to 1.0 (within 0.001 tolerance) on save. The
--     CHECK below catches the bulk-of-bad-data case; the route layer also
--     re-validates so it can return a clean Arabic error to the UI.

CREATE TABLE IF NOT EXISTS scoring_weights_per_company (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- NULL means "applies to all categories" (the company-wide default).
  -- Non-NULL means "this category specifically overrides the row above".
  "categoryKey" VARCHAR(40),
  "disciplineWeight" NUMERIC(4,3) NOT NULL DEFAULT 0.200
    CHECK ("disciplineWeight" >= 0 AND "disciplineWeight" <= 1),
  "activityWeight" NUMERIC(4,3) NOT NULL DEFAULT 0.150
    CHECK ("activityWeight" >= 0 AND "activityWeight" <= 1),
  "productivityWeight" NUMERIC(4,3) NOT NULL DEFAULT 0.350
    CHECK ("productivityWeight" >= 0 AND "productivityWeight" <= 1),
  "qualityWeight" NUMERIC(4,3) NOT NULL DEFAULT 0.150
    CHECK ("qualityWeight" >= 0 AND "qualityWeight" <= 1),
  "managerWeight" NUMERIC(4,3) NOT NULL DEFAULT 0.100
    CHECK ("managerWeight" >= 0 AND "managerWeight" <= 1),
  "developmentWeight" NUMERIC(4,3) NOT NULL DEFAULT 0.050
    CHECK ("developmentWeight" >= 0 AND "developmentWeight" <= 1),
  -- The 6 weights must sum to exactly 1.0 (allow tiny float jitter).
  -- Bulk-of-bad-data guard; the route handler validates first with a
  -- friendlier Arabic error message.
  CONSTRAINT scoring_weights_sum_to_one CHECK (
    ABS(
      ("disciplineWeight" + "activityWeight" + "productivityWeight"
       + "qualityWeight" + "managerWeight" + "developmentWeight") - 1
    ) < 0.001
  ),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("companyId", "categoryKey")
);

CREATE INDEX IF NOT EXISTS idx_scoring_weights_company
  ON scoring_weights_per_company("companyId");
