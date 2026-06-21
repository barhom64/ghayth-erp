-- 399_payroll_deductions_source_link.sql
-- ربط خصم الراتب بمصدره (لإلغائه الموجّه عند تغيّر المصدر).
--
-- WHAT:
--   إضافة "sourceType"/"sourceId" إلى payroll_deductions (الجدول الحيّ من 076 لا
--   يملكهما، وcreatePayrollDeduction كان يتجاهلهما). يتيح هذا لمستهلكي HR إيجاد
--   الخصم العائد لمصدر بعينه (حادث/مخالفة) وإلغاءه إن لم يُطبَّق بعد.
-- WHY:
--   متابعة مراجعة C2: إعادة تقييم حادث يحوّل المتحمّل بعيدًا عن السائق يجب أن
--   تُلغي خصمه تلقائيًا (لا تسوية يدوية). بلا عمود مصدر، الإلغاء الموجّه متعذّر.
-- DESIGN: additive + idempotent (ADD COLUMN IF NOT EXISTS، nullable). لا تغيير
--   لبيانات قائمة، لا FK مالي، لا مساس بالدفتر.
--
-- @rollback:
--   ALTER TABLE payroll_deductions DROP COLUMN IF EXISTS "sourceType";
--   ALTER TABLE payroll_deductions DROP COLUMN IF EXISTS "sourceId";

BEGIN;

ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS "sourceType" VARCHAR(40);
ALTER TABLE payroll_deductions ADD COLUMN IF NOT EXISTS "sourceId"   INTEGER;

CREATE INDEX IF NOT EXISTS idx_payroll_deductions_source
  ON payroll_deductions ("companyId", "sourceType", "sourceId");

COMMIT;
