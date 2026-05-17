-- 172_fx_realized_postings_tranche_safe.sql
-- Task #270 — make fx_realized_postings tranche-safe.
--
-- The original unique key (companyId, invoiceId, paymentDate,
-- settlementRate) collapses two same-day same-rate partial payments
-- into one audit row. Add journalEntryId to the unique tuple so each
-- payment journal gets its own audit entry while still preventing a
-- true duplicate (same journal posted twice).

BEGIN;

DROP INDEX IF EXISTS uq_fx_realized_postings_triple;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_realized_postings_quad
  ON fx_realized_postings ("companyId", "invoiceId", "paymentDate", "settlementRate", "journalEntryId");

COMMIT;
