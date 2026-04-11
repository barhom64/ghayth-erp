INSERT INTO role_permissions (role, permission) VALUES
  ('projects_manager', 'projects:read'),
  ('projects_manager', 'projects:create'),
  ('projects_manager', 'projects:update'),
  ('projects_manager', 'projects:delete')
ON CONFLICT DO NOTHING;
