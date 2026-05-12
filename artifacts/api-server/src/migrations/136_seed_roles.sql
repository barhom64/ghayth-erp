-- Migration 136: Seed system roles table
-- Required for: user creation and role assignment flows

INSERT INTO roles (name, description, "isSystem", permissions)
VALUES
  ('owner',           'مالك النظام — صلاحيات كاملة',      true, '["*"]'),
  ('general_manager', 'مدير عام — إدارة شاملة',           true, '["hr:*","finance:*","fleet:*","property:*","projects:*","warehouse:*","crm:*","support:*","legal:*"]'),
  ('hr_manager',      'مدير موارد بشرية',                  true, '["hr:*","requests:*"]'),
  ('finance_manager', 'مدير مالي',                          true, '["finance:*","requests:*"]'),
  ('branch_manager',  'مدير فرع',                           true, '["hr:read","hr:update","finance:read","requests:*","support:*"]'),
  ('employee',        'موظف — صلاحيات أساسية',             true, '["requests:create","requests:read","documents:read"]'),
  ('viewer',          'مشاهد فقط — قراءة بدون تعديل',      true, '["hr:read","finance:read","fleet:read","property:read"]')
ON CONFLICT DO NOTHING;
