-- Migration 090: Correspondence system, request numbering, contract workflow, branch letterhead
-- Adds: صادر/وارد system, auto-numbering for requests/letters/contracts, contract lifecycle

-- =============================================
-- 1. SEQUENCES for reference number generation
-- =============================================

CREATE SEQUENCE IF NOT EXISTS request_number_seq START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS letter_number_seq START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS contract_number_seq START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS correspondence_outgoing_seq START WITH 1000 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS correspondence_incoming_seq START WITH 1000 INCREMENT BY 1;

-- =============================================
-- 2. REQUESTS table enhancements
-- =============================================

ALTER TABLE requests ADD COLUMN IF NOT EXISTS ref VARCHAR(50);
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "requestDate" DATE;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "approvedBy" INTEGER;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "closedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "closedBy" INTEGER;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "outgoingRef" VARCHAR(50);
ALTER TABLE requests ADD COLUMN IF NOT EXISTS "incomingRef" VARCHAR(50);

-- =============================================
-- 3. EMPLOYEE CONTRACTS workflow enhancements
-- =============================================

ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS ref VARCHAR(50);
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "approvalStatus" VARCHAR(30) DEFAULT 'draft';
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "approvedBy" INTEGER;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "signedByEmployee" BOOLEAN DEFAULT FALSE;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "employeeSignedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "signedByCompany" BOOLEAN DEFAULT FALSE;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "companySignedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "companySignedBy" INTEGER;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "templateId" INTEGER;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "generatedDocUrl" TEXT;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS salary NUMERIC(12,2);
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "housingAllowance" NUMERIC(12,2);
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "transportAllowance" NUMERIC(12,2);
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "otherAllowances" JSONB DEFAULT '{}';
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "renewalDate" DATE;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "terminatedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "terminatedBy" INTEGER;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "terminationReason" TEXT;
ALTER TABLE employee_contracts ADD COLUMN IF NOT EXISTS "branchId" INTEGER;

-- =============================================
-- 4. OFFICIAL LETTERS enhancements
-- =============================================

ALTER TABLE official_letters ADD COLUMN IF NOT EXISTS ref VARCHAR(50);
ALTER TABLE official_letters ADD COLUMN IF NOT EXISTS "branchId" INTEGER;
ALTER TABLE official_letters ADD COLUMN IF NOT EXISTS "outgoingRef" VARCHAR(50);
ALTER TABLE official_letters ADD COLUMN IF NOT EXISTS "incomingRef" VARCHAR(50);
ALTER TABLE official_letters ADD COLUMN IF NOT EXISTS "recipientName" VARCHAR(300);
ALTER TABLE official_letters ADD COLUMN IF NOT EXISTS "recipientOrg" VARCHAR(300);
ALTER TABLE official_letters ADD COLUMN IF NOT EXISTS "templateId" INTEGER;

-- =============================================
-- 5. CORRESPONDENCE table (central tracking)
-- =============================================

CREATE TABLE IF NOT EXISTS correspondence (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
    ref VARCHAR(50) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    content TEXT,
    "entityType" VARCHAR(50),
    "entityId" INTEGER,
    "senderName" VARCHAR(300),
    "senderOrg" VARCHAR(300),
    "recipientName" VARCHAR(300),
    "recipientOrg" VARCHAR(300),
    channel VARCHAR(30) DEFAULT 'internal',
    status VARCHAR(30) DEFAULT 'draft',
    "sentAt" TIMESTAMP WITH TIME ZONE,
    "receivedAt" TIMESTAMP WITH TIME ZONE,
    "respondedAt" TIMESTAMP WITH TIME ZONE,
    "responseRef" VARCHAR(50),
    attachments JSONB DEFAULT '[]',
    notes TEXT,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS correspondence_company_idx ON correspondence("companyId");
CREATE INDEX IF NOT EXISTS correspondence_direction_idx ON correspondence("companyId", direction);
CREATE INDEX IF NOT EXISTS correspondence_entity_idx ON correspondence("entityType", "entityId");
CREATE INDEX IF NOT EXISTS correspondence_ref_idx ON correspondence(ref);

-- =============================================
-- 6. CONTRACT APPROVAL STATUS CONSTRAINT
-- =============================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_contracts_approval_status_check'
  ) THEN
    ALTER TABLE employee_contracts ADD CONSTRAINT employee_contracts_approval_status_check
      CHECK ("approvalStatus" IN ('draft', 'pending_approval', 'approved', 'rejected', 'signed', 'active', 'expired', 'terminated'));
  END IF;
END $$;

-- =============================================
-- 7. INDEXES for new columns
-- =============================================

CREATE INDEX IF NOT EXISTS requests_ref_idx ON requests(ref);
CREATE INDEX IF NOT EXISTS requests_branch_idx ON requests("branchId");
CREATE INDEX IF NOT EXISTS employee_contracts_ref_idx ON employee_contracts(ref);
CREATE INDEX IF NOT EXISTS employee_contracts_approval_idx ON employee_contracts("approvalStatus");
CREATE INDEX IF NOT EXISTS official_letters_ref_idx ON official_letters(ref);
CREATE INDEX IF NOT EXISTS official_letters_branch_idx ON official_letters("branchId");
