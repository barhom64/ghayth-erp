-- 087_employees_deletedat_and_rbac_reseed.sql
--
-- Two production issues caused widespread "حدث خطأ غير متوقع" toasts:
--
-- 1) `employees` table was missing the `deletedAt` column even though
--    every query in routes/employees.ts references `e."deletedAt" IS NULL`.
--    Result: GET /api/employees and most HR detail routes returned 500
--    with code 42703 (column does not exist).
--
-- 2) The `role_permissions` table was empty for production data even
--    though migrations 026/027/068/070 had seeded it. Any non-owner
--    user (manager, employee, …) was rejected with 403 on every gated
--    endpoint (notifications, settings, hr, governance, …) because the
--    permission middleware found zero rows for their role.
--
-- This migration:
--   * Adds the missing `deletedAt` column.
--   * Re-asserts the role_permissions seed (idempotent via ON CONFLICT
--     DO NOTHING) and adds the new role keys we ship with bootstrap:
--     `manager` (alias for general_manager), `multi_dept_staff`.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ DEFAULT NULL;

INSERT INTO role_permissions (role, permission) VALUES
  ('owner', '*'),
  ('general_manager', '*'),
  ('manager', '*'),

  ('hr_manager', 'hr:read'),('hr_manager', 'hr:create'),('hr_manager', 'hr:update'),('hr_manager', 'hr:delete'),
  ('hr_manager', 'hr:approve'),('hr_manager', 'hr:self'),('hr_manager', 'hr:discipline:approve'),
  ('hr_manager', 'documents:read'),('hr_manager', 'documents:create'),('hr_manager', 'documents:download'),
  ('hr_manager', 'operations:read'),('hr_manager', 'tasks:read'),('hr_manager', 'tasks:create'),
  ('hr_manager', 'notifications:read'),('hr_manager', 'notifications:update'),('hr_manager', 'settings:read'),

  ('finance_manager', 'finance:read'),('finance_manager', 'finance:create'),('finance_manager', 'finance:update'),('finance_manager', 'finance:delete'),
  ('finance_manager', 'hr:read'),('finance_manager', 'fleet:read'),('finance_manager', 'warehouse:read'),
  ('finance_manager', 'property:read'),('finance_manager', 'projects:read'),('finance_manager', 'crm:read'),
  ('finance_manager', 'audit:read'),('finance_manager', 'documents:read'),('finance_manager', 'documents:download'),
  ('finance_manager', 'reports:read'),('finance_manager', 'notifications:read'),('finance_manager', 'notifications:update'),
  ('finance_manager', 'settings:read'),

  ('fleet_manager', 'fleet:read'),('fleet_manager', 'fleet:create'),('fleet_manager', 'fleet:update'),('fleet_manager', 'fleet:delete'),
  ('fleet_manager', 'documents:read'),('fleet_manager', 'documents:download'),
  ('fleet_manager', 'notifications:read'),('fleet_manager', 'notifications:update'),('fleet_manager', 'settings:read'),

  ('warehouse_manager', 'warehouse:read'),('warehouse_manager', 'warehouse:create'),('warehouse_manager', 'warehouse:update'),('warehouse_manager', 'warehouse:delete'),
  ('warehouse_manager', 'notifications:read'),('warehouse_manager', 'notifications:update'),('warehouse_manager', 'settings:read'),

  ('property_manager', 'property:read'),('property_manager', 'property:create'),('property_manager', 'property:update'),('property_manager', 'property:delete'),
  ('property_manager', 'documents:read'),('property_manager', 'documents:download'),
  ('property_manager', 'notifications:read'),('property_manager', 'notifications:update'),('property_manager', 'settings:read'),

  ('projects_manager', 'projects:read'),('projects_manager', 'projects:create'),('projects_manager', 'projects:update'),('projects_manager', 'projects:delete'),
  ('projects_manager', 'operations:read'),('projects_manager', 'operations:create'),('projects_manager', 'operations:update'),('projects_manager', 'operations:delete'),
  ('projects_manager', 'notifications:read'),('projects_manager', 'notifications:update'),('projects_manager', 'settings:read'),

  ('legal_manager', 'legal:read'),('legal_manager', 'legal:create'),('legal_manager', 'legal:update'),('legal_manager', 'legal:delete'),
  ('legal_manager', 'documents:read'),('legal_manager', 'documents:create'),('legal_manager', 'documents:update'),('legal_manager', 'documents:delete'),('legal_manager', 'documents:download'),
  ('legal_manager', 'notifications:read'),('legal_manager', 'notifications:update'),('legal_manager', 'settings:read'),

  ('support_manager', 'support:read'),('support_manager', 'support:create'),('support_manager', 'support:update'),('support_manager', 'support:delete'),
  ('support_manager', 'hr:read'),('support_manager', 'operations:read'),
  ('support_manager', 'notifications:read'),('support_manager', 'notifications:update'),('support_manager', 'settings:read'),

  ('crm_manager', 'crm:read'),('crm_manager', 'crm:create'),('crm_manager', 'crm:update'),('crm_manager', 'crm:delete'),
  ('crm_manager', 'operations:read'),('crm_manager', 'tasks:create'),('crm_manager', 'tasks:update'),
  ('crm_manager', 'notifications:read'),('crm_manager', 'notifications:update'),('crm_manager', 'settings:read'),

  ('bi_manager', 'bi:read'),('bi_manager', 'reports:read'),('bi_manager', 'audit:read'),
  ('bi_manager', 'notifications:read'),('bi_manager', 'notifications:update'),('bi_manager', 'settings:read'),

  ('branch_manager', 'hr:read'),('branch_manager', 'finance:read'),
  ('branch_manager', 'fleet:read'),('branch_manager', 'warehouse:read'),('branch_manager', 'property:read'),
  ('branch_manager', 'projects:read'),('branch_manager', 'operations:read'),('branch_manager', 'legal:read'),
  ('branch_manager', 'support:read'),('branch_manager', 'crm:read'),
  ('branch_manager', 'documents:read'),('branch_manager', 'documents:download'),('branch_manager', 'reports:read'),
  ('branch_manager', 'hr:self'),('branch_manager', 'hr:create'),('branch_manager', 'hr:update'),('branch_manager', 'hr:approve'),
  ('branch_manager', 'finance:create'),('branch_manager', 'finance:update'),
  ('branch_manager', 'fleet:create'),('branch_manager', 'fleet:update'),('branch_manager', 'fleet:delete'),
  ('branch_manager', 'projects:create'),('branch_manager', 'projects:update'),
  ('branch_manager', 'warehouse:create'),('branch_manager', 'warehouse:update'),
  ('branch_manager', 'property:create'),('branch_manager', 'property:update'),
  ('branch_manager', 'crm:create'),('branch_manager', 'crm:update'),
  ('branch_manager', 'operations:create'),('branch_manager', 'operations:update'),
  ('branch_manager', 'tasks:create'),('branch_manager', 'tasks:update'),('branch_manager', 'tasks:delete'),
  ('branch_manager', 'support:create'),('branch_manager', 'support:update'),('branch_manager', 'audit:read'),
  ('branch_manager', 'notifications:read'),('branch_manager', 'notifications:update'),('branch_manager', 'settings:read'),

  ('employee', 'hr:read'),('employee', 'hr:self'),
  ('employee', 'operations:read'),('employee', 'operations:create'),('employee', 'operations:update'),
  ('employee', 'tasks:read'),('employee', 'tasks:create'),('employee', 'tasks:update'),
  ('employee', 'support:read'),('employee', 'support:create'),
  ('employee', 'documents:read'),('employee', 'documents:download'),
  ('employee', 'notifications:read'),('employee', 'notifications:update'),
  ('employee', 'settings:read'),

  ('multi_dept_staff', 'fleet:read'),('multi_dept_staff', 'fleet:create'),('multi_dept_staff', 'fleet:update'),('multi_dept_staff', 'fleet:delete'),
  ('multi_dept_staff', 'finance:read'),('multi_dept_staff', 'finance:create'),('multi_dept_staff', 'finance:update'),
  ('multi_dept_staff', 'operations:read'),('multi_dept_staff', 'operations:create'),('multi_dept_staff', 'operations:update'),
  ('multi_dept_staff', 'hr:self'),('multi_dept_staff', 'hr:read'),
  ('multi_dept_staff', 'tasks:read'),('multi_dept_staff', 'tasks:create'),('multi_dept_staff', 'tasks:update'),
  ('multi_dept_staff', 'documents:read'),('multi_dept_staff', 'documents:download'),
  ('multi_dept_staff', 'reports:read'),
  ('multi_dept_staff', 'notifications:read'),('multi_dept_staff', 'notifications:update'),
  ('multi_dept_staff', 'settings:read')
ON CONFLICT DO NOTHING;
