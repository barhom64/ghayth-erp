// Per-document ACL enforcement. Closes the M6 gap from
// docs/testing/CRITICAL_DEFECTS_REPORT.md.
//
// Semantics:
//   1. A document with NO acl rows falls back to feature-RBAC (the
//      pre-fix behaviour, no breaking change).
//   2. A document WITH any acl rows narrows access to the named
//      principals: user, role, or department. Owners (role='owner')
//      and system admins (isOwner flag) always pass, since they need
//      to be able to investigate any document.
//   3. Expired acls (expiresAt < NOW) are ignored.
//
// This helper is read-only — it never mutates anything. The route layer
// composes it inside the existing authorize() chain.

import { rawQuery } from "./rawdb.js";

interface Scope {
  userId: number | null;
  companyId: number;
  role?: string | null;
  isOwner?: boolean;
  departmentId?: number | null;
}

export type AclLevel = "read" | "write" | "admin";

// Returns true if the scope is allowed to act on the document at the
// requested level. Caller MUST also pass feature-RBAC — this is a
// narrowing gate, not a replacement.
export async function checkDocumentAcl(
  documentId: number,
  scope: Scope,
  required: AclLevel = "read",
): Promise<boolean> {
  // Owners + isOwner skip the per-doc check. They can see everything
  // by design — this matches the rest of the platform's RBAC story.
  if (scope.isOwner || scope.role === "owner") return true;

  // Are there ANY non-expired acls on this document? If not, fall back
  // to the caller's existing feature-RBAC gate.
  const [hasAny] = await rawQuery<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM document_acls
        WHERE "documentId" = $1 AND "companyId" = $2
          AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
     ) AS exists`,
    [documentId, scope.companyId]
  ).catch(() => [{ exists: false }]);
  if (!hasAny?.exists) return true;

  // Find a matching grant. permission ordering: read < write < admin.
  // A 'write' grant satisfies a 'read' request; 'admin' satisfies any.
  const allowed: AclLevel[] = required === "read"
    ? ["read", "write", "admin"]
    : required === "write"
      ? ["write", "admin"]
      : ["admin"];

  const [match] = await rawQuery<{ permission: AclLevel }>(
    `SELECT permission
       FROM document_acls
      WHERE "documentId" = $1 AND "companyId" = $2
        AND ("expiresAt" IS NULL OR "expiresAt" > NOW())
        AND permission = ANY($3)
        AND (
          ("userId" IS NOT NULL AND "userId" = $4) OR
          ("roleKey" IS NOT NULL AND "roleKey" = $5) OR
          ("departmentId" IS NOT NULL AND "departmentId" = $6)
        )
      LIMIT 1`,
    [documentId, scope.companyId, allowed, scope.userId ?? -1, scope.role ?? "", scope.departmentId ?? -1]
  ).catch(() => []);

  return !!match;
}
