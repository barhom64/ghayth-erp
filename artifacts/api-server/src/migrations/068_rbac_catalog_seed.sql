-- 068_rbac_catalog_seed.sql
-- Reconciles role_permissions with the canonical catalogue in
-- `lib/rbacCatalog.ts`. Migrations 026/027/066 seeded a subset of what the
-- routes actually check (notably documents:*, hr:approve, audit:read,
-- settings:read/write and permissions:read/write had no binding at all).
-- This migration fills the gaps. All statements are ON CONFLICT DO NOTHING
-- so it is safe to re-run.
--
-- Keep this file in lock-step with `src/lib/rbacCatalog.ts`. When you add a
-- permission to the catalogue, add the binding here too.

INSERT INTO role_permissions (role, permission) VALUES
  -- hr_manager gains the approval + discipline + documents permissions it
  -- actually uses in the routes.
  ('hr_manager', 'hr:approve'),
  ('hr_manager', 'hr:discipline:approve'),
  ('hr_manager', 'documents:read'),
  ('hr_manager', 'documents:create'),
  ('hr_manager', 'documents:download'),

  -- finance_manager
  ('finance_manager', 'documents:read'),
  ('finance_manager', 'documents:download'),
  ('finance_manager', 'reports:read'),

  -- fleet_manager
  ('fleet_manager', 'documents:read'),
  ('fleet_manager', 'documents:download'),

  -- legal_manager — owns its document vault
  ('legal_manager', 'documents:read'),
  ('legal_manager', 'documents:create'),
  ('legal_manager', 'documents:update'),
  ('legal_manager', 'documents:delete'),
  ('legal_manager', 'documents:download'),

  -- property_manager
  ('property_manager', 'documents:read'),
  ('property_manager', 'documents:download'),

  -- bi_manager should be able to inspect the audit trail for its reports.
  ('bi_manager', 'audit:read'),

  -- branch_manager — read-only surface on every business module so the
  -- branch dashboards can render without 403ing.
  ('branch_manager', 'fleet:read'),
  ('branch_manager', 'warehouse:read'),
  ('branch_manager', 'property:read'),
  ('branch_manager', 'projects:read'),
  ('branch_manager', 'operations:read'),
  ('branch_manager', 'legal:read'),
  ('branch_manager', 'support:read'),
  ('branch_manager', 'crm:read'),
  ('branch_manager', 'documents:read'),
  ('branch_manager', 'documents:download'),
  ('branch_manager', 'reports:read')
ON CONFLICT DO NOTHING;
