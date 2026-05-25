-- ============================================================
-- Migration 212: Print Platform Phase 7 — Archive integration
-- ------------------------------------------------------------
-- Adds a `documents.printJobId` FK so every render auto-indexes into
-- the Documents domain. Users opening an entity see the printed copy in
-- their "Documents" tab without the Print module needing its own UI.
--
-- The column is nullable (regular file-uploaded documents have no
-- printJob) and indexed for the "find all docs for this print job"
-- lookup the verify endpoint and download fallback will use.
--
-- @rollback:
--   ALTER TABLE public.documents
--     DROP CONSTRAINT IF EXISTS "documents_printJobId_fkey",
--     DROP COLUMN IF EXISTS "printJobId",
--     DROP COLUMN IF EXISTS "linkedEntityType",
--     DROP COLUMN IF EXISTS "linkedEntityId";
--   DROP INDEX IF EXISTS idx_documents_print_job_id;
--   DROP INDEX IF EXISTS idx_documents_linked_entity;
-- ============================================================

-- 1. Column ----------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS "printJobId" uuid;

-- 2. FK to print_jobs.jobId ------------------------------------------------
-- Soft FK (no ON DELETE CASCADE) — print_jobs rows are append-only by
-- design (Phase 0 architecture), so a CASCADE could be safely added,
-- but keeping the soft FK lets us delete a document without affecting
-- the print_jobs audit row.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_printJobId_fkey'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT "documents_printJobId_fkey"
        FOREIGN KEY ("printJobId") REFERENCES public.print_jobs("jobId")
        ON DELETE SET NULL;
  END IF;
END $$;

-- 3. Index -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_documents_print_job_id
  ON public.documents("printJobId")
  WHERE "printJobId" IS NOT NULL;

-- 4. Entity-link metadata --------------------------------------------------
-- The documents table already has companyId, but a printed invoice is
-- linked to BOTH a company AND an entity (the invoice row). Capture
-- the entityType + entityId so the entity-detail page can show its
-- printed history without joining through print_jobs.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS "linkedEntityType" varchar(60);
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS "linkedEntityId" varchar(64);

CREATE INDEX IF NOT EXISTS idx_documents_linked_entity
  ON public.documents("linkedEntityType", "linkedEntityId")
  WHERE "linkedEntityType" IS NOT NULL;
