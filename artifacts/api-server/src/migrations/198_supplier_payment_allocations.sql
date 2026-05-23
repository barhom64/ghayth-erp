-- 195_supplier_payment_allocations.sql
--
-- C4 + C5 — Vendor outstanding is wrong because payments don't link to
-- the obligation they pay.
--
-- The system has two AP obligation streams:
--   * purchase_orders  (suppliers)   — drives /reports/vendor-statement
--   * umrah_nusk_invoices            — drives /vendors/payables
-- Cash going out is a payment voucher (PV-* journal entry). Today nothing
-- ties a PV to the specific PO or Nusk invoice it settles, so:
--   * vendor-statement aging shows every PO as fully outstanding even
--     after a voucher cleared it, and
--   * /vendors/payables Nusk outstanding = totalAmount − refundAmount,
--     ignoring vouchers entirely.
--
-- Root fix: a single allocation table that ties a payment voucher (a
-- journal entry) to the obligations it pays. The obligation is polymorphic
-- (purchase_order | nusk_invoice | expense | manual) so the same table
-- serves both AP streams and any future obligation type.
--
-- A voucher with NO allocations behaves exactly as it does today — every
-- existing PV is untouched. Allocations are additive metadata.
--
-- Indexed for the two hot queries:
--   * by obligation (companyId, type, id) → "how much has been paid on
--     this PO/Nusk invoice?"
--   * by journalEntryId → "what does this voucher cover?"
--
-- @rollback:
--   DROP TABLE IF EXISTS supplier_payment_allocations;

CREATE TABLE IF NOT EXISTS public.supplier_payment_allocations (
    id serial PRIMARY KEY,
    "companyId" integer NOT NULL REFERENCES public.companies(id),
    "branchId" integer,
    "journalEntryId" integer NOT NULL REFERENCES public.journal_entries(id),
    "obligationType" varchar(30) NOT NULL
        CHECK ("obligationType" IN ('purchase_order','nusk_invoice','expense','manual')),
    "obligationId" integer NOT NULL,
    amount numeric(15,2) NOT NULL CHECK (amount > 0),
    notes text,
    "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
    "createdBy" integer,
    "deletedAt" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_spa_obligation
    ON public.supplier_payment_allocations ("companyId", "obligationType", "obligationId")
    WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_spa_journal
    ON public.supplier_payment_allocations ("journalEntryId");
