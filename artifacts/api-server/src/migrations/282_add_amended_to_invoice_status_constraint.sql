-- 282_add_amended_to_invoice_status_constraint.sql
--
-- Operational-readiness fix (#1594 — write-path review).
--
-- @policy:breaking
--
-- PROBLEM
-- POST /finance/invoices/:id/amend marks the original invoice
-- `UPDATE invoices SET status = 'amended'` (a terminal state distinct from
-- cancelled), but chk_invoices_status does not allow 'amended', so amending
-- ANY invoice 500'd with a constraint violation. Same class as migration 251
-- (which had to widen the same constraint for posted/partial/returned/closed)
-- and 281 (lifecycle ↔ constraint reconciliation) — here the rejected state is
-- written directly by a route rather than the lifecycle machine.
-- (The amend path also referenced three non-existent columns — invoices.date,
-- invoice_lines.total, invoice_lines.branchId in the COGS reversal — fixed in
-- the accompanying code change; this migration closes the status-constraint
-- gap so the whole amend flow completes.)
--
-- FIX
-- Add 'amended' to the allowed set (strict superset of the current 14 values;
-- existing rows unaffected).
--
-- @rollback:
--   ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_status;
--   ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_status CHECK (status::text = ANY (ARRAY['draft','pending_approval','approved','sent','partially_paid','paid','overdue','void','rejected','cancelled','posted','partial','returned','closed']::text[]));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_status;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_invoices_status' AND conrelid='public.invoices'::regclass) THEN
    ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_status CHECK (
      status::text = ANY (ARRAY[
        'draft','pending_approval','approved','sent','partially_paid','paid',
        'overdue','void','rejected','cancelled','posted','partial','returned',
        'closed','amended'
      ]::text[])
    );
  END IF;
END $$;
