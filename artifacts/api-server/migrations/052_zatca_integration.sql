-- Migration 028: ZATCA Integration
-- جداول ربط هيئة الزكاة والضريبة والجمارك

-- ZATCA settings per company
CREATE TABLE IF NOT EXISTS zatca_settings (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox', 'production')),
  "vatRegistrationNumber" VARCHAR(50),
  "crNumber" VARCHAR(50),
  "organizationName" VARCHAR(255),
  "organizationNameEn" VARCHAR(255),
  "streetName" VARCHAR(255),
  "buildingNumber" VARCHAR(20),
  "cityName" VARCHAR(100),
  "postalCode" VARCHAR(10),
  "countryCode" CHAR(2) DEFAULT 'SA',
  "oauthClientId" VARCHAR(255),
  "oauthClientSecret" TEXT,
  "csid" TEXT,
  "pihKey" TEXT,
  "lastConnectionTest" TIMESTAMPTZ,
  "connectionTestStatus" VARCHAR(20),
  "connectionTestMessage" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE ("companyId")
);

-- ZATCA submission log
CREATE TABLE IF NOT EXISTS zatca_submission_log (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "entityType" VARCHAR(20) NOT NULL CHECK ("entityType" IN ('invoice', 'expense')),
  "entityId" INTEGER NOT NULL,
  "invoiceRef" VARCHAR(100),
  "zatcaUuid" UUID,
  "zatcaHash" VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'accepted', 'rejected', 'error')),
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox',
  "requestPayload" TEXT,
  "responsePayload" TEXT,
  "errorMessage" TEXT,
  "submittedAt" TIMESTAMPTZ,
  "respondedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "submittedBy" INTEGER
);

CREATE INDEX IF NOT EXISTS idx_zatca_log_company ON zatca_submission_log ("companyId");
CREATE INDEX IF NOT EXISTS idx_zatca_log_entity ON zatca_submission_log ("entityType", "entityId");
CREATE INDEX IF NOT EXISTS idx_zatca_log_status ON zatca_submission_log (status);

-- Add ZATCA columns to invoices table
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS "isTaxLinked" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "zatcaStatus" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "zatcaUuid" UUID,
  ADD COLUMN IF NOT EXISTS "zatcaHash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "zatcaQrCode" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceTypeCode" VARCHAR(10) DEFAULT '388',
  ADD COLUMN IF NOT EXISTS "taxCategoryCode" VARCHAR(10) DEFAULT 'S',
  ADD COLUMN IF NOT EXISTS "exemptionReason" TEXT;

-- Add ZATCA columns to journal_entries table (expenses are stored as journal entries)
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS "isTaxLinked" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "zatcaStatus" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "zatcaUuid" UUID,
  ADD COLUMN IF NOT EXISTS "zatcaHash" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "zatcaQrCode" TEXT,
  ADD COLUMN IF NOT EXISTS "invoiceTypeCode" VARCHAR(10) DEFAULT '388',
  ADD COLUMN IF NOT EXISTS "taxCategoryCode" VARCHAR(10) DEFAULT 'S',
  ADD COLUMN IF NOT EXISTS "exemptionReason" TEXT;
