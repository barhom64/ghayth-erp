-- 242_document_acl.sql
--
-- WHAT:    add `document_acls` table for per-document access control.
--          Closes the M6 gap from
--          docs/testing/CRITICAL_DEFECTS_REPORT.md.
--
-- WHY:     pre-fix, feature-level RBAC was the only gate — anyone with
--          `documents:list` could see every document in the company,
--          including confidential HR/legal/finance files. Banks +
--          accounting firms cannot pass an audit with that model.
--
--          The per-document ACL is OPTIONAL: a document with zero
--          rows in document_acls falls back to feature-RBAC (the
--          default current behaviour, no breaking change). Adding
--          rows narrows access to the named principals.
--
-- SAFETY:  pure additive migration. Existing documents continue to
--          work exactly as before because the read path checks
--          "EXISTS(SELECT 1 FROM document_acls WHERE docId = $1) =
--          false → allow via feature-RBAC; otherwise check that
--          the requester appears in the ACL."
--
-- @rollback: DROP TABLE IF EXISTS document_acls;
--           (the read path treats the table as optional — if the
--            table is dropped, every document falls back to feature-
--            RBAC which is the pre-fix behaviour.)

BEGIN;

CREATE TABLE IF NOT EXISTS document_acls (
  id              SERIAL PRIMARY KEY,
  "companyId"     INTEGER NOT NULL,
  "documentId"    INTEGER NOT NULL,
  -- Exactly one of (userId, roleKey, departmentId) is set per row.
  "userId"        INTEGER,
  "roleKey"       VARCHAR(60),
  "departmentId"  INTEGER,
  -- Permission level: 'read' (view+download), 'write' (read + edit
  -- metadata + replace versions), 'admin' (all + manage ACL).
  "permission"    VARCHAR(20) NOT NULL DEFAULT 'read',
  "grantedBy"     INTEGER,
  "grantedAt"     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "expiresAt"     TIMESTAMPTZ,
  CHECK ("permission" IN ('read', 'write', 'admin')),
  CHECK (
    ("userId" IS NOT NULL)::int +
    ("roleKey" IS NOT NULL)::int +
    ("departmentId" IS NOT NULL)::int = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_document_acls_doc
  ON document_acls ("companyId", "documentId");

CREATE INDEX IF NOT EXISTS idx_document_acls_user
  ON document_acls ("companyId", "userId")
  WHERE "userId" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_acls_role
  ON document_acls ("companyId", "roleKey")
  WHERE "roleKey" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_acls_dept
  ON document_acls ("companyId", "departmentId")
  WHERE "departmentId" IS NOT NULL;

COMMIT;
