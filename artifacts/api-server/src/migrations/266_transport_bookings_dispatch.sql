-- 266_transport_bookings_dispatch.sql
--
-- @rollback:
--   DROP TABLE IF EXISTS public.vehicle_location_snapshots;
--   DROP TABLE IF EXISTS public.transport_dispatch_orders;
--   DROP TABLE IF EXISTS public.transport_booking_lines;
--   DROP TABLE IF EXISTS public.transport_bookings;
--   DROP TABLE IF EXISTS public.transport_locations;
--
-- #1733 Booking + Dispatch layer (Issue Comment 9). Adds the pre-trip
-- pipeline so the system can accept a booking, schedule it, dispatch
-- it to a driver/vehicle, and only then create the trip / cargo
-- manifest that downstream layers (Foundation tier, Blockers) own.
--
-- Five tables:
--
--   • transport_locations — reusable pickup/dropoff anchors (warehouses,
--     hotels, airports, customer sites) with lat/lng. Bookings reference
--     these instead of repeating addresses, so the dispatch board can
--     show route legs on a map without re-geocoding.
--
--   • transport_bookings — the booking record (one per customer request).
--     Multi-channel intake (`bookingSource`): manual_entry / customer_request
--     / umrah_group / contract_schedule / import_excel / api_integration /
--     recurring_schedule. Per-service-type fields are nullable
--     (cargo-only / passenger-only / rental-only) so the same table
--     carries every variant.
--
--   • transport_booking_lines — one row per leg / vehicle requested. A
--     cargo booking with 3 trucks → 3 lines. An umrah trip with 2 buses
--     → 2 lines. Each line is what the dispatcher assigns + dispatches.
--
--   • transport_dispatch_orders — the assignment artefact: which driver +
--     vehicle pair is committed to which booking line at what time.
--     States: pending → notified → accepted → executing → completed →
--     closed (+ declined / cancelled). Conflict detection (one driver /
--     vehicle per time window) is enforced via partial unique indexes.
--
--   • vehicle_location_snapshots — GPS pings for the dispatch board's
--     live map. Append-only; the dispatcher views the latest per vehicle
--     via the partial index.

-- 1. Locations master.
CREATE TABLE IF NOT EXISTS public.transport_locations (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "branchId"      INTEGER,
  code            TEXT,                    -- short alias the operator types
  name            TEXT NOT NULL,
  "locationType"  TEXT,                    -- 'warehouse' | 'hotel' | 'airport' | 'customer_site' | 'depot' | 'mosque' | 'other'
  city            TEXT,
  address         TEXT,
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  "isActive"      BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  "createdBy"     INTEGER,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_transport_locations_company
  ON public.transport_locations ("companyId", "isActive")
  WHERE "deletedAt" IS NULL;

-- 2. Bookings — one per customer request.
CREATE TABLE IF NOT EXISTS public.transport_bookings (
  id                     SERIAL PRIMARY KEY,
  "companyId"            INTEGER NOT NULL,
  "branchId"             INTEGER,
  "bookingNumber"        TEXT NOT NULL,
  "bookingSource"        TEXT NOT NULL DEFAULT 'manual_entry',
  "transportServiceType" TEXT NOT NULL,    -- same alphabet as cargo_manifests.transportServiceType

  -- Commercial.
  "customerId"           INTEGER,
  "customerName"         TEXT,
  "customerPhone"        TEXT,
  "contractId"           INTEGER,

  -- Route anchors. Either by ID (recommended) or freeform text.
  "fromLocationId"       INTEGER,
  "toLocationId"         INTEGER,
  "fromLocationText"     TEXT,
  "toLocationText"       TEXT,
  "routeType"            TEXT,             -- umrah-specific: 'airport_to_makkah' | 'makkah_to_madinah' | ... | 'custom'

  -- Service windows.
  "requestedPickupDate"  DATE,
  "requestedPickupTime"  TIME,
  "requestedDeliveryDate" DATE,
  "requestedDeliveryTime" TIME,

  -- Per-type facts (nullable; only the matching set is populated).
  "cargoDescription"     TEXT,
  "cargoQuantity"        NUMERIC(18,3),
  "cargoUnit"            TEXT,
  "cargoWeight"          NUMERIC(12,2),
  "passengerCount"       INTEGER,
  "umrahGroupId"         INTEGER,
  "flightNumber"         TEXT,
  "supervisorName"       TEXT,
  "supervisorPhone"      TEXT,
  "hotelName"            TEXT,
  "hotelLocation"        TEXT,

  -- Beneficiary / project / waqf tagging (operational; finance decides treatment).
  "beneficiaryType"      TEXT,
  "beneficiaryId"        INTEGER,
  "projectId"            INTEGER,
  "waqfId"               INTEGER,
  "costCenterId"         INTEGER,

  -- Lifecycle (10 states).
  status                 TEXT NOT NULL DEFAULT 'draft',
  notes                  TEXT,
  "createdBy"            INTEGER,
  "createdAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"            TIMESTAMPTZ,

  CONSTRAINT uq_transport_booking_number
    UNIQUE ("companyId", "bookingNumber"),
  CONSTRAINT transport_bookings_source_check CHECK (
    "bookingSource" = ANY (ARRAY[
      'manual_entry',
      'customer_request',
      'umrah_group',
      'contract_schedule',
      'import_excel',
      'api_integration',
      'recurring_schedule'
    ]::text[])
  ),
  CONSTRAINT transport_bookings_service_type_check CHECK (
    "transportServiceType" = ANY (ARRAY[
      'cargo_load',
      'passenger_umrah',
      'passenger_general',
      'equipment_rental',
      'internal_transfer',
      'other'
    ]::text[])
  ),
  CONSTRAINT transport_bookings_status_check CHECK (
    status = ANY (ARRAY[
      'draft',
      'submitted',
      'pending_approval',
      'approved',
      'scheduled',
      'dispatched',
      'in_progress',
      'completed',
      'cancelled',
      'rejected'
    ]::text[])
  ),
  CONSTRAINT transport_bookings_route_type_check CHECK (
    "routeType" IS NULL OR "routeType" = ANY (ARRAY[
      'airport_to_makkah',
      'makkah_to_madinah',
      'madinah_to_airport',
      'makkah_local',
      'madinah_local',
      'ziyarah',
      'custom'
    ]::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_bookings_company_status
  ON public.transport_bookings ("companyId", status, "requestedPickupDate")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_bookings_customer
  ON public.transport_bookings ("companyId", "customerId", "requestedPickupDate" DESC)
  WHERE "deletedAt" IS NULL AND "customerId" IS NOT NULL;

-- 3. Booking lines — one per leg / required vehicle.
CREATE TABLE IF NOT EXISTS public.transport_booking_lines (
  id                       SERIAL PRIMARY KEY,
  "companyId"              INTEGER NOT NULL,
  "bookingId"              INTEGER NOT NULL,
  "lineNumber"             INTEGER NOT NULL,

  -- Per-line resource needs.
  "requiredVehicleType"    TEXT,             -- 'truck' | 'bus' | 'van' | ...
  "requiredCapacityKg"     NUMERIC(10,2),
  "requiredSeatCount"      INTEGER,
  "requiredLicenseClass"   TEXT,

  -- Per-line route + time.
  "fromLocationId"         INTEGER,
  "toLocationId"           INTEGER,
  "scheduledPickupAt"      TIMESTAMPTZ,
  "scheduledDeliveryAt"    TIMESTAMPTZ,

  -- Per-line description (cargo vs. passenger split).
  "lineDescription"        TEXT,
  quantity                 NUMERIC(18,3),
  "unitOfMeasure"          TEXT,
  "passengerCount"         INTEGER,

  status                   TEXT NOT NULL DEFAULT 'open',
  notes                    TEXT,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"              TIMESTAMPTZ,

  CONSTRAINT uq_booking_line UNIQUE ("bookingId", "lineNumber"),
  CONSTRAINT transport_booking_lines_status_check CHECK (
    status = ANY (ARRAY['open', 'dispatched', 'in_progress', 'completed', 'cancelled']::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_booking_lines_booking
  ON public.transport_booking_lines ("bookingId")
  WHERE "deletedAt" IS NULL;

-- 4. Dispatch orders — driver + vehicle assignment per line + time window.
CREATE TABLE IF NOT EXISTS public.transport_dispatch_orders (
  id                       SERIAL PRIMARY KEY,
  "companyId"              INTEGER NOT NULL,
  "branchId"               INTEGER,
  "bookingId"              INTEGER NOT NULL,
  "bookingLineId"          INTEGER NOT NULL,
  "vehicleId"              INTEGER NOT NULL,
  "driverId"               INTEGER NOT NULL,
  "scheduledStartAt"       TIMESTAMPTZ NOT NULL,
  "scheduledEndAt"         TIMESTAMPTZ NOT NULL,

  -- Resulting operational rows once dispatched. The cargo manifest /
  -- fleet trip / umrah transport row is created by the operator at
  -- accept / start; this FK links the dispatch order back to the row
  -- so the timeline can correlate.
  "linkedManifestId"       INTEGER,
  "linkedTripId"           INTEGER,
  "linkedUmrahTransportId" INTEGER,

  status                   TEXT NOT NULL DEFAULT 'pending',
  "declinedReason"         TEXT,
  "dispatchedBy"           INTEGER,
  "dispatchedAt"           TIMESTAMPTZ,
  "acceptedAt"             TIMESTAMPTZ,
  "startedAt"              TIMESTAMPTZ,
  "completedAt"            TIMESTAMPTZ,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT transport_dispatch_orders_status_check CHECK (
    status = ANY (ARRAY[
      'pending',
      'notified',
      'accepted',
      'declined',
      'executing',
      'completed',
      'closed',
      'cancelled'
    ]::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_dispatch_company_window
  ON public.transport_dispatch_orders ("companyId", "scheduledStartAt", "scheduledEndAt")
  WHERE status NOT IN ('declined', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_dispatch_driver_window
  ON public.transport_dispatch_orders ("driverId", "scheduledStartAt")
  WHERE status NOT IN ('declined', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_dispatch_vehicle_window
  ON public.transport_dispatch_orders ("vehicleId", "scheduledStartAt")
  WHERE status NOT IN ('declined', 'cancelled');

-- 5. Vehicle location snapshots (GPS pings for dispatch live map).
CREATE TABLE IF NOT EXISTS public.vehicle_location_snapshots (
  id              BIGSERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "vehicleId"     INTEGER NOT NULL,
  "driverId"      INTEGER,
  "dispatchOrderId" INTEGER,
  latitude        NUMERIC(10,7) NOT NULL,
  longitude       NUMERIC(10,7) NOT NULL,
  "speedKmh"      NUMERIC(6,2),
  heading         NUMERIC(5,2),
  "capturedAt"    TIMESTAMPTZ NOT NULL,
  source          TEXT,                   -- 'manual' | 'telematics' | 'driver_phone'
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The dispatch live map asks "show me the latest fix for every vehicle"
-- — this descending index makes that constant-time per vehicle.
CREATE INDEX IF NOT EXISTS idx_vehicle_snapshots_latest
  ON public.vehicle_location_snapshots ("companyId", "vehicleId", "capturedAt" DESC);
