-- ===========================================================================
-- 396_hr_rev1_salary_field_masking_oversight_roles.sql
-- ---------------------------------------------------------------------------
-- WHAT:    seed rbac_field_policies on feature hr.employees for the broad
--          read-only OVERSIGHT roles that read employee files WITHOUT a
--          compensation mandate — so salary / bankAccount / IBAN are hidden and
--          national / iqama / passport / phone / dateOfBirth are masked, the
--          same protection migration 388 gave hr_specialist & department_manager
--          and migration 110 gave tpl_hr_clerk.
-- WHY:     viewer (مطّلع, level 10) and internal_auditor (مدقّق داخلي, level 65)
--          both hold a wildcard read grant ('*' view/list/export/print @ company
--          — migrations 258 & 353). Because the field layer was never seeded for
--          them, they saw RAW salary, bankAccount and IBAN on every employee
--          file — a company-wide PII / compensation exposure for two roles that
--          have no payroll mandate. Protection was (wrongly) relying on the
--          coarse read grant rather than the field layer. This closes it,
--          privacy-by-default (safest standard).
-- POLICY NOTE (internal_auditor): masking is the safe best-practice default —
--          an auditor gets compensation data on a need basis / via an elevated
--          mandate, not blanket raw PII on the wildcard read role. If the audit
--          function must see raw salary, drop the internal_auditor block below
--          (it is isolated) rather than weakening the viewer protection.
-- SAFETY:  purely additive seed. Targets the global system roles
--          (companyId IS NULL) the same way migrations 110 & 388 do. Idempotent
--          via ON CONFLICT (role_id, feature_key, field_name) DO NOTHING, so a
--          re-run — or a role already carrying one of these policies — is a
--          no-op. No schema change. No ledger impact.
-- @rollback:
--   DELETE FROM rbac_field_policies fp
--    USING rbac_roles r
--    WHERE fp.role_id = r.id
--      AND r."companyId" IS NULL
--      AND r.role_key IN ('viewer','internal_auditor')
--      AND fp.feature_key = 'hr.employees'
--      AND fp.field_name IN ('salary','bankAccount','iban','nationalId','iqamaNumber','passportNumber','phone','dateOfBirth');
-- ===========================================================================

INSERT INTO rbac_field_policies (role_id, feature_key, field_name, mode)
SELECT r.id, p.feature_key, p.field_name, p.mode
FROM rbac_roles r
CROSS JOIN LATERAL (VALUES
  -- viewer — مطّلع (wildcard read @ company, no payroll mandate)
  ('viewer',           'hr.employees', 'salary',         'hidden'),
  ('viewer',           'hr.employees', 'bankAccount',    'hidden'),
  ('viewer',           'hr.employees', 'iban',           'hidden'),
  ('viewer',           'hr.employees', 'nationalId',     'masked'),
  ('viewer',           'hr.employees', 'iqamaNumber',    'masked'),
  ('viewer',           'hr.employees', 'passportNumber', 'masked'),
  ('viewer',           'hr.employees', 'phone',          'masked'),
  ('viewer',           'hr.employees', 'dateOfBirth',    'hidden'),
  -- internal_auditor — مدقّق داخلي (wildcard read @ company, no payroll mandate)
  ('internal_auditor', 'hr.employees', 'salary',         'hidden'),
  ('internal_auditor', 'hr.employees', 'bankAccount',    'hidden'),
  ('internal_auditor', 'hr.employees', 'iban',           'hidden'),
  ('internal_auditor', 'hr.employees', 'nationalId',     'masked'),
  ('internal_auditor', 'hr.employees', 'iqamaNumber',    'masked'),
  ('internal_auditor', 'hr.employees', 'passportNumber', 'masked'),
  ('internal_auditor', 'hr.employees', 'phone',          'masked'),
  ('internal_auditor', 'hr.employees', 'dateOfBirth',    'hidden')
) AS p(role_key, feature_key, field_name, mode)
WHERE r."companyId" IS NULL AND r.role_key = p.role_key
ON CONFLICT (role_id, feature_key, field_name) DO NOTHING;
