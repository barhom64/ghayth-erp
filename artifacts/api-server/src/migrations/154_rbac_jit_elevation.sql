-- 154_rbac_jit_elevation.sql
--
-- Just-in-Time elevation requests. Closes the "JIT elevation" gap from
-- the comparison doc — what SAP calls Firefighter and Dynamics calls PIM.
--
-- An employee who needs a permission they don't normally have submits a
-- JIT request with a justification. A manager (or anyone with
-- admin.roles:approve) reviews. Approval inserts a row into
-- rbac_user_grants with expires_at set, so the elevation auto-revokes
-- when the window ends. The existing rbac_v2_expired_grants_cleanup cron
-- (PR #180) takes care of cleanup; nothing else to wire.
--
-- Audit: every state change is recorded in rbac_role_history
-- (already structured for it via change_type='jit.*').

CREATE TABLE IF NOT EXISTS rbac_jit_requests (
  id BIGSERIAL PRIMARY KEY,
  "userId" INT NOT NULL,
  "companyId" INT NOT NULL,
  feature_key VARCHAR(120) NOT NULL,
  action VARCHAR(50) NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'self',
  justification TEXT NOT NULL,
  requested_minutes INT NOT NULL DEFAULT 60,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  "approvedBy" INT,
  "approvedAt" TIMESTAMPTZ,
  "rejectedReason" TEXT,
  granted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rbac_jit_status_check CHECK (
    status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')
  ),
  CONSTRAINT rbac_jit_minutes_check CHECK (
    requested_minutes BETWEEN 5 AND 1440
  )
);

CREATE INDEX IF NOT EXISTS idx_rbac_jit_requests_user
  ON rbac_jit_requests("userId", "companyId", status);
CREATE INDEX IF NOT EXISTS idx_rbac_jit_requests_pending
  ON rbac_jit_requests("companyId", status)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_rbac_jit_requests_expiring
  ON rbac_jit_requests(expires_at)
  WHERE expires_at IS NOT NULL AND status = 'approved';
