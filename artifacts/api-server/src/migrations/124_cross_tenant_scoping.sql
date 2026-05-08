-- Migration 124: Add companyId to cron_jobs, cron_logs, and roles for cross-tenant scoping

-- cron_jobs: add companyId column (nullable for backward compat with system-level jobs)
ALTER TABLE cron_jobs ADD COLUMN IF NOT EXISTS "companyId" integer;

-- cron_logs: add companyId column
ALTER TABLE cron_logs ADD COLUMN IF NOT EXISTS "companyId" integer;

-- roles: add companyId column (nullable for system roles)
ALTER TABLE roles ADD COLUMN IF NOT EXISTS "companyId" integer;

-- Indexes for efficient scoping
CREATE INDEX IF NOT EXISTS idx_cron_jobs_companyid ON cron_jobs ("companyId");
CREATE INDEX IF NOT EXISTS idx_cron_logs_companyid ON cron_logs ("companyId");
CREATE INDEX IF NOT EXISTS idx_roles_companyid ON roles ("companyId");
