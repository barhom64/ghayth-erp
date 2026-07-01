-- 452_employee_violation_evidence_fields.sql
--
-- حقول أدلة المخالفة التأديبية (اعتماد إبراهيم 2026-07-01).
--
-- @rollback: Fully additive. To undo:
--   ALTER TABLE employee_violations
--     DROP COLUMN IF EXISTS witness,
--     DROP COLUMN IF EXISTS location,
--     DROP COLUMN IF EXISTS "actionTaken";
--
-- PROBLEM
-- شاشة تسجيل المخالفة (violations-create.tsx) تجمع ثلاثة حقول يُدخلها المشغّل
-- ويرسلها فعلًا، والـ zod schema يقبلها — لكن معالِج POST /hr/violations لا
-- يستخرجها والـ INSERT لا يحويها، والجدول employee_violations لا يملك أعمدتها.
-- فتضيع بيانات أدلة حساسة قانونيًا (لائحة الجزاءات / نزاعات عمّالية):
--   • witness      — اسم الشاهد على الواقعة
--   • location     — مكان وقوع المخالفة
--   • actionTaken  — الإجراء المتخذ (إنذار شفهي/كتابي/خصم)
-- هذه بالضبط حقول الإثبات التي يُحتَجّ بها عند الاعتراض على الجزاء.
--
-- FIX
-- إضافة الأعمدة الثلاثة (nullable، إضافية بحتة — الصفوف القائمة تبقى NULL).
-- المعالِج في hr.ts يبدأ كتابتها في الدفعة نفسها؛ الهجرة وحدها خاملة الأثر.

ALTER TABLE employee_violations
  ADD COLUMN IF NOT EXISTS witness       text,
  ADD COLUMN IF NOT EXISTS location      text,
  ADD COLUMN IF NOT EXISTS "actionTaken" text;
