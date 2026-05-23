-- 196_fleet_trips_source_key.sql
--
-- O-7 — `POST /trips` has no idempotency guard, so an operator double-
-- click (or any retried POST) can create two `fleet_trips` rows. The
-- existing `UPDATE fleet_vehicles SET status='in_use' WHERE
-- status='available'` race-guard catches duplicates only when the
-- operator explicitly passed the SAME `vehicleId` — when the caller
-- omits the vehicle and the auto-selector runs on each click, click
-- #2 picks a DIFFERENT available vehicle/driver, both INSERTs succeed,
-- and the company ends up with two trips for what should have been
-- one operator action.
--
-- Adds an optional `sourceKey` text column carrying the request's
-- `Idempotency-Key` header (resolved via `requestIdempotencyToken`).
-- Paired with a partial-unique index, a retried POST collapses onto
-- the same row at the database level — no race window between
-- application-layer check and INSERT.
--
-- `sourceKey` is NULLABLE; existing rows and any future caller that
-- omits the header continue to behave as today (no idempotency
-- semantics, no constraint). Only requests carrying a key are
-- de-duped.
--
-- @rollback:
--   DROP INDEX IF EXISTS uniq_fleet_trips_source_key;
--   ALTER TABLE fleet_trips DROP COLUMN IF EXISTS "sourceKey";

ALTER TABLE fleet_trips ADD COLUMN IF NOT EXISTS "sourceKey" varchar(128);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_fleet_trips_source_key
    ON fleet_trips ("companyId", "sourceKey")
    WHERE "sourceKey" IS NOT NULL;
