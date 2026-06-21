-- 399_job_postings_department_fk_hardening.sql
-- تقوية ربط القسم في الإعلانات الوظيفية (تصحيح ما بعد المراجعة لـ #2769/394):
--
-- (أ) ضمان وجود قيد المفتاح الأجنبي بـ ON DELETE SET NULL (idempotent عبر حارس
--     pg_constraint): على القواعد الحقيقية أنشأت 394 القيد أصلًا بـ ON DELETE
--     SET NULL (الاسم الافتراضي job_postings_departmentId_fkey)، فهذا الحارس
--     no-op آمن؛ ويُعيد إنشاءه لو كان مفقودًا. لا DROP (تفاديًا لكسر/إعادة تشغيل).
--
-- (ب) تصحيح غموض الـbackfill: backfill 394 ربط بمطابقة الاسم دون حارس تفرّد،
--     بينما مسار recruitment يربط فقط عند تطابق فريد. نُوائم البيانات التاريخية
--     مع صرامة المسار: نُفرّغ departmentId لأي إعلان اسم قسمه غير فريد داخل
--     شركته (الاسم النصّي يبقى محفوظًا للعرض). آمن لإعادة التشغيل.
--
-- لا يمسّ الدفتر. > baseline-cutoff (297).
-- @rollback: لا يلزم (ضمان قيد + تصحيح بيانات؛ العمود نفسه من 394).

-- (أ) ضمان قيد الـFK بـ ON DELETE SET NULL — حارس IF NOT EXISTS على pg_constraint
--     (الشكل المعتمد في سياسة الهجرات: لا ADD CONSTRAINT عارٍ).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'job_postings_departmentId_fkey'
       AND conrelid = 'job_postings'::regclass
  ) THEN
    ALTER TABLE job_postings
      ADD CONSTRAINT "job_postings_departmentId_fkey"
      FOREIGN KEY ("departmentId") REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
END $$;

-- (ب) تفريغ الـFK حيث اسم القسم غير فريد داخل الشركة (مطابقة صرامة المسار:
--     لا ربط عشوائي عند الغموض؛ الاسم النصّي يبقى كما هو للعرض).
UPDATE job_postings jp
   SET "departmentId" = NULL
 WHERE jp."departmentId" IS NOT NULL
   AND jp.department IS NOT NULL
   AND (
     SELECT COUNT(*) FROM departments d
      WHERE d.name = jp.department
        AND d."companyId" = jp."companyId"
   ) > 1;
