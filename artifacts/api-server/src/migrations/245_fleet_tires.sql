-- 245_fleet_tires.sql
--
-- WHAT:    add `fleet_tires` table — per-vehicle tire inventory with
--          install/replace lifecycle. Closes N4 from
--          docs/testing/CRITICAL_DEFECTS_REPORT.md.
--
-- WHY:     pre-fix, tires existed only as preventive-plan task type and
--          alert reason. Fleet manager wanting to track tire stock,
--          rotations, or per-tire wear had no entity. This adds a
--          minimal entity with: id, companyId, branchId, vehicleId,
--          position (front-left/right, rear-left/right, spare), brand,
--          size, installMileage, installDate, replaceMileage,
--          replaceDate, status, notes.
--
-- SAFETY:  pure additive. No existing data touched. tripId / driverId
--          deliberately omitted — tire is bound to vehicle position,
--          not trip.
--
-- @rollback: DROP TABLE IF EXISTS fleet_tires;

BEGIN;

CREATE TABLE IF NOT EXISTS fleet_tires (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "branchId"      INTEGER,
  "vehicleId"     INTEGER NOT NULL,
  position        VARCHAR(20) NOT NULL,
  brand           VARCHAR(80),
  size            VARCHAR(40),
  "installMileage" INTEGER,
  "installDate"   DATE,
  "replaceMileage" INTEGER,
  "replaceDate"   DATE,
  status          VARCHAR(20) NOT NULL DEFAULT 'active',
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"     TIMESTAMPTZ,
  CHECK (position IN ('front_left', 'front_right', 'rear_left', 'rear_right', 'spare', 'extra')),
  CHECK (status IN ('active', 'rotated', 'replaced', 'discarded'))
);

CREATE INDEX IF NOT EXISTS idx_fleet_tires_vehicle
  ON fleet_tires ("companyId", "vehicleId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_fleet_tires_status
  ON fleet_tires ("companyId", status)
  WHERE "deletedAt" IS NULL AND status = 'active';

COMMIT;
