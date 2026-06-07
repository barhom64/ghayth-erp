-- 265_foundation_15state_billing.sql
--
-- @policy:breaking — narrows the cargo_manifests.status domain via DROP+ADD
-- inside one BEGIN/COMMIT. New code only writes the new alphabet.
--
-- @rollback:
--   ALTER TABLE cargo_manifests DROP CONSTRAINT IF EXISTS cargo_manifests_status_check;
--   ALTER TABLE cargo_manifests ADD CONSTRAINT cargo_manifests_status_check
--     CHECK (status IN ('draft','requested','approved','assigned_to_driver',
--                       'driver_accepted','trip_started','arrived_pickup','loaded',
--                       'in_transit','arrived_delivery','delivered','completed','cancelled'));
--   ALTER TABLE cargo_manifests
--     DROP COLUMN IF EXISTS "billingStatus",
--     DROP COLUMN IF EXISTS "transportServiceType";
--   DROP TABLE IF EXISTS public.transport_service_lines;
--
-- #1733 Foundation tier — bridges the operational world (Blocker #3's
-- 13-state lifecycle) to the financial world (Blocker #1's billing
-- candidate handoff). Three concerns:
--
--   1. Two new lifecycle states bring the 13-state cargo machine up to
--      the 15 states the freshest #1733 comment chain demands:
--        completed → ready_for_invoice → financially_closed
--      `ready_for_invoice` is the dispatcher's "this load is good for
--      finance" signal — until that flips, the billing-candidate handoff
--      does NOT fire. `financially_closed` is the terminal post-invoice
--      state (set by the accountant's materialize action).
--
--   2. `billingStatus` + `transportServiceType` columns on cargo_manifests
--      give the operator the read-only finance badge the driver / dispatcher
--      UI shows ("not billable | ready for accounting | under review |
--      invoiced | excluded"), and the per-row service classification the
--      accountant filters / groups invoicing by.
--
--   3. `transport_service_lines` — the operational-to-billable bridge.
--      Every manifest (or umrah_transport row, or generic fleet_trip)
--      that enters `ready_for_invoice` writes one row here carrying the
--      per-line billable facts (quantity, unitOfMeasure, unitPrice,
--      lineTotal, route, vehicle, driver). The accountant's "ready for
--      billing" screen filters / groups / merges these into a single
--      customer invoice. The `invoiceId` / `invoiceLineId` columns close
--      the loop once the accountant materialises.

BEGIN;

-- 1. Extend the cargo_manifests lifecycle (13 → 15).
ALTER TABLE public.cargo_manifests
  DROP CONSTRAINT IF EXISTS cargo_manifests_status_check;

ALTER TABLE public.cargo_manifests
  ADD CONSTRAINT cargo_manifests_status_check CHECK (
    status::text = ANY (ARRAY[
      'draft',
      'requested',
      'approved',
      'assigned_to_driver',
      'driver_accepted',
      'trip_started',
      'arrived_pickup',
      'loaded',
      'in_transit',
      'arrived_delivery',
      'delivered',
      'completed',
      'ready_for_invoice',
      'financially_closed',
      'cancelled'
    ]::text[])
  );

-- 2. Operational tracking columns + their CHECK constraints.
ALTER TABLE public.cargo_manifests
  ADD COLUMN IF NOT EXISTS "billingStatus" text NOT NULL DEFAULT 'not_billable';

ALTER TABLE public.cargo_manifests
  ADD COLUMN IF NOT EXISTS "transportServiceType" text NOT NULL DEFAULT 'cargo_load';

ALTER TABLE public.cargo_manifests
  DROP CONSTRAINT IF EXISTS cargo_manifests_billing_status_check;
ALTER TABLE public.cargo_manifests
  ADD CONSTRAINT cargo_manifests_billing_status_check CHECK (
    "billingStatus"::text = ANY (ARRAY[
      'not_billable',         -- internal transfer or zero-value run
      'ready_for_accounting', -- candidate handed off to accountant
      'under_review',         -- accountant is reviewing / pricing
      'invoiced',             -- invoice issued and posted
      'excluded'              -- accountant rejected; needs operator action
    ]::text[])
  );

ALTER TABLE public.cargo_manifests
  DROP CONSTRAINT IF EXISTS cargo_manifests_service_type_check;
ALTER TABLE public.cargo_manifests
  ADD CONSTRAINT cargo_manifests_service_type_check CHECK (
    "transportServiceType"::text = ANY (ARRAY[
      'cargo_load',
      'passenger_umrah',
      'passenger_general',
      'equipment_rental',
      'internal_transfer',
      'other'
    ]::text[])
  );

-- "Accountant queue" — find every manifest whose billing is sitting in
-- a non-terminal state. Partial index keeps it small.
CREATE INDEX IF NOT EXISTS idx_cargo_manifests_billing_status
  ON public.cargo_manifests ("companyId", "billingStatus", "deliveryDate" DESC)
  WHERE "billingStatus" IN ('ready_for_accounting', 'under_review');

-- 3. transport_service_lines — operational-to-billable bridge.
CREATE TABLE IF NOT EXISTS public.transport_service_lines (
  id                  SERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL,
  "branchId"          INTEGER,
  "customerId"        INTEGER,

  -- Source rowback-pointer. (sourceType, sourceId) is unique per company
  -- so the operational close fires this insert exactly once — re-flipping
  -- the cargo manifest state is idempotent.
  "sourceType"        TEXT NOT NULL,     -- 'cargo_manifest' | 'umrah_transport' | 'fleet_trip'
  "sourceId"          INTEGER NOT NULL,
  "sourceRef"         TEXT,              -- manifest number / trip ref

  -- Operational anchors.
  "serviceType"       TEXT NOT NULL,     -- matches cargo_manifests.transportServiceType alphabet
  "serviceDate"       DATE NOT NULL,
  "tripId"            INTEGER,
  "manifestId"        INTEGER,
  "umrahTransportId"  INTEGER,
  "vehicleId"         INTEGER,
  "driverId"          INTEGER,
  "routeFrom"         TEXT,
  "routeTo"           TEXT,
  "cargoType"         TEXT,
  "passengerCount"    INTEGER,

  -- Quantitative facts that flow into the invoice line.
  quantity            NUMERIC(18,3) NOT NULL DEFAULT 0,
  "unitOfMeasure"     TEXT,
  "unitPrice"         NUMERIC(18,4),
  "lineTotal"         NUMERIC(18,2),

  -- Billing lifecycle. Same alphabet as cargo_manifests.billingStatus
  -- so the accountant's queries can join naturally.
  "billingStatus"     TEXT NOT NULL DEFAULT 'ready_for_accounting',

  -- Closes the loop after the accountant merges this row into an invoice.
  "invoiceId"         INTEGER,
  "invoiceLineId"     INTEGER,

  notes               TEXT,
  "createdBy"         INTEGER,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_transport_service_line_source
    UNIQUE ("companyId", "sourceType", "sourceId"),
  CONSTRAINT transport_service_lines_billing_status_check CHECK (
    "billingStatus"::text = ANY (ARRAY[
      'ready_for_accounting',
      'under_review',
      'invoiced',
      'excluded'
    ]::text[])
  ),
  CONSTRAINT transport_service_lines_service_type_check CHECK (
    "serviceType"::text = ANY (ARRAY[
      'cargo_load',
      'passenger_umrah',
      'passenger_general',
      'equipment_rental',
      'internal_transfer',
      'other'
    ]::text[])
  )
);

-- Accountant queue (per-customer view + filter by status).
CREATE INDEX IF NOT EXISTS idx_service_lines_customer_status
  ON public.transport_service_lines ("companyId", "customerId", "billingStatus", "serviceDate" DESC);

-- "Show me every line that landed on invoice X" — back-pointer for the
-- finance side once it materialises a merged invoice.
CREATE INDEX IF NOT EXISTS idx_service_lines_invoice
  ON public.transport_service_lines ("invoiceId")
  WHERE "invoiceId" IS NOT NULL;

COMMIT;
