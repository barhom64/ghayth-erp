import type { Request } from "express";
import { pool } from "./rawdb.js";
import { computeDiff } from "./auditDiff.js";

export type AuditAction = "create" | "update" | "delete" | "approve" | "reject" | "view" | string;

export async function auditLog(
  req: Request,
  entityType: string,
  entityId: number | string,
  action: AuditAction,
  before: unknown | null,
  after: unknown | null
): Promise<void> {
  const scope = req.scope;
  const userId = scope?.userId ?? null;
  const companyId = scope?.companyId ?? null;
  const branchId = scope?.branchId ?? null;

  const changes = computeDiff(
    before as Record<string, unknown> | null,
    after as Record<string, unknown> | null
  );
  const reason = (req.body?.reason as string) ?? null;

  try {
    await pool.query(
      `INSERT INTO audit_logs (entity, "entityId", action, "before", "after", "changes", "reason", "userId", "companyId", "branchId", "ipAddress", "userAgent")
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $11, $12)`,
      [
        entityType,
        String(entityId),
        action,
        before !== null && before !== undefined ? JSON.stringify(before) : null,
        after !== null && after !== undefined ? JSON.stringify(after) : null,
        changes.length > 0 ? JSON.stringify(changes) : null,
        reason,
        userId,
        companyId,
        branchId,
        req.ip ?? null,
        req.headers["user-agent"] ?? null,
      ]
    );
  } catch (err) {
    console.error("Audit log error (non-fatal):", err);
  }
}
