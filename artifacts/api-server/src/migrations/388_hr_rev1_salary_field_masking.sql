-- ===========================================================================
-- 388_hr_rev1_salary_field_masking.sql
-- ---------------------------------------------------------------------------
-- WHAT:    seed rbac_field_policies on feature hr.employees for the HR roles
--          that read employee files WITHOUT a compensation mandate, so salary /
--          bank / IBAN are hidden and national IDs are masked for them too —
--          matching the protection tpl_hr_clerk already has (migration 110).
-- WHY:     HR-REV-1 council decision (roles matrix §5/§6). The field layer was
--          seeded ONLY for tpl_hr_clerk, so hr_specialist and department_manager
--          — who hold hr.employees read at department scope but have no payroll
--          grant — saw raw salary, bankAccount and IBAN. Protection was relying
--          on "payroll feature not granted" rather than masking the field. This
--          closes that exposure for the department-scoped HR readers.
--          Roles with a real compensation mandate (owner, general_manager,
--          hr_manager, payroll_officer, branch_manager) are intentionally left
--          unmasked and get NO row here.
-- SAFETY:  purely additive seed. Targets the global template/system roles
--          (companyId IS NULL) the same way migration 110 does. Idempotent via
--          ON CONFLICT (role_id, feature_key, field_name) DO NOTHING, so a
--          re-run — or a role that already carries one of these policies — is a
--          no-op. No schema change.
-- @rollback:
--   DELETE FROM rbac_field_policies fp
--    USING rbac_roles r
--    WHERE fp.role_id = r.id
--      AND r."companyId" IS NULL
--      AND r.role_key IN ('hr_specialist','department_manager','tpl_department_manager')
--      AND fp.feature_key = 'hr.employees'
--      AND fp.field_name IN ('salary','bankAccount','iban','nationalId','iqamaNumber','passportNumber','phone','dateOfBirth');
-- ===========================================================================

INSERT INTO rbac_field_policies (role_id, feature_key, field_name, mode)
SELECT r.id, p.feature_key, p.field_name, p.mode
FROM rbac_roles r
CROSS JOIN LATERAL (VALUES
  -- hr_specialist — أخصائي موارد بشرية (hr.* read @ department, no payroll mandate)
  ('hr_specialist',          'hr.employees', 'salary',         'hidden'),
  ('hr_specialist',          'hr.employees', 'bankAccount',    'hidden'),
  ('hr_specialist',          'hr.employees', 'iban',           'hidden'),
  ('hr_specialist',          'hr.employees', 'nationalId',     'masked'),
  ('hr_specialist',          'hr.employees', 'iqamaNumber',    'masked'),
  ('hr_specialist',          'hr.employees', 'passportNumber', 'masked'),
  ('hr_specialist',          'hr.employees', 'phone',          'masked'),
  ('hr_specialist',          'hr.employees', 'dateOfBirth',    'hidden'),
  -- department_manager — مدير القسم (hr.employees read @ department, no payroll)
  ('department_manager',     'hr.employees', 'salary',         'hidden'),
  ('department_manager',     'hr.employees', 'bankAccount',    'hidden'),
  ('department_manager',     'hr.employees', 'iban',           'hidden'),
  ('department_manager',     'hr.employees', 'nationalId',     'masked'),
  ('department_manager',     'hr.employees', 'iqamaNumber',    'masked'),
  ('department_manager',     'hr.employees', 'passportNumber', 'masked'),
  ('department_manager',     'hr.employees', 'phone',          'masked'),
  ('department_manager',     'hr.employees', 'dateOfBirth',    'hidden'),
  -- tpl_department_manager — قالب مدير القسم (hr.employees view/update @ dept_tree)
  ('tpl_department_manager', 'hr.employees', 'salary',         'hidden'),
  ('tpl_department_manager', 'hr.employees', 'bankAccount',    'hidden'),
  ('tpl_department_manager', 'hr.employees', 'iban',           'hidden'),
  ('tpl_department_manager', 'hr.employees', 'nationalId',     'masked'),
  ('tpl_department_manager', 'hr.employees', 'iqamaNumber',    'masked'),
  ('tpl_department_manager', 'hr.employees', 'passportNumber', 'masked'),
  ('tpl_department_manager', 'hr.employees', 'phone',          'masked'),
  ('tpl_department_manager', 'hr.employees', 'dateOfBirth',    'hidden')
) AS p(role_key, feature_key, field_name, mode)
WHERE r."companyId" IS NULL AND r.role_key = p.role_key
ON CONFLICT (role_id, feature_key, field_name) DO NOTHING;
