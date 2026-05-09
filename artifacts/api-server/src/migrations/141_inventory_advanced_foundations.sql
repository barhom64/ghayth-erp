-- 141_inventory_advanced_foundations.sql
-- Foundations for advanced inventory: lots with lifecycle, per-unit
-- serials, valuation method per product, and the cycle-count
-- workflow. Week 1 of the plan in docs/INVENTORY_ADVANCED_DESIGN.md.
--
-- Existing `warehouse_stock_batches` is left in place (the basic
-- batch tracker) — the new `warehouse_stock_lots` table coexists
-- with it during the migration. Once the new model is wired into
-- the route handlers, a future cleanup will fold the old table into
-- the new one.

BEGIN;

-- 1. Lot lifecycle. One row per receipt batch with status field.
CREATE TABLE IF NOT EXISTS warehouse_stock_lots (
  id                       SERIAL PRIMARY KEY,
  "companyId"              INTEGER NOT NULL REFERENCES companies(id),
  "productId"              INTEGER NOT NULL,
  "warehouseId"            INTEGER NOT NULL,
  "lotNumber"              VARCHAR(80) NOT NULL,
  quantity                 NUMERIC(14,3) NOT NULL DEFAULT 0,
  "originalQuantity"       NUMERIC(14,3) NOT NULL,
  "unitCost"               NUMERIC(14,4) NOT NULL DEFAULT 0,
  currency                 CHAR(3) NOT NULL DEFAULT 'SAR',
  "receivedDate"           DATE NOT NULL,
  "expiryDate"             DATE,
  "manufactureDate"        DATE,
  "supplierId"             INTEGER,
  "supplierLotRef"         VARCHAR(80),
  status                   VARCHAR(20) NOT NULL DEFAULT 'active',
  "qualityControlStatus"   VARCHAR(20) NOT NULL DEFAULT 'approved',
  "recallId"               INTEGER,
  "recalledAt"             TIMESTAMPTZ,
  "recalledBy"             INTEGER,
  "recallReason"           TEXT,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"              TIMESTAMPTZ,
  CONSTRAINT chk_lots_status
    CHECK (status IN ('active','quarantine','recalled','expired','disposed')),
  CONSTRAINT chk_lots_qc_status
    CHECK ("qualityControlStatus" IN ('pending','approved','rejected'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lots_company_product_warehouse_lotnum
  ON warehouse_stock_lots ("companyId", "productId", "warehouseId", "lotNumber")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_lots_picker
  ON warehouse_stock_lots ("companyId", "productId", "warehouseId", status, "receivedDate")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_lots_expiry
  ON warehouse_stock_lots ("expiryDate")
  WHERE status = 'active' AND "deletedAt" IS NULL;

-- 2. Per-unit serials. Only populated for products marked
--    `tracksSerials`. Status drives the warranty / repair flows.
CREATE TABLE IF NOT EXISTS warehouse_stock_serials (
  id                       SERIAL PRIMARY KEY,
  "companyId"              INTEGER NOT NULL REFERENCES companies(id),
  "productId"              INTEGER NOT NULL,
  "warehouseId"            INTEGER NOT NULL,
  "lotId"                  INTEGER REFERENCES warehouse_stock_lots(id),
  "serialNumber"           VARCHAR(80) NOT NULL,
  status                   VARCHAR(20) NOT NULL DEFAULT 'in_stock',
  "customerId"             INTEGER,
  "warrantyExpiresAt"      DATE,
  notes                    TEXT,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"              TIMESTAMPTZ,
  CONSTRAINT chk_serials_status
    CHECK (status IN ('in_stock','reserved','sold','returned','warranty_repair','scrapped'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_serials_company_serial
  ON warehouse_stock_serials ("companyId", "serialNumber")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_serials_product_status
  ON warehouse_stock_serials ("productId", status)
  WHERE "deletedAt" IS NULL;

-- 3. Per-product valuation method. NULL row means "use the company
--    default" — the route handler reads the company default on
--    miss. Average cost is recomputed by the lot-issue path each
--    time stock moves so reads are O(1).
CREATE TABLE IF NOT EXISTS product_valuation_settings (
  "productId"              INTEGER PRIMARY KEY,
  method                   VARCHAR(10) NOT NULL DEFAULT 'fifo',
  "avgUnitCost"            NUMERIC(14,4) NOT NULL DEFAULT 0,
  "lastCostUpdate"         TIMESTAMPTZ,
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_valuation_method
    CHECK (method IN ('fifo','lifo','average'))
);

-- 4. Cycle count workflow. Header + per-product variance lines.
CREATE TABLE IF NOT EXISTS warehouse_cycle_counts (
  id                       SERIAL PRIMARY KEY,
  "companyId"              INTEGER NOT NULL REFERENCES companies(id),
  "warehouseId"            INTEGER NOT NULL,
  "scheduledDate"          DATE NOT NULL,
  status                   VARCHAR(20) NOT NULL DEFAULT 'pending',
  "countedBy"              INTEGER,
  "reviewedBy"             INTEGER,
  "approvedBy"             INTEGER,
  "countedAt"              TIMESTAMPTZ,
  "reviewedAt"             TIMESTAMPTZ,
  "approvedAt"             TIMESTAMPTZ,
  notes                    TEXT,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_cycle_counts_status
    CHECK (status IN ('pending','in_progress','reviewed','approved','rejected'))
);
CREATE INDEX IF NOT EXISTS idx_cycle_counts_warehouse_status
  ON warehouse_cycle_counts ("warehouseId", status);

CREATE TABLE IF NOT EXISTS warehouse_cycle_count_lines (
  id                       SERIAL PRIMARY KEY,
  "cycleCountId"           INTEGER NOT NULL REFERENCES warehouse_cycle_counts(id) ON DELETE CASCADE,
  "productId"              INTEGER NOT NULL,
  "lotId"                  INTEGER REFERENCES warehouse_stock_lots(id),
  "systemQuantity"         NUMERIC(14,3) NOT NULL,
  "countedQuantity"        NUMERIC(14,3),
  variance                 NUMERIC(14,3) GENERATED ALWAYS AS
    (COALESCE("countedQuantity", 0) - "systemQuantity") STORED,
  "varianceValue"          NUMERIC(14,2),
  reason                   TEXT,
  "adjustmentJournalEntryId" INTEGER REFERENCES journal_entries(id),
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cycle_lines_cycle
  ON warehouse_cycle_count_lines ("cycleCountId");

-- 5. ABC classification snapshot — written by a monthly cron once
--    the analyser lands. Held here so the schema is ready when the
--    code is.
CREATE TABLE IF NOT EXISTS product_abc_classification (
  id                       SERIAL PRIMARY KEY,
  "companyId"              INTEGER NOT NULL REFERENCES companies(id),
  "productId"              INTEGER NOT NULL,
  period                   CHAR(7) NOT NULL,                 -- YYYY-MM
  category                 CHAR(1) NOT NULL,                 -- A | B | C
  "paretoShare"            NUMERIC(6,4) NOT NULL,            -- 0.0000 — 1.0000
  "paretoValue"            NUMERIC(18,2) NOT NULL,
  "reviewedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_abc_category CHECK (category IN ('A','B','C'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_abc_company_product_period
  ON product_abc_classification ("companyId", "productId", period);

COMMIT;
