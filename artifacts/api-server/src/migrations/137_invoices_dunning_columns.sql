-- 137_invoices_dunning_columns.sql
-- Add the dunning-tracking columns to the invoices table.
-- finance-invoices.ts had been creating these inline via
-- "ALTER TABLE invoices ADD COLUMN IF NOT EXISTS" on first request,
-- which left them out of db/schema.sql and tripped audit-schema-drift.
-- Promote to a proper migration so the schema dump stays in sync.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "lastDunningStage" INTEGER DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "lastDunningAt"    TIMESTAMP;
