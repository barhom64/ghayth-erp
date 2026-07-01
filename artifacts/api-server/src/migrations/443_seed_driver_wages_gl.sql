-- ===========================================================================
-- 443_seed_driver_wages_gl.sql
-- ---------------------------------------------------------------------------
-- WHAT:    حساب دفتر «مصروف أجور السائقين بالساعة» (5220) + ربط عملية
--          payroll_driver_wages_expense → debit 5220 لكل شركة.
--
-- WHY:     **الدفعة 3** — قيد بند أجر السائق بالساعة في مسيّر الرواتب. قرار
--          إبراهيم: حساب منفصل (5240 محجوز للعمولة، فاختير 5220 الحرّ بين الراتب
--          5210 والعمل الإضافي 5230). يُحلّ في hrEngine عبر resolveAccountCode
--          الذي يتطلّب حسابًا قابلًا للترحيل (assertPostableAccount).
--
-- DESIGN:  نمط 035 (backfill لكل الشركات + ON CONFLICT) للحساب، ونمط 256/288
--          لربط العملية. السطر يُحلّ ويُرحَّل فقط حين totalDriverWages > 0
--          (الشركات بلا أجر سائقين لا تمسّ هذا الحساب إطلاقًا).
--
-- SAFETY:  seed فقط، idempotent (NOT EXISTS + ON CONFLICT)، لا مساس بقيود قائمة.
--          الإذن: إبراهيم اعتمد الدفعة 3 بحساب منفصل.
--
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" = 'payroll_driver_wages_expense';
--   -- (حساب 5220 يُترك؛ حذفه قد يكسر قيودًا رُحّلت إليه.)
-- ===========================================================================

BEGIN;

-- 1) حساب الدفتر 5220 لكل شركة (قابل للترحيل، تحت مجموعة المصروفات 5200).
INSERT INTO chart_of_accounts ("companyId", code, name, "nameEn", type, level, "allowPosting", "isActive")
SELECT c.id, '5220', 'مصروف أجور السائقين بالساعة', 'Driver Hourly Wages Expense', 'expense', 3, true, true
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM chart_of_accounts coa WHERE coa."companyId" = c.id AND coa.code = '5220'
)
ON CONFLICT DO NOTHING;

-- 2) ربط العملية payroll_driver_wages_expense → مدين 5220.
INSERT INTO accounting_mappings
  ("companyId", "operationType", "operationLabel", "debitAccountCode", "creditAccountCode",
   "isActive", "createdAt", "updatedAt")
SELECT coa."companyId", 'payroll_driver_wages_expense', 'مصروف أجور السائقين بالساعة',
       coa.code, NULL, true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code = '5220' AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId", "operationType") DO NOTHING;

COMMIT;
