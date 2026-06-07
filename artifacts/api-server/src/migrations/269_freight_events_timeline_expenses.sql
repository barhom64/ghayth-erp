-- 269_freight_events_timeline_expenses.sql
--
-- @policy:breaking — the migration ALTERs three existing tables to add
-- CHECK constraints via DROP+ADD (so the constraints get a stable
-- predictable name). The ADD INSIDE the same transaction means there
-- is no rolling-deploy window where the table is constraint-less; new
-- rows from old code (which doesn't set the new columns) pass because
-- the constraints allow NULL.
--
-- @rollback:
--   DROP TABLE IF EXISTS public.transport_intake_rules;
--   DROP TABLE IF EXISTS public.fleet_expense_rules;
--   ALTER TABLE public.fleet_traffic_violations
--     DROP COLUMN IF EXISTS "liabilityParty",
--     DROP COLUMN IF EXISTS "accountingTreatment",
--     DROP COLUMN IF EXISTS rechargeable,
--     DROP COLUMN IF EXISTS "billToCustomer",
--     DROP COLUMN IF EXISTS "customerBillableAmount",
--     DROP COLUMN IF EXISTS "linkedExpenseId";
--   ALTER TABLE public.fleet_maintenance
--     DROP COLUMN IF EXISTS "liabilityParty",
--     DROP COLUMN IF EXISTS "accountingTreatment",
--     DROP COLUMN IF EXISTS rechargeable,
--     DROP COLUMN IF EXISTS "billToCustomer",
--     DROP COLUMN IF EXISTS "customerBillableAmount",
--     DROP COLUMN IF EXISTS "linkedExpenseId";
--   ALTER TABLE public.fleet_fuel_logs
--     DROP COLUMN IF EXISTS "liabilityParty",
--     DROP COLUMN IF EXISTS "accountingTreatment",
--     DROP COLUMN IF EXISTS rechargeable,
--     DROP COLUMN IF EXISTS "billToCustomer",
--     DROP COLUMN IF EXISTS "customerBillableAmount",
--     DROP COLUMN IF EXISTS "linkedExpenseId";
--
-- #1733 Final-gap closures from the audit (5 items):
--
--   1. Three-bucket expense reclassification (Comment 7) — adds the
--      classification columns to the three existing fleet expense
--      surfaces (fuel_logs, maintenance, traffic_violations). Per
--      Comment 6's reversal the Intake Engine is NOT for expenses,
--      so this just enriches the existing rows with:
--        • accountingTreatment (direct_expense | capitalized_asset_improvement | deferred_expense)
--        • rechargeable (boolean — operator can pass through to customer)
--        • billToCustomer (the actual customerId, if rechargeable)
--        • customerBillableAmount (override of raw cost when re-billed)
--        • linkedExpenseId (for compound expenses — chained back to parent)
--        • liabilityParty (company | driver | customer | third_party | insurance | unknown)
--
--   2. fleet_expense_rules — the rules engine for default accounting
--      treatment + cost-centre routing. Operators tag a fuel station
--      as "customer-rechargeable by default" once; every later fuel_log
--      from that station gets the right flags.
--
--   3. transport_intake_rules — the Comment-5 / Comment-6-amended
--      Intake Engine. Per Comment 6: drives TRIP/SERVICE capture, not
--      expenses. Maps (operationType, serviceType) tuples to the
--      defaults (requiredVehicleType, requiredLicenseClass,
--      defaultCostCenter, requiresAttachment, requiresApproval,
--      createsBookingDraft, createsBillingCandidate).
--
--   4. (operational timeline) — no schema, served by the new GET
--      /cargo/:id/timeline endpoint reading audit_logs + event_logs.
--
--   5. (named freight events catalog) — no schema, a TypeScript const
--      in lib/fleet/freightEvents.ts.

BEGIN;

-- 1. Three-bucket expense columns on the three existing fleet surfaces.
DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['fleet_fuel_logs', 'fleet_maintenance', 'fleet_traffic_violations']
  LOOP
    EXECUTE format('
      ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS "accountingTreatment"     text,
        ADD COLUMN IF NOT EXISTS rechargeable              boolean DEFAULT false NOT NULL,
        ADD COLUMN IF NOT EXISTS "billToCustomer"          integer,
        ADD COLUMN IF NOT EXISTS "customerBillableAmount"  numeric(14,2),
        ADD COLUMN IF NOT EXISTS "linkedExpenseId"         integer,
        ADD COLUMN IF NOT EXISTS "liabilityParty"          text', tbl);
  END LOOP;
END $$;

-- Constraint helpers (one per table because the CHECK can't be DO-blocked).
ALTER TABLE public.fleet_fuel_logs
  DROP CONSTRAINT IF EXISTS fleet_fuel_logs_acct_treatment_check;
ALTER TABLE public.fleet_fuel_logs
  ADD CONSTRAINT fleet_fuel_logs_acct_treatment_check CHECK (
    "accountingTreatment" IS NULL OR "accountingTreatment" = ANY (ARRAY[
      'direct_expense', 'capitalized_asset_improvement', 'deferred_expense'
    ]::text[])
  );
ALTER TABLE public.fleet_fuel_logs
  DROP CONSTRAINT IF EXISTS fleet_fuel_logs_liability_check;
ALTER TABLE public.fleet_fuel_logs
  ADD CONSTRAINT fleet_fuel_logs_liability_check CHECK (
    "liabilityParty" IS NULL OR "liabilityParty" = ANY (ARRAY[
      'company', 'driver', 'customer', 'third_party', 'insurance', 'unknown'
    ]::text[])
  );

ALTER TABLE public.fleet_maintenance
  DROP CONSTRAINT IF EXISTS fleet_maintenance_acct_treatment_check;
ALTER TABLE public.fleet_maintenance
  ADD CONSTRAINT fleet_maintenance_acct_treatment_check CHECK (
    "accountingTreatment" IS NULL OR "accountingTreatment" = ANY (ARRAY[
      'direct_expense', 'capitalized_asset_improvement', 'deferred_expense'
    ]::text[])
  );
ALTER TABLE public.fleet_maintenance
  DROP CONSTRAINT IF EXISTS fleet_maintenance_liability_check;
ALTER TABLE public.fleet_maintenance
  ADD CONSTRAINT fleet_maintenance_liability_check CHECK (
    "liabilityParty" IS NULL OR "liabilityParty" = ANY (ARRAY[
      'company', 'driver', 'customer', 'third_party', 'insurance', 'unknown'
    ]::text[])
  );

ALTER TABLE public.fleet_traffic_violations
  DROP CONSTRAINT IF EXISTS fleet_traffic_violations_acct_treatment_check;
ALTER TABLE public.fleet_traffic_violations
  ADD CONSTRAINT fleet_traffic_violations_acct_treatment_check CHECK (
    "accountingTreatment" IS NULL OR "accountingTreatment" = ANY (ARRAY[
      'direct_expense', 'capitalized_asset_improvement', 'deferred_expense'
    ]::text[])
  );
ALTER TABLE public.fleet_traffic_violations
  DROP CONSTRAINT IF EXISTS fleet_traffic_violations_liability_check;
ALTER TABLE public.fleet_traffic_violations
  ADD CONSTRAINT fleet_traffic_violations_liability_check CHECK (
    "liabilityParty" IS NULL OR "liabilityParty" = ANY (ARRAY[
      'company', 'driver', 'customer', 'third_party', 'insurance', 'unknown'
    ]::text[])
  );

-- 2. fleet_expense_rules — default classification engine.
CREATE TABLE IF NOT EXISTS public.fleet_expense_rules (
  id                       SERIAL PRIMARY KEY,
  "companyId"              INTEGER NOT NULL,
  "branchId"               INTEGER,
  "ruleName"               TEXT NOT NULL,
  -- Match keys. Most-specific match wins (vehicleId > vehicleType > NULL).
  "expenseSource"          TEXT NOT NULL,        -- 'fuel_log' | 'maintenance' | 'traffic_violation'
  "vehicleId"              INTEGER,
  "vehicleType"            TEXT,
  "stationName"            TEXT,                 -- fuel-specific
  "maintenanceType"        TEXT,                 -- maintenance-specific
  "violationType"          TEXT,                 -- violation-specific
  -- Defaults to apply.
  "defaultAccountingTreatment" TEXT,             -- one of the three buckets
  "defaultRechargeable"    BOOLEAN DEFAULT false NOT NULL,
  "defaultLiabilityParty"  TEXT,
  "defaultCostCenterId"    INTEGER,
  "requiresApproval"       BOOLEAN DEFAULT false NOT NULL,
  priority                 INTEGER NOT NULL DEFAULT 0,
  "isActive"               BOOLEAN NOT NULL DEFAULT TRUE,
  notes                    TEXT,
  "createdBy"              INTEGER,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"              TIMESTAMPTZ,
  CONSTRAINT fleet_expense_rules_source_check CHECK (
    "expenseSource" = ANY (ARRAY['fuel_log', 'maintenance', 'traffic_violation']::text[])
  ),
  CONSTRAINT fleet_expense_rules_acct_check CHECK (
    "defaultAccountingTreatment" IS NULL OR "defaultAccountingTreatment" = ANY (ARRAY[
      'direct_expense', 'capitalized_asset_improvement', 'deferred_expense'
    ]::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_expense_rules_lookup
  ON public.fleet_expense_rules ("companyId", "expenseSource", "vehicleId", "isActive")
  WHERE "deletedAt" IS NULL;

-- 3. transport_intake_rules — Comment 5/6 Intake Engine for TRIP/SERVICE capture.
-- (Comment 6 explicitly walked back expenses from intake.) Drives the
-- top-level booking form's dynamic field visibility + defaults.
CREATE TABLE IF NOT EXISTS public.transport_intake_rules (
  id                       SERIAL PRIMARY KEY,
  "companyId"              INTEGER NOT NULL,
  "branchId"               INTEGER,
  "ruleName"               TEXT NOT NULL,
  -- Match keys.
  "operationType"          TEXT NOT NULL,      -- 'booking' | 'dispatch' | 'service_line'
  "transportServiceType"   TEXT NOT NULL,      -- same alphabet as cargo_manifests.transportServiceType
  "customerId"             INTEGER,
  "bookingSource"          TEXT,
  -- Defaults to apply when a row matches.
  "requiredVehicleType"    TEXT,
  "requiredLicenseClass"   TEXT,
  "defaultCostCenterId"    INTEGER,
  "requiresAttachment"     BOOLEAN DEFAULT false NOT NULL,
  "requiresApproval"       BOOLEAN DEFAULT false NOT NULL,
  "createsBookingDraft"    BOOLEAN DEFAULT false NOT NULL,
  "createsBillingCandidate" BOOLEAN DEFAULT false NOT NULL,
  priority                 INTEGER NOT NULL DEFAULT 0,
  "isActive"               BOOLEAN NOT NULL DEFAULT TRUE,
  notes                    TEXT,
  "createdBy"              INTEGER,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"              TIMESTAMPTZ,
  CONSTRAINT transport_intake_rules_op_check CHECK (
    "operationType" = ANY (ARRAY['booking', 'dispatch', 'service_line']::text[])
  ),
  CONSTRAINT transport_intake_rules_service_check CHECK (
    "transportServiceType" = ANY (ARRAY[
      'cargo_load', 'passenger_umrah', 'passenger_general',
      'equipment_rental', 'internal_transfer', 'other'
    ]::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_intake_rules_lookup
  ON public.transport_intake_rules ("companyId", "operationType", "transportServiceType", "customerId")
  WHERE "isActive" AND "deletedAt" IS NULL;

COMMIT;
