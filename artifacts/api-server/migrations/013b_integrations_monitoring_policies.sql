CREATE TABLE IF NOT EXISTS integrations (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER REFERENCES companies(id),
  type VARCHAR(50) NOT NULL CHECK (type IN ('email','sms','whatsapp','webhook')),
  name VARCHAR(200) NOT NULL,
  config JSONB DEFAULT '{}',
  status VARCHAR(30) DEFAULT 'inactive' CHECK (status IN ('active','inactive','error')),
  "lastSuccessAt" TIMESTAMPTZ,
  "lastFailureAt" TIMESTAMPTZ,
  "lastError" TEXT,
  "retryCount" INTEGER DEFAULT 0,
  "maxRetries" INTEGER DEFAULT 3,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS integration_logs (
  id SERIAL PRIMARY KEY,
  "integrationId" INTEGER REFERENCES integrations(id) ON DELETE CASCADE,
  "companyId" INTEGER REFERENCES companies(id),
  channel VARCHAR(50) NOT NULL,
  direction VARCHAR(20) DEFAULT 'outbound',
  recipient VARCHAR(300),
  subject VARCHAR(500),
  body TEXT,
  status VARCHAR(30) DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','failed','retrying')),
  "errorMessage" TEXT,
  "retryAttempt" INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_integration_logs_company ON integration_logs("companyId");
CREATE INDEX IF NOT EXISTS idx_integration_logs_status ON integration_logs(status);
CREATE INDEX IF NOT EXISTS idx_integration_logs_channel ON integration_logs(channel);
CREATE INDEX IF NOT EXISTS idx_integrations_company ON integrations("companyId");

ALTER TABLE governance_policies ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE governance_policies ADD COLUMN IF NOT EXISTS "effectiveDate" DATE;
ALTER TABLE governance_policies ADD COLUMN IF NOT EXISTS "expiryDate" DATE;
ALTER TABLE governance_policies ADD COLUMN IF NOT EXISTS "parentId" INTEGER REFERENCES governance_policies(id);

CREATE TABLE IF NOT EXISTS policy_module_links (
  id SERIAL PRIMARY KEY,
  "policyId" INTEGER NOT NULL REFERENCES governance_policies(id) ON DELETE CASCADE,
  module VARCHAR(100) NOT NULL,
  "companyId" INTEGER REFERENCES companies(id),
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE("policyId", module)
);

CREATE INDEX IF NOT EXISTS idx_policy_module_links_policy ON policy_module_links("policyId");
CREATE INDEX IF NOT EXISTS idx_policy_module_links_module ON policy_module_links(module);
