CREATE TABLE IF NOT EXISTS security_log (
  id            SERIAL PRIMARY KEY,
  "userId"      INTEGER,
  "companyId"   INTEGER,
  role          VARCHAR(100),
  path          TEXT,
  method        VARCHAR(10),
  "requiredPerms" JSONB,
  reason        VARCHAR(100),
  ip            VARCHAR(100),
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_log_company ON security_log("companyId");
CREATE INDEX IF NOT EXISTS idx_security_log_user ON security_log("userId");
CREATE INDEX IF NOT EXISTS idx_security_log_created ON security_log("createdAt" DESC);

CREATE TABLE IF NOT EXISTS role_permissions (
  id          SERIAL PRIMARY KEY,
  role        VARCHAR(100) NOT NULL,
  permission  VARCHAR(200) NOT NULL,
  "companyId" INTEGER,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(role, permission, "companyId")
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role);

INSERT INTO role_permissions (role, permission) VALUES
  ('owner', '*'),
  ('general_manager', '*'),
  ('hr_manager', 'hr:read'),
  ('hr_manager', 'hr:create'),
  ('hr_manager', 'hr:update'),
  ('hr_manager', 'hr:delete'),
  ('finance_manager', 'finance:read'),
  ('finance_manager', 'finance:create'),
  ('finance_manager', 'finance:update'),
  ('finance_manager', 'finance:delete'),
  ('fleet_manager', 'fleet:read'),
  ('fleet_manager', 'fleet:create'),
  ('fleet_manager', 'fleet:update'),
  ('fleet_manager', 'fleet:delete'),
  ('warehouse_manager', 'warehouse:read'),
  ('warehouse_manager', 'warehouse:create'),
  ('warehouse_manager', 'warehouse:update'),
  ('warehouse_manager', 'warehouse:delete'),
  ('property_manager', 'property:read'),
  ('property_manager', 'property:create'),
  ('property_manager', 'property:update'),
  ('property_manager', 'property:delete'),
  ('projects_manager', 'projects:read'),
  ('projects_manager', 'projects:create'),
  ('projects_manager', 'projects:update'),
  ('projects_manager', 'projects:delete'),
  ('projects_manager', 'operations:read'),
  ('projects_manager', 'operations:create'),
  ('projects_manager', 'operations:update'),
  ('projects_manager', 'operations:delete'),
  ('legal_manager', 'legal:read'),
  ('legal_manager', 'legal:create'),
  ('legal_manager', 'legal:update'),
  ('legal_manager', 'legal:delete'),
  ('support_manager', 'support:read'),
  ('support_manager', 'support:create'),
  ('support_manager', 'support:update'),
  ('support_manager', 'support:delete'),
  ('crm_manager', 'crm:read'),
  ('crm_manager', 'crm:create'),
  ('crm_manager', 'crm:update'),
  ('crm_manager', 'crm:delete'),
  ('bi_manager', 'bi:read'),
  ('bi_manager', 'reports:read'),
  ('branch_manager', 'hr:read'),
  ('branch_manager', 'finance:read'),
  ('employee', 'hr:read')
ON CONFLICT DO NOTHING;
