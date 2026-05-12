-- 140_multi_currency_foundations.sql
-- Foundations for multi-currency in the GL — Week 1 of the plan in
-- docs/MULTI_CURRENCY_DESIGN.md. The fx_rates table + invoices/PO
-- exchangeRate columns already exist (created inline in
-- finance-algorithms.ts). This migration adds:
--   1. Functional + presentation currency on companies (IAS 21)
--   2. Indexes + uniqueness on fx_rates so lookups are O(log n) and
--      duplicate (company, pair, date) tuples can't drift apart
--   3. fx_revaluation_log + fx_revaluation_lines for the period-end
--      audit trail (Week 3 of the rollout will populate them)

BEGIN;

-- 1. companies.functionalCurrency — operating currency per IAS 21.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "functionalCurrency" CHAR(3) DEFAULT 'SAR';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_companies_functional_currency_iso'
  ) THEN
    ALTER TABLE companies ADD CONSTRAINT chk_companies_functional_currency_iso
      CHECK ("functionalCurrency" ~ '^[A-Z]{3}$');
  END IF;
END $$;

-- 2. companies.presentationCurrency — for consolidated reporting.
--    NULL means "same as functional" so existing rows don't need a
--    backfill — the lookup helper handles the fallback.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS "presentationCurrency" CHAR(3);

-- 3. fx_rates: enforce uniqueness on (company, from, to, date) so a
--    duplicate insert with a conflicting rate raises a clear error
--    instead of producing two rows the lookup would coin-flip
--    between. Also add a descending date index for the "find me the
--    most recent rate not later than X" lookup pattern.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_rates_company_pair_date
  ON fx_rates ("companyId", "fromCurrency", "toCurrency", "effectiveDate");
CREATE INDEX IF NOT EXISTS idx_fx_rates_lookup
  ON fx_rates ("companyId", "fromCurrency", "toCurrency", "effectiveDate" DESC);

-- 4. Period-end revaluation header. One row per (company, period)
--    revaluation run. Re-running for the same period reverses the
--    prior journal entry first; the worker writes a new row each
--    time so the audit log stays append-only.
CREATE TABLE IF NOT EXISTS fx_revaluation_log (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL REFERENCES companies(id),
  "periodId"            INTEGER NOT NULL REFERENCES financial_periods(id),
  "asOfDate"            DATE NOT NULL,
  "functionalCurrency"  CHAR(3) NOT NULL,
  "totalGain"           NUMERIC(18,2) NOT NULL DEFAULT 0,
  "totalLoss"           NUMERIC(18,2) NOT NULL DEFAULT 0,
  "journalEntryId"      INTEGER REFERENCES journal_entries(id),
  "ranBy"               INTEGER,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fx_revaluation_log_company_period
  ON fx_revaluation_log ("companyId", "periodId");

-- 5. Per-line FX detail — which monetary item produced which gain or
--    loss. Lets the operator drill from the dashboard summary into
--    "show me every invoice that contributed to the FX loss".
CREATE TABLE IF NOT EXISTS fx_revaluation_lines (
  id                    SERIAL PRIMARY KEY,
  "revaluationLogId"    INTEGER NOT NULL REFERENCES fx_revaluation_log(id) ON DELETE CASCADE,
  "entityType"          VARCHAR(40) NOT NULL,
  "entityId"            INTEGER NOT NULL,
  "originalCurrency"    CHAR(3) NOT NULL,
  "originalAmount"      NUMERIC(18,2) NOT NULL,
  "bookedRate"          NUMERIC(18,8) NOT NULL,
  "closingRate"         NUMERIC(18,8) NOT NULL,
  "gainLoss"            NUMERIC(18,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fx_revaluation_lines_entity
  ON fx_revaluation_lines ("entityType", "entityId");

COMMIT;
