-- Public announcements (news) for login page
CREATE TABLE IF NOT EXISTS public_announcements (
  id SERIAL PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  body TEXT,
  category VARCHAR(50) DEFAULT 'general',
  "companyId" INTEGER REFERENCES companies(id),
  "isActive" BOOLEAN DEFAULT true,
  "publishedAt" TIMESTAMPTZ DEFAULT NOW(),
  "expiresAt" TIMESTAMPTZ,
  "createdBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_public_announcements_active ON public_announcements ("isActive", "publishedAt");

-- Employee of the month
CREATE TABLE IF NOT EXISTS employee_of_month (
  id SERIAL PRIMARY KEY,
  "employeeId" INTEGER NOT NULL REFERENCES employees(id),
  "month" INTEGER NOT NULL CHECK ("month" BETWEEN 1 AND 12),
  "year" INTEGER NOT NULL,
  reason TEXT,
  "companyId" INTEGER REFERENCES companies(id),
  "branchId" INTEGER REFERENCES branches(id),
  "isActive" BOOLEAN DEFAULT true,
  "createdBy" INTEGER REFERENCES users(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("companyId", "month", "year")
);

-- Password reset requests
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  "resolvedBy" INTEGER REFERENCES users(id),
  "resolvedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_pending ON password_reset_requests (status, "createdAt");

-- Seed some sample data
INSERT INTO public_announcements (title, body, category, "isActive", "publishedAt")
VALUES
  ('تحديث النظام — إصدار جديد', 'تم إطلاق الإصدار الأخير من منصة غيث مع تحسينات في الأداء وواجهات جديدة للموارد البشرية والمالية.', 'update', true, NOW()),
  ('بدء التسجيل في برنامج التدريب', 'يسر إدارة الموارد البشرية الإعلان عن بدء التسجيل في البرنامج التدريبي الصيفي لتطوير مهارات الموظفين.', 'hr', true, NOW() - INTERVAL '1 day'),
  ('تذكير: تحديث بيانات الموظفين', 'نرجو من جميع الموظفين تحديث بياناتهم الشخصية عبر بوابة الخدمة الذاتية قبل نهاية الشهر الحالي.', 'general', true, NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;
