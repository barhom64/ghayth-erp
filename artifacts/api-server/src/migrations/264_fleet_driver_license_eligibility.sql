-- 264_fleet_driver_license_eligibility.sql
--
-- @rollback:
--   DROP TABLE IF EXISTS public.driver_eligibility_overrides;
--   ALTER TABLE public.fleet_vehicles DROP COLUMN IF EXISTS "requiredLicenseClass";
--   ALTER TABLE public.fleet_drivers DROP COLUMN IF EXISTS "licenseClass";
--
-- #1733 Phase 2 / Gap #2 — driver eligibility verification.
--
-- The Blocker pass solved capacity (#1733 Phase 1 Blocker #2) but left
-- the matching driver-side rule untouched:
--
--   لا يمكن إسناد سائق غير مؤهل إلا باستثناء موثق
--
-- (Cannot assign an unqualified driver except by documented exception.)
--
-- Without `licenseClass` on the driver and `requiredLicenseClass` on
-- the vehicle, the system has no way to express the rule — every
-- driver looks like every other driver to the cargo / umrah assignment
-- routes. This migration adds the two columns plus the documented-
-- exception log so audit can ask "who put a private-license driver
-- behind a Class C truck and why".
--
-- Both columns are nullable. The eligibility helper treats NULL on
-- either side as "unknown → soft-allow with warning event" so legacy
-- fleets aren't blocked from operating until the profile is filled in.

ALTER TABLE public.fleet_drivers
  ADD COLUMN IF NOT EXISTS "licenseClass" text;     -- 'private' | 'light_trans' | 'medium' | 'heavy' | 'public_trans' | 'motorcycle' | 'equipment'

ALTER TABLE public.fleet_vehicles
  ADD COLUMN IF NOT EXISTS "requiredLicenseClass" text;  -- same alphabet as drivers; vehicle needs at least this class

-- "Find drivers qualified for class X" — partial index keeps it small
-- (NULL/legacy rows excluded).
CREATE INDEX IF NOT EXISTS idx_fleet_drivers_license_class
  ON public.fleet_drivers ("companyId", "licenseClass")
  WHERE "licenseClass" IS NOT NULL AND "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_vehicles_req_class
  ON public.fleet_vehicles ("companyId", "requiredLicenseClass")
  WHERE "requiredLicenseClass" IS NOT NULL AND "deletedAt" IS NULL;

-- Documented-exception log. Mirror of vehicle_capacity_overrides (#1733
-- Blocker #2) — every accepted-but-unqualified assignment leaves an
-- audit trail with reason + approver + back-pointer.
CREATE TABLE IF NOT EXISTS public.driver_eligibility_overrides (
  id                       SERIAL PRIMARY KEY,
  "companyId"              INTEGER NOT NULL,
  "branchId"               INTEGER,
  "driverId"               INTEGER NOT NULL,
  "vehicleId"              INTEGER NOT NULL,
  "sourceType"             TEXT NOT NULL,    -- 'cargo_manifest' | 'fleet_trip' | 'umrah_transport'
  "sourceId"               INTEGER NOT NULL,
  "driverLicenseClass"     TEXT,
  "vehicleRequiredClass"   TEXT NOT NULL,
  reason                   TEXT NOT NULL,
  "approvedBy"             INTEGER NOT NULL,
  "approvedAt"             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_eligibility_override_source
    UNIQUE ("companyId", "sourceType", "sourceId")
);

CREATE INDEX IF NOT EXISTS idx_eligibility_overrides_driver
  ON public.driver_eligibility_overrides ("companyId", "driverId", "approvedAt" DESC);
