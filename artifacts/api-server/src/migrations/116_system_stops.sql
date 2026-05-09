-- System Stops (Red Button) — إيقاف النظام
-- Allows administrators to halt specific operation scopes during audits or emergencies.
-- Checked by systemGovernor.systemStopGuard on every guarded mutation.

CREATE TABLE IF NOT EXISTS system_stops (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  scope VARCHAR(32) NOT NULL DEFAULT 'all',  -- 'financial', 'hr', 'operational', 'all'
  reason TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  "activatedBy" INTEGER NOT NULL,
  "activatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "deactivatedBy" INTEGER,
  "deactivatedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_stops_active
  ON system_stops ("companyId", active) WHERE active = true;
