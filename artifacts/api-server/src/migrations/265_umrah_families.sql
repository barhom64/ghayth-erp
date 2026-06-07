-- Migration 265 — Umrah families entity
--
-- @rollback:
--   ALTER TABLE umrah_pilgrims DROP COLUMN IF EXISTS "familyId";
--   DROP TABLE IF EXISTS umrah_families;
--
-- Real umrah ops run on family groups, not solo pilgrims. A husband,
-- wife, and 3 kids share a room, a bus seat block, and one set of
-- emergency contacts. The system was missing this grouping entirely:
-- pilgrims were linked to agents + sub-agents but not to each other,
-- so:
--
--   - "this family of 5 needs one quad + one single" was impossible
--     to express; ops shoehorned it into the notes field.
--   - "did the whole family check in?" required eyeball-matching by
--     surname (and there are common surnames).
--   - "the visa application is for the whole family" had no anchor.
--
-- This migration creates the family entity + back-references it from
-- pilgrims. Future PRs add: hotel allocation aware of families, bus
-- manifest grouped by family, family-level visa workflow.

CREATE TABLE IF NOT EXISTS umrah_families (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  -- Display name — usually "عائلة <surname>" or the head's surname.
  -- Required so the picker UI has something to render.
  "familyName"  VARCHAR(200) NOT NULL,
  -- Family head — typically the man paying for the trip or the
  -- senior member ops contacts. Nullable so a family can exist with
  -- no head set yet (operators may register the family first then
  -- enrol members, then nominate the head).
  "headPilgrimId" INTEGER REFERENCES umrah_pilgrims(id) ON DELETE SET NULL,
  -- Primary phone the agency calls for any family-level event
  -- (visa update, departure delay, refund request). Often the head's
  -- phone but kept separate so a non-head head can pick up.
  "contactPhone" VARCHAR(40),
  "contactName"  VARCHAR(200),
  -- Operator notes — free text for the things schema can't model
  -- (medical conditions, dietary, accessibility requirements, ...).
  notes          TEXT,
  "createdAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_umrah_families_companyId ON umrah_families("companyId");
CREATE INDEX IF NOT EXISTS idx_umrah_families_head      ON umrah_families("headPilgrimId");
CREATE INDEX IF NOT EXISTS idx_umrah_families_deletedAt ON umrah_families("deletedAt");
-- Family name search hits an ILIKE on the list page; the lower-trim
-- index supports the same matching the agents + sub-agents lists use.
CREATE INDEX IF NOT EXISTS idx_umrah_families_name_lower
  ON umrah_families (LOWER(TRIM("familyName")));

-- Pilgrim → family back-reference. Nullable: a family-less pilgrim
-- (lone traveller) is the dominant case for hajj individuals, so we
-- can't make this NOT NULL without breaking ingestion.
--
-- ON DELETE SET NULL: deleting a family record (soft or hard) should
-- not cascade-delete pilgrims; they keep their data, just lose the
-- family back-pointer.
ALTER TABLE umrah_pilgrims
  ADD COLUMN IF NOT EXISTS "familyId" INTEGER REFERENCES umrah_families(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_umrah_pilgrims_familyId
  ON umrah_pilgrims("familyId")
  WHERE "familyId" IS NOT NULL AND "deletedAt" IS NULL;
