-- 141_admin_assign_all_rbac_roles.sql
--
-- Convenience migration for testing & demos: every user whose primary
-- employee_assignment role is 'owner' or 'general_manager' gets
-- assigned every v2 role that exists in their company. The legacy
-- bypass (`if scope.isOwner` in checkAccess) still applies for actual
-- authorization, so this doesn't change what they're allowed to do —
-- but having every role in `rbac_user_roles` lets the frontend's
-- role-switcher UI list all of them so the admin can navigate the
-- system "as" each role to verify behaviour.
--
-- Idempotent via INSERT ... ON CONFLICT DO NOTHING. The migration
-- runner replays it on every boot, so when new roles are created
-- (e.g. cloned from templates), the admin picks them up next restart.
-- Manual sync is also possible via /api/rbac/v2/admin/sync-all-roles
-- (added in companion code) without waiting for a restart.

INSERT INTO rbac_user_roles ("userId", "companyId", role_id, "branchId", "departmentId", is_primary, "assignedBy", "createdAt")
SELECT u.id, ea."companyId", r.id, ea."branchId", ea."departmentId",
       FALSE,                              -- already have a primary via auto-migrate
       u.id,                                -- self-assigned (system bootstrap)
       NOW()
FROM users u
JOIN employee_assignments ea
  ON ea."employeeId" = u."employeeId"
 AND ea.status = 'active'
 AND ea.role IN ('owner', 'general_manager')
JOIN rbac_roles r
  ON r."companyId" = ea."companyId"
 AND r.is_active = TRUE
 AND r.is_template = FALSE
ON CONFLICT ("userId", "companyId", role_id) DO NOTHING;

-- Bump cache version on every affected company so the engine
-- invalidates its in-process role cache and the role-switcher
-- query in the frontend re-fetches.
INSERT INTO rbac_cache_version ("companyId", version, "updatedAt")
SELECT DISTINCT ea."companyId", 1, NOW()
FROM users u
JOIN employee_assignments ea
  ON ea."employeeId" = u."employeeId"
 AND ea.status = 'active'
 AND ea.role IN ('owner', 'general_manager')
ON CONFLICT ("companyId") DO UPDATE SET
  version = rbac_cache_version.version + 1,
  "updatedAt" = NOW();
