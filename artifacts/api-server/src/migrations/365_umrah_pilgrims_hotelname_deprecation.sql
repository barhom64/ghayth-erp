-- U-15-P4 — deprecation marker on umrah_pilgrims."hotelName".
--
-- The structured accommodation_bookings model (migration 246) is the
-- new source of truth for "where is this pilgrim staying". The legacy
-- free-text `hotelName` column on umrah_pilgrims predates that model
-- and is now retained only for backwards-compat reads (dashboards,
-- import history). New code must NOT write through it — the
-- accommodation_bookings + accommodation_rooms + properties chain is
-- the authoritative path. Existing two writers (POST /umrah/pilgrims
-- legacy create + PUT update) are grandfathered by the static smoke
-- so they don't regress, but no third writer may appear.
--
-- This migration only adds a column COMMENT. No DDL, no data move,
-- no constraint change. The actual column drop is U-15-P6 (separate
-- slice, hard-pause).

COMMENT ON COLUMN umrah_pilgrims."hotelName" IS
  '[DEPRECATED — U-15-P4] free-text legacy field. New writes should populate accommodation_bookings via the structured 3-table model (migration 246). Read paths retained for dashboard + import-history backwards-compat. Column drop is U-15-P6.';
