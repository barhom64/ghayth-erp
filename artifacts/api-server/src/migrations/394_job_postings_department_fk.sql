-- 394_job_postings_department_fk.sql
-- توحيد القسم في الإعلانات الوظيفية (recruitment): ربط job_postings بجدول
-- departments عبر departmentId (مفتاح أجنبي اختياري) — مع الإبقاء على عمود
-- department النصّي (denormalized) للعرض والتوافق الخلفي: بوابة التوظيف العامة
-- (careersPortal) والطلبات وروابط التقويم تواصل قراءة الاسم دون أي كسر.
-- تصميم إضافي غير كاسر، لا يمسّ الدفتر.
--
-- Backfill best-effort: يربط الصفوف القائمة بالقسم المطابق بالاسم ضمن نفس
-- الشركة. idempotent (ADD COLUMN IF NOT EXISTS + شرط departmentId IS NULL)،
-- فآمن لإعادة التشغيل و > baseline-cutoff (297) فيُطبَّق على القواعد الجديدة/CI.
--
-- @rollback: ALTER TABLE job_postings DROP COLUMN IF EXISTS "departmentId";

ALTER TABLE job_postings
  ADD COLUMN IF NOT EXISTS "departmentId" INTEGER REFERENCES departments(id);

CREATE INDEX IF NOT EXISTS idx_job_postings_department
  ON job_postings ("departmentId");

-- ربط الصفوف القائمة بالقسم عبر مطابقة الاسم ضمن نفس الشركة (best-effort).
UPDATE job_postings jp
   SET "departmentId" = d.id
  FROM departments d
 WHERE jp."departmentId" IS NULL
   AND jp.department IS NOT NULL
   AND jp.department <> ''
   AND d.name = jp.department
   AND d."companyId" = jp."companyId";
