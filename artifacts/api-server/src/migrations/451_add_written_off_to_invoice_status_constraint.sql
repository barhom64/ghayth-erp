-- 451_add_written_off_to_invoice_status_constraint.sql
--
-- Bad-debt write-off automation (البند ٢، الدفعة ١ — اعتماد إبراهيم 2026-06-30).
--
-- @policy:breaking
--
-- PROBLEM
-- The bad-debt write-off flow (batch 2) marks an uncollectable receivable
-- `UPDATE invoices SET status = 'written_off'` — a terminal state distinct from
-- cancelled/void — so the invoice drops out of AR aging and the allowance
-- write-off (DR 1135 المخصص / CR 1111 الذمم) is recorded against it. The current
-- chk_invoices_status (set by 251, widened by 282 for 'amended') does NOT allow
-- 'written_off', so the write-off UPDATE would violate the constraint and 500 —
-- the same class of gap closed by 251/282.
--
-- FIX
-- Add 'written_off' to the allowed set (strict superset of the current 15 values;
-- existing rows unaffected). This migration ONLY opens the constraint — nothing
-- writes the status until batch 2 (the human-approved write-off posting), so it
-- is inert on its own.
--
-- @rollback:
--   ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_status;
--   ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_status CHECK (status::text = ANY (ARRAY['draft','pending_approval','approved','sent','partially_paid','paid','overdue','void','rejected','cancelled','posted','partial','returned','closed','amended']::text[]));

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_status;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_invoices_status' AND conrelid='public.invoices'::regclass) THEN
    ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_status CHECK (
      status::text = ANY (ARRAY[
        'draft','pending_approval','approved','sent','partially_paid','paid',
        'overdue','void','rejected','cancelled','posted','partial','returned',
        'closed','amended','written_off'
      ]::text[])
    );
  END IF;
END $$;
