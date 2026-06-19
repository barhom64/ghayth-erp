-- 390_employee_tracking_policies.sql
-- Tracking Eligibility Contract (#independent): GPS-tracking eligibility must
-- derive from an EXPLICIT, active, per-employee policy — NEVER inferred from
-- role=driver or attendance categoryKey. companyId-scoped; at most ONE active
-- (non-deleted) policy per employee. Active = trackingEnabled AND inside the
-- optional [startsAt,endsAt] window AND deletedAt IS NULL. Disabling/deleting
-- the policy stops ingestion AND map visibility immediately.
--
-- DDL-only (no seed) → seed-drift safe. > baseline-cutoff (297) so it runs on
-- fresh/CI DBs rather than being pre-marked applied-without-running.
--
-- @rollback: DROP TABLE IF EXISTS employee_tracking_policies;

CREATE TABLE IF NOT EXISTS employee_tracking_policies (
  id            BIGSERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"    INTEGER,
  "employeeId"  INTEGER NOT NULL,
  "trackingEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "trackingMode" VARCHAR(20) NOT NULL DEFAULT 'work_hours',
  reason        TEXT,
  "approvedBy"  INTEGER,
  "allowedViewerRoles" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "startsAt"    TIMESTAMPTZ,
  "endsAt"      TIMESTAMPTZ,
  "createdBy"   INTEGER,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "deletedAt"   TIMESTAMPTZ,
  CONSTRAINT chk_etp_tracking_mode CHECK (
    "trackingMode" IN ('work_hours','task','trip','live','checkin_only')
  )
);

-- At most one ACTIVE (non-deleted) policy per employee within a company.
CREATE UNIQUE INDEX IF NOT EXISTS uq_etp_company_employee_active
  ON employee_tracking_policies ("companyId", "employeeId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_etp_company_employee
  ON employee_tracking_policies ("companyId", "employeeId");
