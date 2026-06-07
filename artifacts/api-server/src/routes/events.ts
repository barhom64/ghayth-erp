import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError, NotFoundError } from "../lib/errorHandler.js";
import { maskFields, authorize } from "../lib/rbac/authorize.js";
import { buildScopedWhere } from "../lib/scopedQuery.js";
import { drainProcessedOutboxEntries, getOutboxStats } from "../lib/eventBus.js";
import { listJourneys, JOURNEY_DEFINITIONS } from "../lib/journeyEngine.js";
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

// Local row shape for event_logs. Schema lives in db/schema.sql; not
// modelled in @workspace/db yet.
interface EventLogRow {
  id: number;
  companyId: number;
  action: string;
  entity?: string | null;
  entityId?: number | null;
  details?: unknown;
  userId?: number | null;
  createdAt: string;
}

// Cursor payload — see docs/CURSOR_PAGINATION.md for the rationale and
// the same (createdAt, id) keyset pattern used by /admin/audit-logs.
interface EventCursor {
  t: string;
  i: number;
}

function encodeCursor(c: EventCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(s: string): EventCursor | null {
  try {
    const raw = Buffer.from(s, "base64url").toString("utf8");
    const obj = JSON.parse(raw) as Partial<EventCursor>;
    if (typeof obj.t !== "string" || typeof obj.i !== "number") return null;
    if (Number.isNaN(Date.parse(obj.t))) return null;
    return { t: obj.t, i: obj.i };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CATALOG — الفهرس الرسمي للأحداث (static, read-only)
// ─────────────────────────────────────────────────────────────────────────────

eventsRouter.get("/catalog", (req, res) => {
  try {
    const { domain, critical } = req.query as { domain?: string; critical?: string };
    let result = EVENT_CATALOG;
    if (domain) result = listEventsByDomain(domain as EventDomain);
    if (critical === "true") result = result.filter((e) => e.critical === true);
    res.json(maskFields(req, {
      total: result.length,
      countByDomain: countEventsByDomain(),
      criticalCount: listCriticalEvents().length,
      events: result,
    }));
  } catch (err) { handleRouteError(err, res, "Event catalog error:"); }
});

eventsRouter.get("/catalog/:name", (req, res) => {
  try {
    const def = getEventDefinition(req.params.name);
    if (!def) throw new NotFoundError("الحدث غير موجود في الفهرس");
    res.json(maskFields(req, { data: def }));
  } catch (err) { handleRouteError(err, res, "Event catalog detail error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// LOG — سجل الأحداث الفعلي من event_logs table
//
// Supports both legacy (limit-only) and cursor pagination modes. Cursor
// mode kicks in when ?cursor=… is present; otherwise the old "newest N"
// behavior is preserved exactly for existing callers.
// ─────────────────────────────────────────────────────────────────────────────

eventsRouter.get("/log", authorize({ feature: "admin", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { action, entity, entityId, from, to, limit = "100", cursor } =
      req.query as Record<string, string | undefined>;

    // #685 PR-A1: scope predicate via helper. Behavior preserved —
    // single-company filter (scope.companyId), no branch column on
    // event_logs (disableBranchScope), no soft-delete column on this
    // table. Resulting SQL is byte-identical to the prior hand-rolled
    // form: `"companyId" = $1` with params=[scope.companyId].
    const { where: scopedWhere, params } = buildScopedWhere(
      scope,
      { companyIds: [scope.companyId] },
      { disableBranchScope: true },
    );
    let where = scopedWhere;
    if (action) { params.push(action); where += ` AND action = $${params.length}`; }
    if (entity) { params.push(entity); where += ` AND entity = $${params.length}`; }
    if (entityId) { params.push(Number(entityId) || 0); where += ` AND "entityId" = $${params.length}`; }
    if (from) { params.push(from); where += ` AND "createdAt" >= $${params.length}::timestamp`; }
    if (to) { params.push(to); where += ` AND "createdAt" <= $${params.length}::timestamp`; }

    const lim = Math.min(500, Math.max(1, Number(limit) || 100));

    // ── Cursor mode (opt-in, non-breaking) ────────────────────────────
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        res.status(400).json({ error: "cursor غير صالح" });
        return;
      }
      params.push(decoded.t);
      const tIdx = params.length;
      params.push(decoded.i);
      const iIdx = params.length;
      where += ` AND ("createdAt", id) < ($${tIdx}::timestamptz, $${iIdx})`;
      params.push(lim + 1); // +1 to peek for hasMore
      const limitIdx = params.length;

      const rows = await rawQuery<EventLogRow>(
        `SELECT id, action, entity, "entityId", details, "userId", "createdAt"
         FROM event_logs
         WHERE ${where}
         ORDER BY "createdAt" DESC, id DESC
         LIMIT $${limitIdx}`,
        params,
      );

      const hasMore = rows.length > lim;
      const data = hasMore ? rows.slice(0, lim) : rows;
      const last = data[data.length - 1];
      const nextCursor = hasMore && last
        ? encodeCursor({ t: String(last.createdAt), i: last.id })
        : null;

      const enriched = data.map((r) => {
        const def = getEventDefinition(r.action);
        return {
          ...r,
          label: def?.label ?? r.action,
          domain: def?.domain ?? "unknown",
          critical: def?.critical ?? false,
        };
      });

      res.json(maskFields(req, { data: enriched, count: enriched.length, cursor: nextCursor, hasMore }));
      return;
    }

    // ── Legacy "newest N" mode ────────────────────────────────────────
    params.push(lim);
    const rows = await rawQuery<EventLogRow>(
      `SELECT id, action, entity, "entityId", details, "userId", "createdAt"
       FROM event_logs
       WHERE ${where}
       ORDER BY "createdAt" DESC, id DESC
       LIMIT $${params.length}`,
      params,
    );

    // Enrich with catalog metadata
    const enriched = rows.map((r) => {
      const def = getEventDefinition(r.action);
      return {
        ...r,
        label: def?.label ?? r.action,
        domain: def?.domain ?? "unknown",
        critical: def?.critical ?? false,
      };
    });

    res.json(maskFields(req, { data: enriched, count: enriched.length }));
  } catch (err) {
    handleRouteError(err, res, "Event log query error:");
  }
});

eventsRouter.get("/log/stats", authorize({ feature: "admin", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const days = Number(req.query.days) || 7;
    // #685 PR-A1: scope predicate via helper. Behavior preserved —
    // single-company filter (scope.companyId), no branch column on
    // event_logs (disableBranchScope). SQL identical to prior hand-rolled
    // form: `"companyId" = $1` with params[0]=scope.companyId; $2 is
    // bound at nextParamIndex for the windowDays interval literal.
    const { where: scopedWhere, params, nextParamIndex } = buildScopedWhere(
      scope,
      { companyIds: [scope.companyId] },
      { disableBranchScope: true },
    );
    params.push(String(days));
    const rows = await rawQuery<{ action: string; count: number }>(
      `SELECT action, COUNT(*)::int AS count
       FROM event_logs
       WHERE ${scopedWhere} AND "createdAt" >= NOW() - ($${nextParamIndex} || ' days')::interval
       GROUP BY action
       ORDER BY count DESC
       LIMIT 100`,
      params,
    );
    const enriched = rows.map((r) => {
      const def = getEventDefinition(r.action);
      return {
        action: r.action,
        count: r.count,
        label: def?.label ?? r.action,
        domain: def?.domain ?? "unknown",
      };
    });
    res.json(maskFields(req, { windowDays: days, events: enriched }));
  } catch (err) {
    handleRouteError(err, res, "Event stats error:");
  }
});

// ── Outbox stats (read-only gauge) — admin monitoring ─────────────────────
// Read-only counterpart to the drain endpoint so the operator can watch the
// outbox (pending vs processed + oldest-pending age) WITHOUT triggering a
// drain. Powers the /admin/outbox monitoring page (#1603).
eventsRouter.get("/outbox/stats", authorize({ feature: "admin", action: "view" }), async (_req, res) => {
  try {
    const rows = await rawQuery<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count FROM event_outbox GROUP BY status`,
    );
    const byStatus: Record<string, number> = {};
    for (const r of rows) byStatus[r.status] = Number(r.count);
    const [oldest] = await rawQuery<{ sec: string | null }>(
      `SELECT extract(epoch FROM (now() - min("createdAt")))::text AS sec
         FROM event_outbox WHERE status = 'pending'`,
    );
    res.json({
      pending: byStatus.pending ?? 0,
      processed: byStatus.processed ?? 0,
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      oldestPendingAgeSec: oldest?.sec != null ? Math.round(Number(oldest.sec)) : null,
    });
  } catch (err) {
    handleRouteError(err, res, "Outbox stats error:");
  }
});

// ── Outbox drain (phase-2 relay) — admin maintenance trigger ──────────────
// Marks captured-and-dispatched event_outbox rows 'processed' and reports the
// pending gauge. Runs automatically on the maintenance interval; this endpoint
// lets an operator drain on demand. graceSeconds=0 drains everything now.
eventsRouter.post("/outbox/drain", authorize({ feature: "admin", action: "update" }), async (req, res) => {
  try {
    const grace = Math.max(0, Number((req.body ?? {}).graceSeconds ?? 0));
    const drained = await drainProcessedOutboxEntries(grace);
    const stats = await getOutboxStats();
    res.json({ drained, pending: stats.pending, oldestAgeSec: stats.oldestAgeSec });
  } catch (err) {
    handleRouteError(err, res, "Outbox drain error:");
  }
});

// ── Journey instances (live tracking) — admin monitoring (#1604) ──────────
// Lists the running/completed journey_instances for the company, enriched with
// each journey's step labels so the UI can render a real progress bar (which
// steps are done vs pending). Powers /admin/journeys.
eventsRouter.get("/journeys", authorize({ feature: "admin", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const status = typeof req.query.status === "string" && req.query.status ? req.query.status : undefined;
    const rows = await listJourneys(scope.companyId, status);
    const defByType = new Map(JOURNEY_DEFINITIONS.map((d) => [d.type, d]));
    const data = rows.map((r) => {
      const def = defByType.get(r.journeyType as string);
      const completed: string[] = Array.isArray(r.completedSteps) ? (r.completedSteps as string[]) : [];
      return {
        id: r.id,
        journeyType: r.journeyType,
        journeyLabel: def?.label ?? r.journeyType,
        domain: def?.domain ?? "unknown",
        entityType: r.entityType,
        entityId: r.entityId,
        label: r.label,
        status: r.status,
        completedCount: completed.length,
        totalSteps: r.totalSteps,
        progress: r.progress != null ? Number(r.progress) : 0,
        steps: (def?.steps ?? []).map((s) => ({ key: s.key, label: s.label, done: completed.includes(s.key) })),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      };
    });
    res.json(maskFields(req, { data, total: data.length }));
  } catch (err) {
    handleRouteError(err, res, "Journeys list error:");
  }
});

export default eventsRouter;
