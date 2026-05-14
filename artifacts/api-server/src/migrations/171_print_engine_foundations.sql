-- ============================================================
-- Migration 080: Print Engine v2 — Foundations
-- ------------------------------------------------------------
-- Extends document_templates with entityType/paperSize/mode/layoutJson
-- Creates print_template_assignments (per-branch template selection)
-- Creates print_jobs (audit + PDF retention separate from audit_logs)
-- ============================================================

-- 1. Extend document_templates ------------------------------------------------

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "entityType" VARCHAR(60);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "paperSize" VARCHAR(20) DEFAULT 'A4';
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "mode" VARCHAR(10) DEFAULT 'preset';
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "presetKey" VARCHAR(40);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "layoutJson" JSONB;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "cssOverrides" TEXT;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "headerOverride" JSONB;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "footerOverride" JSONB;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "version" INTEGER DEFAULT 1;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "isThermal" BOOLEAN DEFAULT false;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE document_templates ADD COLUMN IF NOT EXISTS "createdBy" INTEGER;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS document_templates_entity_idx
  ON document_templates ("entityType");
CREATE INDEX IF NOT EXISTS document_templates_branch_entity_idx
  ON document_templates ("branchId", "entityType");
CREATE INDEX IF NOT EXISTS document_templates_company_entity_idx
  ON document_templates ("companyId", "entityType");

-- 2. print_template_assignments ----------------------------------------------

CREATE TABLE IF NOT EXISTS print_template_assignments (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"    INTEGER REFERENCES branches(id) ON DELETE CASCADE,
  "entityType"  VARCHAR(60) NOT NULL,
  "templateId"  INTEGER NOT NULL REFERENCES document_templates(id) ON DELETE CASCADE,
  "isDefault"   BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdBy"   INTEGER
);

-- One default per (company, branch, entityType). branchId NULL = company fallback.
CREATE UNIQUE INDEX IF NOT EXISTS pta_default_branch_uq
  ON print_template_assignments ("companyId", "branchId", "entityType")
  WHERE "isDefault" = true AND "branchId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pta_default_company_uq
  ON print_template_assignments ("companyId", "entityType")
  WHERE "isDefault" = true AND "branchId" IS NULL;

CREATE INDEX IF NOT EXISTS pta_lookup_idx
  ON print_template_assignments ("companyId", "branchId", "entityType");

-- 3. print_jobs ---------------------------------------------------------------

CREATE TABLE IF NOT EXISTS print_jobs (
  id              SERIAL PRIMARY KEY,
  "jobId"         UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  "companyId"     INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"      INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  "userId"        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "entityType"    VARCHAR(60) NOT NULL,
  "entityId"      VARCHAR(64) NOT NULL,
  "templateId"    INTEGER REFERENCES document_templates(id) ON DELETE SET NULL,
  "format"        VARCHAR(20) NOT NULL,
  "paperSize"     VARCHAR(20),
  "copyNumber"    INTEGER NOT NULL DEFAULT 1,
  "isReprint"     BOOLEAN NOT NULL DEFAULT false,
  "watermark"     VARCHAR(120),
  "pdfStorageKey" TEXT,
  "pdfBytes"      INTEGER,
  "status"        VARCHAR(24) NOT NULL DEFAULT 'rendering',
  "approvedBy"    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "approvedAt"    TIMESTAMPTZ,
  "errorMessage"  TEXT,
  "ipAddress"     VARCHAR(64),
  "userAgent"     TEXT,
  "createdAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS print_jobs_entity_idx
  ON print_jobs ("companyId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS print_jobs_branch_created_idx
  ON print_jobs ("branchId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS print_jobs_user_created_idx
  ON print_jobs ("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS print_jobs_company_created_idx
  ON print_jobs ("companyId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS print_jobs_status_idx
  ON print_jobs ("companyId", "status");

-- 4. Reprint requests (lightweight) ------------------------------------------

CREATE TABLE IF NOT EXISTS print_reprint_requests (
  id            SERIAL PRIMARY KEY,
  "companyId"   INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  "branchId"    INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  "entityType"  VARCHAR(60) NOT NULL,
  "entityId"    VARCHAR(64) NOT NULL,
  "requestedBy" INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "reason"      TEXT,
  "status"      VARCHAR(24) NOT NULL DEFAULT 'pending',
  "approvedBy"  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  "approvedAt"  TIMESTAMPTZ,
  "rejectedReason" TEXT,
  "resultJobId" UUID,
  "createdAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS print_reprint_status_idx
  ON print_reprint_requests ("companyId", "status", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS print_reprint_entity_idx
  ON print_reprint_requests ("companyId", "entityType", "entityId");
