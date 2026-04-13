import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";
import {
  EVENT_CATALOG,
  countEventsByDomain,
  getEventDefinition,
  listCriticalEvents,
  listEventsByDomain,
  type EventDomain,
} from "../lib/eventCatalog.js";

export const eventsRouter = Router();
eventsRouter.use(authMiddleware);

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG — الفهرس الرسمي للأحداث (static, read-only)
// ─────────────────────────────────────────────────────────────────────────────

eventsRouter.get("/catalog", (req, res) => {
  const { domain, critical } = req.query as { domain?: string; critical?: string };
  let result = EVENT_CATALOG;
  if (domain) result = listEventsByDomain(domain as EventDomain);
  if (critical === "true") result = result.filter((e) => e.critical === true);
  res.json({
    total: result.length,
    countByDomain: countEventsByDomain(),
    criticalCount: listCriticalEvents().length,
    events: result,
  });
});

eventsRouter.get("/catalog/:name", (req, res) => {
  const def = getEventDefinition(req.params.name);
  if (!def) { res.status(404).json({ error: "الحدث غير موجود في الفهرس" }); return; }
  res.json({ data: def });
});

// ─────────────────────────────────────────────────────────────────────────────
// LOG — سجل الأحداث الفعلي من event_logs table
// ─────────────────────────────────────────────────────────────────────────────

eventsRouter.get("/log", async (req, res) => {
  try {
    const scope = req.scope!;
    const { action, entity, entityId, from, to, limit = "100" } = req.query as any;

    const params: any[] = [scope.companyId];
    let where = `"companyId" = $1`;
    if (action) { params.push(action); where += ` AND action = $${params.length}`; }
    if (entity) { params.push(entity); where += ` AND entity = $${params.length}`; }
    if (entityId) { params.push(Number(entityId)); where += ` AND "entityId" = $${params.length}`; }
    if (from) { params.push(from); where += ` AND "createdAt" >= $${params.length}::timestamp`; }
    if (to) { params.push(to); where += ` AND "createdAt" <= $${params.length}::timestamp`; }

    const lim = Math.min(500, Math.max(1, Number(limit) || 100));
    const rows = await rawQuery<any>(
      `SELECT id, action, entity, "entityId", details, "userId", "createdAt"
       FROM event_logs
       WHERE ${where}
       ORDER BY "createdAt" DESC
       LIMIT ${lim}`,
      params
    );

    // Enrich with catalog metadata
    const enriched = rows.map((r: any) => {
      const def = getEventDefinition(r.action);
      return {
        ...r,
        label: def?.label ?? r.action,
        domain: def?.domain ?? "unknown",
        critical: def?.critical ?? false,
      };
    });

    res.json({ data: enriched, count: enriched.length });
  } catch (err) {
    handleRouteError(err, res, "Event log query error:");
  }
});

eventsRouter.get("/log/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const days = Number(req.query.days ?? 7);
    const rows = await rawQuery<any>(
      `SELECT action, COUNT(*)::int AS count
       FROM event_logs
       WHERE "companyId" = $1 AND "createdAt" >= NOW() - ($2 || ' days')::interval
       GROUP BY action
       ORDER BY count DESC
       LIMIT 100`,
      [scope.companyId, String(days)]
    );
    const enriched = rows.map((r: any) => {
      const def = getEventDefinition(r.action);
      return {
        action: r.action,
        count: r.count,
        label: def?.label ?? r.action,
        domain: def?.domain ?? "unknown",
      };
    });
    res.json({ windowDays: days, events: enriched });
  } catch (err) {
    handleRouteError(err, res, "Event stats error:");
  }
});

export default eventsRouter;
