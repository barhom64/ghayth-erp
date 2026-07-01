-- ===========================================================================
-- 447_seed_driver_bonus_gl.sql
-- ---------------------------------------------------------------------------
-- WHAT:    حساب دفتر «مصروف مكافآت السائقين» (5245) + ربط العملية
--          payroll_driver_bonus_expense → debit 5245 لكل شركة.
--
-- WHY:     **الدفعة ب** — قيد بند مكافأة الحركة في مسيّر الرواتب. القرار المعتمد:
--          حساب منفصل (الرموز 5210/5220/5240/5250 محجوزة؛ اختير 5245 الحرّ بين
--          العمولة 5240 والتأمينات 5250). يُحلّ في hrEngine عبر resolveAccountCode
--          الذي يتطلّب حسابًا قابلًا للترحيل. لا يُحلّ إلا حين totalBonuses > 0.
--
-- DESIGN:  نمط 035 (backfill لكل الشركات) للحساب، ونمط 256/288 لربط العملية.
--          المكافأة حافز — لا تخضع لـGOSI (قرار إبراهيم)، كالعمولة.
--
-- SAFETY:  seed فقط، idempotent (NOT EXISTS + ON CONFLICT)، لا مساس بقيود قائمة.
--          الإذن: إبراهيم اعتمد الدفعة ب بحساب منفصل (2026-06-30).
--
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" = 'payroll_driver_bonus_expense';
--   -- (حساب 5245 يُترك؛ حذفه قد يكسر قيودًا رُحّلت إليه.)
-- ===========================================================================

BEGIN;

-- 1) حساب الدفتر 5245 لكل شركة (قابل للترحيل، تحت مجموعة المصروفات 5200).
INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, level, "allowPosting", "isActive")
SELECT c.id, '5245', 'مصروف مكافآت السائقين', 'Driver Bonuses Expense', 'expense', 3, true, true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa WHERE coa."companyId" = c.id AND coa.code = '5245'
)
ON CONFLICT DO NOTHING;

-- 2) ربط العملية payroll_driver_bonus_expense → مدين 5245.
INSERT INTO accounting_mappings
  ("companyId", "operationType", "operationLabel", "debitAccountCode", "creditAccountCode",
   "isActive", "createdAt", "updatedAt")
SELECT coa."companyId", 'payroll_driver_bonus_expense', 'مصروف مكافآت السائقين',
       coa.code, NULL, true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code = '5245' AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId", "operationType") DO NOTHING;

COMMIT;
