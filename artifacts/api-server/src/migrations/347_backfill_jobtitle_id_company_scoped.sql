-- 347_backfill_jobtitle_id_company_scoped.sql
-- @rollback: لا حاجة — backfill بيانات idempotent يملأ jobTitleId الفارغ فقط (لا DDL)؛ التراجع غير موصى به ويفقد الربط.
-- ADR-HR-01 (#2223) — تطبيع المسمى الوظيفي: إكمال backfill لـ jobTitleId.
--
-- migration 012 أضاف employee_assignments."jobTitleId" (FK→job_titles) لكن
-- backfill فيه طابق قوالب النظام فقط (jt."companyId" IS NULL). مسارا الكتابة
-- (create/update في routes/employees.ts) يحلّان jobTitleId مع نطاق الشركة
-- (jt."companyId" = ea."companyId" OR IS NULL)، فقد تبقى صفوف قديمة بـ
-- jobTitleId = NULL لمسمّيات خاصة بالشركة أُنشئت قبل ذلك المنطق.
--
-- هذا backfill دفاعي idempotent (WHERE jobTitleId IS NULL) يطابق منطق مسار
-- الكتابة ويملأ المتبقّي. لا يلمس العمود النصّي jobTitle (يبقى fallback
-- مُهمَل تدريجيًا للقراءة عبر COALESCE(jt.name, ea."jobTitle")).
-- لا DDL — تغيير بيانات فقط.

UPDATE employee_assignments ea
SET "jobTitleId" = jt.id
FROM job_titles jt
WHERE ea."jobTitleId" IS NULL
  AND ea."jobTitle" IS NOT NULL
  AND jt.name = ea."jobTitle"
  AND (jt."companyId" = ea."companyId" OR jt."companyId" IS NULL)
  AND jt."isActive" = TRUE;
