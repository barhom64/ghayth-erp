-- Phase 6: New tables for CSAT, KB, Legal, Governance, Digital Signature

-- CSAT Ratings
CREATE TABLE IF NOT EXISTS ticket_csat_ratings (
  id SERIAL PRIMARY KEY,
  "ticketId" INTEGER NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  "companyId" INTEGER NOT NULL,
  "assigneeId" INTEGER,
  score INTEGER NOT NULL CHECK (score >= 1 AND score <= 5),
  comment TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE ("ticketId")
);
CREATE INDEX IF NOT EXISTS idx_csat_company ON ticket_csat_ratings("companyId");
CREATE INDEX IF NOT EXISTS idx_csat_assignee ON ticket_csat_ratings("assigneeId");

-- KB Articles
CREATE TABLE IF NOT EXISTS kb_articles (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER,
  title TEXT NOT NULL,
  content TEXT,
  category TEXT,
  tags TEXT[],
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft','archived')),
  views INTEGER NOT NULL DEFAULT 0,
  helpful INTEGER NOT NULL DEFAULT 0,
  "notHelpful" INTEGER NOT NULL DEFAULT 0,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_company ON kb_articles("companyId");
CREATE INDEX IF NOT EXISTS idx_kb_status ON kb_articles(status);

-- Legal Correspondence
CREATE TABLE IF NOT EXISTS legal_correspondence (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "caseId" INTEGER REFERENCES legal_cases(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'outgoing' CHECK (direction IN ('incoming','outgoing')),
  subject TEXT NOT NULL,
  parties TEXT,
  "documentRef" TEXT,
  "correspondenceDate" DATE,
  notes TEXT,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_legal_corr_company ON legal_correspondence("companyId");
CREATE INDEX IF NOT EXISTS idx_legal_corr_case ON legal_correspondence("caseId");

-- Legal Judgments
CREATE TABLE IF NOT EXISTS legal_judgments (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "caseId" INTEGER REFERENCES legal_cases(id) ON DELETE SET NULL,
  "judgmentDate" DATE,
  "judgmentType" TEXT,
  verdict TEXT,
  amount DECIMAL(15,2),
  "paidAmount" DECIMAL(15,2) DEFAULT 0,
  "dueDate" DATE,
  notes TEXT,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_judgments_company ON legal_judgments("companyId");
CREATE INDEX IF NOT EXISTS idx_judgments_case ON legal_judgments("caseId");

-- Digital Signature OTPs
CREATE TABLE IF NOT EXISTS digital_signature_otps (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "documentId" TEXT NOT NULL,
  "userId" INTEGER,
  otp TEXT NOT NULL,
  "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  "ipAddress" TEXT,
  "deviceFingerprint" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sig_otps_doc ON digital_signature_otps("documentId");

-- Digital Signature Audit Log
CREATE TABLE IF NOT EXISTS digital_signature_logs (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "documentId" TEXT NOT NULL,
  "documentType" TEXT,
  "userId" INTEGER,
  "signerName" TEXT,
  "signerEmail" TEXT,
  action TEXT NOT NULL CHECK (action IN ('otp_requested','otp_verified','signed','rejected')),
  "ipAddress" TEXT,
  "deviceFingerprint" TEXT,
  "userAgent" TEXT,
  metadata JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sig_logs_doc ON digital_signature_logs("documentId");
CREATE INDEX IF NOT EXISTS idx_sig_logs_company ON digital_signature_logs("companyId");

-- Policy Compliance Actions
CREATE TABLE IF NOT EXISTS policy_compliance_actions (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  title TEXT NOT NULL,
  regulation TEXT,
  description TEXT,
  owner TEXT,
  "dueDate" DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','overdue')),
  "policyId" INTEGER,
  "createdBy" INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comp_actions_company ON policy_compliance_actions("companyId");

-- Governance CAPA (Corrective and Preventive Actions)
CREATE TABLE IF NOT EXISTS governance_capa (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  finding TEXT NOT NULL,
  "auditId" INTEGER,
  "rootCause" TEXT,
  "correctiveAction" TEXT,
  "preventiveAction" TEXT,
  "responsiblePerson" TEXT,
  "dueDate" DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','closed','overdue')),
  "completedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_capa_company ON governance_capa("companyId");

-- Invoice Payments (for portal pay tracking)
CREATE TABLE IF NOT EXISTS invoice_payments (
  id SERIAL PRIMARY KEY,
  "invoiceId" INTEGER NOT NULL,
  "companyId" INTEGER NOT NULL,
  "clientId" INTEGER,
  amount DECIMAL(15,2) NOT NULL,
  method TEXT DEFAULT 'online',
  "transactionRef" TEXT,
  "paidAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  source TEXT DEFAULT 'manual',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_payments_txref ON invoice_payments("transactionRef") WHERE "transactionRef" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_inv_payments_inv ON invoice_payments("invoiceId");

-- Alter support_tickets to add invoiceId and contractId if missing
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS "invoiceId" INTEGER;
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS "contractId" INTEGER;

-- Alter marketing_campaigns to add revenue if missing
ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS revenue DECIMAL(15,2) DEFAULT 0;

-- Alter legal_cases to add financial risk fields if missing
ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS "financialRisk" DECIMAL(15,2);
ALTER TABLE legal_cases ADD COLUMN IF NOT EXISTS "riskLevel" TEXT CHECK ("riskLevel" IN ('low','medium','high','critical') OR "riskLevel" IS NULL);

-- Alter governance_risks to add treatment plan fields if missing
ALTER TABLE governance_risks ADD COLUMN IF NOT EXISTS "treatmentPlan" TEXT;
ALTER TABLE governance_risks ADD COLUMN IF NOT EXISTS "treatmentOwner" TEXT;
ALTER TABLE governance_risks ADD COLUMN IF NOT EXISTS "treatmentDueDate" DATE;
ALTER TABLE governance_risks ADD COLUMN IF NOT EXISTS "treatmentStatus" TEXT;
