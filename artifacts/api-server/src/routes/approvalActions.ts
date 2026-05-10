import { Router } from "express";
import { APPROVAL_AUDIT_ROLES } from "../lib/rbacCatalog.js";
import { rawQuery } from "../lib/rawdb.js";
import { handleRouteError, ForbiddenError, parseId } from "../lib/errorHandler.js";

// Local row shapes — neither table has a Drizzle definition yet, so the
// types live next to the route file. Move to dbTypes.ts when ≥3 routes
// reference them.

interface AuditLogRow {
  id: number;
  companyId: number;
  branchId?: number | null;
  userId: number;
  userEmail?: string | null;
  action: string;
  entity: string;
  entityId?: number | null;
  before?: unknown;
  after?: unknown;
  changes?: unknown;
  reason?: string | null;
  scope?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

interface ApprovalActionRow {
  id: number;
  companyId: number;
  entityType: string;
  entityId: number;
  actionBy: number | null;
  actionByEmail?: string | null;
  action: string;
  decision?: string | null;
  notes?: string | null;
  createdAt: string;
}

const router = Router();

router.get("/overrides/report", async (req, res) => {
  try {
    const scope = req.scope!;
    const allowedRoles = APPROVAL_AUDIT_ROLES;
    if (!allowedRoles.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح لك بالاطلاع على تقرير المخالفات");
    }
    const { from, to } = req.query as { from?: string; to?: string };
    let dateFilter = "";
    const params: unknown[] = [scope.companyId];
    if (from) {
      params.push(from);
      dateFilter += ` AND al."createdAt" >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      dateFilter += ` AND al."createdAt" <= $${params.length}`;
    }
    const rows = await rawQuery<AuditLogRow>(
      `SELECT al.*, u.email as "userEmail"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al."userId"
       WHERE al."companyId" = $1 AND al.action = 'workflow_override'${dateFilter}
       ORDER BY al."createdAt" DESC
       LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "approvalActions");
  }
});

router.get("/:entityType/:entityId", async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType } = req.params;
    const entityId = parseId(req.params.entityId, "entityId");
    const rows = await rawQuery<ApprovalActionRow>(
      `SELECT aa.*, u.email as "actionByEmail"
       FROM approval_actions aa
       LEFT JOIN users u ON aa."actionBy" = u.id
       WHERE aa."entityType" = $1 AND aa."entityId" = $2 AND aa."companyId" = $3
       ORDER BY aa."createdAt" DESC LIMIT 200`,
      [entityType, entityId, scope.companyId]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) {
    handleRouteError(err, res, "approvalActions");
  }
});

export default router;
