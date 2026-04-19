-- Add workType to attendance for remote/office/field classification
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "workType" VARCHAR(20) DEFAULT 'office';

-- Add contractId to attendance for direct contract-attendance linking
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "contractId" INTEGER;

-- Expand expiring_documents types: add support for commercial registration,
-- driving license, work permit, iqama
-- (the table already exists from migration 076 — just ensure the doc types are available)

-- Add vehicle document expiry tracking
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS "registrationExpiry" DATE;
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS "insuranceExpiry" DATE;
ALTER TABLE fleet_vehicles ADD COLUMN IF NOT EXISTS "inspectionExpiry" DATE;

-- Add employee document types for non-Saudi workers
CREATE TABLE IF NOT EXISTS employee_documents (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "employeeId" INTEGER NOT NULL,
  "documentType" VARCHAR(50) NOT NULL,
  "documentNumber" VARCHAR(100),
  "issueDate" DATE,
  "expiryDate" DATE,
  "issuingAuthority" VARCHAR(200),
  "reminderDays" INTEGER DEFAULT 30,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  "createdAt" TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS employee_documents_company_idx ON employee_documents ("companyId");
CREATE INDEX IF NOT EXISTS employee_documents_employee_idx ON employee_documents ("employeeId");
CREATE INDEX IF NOT EXISTS employee_documents_expiry_idx ON employee_documents ("expiryDate") WHERE status = 'active';

-- Add company-level document tracking (commercial registration etc.)
CREATE TABLE IF NOT EXISTS company_documents (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "documentType" VARCHAR(50) NOT NULL,
  "documentNumber" VARCHAR(100),
  "issueDate" DATE,
  "expiryDate" DATE,
  "issuingAuthority" VARCHAR(200),
  "reminderDays" INTEGER DEFAULT 30,
  status VARCHAR(20) DEFAULT 'active',
  notes TEXT,
  "createdAt" TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS company_documents_company_idx ON company_documents ("companyId");
CREATE INDEX IF NOT EXISTS company_documents_expiry_idx ON company_documents ("expiryDate") WHERE status = 'active';
