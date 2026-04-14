-- Migration 073: add overtimeMinutes column to employee_monthly_attendance
--
-- Context: the check-out handler in routes/hr.ts updates this column on
-- every check-out to accumulate per-period overtime. The programmer
-- discovered during Step 4 verification of the HR audit that the column
-- didn't exist yet in the running DB — the check-out endpoint was
-- returning a bare 500 from pg (42703 "column does not exist"). The
-- programmer added it via manual ALTER to unblock testing; this
-- migration makes the addition permanent so fresh databases don't
-- repeat the same hunt.
--
-- Idempotent via `IF NOT EXISTS`. Safe to re-run.

ALTER TABLE employee_monthly_attendance
  ADD COLUMN IF NOT EXISTS "overtimeMinutes" INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN employee_monthly_attendance."overtimeMinutes" IS
  'Total overtime minutes for the period — accumulated from check-out events';
