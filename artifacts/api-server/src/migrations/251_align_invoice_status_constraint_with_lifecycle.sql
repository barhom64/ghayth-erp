-- 251_align_invoice_status_constraint_with_lifecycle.sql
--
-- Operational-readiness P1 repair (issue #1594).
--
-- PROBLEM
-- The invoice lifecycle state machine (lib/lifecycleEngine.ts STATE_MACHINES,
-- entity "invoices") declares these forward states:
--   draft -> approved -> sent | posted | cancelled | rejected
--   posted -> paid | partial | overdue | cancelled | closed
--   returned (from draft/approved)
-- but the DB CHECK constraint `chk_invoices_status` (migration 084 + baseline
-- dump) only permitted:
--   draft, pending_approval, approved, sent, partially_paid, paid,
--   overdue, void, rejected, cancelled
-- It was MISSING: posted, partial, returned, closed.
--
-- Effect: `POST /api/finance/invoices/:id/post` always failed with
--   new row for relation "invoices" violates check constraint "chk_invoices_status"
-- i.e. invoices could be approved (GL entry created) but NEVER posted —
-- the finance posting journey was broken end-to-end on every database.
--
-- FIX
-- Replace the constraint with the union of the legacy values and the lifecycle
-- states so both the existing payment flow (partially_paid/void/pending_approval)
-- and the lifecycle posting flow (posted/partial/returned/closed) are valid.
-- Idempotent: DROP ... IF EXISTS then ADD.
--
-- This is a drop-and-WIDEN: every value the old (narrower) constraint accepted
-- is still accepted, so no existing row can fail and an older app version still
-- running during a rolling deploy is unaffected. The DROP is flagged by the
-- migration-policy guard only because it cannot distinguish drop-and-widen from
-- drop-and-remove — it is acknowledged as safe here (same pattern as
-- 189_purchase_orders_status_add_mismatch_scheduled.sql).
--
-- @policy:breaking
-- @rollback:
--   ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_status;
--   ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_status CHECK (
--     (status)::text = ANY (ARRAY['draft','pending_approval','approved','sent',
--       'partially_paid','paid','overdue','void','rejected','cancelled']::text[]));
--   (restores the narrower list — safe only once no invoice carries status
--    'posted', 'partial', 'returned' or 'closed').

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS chk_invoices_status;

ALTER TABLE public.invoices ADD CONSTRAINT chk_invoices_status CHECK (
  (status)::text = ANY (ARRAY[
    -- legacy / payment-flow states (preserved for backward compatibility)
    'draft', 'pending_approval', 'approved', 'sent',
    'partially_paid', 'paid', 'overdue', 'void', 'rejected', 'cancelled',
    -- lifecycle-engine posting-flow states (the missing ones)
    'posted', 'partial', 'returned', 'closed'
  ]::text[])
);
