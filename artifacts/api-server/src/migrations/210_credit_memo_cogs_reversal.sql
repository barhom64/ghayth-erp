-- 210_credit_memo_cogs_reversal.sql
--
-- @rollback:
--   ALTER TABLE public.credit_memos   DROP COLUMN "cogsReversedTotal",
--                                     DROP COLUMN "cogsJournalEntryId";
--   ALTER TABLE public.invoice_lines  DROP COLUMN "cogsReversedAmount",
--                                     DROP COLUMN "cogsReversedAt",
--                                     DROP COLUMN "cogsReversalJson";
--   Safe at any time — every added column NULLABLE with 0/null
--   defaults; no behaviour change for existing rows.
--
-- Audit follow-up to #1002/#1013 — COGS reversal on credit memo.
--
-- When a customer returns goods (credit memo), the COGS we posted on
-- the original invoice approval must be reversed with the SAME lots
-- the sale consumed. Otherwise the inventory restocks at whatever's
-- "currently oldest" → margin reports drift + auditors flag the
-- restock-at-wrong-cost pattern.
--
-- The original allocation lives on invoice_lines.cogsAllocationJson
-- (#1002). For a full credit memo we restore 100 % of those lots;
-- for a partial credit memo we restore proportionally
-- (creditAmount / invoice.total). Per-line UPDATE tracks the
-- cumulative reversal so a second / third partial memo can't
-- over-reverse.
--
-- Schema-only here. Wiring in finance-invoices.ts credit-memo
-- handler is a sibling diff in the same PR (planCogsReversal +
-- applyStockReversals).

-- ── 1. credit_memos rollup ────────────────────────────────────────────────
ALTER TABLE public.credit_memos
  ADD COLUMN IF NOT EXISTS "cogsReversedTotal"  numeric(18,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cogsJournalEntryId" integer;
-- cogsJournalEntryId is intentionally a soft pointer (no FK). The
-- canonical JE for the memo is `journalId`; this column is the
-- optional COGS-only sub-JE when reversal is posted separately.
-- When the reversal lines are merged into the main memo JE this
-- stays NULL (the default for the current wiring).

CREATE INDEX IF NOT EXISTS idx_credit_memos_cogs_reversed
  ON public.credit_memos ("companyId", "cogsReversedTotal")
  WHERE "cogsReversedTotal" > 0;

-- ── 2. invoice_lines cumulative reversal tracker ─────────────────────────
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS "cogsReversedAmount" numeric(18,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "cogsReversedAt"     timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "cogsReversalJson"   jsonb;
-- cogsReversalJson shape (filled by the reversal planner):
--   [{ memoId: 7, ratio: 0.5,
--      reversedAt: '2025-…',
--      allocations: [{ lotId, quantity, unitCost, extendedCost }] }, …]
-- One entry per memo that touched this line — lets a second memo
-- inspect what's already been restored and reverse only the
-- remainder. Append-only; never edited.

CREATE INDEX IF NOT EXISTS idx_invoice_lines_cogs_partially_reversed
  ON public.invoice_lines ("invoiceId")
  WHERE "cogsReversedAmount" > 0;
