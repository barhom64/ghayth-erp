-- Migration 267 — Bus manifest: check-in + seat allocation
--
-- The pilgrim ↔ trip join already exists (migration 185), but it only
-- says "this pilgrim is assigned to this trip", not "this pilgrim
-- actually boarded the bus". On a real flight-day morning the agency
-- prints a manifest and the dispatcher needs to mark each pilgrim
-- "boarded" as they walk past — otherwise the trip leaves at 100%
-- "assigned" while a quarter of the passengers are still in the hotel.
--
-- This migration adds the operational fields the manifest UI needs:
--
--   - `seatNumber`  → seat assignment for printed manifest + boarding
--   - `checkedInAt` → when the pilgrim crossed the gate (server NOW())
--   - `checkedInBy` → which dispatcher marked them (audit)
--   - `noShow`      → flag for pilgrims who didn't board (the dispatcher
--                     marks this AFTER waiting; downstream reports use
--                     it to surface "left ahead of pilgrim X")
--   - `notes`       → ad-hoc text (medical, accompanying child, ...)

ALTER TABLE umrah_transport_pilgrims
  ADD COLUMN IF NOT EXISTS "seatNumber"  VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "checkedInAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "checkedInBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "noShow"      BOOLEAN DEFAULT FALSE NOT NULL,
  ADD COLUMN IF NOT EXISTS "notes"       TEXT;

-- Unique seat-per-trip — prevents two pilgrims being assigned the same
-- seat on the same bus. Partial: NULL seats are allowed during the
-- pre-trip assignment phase (dispatcher might pre-load pilgrims
-- without yet picking seats).
CREATE UNIQUE INDEX IF NOT EXISTS uq_umrah_transport_pilgrims_seat
  ON umrah_transport_pilgrims ("transportId", "seatNumber")
  WHERE "seatNumber" IS NOT NULL;

-- Quick lookup of "who's still not checked in on this trip?" — the
-- dispatcher's busiest query during boarding.
CREATE INDEX IF NOT EXISTS idx_umrah_transport_pilgrims_pending_checkin
  ON umrah_transport_pilgrims ("transportId")
  WHERE "checkedInAt" IS NULL AND "noShow" = FALSE;
