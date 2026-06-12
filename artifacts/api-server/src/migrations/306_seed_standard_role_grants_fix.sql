-- 291_seed_standard_role_grants_fix.sql — PR-9a (#2077)
--
-- WHAT:  close FU-1 (docs/hr/WAVE_FOLLOWUPS.md): the standard roles
--        `department_manager` and `payroll_officer` resolve to ZERO
--        rbac_role_grants, so their personas log in with 0 sidebar
--        modules (live measurement in PR-8a: dept=0, payroll=0 vs
--        hr=6, employee=5).
--
--        Two distinct gaps:
--          • payroll_officer  — role row seeded by migration 278 as a
--            template, but 278 seeded ROLES only, never grants.
--          • department_manager — NO rbac_roles row exists at all
--            (278's inventory comment claimed «موجود» but only the
--            unrelated `tpl_department_manager` template from 110
--            exists). rbac_user_roles INSERT…SELECT against the key
--            silently bound nothing.
--
-- HOW:   same idempotent WHERE-NOT-EXISTS pattern as the standard
--        catalog seed (258). Grants use EXACT feature keys from
--        featureCatalog.ts — the authz engine matches a grant only if
--        feature_key equals the requested feature, `<moduleKey>.*`, or
--        `*` (authzEngine.ts), so sub-namespace wildcards like
--        'hr.payroll.*' would never match and are deliberately NOT
--        used here. Scopes are within each feature's availableScopes.
--
-- DOCTRINE (product-owner mandate, PR-9a):
--   • payroll_officer  يرى الرواتب والأثر المالي فقط — NO hr.discipline
--     grant of any kind, NO approve on payroll runs («لا يعتمد بنفسه —
--     يحتاج مدير مالي», migration 278 description).
--   • department_manager يرى وحداته بنطاق department لا كل النظام —
--     mirrors the tpl_department_manager (110) bundle at scope
--     'department'.
--   • No RBAC-logic change, no authMiddleware change — data only.
--
-- SAFETY: idempotent; never touches existing roles/grants; rollback
--         removes exactly what it added.
--
-- @rollback: DELETE FROM rbac_role_grants g USING rbac_roles r WHERE g.role_id=r.id AND r.role_key IN ('department_manager','payroll_officer'); DELETE FROM rbac_user_roles ur USING rbac_roles r WHERE ur.role_id=r.id AND r.role_key IN ('department_manager','payroll_officer'); DELETE FROM rbac_roles WHERE role_key='department_manager'; DELETE FROM rbac_roles WHERE role_key='payroll_officer' AND "companyId" IS NOT NULL;

-- ── department_manager — مدير القسم ────────────────────────────────
-- Role row (missing entirely — the root cause of the silent 0-bind).
INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, is_system, is_template, is_active)
SELECT NULL, 'department_manager', 'مدير القسم', 'Department Manager',
       'يرى موظفي قسمه وحضورهم، يعتمد إجازات وطلبات قسمه، ويقيّم أداءهم. نطاقه قسمه فقط — ليس الفرع ولا الشركة.',
       50, true, true, true
 WHERE NOT EXISTS (SELECT 1 FROM rbac_roles WHERE role_key='department_manager' AND "companyId" IS NULL);

-- hr.employees — قائمة موظفي القسم (view/list only; no update/delete)
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.employees', ARRAY['view','list']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='department_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.employees');

-- hr.attendance — حضور القسم
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.attendance', ARRAY['view','list','export']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='department_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.attendance');

-- hr.leaves — اعتماد إجازات القسم
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.leaves', ARRAY['view','list','approve','reject']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='department_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.leaves');

-- hr.performance — تقييم أداء القسم
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.performance', ARRAY['view','list','create','update']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='department_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.performance');

-- reports — تقارير نطاق القسم
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'reports', ARRAY['view','list','export']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='department_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='reports');

-- requests.* — طلبات القسم (يقدّم لنفسه ويعتمد لقسمه)
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit','approve','reject']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='department_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');

-- documents.* — مستنداته الذاتية (نفس حزمة employee)
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='department_manager' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');

-- ── payroll_officer — مسؤول الرواتب ───────────────────────────────
-- Role row exists (278). Grants: the payroll/WPS preparation lane ONLY.
-- Deliberately ABSENT: hr.discipline (التحقيقات والجزاءات), approve on
-- payroll runs (الاعتماد للمدير المالي), hr.employees (يقرأ أسطر المسير
-- لا ملفات الموظفين).

-- hr.payroll — الإطار العام (اطلاع + تصدير، يشمل الاستحقاقات preview)
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.payroll', ARRAY['view','list','export']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='payroll_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.payroll');

-- hr.payroll.runs — يحضّر المسيرات ويعدّلها؛ لا يعتمد ولا يحذف
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.payroll.runs', ARRAY['view','list','export','create','update']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='payroll_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.payroll.runs');

-- hr.payroll.wps — يولّد ملف WPS ويسلّمه (actions within the catalog set)
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.payroll.wps', ARRAY['view','list','export','create','update','submit']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='payroll_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.payroll.wps');

-- hr.attendance — قراءة الحضور لتحضير خصوماته (read-only)
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.attendance', ARRAY['view','list','export']::text[], 'company'
 FROM rbac_roles r WHERE r.role_key='payroll_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.attendance');

-- requests.* / documents.* — الحزمة الذاتية القياسية (نفس employee)
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='payroll_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='payroll_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');

-- ── per-company clones ─────────────────────────────────────────────
-- The session layer (authSession.ts) surfaces ONLY non-template roles
-- (`r.is_template = FALSE`) in /auth/me userRoles — templates are
-- catalog entries for the role composer, not bindable identities.
-- Every standard role that works today (employee/driver/hr_manager…)
-- works through a PER-COMPANY clone; binding a user straight to the
-- NULL-company template authorizes (authzEngine has no template
-- filter) but renders a 0-module sidebar — exactly the FU-1 symptom.
-- So: clone role + grants into every existing company, then re-point
-- any user binds that landed on the bare templates.

INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, is_system, is_template, is_active)
SELECT c.id, t.role_key, t.label_ar, t.label_en, t.description, t.level, t.is_system, FALSE, TRUE
  FROM companies c
 CROSS JOIN rbac_roles t
 WHERE t."companyId" IS NULL AND t.role_key IN ('department_manager','payroll_officer')
   AND NOT EXISTS (SELECT 1 FROM rbac_roles x WHERE x.role_key=t.role_key AND x."companyId"=c.id);

INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT cr.id, g.feature_key, g.actions, g.scope
  FROM rbac_roles tr
  JOIN rbac_role_grants g ON g.role_id = tr.id
  JOIN rbac_roles cr ON cr.role_key = tr.role_key AND cr."companyId" IS NOT NULL
 WHERE tr."companyId" IS NULL AND tr.role_key IN ('department_manager','payroll_officer')
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants e WHERE e.role_id=cr.id AND e.feature_key=g.feature_key);

-- Repair existing binds that point at the bare template (the PR-6/PR-8a
-- journey personas): move them to their company's clone.
UPDATE rbac_user_roles ur
   SET role_id = cr.id
  FROM rbac_roles tr, rbac_roles cr
 WHERE ur.role_id = tr.id
   AND tr."companyId" IS NULL AND tr.is_template
   AND tr.role_key IN ('department_manager','payroll_officer')
   AND cr.role_key = tr.role_key AND cr."companyId" = ur."companyId"
   AND NOT EXISTS (SELECT 1 FROM rbac_user_roles x WHERE x."userId"=ur."userId" AND x."companyId"=ur."companyId" AND x.role_id=cr.id);
