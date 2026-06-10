-- 260_admin_full_access.sql
--
-- WHAT:  give owner/admin accounts FULL access (navigation + testing). Three
--        consistent levers so the admin sees and can do everything:
--          1) backend owner-bypass — active assignment role becomes 'owner'
--             (authMiddleware: isOwner = employee_assignments.role === 'owner').
--          2) frontend — an 'owner' row in user_roles (level 100 + every module)
--             so /permissions/my highestLevel = 100 ⇒ the UI owner-bypass.
--          3) RBAC v2 — the owner role carries a complete wildcard grant (for
--             when the hard-coded bypass is eventually retired).
--
-- WHY:   the operator asked for an admin that can navigate + test the whole
--        system after consolidating onto the single (RBAC v2) roles system.
--
-- SCOPE: users whose account role is 'owner' or 'admin'. NOTE: this elevates
--        every such account to full owner access — intended for the operator's
--        org; review before relying on it as a hard multi-tenant boundary.
--
-- SAFETY: idempotent (guards + NOT EXISTS).
--
-- @rollback: prior assignment roles are not recorded; this is an additive
--            enablement migration and is safe to leave in place.

-- 1) Backend owner-bypass via the active assignment role.
UPDATE employee_assignments ea
   SET role = 'owner'
  FROM users u
 WHERE u."employeeId" = ea."employeeId"
   AND ea.status = 'active'
   AND u.role IN ('owner', 'admin')
   AND ea.role IS DISTINCT FROM 'owner';

-- 2) Frontend: ensure an 'owner' row in user_roles (level 100, all modules).
--
-- HISTORICAL NOTE: `user_roles` was the legacy v1 RBAC binding table; it is
-- dropped in migration 269. On environments that ran 260 before 269 (i.e. all
-- production tenants), this INSERT ran successfully against the live table.
-- On fresh agent/CI environments provisioned from the post-269 schema dump,
-- the table no longer exists, so the INSERT must be skipped — the level-100
-- owner-bypass is fully covered by step 3 (rbac_role_grants wildcard).
--
-- Wrapped in a defensive existence check so historical behaviour is preserved
-- AND the migration is replayable on fresh dumps that excluded the legacy table.
DO $$
BEGIN
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE $sql$
      INSERT INTO user_roles ("userId", "roleKey", label, modules, level, "companyId")
      SELECT DISTINCT u.id, 'owner', 'مالك النظام',
             '["home","hr","finance","fleet","property","operations","warehouse","governance","bi","requests","documents","reports","admin","comms","legal","crm","marketing","store","support","settings"]'::jsonb,
             100, ea."companyId"
        FROM users u
        JOIN employee_assignments ea ON ea."employeeId" = u."employeeId" AND ea.status = 'active'
       WHERE u.role IN ('owner', 'admin')
         AND NOT EXISTS (
           SELECT 1 FROM user_roles ur
            WHERE ur."userId" = u.id AND ur."roleKey" = 'owner'
              AND (ur."companyId" = ea."companyId" OR ur."companyId" IS NULL));
    $sql$;
  END IF;
END $$;

-- 3) RBAC v2: complete wildcard grant on every owner role.
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, '*',
       ARRAY['view','list','export','print','create','submit','approve','reject','reopen','update','delete','cancel','close','share']::text[],
       'all'
  FROM rbac_roles r
 WHERE r.role_key = 'owner'
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id = r.id AND g.feature_key = '*');
