-- Seed common Arabic job titles for Al Door Group
-- Idempotent: ON CONFLICT DO NOTHING via NOT EXISTS guard (no UNIQUE on name)

INSERT INTO job_titles (name, "nameEn", category, "companyId", "isActive")
SELECT v.name, v."nameEn", v.category, NULL, true
FROM (VALUES
  ('محاسب',              'Accountant',         'finance'),
  ('محاسب أول',          'Senior Accountant',  'finance'),
  ('مدير مالي',          'Finance Manager',    'finance'),
  ('أمين صندوق',         'Cashier',            'finance'),
  ('مدير موارد بشرية',    'HR Manager',         'hr'),
  ('أخصائي موارد بشرية',  'HR Specialist',      'hr'),
  ('مدير مبيعات',        'Sales Manager',      'sales'),
  ('مندوب مبيعات',       'Sales Representative','sales'),
  ('سائق',               'Driver',             'fleet'),
  ('فني صيانة',          'Maintenance Technician','operations'),
  ('أمين مستودع',        'Warehouse Keeper',   'warehouse'),
  ('مدير مشروع',         'Project Manager',    'projects'),
  ('مهندس',              'Engineer',           'engineering'),
  ('سكرتير تنفيذي',       'Executive Secretary','admin'),
  ('مدير عام',           'General Manager',    'executive')
) AS v(name, "nameEn", category)
WHERE NOT EXISTS (
  SELECT 1 FROM job_titles jt
  WHERE jt.name = v.name AND jt."companyId" IS NULL
);
