-- 299_warehouse_products_item_type.sql
--
-- Schema-drift fix surfaced by the live warehouse journey: migration 203
-- added "itemType" (+ accounting routing columns) to the LEGACY `products`
-- table, but every /warehouse/products route reads/writes
-- `warehouse_products` — which never got the column. Consequences on any
-- environment built from the canonical schema:
--   * the POST /warehouse/movements non-stock guard silently no-ops
--     (SELECT * yields undefined → treated as 'product'), and
--   * ProductSelect's stockableOnly filter hides nothing, and
--   * the cycle-count snapshot (routes/warehouse-cycle-counts.ts) that
--     filters services out of counting throws 42703.
--
-- Additive and idempotent (IF NOT EXISTS); default 'product' preserves the
-- behavior of every existing row. Same enum as products."itemType" (203).
-- Rollback: ALTER TABLE warehouse_products DROP COLUMN "itemType";
ALTER TABLE warehouse_products
  ADD COLUMN IF NOT EXISTS "itemType" varchar(30) DEFAULT 'product';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_warehouse_products_item_type'
  ) THEN
    ALTER TABLE warehouse_products
      ADD CONSTRAINT chk_warehouse_products_item_type
      CHECK ("itemType" IS NULL OR "itemType" IN ('product','service','asset','consumable','digital'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_warehouse_products_item_type
  ON warehouse_products ("companyId", "itemType")
  WHERE "deletedAt" IS NULL;
