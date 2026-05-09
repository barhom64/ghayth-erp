-- 109_layered_rbac_v2.sql
--
-- Layered RBAC v2 — 5-layer permissions model.
--
-- Adds the new authorization model on top of the existing flat
-- role_permissions / permissions tables WITHOUT removing them. The new
-- model is consulted first; if a role has no v2 grants, the old
-- permissions table is used as a fallback so the system never breaks
-- mid-migration.
--
-- Layers introduced:
--   1. Module     (already in custom_roles.modules)
--   2. Feature    (feature_catalog — sub-modules, e.g. hr.payroll)
--   3. Action     (rbac_role_grants.actions[] — view/create/update/...)
--   4. Scope      (rbac_role_grants.scope — self|team|department|branch|company|all)
--   5. Field      (rbac_field_policies — visible/masked/hidden/readonly)
--
-- Cross-cutting:
--   • rbac_approval_limits — amount-based authorization
--   • rbac_role_grants.conditions — JSON conditions (status, time, etc.)
--   • rbac_user_grants — per-user overrides with expiry
--   • rbac_role_history — full audit trail
--   • rbac_role_templates — reusable role blueprints
--   • rbac_sod_rules — segregation-of-duties conflicts
--
-- Every CREATE/INSERT is idempotent. Safe to re-run.

-- ─── Catalog: every feature the system recognises ──────────────────────────
CREATE TABLE IF NOT EXISTS feature_catalog (
  id SERIAL PRIMARY KEY,
  feature_key VARCHAR(120) UNIQUE NOT NULL,
  parent_key VARCHAR(120),
  module_key VARCHAR(50) NOT NULL,
  label_ar VARCHAR(200) NOT NULL,
  label_en VARCHAR(200),
  description_ar TEXT,
  icon VARCHAR(50),
  available_actions TEXT[] NOT NULL DEFAULT ARRAY['view','list','create','update','delete']::TEXT[],
  available_scopes TEXT[] NOT NULL DEFAULT ARRAY['self','team','department','branch','company','all']::TEXT[],
  sensitive_fields TEXT[] DEFAULT ARRAY[]::TEXT[],
  approvable_actions TEXT[] DEFAULT ARRAY[]::TEXT[],
  display_order INT DEFAULT 100,
  is_self_service BOOLEAN DEFAULT FALSE,
  is_system_critical BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feature_catalog_module ON feature_catalog(module_key);
CREATE INDEX IF NOT EXISTS idx_feature_catalog_parent ON feature_catalog(parent_key);

-- ─── Extended role definitions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_roles (
  id SERIAL PRIMARY KEY,
  "companyId" INT,
  role_key VARCHAR(80) NOT NULL,
  label_ar VARCHAR(200) NOT NULL,
  label_en VARCHAR(200),
  description TEXT,
  level INT DEFAULT 50,
  parent_role_id INT REFERENCES rbac_roles(id) ON DELETE SET NULL,
  color VARCHAR(20) DEFAULT '#3b82f6',
  is_system BOOLEAN DEFAULT FALSE,
  is_template BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  "createdBy" INT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("companyId", role_key)
);

CREATE INDEX IF NOT EXISTS idx_rbac_roles_company ON rbac_roles("companyId");
CREATE INDEX IF NOT EXISTS idx_rbac_roles_template ON rbac_roles(is_template) WHERE is_template = TRUE;

-- ─── Layer 3+4: Action + Scope grants per role × feature ───────────────────
CREATE TABLE IF NOT EXISTS rbac_role_grants (
  id SERIAL PRIMARY KEY,
  role_id INT NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  feature_key VARCHAR(120) NOT NULL,
  actions TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  scope VARCHAR(20) NOT NULL DEFAULT 'self',
  conditions JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (role_id, feature_key),
  CONSTRAINT rbac_role_grants_scope_check CHECK (
    scope IN ('self','team','department','department_tree','branch','branches','company','multi_company','all')
  )
);

CREATE INDEX IF NOT EXISTS idx_rbac_role_grants_role ON rbac_role_grants(role_id);
CREATE INDEX IF NOT EXISTS idx_rbac_role_grants_feature ON rbac_role_grants(feature_key);

-- ─── Layer 5: Field-level policies ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_field_policies (
  id SERIAL PRIMARY KEY,
  role_id INT NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  feature_key VARCHAR(120) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'visible',
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (role_id, feature_key, field_name),
  CONSTRAINT rbac_field_policies_mode_check CHECK (
    mode IN ('visible','masked','hidden','readonly','editable')
  )
);

CREATE INDEX IF NOT EXISTS idx_rbac_field_policies_lookup ON rbac_field_policies(role_id, feature_key);

-- ─── Cross: Approval thresholds ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_approval_limits (
  id SERIAL PRIMARY KEY,
  role_id INT NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  feature_key VARCHAR(120) NOT NULL,
  action VARCHAR(50) NOT NULL,
  currency VARCHAR(10) DEFAULT 'SAR',
  max_amount NUMERIC(15,2),
  requires_dual_control BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (role_id, feature_key, action, currency)
);

CREATE INDEX IF NOT EXISTS idx_rbac_approval_limits_role ON rbac_approval_limits(role_id);

-- ─── Per-user overrides with optional expiry ───────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_user_grants (
  id SERIAL PRIMARY KEY,
  "userId" INT NOT NULL,
  "companyId" INT NOT NULL,
  feature_key VARCHAR(120) NOT NULL,
  action VARCHAR(50),
  scope VARCHAR(20),
  type VARCHAR(20) NOT NULL DEFAULT 'grant',
  expires_at TIMESTAMPTZ,
  reason TEXT,
  "grantedBy" INT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT rbac_user_grants_type_check CHECK (type IN ('grant','revoke'))
);

CREATE INDEX IF NOT EXISTS idx_rbac_user_grants_lookup ON rbac_user_grants("userId", "companyId");
CREATE INDEX IF NOT EXISTS idx_rbac_user_grants_expiry ON rbac_user_grants(expires_at) WHERE expires_at IS NOT NULL;

-- ─── User → Role binding (replaces user_roles for v2) ──────────────────────
CREATE TABLE IF NOT EXISTS rbac_user_roles (
  id SERIAL PRIMARY KEY,
  "userId" INT NOT NULL,
  "companyId" INT NOT NULL,
  role_id INT NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  "branchId" INT,
  "departmentId" INT,
  is_primary BOOLEAN DEFAULT FALSE,
  expires_at TIMESTAMPTZ,
  "assignedBy" INT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("userId", "companyId", role_id)
);

CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_user ON rbac_user_roles("userId", "companyId");

-- ─── Audit trail: every role change recorded ───────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_role_history (
  id BIGSERIAL PRIMARY KEY,
  role_id INT,
  "companyId" INT,
  "changedBy" INT,
  change_type VARCHAR(50) NOT NULL,
  before_state JSONB,
  after_state JSONB,
  reason TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_role_history_role ON rbac_role_history(role_id);
CREATE INDEX IF NOT EXISTS idx_rbac_role_history_company ON rbac_role_history("companyId");

-- ─── Templates: reusable role blueprints ───────────────────────────────────
-- Templates live as rbac_roles with is_template=true and companyId=NULL.

-- ─── Segregation-of-Duties rules ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rbac_sod_rules (
  id SERIAL PRIMARY KEY,
  "companyId" INT,
  rule_key VARCHAR(100) NOT NULL,
  label_ar VARCHAR(200) NOT NULL,
  feature_a VARCHAR(120) NOT NULL,
  action_a VARCHAR(50) NOT NULL,
  feature_b VARCHAR(120) NOT NULL,
  action_b VARCHAR(50) NOT NULL,
  severity VARCHAR(20) DEFAULT 'high',
  is_active BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("companyId", rule_key)
);

-- ─── Seed default SoD rules (Saudi accounting + general) ───────────────────
INSERT INTO rbac_sod_rules (rule_key, label_ar, feature_a, action_a, feature_b, action_b, severity)
VALUES
  ('finance_journal_create_approve', 'فصل صلاحية إنشاء واعتماد القيد المحاسبي', 'finance.journal', 'create', 'finance.journal', 'approve', 'critical'),
  ('finance_invoice_create_approve', 'فصل صلاحية إنشاء واعتماد الفاتورة', 'finance.invoices', 'create', 'finance.invoices', 'approve', 'high'),
  ('finance_purchase_create_approve', 'فصل صلاحية إنشاء واعتماد طلب الشراء', 'finance.purchase', 'create', 'finance.purchase', 'approve', 'high'),
  ('hr_payroll_calculate_approve', 'فصل صلاحية احتساب واعتماد الرواتب', 'hr.payroll.runs', 'create', 'hr.payroll.runs', 'approve', 'critical'),
  ('hr_employee_create_self_approve', 'الموظف لا يعتمد ملفه', 'hr.employees', 'create', 'hr.employees', 'approve', 'medium')
ON CONFLICT (rule_key) WHERE "companyId" IS NULL DO NOTHING;

-- ─── Cache invalidation marker — bumped on any role/grant change ───────────
CREATE TABLE IF NOT EXISTS rbac_cache_version (
  "companyId" INT PRIMARY KEY,
  version BIGINT DEFAULT 1,
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Bridge: department_path materialised view (for scope=department_tree) ─
-- Stored as a function for now (recursive CTE). View can be added later.

-- ─── Done. Auto-migration of legacy roles happens at server boot in
--     lib/rbacAutoMigrate.ts (idempotent per company). ────────────────────
