INSERT INTO role_permissions (role, permission, "companyId")
VALUES
  ('owner', 'audit:read', NULL),
  ('general_manager', 'audit:read', NULL)
ON CONFLICT DO NOTHING;
