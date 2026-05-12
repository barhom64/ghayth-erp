-- 161_rbac_v2_role_templates.sql
--
-- Seeds 5 useful role templates that companies can clone via the
-- /rbac/v2/templates/:id/apply endpoint. Templates live as
-- rbac_roles with companyId IS NULL and is_template = TRUE.
--
-- Each template carries a tight, opinionated default configuration
-- so a brand-new company can stand up sensible roles in one click
-- instead of authoring grants from scratch.

-- 1) Branch Accountant — finance read+create within their branch, no approve.
INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, color, is_system, is_template)
VALUES (NULL, 'tpl_branch_accountant', 'محاسب فرع (قالب)', 'Branch Accountant',
        'محاسب يعمل ضمن فرع واحد: ينشئ ويعدّل الفواتير والقيود ضمن فرعه فقط، ولا يعتمد بنفسه.',
        50, '#059669', FALSE, TRUE)
ON CONFLICT ("companyId", role_key) DO NOTHING;

-- 2) HR Clerk — read employees + create leaves/transfers, no salary visibility
INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, color, is_system, is_template)
VALUES (NULL, 'tpl_hr_clerk', 'كاتب موارد بشرية (قالب)', 'HR Clerk',
        'مساعد إداري في الموارد البشرية: يطّلع على ملفات الموظفين بدون رؤية الرواتب، ويُنشئ طلبات الإجازات والنقل.',
        40, '#0891b2', FALSE, TRUE)
ON CONFLICT ("companyId", role_key) DO NOTHING;

-- 3) Department Manager — full reach within own department + reports
INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, color, is_system, is_template)
VALUES (NULL, 'tpl_department_manager', 'مدير قسم (قالب)', 'Department Manager',
        'مدير قسم يرى ويدير موظفي قسمه فقط، يعتمد إجازاتهم ومهامهم، ويرى تقارير قسمه.',
        60, '#7c3aed', FALSE, TRUE)
ON CONFLICT ("companyId", role_key) DO NOTHING;

-- 4) Project Manager — full reach within projects assigned to them
INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, color, is_system, is_template)
VALUES (NULL, 'tpl_project_manager', 'مدير مشروع (قالب)', 'Project Manager',
        'مدير مشروع: ينشئ المهام، يوزّعها، يعتمد التقدّم ضمن مشاريعه.',
        55, '#db2777', FALSE, TRUE)
ON CONFLICT ("companyId", role_key) DO NOTHING;

-- 5) Sales Rep — own clients + opportunities, no cross-team visibility
INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, color, is_system, is_template)
VALUES (NULL, 'tpl_sales_rep', 'مندوب مبيعات (قالب)', 'Sales Rep',
        'مندوب مبيعات: يرى ويدير عملاءه وفرصه فقط — لا يطّلع على عملاء زملائه.',
        30, '#9333ea', FALSE, TRUE)
ON CONFLICT ("companyId", role_key) DO NOTHING;

-- ─── Seed grants for each template ──────────────────────────────────────────
-- Helper: each grant is (template_role_key, feature_key, actions[], scope)

INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, g.feature_key, g.actions, g.scope FROM rbac_roles r
CROSS JOIN LATERAL (VALUES
  -- Branch Accountant
  ('tpl_branch_accountant', 'finance.invoices',  ARRAY['view','list','create','update','export'],         'branch'),
  ('tpl_branch_accountant', 'finance.purchase',  ARRAY['view','list','create','update'],                  'branch'),
  ('tpl_branch_accountant', 'finance.vendors',   ARRAY['view','list','create','update'],                  'branch'),
  ('tpl_branch_accountant', 'finance.journal',   ARRAY['view','list','create','update'],                  'branch'),
  ('tpl_branch_accountant', 'finance.accounts',  ARRAY['view','list'],                                    'branch'),
  ('tpl_branch_accountant', 'finance.collection',ARRAY['view','list','create','update'],                  'branch'),
  ('tpl_branch_accountant', 'finance.custodies', ARRAY['view','list'],                                    'branch'),
  ('tpl_branch_accountant', 'finance.reports',   ARRAY['view','list','export'],                           'branch'),

  -- HR Clerk
  ('tpl_hr_clerk', 'hr.employees',     ARRAY['view','list'],                                              'company'),
  ('tpl_hr_clerk', 'hr.leaves',        ARRAY['view','list','create','update'],                            'company'),
  ('tpl_hr_clerk', 'hr.attendance',    ARRAY['view','list'],                                              'company'),
  ('tpl_hr_clerk', 'hr.recruitment',   ARRAY['view','list','create','update'],                            'company'),
  ('tpl_hr_clerk', 'hr.training',      ARRAY['view','list','create','update'],                            'company'),
  ('tpl_hr_clerk', 'documents',        ARRAY['view','list','create','export'],                            'company'),

  -- Department Manager
  ('tpl_department_manager', 'hr.employees',   ARRAY['view','list','update'],                             'department_tree'),
  ('tpl_department_manager', 'hr.attendance',  ARRAY['view','list','export'],                             'department_tree'),
  ('tpl_department_manager', 'hr.leaves',      ARRAY['view','list','approve','reject'],                   'department_tree'),
  ('tpl_department_manager', 'hr.performance', ARRAY['view','list','create','update'],                    'department_tree'),
  ('tpl_department_manager', 'tasks',          ARRAY['view','list','create','update','delete'],           'department_tree'),
  ('tpl_department_manager', 'projects.tasks', ARRAY['view','list','create','update'],                    'department_tree'),
  ('tpl_department_manager', 'reports',        ARRAY['view','list','export'],                             'department_tree'),
  ('tpl_department_manager', 'requests',       ARRAY['view','list','approve','reject'],                   'department_tree'),

  -- Project Manager
  ('tpl_project_manager', 'projects',        ARRAY['view','list','update'],                               'team'),
  ('tpl_project_manager', 'projects.list',   ARRAY['view','list','update'],                               'team'),
  ('tpl_project_manager', 'projects.tasks',  ARRAY['view','list','create','update','delete','approve'],   'team'),
  ('tpl_project_manager', 'tasks',           ARRAY['view','list','create','update','delete'],             'team'),
  ('tpl_project_manager', 'documents',       ARRAY['view','list','create','update','export'],             'team'),
  ('tpl_project_manager', 'reports',         ARRAY['view','list','export'],                               'team'),

  -- Sales Rep
  ('tpl_sales_rep', 'crm.clients',        ARRAY['view','list','create','update'],                         'self'),
  ('tpl_sales_rep', 'crm.opportunities',  ARRAY['view','list','create','update'],                         'self'),
  ('tpl_sales_rep', 'crm.leads',          ARRAY['view','list','create','update'],                         'self'),
  ('tpl_sales_rep', 'finance.invoices',   ARRAY['view','list'],                                           'self'),
  ('tpl_sales_rep', 'tasks',              ARRAY['view','list','create','update'],                         'self'),
  ('tpl_sales_rep', 'communications',     ARRAY['view','list','create','update'],                         'self')
) AS g(role_key, feature_key, actions, scope)
WHERE r."companyId" IS NULL AND r.is_template = TRUE AND r.role_key = g.role_key
ON CONFLICT (role_id, feature_key) DO NOTHING;

-- ─── Seed Field Policies for sensitive templates ────────────────────────────
-- HR Clerk: must NOT see salary, IBAN, bank, or national IDs.
INSERT INTO rbac_field_policies (role_id, feature_key, field_name, mode)
SELECT r.id, p.feature_key, p.field_name, p.mode FROM rbac_roles r
CROSS JOIN LATERAL (VALUES
  ('tpl_hr_clerk', 'hr.employees', 'salary',         'hidden'),
  ('tpl_hr_clerk', 'hr.employees', 'bankAccount',    'hidden'),
  ('tpl_hr_clerk', 'hr.employees', 'iban',           'hidden'),
  ('tpl_hr_clerk', 'hr.employees', 'nationalId',     'masked'),
  ('tpl_hr_clerk', 'hr.employees', 'iqamaNumber',    'masked'),
  ('tpl_hr_clerk', 'hr.employees', 'passportNumber', 'masked'),
  ('tpl_hr_clerk', 'hr.employees', 'phone',          'masked'),
  ('tpl_hr_clerk', 'hr.employees', 'dateOfBirth',    'hidden')
) AS p(role_key, feature_key, field_name, mode)
WHERE r."companyId" IS NULL AND r.is_template = TRUE AND r.role_key = p.role_key
ON CONFLICT (role_id, feature_key, field_name) DO NOTHING;

-- ─── Seed approval limits for templates with approve actions ────────────────
INSERT INTO rbac_approval_limits (role_id, feature_key, action, currency, max_amount, requires_dual_control)
SELECT r.id, l.feature_key, l.action, l.currency, l.max_amount, l.requires_dual_control FROM rbac_roles r
CROSS JOIN LATERAL (VALUES
  -- Department managers can approve leave requests (no money) and project tasks
  -- but no financial limits applied directly.
  -- Branch Accountant explicitly cannot approve invoices (no row inserted).
  -- Sample: Project Manager dual-control on big tasks not modelled here.
  ('tpl_department_manager', 'requests', 'approve', 'SAR', 5000.00, FALSE)
) AS l(role_key, feature_key, action, currency, max_amount, requires_dual_control)
WHERE r."companyId" IS NULL AND r.is_template = TRUE AND r.role_key = l.role_key
ON CONFLICT (role_id, feature_key, action, currency) DO NOTHING;
