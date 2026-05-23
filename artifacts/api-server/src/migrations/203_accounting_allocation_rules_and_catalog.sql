-- 203_accounting_allocation_rules_and_catalog.sql
--
-- @rollback:
--   DROP TABLE public.accounting_allocation_results;
--   DROP TABLE public.accounting_allocation_rules;
--   ALTER TABLE public.products DROP COLUMN for each of the 12 added.
--   ALTER TABLE public.cost_centers DROP COLUMN for each of the 5 added.
--   Safe at any time — no other table FKs these tables yet, and the
--   added product/cost-center columns are NULLABLE.
--
-- Finance Line-Level Allocation — Phase 5 P1.
--
-- The two new tables drive the centralised resolver
-- (accountingAllocation.resolveLineAllocation) that will land in
-- Phase 5.2: rules decide which account / cost centre / required
-- dimensions apply to a given (documentType, lineType, entityType)
-- tuple, and results record the actual resolution outcome per line
-- for audit + drilldown.
--
-- Until the resolver lands, the tables are unreferenced by route
-- code — they exist so tenants can start authoring rules and
-- products in the UI without a follow-up migration.

-- ── 1. accounting_allocation_rules ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accounting_allocation_rules (
    id                  serial PRIMARY KEY,
    "companyId"         integer NOT NULL,
    name                varchar(200) NOT NULL,
    "documentType"      varchar(40) NOT NULL,    -- invoice|purchase|grn|expense|...
    "lineType"          varchar(40),             -- product|service|asset|fuel|rent|...
    "activityType"      varchar(50),
    "entityType"        varchar(40),             -- client|supplier|vehicle|property|...
    "conditionsJson"    jsonb,                   -- extra match conditions (e.g. product.category = 'fuel')
    "debitAccountId"    integer,
    "creditAccountId"   integer,
    "revenueAccountId"  integer,
    "expenseAccountId"  integer,
    "assetAccountId"    integer,
    "inventoryAccountId" integer,
    "vatAccountId"      integer,
    "costCenterStrategy" varchar(40),            -- from_vehicle|from_property|from_project|explicit|none
    "dimensionStrategyJson" jsonb,               -- e.g. {"vehicleId":"from_line","projectId":"from_header"}
    "autoCreateMissing" boolean DEFAULT false,   -- create cost_centers/subsidiary accounts on demand
    "requiresEntityLink" boolean DEFAULT false,
    priority            integer DEFAULT 100,     -- lower = higher priority (matched first)
    "isActive"          boolean DEFAULT true,
    "createdAt"         timestamp with time zone DEFAULT now(),
    "updatedAt"         timestamp with time zone DEFAULT now(),
    "deletedAt"         timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_allocation_rules_match
  ON public.accounting_allocation_rules
  ("companyId", "documentType", "lineType", priority)
  WHERE "deletedAt" IS NULL AND "isActive" = true;

CREATE INDEX IF NOT EXISTS idx_allocation_rules_company
  ON public.accounting_allocation_rules ("companyId")
  WHERE "deletedAt" IS NULL;

-- ── 2. accounting_allocation_results ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accounting_allocation_results (
    id                    serial PRIMARY KEY,
    "companyId"           integer NOT NULL,
    "sourceTable"         varchar(64) NOT NULL,  -- invoice_lines | purchase_order_items | ...
    "sourceLineId"        integer NOT NULL,
    "documentType"        varchar(40),
    "resolvedAccountId"   integer,
    "resolvedAccountCode" varchar(20),
    "costCenterId"        integer,
    "dimensionsJson"      jsonb,
    "ruleId"              integer,
    "resolutionStatus"    varchar(20) DEFAULT 'resolved',  -- resolved | unmapped | manual_override | failed
    "warningsJson"        jsonb,
    "resolvedBy"          integer,
    "resolvedAt"          timestamp with time zone DEFAULT now(),
    "manualOverrideBy"    integer,
    "manualOverrideReason" text,
    "createdAt"           timestamp with time zone DEFAULT now()
);

-- One result per source line (the resolver UPSERTs on resolution).
CREATE UNIQUE INDEX IF NOT EXISTS uq_allocation_results_source_line
  ON public.accounting_allocation_results ("sourceTable", "sourceLineId", "companyId");

CREATE INDEX IF NOT EXISTS idx_allocation_results_status
  ON public.accounting_allocation_results ("companyId", "resolutionStatus")
  WHERE "resolutionStatus" != 'resolved';

-- ── 3. cost_centers — link the cost centre to its source entity ────────────
--
-- The existing schema has relatedEntityType/relatedEntityId but no
-- linkedEntityType/linkedEntityId per the spec naming. Add them as
-- aliases (NOT a rename — keep the old fields working) plus a few
-- governance fields.
ALTER TABLE public.cost_centers
  ADD COLUMN IF NOT EXISTS "linkedEntityType"  varchar(40),
  ADD COLUMN IF NOT EXISTS "linkedEntityId"    integer,
  ADD COLUMN IF NOT EXISTS "isActive"          boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS "deletedAt"         timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "autoCreatedBy"     integer,
  ADD COLUMN IF NOT EXISTS "autoCreatedReason" text;

CREATE INDEX IF NOT EXISTS idx_cost_centers_linked_entity
  ON public.cost_centers ("companyId", "linkedEntityType", "linkedEntityId")
  WHERE "linkedEntityType" IS NOT NULL AND "deletedAt" IS NULL;

-- ── 4. products — default accounting routing per catalog item ──────────────
--
-- A tenant authoring a service like "نقل رمل" should be able to say
-- once: "this routes to revenue account X, requires a vehicle, cost
-- centre comes from the vehicle". Then every invoice line that picks
-- the product gets pre-filled without operator effort.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS "itemType"                 varchar(30) DEFAULT 'product',
  ADD COLUMN IF NOT EXISTS "defaultRevenueAccountId"  integer,
  ADD COLUMN IF NOT EXISTS "defaultExpenseAccountId"  integer,
  ADD COLUMN IF NOT EXISTS "defaultInventoryAccountId" integer,
  ADD COLUMN IF NOT EXISTS "defaultAssetAccountId"    integer,
  ADD COLUMN IF NOT EXISTS "defaultTaxCode"           varchar(20),
  ADD COLUMN IF NOT EXISTS "defaultActivityType"      varchar(50),
  ADD COLUMN IF NOT EXISTS "requiresVehicle"          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requiresProperty"         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requiresProject"          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requiresContract"         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requiresUmrahAgent"       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requiresUmrahSeason"      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "defaultCostCenterStrategy" varchar(40),
  ADD COLUMN IF NOT EXISTS "allowedDocumentTypes"     jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_item_type_check'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_item_type_check
      CHECK ("itemType" IS NULL OR "itemType" IN (
        'product','service','asset','consumable','digital'
      ));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_item_type
  ON public.products ("companyId", "itemType")
  WHERE "isActive" = true;
