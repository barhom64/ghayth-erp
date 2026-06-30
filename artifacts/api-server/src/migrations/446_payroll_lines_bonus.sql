-- ===========================================================================
-- 446_payroll_lines_bonus.sql
-- ---------------------------------------------------------------------------
-- WHAT:    عمود `bonusAmount` على payroll_lines — مكافآت حركات النقل المُرحَّلة
--          في المسيّر (subledger detail).
--
-- WHY:     **الدفعة ب** من مكافآت حركات النقل. عند تشغيل المسيّر تُقرأ المكافآت
--          المعتمدة من الأسطول (getApprovedMovementBonusesForCompany) وتُضاف بندَ
--          راتب يُحفظ تفصيله هنا ويُرحَّل قيده. نمط overtime/commission القائم.
--
-- SAFETY:  ADD COLUMN IF NOT EXISTS فقط (لا DROP، لا كسر). الافتراضي 0 —
--          السطور القائمة وغير السائقين لا تتأثر.
--
-- @rollback:
--   ALTER TABLE payroll_lines DROP COLUMN IF EXISTS "bonusAmount";
-- ===========================================================================

BEGIN;

ALTER TABLE payroll_lines ADD COLUMN IF NOT EXISTS "bonusAmount" NUMERIC(14,2) DEFAULT 0;

COMMIT;
