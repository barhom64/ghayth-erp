import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";

const router = Router();

router.get("/", requirePermission("audit:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const {
      entityType, entityId, action, userId,
      page = "1", limit: lim = "50",
      dateFrom, dateTo,
    } = req.query as any;
    const offset = (Math.max(Number(page), 1) - 1) * Number(lim);

    const conditions = [`al."companyId" = $1`];
    const params: any[] = [scope.companyId];

    if (entityType) { params.push(String(entityType)); conditions.push(`al.entity = $${params.length}`); }
    if (entityId) { params.push(String(entityId)); conditions.push(`al."entityId" = $${params.length}`); }
    if (action) {
      params.push(String(action));
      const actionIdx = params.length;
      params.push(`%.${String(action)}`);
      const likeIdx = params.length;
      conditions.push(`(al.action = $${actionIdx} OR al.action LIKE $${likeIdx})`);
    }
    if (userId) { params.push(Number(userId)); conditions.push(`al."userId" = $${params.length}`); }
    if (dateFrom) { params.push(String(dateFrom)); conditions.push(`al."createdAt" >= $${params.length}::timestamptz`); }
    if (dateTo) { params.push(String(dateTo) + "T23:59:59Z"); conditions.push(`al."createdAt" <= $${params.length}::timestamptz`); }

    const where = conditions.join(" AND ");
    params.push(Number(lim));
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const rows = await rawQuery<any>(
      `SELECT al.id, al."companyId", al."branchId", al."userId", al.action, al.entity, al."entityId",
              al."before" AS "beforeData", al."after" AS "afterData", al.changes, al.reason,
              al.scope, al."ipAddress", al."userAgent", al."createdAt",
              al."before", al."after",
              e.name AS "userName"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al."userId"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE ${where}
       ORDER BY al."createdAt" DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM audit_logs al WHERE ${where}`,
      countParams
    );

    res.json({ data: rows, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) });
  } catch (err) {
    handleRouteError(err, res, "Get audit logs error:");
  }
});

router.get("/entities", requirePermission("audit:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT DISTINCT entity FROM audit_logs WHERE "companyId" = $1 ORDER BY entity LIMIT 500`,
      [scope.companyId]
    );
    const entities = rows.map((r: any) => r.entity);
    res.json({ data: entities, total: entities.length, page: 1, pageSize: entities.length });
  } catch (err) {
    handleRouteError(err, res, "Get audit log entities error");
  }
});

router.get("/:entityType/:entityId", requirePermission("audit:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.params;

    const rows = await rawQuery<any>(
      `SELECT al.*, e.name AS "userName"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al."userId"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE al."companyId" = $1 AND al.entity = $2 AND al."entityId" = $3
       ORDER BY al."createdAt" DESC
       LIMIT 100`,
      [scope.companyId, entityType, String(entityId)]
    );

    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Get entity audit logs error:");
  }
});

export default router;
