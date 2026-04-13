-- 070_rbac_self_service_and_gaps.sql
--
-- Prior seed (026_security_log.sql) only granted `employee` role
-- `hr:read`, which meant NO EMPLOYEE could call /hr/check-in,
-- /hr/check-out, /hr/leave-requests POST, or any of the ~40 other
-- endpoints gated by `requirePermission("hr:create" | "hr:update")`.
-- Every self-service action returned 403. This migration closes that
-- hole + expands branch_manager, which likewise was read-only on every
-- module even though they need to act within their branch scope.
--
-- Every INSERT is ON CONFLICT DO NOTHING so this is safe to re-run.

INSERT INTO role_permissions (role, permission) VALUES
  -- ── employee: self-service across modules ──
  -- These routes already scope by scope.activeAssignmentId / scope.employeeId
  -- so granting these permissions cannot be used to affect other users.
  ('employee', 'hr:self'),
  ('employee', 'operations:read'),
  ('employee', 'operations:create'),
  ('employee', 'operations:update'),
  ('employee', 'tasks:read'),
  ('employee', 'tasks:create'),
  ('employee', 'tasks:update'),
  ('employee', 'support:read'),
  ('employee', 'support:create'),
  ('employee', 'documents:read'),
  ('employee', 'documents:download'),
  ('employee', 'notifications:read'),
  ('employee', 'notifications:update'),

  -- ── branch_manager: full operational reach inside their branch ──
  -- Query-level scoping already restricts them to their branch; the only
  -- thing blocking them today is the permission gate.
  ('branch_manager', 'hr:self'),
  ('branch_manager', 'hr:create'),
  ('branch_manager', 'hr:update'),
  ('branch_manager', 'hr:approve'),
  ('branch_manager', 'finance:create'),
  ('branch_manager', 'finance:update'),
  ('branch_manager', 'fleet:create'),
  ('branch_manager', 'fleet:update'),
  ('branch_manager', 'fleet:delete'),
  ('branch_manager', 'projects:create'),
  ('branch_manager', 'projects:update'),
  ('branch_manager', 'warehouse:create'),
  ('branch_manager', 'warehouse:update'),
  ('branch_manager', 'property:create'),
  ('branch_manager', 'property:update'),
  ('branch_manager', 'crm:create'),
  ('branch_manager', 'crm:update'),
  ('branch_manager', 'operations:create'),
  ('branch_manager', 'operations:update'),
  ('branch_manager', 'tasks:create'),
  ('branch_manager', 'tasks:update'),
  ('branch_manager', 'tasks:delete'),
  ('branch_manager', 'support:create'),
  ('branch_manager', 'support:update'),
  ('branch_manager', 'audit:read'),

  -- ── hr_manager: already had most, just need hr:self for symmetry ──
  ('hr_manager', 'hr:self'),
  ('hr_manager', 'hr:approve'),
  ('hr_manager', 'operations:read'),
  ('hr_manager', 'tasks:read'),
  ('hr_manager', 'tasks:create'),

  -- ── finance_manager: cross-module read for reconciliation workflows ──
  ('finance_manager', 'hr:read'),
  ('finance_manager', 'fleet:read'),
  ('finance_manager', 'warehouse:read'),
  ('finance_manager', 'property:read'),
  ('finance_manager', 'projects:read'),
  ('finance_manager', 'crm:read'),
  ('finance_manager', 'audit:read'),

  -- ── support_manager + crm_manager: cross-talk with hr + operations ──
  ('support_manager', 'hr:read'),
  ('support_manager', 'operations:read'),
  ('crm_manager', 'operations:read'),
  ('crm_manager', 'tasks:create'),
  ('crm_manager', 'tasks:update')
ON CONFLICT DO NOTHING;
