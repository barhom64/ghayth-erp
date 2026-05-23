-- 202_purchase_lines_dimensional_allocation.sql
--
-- @rollback: ALTER TABLE for each of the three tables DROP COLUMN for
--   every added column. Safe at any time — all new columns are NULLABLE
--   with sensible defaults; existing INSERTs continue to work and
--   approval / GRN posting tolerates them being absent.
--
-- Finance Line-Level Allocation — Phase 4 P1.
--
-- Migration 200 added dimensional fields to invoice_lines so revenue
-- recognition could split by (vehicle/property/project/season). This
-- migration does the same for the expense side: purchase_request_items,
-- purchase_order_items, and goods_receipt_items get the dimensional
-- + accounting fields so GRN posting can:
--
--   * route each line to the right account (Inventory vs Expense vs
--     Fixed Asset vs Project Cost vs Vehicle Cost vs Property
--     Maintenance vs Employee Custody vs Supplier Prepayment) based
--     on the new `lineTreatment` column
--   * carry vehicleId / propertyId / projectId / contractId /
--     assetId through to journal_lines (those columns landed on
--     journal_lines in migration 201)
--
-- `lineTreatment` is a string with a CHECK constraint so a typo
-- can't smuggle a new treatment into production. The allowed values
-- map 1:1 to the GRN posting switch:
--
--   inventory             → DR Inventory      / CR GRNI
--   expense               → DR Expense        / CR GRNI
--   fixed_asset           → DR Fixed Asset    / CR GRNI (+ asset registry)
--   project_cost          → DR Project Cost   / CR GRNI (+ projectId)
--   vehicle_cost          → DR Vehicle Cost   / CR GRNI (+ vehicleId)
--   property_maintenance  → DR Property Maint / CR GRNI (+ propertyId)
--   custody               → DR Employee Custody / CR GRNI (+ employeeId)
--   prepayment            → DR Supplier Prepayment / CR GRNI
--   service               → DR Service Expense / CR GRNI
--
-- All NULLABLE — back-compat with existing rows. lineTreatment defaults
-- to NULL (not 'inventory') so the GRN posting fallback explicitly
-- routes un-classified lines to a single configurable default rather
-- than silently picking inventory.

-- ── 1. goods_receipt_items ─────────────────────────────────────────────────
ALTER TABLE public.goods_receipt_items
  ADD COLUMN IF NOT EXISTS "accountId"            integer,
  ADD COLUMN IF NOT EXISTS "accountCode"          varchar(20),
  ADD COLUMN IF NOT EXISTS "costCenterId"         integer,
  ADD COLUMN IF NOT EXISTS "lineTreatment"        varchar(30),
  ADD COLUMN IF NOT EXISTS "activityType"         varchar(50),
  ADD COLUMN IF NOT EXISTS "projectId"            integer,
  ADD COLUMN IF NOT EXISTS "vehicleId"            integer,
  ADD COLUMN IF NOT EXISTS "propertyId"           integer,
  ADD COLUMN IF NOT EXISTS "unitId"               integer,
  ADD COLUMN IF NOT EXISTS "assetId"              integer,
  ADD COLUMN IF NOT EXISTS "employeeId"           integer,
  ADD COLUMN IF NOT EXISTS "driverId"             integer,
  ADD COLUMN IF NOT EXISTS "contractId"           integer,
  ADD COLUMN IF NOT EXISTS "productId"            integer,
  ADD COLUMN IF NOT EXISTS "taxCode"              varchar(20),
  ADD COLUMN IF NOT EXISTS "allocationRuleId"     integer,
  ADD COLUMN IF NOT EXISTS "allocationStatus"     varchar(20) DEFAULT 'unmapped',
  ADD COLUMN IF NOT EXISTS "dimensionJson"        jsonb,
  ADD COLUMN IF NOT EXISTS "manualOverrideReason" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'goods_receipt_items_line_treatment_check'
  ) THEN
    ALTER TABLE public.goods_receipt_items
      ADD CONSTRAINT goods_receipt_items_line_treatment_check
      CHECK ("lineTreatment" IS NULL OR "lineTreatment" IN (
        'inventory','expense','fixed_asset','project_cost','vehicle_cost',
        'property_maintenance','custody','prepayment','service'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_goods_receipt_items_treatment
  ON public.goods_receipt_items ("lineTreatment")
  WHERE "lineTreatment" IS NOT NULL;

-- ── 2. purchase_order_items ────────────────────────────────────────────────
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS "accountId"            integer,
  ADD COLUMN IF NOT EXISTS "accountCode"          varchar(20),
  ADD COLUMN IF NOT EXISTS "costCenterId"         integer,
  ADD COLUMN IF NOT EXISTS "lineTreatment"        varchar(30),
  ADD COLUMN IF NOT EXISTS "activityType"         varchar(50),
  ADD COLUMN IF NOT EXISTS "projectId"            integer,
  ADD COLUMN IF NOT EXISTS "vehicleId"            integer,
  ADD COLUMN IF NOT EXISTS "propertyId"           integer,
  ADD COLUMN IF NOT EXISTS "unitId"               integer,
  ADD COLUMN IF NOT EXISTS "assetId"              integer,
  ADD COLUMN IF NOT EXISTS "employeeId"           integer,
  ADD COLUMN IF NOT EXISTS "driverId"             integer,
  ADD COLUMN IF NOT EXISTS "contractId"           integer,
  ADD COLUMN IF NOT EXISTS "productId"            integer,
  ADD COLUMN IF NOT EXISTS "taxCode"              varchar(20),
  ADD COLUMN IF NOT EXISTS "allocationRuleId"     integer,
  ADD COLUMN IF NOT EXISTS "allocationStatus"     varchar(20) DEFAULT 'unmapped',
  ADD COLUMN IF NOT EXISTS "dimensionJson"        jsonb,
  ADD COLUMN IF NOT EXISTS "manualOverrideReason" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_line_treatment_check'
  ) THEN
    ALTER TABLE public.purchase_order_items
      ADD CONSTRAINT purchase_order_items_line_treatment_check
      CHECK ("lineTreatment" IS NULL OR "lineTreatment" IN (
        'inventory','expense','fixed_asset','project_cost','vehicle_cost',
        'property_maintenance','custody','prepayment','service'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_treatment
  ON public.purchase_order_items ("lineTreatment")
  WHERE "lineTreatment" IS NOT NULL;

-- ── 3. purchase_request_items ──────────────────────────────────────────────
ALTER TABLE public.purchase_request_items
  ADD COLUMN IF NOT EXISTS "accountId"            integer,
  ADD COLUMN IF NOT EXISTS "accountCode"          varchar(20),
  ADD COLUMN IF NOT EXISTS "costCenterId"         integer,
  ADD COLUMN IF NOT EXISTS "lineTreatment"        varchar(30),
  ADD COLUMN IF NOT EXISTS "activityType"         varchar(50),
  ADD COLUMN IF NOT EXISTS "projectId"            integer,
  ADD COLUMN IF NOT EXISTS "vehicleId"            integer,
  ADD COLUMN IF NOT EXISTS "propertyId"           integer,
  ADD COLUMN IF NOT EXISTS "unitId"               integer,
  ADD COLUMN IF NOT EXISTS "assetId"              integer,
  ADD COLUMN IF NOT EXISTS "employeeId"           integer,
  ADD COLUMN IF NOT EXISTS "driverId"             integer,
  ADD COLUMN IF NOT EXISTS "contractId"           integer,
  ADD COLUMN IF NOT EXISTS "taxCode"              varchar(20),
  ADD COLUMN IF NOT EXISTS "allocationRuleId"     integer,
  ADD COLUMN IF NOT EXISTS "allocationStatus"     varchar(20) DEFAULT 'unmapped',
  ADD COLUMN IF NOT EXISTS "dimensionJson"        jsonb,
  ADD COLUMN IF NOT EXISTS "manualOverrideReason" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_request_items_line_treatment_check'
  ) THEN
    ALTER TABLE public.purchase_request_items
      ADD CONSTRAINT purchase_request_items_line_treatment_check
      CHECK ("lineTreatment" IS NULL OR "lineTreatment" IN (
        'inventory','expense','fixed_asset','project_cost','vehicle_cost',
        'property_maintenance','custody','prepayment','service'
      ));
  END IF;
END $$;
