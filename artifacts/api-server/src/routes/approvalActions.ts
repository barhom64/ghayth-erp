import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();
router.use(authMiddleware);

router.get("/overrides/report", async (req, res) => {
  try {
    const scope = req.scope!;
    const allowedRoles = ["owner", "general_manager", "hr_manager", "finance_manager", "compliance", "audit"];
    if (!allowedRoles.includes(scope.role)) {
      res.status(403).json({ error: "غير مصرح لك بالاطلاع على تقرير المخالفات" });
      return;
    }
    const { from, to } = req.query as { from?: string; to?: string };
    let dateFilter = "";
    const params: any[] = [scope.companyId];
    if (from) {
      params.push(from);
      dateFilter += ` AND al."createdAt" >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      dateFilter += ` AND al."createdAt" <= $${params.length}`;
    }
    const rows = await rawQuery<any>(
      `SELECT al.*, u.email as "userEmail"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al."userId"
       WHERE al."companyId" = $1 AND al.action = 'workflow_override'${dateFilter}
       ORDER BY al."createdAt" DESC
       LIMIT 500`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:entityType/:entityId", async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.params;
    const rows = await rawQuery(
      `SELECT aa.*, u.email as "actionByEmail"
       FROM approval_actions aa
       LEFT JOIN users u ON aa."actionBy" = u.id
       WHERE aa."entityType" = $1 AND aa."entityId" = $2 AND aa."companyId" = $3
       ORDER BY aa."createdAt" DESC`,
      [entityType, Number(entityId), scope.companyId]
    );
    res.json({ data: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
