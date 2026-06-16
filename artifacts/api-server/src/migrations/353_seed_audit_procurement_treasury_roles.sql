-- 353_seed_audit_procurement_treasury_roles.sql
--
-- WHAT:  adds three standard functional role templates to the global RBAC v2
--        catalog (companyId NULL, is_template), extending the catalog seeded
--        by migration 258:
--          • internal_auditor   — مدقّق داخلي  (read-only across the system)
--          • procurement_officer — مسؤول المشتريات (raises POs/vendors, NO approve)
--          • treasurer          — أمين الخزينة (approves disbursements/receipts,
--                                  does NOT create the documents it approves)
--
-- WHY:   the catalog had accountant/cashier but no read-only audit role and no
--        procurement/treasury split. Their grants are deliberately
--        SoD-compatible and reinforce the rules seeded in migration 352:
--          - procurement_officer holds finance.purchase/vendors create+submit
--            but NOT approve  → can never self-approve a PO.
--          - treasurer holds finance.custodies:approve but NOT create
--            → pairs with finance_custody_create_approve.
--          - internal_auditor is view/list/export/print only on '*'.
--
-- SAFETY: idempotent (WHERE NOT EXISTS on both role and each grant); never
--         touches existing roles, grants, or per-company customizations.
--         Mirrors the exact INSERT…SELECT pattern of migration 258.
--
-- @rollback: DELETE FROM rbac_role_grants g USING rbac_roles r WHERE g.role_id=r.id AND r."companyId" IS NULL AND r.role_key IN ('internal_auditor','procurement_officer','treasurer'); DELETE FROM rbac_roles WHERE "companyId" IS NULL AND role_key IN ('internal_auditor','procurement_officer','treasurer');


-- internal_auditor — مدقّق داخلي (read-only everywhere)
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'internal_auditor', 'مدقّق داخلي', 65, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='internal_auditor' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, '*', ARRAY['view','list','export','print']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='internal_auditor' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='*');


-- procurement_officer — مسؤول المشتريات (creates POs/vendors/contracts, never approves)
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'procurement_officer', 'مسؤول المشتريات', 35, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='procurement_officer' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'finance.purchase', ARRAY['view','list','export','print','create','submit','update']::text[], 'branch'
 FROM rbac_roles r WHERE r.role_key='procurement_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='finance.purchase');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'finance.vendors', ARRAY['view','list','export','print','create','submit','update']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='procurement_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='finance.vendors');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'finance.contracts', ARRAY['view','list','export','print','create','submit']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='procurement_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='finance.contracts');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'warehouse.*', ARRAY['view','list','export','print']::text[], 'branch'
 FROM rbac_roles r WHERE r.role_key='procurement_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='warehouse.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='procurement_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='procurement_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');


-- treasurer — أمين الخزينة (approves collections/custodies, does NOT create them)
INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system, is_template, is_active)
SELECT NULL, 'treasurer', 'أمين الخزينة', 40, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='treasurer' AND "companyId" IS NULL);
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'finance.collection', ARRAY['view','list','export','print','create','submit','approve']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='treasurer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='finance.collection');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'finance.custodies', ARRAY['view','list','export','print','approve']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='treasurer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='finance.custodies');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'finance.reports', ARRAY['view','list','export','print']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='treasurer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='finance.reports');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='treasurer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='treasurer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');


-- Backfill job_titles.defaultRoleKey → the new role keys (idempotent), so
-- onboarding-by-title resolves these without "الدور غير موجود".
UPDATE job_titles SET "defaultRoleKey"='internal_auditor'   WHERE name IN ('مدقق داخلي','مراجع داخلي','مدقق','مراجع') AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='procurement_officer' WHERE name IN ('مسؤول مشتريات','مسؤول المشتريات','أخصائي مشتريات','موظف مشتريات') AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
UPDATE job_titles SET "defaultRoleKey"='treasurer'           WHERE name IN ('أمين خزينة','أمين الخزينة','أمين الصندوق الرئيسي') AND ("defaultRoleKey" IS NULL OR "defaultRoleKey"='');
