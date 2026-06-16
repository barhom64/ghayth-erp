-- 354_seed_phantom_hr_role_grants.sql
--
-- WHAT:  grants real capabilities to the three HR role TEMPLATES that
--        migration 278 seeded as bare rbac_roles rows with NO
--        rbac_role_grants — leaving them "phantom" roles (HR-REV-1 §3):
--          • attendance_officer  — مسؤول الحضور
--          • discipline_officer  — مسؤول الانضباط
--          • performance_reviewer — مقيِّم الأداء
--        (payroll_officer — the 4th row from 278 — already got its grants
--         in migration 306, so it is intentionally excluded here.)
--
-- WHY:   HR-REV-1 proved these three roles hold zero grants. Since
--        checkAccess is pure RBAC v2 with no legacy fallback, any user
--        bound to them is denied EVERY non-self-service feature — a
--        "role that exists but does nothing" trap. The grants below are
--        derived verbatim from each role's own description in 278 and are
--        SoD-safe by design:
--          - attendance_officer manages attendance only; NO payroll, NO
--            discipline (278:29).
--          - discipline_officer handles violations/discipline up to
--            escalation — create/update but NO approve (final sanction
--            stays with management) (278:35).
--          - performance_reviewer writes evaluations — view/create/update;
--            does NOT delete or approve (278:38).
--        Every (feature, action) is a real featureCatalog entry/action.
--
-- SAFETY: mirrors migration 306 exactly — idempotent template grants
--         (NOT EXISTS guards), per-company clone of role+grants, then a
--         repair of any user bind that landed on the bare NULL-company
--         template. Adds only; never edits existing grants.
--
-- @rollback: DELETE FROM rbac_role_grants g USING rbac_roles r WHERE g.role_id=r.id AND r.role_key IN ('attendance_officer','discipline_officer','performance_reviewer'); DELETE FROM rbac_roles WHERE role_key IN ('attendance_officer','discipline_officer','performance_reviewer') AND "companyId" IS NOT NULL;


-- ── attendance_officer — مسؤول الحضور (attendance only; no payroll/discipline) ──
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.attendance', ARRAY['view','list','export','create','update','approve']::text[], 'branch'
 FROM rbac_roles r WHERE r.role_key='attendance_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.attendance');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='attendance_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='attendance_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');


-- ── discipline_officer — مسؤول الانضباط (violations/discipline up to escalation; NO approve) ──
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.discipline', ARRAY['view','list','export','create','update']::text[], 'branch'
 FROM rbac_roles r WHERE r.role_key='discipline_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.discipline');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.violations', ARRAY['view','list','export','create','update']::text[], 'branch'
 FROM rbac_roles r WHERE r.role_key='discipline_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.violations');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='discipline_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='discipline_officer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');


-- ── performance_reviewer — مقيِّم الأداء (writes evaluations; no delete/approve) ──
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'hr.performance', ARRAY['view','list','export','create','update']::text[], 'department'
 FROM rbac_roles r WHERE r.role_key='performance_reviewer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='hr.performance');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'requests.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='performance_reviewer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='requests.*');
INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT r.id, 'documents.*', ARRAY['view','list','export','print','create','submit']::text[], 'self'
 FROM rbac_roles r WHERE r.role_key='performance_reviewer' AND r."companyId" IS NULL
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants g WHERE g.role_id=r.id AND g.feature_key='documents.*');


-- ── per-company clones (same mechanism as migration 306) ──────────────
-- Templates (companyId IS NULL) are catalog-only; bindable identities are
-- per-company clones (is_template=FALSE). Clone role + grants into every
-- existing company, then re-point any bind that landed on the bare template.
INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, color, is_system, is_template, is_active)
SELECT c.id, t.role_key, t.label_ar, t.label_en, t.description, t.level, t.color, t.is_system, FALSE, TRUE
  FROM companies c
 CROSS JOIN rbac_roles t
 WHERE t."companyId" IS NULL AND t.role_key IN ('attendance_officer','discipline_officer','performance_reviewer')
   AND NOT EXISTS (SELECT 1 FROM rbac_roles x WHERE x.role_key=t.role_key AND x."companyId"=c.id);

INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
SELECT cr.id, g.feature_key, g.actions, g.scope
  FROM rbac_roles tr
  JOIN rbac_role_grants g ON g.role_id = tr.id
  JOIN rbac_roles cr ON cr.role_key = tr.role_key AND cr."companyId" IS NOT NULL
 WHERE tr."companyId" IS NULL AND tr.role_key IN ('attendance_officer','discipline_officer','performance_reviewer')
   AND NOT EXISTS (SELECT 1 FROM rbac_role_grants e WHERE e.role_id=cr.id AND e.feature_key=g.feature_key);

UPDATE rbac_user_roles ur
   SET role_id = cr.id
  FROM rbac_roles tr, rbac_roles cr
 WHERE ur.role_id = tr.id
   AND tr."companyId" IS NULL AND tr.is_template
   AND tr.role_key IN ('attendance_officer','discipline_officer','performance_reviewer')
   AND cr.role_key = tr.role_key AND cr."companyId" = ur."companyId"
   AND NOT EXISTS (SELECT 1 FROM rbac_user_roles x WHERE x."userId"=ur."userId" AND x."companyId"=ur."companyId" AND x.role_id=cr.id);
