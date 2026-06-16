-- ===========================================================================
-- Migration 384: re-seed the 6 SYSTEM employee categories (companyId IS NULL)
-- ---------------------------------------------------------------------------
-- Migration 270 created `employee_categories` and seeded the 6 system
-- templates (worker / driver / field_employee / office_employee / manager /
-- executive) as GLOBAL rows (companyId IS NULL). But 270 is a PRE-cutoff
-- migration: on every database provisioned from the committed schema dump it
-- is pre-marked applied WITHOUT running, so the CREATE TABLE lands (it is in
-- the dump) while the seed INSERT never executes. Result: the catalog is
-- EMPTY everywhere — the "فئة الموظف" picker in the employee-create wizard
-- (EmployeeCategorySelect) renders zero options, and the per-category
-- attendance engine has no system fallback.
--
-- This re-seeds the 6 system rows. It is post-cutoff, so it runs on every DB.
--
-- Idempotency: 270's original seed used `ON CONFLICT ("companyId","categoryKey")
-- DO NOTHING`, which NEVER fires for global rows — Postgres treats a NULL
-- companyId as DISTINCT in the UNIQUE constraint, so a replay would duplicate
-- (the migration-383 lesson). We therefore guard each row with WHERE NOT
-- EXISTS on (companyId IS NULL, categoryKey), which is correct for global rows
-- and leaves any per-company override (companyId NOT NULL) untouched.
--
-- @rollback: DELETE FROM employee_categories WHERE "companyId" IS NULL;
-- ===========================================================================

INSERT INTO employee_categories
  ("companyId", "categoryKey", "labelAr", "labelEn", description, color,
   "displayOrder", "exemptFromAutoDeduction", "trackingFrequencySeconds")
SELECT NULL, v."categoryKey", v."labelAr", v."labelEn", v.description, v.color,
       v."displayOrder", v."exemptFromAutoDeduction", v."trackingFrequencySeconds"
FROM (VALUES
  ('worker',          'عامل',           'Worker',          'عامل ميداني/إنتاجي بسياسة حضور صارمة وخصومات تلقائية.', '#dc2626', 10, FALSE,   0),
  ('driver',          'سائق',           'Driver',          'سائق مع تتبع GPS لحظي وربط بالرحلات والمهمات.',         '#f59e0b', 20, FALSE,  30),
  ('field_employee',  'موظف ميداني',    'Field Employee',  'موظف ميداني (مندوب، فني، إلخ) مع تتبع موقع دوري.',     '#fb923c', 30, FALSE, 300),
  ('office_employee', 'موظف إداري',     'Office Employee', 'موظف مكتبي بسياسة سماح مستقلة.',                       '#3b82f6', 40, FALSE,   0),
  ('manager',         'مدير قسم/فرع',   'Manager',         'مدير بحضور مرن وبدون خصم تلقائي.',                     '#8b5cf6', 50, TRUE,    0),
  ('executive',       'تنفيذي / GM',    'Executive',       'متابعة نشاط فقط — لا حضور إلزامي ولا خصم تلقائي.',     '#0ea5e9', 60, TRUE,    0)
) AS v("categoryKey", "labelAr", "labelEn", description, color,
       "displayOrder", "exemptFromAutoDeduction", "trackingFrequencySeconds")
WHERE NOT EXISTS (
  SELECT 1 FROM employee_categories ec
   WHERE ec."companyId" IS NULL
     AND ec."categoryKey" = v."categoryKey"
);
