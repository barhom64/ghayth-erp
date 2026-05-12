import { handleRouteError, NotFoundError, parseId } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { triggerJobByName } from "../lib/cronScheduler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/cron-jobs", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(`SELECT * FROM cron_jobs ORDER BY name LIMIT 500`, []);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Cron jobs error:"); }
});

router.post("/cron-jobs/:id/toggle", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { affectedRows } = await rawExecute(`UPDATE cron_jobs SET "isActive" = NOT "isActive" WHERE id=$1`, [id]);
    if (!affectedRows) throw new NotFoundError("المهمة غير موجودة");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM cron_jobs WHERE id=$1`, [id]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "cron_jobs", entityId: id, after: { isActive: row?.isActive } }).catch((e) => logger.error(e, "automation background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "automation.cron_job.toggled", entity: "cron_jobs", entityId: id, details: JSON.stringify({ isActive: row?.isActive }) }).catch((e) => logger.error(e, "automation background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Toggle cron error:"); }
});

router.post("/cron-jobs/:id/trigger", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [job] = await rawQuery<Record<string, unknown>>(`SELECT * FROM cron_jobs WHERE id=$1`, [id]);
    if (!job) throw new NotFoundError("المهمة غير موجودة");

    const result = await triggerJobByName(job.name as string);

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "cron_jobs", entityId: id, after: { jobName: job.name, success: result.success } }).catch((e) => logger.error(e, "automation background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "automation.cron_job.triggered", entity: "cron_jobs", entityId: id, details: JSON.stringify({ jobName: job.name, success: result.success }) }).catch((e) => logger.error(e, "automation background task failed"));
    if (result.success) {
      res.json({ success: true, message: "تم تشغيل المهمة بنجاح", result: result.result });
    } else {
      handleRouteError(new Error(result.error || "فشل تشغيل المهمة"), res, "Trigger cron job error");
    }
  } catch (err) { handleRouteError(err, res, "Trigger cron error:"); }
});

router.get("/cron-logs", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { jobId } = req.query as any;
    const conditions: string[] = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (jobId) { params.push(Number(jobId) || 0); conditions.push(`"jobId" = $${params.length}`); }
    const where = conditions.join(" AND ");
    const rows = await rawQuery<Record<string, unknown>>(`SELECT * FROM cron_logs WHERE ${where} ORDER BY "createdAt" DESC LIMIT 100`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Cron logs error:"); }
});

router.get("/notification-stats", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT channel, status, COUNT(*) as count FROM notification_log WHERE "companyId"=$1 GROUP BY channel, status ORDER BY channel`,
      [cid]
    );
    const [total] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total FROM notification_log WHERE "companyId"=$1`, [cid]);
    res.json({ breakdown: rows, total: Number(total?.total || 0) });
  } catch (err) { handleRouteError(err, res, "Notification stats error:"); }
});

router.get("/event-logs", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { action, limit: lim, offset: off } = req.query as any;
    const pageLimit = Math.min(Number(lim) || 50, 200);
    const pageOffset = Number(off) || 0;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (action) { params.push(action); conditions.push(`action = $${params.length}`); }
    const where = conditions.join(" AND ");
    const [countRow] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) AS total FROM event_logs WHERE ${where}`, params);
    params.push(pageLimit, pageOffset);
    const rows = await rawQuery<Record<string, unknown>>(`SELECT * FROM event_logs WHERE ${where} ORDER BY "createdAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    res.json({ data: rows, total: Number(countRow?.total ?? 0), limit: pageLimit, offset: pageOffset });
  } catch (err) { handleRouteError(err, res, "Event logs error:"); }
});

router.get("/proactive-rules", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM proactive_rules WHERE "companyId" = $1 ORDER BY module, name LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Proactive rules error:"); }
});

router.post("/proactive-rules/:id/toggle", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawExecute(
      `UPDATE proactive_rules SET "isActive" = NOT "isActive" WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM proactive_rules WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("القاعدة غير موجودة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "proactive_rules", entityId: id, after: { isActive: row?.isActive } }).catch((e) => logger.error(e, "automation background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "automation.proactive_rule.toggled", entity: "proactive_rules", entityId: id, details: JSON.stringify({ isActive: row?.isActive }) }).catch((e) => logger.error(e, "automation background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Toggle proactive rule error:"); }
});

router.get("/automation-logs", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
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
    const [countRow] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total FROM automation_logs WHERE ${where}`, params);
    const total = Number(countRow?.total || 0);
    params.push(limit, offset);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM automation_logs WHERE ${where} ORDER BY "createdAt" DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows, total, page, pageSize: limit });
  } catch (err) { handleRouteError(err, res, "Automation logs error:"); }
});

router.get("/automation-stats", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [[totalRow], [todayRow], [weekRow], byType, byModule, recent] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*) as total FROM automation_logs WHERE "companyId" = $1`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*) as total FROM automation_logs WHERE "companyId" = $1 AND "createdAt"::date = CURRENT_DATE`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*) as total FROM automation_logs WHERE "companyId" = $1 AND "createdAt" >= CURRENT_DATE - INTERVAL '7 days'`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT "automationType", COUNT(*) as count FROM automation_logs WHERE "companyId" = $1 GROUP BY "automationType" ORDER BY count DESC`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT pr.module, COUNT(al.id) as count
         FROM automation_logs al
         LEFT JOIN proactive_rules pr ON pr.name = al."automationType"
         WHERE al."companyId" = $1
         GROUP BY pr.module ORDER BY count DESC`,
        [cid]
      ),
      rawQuery<Record<string, unknown>>(
        `SELECT "automationType", "triggerReason", "actionTaken", "createdAt"
         FROM automation_logs WHERE "companyId" = $1 ORDER BY "createdAt" DESC LIMIT 5`,
        [cid]
      ),
    ]);
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
