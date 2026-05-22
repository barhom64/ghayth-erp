-- Migration 193: add the vehicle purchase price + date columns.
--
-- RCA finding FLT-003 (docs/audit/inventory/fleet.md), Wave-2 defect.
--
-- GET /vehicles/:id/tco computes purchase cost and straight-line
-- depreciation from fleet_vehicles.purchasePrice / purchaseDate, and
-- POST /vehicles has a postVehicleAssetGL capitalisation block keyed on
-- the purchase price — but the table had neither column, so TCO always
-- read 0 and the asset-GL block was unreachable (the create schema
-- stripped the field before it could be used).
--
-- Both columns are additive and nullable — no backfill, no existing row
-- affected. Not a policy-breaking change.
--
-- @rollback:
--   ALTER TABLE fleet_vehicles DROP COLUMN IF EXISTS "purchasePrice";
--   ALTER TABLE fleet_vehicles DROP COLUMN IF EXISTS "purchaseDate";

ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS "purchasePrice" numeric(14,2);
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS "purchaseDate" date;
