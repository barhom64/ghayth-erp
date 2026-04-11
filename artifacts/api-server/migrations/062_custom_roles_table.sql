CREATE TABLE IF NOT EXISTS custom_roles (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "roleKey" VARCHAR(100) NOT NULL,
  label VARCHAR(200) NOT NULL,
  level INTEGER NOT NULL DEFAULT 10,
  modules JSONB DEFAULT '[]',
  "createdBy" INTEGER,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE ("companyId", "roleKey")
);

CREATE INDEX IF NOT EXISTS idx_custom_roles_company ON custom_roles ("companyId");
