-- Migration 154: polymorphic attachments for umrah entities
--
-- Spec §17 expects scanned passports / visas / signed sub-agent contracts
-- / archived NUSK files to live alongside the records they describe. The
-- central `documents` table is a flat catalog with no owner link, and HR
-- went its own way with `employee_documents`. Mirror that pattern but
-- polymorphic so a single table can carry attachments for mutamers,
-- sub-agents, groups, agents, NUSK invoices, and umrah_seasons — pure
-- additive, no other table touched.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, partial composite indexes.

CREATE TABLE IF NOT EXISTS umrah_attachments (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "branchId"  INTEGER,

  -- Polymorphic owner. entityType is an enum-like check below.
  "entityType" VARCHAR(30) NOT NULL,
  "entityId"   INTEGER NOT NULL,

  -- type = passport / visa / contract / nusk_file / other
  -- title is free-text (filename or human label).
  type   VARCHAR(40) NOT NULL,
  title  VARCHAR(255) NOT NULL,
  notes  TEXT,

  -- File metadata (file lives in object storage; storageKey is the
  -- canonical pointer, fileUrl is the resolved CDN/signed URL).
  "fileUrl"    TEXT,
  "storageKey" TEXT,
  "fileSize"   INTEGER,
  "mimeType"   VARCHAR(120),

  "uploadedBy" INTEGER,
  "createdAt"  TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt"  TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt"  TIMESTAMPTZ,

  CONSTRAINT umrah_attachments_entity_check CHECK (
    "entityType" IN ('mutamer','sub_agent','group','agent','nusk_invoice','season','sales_invoice','violation')
  ),
  CONSTRAINT umrah_attachments_type_check CHECK (
    type IN ('passport','visa','contract','nusk_file','identity','transfer_receipt','other')
  )
);

CREATE INDEX IF NOT EXISTS idx_umrah_attachments_entity
  ON umrah_attachments ("companyId", "entityType", "entityId")
  WHERE "deletedAt" IS NULL;

CREATE INDEX IF NOT EXISTS idx_umrah_attachments_company
  ON umrah_attachments ("companyId", "createdAt" DESC)
  WHERE "deletedAt" IS NULL;
