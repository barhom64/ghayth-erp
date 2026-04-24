-- Migration 079: Add missing columns to umrah_pilgrims
-- Found by schema-query drift audit — umrahImportEngine.ts references 17 columns
-- that don't exist in the table definition

ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "branchId" integer;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "createdBy" integer;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "nuskNumber" varchar(50);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "passportExpiry" date;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "groupId" integer;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "subAgentId" integer;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "entryPort" varchar(100);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "entryFlight" varchar(50);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "exitPort" varchar(100);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "exitFlight" varchar(50);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "actualStayDays" integer;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "programDuration" integer;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "overstayDays" integer;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "borderNumber" varchar(50);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "mofaNumber" varchar(50);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "isInsideKingdom" boolean DEFAULT false;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "hasUmrahPermit" boolean DEFAULT false;
