-- ─────────────────────────────────────────────────────────────────────────────
-- 062: Financial System Hardening
-- Covers: Period Close, Journal Approval, Bank Guarantees,
--         Intercompany, Project Costing, Cash Flow Forecast
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Ensure financial_periods has all required columns
ALTER TABLE financial_periods
  ADD COLUMN IF NOT EXISTS "reopenedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "reopenedBy" INTEGER REFERENCES employee_assignments(id),
  ADD COLUMN IF NOT EXISTS "reopenReason" TEXT,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "lockedBy" INTEGER REFERENCES employee_assignments(id);

-- 2. Journal entry approval states
--    Add approval_status column to distinguish manual journals
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS "approvalStatus" VARCHAR(30) DEFAULT 'posted'
    CHECK ("approvalStatus" IN ('draft','pending_review','approved','posted','rejected')),
  ADD COLUMN IF NOT EXISTS "isManual" BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "reviewedBy" INTEGER REFERENCES employee_assignments(id),
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "approvedBy" INTEGER REFERENCES employee_assignments(id),
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "postedAt" TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "postedBy" INTEGER REFERENCES employee_assignments(id),
  ADD COLUMN IF NOT EXISTS "approvalNotes" TEXT;

-- 3. Bank Guarantees table
CREATE TABLE IF NOT EXISTS bank_guarantees (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId" INTEGER REFERENCES branches(id),
  ref VARCHAR(100) NOT NULL,
  bank VARCHAR(200) NOT NULL,
  beneficiary VARCHAR(200) NOT NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'SAR',
  "issueDate" DATE NOT NULL,
  "expiryDate" DATE NOT NULL,
  "guaranteeType" VARCHAR(50) DEFAULT 'performance',
  status VARCHAR(30) DEFAULT 'active'
    CHECK (status IN ('active','expired','released','renewed','cancelled')),
  notes TEXT,
  "attachmentUrl" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  "createdBy" INTEGER REFERENCES employee_assignments(id)
);

CREATE INDEX IF NOT EXISTS idx_bank_guarantees_company ON bank_guarantees("companyId");
CREATE INDEX IF NOT EXISTS idx_bank_guarantees_expiry ON bank_guarantees("companyId", "expiryDate");

-- 4. Intercompany transactions
CREATE TABLE IF NOT EXISTS intercompany_transactions (
  id SERIAL PRIMARY KEY,
  ref VARCHAR(100) NOT NULL,
  "fromCompanyId" INTEGER NOT NULL REFERENCES companies(id),
  "toCompanyId" INTEGER NOT NULL REFERENCES companies(id),
  amount DECIMAL(18,2) NOT NULL,
  description TEXT,
  "transactionDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(30) DEFAULT 'posted'
    CHECK (status IN ('draft','posted','cancelled')),
  "fromJournalId" INTEGER REFERENCES journal_entries(id),
  "toJournalId" INTEGER REFERENCES journal_entries(id),
  "createdBy" INTEGER REFERENCES employee_assignments(id),
  "createdAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intercompany_from ON intercompany_transactions("fromCompanyId");
CREATE INDEX IF NOT EXISTS idx_intercompany_to ON intercompany_transactions("toCompanyId");

-- 5. Projects table (if not exists)
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId" INTEGER REFERENCES branches(id),
  ref VARCHAR(100),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(30) DEFAULT 'active'
    CHECK (status IN ('active','completed','cancelled','on_hold')),
  budget DECIMAL(18,2) DEFAULT 0,
  "startDate" DATE,
  "endDate" DATE,
  "managerId" INTEGER REFERENCES employee_assignments(id),
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_company ON projects("companyId");

-- 6. Add projectId FK to journal_entries (already exists as column, add FK if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='journal_entries' AND column_name='projectId'
  ) THEN
    ALTER TABLE journal_entries ADD COLUMN "projectId" INTEGER REFERENCES projects(id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 7. Add projectId to expenses / invoices (already in some tables)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='invoices' AND column_name='projectId'
  ) THEN
    ALTER TABLE invoices ADD COLUMN "projectId" INTEGER REFERENCES projects(id);
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
