-- Realised-FX audit + idempotency table.
--
-- The helper at lib/fx/post-realized-journal.ts (#256) noted in its
-- header: "there's no `invoices.realizedFxJournalId` column today.
-- The route handler that calls this is responsible for tracking
-- whether a given invoice has already been realised". That's brittle
-- — a careless operator can post the same settlement twice and we'd
-- silently double-book the FX impact.
--
-- A single column on `invoices` isn't enough either, because one
-- invoice can be settled in multiple tranches at different rates
-- (partial payments) — each tranche legitimately needs its own
-- realised FX entry.
--
-- This audit table keys on (invoiceId, paymentDate, settlementRate)
-- so the same triple is idempotent (skipped) while different
-- triples post fresh entries. It also gives the dashboard a clean
-- "recent realised FX postings" view to render.
CREATE TABLE IF NOT EXISTS fx_realized_postings (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL REFERENCES companies(id),
  "invoiceId"       INTEGER NOT NULL REFERENCES invoices(id),
  "paymentDate"     DATE    NOT NULL,
  "settlementRate"  NUMERIC(18,8) NOT NULL,
  "journalEntryId"  INTEGER NOT NULL REFERENCES journal_entries(id),
  "gainLoss"        NUMERIC(18,2) NOT NULL,
  "postedBy"        INTEGER,
  "postedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotency key. Same (invoice, payment date, rate) = same
-- realisation event = one journal entry. Different rate or date =
-- different event = different entry.
CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_realized_postings_triple
  ON fx_realized_postings ("companyId", "invoiceId", "paymentDate", "settlementRate");

CREATE INDEX IF NOT EXISTS idx_fx_realized_postings_company_posted_at
  ON fx_realized_postings ("companyId", "postedAt" DESC);
