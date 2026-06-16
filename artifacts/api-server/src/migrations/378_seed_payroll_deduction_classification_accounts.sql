-- 378_seed_payroll_deduction_classification_accounts.sql
--
-- #2303 (FIN-PAYROLL-DEDUCTIONS-LOAN-INTEGRITY) — classify payroll deductions.
--
-- PROBLEM
-- postPayrollRunGL bundled EVERY non-GOSI/non-WHT deduction (loan repayments +
-- late + absence + violation) into one credit on payroll_deductions_payable
-- (2150), which is never settled. Two consequences:
--   • Employee-loan repayments never CREDITED the loan receivable (1143), so the
--     GL receivable grew forever while the subledger (hr_loan_installments) said
--     "paid" → GL ↔ subledger divergence.
--   • Late/absence/violation withholdings had no home account — they sat,
--     unclassified, in the generic clearing.
--
-- FIX (owner decided the accounting call, in Arabic, on the issue thread)
--   • loan repayment      → CR employee_loan_receivable (1143)  — CLOSES the loan
--   • late deduction      → CR 5215 استقطاعات التأخير  (contra-expense under 5200)
--   • absence deduction   → CR 5216 استقطاعات الغياب   (contra-expense under 5200)
--   • violation deduction → CR 5217 استقطاعات المخالفات (contra-expense under 5200)
-- Late/absence/violation are credited to contra-expense leaves so net employee
-- cost reflects what was actually paid; the loan leg closes the receivable.
-- Posting is per-employee (dimensional), matching the existing DR breakdown.
--
-- This migration (a) backfills the 3 new postable leaves under 5200 for existing
-- companies, then (b) seeds controllable accounting_mappings for the 3 new
-- purposes + employee_loan_receivable (both-sided → 1143, debited at
-- disbursement, credited at repayment — same pattern salary_payable uses).
-- Mirrors 369 (chart backfill) + 256 (payroll mapping seed): per-company,
-- idempotent, only where the target leaf exists & posts; ON CONFLICT preserves
-- operator overrides. New leaves are also added to companyBootstrap so fresh
-- tenants get them.
--
-- @rollback:
--   DELETE FROM accounting_mappings WHERE "operationType" IN (
--     'payroll_late_deduction','payroll_absence_deduction',
--     'payroll_violation_deduction','employee_loan_receivable');
--   -- (new leaves 5215/5216/5217 are additive; drop manually only if unused)

-- ── (a) New contra-expense leaves for existing companies ────────────────────
-- Explicit allowPosting=true + parentId (subquery) + status — same robust shape
-- as migration 336, so the leaves are postable regardless of column defaults.
INSERT INTO chart_of_accounts
  ("companyId", code, name, "nameEn", type, "parentId", "parentCode", level, "allowPosting", "isActive", status)
SELECT
  c.id, m.code, m.name, m.name_en, 'expense',
  (SELECT p.id FROM chart_of_accounts p
     WHERE p."companyId" = c.id AND p.code = '5200' AND p."deletedAt" IS NULL LIMIT 1),
  '5200', 3, true, true, 'active'
FROM companies c
CROSS JOIN (VALUES
  ('5215','استقطاعات التأخير','Late Deductions'),
  ('5216','استقطاعات الغياب','Absence Deductions'),
  ('5217','استقطاعات المخالفات','Violation Deductions')
) AS m(code, name, name_en)
ON CONFLICT ("companyId", code) DO NOTHING;

-- ── (b1) Single-side mappings for the 3 new deduction purposes ──────────────
INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", m.op, m.label, NULL, coa.code, true, now(), now()
FROM (VALUES
  ('payroll_late_deduction',      'استقطاعات التأخير',   '5215'),
  ('payroll_absence_deduction',   'استقطاعات الغياب',    '5216'),
  ('payroll_violation_deduction', 'استقطاعات المخالفات', '5217')
) AS m(op, label, code)
JOIN chart_of_accounts coa
  ON coa.code = m.code AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;

-- ── (b2) employee_loan_receivable is used on BOTH sides (debited at
-- disbursement, credited at repayment), so set both columns to 1143
-- (قروض موظفين). Previously unseeded — postLoanDisbursementGL relied on the
-- code-level fallback; this makes the mapping controllable + repayment-safe.
INSERT INTO accounting_mappings
  ("companyId","operationType","operationLabel","debitAccountCode","creditAccountCode","isActive","createdAt","updatedAt")
SELECT coa."companyId", 'employee_loan_receivable', 'قروض موظفين', coa.code, coa.code, true, now(), now()
FROM chart_of_accounts coa
WHERE coa.code = '1143' AND coa."allowPosting" = true AND coa."deletedAt" IS NULL
ON CONFLICT ("companyId","operationType") DO NOTHING;
