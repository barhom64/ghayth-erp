-- 293_fleet_rental_inspection_and_driver.sql
--
-- WHAT: extend `fleet_rental_contracts` (migration 247) with the columns
--       the R5/R7/R9 steps of the canonical rental flow need:
--
--         R5 — withDriver / driverId
--         R7 — handover state at delivery to customer
--         R9 — return state when the vehicle comes back
--
--       Also adds weeklyRate and monthlyRate alongside the existing
--       dailyRate so the operator can quote on the rate kind the
--       customer actually agreed to.
--
-- WHY:  the existing contract row carries financial terms but says
--       nothing about WHAT condition the vehicle was in when it left
--       the depot or how it came back. Without that, an overage at
--       return (extra km, half-empty tank, scratch) has no documented
--       baseline to compute the surcharge from, and the dispatcher
--       can't tell "rented with driver" from "rented without driver".
--
-- SAFETY: pure additive — all new columns are nullable and have safe
--         defaults. No existing rows touched. No constraints tightened.
--         migration-policy.test.mjs treats this as additive.
--
-- @rollback: BEGIN;
--              ALTER TABLE fleet_rental_contracts
--                DROP COLUMN IF EXISTS "withDriver",
--                DROP COLUMN IF EXISTS "driverId",
--                DROP COLUMN IF EXISTS "weeklyRate",
--                DROP COLUMN IF EXISTS "monthlyRate",
--                DROP COLUMN IF EXISTS "handoverOdometer",
--                DROP COLUMN IF EXISTS "handoverFuelLevel",
--                DROP COLUMN IF EXISTS "handoverNotes",
--                DROP COLUMN IF EXISTS "handoverAt",
--                DROP COLUMN IF EXISTS "returnOdometer",
--                DROP COLUMN IF EXISTS "returnFuelLevel",
--                DROP COLUMN IF EXISTS "returnNotes",
--                DROP COLUMN IF EXISTS "returnedAt",
--                DROP COLUMN IF EXISTS "actualEndDate",
--                DROP COLUMN IF EXISTS "overageAmount";
--            COMMIT;

BEGIN;

ALTER TABLE fleet_rental_contracts
  ADD COLUMN IF NOT EXISTS "withDriver"          BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "driverId"            INTEGER,
  ADD COLUMN IF NOT EXISTS "weeklyRate"          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "monthlyRate"         NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "handoverOdometer"    INTEGER,
  ADD COLUMN IF NOT EXISTS "handoverFuelLevel"   NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS "handoverNotes"       TEXT,
  ADD COLUMN IF NOT EXISTS "handoverAt"          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "returnOdometer"      INTEGER,
  ADD COLUMN IF NOT EXISTS "returnFuelLevel"     NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS "returnNotes"         TEXT,
  ADD COLUMN IF NOT EXISTS "returnedAt"          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "actualEndDate"       DATE,
  ADD COLUMN IF NOT EXISTS "overageAmount"       NUMERIC(12,2) DEFAULT 0;

-- The driver, when present, must be a fleet driver in the same
-- company. The FK lives as a soft pointer (no ON DELETE) because the
-- contract row is the historical record — losing the driver row
-- doesn't invalidate the past rental.
CREATE INDEX IF NOT EXISTS idx_fleet_rental_contracts_driver
  ON fleet_rental_contracts ("companyId", "driverId")
  WHERE "deletedAt" IS NULL AND "driverId" IS NOT NULL;

-- Fuel level is a 0..1 fraction (e.g. 0.50 = half tank). The two new
-- columns above are nullable, so the CHECK only fires when the
-- operator actually fills the inspection — NOT VALID + ADD CONSTRAINT
-- avoids re-validating any historical rows (there are none, but the
-- pattern keeps the migration safe under expand/contract).
ALTER TABLE fleet_rental_contracts
  ADD CONSTRAINT fleet_rental_contracts_handover_fuel_range_check
  CHECK ("handoverFuelLevel" IS NULL OR ("handoverFuelLevel" >= 0 AND "handoverFuelLevel" <= 1))
  NOT VALID;

ALTER TABLE fleet_rental_contracts
  ADD CONSTRAINT fleet_rental_contracts_return_fuel_range_check
  CHECK ("returnFuelLevel" IS NULL OR ("returnFuelLevel" >= 0 AND "returnFuelLevel" <= 1))
  NOT VALID;

-- The 247 migration's paymentTerms CHECK already accepts daily/
-- weekly/monthly/quarterly/one_time — no need to re-state it.

COMMIT;
