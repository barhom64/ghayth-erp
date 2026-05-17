-- 171_journal_entries_currency_columns.sql
-- Task #270 — multi-currency in GL: every journal_entries row now
-- carries the original-currency context alongside the functional-
-- currency posting. Existing rows are SAR-functional (rate=1, amount
-- already in SAR) so the backfill is a no-op insert of the defaults.
--
-- We deliberately store BOTH the totals on the header AND the
-- per-line original amount so reports can either:
--   - sum SAR (default ledger view)
--   - group by originalCurrency and show the source amount
-- without having to recompute by walking the rate history.

BEGIN;

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS "originalCurrency"  CHAR(3),
  ADD COLUMN IF NOT EXISTS "exchangeRate"      NUMERIC(18,8) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "originalAmount"    NUMERIC(18,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_journal_entries_currency_iso'
  ) THEN
    ALTER TABLE journal_entries ADD CONSTRAINT chk_journal_entries_currency_iso
      CHECK ("originalCurrency" IS NULL OR "originalCurrency" ~ '^[A-Z]{3}$');
  END IF;
END $$;

ALTER TABLE journal_lines
  ADD COLUMN IF NOT EXISTS "originalCurrency"  CHAR(3),
  ADD COLUMN IF NOT EXISTS "originalDebit"     NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS "originalCredit"    NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS "exchangeRate"      NUMERIC(18,8);

CREATE INDEX IF NOT EXISTS idx_journal_entries_original_currency
  ON journal_entries ("companyId", "originalCurrency")
  WHERE "originalCurrency" IS NOT NULL AND "originalCurrency" <> 'SAR';

COMMIT;
