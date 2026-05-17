-- Task #277: wire warehouse movements to lots/serials, add tracking flags
-- on products, pre-expiry alert configuration on warehouses, idempotency
-- table for the expiry-warning cron, header table for ABC-driven cycle
-- count plans, and backfill a single "DEFAULT" lot per (product, warehouse)
-- with current stock so the FE can show lot history starting today.

-- 1. Per-product tracking flags. Backwards compatible: existing products
--    with both flags FALSE behave like the legacy quantity-only model.
ALTER TABLE warehouse_products
  ADD COLUMN IF NOT EXISTS "tracksLots"    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "tracksSerials" BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Movements may now reference a specific lot and/or serial. Both
--    nullable so the legacy bulk-FIFO movement path keeps working.
ALTER TABLE warehouse_movements
  ADD COLUMN IF NOT EXISTS "lotId"    INTEGER REFERENCES warehouse_stock_lots(id),
  ADD COLUMN IF NOT EXISTS "serialId" INTEGER REFERENCES warehouse_stock_serials(id);

CREATE INDEX IF NOT EXISTS idx_warehouse_movements_lot
  ON warehouse_movements ("lotId") WHERE "lotId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_movements_serial
  ON warehouse_movements ("serialId") WHERE "serialId" IS NOT NULL;

-- 3. Per-warehouse pre-expiry alert thresholds (days before expiry).
--    Default = [30,60,90]. Operators can disable by setting [].
ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS "expiryAlertDays" JSONB NOT NULL DEFAULT '[30,60,90]'::jsonb;

-- 4. Idempotency log for the pre-expiry warning cron. One row per
--    (lotId, thresholdDays) so re-running the cron the same day is a
--    no-op and re-running it the next day only fires for newly crossed
--    thresholds.
CREATE TABLE IF NOT EXISTS lot_expiry_alerts (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "lotId"         INTEGER NOT NULL REFERENCES warehouse_stock_lots(id) ON DELETE CASCADE,
  "thresholdDays" INTEGER NOT NULL,
  "alertedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiryDate"    DATE NOT NULL,
  UNIQUE ("lotId", "thresholdDays")
);

CREATE INDEX IF NOT EXISTS idx_lot_expiry_alerts_company
  ON lot_expiry_alerts ("companyId", "alertedAt");

-- 5. Cycle-count plans. A plan is the parent of N scheduled cycle counts
--    that the ABC generator produced for a period. Each child cycle
--    count carries planId so the operator can see "plan #4 covered 12
--    counts, 9 done, 3 outstanding".
CREATE TABLE IF NOT EXISTS warehouse_cycle_count_plans (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "warehouseId"   INTEGER NOT NULL REFERENCES warehouses(id),
  period          TEXT NOT NULL,
  "planType"      TEXT NOT NULL DEFAULT 'abc',
  "scheduledCount" INTEGER NOT NULL DEFAULT 0,
  "createdBy"     INTEGER,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes           TEXT,
  UNIQUE ("companyId", "warehouseId", period, "planType")
);

ALTER TABLE warehouse_cycle_counts
  ADD COLUMN IF NOT EXISTS "planId" INTEGER REFERENCES warehouse_cycle_count_plans(id);

CREATE INDEX IF NOT EXISTS idx_warehouse_cycle_counts_plan
  ON warehouse_cycle_counts ("planId") WHERE "planId" IS NOT NULL;

-- 6. Backfill default lot per (product, warehouse) pair with non-zero
--    current stock so today's stock is visible as a lot row even before
--    the operator switches the product to tracksLots=TRUE.
INSERT INTO warehouse_stock_lots (
  "companyId", "productId", "warehouseId", "lotNumber",
  quantity, "originalQuantity", "unitCost", currency,
  "receivedDate", status, "qualityControlStatus"
)
SELECT
  wp."companyId",
  wp.id,
  COALESCE(w.id, (SELECT id FROM warehouses WHERE "companyId" = wp."companyId" ORDER BY id LIMIT 1)) AS "warehouseId",
  'DEFAULT-' || wp.id AS "lotNumber",
  wp."currentStock",
  wp."currentStock",
  COALESCE(wp."costPrice", 0),
  'SAR',
  CURRENT_DATE,
  'active',
  'approved'
FROM warehouse_products wp
LEFT JOIN warehouses w
  ON w."companyId" = wp."companyId" AND w."deletedAt" IS NULL
WHERE wp."deletedAt" IS NULL
  AND wp."currentStock" > 0
  AND NOT EXISTS (
    SELECT 1 FROM warehouse_stock_lots wsl
     WHERE wsl."productId" = wp.id
       AND wsl."lotNumber" = 'DEFAULT-' || wp.id
       AND wsl."deletedAt" IS NULL
  )
  AND EXISTS (SELECT 1 FROM warehouses w2 WHERE w2."companyId" = wp."companyId" AND w2."deletedAt" IS NULL)
ON CONFLICT DO NOTHING;
