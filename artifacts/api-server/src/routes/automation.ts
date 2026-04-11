import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { triggerJobByName } from "../lib/cronScheduler.js";

const router = Router();
router.use(authMiddleware);

router.get("/cron-jobs", async (req, res): Promise<void> => {
  try {
    const rows = await rawQuery<any>(`SELECT * FROM cron_jobs ORDER BY name`);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Cron jobs error:"); }
});

router.post("/cron-jobs/:id/toggle", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    await rawExecute(`UPDATE cron_jobs SET "isActive" = NOT "isActive" WHERE id=$1`, [Number(id)]);
    const [row] = await rawQuery<any>(`SELECT * FROM cron_jobs WHERE id=$1`, [Number(id)]);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Toggle cron error:"); }
});

router.post("/cron-jobs/:id/trigger", async (req, res): Promise<void> => {
  try {
    const { id } = req.params;
    const [job] = await rawQuery<any>(`SELECT * FROM cron_jobs WHERE id=$1`, [Number(id)]);
    if (!job) { res.status(404).json({ error: "المهمة غير موجودة" }); return; }

    const result = await triggerJobByName(job.name);

    if (result.success) {
      res.json({ success: true, message: "تم تشغيل المهمة بنجاح", result: result.result });
    } else {
      res.status(500).json({ success: false, message: "فشل تشغيل المهمة", error: result.error });
    }
  } catch (err) { handleRouteError(err, res, "Trigger cron error:"); }
});

router.get("/cron-logs", async (req, res): Promise<void> => {
  try {
    const { jobId } = req.query as any;
    const conditions: string[] = [];
    const params: any[] = [];
    if (jobId) { params.push(Number(jobId)); conditions.push(`"jobId" = $${params.length}`); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : '';
    const rows = await rawQuery<any>(`SELECT * FROM cron_logs ${where} ORDER BY "createdAt" DESC LIMIT 100`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Cron logs error:"); }
});

router.get("/notification-stats", async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const rows = await rawQuery<any>(
      `SELECT channel, status, COUNT(*) as count FROM notification_log WHERE "companyId"=$1 GROUP BY channel, status ORDER BY channel`,
      [cid]
    );
    const [total] = await rawQuery<any>(`SELECT COUNT(*) as total FROM notification_log WHERE "companyId"=$1`, [cid]);
    res.json({ breakdown: rows, total: Number(total?.total || 0) });
  } catch (err) { handleRouteError(err, res, "Notification stats error:"); }
});

router.get("/event-logs", async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { action } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (action) { params.push(action); conditions.push(`action = $${params.length}`); }
    const rows = await rawQuery<any>(`SELECT * FROM event_logs WHERE ${conditions.join(" AND ")} ORDER BY "createdAt" DESC LIMIT 200`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Event logs error:"); }
});

router.get("/proactive-rules", async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM proactive_rules WHERE "companyId" = $1 ORDER BY module, name`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Proactive rules error:"); }
});

router.post("/proactive-rules/:id/toggle", async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    if (scope.role !== "owner" && scope.role !== "admin") {
      res.status(403).json({ error: "غير مصرح: يتطلب صلاحية المالك أو مدير النظام" });
      return;
    }
    const { id } = req.params;
    await rawExecute(
      `UPDATE proactive_rules SET "isActive" = NOT "isActive" WHERE id=$1 AND "companyId"=$2`,
      [Number(id), scope.companyId]
    );
    const [row] = await rawQuery<any>(
      `SELECT * FROM proactive_rules WHERE id=$1 AND "companyId"=$2`,
      [Number(id), scope.companyId]
    );
    if (!row) {
      res.status(404).json({ error: "القاعدة غير موجودة" });
      return;
    }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Toggle proactive rule error:"); }
});

router.get("/automation-logs", async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { type, page: pg, limit: lim } = req.query as any;
    const page = Number(pg) || 1;
    const limit = Math.min(Number(lim) || 50, 200);
    const offset = (page - 1) * limit;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (type) { params.push(type); conditions.push(`"automationType" = $${params.length}`); }
    const where = conditions.join(" AND ");
    const [countRow] = await rawQuery<any>(`SELECT COUNT(*) as total FROM automation_logs WHERE ${where}`, params);
    const total = Number(countRow?.total || 0);
    params.push(limit, offset);
    const rows = await rawQuery<any>(
      `SELECT * FROM automation_logs WHERE ${where} ORDER BY "createdAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows, total, page, pageSize: limit });
  } catch (err) { handleRouteError(err, res, "Automation logs error:"); }
});

router.get("/automation-stats", async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [totalRow] = await rawQuery<any>(
      `SELECT COUNT(*) as total FROM automation_logs WHERE "companyId" = $1`,
      [cid]
    );
    const [todayRow] = await rawQuery<any>(
      `SELECT COUNT(*) as total FROM automation_logs WHERE "companyId" = $1 AND "createdAt"::date = CURRENT_DATE`,
      [cid]
    );
    const [weekRow] = await rawQuery<any>(
      `SELECT COUNT(*) as total FROM automation_logs WHERE "companyId" = $1 AND "createdAt" >= CURRENT_DATE - INTERVAL '7 days'`,
      [cid]
    );
    const byType = await rawQuery<any>(
      `SELECT "automationType", COUNT(*) as count FROM automation_logs WHERE "companyId" = $1 GROUP BY "automationType" ORDER BY count DESC`,
      [cid]
    );
    const byModule = await rawQuery<any>(
      `SELECT pr.module, COUNT(al.id) as count
       FROM automation_logs al
       LEFT JOIN proactive_rules pr ON pr.name = al."automationType"
       WHERE al."companyId" = $1
       GROUP BY pr.module ORDER BY count DESC`,
      [cid]
    );
    const recent = await rawQuery<any>(
      `SELECT "automationType", "triggerReason", "actionTaken", "createdAt"
       FROM automation_logs WHERE "companyId" = $1 ORDER BY "createdAt" DESC LIMIT 5`,
      [cid]
    );
    res.json({
      total: Number(totalRow?.total || 0),
      today: Number(todayRow?.total || 0),
      thisWeek: Number(weekRow?.total || 0),
      byType,
      byModule,
      recent,
    });
  } catch (err) { handleRouteError(err, res, "Automation stats error:"); }
});

export default router;
