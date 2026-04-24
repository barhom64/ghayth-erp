-- Migration 077: Add missing performance indexes
-- These tables are heavily queried by companyId but lack an index

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_company
  ON employees ("companyId", "deletedAt") WHERE "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_department
  ON employees ("companyId", department) WHERE "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payroll_runs_company
  ON payroll_runs ("companyId", period, "deletedAt") WHERE "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payroll_lines_run
  ON payroll_lines ("payrollRunId") WHERE "deletedAt" IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_company_date
  ON audit_logs ("companyId", "createdAt");

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_event_logs_company_date
  ON event_logs ("companyId", "createdAt");
