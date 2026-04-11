CREATE TABLE IF NOT EXISTS audit_violations (
  id SERIAL PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  "entityType" VARCHAR(100) NOT NULL,
  "entityId" INTEGER,
  description TEXT NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  department VARCHAR(100),
  "resolvedBy" INTEGER,
  "resolvedAt" TIMESTAMPTZ,
  "companyId" INTEGER NOT NULL,
  "auditDate" DATE NOT NULL DEFAULT CURRENT_DATE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_violations_company ON audit_violations("companyId");
CREATE INDEX IF NOT EXISTS idx_audit_violations_status ON audit_violations(status);
CREATE INDEX IF NOT EXISTS idx_audit_violations_type ON audit_violations(type);
CREATE INDEX IF NOT EXISTS idx_audit_violations_date ON audit_violations("auditDate");
CREATE INDEX IF NOT EXISTS idx_audit_violations_priority ON audit_violations(priority);
CREATE INDEX IF NOT EXISTS idx_audit_violations_department ON audit_violations(department);
