-- #1354 — cargo/freight module: نقل بري للبضائع.
--
-- The recent transport audit found NO cargo support in the codebase
-- (no cargo, manifest, BOL, weighbridge tables — only "freight" as a
-- withholding-tax label). This migration adds the minimum-viable
-- foundation: cargo manifests + items, linked optionally to existing
-- fleet_trips so a single dispatch can carry both pilgrim and freight
-- assignments through the same trip surface.
--
-- @rollback: DROP TABLE cargo_items; DROP TABLE cargo_manifests;
--   (no other table FK's into these yet; safe rollback).
-- @policy: additive. No backfill needed. Existing fleet_trips rows
--   continue to function without a manifest.

CREATE TABLE IF NOT EXISTS cargo_manifests (
  id                   SERIAL PRIMARY KEY,
  "companyId"          INTEGER NOT NULL,
  "branchId"           INTEGER,

  -- Manifest reference number — operator-assigned or system-generated.
  -- NOT marked UNIQUE: clients sometimes reuse references across years.
  "manifestNumber"     VARCHAR(64) NOT NULL,

  -- Lifecycle. Mirrors fleet_trips so the operator UI can render the
  -- same status badges. Transitions:
  --   draft → confirmed → loading → in_transit → delivered → closed
  --   any → cancelled
  status               VARCHAR(24) NOT NULL DEFAULT 'draft',
  CONSTRAINT cargo_manifests_status_check CHECK (
    status IN ('draft','confirmed','loading','in_transit','delivered','closed','cancelled')
  ),

  -- Customer (the consigner / shipper) — optional reference to CRM clients.
  "customerId"         INTEGER REFERENCES clients(id),
  "customerName"       VARCHAR(255),
  "customerPhone"      VARCHAR(64),

  -- Trip linkage — when set, the manifest rides on this fleet trip.
  -- Manifests without a tripId are "planned but not dispatched yet".
  "fleetTripId"        INTEGER REFERENCES fleet_trips(id),

  -- Routing (denormalized — keeps the manifest legible if the trip is
  -- later cancelled / re-routed). When fleetTripId is set, these are
  -- expected to match the trip's from/to at creation time.
  "fromLocation"       VARCHAR(255),
  "toLocation"         VARCHAR(255),
  "pickupDate"         DATE,
  "deliveryDate"       DATE,

  -- Vehicle + driver assignment. Often the same as the trip, but kept
  -- separately so a manifest can be created before the trip exists.
  "vehicleId"          INTEGER REFERENCES fleet_vehicles(id),
  "driverId"           INTEGER REFERENCES fleet_drivers(id),

  -- Totals — denormalized from cargo_items for fast list filtering.
  -- Updated by a trigger or recomputed on item INSERT/UPDATE/DELETE
  -- (initial implementation: SPA recomputes on save; the column is
  -- here to keep the API contract stable when we add the trigger).
  "totalWeight"        NUMERIC(12, 2) DEFAULT 0,
  "totalDeclaredValue" NUMERIC(14, 2) DEFAULT 0,

  -- Freight cost charged to the customer + cost paid for the trip.
  -- Both are taxable surfaces — VAT handling is done at the invoicing
  -- layer (sales invoice), not on the manifest.
  "freightRevenue"     NUMERIC(14, 2) DEFAULT 0,
  "freightCost"        NUMERIC(14, 2) DEFAULT 0,

  notes                TEXT,
  "createdBy"          INTEGER,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cargo_manifests_company
  ON cargo_manifests ("companyId") WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_cargo_manifests_status
  ON cargo_manifests (status, "companyId") WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_cargo_manifests_customer
  ON cargo_manifests ("customerId", "companyId") WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_cargo_manifests_trip
  ON cargo_manifests ("fleetTripId") WHERE "deletedAt" IS NULL AND "fleetTripId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cargo_manifests_vehicle
  ON cargo_manifests ("vehicleId", "pickupDate" DESC) WHERE "deletedAt" IS NULL AND "vehicleId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cargo_manifests_driver
  ON cargo_manifests ("driverId", "pickupDate" DESC) WHERE "deletedAt" IS NULL AND "driverId" IS NOT NULL;


CREATE TABLE IF NOT EXISTS cargo_items (
  id                   SERIAL PRIMARY KEY,
  "manifestId"         INTEGER NOT NULL REFERENCES cargo_manifests(id) ON DELETE CASCADE,
  "companyId"          INTEGER NOT NULL,

  description          VARCHAR(255) NOT NULL,
  quantity             INTEGER NOT NULL DEFAULT 1,
  "unitOfMeasure"      VARCHAR(32) DEFAULT 'piece',

  -- Per-item weight in kg. Total = quantity * weight, summed across
  -- items into cargo_manifests."totalWeight".
  weight               NUMERIC(12, 2) DEFAULT 0,

  -- Per-item declared value (for insurance / customs / damage claims).
  -- Total = quantity * declaredValue, summed into manifest totals.
  "declaredValue"      NUMERIC(14, 2) DEFAULT 0,

  -- Dimensions for warehouse / loading planning. Stored as a JSON
  -- string to avoid a separate per-dimension column: e.g.
  -- {"length":120,"width":80,"height":40,"unit":"cm"}.
  dimensions           JSONB,

  -- Hazmat flag + category. UN code is freeform — KSA road transport
  -- regs reference the ECE table directly.
  "isHazmat"           BOOLEAN NOT NULL DEFAULT false,
  "hazmatClass"        VARCHAR(32),

  notes                TEXT,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cargo_items_manifest
  ON cargo_items ("manifestId") WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_cargo_items_hazmat
  ON cargo_items ("isHazmat", "companyId") WHERE "deletedAt" IS NULL AND "isHazmat" = true;
