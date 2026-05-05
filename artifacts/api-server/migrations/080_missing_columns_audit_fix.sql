-- Migration 080: Add missing columns and tables discovered by schema-vs-code audit
-- These columns/tables are referenced in code but don't exist in schema or prior migrations

-- 1. system_stops table (used by admin.ts, systemGovernor.ts)
CREATE TABLE IF NOT EXISTS system_stops (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  scope VARCHAR(20) DEFAULT 'company',
  reason TEXT,
  active BOOLEAN DEFAULT TRUE,
  "activatedBy" INTEGER,
  "deactivatedBy" INTEGER,
  "deactivatedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_system_stops_company ON system_stops("companyId", active);

-- 2. employee_contracts signing columns (used by hr-contracts.ts)
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "signedByEmployee" BOOLEAN DEFAULT FALSE;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "employeeSignedAt" TIMESTAMPTZ;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "signedByCompany" BOOLEAN DEFAULT FALSE;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "companySignedAt" TIMESTAMPTZ;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "companySignedBy" INTEGER;

-- 3. invoices missing updatedAt (used by financialEngine.ts)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- 4. fleet_drivers missing updatedAt (used by fleet.ts)
ALTER TABLE fleet_drivers ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- 5. hr_leave_requests missing updatedAt + add 'completed' status (used by cronScheduler.ts)
ALTER TABLE hr_leave_requests ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE hr_leave_requests DROP CONSTRAINT IF EXISTS hr_leave_requests_status_check;
ALTER TABLE hr_leave_requests ADD CONSTRAINT hr_leave_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'returned', 'completed'));

-- 6. umrah_transport missing deletedAt/updatedAt (used by umrah.ts)
ALTER TABLE umrah_transport ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
ALTER TABLE umrah_transport ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ DEFAULT NOW();

-- 7. attendance missing deletedAt (used by hr.ts atomic check-in)
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- 8. maintenance_requests missing deletedAt (used by tasks.ts)
ALTER TABLE maintenance_requests ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- 9. workflow_instances missing deletedAt (used by workflowEngine.ts)
ALTER TABLE workflow_instances ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;

-- 10. umrah_packages missing deletedAt (used by umrahCommissionEngine.ts)
ALTER TABLE umrah_packages ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ;
