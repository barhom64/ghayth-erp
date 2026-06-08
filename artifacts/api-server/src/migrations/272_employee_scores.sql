-- Migration 272 — Employee Scoring (#1799 priority #10)
--
-- @rollback: Fully additive. To undo:
--   DROP INDEX IF EXISTS idx_employee_scores_assignment_period;
--   DROP INDEX IF EXISTS idx_employee_scores_company_period;
--   DROP TABLE IF EXISTS employee_scores;
--
-- Inventory (docs/HR_OPERATING_FOUNDATION_TASK.md §A.9) showed the
-- 6-dimension Employee Scoring Engine is missing while every data
-- source it needs already exists:
--
--   Discipline   ← employee_violations + attendance
--   Activity     ← audit_logs + tasks.assignedTo
--   Productivity ← tasks.status='done' + per-module counters
--   Quality      ← audit_logs (reopened, rejected approvals)
--   Manager      ← hr_performance_evaluations
--   Development  ← training_enrollments.status='completed'
--
-- This migration is the ONLY new schema #1799 §A.9 requires: one row
-- per (employee × period × scope) with the composite score, the
-- per-dimension breakdown, and the human-readable rationale.

CREATE TABLE IF NOT EXISTS employee_scores (
  id BIGSERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId" INTEGER,
  "assignmentId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  -- Period granularity: 'weekly' uses ISO-week YYYY-WW. 'monthly' uses
  -- YYYY-MM. 'quarterly' uses YYYY-Qn. The engine writes one row per
  -- (assignment, scope, period_key) so all three granularities can
  -- co-exist for the same employee without conflict.
  scope VARCHAR(12) NOT NULL CHECK (scope IN ('weekly', 'monthly', 'quarterly')),
  "periodKey" VARCHAR(10) NOT NULL,
  -- Composite score (0-100) and trend vs the previous period of the
  -- same scope (-1 = down, 0 = flat, +1 = up). The trend is denormalized
  -- so list endpoints can render the arrow without a self-join.
  "compositeScore" NUMERIC(5,2) NOT NULL,
  trend SMALLINT NOT NULL DEFAULT 0 CHECK (trend BETWEEN -1 AND 1),
  -- Per-dimension breakdown. All NUMERIC(5,2). The 6 dimensions
  -- match #1799 §F.10 weights (20/15/35/15/10/5 by default — the
  -- weights themselves are NOT persisted here because they can change
  -- per category over time and we want to re-compute on demand).
  "disciplineScore" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "activityScore" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "productivityScore" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "qualityScore" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "managerScore" NUMERIC(5,2) NOT NULL DEFAULT 0,
  "developmentScore" NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- Per-dimension human-readable rationale (Arabic). Stored as JSONB
  -- of `{ dimension: text }` pairs so #1799's «تظهر أسباب الدرجة»
  -- requirement is met without a separate table.
  rationale JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Auditable provenance: which weights, which raw counters, which
  -- date range the engine ingested. This is what makes the score
  -- defensible when an HR officer asks «لماذا 65؟».
  "weightsUsed" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "rawCounters" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "computedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE ("assignmentId", scope, "periodKey")
);

-- Primary access path: «show me my score history».
CREATE INDEX IF NOT EXISTS idx_employee_scores_assignment_period
  ON employee_scores("assignmentId", scope, "periodKey" DESC);

-- HR-dashboard access path: company-wide ranking for one period.
CREATE INDEX IF NOT EXISTS idx_employee_scores_company_period
  ON employee_scores("companyId", scope, "periodKey", "compositeScore" DESC);
