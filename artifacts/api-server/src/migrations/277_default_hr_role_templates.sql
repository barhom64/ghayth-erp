-- Migration 277 — Default HR role templates (#1799 §J seed)
--
-- @rollback: Idempotent seed; to undo manually:
--   DELETE FROM rbac_roles WHERE is_template = TRUE AND role_key IN
--     ('hr_admin', 'hr_manager', 'attendance_officer', 'payroll_officer',
--      'discipline_officer', 'performance_reviewer', 'employee_self_service');
--
-- The inventory (docs/HR_OPERATING_FOUNDATION_TASK.md §A.2 + §C.3)
-- found only 2 of the 9 HR role templates from #1799 §J seeded.
-- The other 7 are critical to the «من يفعل ماذا» picture:
--
--   HR Admin              ✅ موجود
--   HR Manager            ✅ موجود
--   Attendance Officer    ❌ ينقص
--   Payroll Officer       ❌ ينقص (موجود كـ legacy permission فقط)
--   Discipline Officer    ❌ ينقص
--   Performance Reviewer  ❌ ينقص
--   Branch Manager        ✅ موجود
--   Department Manager    ✅ موجود
--   Employee Self-Service ✅ موجود (default `employee` role)
--
-- This migration seeds the 4 missing templates as rbac_roles
-- (companyId IS NULL = system template). They appear in the
-- /admin/roles UI and can be cloned per company.

INSERT INTO rbac_roles ("companyId", role_key, label_ar, label_en, description, level, color, is_template, is_active)
VALUES
  (NULL, 'attendance_officer', 'مسؤول الحضور', 'Attendance Officer',
   'يدير الحضور والانصراف والورديات والأعذار. لا يصل إلى الرواتب أو الانضباط النهائي.',
   40, '#0ea5e9', TRUE, TRUE),
  (NULL, 'payroll_officer', 'مسؤول الرواتب', 'Payroll Officer',
   'يحضّر مسيرات الرواتب وملف WPS وخصومات الحضور. لا يعتمد بنفسه — يحتاج مدير مالي.',
   50, '#10b981', TRUE, TRUE),
  (NULL, 'discipline_officer', 'مسؤول الانضباط', 'Discipline Officer',
   'يدير المخالفات ومذكرات التحقيق والجزاءات حتى مرحلة التصعيد.',
   45, '#dc2626', TRUE, TRUE),
  (NULL, 'performance_reviewer', 'مقيِّم الأداء', 'Performance Reviewer',
   'يكتب تقييمات الأداء + 360 + IDP. يرى درجة الموظف الذاتية لكن لا يعدّلها.',
   45, '#8b5cf6', TRUE, TRUE)
ON CONFLICT ("companyId", role_key) DO NOTHING;
