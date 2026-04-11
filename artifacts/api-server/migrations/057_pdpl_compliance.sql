-- PDPL (Personal Data Protection Law) Compliance Tables

-- Data Retention Policies Table
CREATE TABLE IF NOT EXISTS data_retention_policies (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  "dataType" VARCHAR(100) NOT NULL,
  "retentionDays" INTEGER NOT NULL,
  "legalBasis" VARCHAR(255),
  description TEXT,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE("companyId", "dataType")
);

-- Insert default retention policies for common data types
INSERT INTO data_retention_policies ("companyId", "dataType", "retentionDays", "legalBasis", description, "isDefault")
VALUES
  (NULL, 'employee_personal_data', 3650, 'Labor Law Art. 74', 'بيانات الموظف الشخصية — 10 سنوات بعد انتهاء العقد', true),
  (NULL, 'payroll_records', 3650, 'Labor Law Art. 74', 'سجلات الرواتب والمرتبات — 10 سنوات', true),
  (NULL, 'attendance_records', 1825, 'Labor Law Art. 74', 'سجلات الحضور والانصراف — 5 سنوات', true),
  (NULL, 'financial_transactions', 3650, 'VAT Law', 'المعاملات المالية — 10 سنوات (متطلبات ZATCA)', true),
  (NULL, 'audit_logs', 1095, 'Internal Policy', 'سجلات المراجعة والتدقيق — 3 سنوات', true),
  (NULL, 'security_logs', 365, 'Internal Policy', 'سجلات الأمان — سنة واحدة', true),
  (NULL, 'client_data', 1825, 'Contract', 'بيانات العملاء — 5 سنوات بعد انتهاء العلاقة', true),
  (NULL, 'document_attachments', 1825, 'Internal Policy', 'المستندات والمرفقات — 5 سنوات', true)
ON CONFLICT DO NOTHING;

-- Processing Activities Log (Article 13 - PDPL)
CREATE TABLE IF NOT EXISTS processing_activities_log (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "activityType" VARCHAR(100) NOT NULL,
  "dataCategories" JSONB NOT NULL DEFAULT '[]',
  "dataSubjects" VARCHAR(255),
  purpose TEXT NOT NULL,
  "legalBasis" VARCHAR(255) NOT NULL,
  "thirdPartySharing" BOOLEAN NOT NULL DEFAULT false,
  "thirdParties" JSONB DEFAULT '[]',
  "crossBorderTransfer" BOOLEAN NOT NULL DEFAULT false,
  "transferCountries" JSONB DEFAULT '[]',
  "retentionPeriod" VARCHAR(100),
  "technicalMeasures" JSONB DEFAULT '[]',
  "performedBy" INTEGER REFERENCES employee_assignments(id),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processing_log_company ON processing_activities_log("companyId");
CREATE INDEX IF NOT EXISTS idx_processing_log_type ON processing_activities_log("activityType");
CREATE INDEX IF NOT EXISTS idx_processing_log_created ON processing_activities_log("createdAt");

-- Data Access Requests (Subject Rights / Article 4 - PDPL)
CREATE TABLE IF NOT EXISTS data_access_requests (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "requestType" VARCHAR(50) NOT NULL CHECK ("requestType" IN ('access', 'rectification', 'erasure', 'portability', 'objection')),
  "requesterId" INTEGER REFERENCES employees(id),
  "requesterName" VARCHAR(255),
  "requesterEmail" VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
  notes TEXT,
  "responseData" JSONB,
  "completedAt" TIMESTAMPTZ,
  "dueDate" DATE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_access_requests_company ON data_access_requests("companyId");
CREATE INDEX IF NOT EXISTS idx_data_access_requests_status ON data_access_requests(status);

-- Privacy Consent Records
CREATE TABLE IF NOT EXISTS privacy_consent_records (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  "userId" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "consentType" VARCHAR(100) NOT NULL,
  "consentVersion" VARCHAR(20) NOT NULL DEFAULT '1.0',
  granted BOOLEAN NOT NULL DEFAULT false,
  "grantedAt" TIMESTAMPTZ,
  "revokedAt" TIMESTAMPTZ,
  "ipAddress" VARCHAR(45),
  "userAgent" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_consent_user ON privacy_consent_records("userId");
CREATE INDEX IF NOT EXISTS idx_privacy_consent_company ON privacy_consent_records("companyId");
