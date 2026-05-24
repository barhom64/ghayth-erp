-- 209_invoice_cogs_foundation.sql
--
-- @rollback:
--   ALTER TABLE public.invoice_lines DROP COLUMN "cogsAmount",
--                                    DROP COLUMN "cogsUnitCost",
--                                    DROP COLUMN "cogsPostedAt",
--                                    DROP COLUMN "cogsAllocationJson";
--   ALTER TABLE public.invoices       DROP COLUMN "cogsTotal",
--                                    DROP COLUMN "cogsJournalEntryId";
--   Safe at any time — every added column NULLABLE with 0/null
--   defaults; no behaviour change for existing rows.
--
-- Audit P1 #7 — COGS (Cost of Goods Sold) posting foundation.
--
-- When a customer invoice is approved, the GL today posts revenue
-- + AR + VAT but does NOT decrement inventory or charge COGS.
-- That leaves the income statement systematically OVERSTATED for
-- every traded company:
--
--   buy widget for 60 SAR → DR Inventory 60 / CR AP 60   (correct)
--   sell  for 100 + VAT  → DR AR 115 / CR Revenue 100 / CR VAT 15
--                          (no COGS line, no inventory credit) ← BUG
--
-- Right answer:
--                          DR AR 115 / CR Revenue 100 / CR VAT 15
--                          DR COGS  60 / CR Inventory 60
--
-- This migration is the FOUNDATION:
--   1. Per-line COGS snapshot on invoice_lines (amount + unitCost
--      + allocation breakdown so vendor returns / sales-return
--      reversals can reproduce which lots fed which sale).
--   2. Per-invoice rollup on invoices (total + JE pointer so the
--      ZATCA + FS reports can join one row instead of summing).
--
-- The actual «pick lots + post COGS lines» wiring in
-- finance-invoices.ts approve is a SEPARATE PR — keeps schema
-- review here focused on the data model. Mirrors the WHT pattern.
--
-- The picker already exists at src/lib/inventory/valuation/index.ts
-- (FIFO / LIFO / weighted-average). Default GL accounts come
-- from src/lib/gl/account-purposes.ts:
--   cogs_default      → 5100  (COGS expense)
--   inventory_asset   → 1400  (Inventory)
-- Operators override per company via accounting_mappings.

-- ── 1. invoice_lines — per-line COGS snapshot ────────────────────────────
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS "cogsAmount"         numeric(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cogsUnitCost"       numeric(14,4),
  ADD COLUMN IF NOT EXISTS "cogsPostedAt"       timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "cogsAllocationJson" jsonb;
-- cogsAllocationJson shape (filled by the picker):
--   [{ lotId: 12, quantity: 3, unitCost: 60, extendedCost: 180 }, …]
-- Lets sales-return reversal know exactly which lots to credit back
-- (FIFO + later returns must restore the SAME lot the sale consumed,
-- not whatever's oldest on hand at return time).

CREATE INDEX IF NOT EXISTS idx_invoice_lines_cogs_pending
  ON public.invoice_lines ("invoiceId")
  WHERE "cogsAmount" > 0 AND "cogsPostedAt" IS NULL;

-- ── 2. invoices — header rollup ───────────────────────────────────────────
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS "cogsTotal"          numeric(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cogsJournalEntryId" integer;
-- cogsJournalEntryId is intentionally a soft pointer (no FK) — the
-- canonical JE for the invoice is `journalEntryId`; this column is
-- the optional COGS-only sub-JE when the wiring posts COGS as a
-- separate entry (cleaner for reversal). When COGS lines are
-- merged into the main JE this stays NULL.

CREATE INDEX IF NOT EXISTS idx_invoices_cogs_posted
  ON public.invoices ("companyId", "cogsTotal")
  WHERE "cogsTotal" > 0 AND "deletedAt" IS NULL;

-- ── 3. accounting_mappings — seed cogs_default + inventory_asset ─────────
-- Idempotent: only inserts the operationType rows the company hasn't
-- already configured. The fallback codes (5100 / 1400) come from
-- src/lib/gl/account-purposes.ts and match the standard Saudi chart.
DO $$
DECLARE
  c          RECORD;
  cogs_id    integer;
  inv_id     integer;
BEGIN
  FOR c IN SELECT id FROM public.companies WHERE COALESCE(status,'active') = 'active' LOOP
    SELECT id INTO cogs_id FROM public.chart_of_accounts
      WHERE "companyId" = c.id AND code = '5100' AND "deletedAt" IS NULL LIMIT 1;
    SELECT id INTO inv_id  FROM public.chart_of_accounts
      WHERE "companyId" = c.id AND code = '1400' AND "deletedAt" IS NULL LIMIT 1;

    IF cogs_id IS NOT NULL AND inv_id IS NOT NULL THEN
      INSERT INTO public.accounting_mappings
        ("companyId","operationType","operationLabel",
         "debitAccountId","debitAccountCode",
         "creditAccountId","creditAccountCode","isActive")
      VALUES
        (c.id, 'cogs_default', 'تكلفة البضاعة المباعة',
         cogs_id, '5100', inv_id, '1400', true)
      ON CONFLICT ("companyId","operationType") DO NOTHING;
    END IF;
  END LOOP;
END$$;
