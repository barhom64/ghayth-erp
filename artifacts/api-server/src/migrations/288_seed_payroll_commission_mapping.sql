-- 288_seed_payroll_commission_mapping.sql
--
-- HR server-side phase — umrah commission lands in payroll (راتب + عمولة).
--
-- PROBLEM
-- umrahCommissionEngine computes monthly commissions into
-- employee_commission_calculations (status calculated → approved via
-- workflowEngine), and the table has carried a payrollLineId column since
-- its creation — but the payroll runner never consumed approved
-- commissions, so «راتب + عمولة» was never actually paid through payroll.
-- The wiring lands in routes/hr.ts + engines/hrEngine.ts alongside this
-- migration; the GL side needs a mapping for the commission-expense debit.
--
-- FIX
-- Seed accounting_mappings with `payroll_commission_expense` → the
-- company's postable «المكافآت والحوافز» leaf (5240). Same idempotent,
-- controllable pattern as migrations 254/256 (only where the account
-- exists & posts; ON CONFLICT DO NOTHING preserves manual edits).
-- hrEngine falls back to 5240 when the mapping row is absent.
--
-- @rollback:
--   DELETE FROM accounting_mappings
--    WHERE "operationType" = 'payroll_commission_expense';
--   (only safe if the mapping was not manually customised afterwards.)

INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", 'payroll_commission_expense', 'مصروف عمولات المبيعات (عمرة)',
       coa.code, NULL,
       true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code = '5240' AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;
