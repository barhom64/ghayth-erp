-- ============================================================
-- Migration 235: audit_logs.active_role_key
-- ============================================================
-- RBAC-001 (Ghaith Operating Foundation / Issue #1413 §9): every action
-- must record WHICH ROLE (الصفة) it was performed under. A single user can
-- hold multiple roles (rbac_user_roles), so userId alone does not answer
-- "by what capacity was this done?". The active role already travels on
-- req.scope.selectedRoleKey (authMiddleware) but was never persisted.
--
-- This adds a nullable text column so the audit trail can show, per row,
-- the role the actor was operating as (e.g. "finance_approver"). Nullable
-- because legacy rows and unauthenticated/system actions have no selected
-- role; the audit middleware and createAuditLog populate it going forward.
--
-- See docs/rbac/RBAC_AUDIT_CONTEXT_SPEC.md.
-- ============================================================
--
-- @rollback: ALTER TABLE audit_logs DROP COLUMN IF EXISTS active_role_key;
--   ALTER TABLE audit_logs_archive DROP COLUMN IF EXISTS active_role_key;
--   (Audit rows lose the captured role; userId/entity/action are unaffected.)

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS active_role_key TEXT;

COMMENT ON COLUMN audit_logs.active_role_key IS
  'RBAC-001: the role key (rbac_user_roles.role_key) the actor was operating '
  'as when this action was performed. NULL for legacy/system rows.';

-- The weekly retention cron archives via `INSERT INTO audit_logs_archive
-- SELECT * FROM moved` (cronScheduler.ts), so the archive MUST stay
-- column-aligned with audit_logs or archival breaks. Add the column there too
-- when the archive table exists (it is created lazily on first archival in
-- some deployments, so guard on existence rather than assume).
DO $$
BEGIN
  IF to_regclass('public.audit_logs_archive') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE audit_logs_archive ADD COLUMN IF NOT EXISTS active_role_key TEXT';
  END IF;
END $$;
