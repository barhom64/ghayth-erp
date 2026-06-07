-- 256_seed_payroll_gl_operation_mappings.sql
--
-- #1594 — extend the controllable GL-mapping layer (migration 254) to PAYROLL.
--
-- PROBLEM
-- hrEngine payroll posting resolves GL via getAccountCodeFromMapping with
-- hardcoded defaults that don't match the standard Saudi COA:
--   payroll_salary_expense→5100 (non-postable parent "تكلفة الإيرادات"),
--   payroll_gosi_expense→5110, payroll_gosi_payable→2200,
--   payroll_deductions_payable→2210, wht_payable→2330, payroll_bank_payout→1100
--   (non-postable parent). With accounting_mappings empty the payroll accrual /
--   payment journals would post to non-postable parents → 422.
--
-- FIX
-- Seed accounting_mappings for the payroll operation keys → the company's actual
-- postable COA leaves (salary 5210, GOSI expense 5250, overtime 5230, salary
-- payable 2120, GOSI payable 2140, deductions payable 2150, WHT 2132, bank
-- payout 1121). Same idempotent, controllable pattern as 254 (only where the
-- account exists & posts; ON CONFLICT DO NOTHING preserves manual edits).
--
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" IN (
--     'payroll_salary_expense','payroll_gosi_expense','payroll_overtime_expense',
--     'payroll_gosi_payable','payroll_deductions_payable','wht_payable',
--     'payroll_bank_payout','salary_payable');
--   (only safe if these mappings were not manually customised afterwards.)

-- Single-side payroll mappings.
INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", v.op, v.label,
       CASE WHEN v.side = 'debit'  THEN coa.code END,
       CASE WHEN v.side = 'credit' THEN coa.code END,
       true, now(), now()
FROM (VALUES
  ('payroll_salary_expense',     'debit',  '5210', 'مصروف الرواتب الأساسية'),
  ('payroll_gosi_expense',       'debit',  '5250', 'حصة المنشأة في التأمينات (GOSI)'),
  ('payroll_overtime_expense',   'debit',  '5230', 'مصروف العمل الإضافي'),
  ('payroll_gosi_payable',       'credit', '2140', 'التأمينات الاجتماعية المستحقة'),
  ('payroll_deductions_payable', 'credit', '2150', 'استقطاعات مستحقة الدفع'),
  ('wht_payable',                'credit', '2132', 'ضريبة الاستقطاع المستحقة'),
  ('payroll_bank_payout',        'credit', '1121', 'صرف الرواتب من البنك')
) AS v(op, side, code, label)
JOIN chart_of_accounts coa
  ON coa.code = v.code AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;

-- salary_payable is used on BOTH sides (credited at accrual, debited at posting),
-- so set both columns to 2120 (مستحقات الرواتب والأجور).
INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", 'salary_payable', 'مستحقات الرواتب والأجور', coa.code, coa.code, true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code = '2120' AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;
