-- Migration 152: add entryDate / exitDate to umrah_pilgrims
--
-- The Excel importer reads "تاريخ الدخول" / "تاريخ الخروج" from the NUSK
-- mutamer file (umrahImportEngine.ts:31-32) but the columns were never
-- present on the table, so the parsed values fell on the floor. Daily
-- run-sheet reports + arrival/departure dashboards need them; without
-- them the only "date" we have per pilgrim is createdAt, which is the
-- import timestamp, not the actual travel date.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Partial indexes are scoped to
-- live rows + non-null dates so the heat is paid only by the daily
-- run-sheet path.

ALTER TABLE umrah_pilgrims
  ADD COLUMN IF NOT EXISTS "entryDate" DATE,
  ADD COLUMN IF NOT EXISTS "exitDate"  DATE;

CREATE INDEX IF NOT EXISTS idx_umrah_pilgrims_entry_date
  ON umrah_pilgrims ("companyId", "entryDate")
  WHERE "deletedAt" IS NULL AND "entryDate" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_umrah_pilgrims_exit_date
  ON umrah_pilgrims ("companyId", "exitDate")
  WHERE "deletedAt" IS NULL AND "exitDate" IS NOT NULL;
