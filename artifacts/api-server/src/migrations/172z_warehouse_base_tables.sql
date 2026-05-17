-- Migration 172z: prerequisite tables for 173_inventory_movement_lot_serial.sql
--
-- Migration 173 references `warehouses(id)` (FK) and
-- `warehouse_stock_serials(id)` (FK) but never creates them. It was therefore
-- failing on every boot with `relation "warehouse_stock_serials" does not exist`
-- and skipping silently in dev mode (see lib/migrate.ts). Without these tables,
-- routes/warehouse-advanced.ts (serials, cycle-counts, plans) returns 500 for
-- every call.
--
-- This file runs before 173 (alphabetic sort: `172z` < `173`) and creates the
-- two missing parent tables. 173 then layers `expiryAlertDays`, `planId`,
-- and the lots backfill on top.

-- ─── warehouses ───────────────────────────────────────────────────────────
-- Used as parent for warehouse_stock_lots, warehouse_cycle_counts,
-- warehouse_stock_serials, warehouse_cycle_count_plans (all reference
-- warehouseId). Migration 173 also adds expiryAlertDays JSONB to it.
CREATE TABLE IF NOT EXISTS warehouses (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER     NOT NULL,
  "branchId"    INTEGER,
  name          TEXT        NOT NULL,
  code          TEXT,
  location      TEXT,
  status        TEXT        NOT NULL DEFAULT 'active',
  notes         TEXT,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_warehouses_company ON warehouses ("companyId");
CREATE INDEX IF NOT EXISTS idx_warehouses_branch  ON warehouses ("branchId");
CREATE INDEX IF NOT EXISTS idx_warehouses_active  ON warehouses ("companyId") WHERE "deletedAt" IS NULL;

-- ─── warehouse_stock_serials ──────────────────────────────────────────────
-- Per-unit serial tracking. Columns derived from warehouse-advanced.ts:
--   SELECT  (line 218-220): id, serialNumber, productId, lotId, status,
--           warrantyExpiry, currentLocation, soldToCustomerId, soldDate
--   INSERT  (line 261-265): companyId, productId, warehouseId, serialNumber,
--           lotId, status, warrantyExpiresAt, notes
--   UPDATE  (line 295-300): status, customerId, notes
CREATE TABLE IF NOT EXISTS warehouse_stock_serials (
  id                  SERIAL PRIMARY KEY,
  "companyId"         INTEGER     NOT NULL,
  "branchId"          INTEGER,
  "productId"         INTEGER     NOT NULL REFERENCES warehouse_products(id),
  "warehouseId"       INTEGER     NOT NULL REFERENCES warehouses(id),
  "serialNumber"      TEXT        NOT NULL,
  "lotId"             INTEGER     REFERENCES warehouse_stock_lots(id),
  status              TEXT        NOT NULL DEFAULT 'in_stock',
  "warrantyExpiresAt" DATE,
  "warrantyExpiry"    DATE,
  "currentLocation"   TEXT,
  "soldToCustomerId"  INTEGER,
  "customerId"        INTEGER,
  "soldDate"          DATE,
  notes               TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"         TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_warehouse_stock_serials_company_serial
  ON warehouse_stock_serials ("companyId", "serialNumber") WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_serials_product   ON warehouse_stock_serials ("productId");
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_serials_warehouse ON warehouse_stock_serials ("warehouseId");
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_serials_lot       ON warehouse_stock_serials ("lotId");
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_serials_status    ON warehouse_stock_serials ("companyId", status);
