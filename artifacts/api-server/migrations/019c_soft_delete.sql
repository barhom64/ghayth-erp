ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE payroll_runs ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE employee_violations ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS invoices_deleted_at_idx ON invoices ("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS journal_entries_deleted_at_idx ON journal_entries ("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS payroll_runs_deleted_at_idx ON payroll_runs ("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS payroll_lines_deleted_at_idx ON payroll_lines ("deletedAt") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS employee_violations_deleted_at_idx ON employee_violations ("deletedAt") WHERE "deletedAt" IS NULL;
