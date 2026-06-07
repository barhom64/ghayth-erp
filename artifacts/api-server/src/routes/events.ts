import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError, NotFoundError } from "../lib/errorHandler.js";
import { maskFields, authorize } from "../lib/rbac/authorize.js";
import { buildScopedWhere } from "../lib/scopedQuery.js";
import { drainProcessedOutboxEntries, getOutboxStats } from "../lib/eventBus.js";
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

export default eventsRouter;
