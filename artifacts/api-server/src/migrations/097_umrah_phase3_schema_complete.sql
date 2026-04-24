-- Phase 3: complete schema for the import engine
-- 1) batches: needs updatedAt for the running totals UPDATE
ALTER TABLE umrah_import_batches ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- 2) agents: engine resolveAgent uses nuskAgentNumber + branchId + seasonId + createdBy + soft-delete + ON CONFLICT
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "seasonId" INTEGER;
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "nuskAgentNumber" VARCHAR(80);
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "createdBy" INTEGER;
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER;
ALTER TABLE umrah_agents ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS umrah_agents_company_nusk_agent_uq
  ON umrah_agents ("companyId","nuskAgentNumber") WHERE "deletedAt" IS NULL;

-- 3) sub_agents lookup speedup
CREATE INDEX IF NOT EXISTS umrah_sub_agents_company_nuskcode_idx
  ON umrah_sub_agents ("companyId","nuskCode") WHERE "deletedAt" IS NULL;

-- 4) groups lookup speedup
CREATE INDEX IF NOT EXISTS umrah_groups_company_nusk_group_idx
  ON umrah_groups ("companyId","nuskGroupNumber") WHERE "deletedAt" IS NULL;

-- 5) pilgrims lookups for the ANY($2) bulk preview
CREATE INDEX IF NOT EXISTS umrah_pilgrims_company_nusknum_idx
  ON umrah_pilgrims ("companyId","nuskNumber") WHERE "deletedAt" IS NULL;
