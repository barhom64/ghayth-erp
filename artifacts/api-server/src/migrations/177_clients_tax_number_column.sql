-- 177_clients_tax_number_column.sql
--
-- Task #379: the daily ZATCA B2C export cron (zatcaB2cReportDrain in
-- artifacts/api-server/src/lib/zatca/worker.ts) and the PDF export
-- helper (artifacts/api-server/src/lib/pdfExport.ts) both join
-- `clients` and read `c."taxNumber"` to determine whether an invoice
-- is B2C (Simplified) vs B2B (Standard). The column is declared in
-- the Drizzle schema (lib/db/src/schema/index.ts) but no migration
-- ever created it on the live DB, so the cron was crashing every
-- minute with `column c.taxNumber does not exist` (Postgres 42703)
-- and no B2C invoice was being drained to ZATCA.
--
-- Idempotent: safe to re-apply, safe on environments that already
-- have the column.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS "taxNumber" TEXT;
