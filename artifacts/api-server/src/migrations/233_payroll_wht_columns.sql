-- 233_payroll_wht_columns.sql
--
-- @rollback: ALTER TABLE payroll_lines DROP COLUMN IF EXISTS "whtAmount";
--            ALTER TABLE employees DROP COLUMN IF EXISTS "whtRate";
--            ALTER TABLE employees DROP COLUMN IF EXISTS "isNonResident";
--
-- Saudi WHT on salaries — required for non-Saudi/non-resident employees
-- whose remuneration falls under ZATCA WHT categories (technical
-- services, management fees, royalties, etc.). The audit flagged this
-- as a missing compliance feature.
--
-- employees.isNonResident: boolean — true triggers WHT calc at payroll.
-- employees.whtRate: numeric — rate to apply (defaults to category
--   lookup if NULL, then 0).
-- payroll_lines.whtAmount: numeric — recorded amount for ZATCA filing.

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS "isNonResident" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "whtRate" numeric(5,2);

ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS "whtAmount" numeric(18,2) NOT NULL DEFAULT 0;

-- Hot path: ZATCA WHT filing reads payroll_lines grouped by runId
-- WHERE whtAmount > 0. Join up to payroll_runs to scope by company
-- and period at query time.
CREATE INDEX IF NOT EXISTS idx_payroll_lines_wht_amount
  ON public.payroll_lines ("runId")
  WHERE "whtAmount" > 0;
