-- 258_seed_standard_functional_roles.sql
--
-- WHAT:  a STANDARD catalog of real, working functional roles (RBAC v2),
--        seeded as global templates (companyId NULL, is_template) so every
--        tenant has a consistent baseline that actually drives the system.
--        Each role gets module-wildcard grants ('module.*') with action sets
--        from the permission levels (view/contribute/approve/manage) and a
--        scope (self/department/branch/company). Cloneable + editable +
--        renamable from مُركّب الأدوار; admins can add/remove/derive freely.
--
-- WHY:   job_titles.defaultRoleKey pointed at roles (accountant, cashier,
--        driver, sales_rep, …) that had NO grants — onboarding by title threw
--        "الدور غير موجود". This makes those roles real and wires titles to them.
--
-- SAFETY: fully idempotent (WHERE NOT EXISTS); never touches existing
--         per-company roles or admin-edited grants.
--
-- @rollback: DELETE FROM rbac_role_grants g USING rbac_roles r WHERE g.role_id=r.id AND r."companyId" IS NULL AND r.is_template; DELETE FROM rbac_roles WHERE "companyId" IS NULL AND is_template;


-- general_manager — المدير العام
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'general_manager', 'المدير العام', 90, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='general_manager' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, '*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen','update','delete','cancel','close','share']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='general_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='*');

-- branch_manager — مدير الفرع
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'branch_manager', 'مدير الفرع', 60, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='branch_manager' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, '*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen']::text[], 'branch'
 FROM rbac_roles r WHERE r.role_key='branch_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='*');

-- finance_manager — المدير المالي
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'finance_manager', 'المدير المالي', 70, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='finance_manager' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'finance.*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen','update','delete','cancel','close','share']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='finance_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='finance.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'reports.*', ARRAY['view','list','export','print']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='finance_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='reports.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='finance_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- hr_manager — مدير الموارد البشرية
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'hr_manager', 'مدير الموارد البشرية', 70, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='hr_manager' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen','update','delete','cancel','close','share']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='hr_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='hr_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- fleet_manager — مدير الأسطول
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'fleet_manager', 'مدير الأسطول', 60, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='fleet_manager' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'fleet.*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen','update','delete','cancel','close','share']::text[], 'branch'
 FROM rbac_roles r WHERE r.role_key='fleet_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='fleet.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='fleet_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- property_manager — مدير الأملاك
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'property_manager', 'مدير الأملاك', 60, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='property_manager' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'property.*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen','update','delete','cancel','close','share']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='property_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='property.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='property_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- legal_manager — المدير القانوني
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'legal_manager', 'المدير القانوني', 60, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='legal_manager' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'legal.*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen','update','delete','cancel','close','share']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='legal_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='legal.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='legal_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- warehouse_manager — مدير المستودع
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'warehouse_manager', 'مدير المستودع', 55, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='warehouse_manager' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'warehouse.*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen','update','delete','cancel','close','share']::text[], 'branch'
 FROM rbac_roles r WHERE r.role_key='warehouse_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='warehouse.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='warehouse_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- operations_manager — مدير العمليات
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'operations_manager', 'مدير العمليات', 60, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='operations_manager' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'operations.*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen','update','delete','cancel','close','share']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='operations_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='operations.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='operations_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- sales_manager — مدير المبيعات
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'sales_manager', 'مدير المبيعات', 55, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='sales_manager' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'crm.*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen','update','delete','cancel','close','share']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='sales_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='crm.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='sales_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- support_manager — مدير الدعم
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'support_manager', 'مدير الدعم', 50, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='support_manager' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'support.*', ARRAY['view','list','export','print','create','submit','approve','reject','reopen','update','delete','cancel','close','share']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='support_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='support.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='support_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- accountant — محاسب
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'accountant', 'محاسب', 30, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='accountant' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'finance.*', ARRAY['view','list','export','print','create','submit']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='accountant' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='finance.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'reports.*', ARRAY['view','list','export','print']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='accountant' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='reports.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='accountant' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='accountant' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');

-- cashier — أمين الصندوق
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'cashier', 'أمين الصندوق', 25, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='cashier' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'finance.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='cashier' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='finance.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='cashier' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- hr_specialist — أخصائي موارد بشرية
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'hr_specialist', 'أخصائي موارد بشرية', 30, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='hr_specialist' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.*', ARRAY['view','list','export','print','create','submit']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='hr_specialist' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='hr_specialist' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='hr_specialist' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');

-- fleet_clerk — موظف أسطول
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'fleet_clerk', 'موظف أسطول', 25, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='fleet_clerk' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'fleet.*', ARRAY['view','list','export','print','create','submit']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='fleet_clerk' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='fleet.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='fleet_clerk' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='fleet_clerk' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');

-- driver — سائق
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'driver', 'سائق', 15, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='driver' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'fleet.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='driver' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='fleet.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='driver' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- sales_rep — مندوب مبيعات
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'sales_rep', 'مندوب مبيعات', 20, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='sales_rep' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'crm.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='sales_rep' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='crm.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='sales_rep' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- property_clerk — موظف أملاك
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'property_clerk', 'موظف أملاك', 25, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='property_clerk' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'property.*', ARRAY['view','list','export','print','create','submit']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='property_clerk' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='property.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='property_clerk' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='property_clerk' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');

-- warehouse_clerk — موظف مستودع
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'warehouse_clerk', 'موظف مستودع', 25, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='warehouse_clerk' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'warehouse.*', ARRAY['view','list','export','print','create','submit']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='warehouse_clerk' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='warehouse.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='warehouse_clerk' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- legal_clerk — موظف قانوني
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'legal_clerk', 'موظف قانوني', 25, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='legal_clerk' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'legal.*', ARRAY['view','list','export','print','create','submit']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='legal_clerk' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='legal.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='legal_clerk' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='legal_clerk' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');

-- support_agent — موظف دعم
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'support_agent', 'موظف دعم', 20, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='support_agent' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'support.*', ARRAY['view','list','export','print','create','submit']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='support_agent' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='support.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='support_agent' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- employee — موظف
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'employee', 'موظف', 10, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='employee' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='employee' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='employee' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');

-- viewer — مطّلع
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'viewer', 'مطّلع', 10, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='viewer' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, '*', ARRAY['view','list','export','print']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='viewer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='*');

-- Backfill job_titles.defaultRoleKey → standard role keys (idempotent).
UPDATE job_titles SET "defaultRoleKey"='driver' WHERE name='سائق' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='driver' WHERE name='سائق رئيسي' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='driver' WHERE name='سائق نقل' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='accountant' WHERE name='محاسب' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='accountant' WHERE name='محاسب مالي' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='accountant' WHERE name='محاسب أول' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='cashier' WHERE name='أمين صندوق' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='cashier' WHERE name='أمين الصندوق' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='finance_manager' WHERE name='مدير مالي' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='finance_manager' WHERE name='المدير المالي' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='general_manager' WHERE name='مدير عام' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='general_manager' WHERE name='المدير العام' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='branch_manager' WHERE name='مدير الفرع' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='branch_manager' WHERE name='مدير فرع' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='hr_manager' WHERE name='مدير الموارد البشرية' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='hr_manager' WHERE name='مدير موارد بشرية' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='hr_specialist' WHERE name='أخصائي موارد بشرية' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='hr_specialist' WHERE name='موظف موارد بشرية' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='fleet_manager' WHERE name='مدير الأسطول' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='fleet_manager' WHERE name='مدير أسطول' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='fleet_clerk' WHERE name='موظف أسطول' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='sales_rep' WHERE name='مندوب مبيعات' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='sales_manager' WHERE name='مدير المبيعات' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='sales_manager' WHERE name='مدير مبيعات' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='property_manager' WHERE name='مدير عقارات' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='property_manager' WHERE name='مدير الأملاك' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='property_clerk' WHERE name='موظف عقارات' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='property_clerk' WHERE name='موظف أملاك' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='legal_manager' WHERE name='مدير قانوني' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='legal_manager' WHERE name='المدير القانوني' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='legal_clerk' WHERE name='موظف قانوني' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='warehouse_manager' WHERE name='مدير المستودع' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='warehouse_manager' WHERE name='مدير مستودع' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='warehouse_clerk' WHERE name='أمين مستودع' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='warehouse_clerk' WHERE name='موظف مستودع' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='operations_manager' WHERE name='مدير العمليات' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='operations_manager' WHERE name='مدير المشاريع' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='support_manager' WHERE name='مدير الدعم' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='support_agent' WHERE name='موظف دعم' AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
