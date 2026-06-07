-- 267_vehicle_components_assignments.sql
--
-- @rollback:
--   DROP TABLE IF EXISTS public.vehicle_maintenance_schedules;
--   DROP TABLE IF EXISTS public.vehicle_driver_assignments;
--   DROP TABLE IF EXISTS public.vehicle_components;
--   ALTER TABLE public.fleet_tires
--     DROP COLUMN IF EXISTS "axleNumber",
--     DROP COLUMN IF EXISTS side,
--     DROP COLUMN IF EXISTS "serialNumber",
--     DROP COLUMN IF EXISTS "currentMileageKm",
--     DROP COLUMN IF EXISTS "expectedLifeKm",
--     DROP COLUMN IF EXISTS "removalReason";
--
-- #1733 Vehicle profile deep extension (Issue Comment 7). Three areas:
--
--   1. fleet_tires extension — adds axleNumber + side + serialNumber +
--      expectedLifeKm + currentMileageKm + removalReason so multi-axle
--      trucks / trailers can model each tire's exact position and the
--      tire wear is trackable independent of vehicle mileage.
--
--   2. vehicle_components — the lifecycle catalogue for the many
--      replaceable systems on a vehicle: engine, transmission, axles,
--      battery, AC unit, seats, upholstery, screens, brakes, suspension,
--      cooling unit, hydraulics, lift gate, crane, bus doors, safety
--      systems. Each row carries installation mileage / hours / date
--      and the expected service interval; maintenance schedules + the
--      operator's "what needs replacing soon?" board read from here.
--
--   3. vehicle_driver_assignments — history table for who drives what
--      vehicle. Three assignment types (primary / backup / temporary)
--      with start/end and reason. The accidents / violations /
--      maintenance modules query this to attribute "the driver at
--      time-of-incident".
--
--   4. vehicle_maintenance_schedules — preventive maintenance rules
--      (do oil change every 5000km, brake inspection every 6 months,
--      etc.) tied to either the vehicle or a specific component.

-- 1. fleet_tires extension.
ALTER TABLE public.fleet_tires
  ADD COLUMN IF NOT EXISTS "axleNumber"      integer,
  ADD COLUMN IF NOT EXISTS side              text,                  -- 'left' | 'right' | 'centre'
  ADD COLUMN IF NOT EXISTS "serialNumber"    text,
  ADD COLUMN IF NOT EXISTS "currentMileageKm" integer,
  ADD COLUMN IF NOT EXISTS "expectedLifeKm"  integer,
  ADD COLUMN IF NOT EXISTS "removalReason"   text;                  -- 'worn' | 'punctured' | 'rotation' | 'accident' | 'other'

CREATE INDEX IF NOT EXISTS idx_fleet_tires_serial
  ON public.fleet_tires ("companyId", "serialNumber")
  WHERE "serialNumber" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_tires_axle
  ON public.fleet_tires ("vehicleId", "axleNumber", side)
  WHERE "deletedAt" IS NULL;

-- 2. vehicle_components.
CREATE TABLE IF NOT EXISTS public.vehicle_components (
  id                    SERIAL PRIMARY KEY,
  "companyId"           INTEGER NOT NULL,
  "vehicleId"           INTEGER NOT NULL,
  "componentType"       TEXT NOT NULL,
  "componentSubtype"    TEXT,                  -- free-text for variants (e.g. "Cummins ISX15")
  "serialNumber"        TEXT,
  "manufacturer"        TEXT,
  "model"               TEXT,
  "installationDate"    DATE,
  "installationMileageKm" INTEGER,
  "installationHours"   NUMERIC(10,1),
  "expectedLifeKm"      INTEGER,
  "expectedLifeHours"   NUMERIC(10,1),
  "expectedLifeDays"    INTEGER,
  "lastServiceDate"     DATE,
  "lastServiceMileageKm" INTEGER,
  "nextServiceDate"     DATE,
  "nextServiceMileageKm" INTEGER,
  status                TEXT NOT NULL DEFAULT 'active',
  "removalDate"         DATE,
  "removalReason"       TEXT,
  notes                 TEXT,
  "createdBy"           INTEGER,
  "createdAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"           TIMESTAMPTZ,
  CONSTRAINT vehicle_components_type_check CHECK (
    "componentType" = ANY (ARRAY[
      'engine', 'transmission', 'axle', 'battery',
      'ac_unit', 'cooling_unit', 'hydraulic_system', 'lift_gate', 'crane',
      'box_or_bed', 'trailer', 'doors', 'seats', 'upholstery', 'screens',
      'brakes', 'suspension', 'steering', 'safety_system',
      'fuel_system', 'electrical_system', 'other'
    ]::text[])
  ),
  CONSTRAINT vehicle_components_status_check CHECK (
    status = ANY (ARRAY[
      'active', 'serviceable', 'needs_service', 'replaced', 'removed', 'damaged'
    ]::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_vehicle_components_vehicle
  ON public.vehicle_components ("vehicleId", status)
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_vehicle_components_next_service
  ON public.vehicle_components ("companyId", "nextServiceDate")
  WHERE "deletedAt" IS NULL AND status IN ('active', 'serviceable', 'needs_service');

-- 3. vehicle_driver_assignments — history table.
CREATE TABLE IF NOT EXISTS public.vehicle_driver_assignments (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER NOT NULL,
  "branchId"        INTEGER,
  "vehicleId"       INTEGER NOT NULL,
  "driverId"        INTEGER NOT NULL,
  "assignmentType"  TEXT NOT NULL,
  "startDate"       DATE NOT NULL,
  "endDate"         DATE,
  status            TEXT NOT NULL DEFAULT 'active',
  reason            TEXT,
  "createdBy"       INTEGER,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT vehicle_driver_assignments_type_check CHECK (
    "assignmentType" = ANY (ARRAY['primary', 'backup', 'temporary']::text[])
  ),
  CONSTRAINT vehicle_driver_assignments_status_check CHECK (
    status = ANY (ARRAY['active', 'ended', 'cancelled']::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_vehicle
  ON public.vehicle_driver_assignments ("vehicleId", status, "startDate" DESC);

CREATE INDEX IF NOT EXISTS idx_vehicle_assignments_driver
  ON public.vehicle_driver_assignments ("driverId", status, "startDate" DESC);

-- A vehicle can have only ONE active primary driver at a time. Partial
-- unique covers that without preventing historical primary rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vehicle_active_primary
  ON public.vehicle_driver_assignments ("vehicleId")
  WHERE status = 'active' AND "assignmentType" = 'primary';

-- 4. vehicle_maintenance_schedules — preventive rules.
CREATE TABLE IF NOT EXISTS public.vehicle_maintenance_schedules (
  id                 SERIAL PRIMARY KEY,
  "companyId"        INTEGER NOT NULL,
  "vehicleId"        INTEGER,             -- NULL → applies to all vehicles of `vehicleType`
  "vehicleType"      TEXT,                -- NULL when scoped to a specific vehicle
  "componentId"      INTEGER,             -- NULL when scoped to the whole vehicle
  "scheduleName"     TEXT NOT NULL,       -- "Oil change", "Brake inspection"...
  "intervalType"     TEXT NOT NULL,       -- 'mileage' | 'hours' | 'days'
  "intervalValue"    INTEGER NOT NULL,
  "lastTriggeredAt"  TIMESTAMPTZ,
  "lastTriggeredKm"  INTEGER,
  "lastTriggeredHours" NUMERIC(10,1),
  "nextDueDate"      DATE,
  "nextDueKm"        INTEGER,
  "nextDueHours"     NUMERIC(10,1),
  "isActive"         BOOLEAN NOT NULL DEFAULT TRUE,
  notes              TEXT,
  "createdBy"        INTEGER,
  "createdAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"        TIMESTAMPTZ,
  CONSTRAINT vehicle_maintenance_schedules_interval_check CHECK (
    "intervalType" = ANY (ARRAY['mileage', 'hours', 'days']::text[])
  )
);

CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_due
  ON public.vehicle_maintenance_schedules ("companyId", "nextDueDate")
  WHERE "isActive" AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_vehicle
  ON public.vehicle_maintenance_schedules ("vehicleId")
  WHERE "vehicleId" IS NOT NULL AND "deletedAt" IS NULL;
