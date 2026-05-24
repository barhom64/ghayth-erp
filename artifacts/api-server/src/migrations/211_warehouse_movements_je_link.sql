-- 211_warehouse_movements_je_link.sql
--
-- @rollback:
--   DROP INDEX IF EXISTS idx_warehouse_movements_je;
--   ALTER TABLE public.warehouse_movements
--     DROP COLUMN "journalEntryId";
--   Safe at any time — column is NULLABLE with no default; the
--   warehouse routes that pre-date the COGS campaign already INSERT
--   without it, so dropping is no-op for them.
--
-- Audit follow-up to the COGS campaign (#1002/#1013/#1017). Today
-- the stock movements written from the COGS planner carry
-- glStatus='posted' (the canonical signal that the GL part landed)
-- but NO pointer at the journal entry itself. So:
--
--   * an auditor inspecting a warehouse_movements row can't say
--     "this OUT was posted by JE #4242 — here are the offsetting
--     debits/credits";
--   * a reversal flow that wants to know "did the original sale
--     post a JE that's now been reversed?" has to scan SPA + JE
--     ref strings;
--   * downstream COGS reports that join movements ↔ entries are
--     forced to use the reference string match instead of a clean FK.
--
-- This column lets every COGS / return / receipt insertion stamp
-- the JE id at write time. No FK constraint (warehouse_movements
-- pre-dates the GL engine and not every consumer guarantees the
-- entry row exists at the time the movement is written — same
-- soft-pointer pattern as invoices.journalEntryId).

ALTER TABLE public.warehouse_movements
  ADD COLUMN IF NOT EXISTS "journalEntryId" integer;

CREATE INDEX IF NOT EXISTS idx_warehouse_movements_je
  ON public.warehouse_movements ("companyId", "journalEntryId")
  WHERE "journalEntryId" IS NOT NULL;
