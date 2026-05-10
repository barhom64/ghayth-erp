-- Add Phase 3 import columns to umrah_pilgrims
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "nuskNumber" VARCHAR(80);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "entryPort" VARCHAR(120);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "exitPort" VARCHAR(120);
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "overstayDays" INTEGER;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "actualStayDays" INTEGER;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "subAgentId" INTEGER;
ALTER TABLE umrah_pilgrims ADD COLUMN IF NOT EXISTS "branchId" INTEGER;

CREATE INDEX IF NOT EXISTS idx_umrah_pilgrims_nusk ON umrah_pilgrims("companyId","nuskNumber") WHERE "deletedAt" IS NULL;
