-- 350_umrah_package_default_hotel.sql
--
-- WHAT:    add nullable `defaultHotelId` column to umrah_packages so a
--          package (product catalog row) can carry a reference to its
--          contracted hotel — the operational link the audit found
--          missing.
--
-- WHY:     U-15 audit (#2310) §2.1 documented that umrah_packages has
--          4 includes-* booleans but 0 FKs to the hotels/blocks/
--          transport/meals operational models. A package marked
--          `includesHotel=true` does not say WHICH hotel — operators
--          end up with three sources of truth for "what hotel does
--          this pilgrim stay in?" (allocation row > pilgrim hotelName
--          string > nothing on the package). This migration introduces
--          the missing column. The resolver helper that uses it is
--          U-15-P2 (separate slice); the FE picker is U-15-P3.
--
-- SAFETY:  pure additive. Nullable. No FK constraint (legacy packages
--          can stay NULL forever; tenants opt in via the editor in
--          U-15-P3). No backfill. Resolution order from migration
--          246 is preserved: allocation > hotelName > package. The
--          package becomes a third fallback, not a winner.
--
--          Matches the BILL-MAIN P2 + U-05-P1 expand/contract shape.
--
-- @rollback: BEGIN;
--   ALTER TABLE umrah_packages DROP COLUMN IF EXISTS "defaultHotelId";
--   COMMIT;

BEGIN;

ALTER TABLE umrah_packages
  ADD COLUMN IF NOT EXISTS "defaultHotelId" integer;

-- Partial index so the U-15-P5 pricing-drift report query can scan
-- only packages that actually carry a hotel reference. Most legacy
-- rows will have defaultHotelId IS NULL and don't need indexing.
CREATE INDEX IF NOT EXISTS idx_umrah_packages_default_hotel
  ON umrah_packages ("companyId", "defaultHotelId")
  WHERE "defaultHotelId" IS NOT NULL AND "deletedAt" IS NULL;

COMMIT;
