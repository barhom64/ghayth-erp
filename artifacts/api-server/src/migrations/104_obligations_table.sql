-- Migration 075: Create obligations table
-- The obligationsEngine uses ensureObligationsTable() for lazy creation,
-- but a proper migration ensures the table exists before first use.

CREATE TABLE IF NOT EXISTS obligations (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES companies(id),
    "branchId" INTEGER,
    "entityType" VARCHAR(40) NOT NULL,
    "entityId" INTEGER NOT NULL,
    "obligationType" VARCHAR(32) NOT NULL,
    title TEXT NOT NULL,
    "dueAt" TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    "assignedTo" INTEGER,
    "escalationLevel" INTEGER NOT NULL DEFAULT 0,
    "escalationSteps" JSONB,
    metadata JSONB,
    "dedupeKey" VARCHAR(120),
    "metAt" TIMESTAMP,
    "breachedAt" TIMESTAMP,
    "lastScannedAt" TIMESTAMP,
    "closedBy" INTEGER,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_obligations_scan ON obligations (status, "dueAt");
CREATE INDEX IF NOT EXISTS idx_obligations_entity ON obligations ("companyId", "entityType", "entityId");
CREATE UNIQUE INDEX IF NOT EXISTS idx_obligations_dedupe ON obligations ("companyId", "dedupeKey") WHERE "dedupeKey" IS NOT NULL;
