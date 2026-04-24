-- Migration 077: Add missing performance indexes
-- These tables are heavily queried by companyId but lack an index

CREATE INDEX IF NOT EXISTS idx_employees_company
  ON employees ("companyId", "deletedAt") WHERE "deletedAt" IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='employees' AND column_name='department') THEN
    CREATE INDEX IF NOT EXISTS idx_employees_department
      ON employees ("companyId", department) WHERE "deletedAt" IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_company
  ON payroll_runs ("companyId", period, "deletedAt") WHERE "deletedAt" IS NULL;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_lines' AND column_name='payrollRunId') THEN
    CREATE INDEX IF NOT EXISTS idx_payroll_lines_run
      ON payroll_lines ("payrollRunId") WHERE "deletedAt" IS NULL;
  ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='payroll_lines' AND column_name='runId') THEN
    CREATE INDEX IF NOT EXISTS idx_payroll_lines_run
      ON payroll_lines ("runId") WHERE "deletedAt" IS NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_date
  ON audit_logs ("companyId", "createdAt");

CREATE INDEX IF NOT EXISTS idx_event_logs_company_date
  ON event_logs ("companyId", "createdAt");
