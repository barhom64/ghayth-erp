-- ============================================================================
-- 069_umrah_spec_alignment.sql
-- Aligns the existing schema with the Umrah spec document:
-- 1. Creates a VIEW umrah_mutamers → umrah_pilgrims (spec table name)
-- 2. Adds 'active' to umrah_seasons status CHECK (spec uses 'active')
-- 3. Adds isActive column to umrah_agents
-- 4. Adds missing compliance columns on umrah_agents
-- ============================================================================

-- 1. VIEW: umrah_mutamers as an alias for umrah_pilgrims
-- Existing code uses umrah_pilgrims; new code can use umrah_mutamers.
CREATE OR REPLACE VIEW umrah_mutamers AS SELECT * FROM umrah_pilgrims;

-- 2. Seasons status: spec says 'active', existing code uses 'open'.
-- Allow both so nothing breaks. Drop old constraint, add wider one.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'umrah_seasons_status_check'
  ) THEN
    ALTER TABLE umrah_seasons DROP CONSTRAINT umrah_seasons_status_check;
  END IF;
END$$;

ALTER TABLE umrah_seasons
  ADD CONSTRAINT umrah_seasons_status_check
  CHECK (status IN ('open','active','closed','archived'));

-- 3. Agents: add isActive boolean (spec requires it)
ALTER TABLE umrah_agents
  ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT TRUE;

-- Backfill isActive from existing status column
UPDATE umrah_agents SET "isActive" = (status = 'active')
WHERE "isActive" IS NULL OR "isActive" = TRUE;

-- 4. Agents: add missing country column if not exists
ALTER TABLE umrah_agents
  ADD COLUMN IF NOT EXISTS country VARCHAR(100);

-- ============================================================================
-- End of 069_umrah_spec_alignment.sql
-- ============================================================================
