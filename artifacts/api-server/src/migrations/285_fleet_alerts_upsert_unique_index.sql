-- 285_fleet_alerts_upsert_unique_index.sql
--
-- Operational-readiness fix (#1594 — write-path review, ON CONFLICT-target sweep).
--
-- PROBLEM
-- The fleet-alert recompute upserts every computed alert:
--   INSERT INTO fleet_alerts (…)
--   ON CONFLICT ("companyId", type, "relatedType", "relatedId") DO UPDATE SET …
-- (artifacts/api-server/src/routes/fleet.ts) — but fleet_alerts has NO unique
-- index on that tuple (nor any unique index at all besides the pk). Postgres
-- needs a unique/exclusion constraint matching the ON CONFLICT target to infer
-- the arbiter, so EVERY recompute 500s with
--   there is no unique or exclusion constraint matching the ON CONFLICT
--   specification
-- and the alerts table never gets populated (it is empty in every environment —
-- the only writer is this upsert, and it has never succeeded). Verified live.
--
-- FIX
-- Add the unique index the upsert's arbiter needs, on exactly
-- ("companyId", type, "relatedType", "relatedId"). The writer skips alerts with
-- a null relatedId, so inserted rows are non-null on the keyed columns; a plain
-- (non-partial) unique index is required — a partial index would not be inferred
-- by an ON CONFLICT clause that carries no matching WHERE predicate.
--
-- The dedup DELETE is defensive (the table is empty today); it keeps the newest
-- row per tuple so CREATE UNIQUE INDEX can't fail on pre-existing duplicates.
--
-- @rollback:
--   DROP INDEX IF EXISTS public.fleet_alerts_company_type_related_uidx;

DELETE FROM fleet_alerts a
 USING fleet_alerts b
 WHERE a.id < b.id
   AND a."companyId"   = b."companyId"
   AND a.type          = b.type
   AND a."relatedType" = b."relatedType"
   AND a."relatedId"   = b."relatedId";

CREATE UNIQUE INDEX IF NOT EXISTS fleet_alerts_company_type_related_uidx
  ON public.fleet_alerts ("companyId", type, "relatedType", "relatedId");
