-- 140_generic_import_batches.sql
-- Generic import-batch tracking for the new general-purpose import engine.
-- Mirrors umrah_import_batches but adds an "entityKey" column so a single
-- table covers all entity types (clients, suppliers, products, employees,
-- expenses, invoices, ...). This lets the operations team see one history
-- view across all imports.

CREATE TABLE IF NOT EXISTS public.import_batches (
    id           SERIAL PRIMARY KEY,
    "companyId"  INTEGER NOT NULL REFERENCES public.companies(id),
    "branchId"   INTEGER,
    "entityKey"  VARCHAR(40) NOT NULL,                -- 'clients', 'suppliers', ...
    "fileName"   VARCHAR(255),
    "fileSize"   INTEGER,
    "uploadedBy" INTEGER,
    "uploadedAt" TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "totalRows"        INTEGER DEFAULT 0,
    "newCount"         INTEGER DEFAULT 0,
    "updatedCount"     INTEGER DEFAULT 0,
    "skippedCount"     INTEGER DEFAULT 0,
    "errorCount"       INTEGER DEFAULT 0,
    status       VARCHAR(20) DEFAULT 'pending',       -- pending|previewed|confirmed|failed
    "summaryJson" JSONB,
    "errorsJson"  JSONB,
    "createdAt"  TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "updatedAt"  TIMESTAMP WITH TIME ZONE DEFAULT now(),
    "deletedAt"  TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_import_batches_company_entity
    ON public.import_batches ("companyId", "entityKey", "uploadedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_import_batches_status
    ON public.import_batches ("companyId", status)
    WHERE "deletedAt" IS NULL;
