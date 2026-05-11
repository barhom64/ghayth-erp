import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { buildScopedWhere } from "../lib/scopedQuery.js";

const router = Router();

// audit_logs rows we project. Kept as Record<string, unknown> for
// callers that pull through extra columns; the select list below is the
// canonical shape.
interface AuditLogRow extends Record<string, unknown> {
  id: number;
  companyId: number;
  branchId?: number | null;
  userId?: number | null;
  userName?: string | null;
  action: string;
  entity: string;
  entityId?: number | null;
  before?: unknown;
  after?: unknown;
  beforeData?: unknown;
  afterData?: unknown;
  changes?: unknown;
  reason?: string | null;
  scope?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
}

// Cursor format: base64(JSON{"t":<createdAt-ISO>, "i":<id>}). We carry
// both fields because `createdAt` alone is not unique — many audit
// records can share the same millisecond. Combining (createdAt, id) gives
// a strictly-decreasing ordering that matches the SQL ORDER BY below.
interface AuditCursor {
  t: string;
  i: number;
}

function encodeCursor(c: AuditCursor): string {
  return Buffer.from(JSON.stringify(c), "utf8").toString("base64url");
}

function decodeCursor(s: string): AuditCursor | null {
  try {
    const raw = Buffer.from(s, "base64url").toString("utf8");
    const obj = JSON.parse(raw) as Partial<AuditCursor>;
    if (typeof obj.t !== "string" || typeof obj.i !== "number") return null;
    // Defence-in-depth: reject obviously-bogus dates so a malformed
    // cursor doesn't reach the DB as a comparison value.
    if (Number.isNaN(Date.parse(obj.t))) return null;
    return { t: obj.t, i: obj.i };
  } catch {
    return null;
  }
}

router.get("/", authorize({ feature: "admin.audit", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const {
      entityType, entityId, action, userId,
      page = "1", limit: lim = "50",
      dateFrom, dateTo,
      cursor,
    } = req.query as Record<string, string | undefined>;

    const perPage = Math.min(Number(lim) || 50, 500);

    const { where: scopeWhere, params, nextParamIndex } = buildScopedWhere(
      scope,
      {},
      { companyColumn: 'al."companyId"', disableBranchScope: true }
    );
    const conditions = [scopeWhere];
    let paramIdx = nextParamIndex;

    if (entityType) { params.push(String(entityType)); conditions.push(`al.entity = $${paramIdx++}`); }
    if (entityId) { params.push(String(entityId)); conditions.push(`al."entityId" = $${paramIdx++}`); }
    if (action) {
      params.push(String(action));
      const actionIdx = paramIdx++;
      params.push(`%.${String(action)}`);
      const likeIdx = paramIdx++;
      conditions.push(`(al.action = $${actionIdx} OR al.action LIKE $${likeIdx})`);
    }
    if (userId) { params.push(Number(userId) || 0); conditions.push(`al."userId" = $${paramIdx++}`); }
    if (dateFrom) { params.push(String(dateFrom)); conditions.push(`al."createdAt" >= $${paramIdx++}::timestamptz`); }
    if (dateTo) { params.push(String(dateTo) + "T23:59:59Z"); conditions.push(`al."createdAt" <= $${paramIdx++}::timestamptz`); }

    // ── Cursor mode (opt-in, non-breaking) ──────────────────────────────
    // When the client sends a `cursor` query param we switch to keyset
    // pagination. This skips the costly `OFFSET` scan on large
    // audit_logs tables and gives O(log N) page turns. The legacy
    // `page`/`limit` mode keeps working unchanged when no cursor is sent.
    //
    // The DB index (companyId, createdAt DESC, id DESC) — or fallback to
    // the createdAt index — covers this query plan.
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) {
        res.status(400).json({ error: "cursor غير صالح" });
        return;
      }
      params.push(decoded.t);
      const tIdx = paramIdx++;
      params.push(decoded.i);
      const iIdx = paramIdx++;
      // (createdAt, id) < (cursor.t, cursor.i) in lexicographic order.
      conditions.push(`(al."createdAt", al.id) < ($${tIdx}::timestamptz, $${iIdx})`);

      const where = conditions.join(" AND ");
      params.push(perPage + 1); // fetch one extra to detect "hasMore"
      const limitIdx = paramIdx++;

      const rows = await rawQuery<AuditLogRow>(
        `SELECT al.id, al."companyId", al."branchId", al."userId", al.action, al.entity, al."entityId",
                al."before" AS "beforeData", al."after" AS "afterData", al.changes, al.reason,
                al.scope, al."ipAddress", al."userAgent", al."createdAt",
                al."before", al."after",
                e.name AS "userName"
         FROM audit_logs al
         LEFT JOIN users u ON u.id = al."userId"
         LEFT JOIN employees e ON e.id = u."employeeId"
         WHERE ${where}
         ORDER BY al."createdAt" DESC, al.id DESC
         LIMIT $${limitIdx}`,
        params
      );

      const hasMore = rows.length > perPage;
      const data = hasMore ? rows.slice(0, perPage) : rows;
      const last = data[data.length - 1];
      const nextCursor = hasMore && last
        ? encodeCursor({ t: String(last.createdAt), i: last.id })
        : null;

      res.json({ data, pageSize: perPage, cursor: nextCursor, hasMore });
      return;
    }

    // ── Legacy page/limit mode ──────────────────────────────────────────
    const pageNum = Math.max(Number(page) || 1, 1);
    const offset = (pageNum - 1) * perPage;

    const where = conditions.join(" AND ");
    params.push(perPage);
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;

    const rows = await rawQuery<AuditLogRow>(
      `SELECT al.id, al."companyId", al."branchId", al."userId", al.action, al.entity, al."entityId",
              al."before" AS "beforeData", al."after" AS "afterData", al.changes, al.reason,
              al.scope, al."ipAddress", al."userAgent", al."createdAt",
              al."before", al."after",
              e.name AS "userName"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al."userId"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE ${where}
       ORDER BY al."createdAt" DESC, al.id DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<{ total: string | number }>(
      `SELECT COUNT(*) AS total FROM audit_logs al WHERE ${where}`,
      countParams
    );

    res.json({ data: rows, total: Number(countRow?.total ?? 0), page: pageNum, pageSize: perPage });
  } catch (err) {
    handleRouteError(err, res, "Get audit logs error:");
  }
});

router.get("/entities", authorize({ feature: "admin.audit", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<{ entity: string }>(
      `SELECT DISTINCT entity FROM audit_logs WHERE "companyId" = $1 ORDER BY entity LIMIT 500`,
      [scope.companyId]
    );
    const entities = rows.map((r) => r.entity);
    res.json({ data: entities, total: entities.length, page: 1, pageSize: entities.length });
  } catch (err) {
    handleRouteError(err, res, "Get audit log entities error");
  }
});

router.get("/:entityType/:entityId", authorize({ feature: "admin.audit", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId } = req.params;

    const rows = await rawQuery<AuditLogRow>(
      `SELECT al.*, e.name AS "userName"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al."userId"
       LEFT JOIN employees e ON e.id = u."employeeId"
       WHERE al."companyId" = $1 AND al.entity = $2 AND al."entityId" = $3
       ORDER BY al."createdAt" DESC, al.id DESC
       LIMIT 100`,
      [scope.companyId, entityType, String(entityId)]
    );

    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) {
    handleRouteError(err, res, "Get entity audit logs error:");
  }
});

export default router;
