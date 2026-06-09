-- Migration 279 — transport booking inline geocoding + location-kind enum
--
-- @rollback: Fully additive. To undo:
--   ALTER TABLE transport_bookings
--     DROP COLUMN IF EXISTS "fromLocationKind",
--     DROP COLUMN IF EXISTS "toLocationKind",
--     DROP COLUMN IF EXISTS "fromLat",
--     DROP COLUMN IF EXISTS "fromLng",
--     DROP COLUMN IF EXISTS "fromPlaceId",
--     DROP COLUMN IF EXISTS "toLat",
--     DROP COLUMN IF EXISTS "toLng",
--     DROP COLUMN IF EXISTS "toPlaceId";
--
-- #1812 operational review — user's gap list called out:
--   * "from/to without location type" — operators were typing freeform
--     addresses with no categorical bucket, blocking downstream rules
--     (e.g. "airport pickups need an extra buffer", "hotel dropoffs
--     require a hotel name").
--   * "missing maps lat/lng/placeId" — the booking header had no
--     coordinates, so MapsService could only estimate routes when both
--     endpoints were registered in transport_locations.
--
-- This migration adds eight inline columns to transport_bookings so a
-- freeform booking can still carry a canonical location kind + GPS
-- coordinates without forcing the operator into transport_locations
-- master-data first.
--
-- Canonical kinds: airport | gate | hotel | mazar | warehouse | project |
--                  customer_site | depot | mosque | other
--
-- The same vocabulary is enforced on transport_locations.locationType
-- via a NOT VALID CHECK (NOT VALID = no rewrite, no scan; existing rows
-- are grandfathered). The transport-bookings router gates new inserts
-- through a Zod enum so the values stay in sync.

ALTER TABLE transport_bookings
  ADD COLUMN IF NOT EXISTS "fromLocationKind" TEXT,
  ADD COLUMN IF NOT EXISTS "toLocationKind"   TEXT,
  ADD COLUMN IF NOT EXISTS "fromLat"          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS "fromLng"          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS "fromPlaceId"      TEXT,
  ADD COLUMN IF NOT EXISTS "toLat"            NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS "toLng"            NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS "toPlaceId"        TEXT;

-- Partial index — geo-aware route searches will WHERE on
-- fromLocationKind = 'airport' etc. Skip rows without a kind.
CREATE INDEX IF NOT EXISTS idx_transport_bookings_from_kind
  ON transport_bookings ("companyId", "fromLocationKind")
  WHERE "fromLocationKind" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transport_bookings_to_kind
  ON transport_bookings ("companyId", "toLocationKind")
  WHERE "toLocationKind" IS NOT NULL;
