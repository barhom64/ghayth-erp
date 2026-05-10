-- Phase 3 import wizard tables
CREATE TABLE IF NOT EXISTS umrah_import_batches (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "seasonId" INTEGER,
  "fileType" VARCHAR(40) NOT NULL,
  "fileName" TEXT,
  "uploadedBy" INTEGER,
  "totalRows" INTEGER DEFAULT 0,
  "newCount" INTEGER DEFAULT 0,
  "updatedCount" INTEGER DEFAULT 0,
  "skippedCount" INTEGER DEFAULT 0,
  "errorCount" INTEGER DEFAULT 0,
  "financialImpactCount" INTEGER DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'pending',
  notes TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "completedAt" TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_umrah_import_batches_company ON umrah_import_batches("companyId");
CREATE INDEX IF NOT EXISTS idx_umrah_import_batches_season ON umrah_import_batches("seasonId");

CREATE TABLE IF NOT EXISTS umrah_import_changes (
  id SERIAL PRIMARY KEY,
  "batchId" INTEGER NOT NULL REFERENCES umrah_import_batches(id) ON DELETE CASCADE,
  "entityType" VARCHAR(60) NOT NULL,
  "entityId" INTEGER NOT NULL,
  "changeType" VARCHAR(40) NOT NULL,
  "fieldName" TEXT,
  "oldValue" TEXT,
  "newValue" TEXT,
  "hasFinancialImpact" BOOLEAN DEFAULT FALSE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_umrah_import_changes_batch ON umrah_import_changes("batchId");
CREATE INDEX IF NOT EXISTS idx_umrah_import_changes_entity ON umrah_import_changes("entityType","entityId");
