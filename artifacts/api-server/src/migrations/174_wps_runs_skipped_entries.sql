-- Task #300: persist the list of payroll lines that were skipped from a
-- WPS file build, with the reason, so operators can see who was excluded
-- (no IBAN / non-Saudi IBAN / no iqama / non-positive net) without
-- waiting for the employee to complain.
ALTER TABLE wps_runs
  ADD COLUMN IF NOT EXISTS "skippedEntries" JSONB NOT NULL DEFAULT '[]'::jsonb;
