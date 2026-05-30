-- ============================================================
-- Migration 237: unify umrah_attachments into the shared documents store
-- ============================================================
-- DOC-VIOLATION (Ghaith Operating Foundation): umrah_attachments (154) is a
-- per-track attachment store that parallels the central documents +
-- document_entity_links service — the one genuine attachment duplication
-- confirmed by schema review (employee_documents is a compliance/expiry
-- domain table and is intentionally NOT merged).
--
-- This migration is the NON-DESTRUCTIVE, reversible first half of the
-- unification:
--   1. Adds the columns the shared `documents` table is missing to faithfully
--      carry umrah attachments:
--        - "fileUrl"  : umrah attachments store a free URL/storageKey that the
--          umrah attachments panel renders as a download link. documents had
--          no such column. Nullable, generally useful for any attachment.
--        - legacy_umrah_attachment_id : provenance marker so the backfill is
--          idempotent (re-runnable) and traceable back to the source row.
--   2. Backfills every live umrah_attachments row into documents +
--      document_entity_links, namespacing the polymorphic owner as
--      'umrah_<entityType>' (e.g. 'umrah_group') to keep umrah's entity space
--      separate from other tracks' links. type → category, notes → description.
--
-- The old umrah_attachments table is DELIBERATELY KEPT (no DROP) so the change
-- is fully reversible; a later migration drops it after staging verification
-- of the umrah attachments UI. The /umrah/attachments endpoints are rewritten
-- (same request/response shape) to read/write documents in the same PR.
--
-- See docs/core-services/DOCUMENT_SERVICE_CONTRACT.md.
-- ============================================================
--
-- @rollback: ALTER TABLE documents DROP COLUMN IF EXISTS legacy_umrah_attachment_id;
--   ALTER TABLE documents DROP COLUMN IF EXISTS "fileUrl";
--   (Backfilled rows remain in documents but lose the umrah link URL + provenance.
--   Restore the original /umrah/attachments endpoints to read umrah_attachments,
--   which was never dropped, for a clean revert.)

ALTER TABLE documents ADD COLUMN IF NOT EXISTS "fileUrl" TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS legacy_umrah_attachment_id INTEGER;

-- Idempotency / provenance: one document per source umrah_attachments row.
CREATE UNIQUE INDEX IF NOT EXISTS documents_legacy_umrah_attachment_uq
  ON documents (legacy_umrah_attachment_id)
  WHERE legacy_umrah_attachment_id IS NOT NULL;

-- 1) Copy each live umrah attachment into documents (skip already-copied rows).
INSERT INTO documents
  (title, description, category, "fileName", "fileUrl", "storageKey",
   "fileSize", "mimeType", status, "currentVersion", "uploadedBy",
   "companyId", legacy_umrah_attachment_id, "createdAt")
SELECT
  ua.title,
  ua.notes,
  ua.type,
  ua.title,
  ua."fileUrl",
  ua."storageKey",
  ua."fileSize",
  ua."mimeType",
  'active',
  1,
  ua."uploadedBy",
  ua."companyId",
  ua.id,
  ua."createdAt"
FROM umrah_attachments ua
WHERE ua."deletedAt" IS NULL
ON CONFLICT (legacy_umrah_attachment_id) WHERE legacy_umrah_attachment_id IS NOT NULL DO NOTHING;

-- 2) Link each backfilled document to its umrah owner (namespaced entityType).
INSERT INTO document_entity_links ("documentId", "entityType", "entityId")
SELECT d.id, 'umrah_' || ua."entityType", ua."entityId"
FROM umrah_attachments ua
JOIN documents d ON d.legacy_umrah_attachment_id = ua.id
WHERE ua."deletedAt" IS NULL
ON CONFLICT ("documentId", "entityType", "entityId") DO NOTHING;

COMMENT ON COLUMN documents."fileUrl" IS
  'Optional free URL / external link to the file (umrah attachments + general).';
COMMENT ON COLUMN documents.legacy_umrah_attachment_id IS
  'Provenance: source umrah_attachments.id for rows backfilled by migration 237.';
