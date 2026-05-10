-- ============================================================================
-- 070_employee_contracts_missing_columns.sql
--
-- The INSERT in routes/hr-contracts.ts references 8 columns that don't exist
-- on employee_contracts. Users creating a contract hit Postgres error 42703
-- ("column does not exist") which the error handler surfaces as:
--   "خطأ في هيكل قاعدة البيانات، يرجى التواصل مع الدعم الفني"
--
-- This migration adds every missing column + creates the contract_number_seq
-- referenced at hr-contracts.ts:109.
--
-- Idempotent via ADD COLUMN IF NOT EXISTS / CREATE SEQUENCE IF NOT EXISTS.
-- ============================================================================

ALTER TABLE employee_contracts
  ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "housingAllowance" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "transportAllowance" NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS "otherAllowances" JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "templateId" INTEGER,
  ADD COLUMN IF NOT EXISTS "branchId" INTEGER,
  ADD COLUMN IF NOT EXISTS ref VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "approvalStatus" VARCHAR(20) DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS "createdBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedBy" INTEGER,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP;

-- Unique ref per company (when present)
CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_contracts_ref
  ON employee_contracts ("companyId", ref)
  WHERE ref IS NOT NULL AND "deletedAt" IS NULL;

-- Sequence used for ref generation (CTR-YYYY-XXXX)
CREATE SEQUENCE IF NOT EXISTS contract_number_seq
  START WITH 1 INCREMENT BY 1 NO MAXVALUE NO CYCLE;

-- ============================================================================
-- End of 070_employee_contracts_missing_columns.sql
-- ============================================================================
