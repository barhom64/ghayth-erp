-- 380_payroll_liability_settlement.sql
--
-- #2303 (FIN-PAYROLL-DEDUCTIONS-LOAN-INTEGRITY) — settlement-on-payment side.
--
-- PROBLEM
-- #2476 (migration 378) closed the ACCRUAL/classification gap: payroll deductions
-- are now split per-employee (loan → CR 1143, late/absence/violation → 5215/16/17).
-- But the SETTLEMENT side is still missing: the payroll liabilities accrued every
-- run —
--   • 2140 payroll_gosi_payable        (employer + employee GOSI, remitted to GOSI)
--   • 2132 wht_payable                 (ZATCA withholding, remitted on filing)
--   • 2150 payroll_deductions_payable  (residual clearing, post-#2476)
-- are only ever CREDITED (postPayrollRunGL). Nothing DEBITS them when the company
-- actually PAYS the authority, so 2140/2132/2150 grow without bound and the ledger
-- never reflects the real cash remittance (GL ↔ operational divergence).
--
-- FIX (this migration is the schema half; hrEngine.postPayrollLiabilitySettlementGL
-- + the gl-helpers route are the posting half)
--   (a) payroll_liability_settlements — records each remittance the operator makes
--       (which run, which liability, how much, when, external receipt#, the bank
--       account credited, and the resulting settlement JE). A partial-unique index
--       on (companyId, payrollRunId, liabilityType) makes the remittance
--       idempotent: one active settlement per liability per run, so a re-submit
--       can't double-pay. Soft-delete (deletedAt) lets an operator void+redo.
--   (b) Make payroll_gosi_payable / wht_payable / payroll_deductions_payable
--       BOTH-SIDED mappings (fill debitAccountCode = creditAccountCode where the
--       debit side is still NULL) — exactly the salary_payable (256) /
--       employee_loan_receivable (378) pattern — so resolveAccountCode(...,"debit",
--       ...) returns the controllable mapped liability account instead of relying
--       on the code-level fallback. The liability account is the same on both
--       sides (credited at accrual, debited at settlement). Operator overrides on
--       the credit side are preserved (debit copies whatever credit holds); rows
--       whose debit side was already customised are left untouched.
--
-- NOTE on #2280 coordination (owner-approved scope includes WHT 2132): the WHT
-- settled here is the PAYROLL-sourced withholding, keyed to a specific payroll run
-- (sourceType 'payroll_liability_settlement'). #2280's future unified tax engine
-- settles invoice-sourced WHT + the broader VAT/Zakat filing under its own source
-- keys; because each settlement is tied to (and capped at) its own accrual source,
-- the two never clear the same 2132 accrual twice.
--
-- @rollback:
--   DROP TABLE IF EXISTS payroll_liability_settlements;
--   UPDATE accounting_mappings SET "debitAccountCode" = NULL
--     WHERE "operationType" IN ('payroll_gosi_payable','wht_payable',
--       'payroll_deductions_payable') AND "debitAccountCode" = "creditAccountCode";

-- ── (a) Remittance ledger ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_liability_settlements (
  id                SERIAL PRIMARY KEY,
  "companyId"       INTEGER     NOT NULL,
  "branchId"        INTEGER,
  "payrollRunId"    INTEGER     NOT NULL,
  period            VARCHAR(7)  NOT NULL,                    -- YYYY-MM
  "liabilityType"   VARCHAR(20) NOT NULL
                      CHECK ("liabilityType" IN ('gosi','wht','deductions')),
  amount            NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  "paymentDate"     DATE        NOT NULL,
  "referenceNumber" VARCHAR(100),                            -- external receipt (GOSI/ZATCA)
  "bankAccountCode" VARCHAR(20),                             -- COA leaf credited (cash/bank)
  "journalEntryId"  INTEGER,                                 -- the posted settlement JE
  "createdBy"       INTEGER,
  "createdAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deletedAt"       TIMESTAMPTZ
);

-- One ACTIVE settlement per (company, run, liability) — idempotent remittance.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payroll_liab_settle_run_type
  ON payroll_liability_settlements ("companyId", "payrollRunId", "liabilityType")
  WHERE "deletedAt" IS NULL;

-- List/lookup by company + run (pending-queue join, history).
CREATE INDEX IF NOT EXISTS ix_payroll_liab_settle_company_run
  ON payroll_liability_settlements ("companyId", "payrollRunId");

-- ── (b) Both-side the three liability mappings (settlement DR side) ──────────
UPDATE accounting_mappings
   SET "debitAccountCode" = "creditAccountCode",
       "updatedAt" = now()
 WHERE "operationType" IN ('payroll_gosi_payable','wht_payable','payroll_deductions_payable')
   AND "debitAccountCode" IS NULL
   AND "creditAccountCode" IS NOT NULL;
