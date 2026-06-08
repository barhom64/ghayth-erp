-- 271_transport_planning_engine.sql
--
-- @policy:breaking
-- @rollback:
--   DROP TABLE IF EXISTS public.transport_itinerary_legs;
--   DROP TABLE IF EXISTS public.transport_itineraries;
--   DROP TABLE IF EXISTS public.driver_navigation_sessions;
--   DROP TABLE IF EXISTS public.transport_route_estimates;
--   DROP TABLE IF EXISTS public.transport_planning_settings;
--   ALTER TABLE public.fleet_drivers
--     DROP COLUMN IF EXISTS "restHoursRequired",
--     DROP COLUMN IF EXISTS "lastDutyEndedAt";
--   ALTER TABLE public.transport_dispatch_orders
--     DROP COLUMN IF EXISTS "estimatedPrepMinutes",
--     DROP COLUMN IF EXISTS "estimatedTravelMinutes",
--     DROP COLUMN IF EXISTS "estimatedLoadingMinutes",
--     DROP COLUMN IF EXISTS "estimatedUnloadingMinutes",
--     DROP COLUMN IF EXISTS "estimatedDistanceKm";
--   ALTER TABLE public.transport_bookings
--     DROP COLUMN IF EXISTS "requestedVehicleClass",
--     DROP COLUMN IF EXISTS "vehicleSubstitutionPolicy",
--     DROP COLUMN IF EXISTS "allowUpgrade",
--     DROP COLUMN IF EXISTS "requiredExactVehicleId",
--     DROP COLUMN IF EXISTS "requiredExactDriverId",
--     DROP COLUMN IF EXISTS "pickupWindowStart",
--     DROP COLUMN IF EXISTS "pickupWindowEnd",
--     DROP COLUMN IF EXISTS "dropoffWindowStart",
--     DROP COLUMN IF EXISTS "dropoffWindowEnd",
--     DROP COLUMN IF EXISTS "fixedAppointmentTime",
--     DROP COLUMN IF EXISTS "isFlexibleTime",
--     DROP COLUMN IF EXISTS priority;
--
-- #1812 Transport Planning Engine — the spine that turns the booking
-- pipeline from a "form + log" into an actual operational assistant:
--
--   1. Customer-agreement fields on bookings (requestedVehicleClass,
--      vehicleSubstitutionPolicy, allowUpgrade, exact vehicle/driver
--      requirements). Drives the assignment-suggestion engine.
--
--   2. Time-window fields on bookings (pickup/dropoff windows, fixed
--      appointment, flexible-time flag, priority). Drives the
--      planning + conflict-detection engine.
--
--   3. Driver-rest fields on fleet_drivers (restHoursRequired,
--      lastDutyEndedAt). Enforced as a constraint on dispatch creation
--      and reschedule (unless overrideReason).
--
--   4. Time-estimate fields on transport_dispatch_orders (prep,
--      travel, loading, unloading + distance). Drives the per-task
--      timeline + utilization metrics.
--
--   5. transport_planning_settings — one row per company carrying
--      configuration: mapProvider (manual_only by default),
--      defaultRestHours, defaultLoadingMinutes, defaultBufferMinutes,
--      defaultDeadheadMinutes. Created lazily on first read by the
--      planning routes.
--
--   6. transport_route_estimates — provider-agnostic cache for
--      MapsService.estimateRoute(). Keyed on (companyId, origin lat/lng,
--      destination lat/lng, provider) so the same query in a short
--      time window doesn't re-hit the provider.
--
--   7. driver_navigation_sessions — one row per active driver
--      navigation session tied to a dispatch_order. Tracks lastLat /
--      lastLng / lastSpeed / lastHeading + status (active /
--      arrived_pickup / loaded / arrived_dropoff / delivered / ended).
--      Drives the in-app navigation surface for the driver and the
--      live tracking on the operator's ops dashboard.
--
--   8. transport_itineraries + transport_itinerary_legs — the
--      chained-trip support (e.g. Makkah → Madinah → Hotel) so the
--      planning engine treats them as a single sequenced operation
--      with mid-trip locations + per-leg time windows.

BEGIN;

-- 1) Customer-agreement + time-window fields on bookings.
ALTER TABLE public.transport_bookings
  ADD COLUMN IF NOT EXISTS "requestedVehicleClass"     TEXT,
  ADD COLUMN IF NOT EXISTS "vehicleSubstitutionPolicy" TEXT NOT NULL DEFAULT 'equivalent_allowed',
  ADD COLUMN IF NOT EXISTS "allowUpgrade"              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "requiredExactVehicleId"    INTEGER,
  ADD COLUMN IF NOT EXISTS "requiredExactDriverId"     INTEGER,
  ADD COLUMN IF NOT EXISTS "pickupWindowStart"         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "pickupWindowEnd"           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "dropoffWindowStart"        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "dropoffWindowEnd"          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "fixedAppointmentTime"      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "isFlexibleTime"            BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS priority                    INTEGER NOT NULL DEFAULT 0;

-- Constraint: vehicleSubstitutionPolicy must be one of the 6 allowed values.
ALTER TABLE public.transport_bookings
  DROP CONSTRAINT IF EXISTS transport_bookings_substitution_policy_check;
ALTER TABLE public.transport_bookings
  ADD CONSTRAINT transport_bookings_substitution_policy_check CHECK (
    "vehicleSubstitutionPolicy" = ANY (ARRAY[
      'exact_only', 'same_class_only', 'equivalent_allowed',
      'upgrade_allowed', 'operator_approval', 'customer_approval'
    ]::text[])
  );

-- 2) Driver-rest fields. NULL lastDutyEndedAt = never assigned (fresh).
ALTER TABLE public.fleet_drivers
  ADD COLUMN IF NOT EXISTS "restHoursRequired" NUMERIC(4,2) NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS "lastDutyEndedAt"   TIMESTAMPTZ;

-- 3) Time-estimate fields on dispatch orders.
ALTER TABLE public.transport_dispatch_orders
  ADD COLUMN IF NOT EXISTS "estimatedPrepMinutes"      INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedTravelMinutes"    INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedLoadingMinutes"   INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedUnloadingMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "estimatedDistanceKm"       NUMERIC(10,3);

-- 4) transport_planning_settings — one row per company.
CREATE TABLE IF NOT EXISTS public.transport_planning_settings (
  "companyId"                INTEGER PRIMARY KEY,
  "mapProvider"              TEXT NOT NULL DEFAULT 'manual_only',
  "mapProviderApiKey"        TEXT,                    -- nullable; provider-specific
  "defaultRestHoursRequired" NUMERIC(4,2) NOT NULL DEFAULT 8,
  "defaultLoadingMinutes"    INTEGER NOT NULL DEFAULT 15,
  "defaultUnloadingMinutes"  INTEGER NOT NULL DEFAULT 15,
  "defaultBufferMinutes"     INTEGER NOT NULL DEFAULT 15,
  "defaultDeadheadKmh"       INTEGER NOT NULL DEFAULT 60,  -- average speed for haversine estimates
  "estimateCacheTtlMinutes"  INTEGER NOT NULL DEFAULT 1440, -- 24h default cache
  "createdAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transport_planning_map_provider_check CHECK (
    "mapProvider" = ANY (ARRAY['manual_only', 'google_maps', 'mapbox', 'here_maps']::text[])
  )
);

-- 5) transport_route_estimates — provider-agnostic cache for MapsService.
-- Keyed on (companyId, origin/destination + provider). Reads with a
-- TTL filter; writes are upserts on the natural key.
CREATE TABLE IF NOT EXISTS public.transport_route_estimates (
  id                  SERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL,
  provider            TEXT NOT NULL,
  "originLat"         NUMERIC(9,6) NOT NULL,
  "originLng"         NUMERIC(9,6) NOT NULL,
  "destinationLat"    NUMERIC(9,6) NOT NULL,
  "destinationLng"    NUMERIC(9,6) NOT NULL,
  "distanceMeters"    INTEGER NOT NULL,
  "durationSeconds"   INTEGER NOT NULL,
  "encodedPolyline"   TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt"         TIMESTAMPTZ NOT NULL,
  CONSTRAINT transport_route_estimates_provider_check CHECK (
    provider = ANY (ARRAY['manual_only', 'google_maps', 'mapbox', 'here_maps']::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_route_estimates_lookup
  ON public.transport_route_estimates (
    "companyId", provider, "originLat", "originLng", "destinationLat", "destinationLng"
  );
CREATE INDEX IF NOT EXISTS idx_route_estimates_expiry
  ON public.transport_route_estimates ("expiresAt");

-- 6) driver_navigation_sessions — one per active dispatch_order.
CREATE TABLE IF NOT EXISTS public.driver_navigation_sessions (
  id                  SERIAL PRIMARY KEY,
  "companyId"         INTEGER NOT NULL,
  "dispatchOrderId"   INTEGER NOT NULL,
  "driverId"          INTEGER NOT NULL,
  "vehicleId"         INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  "startedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "endedAt"           TIMESTAMPTZ,
  "originLat"         NUMERIC(9,6),
  "originLng"         NUMERIC(9,6),
  "destinationLat"    NUMERIC(9,6),
  "destinationLng"    NUMERIC(9,6),
  "lastLat"           NUMERIC(9,6),
  "lastLng"           NUMERIC(9,6),
  "lastSpeedKmh"      NUMERIC(6,2),
  "lastHeading"       NUMERIC(5,2),
  "lastPingAt"        TIMESTAMPTZ,
  "etaSeconds"        INTEGER,
  "remainingMeters"   INTEGER,
  provider            TEXT NOT NULL DEFAULT 'manual_only',
  "arrivedPickupAt"   TIMESTAMPTZ,
  "loadedAt"          TIMESTAMPTZ,
  "arrivedDropoffAt"  TIMESTAMPTZ,
  "deliveredAt"       TIMESTAMPTZ,
  notes               TEXT,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT driver_nav_status_check CHECK (
    status = ANY (ARRAY[
      'active', 'arrived_pickup', 'loaded',
      'arrived_dropoff', 'delivered', 'ended', 'cancelled'
    ]::text[])
  )
);

-- Only one ACTIVE session per dispatch order at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_nav_active_per_order
  ON public.driver_navigation_sessions ("dispatchOrderId")
  WHERE status NOT IN ('ended', 'cancelled');

CREATE INDEX IF NOT EXISTS idx_driver_nav_driver
  ON public.driver_navigation_sessions ("companyId", "driverId", status);

-- 7) transport_itineraries + transport_itinerary_legs.
-- An itinerary is a chained-trip program (e.g. an umrah group's full
-- ground-transport from airport → Makkah → Madinah → airport).
-- Each leg has its own pickup/dropoff + scheduled window and can be
-- assigned independently to a (vehicle, driver) — but the planning
-- engine respects the chain.
CREATE TABLE IF NOT EXISTS public.transport_itineraries (
  id                       SERIAL PRIMARY KEY,
  "companyId"              INTEGER NOT NULL,
  "branchId"               INTEGER,
  "itineraryName"          TEXT NOT NULL,
  "customerId"             INTEGER,
  "umrahGroupId"           INTEGER,
  "transportServiceType"   TEXT NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'draft',
  "startsAt"               TIMESTAMPTZ,
  "endsAt"                 TIMESTAMPTZ,
  notes                    TEXT,
  "createdBy"              INTEGER,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"              TIMESTAMPTZ,
  CONSTRAINT transport_itin_status_check CHECK (
    status = ANY (ARRAY['draft', 'scheduled', 'in_progress', 'completed', 'cancelled']::text[])
  ),
  CONSTRAINT transport_itin_service_check CHECK (
    "transportServiceType" = ANY (ARRAY[
      'cargo_load', 'passenger_umrah', 'passenger_general',
      'equipment_rental', 'internal_transfer', 'other'
    ]::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_transport_itineraries_lookup
  ON public.transport_itineraries ("companyId", status, "startsAt")
  WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS public.transport_itinerary_legs (
  id                       SERIAL PRIMARY KEY,
  "companyId"              INTEGER NOT NULL,
  "itineraryId"            INTEGER NOT NULL REFERENCES public.transport_itineraries (id) ON DELETE CASCADE,
  "legNumber"              INTEGER NOT NULL,
  "legType"                TEXT NOT NULL DEFAULT 'transit',
  "originText"             TEXT,
  "originLocationId"       INTEGER,
  "destinationText"        TEXT,
  "destinationLocationId"  INTEGER,
  "scheduledStart"         TIMESTAMPTZ,
  "scheduledEnd"           TIMESTAMPTZ,
  "pickupWindowStart"      TIMESTAMPTZ,
  "pickupWindowEnd"        TIMESTAMPTZ,
  "dropoffWindowStart"     TIMESTAMPTZ,
  "dropoffWindowEnd"       TIMESTAMPTZ,
  "requiredVehicleClass"   TEXT,
  "assignedVehicleId"      INTEGER,
  "assignedDriverId"       INTEGER,
  "dispatchOrderId"        INTEGER,
  "estimatedDistanceKm"    NUMERIC(10,3),
  "estimatedDurationMinutes" INTEGER,
  status                   TEXT NOT NULL DEFAULT 'pending',
  notes                    TEXT,
  "createdAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT transport_leg_status_check CHECK (
    status = ANY (ARRAY[
      'pending', 'scheduled', 'assigned', 'in_progress', 'completed',
      'cancelled', 'skipped'
    ]::text[])
  ),
  CONSTRAINT transport_leg_type_check CHECK (
    "legType" = ANY (ARRAY[
      'transit', 'pickup', 'dropoff', 'rest', 'fuel', 'inspection',
      'custom'
    ]::text[])
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transport_legs_order
  ON public.transport_itinerary_legs ("itineraryId", "legNumber");
CREATE INDEX IF NOT EXISTS idx_transport_legs_lookup
  ON public.transport_itinerary_legs ("companyId", "itineraryId", status);

COMMIT;
