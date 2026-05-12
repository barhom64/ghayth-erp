-- Migration 126: Seed hr_leave_types with Saudi labor law defaults
-- Required for: /hr/leaves/create — leave type dropdown is empty without this

INSERT INTO hr_leave_types ("companyId", name, "annualDays", "isPaid", status, "genderRestriction", "minServiceMonths", "oncePerCareer", "requiresDocument", "maxDeptAbsentPct")
SELECT c.id, t.name, t."annualDays", t."isPaid", 'active', t."genderRestriction", t."minServiceMonths", t."oncePerCareer", t."requiresDocument", 25
FROM companies c
CROSS JOIN (VALUES
  ('إجازة سنوية',       21, true,  NULL,     3,  false, false),
  ('إجازة مرضية',       30, true,  NULL,     0,  false, true),
  ('إجازة عارضة',        5, true,  NULL,     0,  false, false),
  ('إجازة أمومة',       70, true,  'female', 0,  false, true),
  ('إجازة أبوة',         3, true,  'male',   0,  false, true),
  ('إجازة حج',          15, true,  NULL,     24, true,  false),
  ('إجازة زواج',         5, true,  NULL,     0,  true,  true),
  ('إجازة وفاة قريب',    5, true,  NULL,     0,  false, true),
  ('إجازة بدون أجر',    30, false, NULL,     6,  false, true),
  ('إجازة عدة وفاة',   130, true,  'female', 0,  false, true),
  ('إجازة امتحانات',    10, true,  NULL,     0,  false, true)
) AS t(name, "annualDays", "isPaid", "genderRestriction", "minServiceMonths", "oncePerCareer", "requiresDocument")
WHERE NOT EXISTS (
  SELECT 1 FROM hr_leave_types lt WHERE lt."companyId" = c.id AND lt.name = t.name
);
