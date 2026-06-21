-- 395_job_postings_department_fk_hardening.sql
-- تقوية ربط القسم في الإعلانات الوظيفية (تصحيح ما بعد المراجعة لـ #2769/394):
--
-- (أ) تطبيع قيد المفتاح الأجنبي إلى ON DELETE SET NULL بشكل قطعي (idempotent):
--     لو طُبّقت نسخة سابقة من 394 (قبل إضافة ON DELETE SET NULL) على قاعدة ما،
--     فإن ADD COLUMN IF NOT EXISTS لن يُصلح القيد. هنا نُسقط أي FK على
--     departmentId ونعيد إنشاءه بـ ON DELETE SET NULL — فالقيد صحيح حتمًا.
--
-- (ب) تصحيح غموض الـbackfill: backfill 394 ربط بمطابقة الاسم دون حارس تفرّد،
--     بينما مسار recruitment يربط فقط عند تطابق فريد. نُوائم البيانات التاريخية
--     مع صرامة المسار: نُفرّغ departmentId لأي إعلان اسم قسمه غير فريد داخل
--     شركته (الاسم النصّي يبقى محفوظًا للعرض). آمن لإعادة التشغيل.
--
-- لا يمسّ الدفتر. > baseline-cutoff (297).
-- @rollback: لا يلزم (تطبيع قيد + تصحيح بيانات؛ العمود نفسه من 394).

-- (أ) تطبيع قيد الـFK إلى ON DELETE SET NULL.
DO $$
DECLARE c_name text;
BEGIN
  SELECT con.conname INTO c_name
    FROM pg_constraint con
    JOIN pg_attribute att
      ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
   WHERE con.conrelid = 'job_postings'::regclass
     AND con.contype = 'f'
     AND att.attname = 'departmentId'
   LIMIT 1;
  IF c_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE job_postings DROP CONSTRAINT %I', c_name);
  END IF;
  ALTER TABLE job_postings
    ADD CONSTRAINT "job_postings_departmentId_fkey"
    FOREIGN KEY ("departmentId") REFERENCES departments(id) ON DELETE SET NULL;
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
