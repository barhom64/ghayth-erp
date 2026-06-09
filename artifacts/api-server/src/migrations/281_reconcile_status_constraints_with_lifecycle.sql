-- 281_reconcile_status_constraints_with_lifecycle.sql
--
-- ROOT-CAUSE fix (#1594 — write-path review). Unified, not symptom-by-symptom.
--
-- @policy:breaking
--
-- PROBLEM (a whole bug class)
-- A row's status CHECK constraint must allow EVERY state the lifecycleEngine
-- can put the row in; otherwise the offending transition 500s at the DB. A
-- static cross-check of all 32 state machines against all status CHECK
-- constraints found two tables whose constraint is NARROWER than the machine
-- (and which each carry TWO conflicting status constraints, so the effective
-- allowed set is their intersection):
--   • purchase_orders — chk_purchase_orders_status rejects the lifecycle
--     states 'confirmed' (vendor-confirm route), 'sent', 'paid',
--     'payment_scheduled', 'invoice_matched', 'invoice_mismatch', 'cancelled',
--     'completed', … while purchase_orders_status_check rejects
--     'partially_received'/'returned'. The convert→PO 'pending' crash fixed
--     in 06fa0b6 was one symptom of this same root.
--   • hr_leave_requests — chk_hr_leave_requests_status rejects 'returned'
--     (the manager "return for revision" route) and 'completed'.
-- Confirmed route-reachable + live (a returned leave / a vendor-confirmed PO
-- both threw a constraint violation).
--
-- FIX
-- Replace the conflicting pair on each table with ONE constraint whose allowed
-- set is the strict SUPERSET of (every prior constraint value ∪ every lifecycle
-- state). The lifecycle state machine is the source of truth for valid states;
-- the DB guard must not be narrower than it. Existing rows already satisfy the
-- superset (verified), so this is non-destructive.
--
-- @rollback:
--   ALTER TABLE public.purchase_orders   DROP CONSTRAINT IF EXISTS chk_purchase_orders_status;
--   ALTER TABLE public.hr_leave_requests DROP CONSTRAINT IF EXISTS chk_hr_leave_requests_status;
--   ALTER TABLE public.purchase_orders   ADD CONSTRAINT chk_purchase_orders_status CHECK (status::text = ANY (ARRAY['draft','pending_approval','approved','rejected','returned','received','partially_received']::text[]));
--   ALTER TABLE public.hr_leave_requests ADD CONSTRAINT chk_hr_leave_requests_status CHECK (status::text = ANY (ARRAY['pending','stage1_approved','approved','rejected','cancelled']::text[]));

-- ── purchase_orders ────────────────────────────────────────────────────────
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS chk_purchase_orders_status;
ALTER TABLE public.purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_purchase_orders_status' AND conrelid='public.purchase_orders'::regclass) THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT chk_purchase_orders_status CHECK (
      status::text = ANY (ARRAY[
        'draft','pending','pending_approval','approved','rejected','returned',
        'received','partially_received','cancelled','confirmed','sent','paid',
        'payment_scheduled','invoice_matched','invoice_mismatch','completed',
        'ordered','delivered'
      ]::text[])
    );
  END IF;
END $$;

-- ── hr_leave_requests ──────────────────────────────────────────────────────
ALTER TABLE public.hr_leave_requests DROP CONSTRAINT IF EXISTS chk_hr_leave_requests_status;
ALTER TABLE public.hr_leave_requests DROP CONSTRAINT IF EXISTS hr_leave_requests_status_check;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_hr_leave_requests_status' AND conrelid='public.hr_leave_requests'::regclass) THEN
    ALTER TABLE public.hr_leave_requests ADD CONSTRAINT chk_hr_leave_requests_status CHECK (
      status::text = ANY (ARRAY[
        'pending','stage1_approved','approved','rejected','returned','cancelled','completed'
      ]::text[])
    );
  END IF;
END $$;
