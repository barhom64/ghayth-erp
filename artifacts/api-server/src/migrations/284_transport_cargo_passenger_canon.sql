-- Migration 284 — #1812 canonical model split: cargo vs passenger.
--
-- @rollback: Fully additive. To undo:
--   DROP TABLE IF EXISTS transport_route_patterns CASCADE;
--   ALTER TABLE transport_bookings
--     DROP COLUMN IF EXISTS "tripFamily",
--     DROP COLUMN IF EXISTS "routePatternId",
--     DROP COLUMN IF EXISTS "cargoOperationalMetadata";
--   ALTER TABLE fleet_vehicles
--     DROP COLUMN IF EXISTS "operationalPayloadKg",
--     DROP COLUMN IF EXISTS "boxLengthCm",
--     DROP COLUMN IF EXISTS "boxWidthCm",
--     DROP COLUMN IF EXISTS "boxHeightCm",
--     DROP COLUMN IF EXISTS "axleCount",
--     DROP COLUMN IF EXISTS "tireCount",
--     DROP COLUMN IF EXISTS "validForPassengers",
--     DROP COLUMN IF EXISTS "validForCargo";
--
-- #1812 user's architectural mandate (Comment 4663005810):
--   "الفصل النهائي للمسارات: رحلة ركاب / نقل حمولة
--    وإلغاء تضخم الأنواع المتكررة."
--
-- The booking model needs to be cleanly partitioned into two trip
-- families, each with its own operational fields:
--
--   1. PASSENGER trips (umrah / general passenger / equipment_rental
--      with people / internal_transfer with people)
--      → require: umrah link, customer/contract link, passenger count,
--                 seat count, multi-leg, airports/hotels/mazars,
--                 driver experience flow, auto-status cascade.
--
--   2. CARGO trips (cargo_load + recurring cargo schedule)
--      → require: single trip OR recurring route pattern, loading
--                 points, scale, inspection, rest stops, fuel stops,
--                 unloading, recurring schedule.
--
-- The official canonical flow (the user named it explicitly):
--   Booking / Template
--     → Legs / Route Pattern
--     → Dispatch Order
--     → Driver Execution
--     → Operational Close
--     → Accounting Candidate
--
-- This migration is the foundation: it adds the columns that let the
-- backend KNOW whether a booking is passenger-family or cargo-family,
-- and introduces the transport_route_patterns table for recurring
-- cargo (Mon/Wed/Fri Riyadh → Jeddah, materialised into bookings by
-- cron).

-- ── 1. trip_family on transport_bookings ─────────────────────────────
-- 'passenger' | 'cargo'. Computed at create time from
-- transportServiceType (passenger_* / equipment_rental → passenger;
-- cargo_load → cargo; internal_transfer / other → whichever has
-- passengerCount > 0).
ALTER TABLE transport_bookings
  ADD COLUMN IF NOT EXISTS "tripFamily" TEXT;

CREATE INDEX IF NOT EXISTS idx_transport_bookings_family
  ON transport_bookings ("companyId", "tripFamily")
  WHERE "tripFamily" IS NOT NULL AND "deletedAt" IS NULL;

-- ── 2. recurring cargo route patterns ────────────────────────────────
-- A route_pattern is a TEMPLATE for cargo trips that repeat. Materialised
-- into transport_bookings by the recurring scheduler cron.
--
-- Example: "Monday + Wednesday + Friday, Riyadh warehouse → Jeddah
-- port, 15-ton truck class, two driver rotation"
CREATE TABLE IF NOT EXISTS transport_route_patterns (
  id                  SERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL,
  "branchId"          INTEGER,

  -- Identity.
  "patternCode"       TEXT NOT NULL,         -- short alias the operator types
  name                TEXT NOT NULL,         -- human description

  -- Schedule (cron-like).
  -- Days of week mask: bit 0 = Sunday, bit 1 = Monday, ... bit 6 = Saturday
  "daysOfWeekMask"    SMALLINT NOT NULL DEFAULT 0,
  -- HH:MM 24-hour local time when the booking gets materialized.
  "departureTime"     TIME,
  -- Optional date window — pattern only active between these dates.
  "activeFrom"        DATE,
  "activeUntil"       DATE,

  -- Route anchors.
  "fromLocationId"    INTEGER,
  "toLocationId"      INTEGER,
  "fromLocationText"  TEXT,
  "toLocationText"    TEXT,
  "fromLocationKind"  TEXT,
  "toLocationKind"    TEXT,
  "fromLat"           NUMERIC(10,7),
  "fromLng"           NUMERIC(10,7),
  "toLat"             NUMERIC(10,7),
  "toLng"             NUMERIC(10,7),

  -- Cargo defaults applied to each materialised booking.
  "defaultVehicleClass"  TEXT,
  "defaultLicenseClass"  TEXT,
  "defaultCustomerId"    INTEGER,
  "defaultContractId"    INTEGER,
  "defaultCargoWeight"   NUMERIC(12,2),
  "defaultCargoUnit"     TEXT,

  -- Operational hints surfaced in cargo trip execution.
  -- JSONB array of waypoints with kind+notes (loading / scale /
  -- inspection / rest / fuel / unloading) — replaces a fixed schema
  -- so customer-specific routes can store their own checkpoints.
  "operationalWaypoints" JSONB,

  status              TEXT NOT NULL DEFAULT 'active',
  notes               TEXT,
  "createdBy"         INTEGER,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"         TIMESTAMPTZ,

  CONSTRAINT uq_route_pattern_code UNIQUE ("companyId", "patternCode")
);

CREATE INDEX IF NOT EXISTS idx_route_patterns_active
  ON transport_route_patterns ("companyId", status, "daysOfWeekMask")
  WHERE "deletedAt" IS NULL AND status = 'active';

-- Back-link on transport_bookings: when a booking was materialised from
-- a pattern, this points back so audit can trace the lineage.
ALTER TABLE transport_bookings
  ADD COLUMN IF NOT EXISTS "routePatternId" INTEGER;

CREATE INDEX IF NOT EXISTS idx_transport_bookings_route_pattern
  ON transport_bookings ("companyId", "routePatternId")
  WHERE "routePatternId" IS NOT NULL AND "deletedAt" IS NULL;

-- ── 3. cargo operational metadata ────────────────────────────────────
-- JSONB blob carrying cargo-only operational facts. Lives on the
-- booking (not the line) because it describes the SHIPMENT not each leg.
-- Shape:
--   {
--     loadingPoints: [{ locationId, text, scheduledAt, notes }],
--     scale:        { weighedAt, weighKg, station },
--     inspection:   { inspectedAt, inspector, result, photoUrls },
--     restStops:    [{ locationText, plannedDurationMin }],
--     fuelStops:    [{ locationText, litersExpected }],
--     unloading:    { scheduledAt, locationText, receivedBy }
--   }
ALTER TABLE transport_bookings
  ADD COLUMN IF NOT EXISTS "cargoOperationalMetadata" JSONB;

-- ── 4. vehicle technical profile expansion ───────────────────────────
-- The user's explicit list of fields:
--   - سعة الركاب → payloadKg + seatCount already exist
--   - الحمولة النظامية → payloadKg already (this is the legal/registered weight)
--   - الحمولة التشغيلية → NEW: operationalPayloadKg (real safe operating weight)
--   - أبعاد الصندوق → NEW: boxLengthCm + boxWidthCm + boxHeightCm
--   - عدد المحاور → NEW: axleCount
--   - عدد الكفرات → NEW: tireCount
--   - صلاحية الركاب أو الحمولة → NEW: validForPassengers + validForCargo
ALTER TABLE fleet_vehicles
  ADD COLUMN IF NOT EXISTS "operationalPayloadKg" NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS "boxLengthCm"          INTEGER,
  ADD COLUMN IF NOT EXISTS "boxWidthCm"           INTEGER,
  ADD COLUMN IF NOT EXISTS "boxHeightCm"          INTEGER,
  ADD COLUMN IF NOT EXISTS "axleCount"            SMALLINT,
  ADD COLUMN IF NOT EXISTS "tireCount"            SMALLINT,
  ADD COLUMN IF NOT EXISTS "validForPassengers"   BOOLEAN,
  ADD COLUMN IF NOT EXISTS "validForCargo"        BOOLEAN;

-- Partial indexes for the family filter — assignment engine queries
-- "vehicles valid for cargo" or "vehicles valid for passengers".
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_valid_cargo
  ON fleet_vehicles ("companyId", "validForCargo")
  WHERE "validForCargo" = TRUE AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_valid_passengers
  ON fleet_vehicles ("companyId", "validForPassengers")
  WHERE "validForPassengers" = TRUE AND "deletedAt" IS NULL;
