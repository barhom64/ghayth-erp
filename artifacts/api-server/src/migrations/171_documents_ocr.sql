-- Task #275 — OCR pipeline for the document management system.
--
-- Adds an OCR text/state column set to `documents` so an async worker can
-- pick up freshly-uploaded files, extract their text, and (for known
-- document classes) propose structured field extractions for human review
-- before they are written back onto the source entity. The extracted
-- text is also indexed for full-text search by `routes/search.ts`.

-- The trigram index below uses gin_trgm_ops, so the pg_trgm extension
-- must be present. Repls/CI run as the DB owner so CREATE EXTENSION is
-- allowed; in managed Postgres the operator must pre-grant.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE documents ADD COLUMN IF NOT EXISTS "ocrText" TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "ocrStatus" VARCHAR(20) DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "ocrAttempts" INTEGER DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "ocrError" TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "ocrLanguage" VARCHAR(10);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "ocrCompletedAt" TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS "ocrEngine" VARCHAR(40);

-- Backfill: existing rows have no OCR result. Mark them as `skipped` so the
-- worker doesn't churn on legacy uploads we can't reach (the storage key may
-- be gone). Operators can re-queue them by calling
-- `POST /api/documents/:id/ocr/rerun`.
UPDATE documents
   SET "ocrStatus" = 'skipped'
 WHERE "ocrStatus" IS NULL OR "ocrStatus" = 'pending';

-- Worker hot path: pick up the next pending document.
CREATE INDEX IF NOT EXISTS idx_documents_ocr_status_pending
  ON documents ("ocrStatus", "createdAt")
  WHERE "ocrStatus" = 'pending';

-- Search hot path: ILIKE over `ocrText` is acceptable for current volumes.
-- A trigram index keeps it sub-second even as the column grows.
CREATE INDEX IF NOT EXISTS idx_documents_ocr_text_trgm
  ON documents USING gin (("ocrText") gin_trgm_ops)
  WHERE "ocrText" IS NOT NULL;

-- Pending-review queue: structured field extractions awaiting human
-- confirmation before they are persisted onto the linked entity
-- (employee / vehicle / company / invoice).
CREATE TABLE IF NOT EXISTS document_ocr_extractions (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL,
  "documentId" INTEGER NOT NULL,
  "docType" VARCHAR(40) NOT NULL,
  "fields" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "confidence" NUMERIC(5,2),
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "reviewedBy" INTEGER,
  "reviewedAt" TIMESTAMPTZ,
  "appliedTo" VARCHAR(40),
  "appliedToId" INTEGER,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW(),
  "deletedAt" TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_doc_ocr_extractions_company_status
  ON document_ocr_extractions ("companyId", "status")
  WHERE "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS idx_doc_ocr_extractions_document
  ON document_ocr_extractions ("documentId")
  WHERE "deletedAt" IS NULL;
