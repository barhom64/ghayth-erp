-- 261_transport_billing_candidates.sql
--
-- @rollback:
--   DROP TABLE IF EXISTS public.transport_billing_candidates;
--
-- #1733 — Transport drives operations; transport NEVER posts to GL.
-- After operational close, the transport module hands off a
-- `transport_billing_candidate` artifact that the accountant materializes
-- into the actual journal entry / invoice. Before this migration the
-- delivery transition called fleetEngine.postCargoDeliveryGL directly,
-- which violated the "transport must not touch accounting" directive.
--
-- The candidate row carries every operational fact the accountant needs
-- to price, group, and invoice the load without going back to the
-- transport screen — see #1733 field list (sourceType, sourceId,
-- customerId, serviceType, serviceDate, routeFrom, routeTo, vehicleId,
-- driverId, quantity, unitOfMeasure, operationalStatus, attachments,
-- notes). `materializedJournalEntryId` (nullable) is the FK that
-- closes the loop once the accountant approves.

CREATE TABLE IF NOT EXISTS public.transport_billing_candidates (
  id                          SERIAL PRIMARY KEY,
  "companyId"                 INTEGER NOT NULL,
  "branchId"                  INTEGER,

  -- Origin record in the operational world. sourceType lets later
  -- transport surfaces (passenger trips, equipment rentals, internal
  -- transfers) plug in without a schema change. sourceId references
  -- the source row inside its own table.
  "sourceType"                TEXT NOT NULL,        -- e.g. 'cargo_manifest', 'fleet_trip'
  "sourceId"                  INTEGER NOT NULL,
  "sourceRef"                 TEXT,                 -- human-readable ref (manifest number, trip ref)

  -- Commercial dimension carried over from the source.
  "customerId"                INTEGER,
  "serviceType"               TEXT NOT NULL,        -- 'freight', 'passenger', 'rental', 'internal_transfer', ...
  "serviceDate"               DATE NOT NULL,        -- the operational completion date (when revenue is "earned")
  "routeFrom"                 TEXT,
  "routeTo"                   TEXT,

  -- Operational anchors — kept so the accountant can drill back into
  -- per-vehicle / per-driver reporting from the JE without re-joining
  -- the source table.
  "vehicleId"                 INTEGER,
  "driverId"                  INTEGER,

  -- The operational quantity ("how much was moved") + its unit.
  -- For cargo: kg or pallets. For passenger umrah: head count. For
  -- rental: hours/days. The accountant maps this to a sellable quantity
  -- on the invoice line, not on this row.
  quantity                    NUMERIC(18,3) NOT NULL DEFAULT 0,
  "unitOfMeasure"             TEXT,                 -- 'kg', 'pax', 'hour', 'day', 'trip'

  -- Operational status snapshot taken at the moment of handoff.
  "operationalStatus"         TEXT NOT NULL,        -- 'delivered', 'completed', 'returned', ...

  -- Pre-computed revenue / cost suggestions from the source row.
  -- Optional — the accountant may override (the JE built at materialize
  -- time uses whatever fleet/cargo recorded as freightRevenue / freightCost).
  "suggestedRevenue"          NUMERIC(18,2),
  "suggestedCost"             NUMERIC(18,2),

  -- Free-form fields for the operator's "this is what happened" trail.
  attachments                 JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes                       TEXT,

  -- Lifecycle.
  --   'pending'      → waiting on the accountant
  --   'materialized' → journal entry posted; materializedJournalEntryId is non-null
  --   'rejected'     → accountant refused; rejectionReason is non-null. Stays for audit.
  status                      TEXT NOT NULL DEFAULT 'pending',
  "materializedJournalEntryId" INTEGER,
  "materializedBy"            INTEGER,
  "materializedAt"            TIMESTAMPTZ,
  "rejectedBy"                INTEGER,
  "rejectedAt"                TIMESTAMPTZ,
  "rejectionReason"           TEXT,

  "createdBy"                 INTEGER,
  "createdAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Idempotency: one candidate per (company, sourceType, sourceId). Re-running
  -- the operational transition (e.g. PATCH delivered twice) must not create a
  -- duplicate handoff. The transport route uses ON CONFLICT DO NOTHING.
  CONSTRAINT uq_billing_candidate_source
    UNIQUE ("companyId", "sourceType", "sourceId")
);

-- Accountant queue: "show me everything still waiting" — the most common read.
CREATE INDEX IF NOT EXISTS idx_billing_candidates_company_status
  ON public.transport_billing_candidates ("companyId", status, "createdAt" DESC);

-- Per-customer aggregation ("how much pending for client X") and revenue/cost
-- reporting joins.
CREATE INDEX IF NOT EXISTS idx_billing_candidates_customer
  ON public.transport_billing_candidates ("companyId", "customerId")
  WHERE "customerId" IS NOT NULL;

-- Per-vehicle / per-driver dimensional drill-down.
CREATE INDEX IF NOT EXISTS idx_billing_candidates_vehicle
  ON public.transport_billing_candidates ("companyId", "vehicleId")
  WHERE "vehicleId" IS NOT NULL;
