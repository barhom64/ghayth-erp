-- 231_goods_receipts_payment_runs_idempotency.sql
--
-- @rollback: DROP INDEX idx_goods_receipts_source_key;
--            DROP INDEX idx_payment_runs_source_key;
--            ALTER TABLE goods_receipts DROP COLUMN IF EXISTS "sourceKey";
--            ALTER TABLE payment_runs DROP COLUMN IF EXISTS "sourceKey";
--
-- Audit follow-through: two AP-cycle workflows can double-post on
-- retry today because their parent rows have no idempotency guard:
--
--   * GRN receipt (POST /purchase-orders/:id/receive) — INSERT
--     INTO goods_receipts happens BEFORE the JE post. If the JE
--     post succeeds but the response fails (timeout, container
--     restart), a client retry creates a NEW goods_receipts row
--     and a NEW JE (different sourceKey). The inventory count
--     gets credited twice for the same shipment.
--
--   * Payment run (POST /payment-runs) — same shape: payment_runs
--     row inserted, then payment_run_items, then JE. A failure
--     mid-flight leaves an orphan payment_runs row, and the next
--     retry creates a second cash outflow.
--
-- Adding a partial UNIQUE on a NULLABLE sourceKey column lets the
-- route compute a stable key from the request payload (po + receipt
-- date + line digest for GRN; numbering ref for payment-run) BEFORE
-- the INSERT, and the database rejects the duplicate INSERT with a
-- unique violation. Legacy rows that pre-date the column stay
-- NULL — the partial index doesn't enforce on those.

ALTER TABLE public.goods_receipts
  ADD COLUMN IF NOT EXISTS "sourceKey" varchar(128);

ALTER TABLE public.payment_runs
  ADD COLUMN IF NOT EXISTS "sourceKey" varchar(128);

CREATE UNIQUE INDEX IF NOT EXISTS idx_goods_receipts_source_key
  ON public.goods_receipts ("companyId", "sourceKey")
  WHERE "sourceKey" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_runs_source_key
  ON public.payment_runs ("companyId", "sourceKey")
  WHERE "sourceKey" IS NOT NULL;
