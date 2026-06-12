-- ============================================================
-- Migration 284: audit_logs — IGOC-001 context completeness
-- ============================================================
-- IGOC (Identity Governance & Operational Context) task §1, item #14:
--
-- Today audit_logs captures user + company + branch + active_role_key
-- (migration 235 added the last one). But three more context fields are
-- needed to answer the questions stakeholders + auditors actually ask:
--
--   1. "Which department was the user operating in?"
--      → active_department_id — the department the user's primary
--        assignment was scoped to at action time. The user can hold
--        multiple assignments across departments (engineering +
--        operations); this column nails the specific one this action
--        was performed under.
--
--   2. "What scope did the request resolve to?"
--      → resolved_scope — the actual scope value the authzEngine
--        computed for this exact call. Today the request carries the
--        role+feature, but the resolved scope (self/team/department/
--        branch/company/global) is computed in-memory and lost. Storing
--        it makes after-the-fact audits trivially answerable:
--        "show me every action where the resolved scope was 'company'
--        for HR Manager role."
--
--   3. "Was this an impersonation? By whom?"
--      → impersonation_source_user — when a Super Admin uses the
--        role-switcher to PREVIEW the system as another user/role,
--        the surface user is the impersonated one but the real actor
--        is the Super Admin. Without this column, impersonation looks
--        identical to direct action in the audit trail — which is a
--        compliance hole when the Super Admin makes a write through
--        impersonation mode.
--
-- All three columns are NULLABLE — legacy rows + system actions stay
-- valid. The audit middleware + createAuditLog populate them when
-- present in req.scope.
--
-- ============================================================
--
-- @rollback:
--   ALTER TABLE audit_logs
--     DROP COLUMN IF EXISTS active_department_id,
--     DROP COLUMN IF EXISTS resolved_scope,
--     DROP COLUMN IF EXISTS impersonation_source_user;
--   ALTER TABLE audit_logs_archive
--     DROP COLUMN IF EXISTS active_department_id,
--     DROP COLUMN IF EXISTS resolved_scope,
--     DROP COLUMN IF EXISTS impersonation_source_user;
--   (Audit rows lose the captured context; existing user/role/company
--   fields are unaffected.)

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS active_department_id INTEGER,
  ADD COLUMN IF NOT EXISTS resolved_scope VARCHAR(40),
  ADD COLUMN IF NOT EXISTS impersonation_source_user INTEGER;

COMMENT ON COLUMN audit_logs.active_department_id IS
  'IGOC-001: the department the actor''s active assignment belonged to at action time. '
  'NULL when no assignment was active (system actions, unauthenticated, legacy rows).';

COMMENT ON COLUMN audit_logs.resolved_scope IS
  'IGOC-001: the scope value the authzEngine resolved for this specific call '
  '(self|team|department|department_tree|branch|branches|company|multi_company|all). '
  'NULL for non-authorized actions (login, password reset, public endpoints).';

COMMENT ON COLUMN audit_logs.impersonation_source_user IS
  'IGOC-001: when a Super Admin previews-as another role, this is the REAL userId '
  'behind the impersonated session. NULL when not impersonating.';

-- The weekly retention cron archives via INSERT INTO audit_logs_archive
-- SELECT * FROM moved — archive MUST stay column-aligned with audit_logs
-- or archival breaks. Mirror the columns there too (lazy if it exists).
DO $$
BEGIN
  IF to_regclass('public.audit_logs_archive') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE audit_logs_archive
               ADD COLUMN IF NOT EXISTS active_department_id INTEGER,
               ADD COLUMN IF NOT EXISTS resolved_scope VARCHAR(40),
               ADD COLUMN IF NOT EXISTS impersonation_source_user INTEGER';
  END IF;
END $$;

-- Indexes for the two most common audit queries that the new columns
-- unlock: "what did department X do" and "what did Super Admin do
-- while impersonating". Both are partial indexes — keep the index
-- footprint small and only useful for rows that actually carry the
-- column.
CREATE INDEX IF NOT EXISTS idx_audit_logs_active_dept
  ON audit_logs("companyId", active_department_id, "createdAt" DESC)
  WHERE active_department_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_logs_impersonation
  ON audit_logs(impersonation_source_user, "createdAt" DESC)
  WHERE impersonation_source_user IS NOT NULL;
