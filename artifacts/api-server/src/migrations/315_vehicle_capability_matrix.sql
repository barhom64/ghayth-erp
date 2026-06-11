-- 315_vehicle_capability_matrix.sql
--
-- WHAT: extend fleet_vehicles with the two columns the Vehicle
--       Capability Matrix (VCM) needs to express the operator's
--       actual operating limits, in addition to the nominal ones
--       already carried since migrations 262 / 284 / 295:
--         • operationalPassengerCapacity — the safe operating pax
--           count (mirror of operationalPayloadKg). Distinct from
--           seatCount (the nominal seat-belt count). Operators
--           routinely set this lower than seatCount to leave a
--           luggage/comfort margin or to honour an HCT regulator
--           limit lower than the manufacturer rating.
--         • vehicleServiceTypes — explicit array of the service
--           types the vehicle is APPROVED to run (a `passenger_umrah`
--           bus may not be cleared for `cargo_load`, etc). Today the
--           engine derives eligibility from `validForPassengers`
--           and `validForCargo` (booleans, migration 295) which only
--           split the two trip families — the array gives operations
--           a finer-grained switch per booking serviceType.
--
-- WHY:  #2079 Gate-PE-1 (Vehicle Capability Matrix canon). The
--       owner's two failing scenarios — *«طلب عمرة 45 راكب → قد
--       يقترح النظام مركبة لا تستوعب العدد»* and *«حمولة 38 طن
--       وحمولة تشغيلية 30 طن»* — both stem from the assignment
--       engine being blind to operational caps. The first is fixed
--       by introducing operationalPassengerCapacity + reading it in
--       the capacity scorer; the second is fixed by reading
--       operationalPayloadKg (already on the row since 295) in the
--       same scorer. The new view bundles both with the existing
--       eligibility flags so the engine can hard-eject ineligible
--       candidates before scoring, instead of letting them surface
--       with high scores and trusting `assertCapacity` at dispatch.
--
-- SAFETY: pure additive. Both columns are nullable so legacy rows
--         remain valid. NULL is interpreted by the VCM helper as
--         "fall back to nominal" (operationalPassengerCapacity →
--         seatCount, vehicleServiceTypes → derived from
--         validFor{Passengers,Cargo}) so behaviour for vehicles that
--         haven't been profiled yet matches the pre-VCM engine.
--
-- @rollback: BEGIN;
--              ALTER TABLE public.fleet_vehicles
--                DROP COLUMN IF EXISTS "operationalPassengerCapacity",
--                DROP COLUMN IF EXISTS "vehicleServiceTypes";
--            COMMIT;

BEGIN;

ALTER TABLE public.fleet_vehicles
  ADD COLUMN IF NOT EXISTS "operationalPassengerCapacity" NUMERIC(6,1),
  ADD COLUMN IF NOT EXISTS "vehicleServiceTypes"          TEXT[];

-- Partial index for the engine's per-family eligibility filter.
-- The scorer reads vehicleServiceTypes only when the booking's
-- transportServiceType doesn't already match the simpler
-- validFor{Passengers,Cargo} boolean — the index lets that lookup
-- stay cheap on large fleets.
CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_service_types
  ON public.fleet_vehicles USING GIN ("vehicleServiceTypes")
  WHERE "vehicleServiceTypes" IS NOT NULL AND "deletedAt" IS NULL;

-- CHECK constraint on the array values. Mirrors the booking-side
-- enum in routes/transport-bookings.ts so the two surfaces can never
-- drift: a service-type added there must also be allowed here.
-- Idempotent via NOT EXISTS guard (no DROP/CREATE cycle so the
-- migration-policy linter sees only additive intent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fleet_vehicles_service_types_check'
       AND conrelid = 'public.fleet_vehicles'::regclass
  ) THEN
    ALTER TABLE public.fleet_vehicles
      ADD CONSTRAINT fleet_vehicles_service_types_check CHECK (
        "vehicleServiceTypes" IS NULL
        OR (
          array_length("vehicleServiceTypes", 1) > 0
          AND "vehicleServiceTypes" <@ ARRAY[
            'cargo_load',
            'passenger_umrah',
            'passenger_general',
            'equipment_rental',
            'internal_transfer',
            'other'
          ]::text[]
        )
      );
  END IF;
END$$;

-- operationalPassengerCapacity must be ≤ seatCount when both set.
-- A "safe operating" cap above the seat-belt count would be a data
-- entry mistake — fail loudly rather than silently.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fleet_vehicles_op_pax_within_seats_check'
       AND conrelid = 'public.fleet_vehicles'::regclass
  ) THEN
    ALTER TABLE public.fleet_vehicles
      ADD CONSTRAINT fleet_vehicles_op_pax_within_seats_check CHECK (
        "operationalPassengerCapacity" IS NULL
        OR "seatCount" IS NULL
        OR "operationalPassengerCapacity" <= "seatCount"
      );
  END IF;
END$$;

COMMIT;
