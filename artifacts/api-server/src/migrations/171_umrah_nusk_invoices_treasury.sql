-- ============================================================
-- Migration 171: umrah_nusk_invoices — treasuryId (cash box) column
-- ============================================================
-- Pairs with the import-wizard cash-box picker so each NUSK voucher
-- import is tied to the treasury that will fund the payment. Without
-- this column the AP JE posted by umrahImportEngine.postNuskJournalEntries
-- is unlinked, leaving downstream payment routing to guess.
--
-- Nullable so existing rows (pre-picker era) stay untouched. Soft FK
-- to treasuries(id) — no ON DELETE rule because we never want a
-- treasury delete to cascade through to historical invoices.
-- ============================================================

ALTER TABLE umrah_nusk_invoices
  ADD COLUMN IF NOT EXISTS "treasuryId" integer;

COMMENT ON COLUMN umrah_nusk_invoices."treasuryId" IS
  'Cash box (treasuries.id) that will fund the NUSK supplier payment. Optional; set at import time from the wizard dropdown.';

CREATE INDEX IF NOT EXISTS idx_umrah_nusk_invoices_treasury
  ON umrah_nusk_invoices("treasuryId") WHERE "deletedAt" IS NULL;
