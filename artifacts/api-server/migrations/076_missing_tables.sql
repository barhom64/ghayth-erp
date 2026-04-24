-- Migration 076: Create missing tables referenced in backend code
-- These tables are queried in routes/libs but were not in schema.sql

-- 1. cost_centers — used by finance-cost-centers.ts
CREATE TABLE IF NOT EXISTS cost_centers (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES companies(id),
    code VARCHAR(20) NOT NULL,
    name VARCHAR(120) NOT NULL,
    type VARCHAR(40) DEFAULT 'department',
    "parentId" INTEGER REFERENCES cost_centers(id),
    "relatedEntityType" VARCHAR(40),
    "relatedEntityId" INTEGER,
    "allocatedAmount" NUMERIC(14,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cost_centers_company ON cost_centers ("companyId", status);

-- 2. vouchers — used by bi.ts, dashboard.ts, operationsCenter.ts, pdfExport.ts
CREATE TABLE IF NOT EXISTS vouchers (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES companies(id),
    "branchId" INTEGER,
    type VARCHAR(20) NOT NULL CHECK (type IN ('payment', 'receipt')),
    ref VARCHAR(40),
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    description TEXT,
    "clientId" INTEGER,
    "supplierId" INTEGER,
    "paymentMethod" VARCHAR(40),
    "journalEntryId" INTEGER,
    status VARCHAR(20) DEFAULT 'posted',
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_vouchers_company ON vouchers ("companyId", type, "createdAt");

-- 3. expenses — used by cronScheduler.ts, workflowEngine.ts
CREATE TABLE IF NOT EXISTS expenses (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES companies(id),
    "branchId" INTEGER,
    ref VARCHAR(40),
    description TEXT,
    amount NUMERIC(14,2) NOT NULL DEFAULT 0,
    category VARCHAR(60),
    "employeeId" INTEGER,
    status VARCHAR(20) DEFAULT 'pending',
    "approvedBy" INTEGER,
    "journalEntryId" INTEGER,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_expenses_company ON expenses ("companyId", status);

-- 4. user_sessions — used by cronScheduler.ts for session cleanup
CREATE TABLE IF NOT EXISTS user_sessions (
    id SERIAL PRIMARY KEY,
    "userId" INTEGER NOT NULL REFERENCES users(id),
    "companyId" INTEGER,
    token TEXT,
    "ipAddress" VARCHAR(45),
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP,
    "lastActivityAt" TIMESTAMP DEFAULT NOW(),
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions ("userId", "expiresAt");

-- 5. activity_logs — used by cronScheduler.ts
CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    action VARCHAR(80) NOT NULL,
    entity VARCHAR(60),
    "entityId" INTEGER,
    metadata JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_company ON activity_logs ("companyId", "createdAt");

-- 6. audit_archive — used by cronScheduler.ts for old audit log archival
CREATE TABLE IF NOT EXISTS audit_archive (
    id SERIAL PRIMARY KEY,
    "originalId" INTEGER,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER,
    action VARCHAR(80),
    entity VARCHAR(60),
    "entityId" INTEGER,
    before JSONB,
    after JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "archivedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_archive_company ON audit_archive ("companyId", "createdAt");

-- 7. auto_detection_log — lazily created in autoViolationEngine.ts but should be in schema
CREATE TABLE IF NOT EXISTS auto_detection_log (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    "ruleType" VARCHAR(40) NOT NULL,
    "employeeId" INTEGER,
    "detectedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    severity VARCHAR(20),
    details JSONB,
    "violationId" INTEGER,
    status VARCHAR(20) DEFAULT 'detected'
);
CREATE INDEX IF NOT EXISTS idx_auto_detection_company ON auto_detection_log ("companyId", "ruleType");

-- 8. credit_memos — lazily created in finance-invoices.ts but should be in schema
CREATE TABLE IF NOT EXISTS credit_memos (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES companies(id),
    "invoiceId" INTEGER NOT NULL,
    ref VARCHAR(40),
    amount NUMERIC(14,2) NOT NULL,
    reason TEXT,
    status VARCHAR(20) DEFAULT 'posted',
    "journalEntryId" INTEGER,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_credit_memos_company ON credit_memos ("companyId");

-- 9. fx_rates — lazily created in finance-algorithms.ts but should be in schema
CREATE TABLE IF NOT EXISTS fx_rates (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES companies(id),
    "fromCurrency" VARCHAR(3) NOT NULL,
    "toCurrency" VARCHAR(3) NOT NULL,
    rate NUMERIC(14,6) NOT NULL,
    "effectiveDate" DATE NOT NULL,
    source VARCHAR(40) DEFAULT 'manual',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fx_rates_company ON fx_rates ("companyId", "fromCurrency", "toCurrency", "effectiveDate");
