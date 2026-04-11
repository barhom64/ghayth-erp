-- Job Titles (الصفات الوظيفية) table
CREATE TABLE IF NOT EXISTS job_titles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  "nameEn" VARCHAR(100),
  category VARCHAR(50) DEFAULT 'general',
  "companyId" INTEGER REFERENCES companies(id),
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_titles_company ON job_titles("companyId");
CREATE INDEX IF NOT EXISTS idx_job_titles_category ON job_titles(category);

-- Seed initial job titles
INSERT INTO job_titles (name, "nameEn", category) VALUES
  ('مدير عام', 'General Manager', 'management'),
  ('مدير مالي', 'Finance Manager', 'management'),
  ('مدير موارد بشرية', 'HR Manager', 'management'),
  ('مدير فرع', 'Branch Manager', 'management'),
  ('مدير مشاريع', 'Projects Manager', 'management'),
  ('مدير أسطول', 'Fleet Manager', 'management'),
  ('مدير مستودعات', 'Warehouse Manager', 'management'),
  ('مدير تسويق', 'Marketing Manager', 'management'),
  ('محاسب', 'Accountant', 'finance'),
  ('محاسب أول', 'Senior Accountant', 'finance'),
  ('مراجع مالي', 'Auditor', 'finance'),
  ('محامٍ', 'Lawyer', 'legal'),
  ('مستشار قانوني', 'Legal Advisor', 'legal'),
  ('مهندس', 'Engineer', 'engineering'),
  ('مهندس مدني', 'Civil Engineer', 'engineering'),
  ('مهندس كهربائي', 'Electrical Engineer', 'engineering'),
  ('فني صيانة', 'Maintenance Technician', 'technical'),
  ('فني تقنية معلومات', 'IT Technician', 'technical'),
  ('سائق', 'Driver', 'operations'),
  ('أمين مستودع', 'Warehouse Keeper', 'operations'),
  ('موظف استقبال', 'Receptionist', 'administrative'),
  ('سكرتير', 'Secretary', 'administrative'),
  ('مساعد إداري', 'Administrative Assistant', 'administrative'),
  ('موظف', 'Employee', 'general'),
  ('متدرب', 'Trainee', 'general')
ON CONFLICT DO NOTHING;

-- Add jobTitleId column to employee_assignments
ALTER TABLE employee_assignments ADD COLUMN IF NOT EXISTS "jobTitleId" INTEGER REFERENCES job_titles(id);

-- Populate jobTitleId from existing jobTitle text where possible
UPDATE employee_assignments ea
SET "jobTitleId" = jt.id
FROM job_titles jt
WHERE ea."jobTitleId" IS NULL
  AND ea."jobTitle" IS NOT NULL
  AND jt.name = ea."jobTitle"
  AND jt."companyId" IS NULL;
