-- 243_fleet_fuel_logs_trip_link.sql
--
-- WHAT:    add `tripId` column to fleet_fuel_logs so a fuel log can be
--          linked to the trip it was burned on. Closes the M7 gap in
--          docs/testing/CRITICAL_DEFECTS_REPORT.md (fuel double-counting
--          between an operator-logged refuel and the trip-completion
--          estimate-based GL post).
--
-- WHY:     Pre-fix:
--             1. Driver records a refuel via POST /fleet/fuel-logs →
--                fleetEngine.postFuelExpenseGL posts a JE for the actual
--                amount.
--             2. Operator later completes the trip via POST
--                /trips/:id/complete; the handler estimates fuel cost
--                from distance / efficiency and posts a SECOND JE for
--                that estimate.
--             Fuel expense ends up roughly DOUBLE the real amount in
--             the GL, depending on whether the operator logged before
--             or after completion.
--          After this column lands, the trip-complete handler can sum
--          actual fuel_logs.totalCost for the trip and use that
--          instead of the estimate when any actual log exists.
--
-- SAFETY:  pure additive migration. tripId defaults to NULL so every
--          existing fuel log keeps its current semantics. The trip-
--          complete handler treats NULL-tripId fuel logs as
--          unaccounted-for and STILL uses the estimate — only logs
--          with a matching tripId switch the path to actuals.
--
-- @rollback: ALTER TABLE fleet_fuel_logs DROP COLUMN IF EXISTS "tripId";
--            (drops the column. The trip-complete handler degrades
--             gracefully — it falls back to the estimate when no log
--             carries a matching tripId, which is the pre-fix
--             behaviour.)

BEGIN;

ALTER TABLE public.fleet_fuel_logs
  ADD COLUMN IF NOT EXISTS "tripId" integer;

-- Lookup index for the per-trip aggregation in the complete handler.
-- Partial so it stays small — most fuel logs don't carry a tripId.
CREATE INDEX IF NOT EXISTS idx_fleet_fuel_logs_trip
  ON public.fleet_fuel_logs ("companyId", "tripId")
  WHERE "tripId" IS NOT NULL AND "deletedAt" IS NULL;

COMMIT;
