-- Migration 273 — Employee signals (#1799 priority #10 §G)
--
-- @rollback: Fully additive. To undo:
--   DROP INDEX IF EXISTS idx_employee_signals_company_period;
--   DROP INDEX IF EXISTS idx_employee_signals_assignment;
--   DROP TABLE IF EXISTS employee_signals;
--
-- Builds on the Scoring Engine merged in #1831 (employee_scores).
-- The 3 signal engines required in #1799 §G:
--
--   Risk Engine       — انخفاض النشاط، زيادة الغياب، تراجع الإنجاز، كثرة المخالفات
--   Promotion Engine  — انضباط عالي، إنجاز عالي، جودة عالية، مبادرات
--   Burnout Engine    — ساعات عمل طويلة، عدم إجازات، انخفاض مفاجئ
--
-- Per #1799 §G the signals are RECOMMENDATIONS for the manager/HR
-- — they don't take final decisions. The table records the signal +
-- severity + rationale + which (employee × period) triggered it. HR
-- dashboards filter by severity to surface the most urgent items.

CREATE TABLE IF NOT EXISTS employee_signals (
  id BIGSERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId" INTEGER,
  "assignmentId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  -- The 3 engines + a generic 'custom' bucket for org-specific signals.
  "signalType" VARCHAR(20) NOT NULL CHECK ("signalType" IN ('risk', 'promotion', 'burnout', 'custom')),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  -- The detected period (same shape as employee_scores.periodKey).
  scope VARCHAR(12) NOT NULL CHECK (scope IN ('weekly', 'monthly', 'quarterly')),
  "periodKey" VARCHAR(10) NOT NULL,
  -- Arabic title + reasons array (each reason = one rule that fired).
  title VARCHAR(200) NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The composite score that caused the signal (denormalized from
  -- employee_scores for cheap dashboard reads).
  "compositeScore" NUMERIC(5,2),
  -- HR can acknowledge or dismiss a signal to keep it out of the
  -- dashboard. The signal row stays for audit; only its `acknowledgedAt`
  -- changes. Re-runs of the engine on the same (employee × period)
  -- upsert and reset `acknowledgedAt` only if the severity escalates.
  "acknowledgedAt" TIMESTAMPTZ,
  "acknowledgedBy" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Each (assignment × signalType × scope × periodKey) is unique so
  -- the engines are idempotent on re-run.
  UNIQUE ("assignmentId", "signalType", scope, "periodKey")
);

-- HR dashboard list: «what needs my attention this period?».
CREATE INDEX IF NOT EXISTS idx_employee_signals_company_period
  ON employee_signals("companyId", scope, "periodKey", severity);

-- Per-employee history.
CREATE INDEX IF NOT EXISTS idx_employee_signals_assignment
  ON employee_signals("assignmentId", "createdAt" DESC);
