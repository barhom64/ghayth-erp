-- Migration 078: Create tables referenced in code but missing from schema
-- Found by schema-query drift audit

-- Correspondence (used by correspondence.ts — 11 references)
CREATE TABLE IF NOT EXISTS correspondence (
  id SERIAL PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId" integer,
  type varchar(50) NOT NULL DEFAULT 'outgoing',
  "referenceNumber" varchar(100),
  subject varchar(500) NOT NULL,
  body text,
  sender varchar(255),
  recipient varchar(255),
  department varchar(100),
  status varchar(50) DEFAULT 'draft',
  priority varchar(20) DEFAULT 'normal',
  "attachmentUrl" text,
  "relatedEntity" varchar(100),
  "relatedEntityId" integer,
  "sentAt" timestamptz,
  "receivedAt" timestamptz,
  "createdBy" integer,
  "updatedBy" integer,
  "deletedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);
ALTER TABLE correspondence ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;
CREATE INDEX IF NOT EXISTS idx_correspondence_company ON correspondence("companyId", status) WHERE "deletedAt" IS NULL;

-- Company Documents (used by hr.ts and cronScheduler — 5 references)
CREATE TABLE IF NOT EXISTS company_documents (
  id SERIAL PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title varchar(255) NOT NULL,
  type varchar(100),
  category varchar(100),
  "fileUrl" text,
  "expiryDate" date,
  status varchar(50) DEFAULT 'active',
  notes text,
  "uploadedBy" integer,
  "deletedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);
ALTER TABLE company_documents ADD COLUMN IF NOT EXISTS "deletedAt" timestamptz;
CREATE INDEX IF NOT EXISTS idx_company_documents_company ON company_documents("companyId") WHERE "deletedAt" IS NULL;

-- Payroll Deductions (used by cronScheduler, fleet.ts, hr.ts — 4 references)
CREATE TABLE IF NOT EXISTS payroll_deductions (
  id SERIAL PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "employeeId" integer,
  "assignmentId" integer,
  "payrollRunId" integer,
  type varchar(100) NOT NULL,
  description text,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  "sourceEntity" varchar(100),
  "sourceEntityId" integer,
  status varchar(50) DEFAULT 'pending',
  "effectiveDate" date,
  "deletedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payroll_deductions_company ON payroll_deductions("companyId", "employeeId");

-- Debit Memos (used by finance-invoices.ts — 4 references)
CREATE TABLE IF NOT EXISTS debit_memos (
  id SERIAL PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId" integer,
  "invoiceId" integer,
  "clientId" integer,
  amount numeric(15,2) NOT NULL DEFAULT 0,
  reason text,
  status varchar(50) DEFAULT 'draft',
  "approvedBy" integer,
  "approvedAt" timestamptz,
  "deletedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now(),
  "updatedAt" timestamptz DEFAULT now()
);

-- Dunning Letters (used by cronScheduler and finance-invoices.ts — 3 references)
CREATE TABLE IF NOT EXISTS dunning_letters (
  id SERIAL PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "invoiceId" integer,
  "clientId" integer,
  level integer DEFAULT 1,
  subject varchar(500),
  body text,
  "sentAt" timestamptz,
  status varchar(50) DEFAULT 'pending',
  "deletedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);

-- Delegations (used by hr.ts — 2 references)
CREATE TABLE IF NOT EXISTS delegations (
  id SERIAL PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "fromUserId" integer NOT NULL,
  "toUserId" integer NOT NULL,
  "startDate" date NOT NULL,
  "endDate" date NOT NULL,
  scope varchar(255),
  reason text,
  status varchar(50) DEFAULT 'active',
  "createdBy" integer,
  "deletedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);

-- Smart Recommendations (used by smartRecommendations.ts — 2 references)
CREATE TABLE IF NOT EXISTS smart_recommendations (
  id SERIAL PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "userId" integer,
  type varchar(100) NOT NULL,
  title varchar(500),
  description text,
  priority varchar(20) DEFAULT 'medium',
  "actionUrl" text,
  "expiresAt" timestamptz,
  "dismissedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);

-- FX Revaluations (used by finance-algorithms.ts — 3 references)
CREATE TABLE IF NOT EXISTS fx_revaluations (
  id SERIAL PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  currency varchar(10) NOT NULL,
  "oldRate" numeric(15,6),
  "newRate" numeric(15,6),
  "revaluationDate" date NOT NULL,
  "journalEntryId" integer,
  "totalImpact" numeric(15,2),
  "createdBy" integer,
  "createdAt" timestamptz DEFAULT now()
);

-- Training Participants (used by employees.ts and bi.ts — 2 references)
CREATE TABLE IF NOT EXISTS training_participants (
  id SERIAL PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "trainingId" integer,
  "employeeId" integer,
  "assignmentId" integer,
  status varchar(50) DEFAULT 'enrolled',
  "completedAt" timestamptz,
  score numeric(5,2),
  "createdAt" timestamptz DEFAULT now()
);

-- Workflow Requests (used by finance-vendors.ts — 1 reference)
CREATE TABLE IF NOT EXISTS workflow_requests (
  id SERIAL PRIMARY KEY,
  "companyId" integer NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "entityType" varchar(100) NOT NULL,
  "entityId" integer NOT NULL,
  "workflowType" varchar(100),
  status varchar(50) DEFAULT 'pending',
  "requestedBy" integer,
  "approvedBy" integer,
  "approvedAt" timestamptz,
  notes text,
  "deletedAt" timestamptz,
  "createdAt" timestamptz DEFAULT now()
);
