-- Migration 189: widen chk_purchase_orders_status to allow the
-- `invoice_mismatch` and `payment_scheduled` statuses.
--
-- RCA finding FIN-002 (docs/audit/SYSTEM_INVENTORY_MATRIX.md).
-- The purchasing flow transitions a purchase order to:
--   * `invoice_mismatch`   — set by the 3-way-match handler when the
--                            supplier invoice disagrees with the GRN
--                            (routes/finance-purchase.ts match-invoice)
--   * `payment_scheduled`  — set by schedule-payment
-- but chk_purchase_orders_status (migration 084) never listed either
-- value. Every such transition aborts with Postgres SQLSTATE 23514
-- (check_violation). In schedule-payment the GL journal entry is posted
-- *before* the status transition, so the failing transition rolls back
-- to a purchase order with no scheduled-payment status while the journal
-- entry has already committed — an orphan GL row (FIN-003). Allowing the
-- two statuses removes the constraint rejection that triggers it.
--
-- This re-creates the constraint with the two missing values appended to
-- migration 084's list. The change is purely WIDENING: every status the
-- old (narrower) constraint accepted is still accepted, so no existing
-- row can fail the new constraint and an older app version still running
-- during a rolling deploy is unaffected. The DROP below is flagged by the
-- migration-policy guard only because it cannot distinguish a
-- drop-and-widen from a drop-and-remove — it is acknowledged as safe.
--
-- @policy:breaking
-- @rollback:
--   ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS chk_purchase_orders_status;
--   ALTER TABLE purchase_orders ADD CONSTRAINT chk_purchase_orders_status
--     CHECK (status IN ('draft','pending','pending_approval','approved','rejected','returned','received','partially_received','partial_received','cancelled','completed','paid','confirmed','ordered','delivered','sent','invoice_matched'));
--   (restores migration 084's narrower list — safe only once no row carries
--    status 'invoice_mismatch' or 'payment_scheduled').

ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_status_check;
ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS chk_purchase_orders_status;
DO $$ BEGIN
  ALTER TABLE purchase_orders
    ADD CONSTRAINT chk_purchase_orders_status
    CHECK (status IN ('draft','pending','pending_approval','approved','rejected','returned','received','partially_received','partial_received','cancelled','completed','paid','confirmed','ordered','delivered','sent','invoice_matched','invoice_mismatch','payment_scheduled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
