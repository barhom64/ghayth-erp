-- 234_document_access_log.sql
--
-- WHAT:    add `document_access_log` table to record every download +
--          preview + view of a document. Closes the M4 compliance gap
--          identified in docs/testing/CRITICAL_DEFECTS_REPORT.md.
--
-- WHY:     pre-fix, anyone with `documents:list` could pull every file
--          in the company with no audit trail. Big-4 + PDPL + ZATCA
--          audits all require a per-access log of who saw which
--          regulated file when, from where. Feature-level RBAC alone
--          doesn't satisfy that — we need a row per access.
--
-- SAFETY:  pure additive migration. No data touched. Indexed on
--          (companyId, documentId) for the per-document timeline view
--          and on (companyId, userId, accessedAt) for the per-user
--          activity report.
--
-- @rollback: DROP TABLE IF EXISTS document_access_log;
--           (drops both indexes automatically. The /:id/download and
--            /:id/preview routes degrade gracefully — the INSERT is
--            wrapped in .catch() and the access-log read endpoint
--            returns an empty array on missing table.)

BEGIN;

CREATE TABLE IF NOT EXISTS document_access_log (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "documentId"    INTEGER NOT NULL,
  "userId"        INTEGER,
  "accessType"    TEXT NOT NULL,      -- 'download' | 'preview' | 'view'
  "accessedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "ipAddress"     TEXT,
  "userAgent"     TEXT,
  -- Note: no FK to documents(id) — documents soft-delete, the access
  -- log must outlive the document for compliance.
  CHECK ("accessType" IN ('download', 'preview', 'view', 'sign'))
);

CREATE INDEX IF NOT EXISTS idx_doc_access_log_doc
  ON document_access_log ("companyId", "documentId", "accessedAt" DESC);

CREATE INDEX IF NOT EXISTS idx_doc_access_log_user
  ON document_access_log ("companyId", "userId", "accessedAt" DESC);

COMMIT;
