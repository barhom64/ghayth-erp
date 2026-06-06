-- 252_fleet_trips_updated_at.sql
--
-- Operational-readiness fix (#1609 under #1594).
--
-- PROBLEM
-- fleet_trips has createdAt but NO updatedAt. Completing a trip goes through
-- lifecycleEngine.applyTransition, which always appends `"updatedAt" = NOW()`
-- (unless skipUpdatedAt), so POST /fleet/trips/:id/complete crashed with
--   column "updatedAt" of relation "fleet_trips" does not exist
-- i.e. trips could be created but never completed (no GL cost entry posted).
--
-- FIX
-- Add the standard updatedAt column (additive, NOT NULL DEFAULT now() — safe
-- on a rolling deploy). Brings fleet_trips in line with the other lifecycle
-- entities and unblocks trip completion + its journal posting.
--
-- @rollback:
--   ALTER TABLE public.fleet_trips DROP COLUMN IF EXISTS "updatedAt";

ALTER TABLE public.fleet_trips
  ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now();
