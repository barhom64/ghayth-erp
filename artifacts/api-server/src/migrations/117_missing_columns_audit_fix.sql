-- Migration 117: Add missing columns discovered by schema-vs-code audit
-- Items NOT already covered by migrations 086/090/116

-- invoices missing updatedAt (used by financialEngine.ts)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- fleet_drivers missing updatedAt (used by fleet.ts)
ALTER TABLE fleet_drivers ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- hr_leave_requests missing updatedAt (used by cronScheduler.ts)
ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- umrah_transport missing deletedAt/updatedAt (used by umrah.ts)
ALTER TABLE umrah_transport ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE umrah_transport ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- maintenance_requests missing deletedAt (used by tasks.ts)
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- workflow_instances missing deletedAt (used by workflowEngine.ts)
ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- umrah_packages missing deletedAt (used by umrahCommissionEngine.ts)
ALTER TABLE umrah_packages ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
