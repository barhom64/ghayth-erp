-- Add remaining Phase 3 import columns to umrah_pilgrims
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "passportExpiry" DATE;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "groupId" INTEGER;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "entryFlight" VARCHAR(60);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "exitFlight" VARCHAR(60);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "programDuration" INTEGER;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "borderNumber" VARCHAR(80);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "mofaNumber" VARCHAR(80);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "isInsideKingdom" BOOLEAN DEFAULT FALSE;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "hasUmrahPermit" BOOLEAN DEFAULT FALSE;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "createdBy" INTEGER;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER;
