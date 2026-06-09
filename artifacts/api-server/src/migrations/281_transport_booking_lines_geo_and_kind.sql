-- Migration 281 — multi-leg booking: inline geo + location kind + freeform on lines
--
-- @rollback: Fully additive. To undo:
--   ALTER TABLE transport_booking_lines
--     DROP COLUMN IF EXISTS "fromLocationText",
--     DROP COLUMN IF EXISTS "toLocationText",
--     DROP COLUMN IF EXISTS "fromLocationKind",
--     DROP COLUMN IF EXISTS "toLocationKind",
--     DROP COLUMN IF EXISTS "fromLat",
--     DROP COLUMN IF EXISTS "fromLng",
--     DROP COLUMN IF EXISTS "fromPlaceId",
--     DROP COLUMN IF EXISTS "toLat",
--     DROP COLUMN IF EXISTS "toLng",
--     DROP COLUMN IF EXISTS "toPlaceId",
--     DROP COLUMN IF EXISTS "legRouteType";
--
-- #1812 operational review — the user explicitly called this out as
-- "أكبر المشاكل" (the biggest problem):
--
--   "لا يوجد Multi-leg Booking … الواقع التشغيلي:
--    مطار جدة ↓ فندق مكة ↓ الحرم ↓ المدينة ↓ الفندق ↓ المطار.
--    لكن الواجهة الحالية: من / إلى فقط."
--
-- transport_booking_lines already represents per-leg resource needs +
-- pickup/delivery timestamps, so the data model can carry a multi-leg
-- trip. But each line was missing the same `fromLocationText` /
-- `kind` / inline geo that the booking header gained in #1888, so the
-- operator can't actually describe each leg without registering every
-- single stop in transport_locations master first.
--
-- This migration mirrors #1888's booking-header columns onto the
-- line. The booking-bookings router (next PR) will accept a `lines: []`
-- array on create + atomically insert them in withTransaction.

ALTER TABLE transport_booking_lines
  ADD COLUMN IF NOT EXISTS "fromLocationText"  TEXT,
  ADD COLUMN IF NOT EXISTS "toLocationText"    TEXT,
  ADD COLUMN IF NOT EXISTS "fromLocationKind"  TEXT,
  ADD COLUMN IF NOT EXISTS "toLocationKind"    TEXT,
  ADD COLUMN IF NOT EXISTS "fromLat"           NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS "fromLng"           NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS "fromPlaceId"       TEXT,
  ADD COLUMN IF NOT EXISTS "toLat"             NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS "toLng"             NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS "toPlaceId"         TEXT,
  -- Per-leg route type for umrah (airport_to_makkah / makkah_to_madinah / …).
  -- Different from the booking header's routeType because each leg can
  -- have its own classification (e.g. leg 1 = airport_to_makkah,
  -- leg 2 = makkah_local, leg 3 = makkah_to_madinah).
  ADD COLUMN IF NOT EXISTS "legRouteType"      TEXT;
