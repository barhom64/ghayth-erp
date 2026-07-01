-- ===========================================================================
-- 442_payroll_lines_driver_hours.sql
-- ---------------------------------------------------------------------------
-- WHAT:    أعمدة بند أجر السائق بالساعة على payroll_lines (subledger detail):
--          drivingHours/Amount + stopHours/Amount. توسعية، غير كاسرة.
--
-- WHY:     **الدفعة 3** من أجر السائق بالساعة (plans/driver-hours-pay-2026-06-30.md،
--          اعتمدها إبراهيم). عند تشغيل المسيّر، تُقرأ الساعات المعتمدة من الأسطول
--          (getApprovedDriverHours) وتُضرب بمعدّل HR (resolveDriverPayRate) فيُكوَّن
--          بند راتب يُحفظ تفصيله هنا ويُرحَّل قيده. نمط `overtimeHours` القائم.
--
-- SAFETY:  ADD COLUMN IF NOT EXISTS فقط (لا DROP، لا كسر). القيم الافتراضية 0 —
--          السطور القائمة لا تتأثر، والسائق غير الساعي يبقى صفرًا.
--
-- @rollback:
--   ALTER TABLE payroll_lines
--     DROP COLUMN IF EXISTS "drivingHours",
--     DROP COLUMN IF EXISTS "drivingHoursAmount",
--     DROP COLUMN IF EXISTS "stopHours",
--     DROP COLUMN IF EXISTS "stopHoursAmount";
-- ===========================================================================

BEGIN;

ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS "drivingHours"       NUMERIC(6,2)  DEFAULT 0;
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS "drivingHoursAmount" NUMERIC(14,2) DEFAULT 0;
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS "stopHours"          NUMERIC(6,2)  DEFAULT 0;
ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS "stopHoursAmount"    NUMERIC(14,2) DEFAULT 0;

COMMIT;
