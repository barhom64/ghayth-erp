-- 246_umrah_accommodations.sql
--
-- WHAT:    add `umrah_hotels` + `umrah_room_blocks` + `umrah_room_allocations`
--          tables — a minimal accommodation model for the umrah operations
--          module. Closes N6 from
--          docs/testing/CRITICAL_DEFECTS_REPORT.md.
--
-- WHY:     pre-fix, hotel info was a free-text `hotelName` string on
--          `umrah_pilgrims`. A manager running 200 mutamers across 3
--          hotels had no way to track room availability, per-night
--          rates, or who's in which room. This adds a 3-table model
--          that supports the basic ops:
--            - umrah_hotels: catalog of contracted hotels
--            - umrah_room_blocks: per-season per-hotel allotment
--              (e.g. "Hilton Makkah, season X, 50 rooms, 350 SAR/night")
--            - umrah_room_allocations: which pilgrim got which room
--              within a block (links to umrah_pilgrims.id)
--
--          The `hotelName` string on umrah_pilgrims stays for backward
--          compatibility — when an allocation row exists it takes
--          precedence; otherwise the legacy string is the source of
--          truth.
--
-- SAFETY:  pure additive migration. Existing pilgrim records keep
--          their hotelName string and report unchanged.
--
-- @rollback: BEGIN;
--   DROP TABLE IF EXISTS umrah_room_allocations;
--   DROP TABLE IF EXISTS umrah_room_blocks;
--   DROP TABLE IF EXISTS umrah_hotels;
--   COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS umrah_hotels (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "branchId"      INTEGER,
  name            VARCHAR(200) NOT NULL,
  "nameEn"        VARCHAR(200),
  city            VARCHAR(60),
  address         TEXT,
  "starRating"    INTEGER,
  "contactName"   VARCHAR(120),
  "contactPhone"  VARCHAR(40),
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"     TIMESTAMPTZ,
  CHECK ("starRating" IS NULL OR ("starRating" BETWEEN 1 AND 7))
);

CREATE INDEX IF NOT EXISTS idx_umrah_hotels_city
  ON umrah_hotels ("companyId", city)
  WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS umrah_room_blocks (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "hotelId"       INTEGER NOT NULL,
  "seasonId"      INTEGER,
  "checkInDate"   DATE,
  "checkOutDate"  DATE,
  "roomType"      VARCHAR(40),
  "totalRooms"    INTEGER NOT NULL DEFAULT 0,
  "ratePerNight"  NUMERIC(10,2),
  currency        CHAR(3) DEFAULT 'SAR',
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"     TIMESTAMPTZ,
  CHECK ("roomType" IS NULL OR "roomType" IN ('single', 'double', 'triple', 'quad', 'suite'))
);

CREATE INDEX IF NOT EXISTS idx_umrah_room_blocks_hotel_season
  ON umrah_room_blocks ("companyId", "hotelId", "seasonId")
  WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS umrah_room_allocations (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "blockId"       INTEGER NOT NULL,
  "pilgrimId"     INTEGER NOT NULL,
  "roomNumber"    VARCHAR(40),
  "occupants"     INTEGER DEFAULT 1,
  "checkInAt"     TIMESTAMPTZ,
  "checkOutAt"    TIMESTAMPTZ,
  notes           TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"     TIMESTAMPTZ,
  CHECK ("occupants" > 0 AND "occupants" < 10)
);

CREATE INDEX IF NOT EXISTS idx_umrah_allocations_block
  ON umrah_room_allocations ("companyId", "blockId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_umrah_allocations_pilgrim
  ON umrah_room_allocations ("companyId", "pilgrimId")
  WHERE "deletedAt" IS NULL;

COMMIT;
