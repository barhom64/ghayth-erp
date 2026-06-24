import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { createCostCenterForEntity } from "../lib/costCenterAutoCreate.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { logger } from "../lib/logger.js";

// Local row shape for cost_centers (not in @workspace/db schema yet).
interface CostCenterRow {
  id: number;
  companyId: number;
  code?: string | null;
  name: string;
  type: string;
  parentId?: number | null;
  relatedEntityType?: string | null;
  relatedEntityId?: number | null;
  allocatedAmount?: number | string | null;
  status: string;
  createdAt: string;
  updatedAt?: string | null;
}

interface CostCenterListRow extends CostCenterRow {
  relatedEntityName?: string | null;
}

const router = Router();

// ============================================================================
// ZOD SCHEMAS
// ============================================================================

const createCostCenterSchema = z.object({
  code: z.string().optional(),
  name: z.string().min(1, "اسم مركز التكلفة مطلوب"),
  type: z.string().optional(),
  parentId: z.coerce.number().nullable().optional(),
  relatedEntityType: z.string().nullable().optional(),
  relatedEntityId: z.coerce.number().nullable().optional(),
  allocatedAmount: z.coerce.number().nonnegative().optional(),
});

const updateCostCenterSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().nullable().optional(),
  type: z.string().optional(),
  parentId: z.coerce.number().nullable().optional(),
  allocatedAmount: z.coerce.number().nonnegative().optional(),
  status: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// HIERARCHICAL TREE — flat list shaped into a parent/child forest. The UI's
// tree page consumes this so it doesn't have to do the O(N²) restructuring
// client-side. Computes a depth so the renderer can indent without
// recursive traversal, plus a roll-up `descendantSpend` per node so
// each branch label shows "spent so far" without a second round-trip.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/cost-centers/tree", authorize({ feature: "finance.cost_centers", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // Recursive CTE walks the parent/child chain. Roots are rows with
    // parentId IS NULL (or whose parent is in another company — defensive).
    // The `path` array lets the UI render a breadcrumb without re-walking.
    const rows = await rawQuery<{
      id: number;
      code: string | null;
      name: string;
      type: string | null;
      parentId: number | null;
      status: string;
      relatedEntityType: string | null;
      relatedEntityId: number | null;
      autoCreatedReason: string | null;
      depth: number;
      path: number[];
      allocatedAmount: string | number | null;
      descendantSpend: string | number | null;
    }>(
      `WITH RECURSIVE tree AS (
         SELECT cc.id, cc.code, cc.name, cc.type, cc."parentId", cc.status,
                cc."relatedEntityType", cc."relatedEntityId", cc."autoCreatedReason",
                0 AS depth,
                ARRAY[cc.id] AS path,
                cc."allocatedAmount"
           FROM cost_centers cc
          WHERE cc."companyId" = $1
            AND cc.status != 'deleted'
            AND cc."parentId" IS NULL
         UNION ALL
         SELECT cc.id, cc.code, cc.name, cc.type, cc."parentId", cc.status,
                cc."relatedEntityType", cc."relatedEntityId", cc."autoCreatedReason",
                t.depth + 1,
                t.path || cc.id,
                cc."allocatedAmount"
           FROM cost_centers cc
           JOIN tree t ON t.id = cc."parentId"
          WHERE cc."companyId" = $1
            AND cc.status != 'deleted'
            AND cc.id <> ALL(t.path)         -- cycle break (data corruption guard)
       )
       SELECT t.*,
              act."descendantSpend",
              act."jeCount",
              act."lastActivityAt"
         FROM tree t
         LEFT JOIN LATERAL (
           -- One round-trip per node for the three activity signals:
           -- spend (net debit−credit), JE count (how busy this CC is),
           -- and the most recent posting timestamp (signals dead CCs).
           SELECT COALESCE(SUM(jl.debit - jl.credit), 0)         AS "descendantSpend",
                  COUNT(DISTINCT je.id)::int                     AS "jeCount",
                  MAX(je.date)                                   AS "lastActivityAt"
             FROM journal_lines jl
             JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
            WHERE je."companyId" = $1
              AND je."deletedAt" IS NULL
              AND jl."costCenterId" = t.id
         ) act ON true
         ORDER BY t.path`,
      [scope.companyId],
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Cost-centre tree error"); }
});

// Targeted re-parent — the tree UI calls this on drag-drop. Distinct
// endpoint from the generic PATCH /cost-centers/:id so the permission
// gate can be tighter (re-parenting reshapes reports — same `update`
// permission, but the dedicated path makes audit logs easy to filter).
// Guards against:
//   1. parenting to self (`parentId === id`)
//   2. parenting to a descendant (cycle detection via the same CTE)
//   3. cross-tenant moves (the parent must belong to the same company)
const reparentSchema = z.object({
  parentId: z.coerce.number().int().nullable(),
});
router.patch("/cost-centers/:id/parent", authorize({ feature: "finance.cost_centers", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { parentId } = zodParse(reparentSchema.safeParse(req.body));

    if (parentId === id) {
      throw new ValidationError("لا يمكن جعل مركز التكلفة أبًا لنفسه", { field: "parentId" });
    }

    const [current] = await rawQuery<CostCenterRow>(
      `SELECT * FROM cost_centers WHERE id = $1 AND "companyId" = $2 AND status != 'deleted'`,
      [id, scope.companyId],
    );
    if (!current) throw new NotFoundError("مركز التكلفة غير موجود");

    if (parentId != null) {
      const [parent] = await rawQuery<CostCenterRow>(
        `SELECT id FROM cost_centers WHERE id = $1 AND "companyId" = $2 AND status != 'deleted'`,
        [parentId, scope.companyId],
      );
      if (!parent) throw new NotFoundError("الأب المستهدف غير موجود في نفس الشركة");

      // Cycle check — walk DOWN from `id` and ensure `parentId` isn't
      // among the descendants. Without this, dragging a parent under
      // its own child creates an unreachable subtree.
      const cycle = await rawQuery<{ id: number }>(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM cost_centers WHERE "parentId" = $1 AND "companyId" = $2
           UNION ALL
           SELECT cc.id FROM cost_centers cc
             JOIN descendants d ON cc."parentId" = d.id
            WHERE cc."companyId" = $2
         )
         SELECT id FROM descendants WHERE id = $3 LIMIT 1`,
        [id, scope.companyId, parentId],
      );
      if (cycle.length > 0) {
        throw new ValidationError(
          "لا يمكن جعل مركز التكلفة تابعًا لأحد فروعه (دورة في الشجرة)",
          { field: "parentId", fix: "اختر أبًا خارج الفروع التابعة لهذا المركز" },
        );
      }
    }

    await rawExecute(
      `UPDATE cost_centers SET "parentId" = $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3`,
      [parentId, id, scope.companyId],
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "cost_center.reparented", entity: "cost_centers", entityId: id,
      before: { parentId: current.parentId }, after: { parentId },
    });
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "cost_center.reparented", entity: "cost_centers", entityId: id,
      details: JSON.stringify({ from: current.parentId, to: parentId }),
    }).catch((e) => logger.error(e, "finance-cost-centers background task failed"));
    res.json({ id, parentId });
  } catch (err) { handleRouteError(err, res, "Reparent cost center error"); }
});

router.get("/cost-centers", authorize({ feature: "finance.cost_centers", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    // cost_centers has no branchId column, so disable branch scope.
    // Correlated subqueries below now key off cc."companyId" instead of
    // hard-coding $1 — that way name resolution works correctly when the
    // multi-company picker is active and a single result set contains
    // rows from more than one company.
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(
      scope,
      filters,
      { companyColumn: 'cc."companyId"', disableBranchScope: true },
    );
    const extraConditions = [`cc.status != 'deleted'`];
    const where = `${baseWhere} AND ${extraConditions.join(" AND ")}`;
    void nextParamIndex; // reserved if a future filter needs more params
    // Was N+1: polymorphic CASE expression with a correlated subquery per
    // entity-type branch. For LIMIT 1000 cost centers that's up to 1000
    // single-row lookups across 5 different tables.
    //
    // Replaces each correlated subquery with a typed LEFT JOIN keyed on
    // (relatedEntityType, relatedEntityId, companyId). Postgres can pick
    // each name once per matching cost-center row in a single scan.
    // Employees join an EXISTS sub-clause for the company-assignment
    // check so multiple assignments per employee don't multiply rows.
    const rows = await rawQuery<CostCenterListRow>(
      `SELECT cc.*,
              CASE cc."relatedEntityType"
                WHEN 'project'    THEN p.name
                WHEN 'vehicle'    THEN v."plateNumber"
                WHEN 'employee'   THEN e.name
                WHEN 'department' THEN d.name
                WHEN 'branch'     THEN b.name
                ELSE NULL
              END AS "relatedEntityName"
         FROM cost_centers cc
         LEFT JOIN projects p
                ON cc."relatedEntityType" = 'project'
               AND p.id = cc."relatedEntityId"
               AND p."companyId" = cc."companyId"
               AND p."deletedAt" IS NULL
         LEFT JOIN fleet_vehicles v
                ON cc."relatedEntityType" = 'vehicle'
               AND v.id = cc."relatedEntityId"
               AND v."companyId" = cc."companyId"
               AND v."deletedAt" IS NULL
         LEFT JOIN employees e
                ON cc."relatedEntityType" = 'employee'
               AND e.id = cc."relatedEntityId"
               AND e."deletedAt" IS NULL
               AND EXISTS (
                 SELECT 1 FROM employee_assignments ea
                  WHERE ea."employeeId" = e.id AND ea."companyId" = cc."companyId"
               )
         LEFT JOIN departments d
                ON cc."relatedEntityType" = 'department'
               AND d.id = cc."relatedEntityId"
               AND d."companyId" = cc."companyId"
         LEFT JOIN branches b
                ON cc."relatedEntityType" = 'branch'
               AND b.id = cc."relatedEntityId"
               AND b."companyId" = cc."companyId"
        WHERE ${where}
        ORDER BY cc.code, cc.name
        LIMIT 1000`,
      params,
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "List cost centers error"); }
});

// NOTE: this STATIC route MUST stay registered before `/cost-centers/:id`
// below — Express matches in registration order, so if `:id` came first it
// would capture "ranking" as the id param and 422 with "معرف غير صالح: id".
// Guarded by scripts/src/check-route-shadowing.mjs.
router.get("/cost-centers/ranking", authorize({ feature: "finance.cost_centers", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const q = req.query as Record<string, string | undefined>;
    const metric = String(q.metric ?? "expense");
    if (!CC_RANKING_METRICS.has(metric)) {
      throw new ValidationError(`المقياس غير مدعوم: ${metric}`, { field: "metric" });
    }

    // Clamp limit [5, 100] — cheap correlated tree-rollups, but
    // still don't want to invite 10k-row scans.
    const limit = Math.max(5, Math.min(100, Number(q.limit) > 0 ? Number(q.limit) : 20));
    const from = q.dateFrom || "1970-01-01";
    const to = q.dateTo || "2099-12-31";
    const direction = q.direction === "asc" ? "ASC" : "DESC";

    // Optional `rootId` narrows the ranking to a subtree (e.g. just
    // projects under one branch's CC).
    const rootId = q.rootId && Number(q.rootId) > 0 ? Number(q.rootId) : null;

    const orderCol: Record<string, string> = {
      revenue: "revenue",
      expense: "expense",
      net:     "net",
      entries: "entries",
    };

    // Per-CC rollup via a recursive CTE that produces (cc_id,
    // descendant_id) pairs. Each CC then aggregates over all its
    // descendant JE lines in one swoop.
    //
    // The OPTIONAL filter `rootId` restricts the top-level set
    // (defaults to ALL CCs in the tenant — `parentId IS NULL` would
    // only show roots, which isn't what we want for ranking).
    const rows = await rawQuery<{
      ccId: number;
      ccCode: string | null;
      ccName: string;
      revenue: string;
      expense: string;
      entries: number;
    }>(
      `WITH RECURSIVE tree AS (
         SELECT id AS root_id, id AS desc_id
           FROM cost_centers
          WHERE "companyId" = $1
            AND status != 'deleted'
            ${rootId ? `AND id = ${rootId}` : ""}
         UNION ALL
         SELECT t.root_id, cc.id
           FROM cost_centers cc
           JOIN tree t ON cc."parentId" = t.desc_id
          WHERE cc."companyId" = $1
            AND cc.status != 'deleted'
       ),
       per_cc AS (
         SELECT t.root_id AS cc_id,
                COALESCE(SUM(CASE WHEN ca.type = 'revenue'
                                  THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales')
                                  THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
                COUNT(DISTINCT je.id)::int AS entries
           FROM tree t
           LEFT JOIN journal_lines jl ON jl."costCenterId" = t.desc_id AND jl."deletedAt" IS NULL
           LEFT JOIN journal_entries je
                  ON je.id = jl."journalId"
                 AND je."companyId" = $1
                 AND je."deletedAt" IS NULL
                 AND je.date BETWEEN $2 AND $3
           LEFT JOIN chart_of_accounts ca
                  ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
          GROUP BY t.root_id
       )
       SELECT cc.id AS "ccId",
              cc.code AS "ccCode",
              cc.name AS "ccName",
              p.revenue,
              p.expense,
              (p.revenue - p.expense) AS net,
              p.entries
         FROM per_cc p
         JOIN cost_centers cc ON cc.id = p.cc_id
                              AND cc."companyId" = $1
                              AND cc.status != 'deleted'
        ORDER BY ${orderCol[metric]} ${direction} NULLS LAST, cc.id ASC
        LIMIT ${limit}`,
      [scope.companyId, from, to],
    );

    // OPTIONAL: prior-period rollup for the same CCs. Same shape as
    // the entity-ranking includePrior path — each top-N CC gets a
    // matching aggregate over the prior calendar-year window so the
    // frontend can render anomaly badges without N round-trips.
    //
    // Uses ANY($::int[]) over the top-N ids — one query, no N+1.
    // Each row reaggregates over the FULL descendant subtree of THAT
    // cc (same recursive CTE shape).
    let priorRows: Array<{ ccId: number; revenue: number; expense: number; net: number; entries: number }> = [];
    if (q.includePrior === "true" && rows.length > 0) {
      const shiftYear = (iso: string): string => {
        const [yStr, m, d] = iso.split("-");
        return `${Number(yStr) - 1}-${m}-${d}`;
      };
      const priorFrom = shiftYear(from);
      const priorTo = shiftYear(to);
      const ids = rows.map((r) => r.ccId);
      const priorAgg = await rawQuery<{
        ccId: number;
        revenue: string;
        expense: string;
        entries: number;
      }>(
        `WITH RECURSIVE tree AS (
           SELECT id AS root_id, id AS desc_id
             FROM cost_centers
            WHERE "companyId" = $1
              AND status != 'deleted'
              AND id = ANY($4::int[])
           UNION ALL
           SELECT t.root_id, cc.id
             FROM cost_centers cc
             JOIN tree t ON cc."parentId" = t.desc_id
            WHERE cc."companyId" = $1
              AND cc.status != 'deleted'
         )
         SELECT t.root_id AS "ccId",
                COALESCE(SUM(CASE WHEN ca.type = 'revenue'
                                  THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales')
                                  THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
                COUNT(DISTINCT je.id)::int AS entries
           FROM tree t
           LEFT JOIN journal_lines jl ON jl."costCenterId" = t.desc_id AND jl."deletedAt" IS NULL
           LEFT JOIN journal_entries je
                  ON je.id = jl."journalId"
                 AND je."companyId" = $1
                 AND je."deletedAt" IS NULL
                 AND je.date BETWEEN $2 AND $3
           LEFT JOIN chart_of_accounts ca
                  ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
          GROUP BY t.root_id`,
        [scope.companyId, priorFrom, priorTo, ids],
      );
      priorRows = priorAgg.map((r) => ({
        ccId: r.ccId,
        revenue: Number(r.revenue),
        expense: Number(r.expense),
        net: Number(r.revenue) - Number(r.expense),
        entries: Number(r.entries),
      }));
    }

    const priorByCc = new Map(priorRows.map((p) => [p.ccId, p]));

    res.json({
      metric,
      direction: direction.toLowerCase(),
      dateFrom: from,
      dateTo: to,
      limit,
      rootId,
      includePrior: q.includePrior === "true",
      rows: rows.map((r) => {
        const prior = priorByCc.get(r.ccId) ?? null;
        return {
          ccId: r.ccId,
          ccCode: r.ccCode,
          ccName: r.ccName,
          revenue: Number(r.revenue),
          expense: Number(r.expense),
          net: Number(r.revenue) - Number(r.expense),
          entries: Number(r.entries),
          prior: prior
            ? {
                revenue: prior.revenue,
                expense: prior.expense,
                net: prior.net,
                entries: prior.entries,
              }
            : null,
        };
      }),
    });
  } catch (err) { handleRouteError(err, res, "Cost-centre ranking error"); }
});

router.get("/cost-centers/:id", authorize({ feature: "finance.cost_centers", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<CostCenterRow>(
      `SELECT * FROM cost_centers WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("مركز التكلفة غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Get cost center error"); }
});

router.post("/cost-centers", authorize({ feature: "finance.cost_centers", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(createCostCenterSchema.safeParse(req.body));
    const { code, name, type, parentId, relatedEntityType, relatedEntityId, allocatedAmount } = parsed;

    const [existing] = code
      ? await rawQuery<{ id: number }>(
          `SELECT id FROM cost_centers WHERE "companyId" = $1 AND code = $2 AND status != 'deleted'`,
          [scope.companyId, code]
        )
      : [];
    if (existing) throw new ValidationError("رمز مركز التكلفة مستخدم بالفعل", { field: "code" });

    // Dual-write the entity link: cost_centers carries BOTH naming pairs
    // — the original (migration 091) relatedEntityType/relatedEntityId AND
    // the newer (migration 203) linkedEntityType/linkedEntityId. Different
    // consumers read from different pairs:
    //   • This UI route + finance-reports.ts → relatedEntity* (legacy)
    //   • lib/accountingAllocation.ts from_* strategies → linkedEntity*
    // Writing both columns from the same parsed input keeps the resolver's
    // cost-centre lookup in sync with rows authored via the UI (audit F1).
    const [row] = await rawQuery<CostCenterRow>(
      `INSERT INTO cost_centers (
         "companyId", code, name, type, "parentId",
         "relatedEntityType", "relatedEntityId",
         "linkedEntityType", "linkedEntityId",
         "allocatedAmount"
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $7, $8)
       ON CONFLICT ("companyId", code) DO NOTHING
       RETURNING *`,
      [scope.companyId, code || null, name, type || "general", parentId || null, relatedEntityType || null, relatedEntityId || null, allocatedAmount || 0]
    );
    if (!row) throw new ConflictError("رمز مركز التكلفة مستخدم مسبقاً", { field: "code", fix: "استخدم رمزاً مختلفاً لمركز التكلفة" });

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "cost_center.created", entity: "cost_centers", entityId: row.id, after: row });
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "cost_center.created", entity: "cost_centers", entityId: row.id, details: JSON.stringify({ name, code, type: type || "general" }) }).catch((e) => logger.error(e, "finance-cost-centers background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create cost center error"); }
});

router.patch("/cost-centers/:id", authorize({ feature: "finance.cost_centers", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<CostCenterRow>(
      `SELECT * FROM cost_centers WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("مركز التكلفة غير موجود");

    const parsed = zodParse(updateCostCenterSchema.safeParse(req.body));
    const { name, code, type, parentId, allocatedAmount, status } = parsed;
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (name !== undefined) { sets.push(`name = $${idx++}`); params.push(name); }
    if (code !== undefined) { sets.push(`code = $${idx++}`); params.push(code); }
    if (type !== undefined) { sets.push(`type = $${idx++}`); params.push(type); }
    if (parentId !== undefined) { sets.push(`"parentId" = $${idx++}`); params.push(parentId); }
    if (allocatedAmount !== undefined) { sets.push(`"allocatedAmount" = $${idx++}`); params.push(allocatedAmount); }
    if (status !== undefined) { sets.push(`status = $${idx++}`); params.push(status); }
    sets.push(`"updatedAt" = NOW()`);

    if (sets.length <= 1) throw new ValidationError("لا توجد بيانات للتحديث");

    params.push(id, scope.companyId);
    const [row] = await rawQuery<CostCenterRow>(
      `UPDATE cost_centers SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("مركز التكلفة غير موجود");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "cost_center.updated", entity: "cost_centers", entityId: row.id, after: row });
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "cost_center.updated", entity: "cost_centers", entityId: row.id, details: JSON.stringify({ name: row.name, code: row.code }) }).catch((e) => logger.error(e, "finance-cost-centers background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update cost center error"); }
});

router.delete("/cost-centers/:id", authorize({ feature: "finance.cost_centers", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawExecute(
      `UPDATE cost_centers SET status = 'deleted', "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND status != 'deleted'`,
      [id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "cost_center.deleted", entity: "cost_centers", entityId: id });
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "cost_center.deleted", entity: "cost_centers", entityId: id, details: JSON.stringify({ id: id }) }).catch((e) => logger.error(e, "finance-cost-centers background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete cost center error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// BACKFILL — auto-create cost centres for entities that predate the
// hooks on POST /branches + POST /projects. Same shape as the umrah
// backfill endpoint: optional entityType + entityId narrow the scan;
// otherwise the whole tenant gets processed.
//
// Order matters — branches FIRST so when projects are processed
// second, they can nest under their branch's freshly-minted CC. The
// helper itself is idempotent (look-up by entity + ON CONFLICT) so
// re-runs are safe.
// ─────────────────────────────────────────────────────────────────────────────
const backfillCostCentersSchema = z.object({
  entityType: z.enum(["branch", "project", "contract", "vehicle", "department"]).optional(),
  entityId: z.coerce.number().int().positive().optional(),
});

router.post("/cost-centers/backfill", authorize({ feature: "finance.cost_centers", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(backfillCostCentersSchema.safeParse(req.body));
    const onlyType = body.entityType;
    const onlyId = body.entityId;

    const summary = { branches: 0, projects: 0, contracts: 0, vehicles: 0, departments: 0, created: 0, reused: 0 };
    const details: Array<{ entityType: string; entityId: number; name: string; ccId: number | null; status: string }> = [];

    if (!onlyType || onlyType === "branch") {
      const branches = await rawQuery<{ id: number; name: string }>(
        `SELECT id, name FROM branches
          WHERE "companyId" = $1
          ${onlyId && onlyType === "branch" ? `AND id = ${Number(onlyId)}` : ""}
          ORDER BY id ASC`,
        [scope.companyId],
      );
      summary.branches = branches.length;
      for (const br of branches) {
        const cc = await createCostCenterForEntity(
          scope.companyId, "branch", br.id, br.name,
          { actorUserId: scope.userId },
        );
        if (cc) summary.created++;
        else summary.reused++;
        details.push({ entityType: "branch", entityId: br.id, name: br.name, ccId: cc?.id ?? null, status: cc ? "created_or_reused" : "failed" });
      }
    }

    if (!onlyType || onlyType === "project") {
      // Projects don't carry a branchId column, so we use the project's
      // most recent journal-entry's branchId as the parent hint. Falls
      // back to no parent when no JE exists yet (project never posted
      // to GL) — the CC is created at root and the operator can re-parent.
      const projects = await rawQuery<{ id: number; name: string; branchId: number | null }>(
        `SELECT p.id, p.name,
                (SELECT je."branchId" FROM journal_entries je
                  WHERE je."companyId" = p."companyId"
                    AND je."sourceType" = 'projects' AND je."sourceId" = p.id
                    AND je."deletedAt" IS NULL
                  ORDER BY je."createdAt" ASC LIMIT 1) AS "branchId"
           FROM projects p
          WHERE p."companyId" = $1 AND p."deletedAt" IS NULL
          ${onlyId && onlyType === "project" ? `AND p.id = ${Number(onlyId)}` : ""}
          ORDER BY p.id ASC`,
        [scope.companyId],
      );
      summary.projects = projects.length;
      for (const pr of projects) {
        const cc = await createCostCenterForEntity(
          scope.companyId, "project", pr.id, pr.name,
          {
            parentEntityType: pr.branchId ? "branch" : null,
            parentEntityId: pr.branchId,
            actorUserId: scope.userId,
          },
        );
        if (cc) summary.created++;
        else summary.reused++;
        details.push({ entityType: "project", entityId: pr.id, name: pr.name, ccId: cc?.id ?? null, status: cc ? "created_or_reused" : "failed" });
      }
    }

    if (!onlyType || onlyType === "contract") {
      // legal_contracts has no branchId column either — same trick:
      // earliest JE's branchId nests the contract under its branch.
      const contracts = await rawQuery<{ id: number; title: string; branchId: number | null }>(
        `SELECT c.id, c.title,
                (SELECT je."branchId" FROM journal_entries je
                  WHERE je."companyId" = c."companyId"
                    AND je."sourceType" = 'legal_contracts' AND je."sourceId" = c.id
                    AND je."deletedAt" IS NULL
                  ORDER BY je."createdAt" ASC LIMIT 1) AS "branchId"
           FROM legal_contracts c
          WHERE c."companyId" = $1 AND c."deletedAt" IS NULL
          ${onlyId && onlyType === "contract" ? `AND c.id = ${Number(onlyId)}` : ""}
          ORDER BY c.id ASC`,
        [scope.companyId],
      );
      summary.contracts = contracts.length;
      for (const ct of contracts) {
        const cc = await createCostCenterForEntity(
          scope.companyId, "contract", ct.id, ct.title,
          {
            parentEntityType: ct.branchId ? "branch" : null,
            parentEntityId: ct.branchId,
            actorUserId: scope.userId,
          },
        );
        if (cc) summary.created++;
        else summary.reused++;
        details.push({ entityType: "contract", entityId: ct.id, name: ct.title, ccId: cc?.id ?? null, status: cc ? "created_or_reused" : "failed" });
      }
    }

    if (!onlyType || onlyType === "vehicle") {
      // fleet_vehicles HAS a branchId column — use it directly.
      const vehicles = await rawQuery<{ id: number; label: string; branchId: number | null }>(
        `SELECT id,
                (make || ' ' || model || ' — ' || "plateNumber") AS label,
                "branchId"
           FROM fleet_vehicles
          WHERE "companyId" = $1 AND "deletedAt" IS NULL
          ${onlyId && onlyType === "vehicle" ? `AND id = ${Number(onlyId)}` : ""}
          ORDER BY id ASC`,
        [scope.companyId],
      );
      summary.vehicles = vehicles.length;
      for (const v of vehicles) {
        const cc = await createCostCenterForEntity(
          scope.companyId, "vehicle", v.id, v.label,
          {
            parentEntityType: v.branchId ? "branch" : null,
            parentEntityId: v.branchId,
            actorUserId: scope.userId,
          },
        );
        if (cc) summary.created++;
        else summary.reused++;
        details.push({ entityType: "vehicle", entityId: v.id, name: v.label, ccId: cc?.id ?? null, status: cc ? "created_or_reused" : "failed" });
      }
    }

    if (!onlyType || onlyType === "department") {
      // Departments don't carry a branchId column — same trick as
      // projects/contracts: earliest JE's branchId nests under branch.
      const departments = await rawQuery<{ id: number; name: string; branchId: number | null }>(
        `SELECT d.id, d.name,
                (SELECT je."branchId" FROM journal_entries je
                  WHERE je."companyId" = d."companyId"
                    AND je."deletedAt" IS NULL
                    AND EXISTS (
                      SELECT 1 FROM journal_lines jl
                       WHERE jl."journalId" = je.id
                         AND jl."deletedAt" IS NULL
                         AND jl."departmentId" = d.id
                    )
                  ORDER BY je."createdAt" ASC LIMIT 1) AS "branchId"
           FROM departments d
          WHERE d."companyId" = $1
          ${onlyId && onlyType === "department" ? `AND d.id = ${Number(onlyId)}` : ""}
          ORDER BY d.id ASC`,
        [scope.companyId],
      );
      summary.departments = departments.length;
      for (const d of departments) {
        const cc = await createCostCenterForEntity(
          scope.companyId, "department", d.id, d.name,
          {
            parentEntityType: d.branchId ? "branch" : null,
            parentEntityId: d.branchId,
            actorUserId: scope.userId,
          },
        );
        if (cc) summary.created++;
        else summary.reused++;
        details.push({ entityType: "department", entityId: d.id, name: d.name, ccId: cc?.id ?? null, status: cc ? "created_or_reused" : "failed" });
      }
    }

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "cost_center.backfill", entity: "cost_centers", entityId: 0,
      after: { summary, filters: body },
    });
    res.json({ summary, details });
  } catch (err) { handleRouteError(err, res, "Backfill cost centers error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// JOURNAL-LINE DIMENSIONAL BACKFILL — closes the loop on past JEs.
// The enricher in createJournalEntry handles all NEW lines, but every
// JE posted BEFORE this feature landed has costCenterId NULL even when
// it carried a project / contract / vehicle / department hint. This
// endpoint walks those rows and patches them in place, reusing the
// same priority chain as the runtime enricher (single source of truth).
//
// Operationally cheap — uses one UPDATE...FROM per priority level so a
// company with 100k journal_lines gets backfilled in a few seconds,
// not row-by-row.
//
// Idempotent: each UPDATE only touches rows where costCenterId IS NULL,
// so re-runs are no-ops on already-enriched lines.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/journal-lines/backfill-dimensions", authorize({ feature: "finance.cost_centers", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // Same priority order as the runtime enricher. Each pass fills
    // rows where costCenterId is null AND the higher-priority field
    // is null (so a project hint always wins over a branch hint —
    // matches the runtime semantics).
    const priorities: Array<{ field: string; entityType: string; precedingFields: string[] }> = [
      { field: `"projectId"`,    entityType: "project",    precedingFields: [] },
      { field: `"contractId"`,   entityType: "contract",   precedingFields: [`"projectId"`] },
      { field: `"vehicleId"`,    entityType: "vehicle",    precedingFields: [`"projectId"`, `"contractId"`] },
      { field: `"departmentId"`, entityType: "department", precedingFields: [`"projectId"`, `"contractId"`, `"vehicleId"`] },
      { field: `"branchId"`,     entityType: "branch",     precedingFields: [`"projectId"`, `"contractId"`, `"vehicleId"`, `"departmentId"`] },
    ];

    const stages: Array<{ entityType: string; updated: number }> = [];
    for (const p of priorities) {
      // The precedingFields IS NULL clause makes the priority strict:
      // a row whose projectId is set gets routed to the project's CC,
      // not the branch CC. Without it, the branch pass would clobber
      // earlier passes' assignments.
      const guardSql = p.precedingFields.length > 0
        ? `AND ${p.precedingFields.map((f) => `jl.${f} IS NULL`).join(" AND ")}`
        : "";
      const result = await rawExecute(
        `UPDATE journal_lines jl
            SET "costCenterId" = cc.id
           FROM journal_entries je, cost_centers cc
          WHERE jl."journalId" = je.id
            AND je."companyId" = $1
            AND je."deletedAt" IS NULL
            AND jl."costCenterId" IS NULL
            AND jl.${p.field} IS NOT NULL
            AND cc."companyId" = $1
            AND cc."relatedEntityType" = $2
            AND cc."relatedEntityId" = jl.${p.field}
            AND cc.status != 'deleted'
            AND cc."deletedAt" IS NULL
            ${guardSql}`,
        [scope.companyId, p.entityType],
      );
      stages.push({ entityType: p.entityType, updated: Number(result.affectedRows ?? 0) });
    }

    const totalUpdated = stages.reduce((s, x) => s + x.updated, 0);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "journal_lines.backfill_dimensions", entity: "journal_lines", entityId: 0,
      after: { stages, totalUpdated },
    });
    res.json({ stages, totalUpdated });
  } catch (err) { handleRouteError(err, res, "Backfill journal-line dimensions error"); }
});

// Coverage report — counts JE lines with vs without costCenterId, with
// a breakdown of whether they carry ANY routable dimension. Splits:
//   - withCc:                already enriched
//   - withDimensionButNoCc:   has projectId/etc but CC missing → backfill candidates
//   - orphanCorporate:        no dimension at all → "corporate overhead"
// The UI surfaces this as a coverage % and a one-click backfill button.
router.get("/journal-lines/dimensional-coverage", authorize({ feature: "finance.cost_centers", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<{
      totalLines: number;
      withCc: number;
      withDimensionButNoCc: number;
      orphanCorporate: number;
    }>(
      `WITH base AS (
         SELECT jl.id, jl."costCenterId",
                COALESCE(jl."projectId", jl."contractId", jl."vehicleId",
                         jl."departmentId", jl."branchId") AS any_dim
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
          WHERE je."companyId" = $1
            AND je."deletedAt" IS NULL
       )
       SELECT COUNT(*)::int                                              AS "totalLines",
              COUNT(*) FILTER (WHERE "costCenterId" IS NOT NULL)::int   AS "withCc",
              COUNT(*) FILTER (WHERE "costCenterId" IS NULL
                                AND any_dim IS NOT NULL)::int          AS "withDimensionButNoCc",
              COUNT(*) FILTER (WHERE "costCenterId" IS NULL
                                AND any_dim IS NULL)::int              AS "orphanCorporate"
         FROM base`,
      [scope.companyId],
    );
    const totalLines = Number(row?.totalLines ?? 0);
    const withCc = Number(row?.withCc ?? 0);
    const coveragePct = totalLines > 0 ? Math.round((withCc / totalLines) * 100) : 100;
    res.json({
      totalLines,
      withCc,
      withDimensionButNoCc: Number(row?.withDimensionButNoCc ?? 0),
      orphanCorporate: Number(row?.orphanCorporate ?? 0),
      coveragePct,
    });
  } catch (err) { handleRouteError(err, res, "Journal-line dimensional coverage error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// DORMANT ENTITIES REPORT — finds CCs + subsidiary_accounts with ZERO
// JE traffic in the lookback window (default 90 days). Operationally:
// these are dead-weight in the COA tree — minted at some point but
// never used, or once-used and now abandoned. The operator can use
// the report to drive cleanup (soft-delete the row).
//
// Two-sided: both `cost_centers` and `subsidiary_accounts` participate
// in the dimensional-routing graph, so both can go dormant.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/dormant-entities", authorize({ feature: "finance.cost_centers", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const daysRaw = Number((req.query as Record<string, string | undefined>).days ?? 90);
    // Clamp to [7, 730] — 1 week minimum signal, 2 years maximum
    // lookback. A 365-day mid-point covers seasonal businesses
    // (umrah seasons, real-estate contracts).
    const days = Math.max(7, Math.min(730, Number.isFinite(daysRaw) ? daysRaw : 90));

    // Dormant CCs — created ≥ `days` ago, no JE line ever (or no JE
    // line in the lookback window). The `firstSeen` is when the CC
    // was created so the UI can render "age" honestly.
    const dormantCcs = await rawQuery<{
      id: number; code: string | null; name: string; type: string | null;
      autoCreatedReason: string | null; createdAt: string;
      lastActivityAt: string | null; jeCount: number;
    }>(
      `SELECT cc.id, cc.code, cc.name, cc.type, cc."autoCreatedReason",
              cc."createdAt"::text AS "createdAt",
              act."lastActivityAt",
              COALESCE(act."jeCount", 0)::int AS "jeCount"
         FROM cost_centers cc
         LEFT JOIN LATERAL (
           SELECT MAX(je.date) AS "lastActivityAt",
                  COUNT(DISTINCT je.id)::int AS "jeCount"
             FROM journal_lines jl
             JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
            WHERE je."companyId" = cc."companyId"
              AND je."deletedAt" IS NULL
              AND jl."costCenterId" = cc.id
              AND je.date >= (CURRENT_DATE - $2::int)
         ) act ON true
        WHERE cc."companyId" = $1
          AND cc.status != 'deleted'
          AND cc."deletedAt" IS NULL
          AND cc."createdAt" < (CURRENT_DATE - $2::int)
          AND COALESCE(act."jeCount", 0) = 0
        ORDER BY cc."createdAt" ASC
        LIMIT 500`,
      [scope.companyId, days],
    );

    // Dormant subsidiary_accounts — same shape but joined through the
    // accountCode → journal_lines. We use the CoA's currentBalance
    // as a coarse sanity check: a non-zero balance means SOMETHING
    // moved it (possibly before the lookback window), so we exclude.
    const dormantSubs = await rawQuery<{
      id: number; entityType: string; entityId: number; accountType: string;
      accountCode: string; accountName: string;
      currentBalance: string | number | null; createdAt: string;
      lastActivityAt: string | null; jeCount: number;
    }>(
      `SELECT sa.id, sa."entityType", sa."entityId", sa."accountType",
              coa.code AS "accountCode", coa.name AS "accountName",
              coa."currentBalance",
              sa."createdAt"::text AS "createdAt",
              act."lastActivityAt",
              COALESCE(act."jeCount", 0)::int AS "jeCount"
         FROM subsidiary_accounts sa
         JOIN chart_of_accounts coa ON coa.id = sa."accountId"
                                    AND coa."companyId" = sa."companyId"
                                    AND coa."deletedAt" IS NULL
         LEFT JOIN LATERAL (
           SELECT MAX(je.date) AS "lastActivityAt",
                  COUNT(DISTINCT je.id)::int AS "jeCount"
             FROM journal_lines jl
             JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
            WHERE je."companyId" = sa."companyId"
              AND je."deletedAt" IS NULL
              AND jl."accountCode" = coa.code
              AND je.date >= (CURRENT_DATE - $2::int)
         ) act ON true
        WHERE sa."companyId" = $1
          AND sa."isActive" = true
          AND sa."deletedAt" IS NULL
          AND sa."createdAt" < (CURRENT_DATE - $2::int)
          AND COALESCE(act."jeCount", 0) = 0
          AND COALESCE(coa."currentBalance", 0) = 0
        ORDER BY sa."createdAt" ASC
        LIMIT 500`,
      [scope.companyId, days],
    );

    res.json({
      lookbackDays: days,
      costCenters: dormantCcs,
      subsidiaryAccounts: dormantSubs,
      totals: {
        costCenters: dormantCcs.length,
        subsidiaryAccounts: dormantSubs.length,
      },
    });
  } catch (err) { handleRouteError(err, res, "Dormant entities error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// SUBSIDIARY-SUBSTITUTION FEATURE FLAG — the operator's toggle for the
// control-account / subsidiary-ledger pattern. OFF by default; when ON,
// every JE post at runtime swaps lines like (1121 + employeeId=42) for
// the employee's subsidiary code (1121-0042).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/subsidiary-substitution/state", authorize({ feature: "finance.cost_centers", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<{ value: string | null }>(
      `SELECT value FROM system_settings
        WHERE key = 'gl_subsidiary_substitution'
          AND ("companyId" = $1 OR "companyId" IS NULL)
        ORDER BY ("companyId" IS NULL) ASC
        LIMIT 1`,
      [scope.companyId],
    );
    const raw = row?.value;
    const enabled = raw === "true" || raw === "1";

    // Coverage signal — how many subsidiary mappings exist for this
    // tenant? When the count is 0 there's nothing to substitute, so
    // the toggle is informational only. The UI uses this to decide
    // whether to suggest enabling.
    const [count] = await rawQuery<{ subsidiaries: number }>(
      `SELECT COUNT(*)::int AS subsidiaries
         FROM subsidiary_accounts
        WHERE "companyId" = $1
          AND "isActive" = true
          AND "deletedAt" IS NULL`,
      [scope.companyId],
    );

    res.json({
      enabled,
      subsidiaryCount: Number(count?.subsidiaries ?? 0),
    });
  } catch (err) { handleRouteError(err, res, "Subsidiary substitution state error"); }
});

const setSubstitutionSchema = z.object({ enabled: z.boolean() });
router.patch("/subsidiary-substitution/state", authorize({ feature: "finance.cost_centers", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { enabled } = zodParse(setSubstitutionSchema.safeParse(req.body));
    const value = enabled ? "true" : "false";

    // Upsert into system_settings — composite key (companyId, branchId, key).
    // branchId is null because this is a tenant-wide finance policy.
    await rawExecute(
      `INSERT INTO system_settings ("companyId", "branchId", key, value, "updatedAt")
       VALUES ($1, NULL, 'gl_subsidiary_substitution', $2, NOW())
       ON CONFLICT ("companyId", "branchId", key)
         DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
      [scope.companyId, value],
    );

    // Drop the in-process cache so the next JE picks up the new value
    // without waiting for a process restart.
    const { _resetSubsidiarySubstitutionCache } = await import("../lib/journalLineDimensionalEnricher.js");
    _resetSubsidiarySubstitutionCache();

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "gl.subsidiary_substitution.set", entity: "system_settings", entityId: 0,
      after: { enabled },
    });
    res.json({ enabled });
  } catch (err) { handleRouteError(err, res, "Set subsidiary substitution error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PER-CC P&L — pays off the auto-enrichment. For a given costCenterId
// the endpoint returns:
//   - self bucket:  revenue / expense / net for that CC only
//   - rolled bucket: same metrics INCLUDING all descendants (via the
//     same recursive-CTE shape as /cost-centers/tree)
//   - dateFrom / dateTo filter (default: current month)
//   - recent JEs (top 50 by date) for the drill list
//
// The endpoint uses chart_of_accounts.type to classify revenue vs
// expense — this is the canonical signal. A "revenue" line is one
// whose accountCode resolves to type='revenue' (credit-natured); an
// "expense" line resolves to type='expense' or 'cost_of_sales'.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/cost-centers/:id/pnl", authorize({ feature: "finance.cost_centers", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;

    // Default to the current Riyadh calendar month — same convention
    // as the rest of the finance reports. Operators can override per
    // request via the query string.
    const defaultFrom = (() => {
      const d = new Date();
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
    })();
    const defaultTo = (() => {
      const d = new Date();
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    })();
    const from = dateFrom || defaultFrom;
    const to = dateTo || defaultTo;

    // Step 1 — confirm the CC exists in this tenant.
    const [cc] = await rawQuery<{ id: number; code: string | null; name: string }>(
      `SELECT id, code, name FROM cost_centers
        WHERE id = $1 AND "companyId" = $2 AND status != 'deleted'`,
      [id, scope.companyId],
    );
    if (!cc) throw new NotFoundError("مركز التكلفة غير موجود");

    // Step 2 — gather the descendant ids via the same recursive-CTE
    // shape the tree endpoint uses. One round-trip; the array is
    // bound to the subsequent aggregate queries.
    const descendants = await rawQuery<{ id: number }>(
      `WITH RECURSIVE tree AS (
         SELECT id FROM cost_centers
          WHERE id = $1 AND "companyId" = $2
         UNION ALL
         SELECT cc.id FROM cost_centers cc
           JOIN tree t ON t.id = cc."parentId"
          WHERE cc."companyId" = $2 AND cc.status != 'deleted'
       )
       SELECT id FROM tree`,
      [id, scope.companyId],
    );
    const allIds = descendants.map((r) => r.id);

    // Step 3 — the two buckets (self / rolled) in ONE query via
    // FILTER, so the DB does one scan of journal_lines per JE filter.
    // Revenue = sum(credit - debit) on credit-natured accounts.
    // Expense = sum(debit - credit) on debit-natured accounts.
    // The accountCode → type lookup goes via chart_of_accounts.type.
    const [agg] = await rawQuery<{
      selfRevenue: string; selfExpense: string;
      rolledRevenue: string; rolledExpense: string;
      selfEntries: number; rolledEntries: number;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN ca.type = 'revenue' AND jl."costCenterId" = $1
                           THEN jl.credit - jl.debit ELSE 0 END), 0) AS "selfRevenue",
         COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales') AND jl."costCenterId" = $1
                           THEN jl.debit - jl.credit ELSE 0 END), 0) AS "selfExpense",
         COALESCE(SUM(CASE WHEN ca.type = 'revenue' AND jl."costCenterId" = ANY($3::int[])
                           THEN jl.credit - jl.debit ELSE 0 END), 0) AS "rolledRevenue",
         COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales') AND jl."costCenterId" = ANY($3::int[])
                           THEN jl.debit - jl.credit ELSE 0 END), 0) AS "rolledExpense",
         COUNT(DISTINCT je.id) FILTER (WHERE jl."costCenterId" = $1)::int AS "selfEntries",
         COUNT(DISTINCT je.id) FILTER (WHERE jl."costCenterId" = ANY($3::int[]))::int AS "rolledEntries"
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
       LEFT JOIN chart_of_accounts ca
              ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
       WHERE je."companyId" = $2
         AND je."deletedAt" IS NULL
         AND je.date BETWEEN $4 AND $5
         AND (jl."costCenterId" = $1 OR jl."costCenterId" = ANY($3::int[]))`,
      [id, scope.companyId, allIds, from, to],
    );

    const num = (v: unknown) => Number(v ?? 0);
    const buckets = {
      self: {
        revenue: num(agg?.selfRevenue),
        expense: num(agg?.selfExpense),
        net: num(agg?.selfRevenue) - num(agg?.selfExpense),
        entries: num(agg?.selfEntries),
      },
      rolled: {
        revenue: num(agg?.rolledRevenue),
        expense: num(agg?.rolledExpense),
        net: num(agg?.rolledRevenue) - num(agg?.rolledExpense),
        entries: num(agg?.rolledEntries),
      },
    };

    // Step 4 — recent JEs for the drill list. Limited to 50 most-
    // recent; the UI shows a "see all" link to the journal page.
    const recent = await rawQuery<{
      jeId: number; ref: string; date: string; description: string | null;
      debit: string; credit: string;
    }>(
      `SELECT je.id AS "jeId", je.ref, je.date::text AS date, je.description,
              COALESCE(SUM(jl.debit), 0) AS debit,
              COALESCE(SUM(jl.credit), 0) AS credit
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id AND jl."deletedAt" IS NULL
        WHERE je."companyId" = $1
          AND je."deletedAt" IS NULL
          AND je.date BETWEEN $2 AND $3
          AND jl."costCenterId" = ANY($4::int[])
        GROUP BY je.id, je.ref, je.date, je.description
        ORDER BY je.date DESC, je.id DESC
        LIMIT 50`,
      [scope.companyId, from, to, allIds],
    );

    res.json({
      costCenter: cc,
      dateFrom: from,
      dateTo: to,
      descendantCount: allIds.length - 1, // exclude self
      buckets,
      recentEntries: recent.map((r) => ({
        ...r, debit: Number(r.debit), credit: Number(r.credit),
      })),
    });
  } catch (err) { handleRouteError(err, res, "Cost-centre P&L error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PER-CC MONTHLY TIME-SERIES — mirrors GET /entity-pnl/.../series so
// the per-CC drill page can render the same TrendCard as entity drills.
// Single recursive CTE gathers descendants (so the series rolls up the
// whole sub-tree, matching the existing self/rolled split on the
// drill); the buckets always use the ROLLED set so the chart shows
// the total flow through this CC and everything under it.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/cost-centers/:id/series", authorize({ feature: "finance.cost_centers", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;

    // Default = last 12 months ending today (same convention as the
    // per-entity series — operators frame trends annually).
    const today = new Date();
    const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
      .toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), 1))
      .toISOString().slice(0, 10);
    const from = dateFrom || defaultFrom;
    const to = dateTo || defaultTo;

    // Confirm the CC exists in this tenant (same defence as the drill).
    const [cc] = await rawQuery<{ id: number; code: string | null; name: string }>(
      `SELECT id, code, name FROM cost_centers
        WHERE id = $1 AND "companyId" = $2 AND status != 'deleted'`,
      [id, scope.companyId],
    );
    if (!cc) throw new NotFoundError("مركز التكلفة غير موجود");

    // generate_series + CTE on descendants — single round-trip.
    const rows = await rawQuery<{
      month: string;
      revenue: string;
      expense: string;
      entries: number;
    }>(
      `WITH RECURSIVE tree AS (
         SELECT id FROM cost_centers
          WHERE id = $1 AND "companyId" = $4
         UNION ALL
         SELECT cc.id FROM cost_centers cc
           JOIN tree t ON t.id = cc."parentId"
          WHERE cc."companyId" = $4 AND cc.status != 'deleted'
       ),
       months AS (
         SELECT generate_series(
                  date_trunc('month', $2::date),
                  date_trunc('month', $3::date),
                  interval '1 month'
                )::date AS m
       ),
       agg AS (
         SELECT date_trunc('month', je.date)::date AS m,
                COALESCE(SUM(CASE WHEN ca.type = 'revenue'
                                  THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales')
                                  THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
                COUNT(DISTINCT je.id)::int AS entries
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
           LEFT JOIN chart_of_accounts ca
                  ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
          WHERE je."companyId" = $4
            AND je."deletedAt" IS NULL
            AND je.date BETWEEN $2 AND $3
            AND jl."costCenterId" IN (SELECT id FROM tree)
          GROUP BY 1
       )
       SELECT to_char(months.m, 'YYYY-MM') AS month,
              COALESCE(agg.revenue, 0) AS revenue,
              COALESCE(agg.expense, 0) AS expense,
              COALESCE(agg.entries, 0) AS entries
         FROM months
         LEFT JOIN agg ON agg.m = months.m
        ORDER BY months.m ASC`,
      [id, from, to, scope.companyId],
    );

    const buckets = rows.map((r) => {
      const revenue = Number(r.revenue);
      const expense = Number(r.expense);
      return {
        month: r.month,
        revenue,
        expense,
        net: revenue - expense,
        entries: Number(r.entries),
      };
    });
    const totals = buckets.reduce(
      (acc, b) => ({
        revenue: acc.revenue + b.revenue,
        expense: acc.expense + b.expense,
        net: acc.net + b.net,
        entries: acc.entries + b.entries,
      }),
      { revenue: 0, expense: 0, net: 0, entries: 0 },
    );

    res.json({
      costCenter: cc,
      dateFrom: from,
      dateTo: to,
      buckets,
      totals,
    });
  } catch (err) { handleRouteError(err, res, "Cost-centre series error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PER-CC YEAR-OVER-YEAR — mirrors GET /entity-pnl/.../yoy. Returns
// current + prior-year-same-period buckets (rolled across the CC's
// descendants) plus a server-computed delta. Closes the natural
// "how is this CC doing vs last year?" question.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/cost-centers/:id/yoy", authorize({ feature: "finance.cost_centers", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;

    // Default = year-to-date (Jan 1 → today).
    const today = new Date();
    const defaultFrom = `${today.getUTCFullYear()}-01-01`;
    const defaultTo = today.toISOString().slice(0, 10);
    const currentFrom = dateFrom || defaultFrom;
    const currentTo = dateTo || defaultTo;
    const shiftYear = (iso: string): string => {
      const [yStr, m, d] = iso.split("-");
      const y = Number(yStr) - 1;
      return `${y}-${m}-${d}`;
    };
    const priorFrom = shiftYear(currentFrom);
    const priorTo = shiftYear(currentTo);

    const [cc] = await rawQuery<{ id: number; code: string | null; name: string }>(
      `SELECT id, code, name FROM cost_centers
        WHERE id = $1 AND "companyId" = $2 AND status != 'deleted'`,
      [id, scope.companyId],
    );
    if (!cc) throw new NotFoundError("مركز التكلفة غير موجود");

    // UNION ALL with a recursive CTE for descendants, same shape as
    // the entity YoY query — keeps the round-trip count to 1.
    const aggRows = await rawQuery<{
      period: "current" | "prior";
      revenue: string;
      expense: string;
      entries: number;
    }>(
      `WITH RECURSIVE tree AS (
         SELECT id FROM cost_centers
          WHERE id = $1 AND "companyId" = $6
         UNION ALL
         SELECT cc.id FROM cost_centers cc
           JOIN tree t ON t.id = cc."parentId"
          WHERE cc."companyId" = $6 AND cc.status != 'deleted'
       )
       SELECT 'current' AS period,
              COALESCE(SUM(CASE WHEN ca.type = 'revenue'
                                THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales')
                                THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
              COUNT(DISTINCT je.id)::int AS entries
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
         LEFT JOIN chart_of_accounts ca
                ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
        WHERE je."companyId" = $6
          AND je."deletedAt" IS NULL
          AND je.date BETWEEN $2 AND $3
          AND jl."costCenterId" IN (SELECT id FROM tree)
       UNION ALL
       SELECT 'prior' AS period,
              COALESCE(SUM(CASE WHEN ca.type = 'revenue'
                                THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales')
                                THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
              COUNT(DISTINCT je.id)::int AS entries
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
         LEFT JOIN chart_of_accounts ca
                ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
        WHERE je."companyId" = $6
          AND je."deletedAt" IS NULL
          AND je.date BETWEEN $4 AND $5
          AND jl."costCenterId" IN (SELECT id FROM tree)`,
      [id, currentFrom, currentTo, priorFrom, priorTo, scope.companyId],
    );

    const num = (v: unknown) => Number(v ?? 0);
    const bucketFor = (period: "current" | "prior") => {
      const row = aggRows.find((r) => r.period === period);
      const revenue = num(row?.revenue);
      const expense = num(row?.expense);
      return {
        revenue, expense, net: revenue - expense, entries: num(row?.entries),
      };
    };
    const current = bucketFor("current");
    const prior = bucketFor("prior");
    const pctChange = (cur: number, pri: number): number | null => {
      if (pri === 0) return null;
      return Math.round(((cur - pri) / Math.abs(pri)) * 1000) / 10;
    };

    res.json({
      costCenter: cc,
      current: { dateFrom: currentFrom, dateTo: currentTo, bucket: current },
      prior:   { dateFrom: priorFrom,   dateTo: priorTo,   bucket: prior },
      delta: {
        revenue:    current.revenue - prior.revenue,
        expense:    current.expense - prior.expense,
        net:        current.net - prior.net,
        entries:    current.entries - prior.entries,
        revenuePct: pctChange(current.revenue, prior.revenue),
        expensePct: pctChange(current.expense, prior.expense),
        netPct:     pctChange(current.net, prior.net),
      },
    });
  } catch (err) { handleRouteError(err, res, "Cost-centre YoY error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// COST-CENTRE RANKING — top-N rollup across all CCs (or one branch
// of the tree). Mirrors GET /entity-ranking but ranks cost-centres
// instead of entities. Answers "which CCs are bleeding most cash?"
// or "which projects have the strongest margin this quarter?".
//
// Each row sums revenue/expense across THIS CC + its descendants
// (recursive CTE per row) so the ranking reflects total responsibility.
// That said, the recursion is cheap because the tree typically has a
// shallow depth (3-5 levels). Limit caps at 100.
// ─────────────────────────────────────────────────────────────────────────────
const CC_RANKING_METRICS = new Set(["revenue", "expense", "net", "entries"]);

// ─────────────────────────────────────────────────────────────────────────────
// DIMENSIONAL-ROUTING HEALTH — the operator's «هل النظام المالي
// متأصل في اصل النظام?» single-pane view. For every entity type that
// participates in subsidiary_accounts OR cost_centers we report:
//   - total: how many of this entity exist (live, non-deleted)
//   - linked: how many have a matching subsidiary_accounts row
//   - withCc: how many have a matching cost_centers row
//   - missingAccounts: total - linked  → backfill candidates
//   - missingCcs:      total - withCc  → backfill candidates
//
// The UI consumes this for a coverage dashboard ("3 وكلاء بدون حساب
// مبيعات") and surfaces a one-click backfill against the appropriate
// endpoint (umrah backfill for umrah_*, cost-centre backfill for the
// CC half, accounting-engine for the rest).
// ─────────────────────────────────────────────────────────────────────────────
interface DimensionalHealthRow {
  entityType: string;
  label: string;
  total: number;
  /** Count of entities with at least one subsidiary_accounts mapping. */
  linked: number;
  /** Count of entities with at least one cost_centers mapping. */
  withCc: number;
  missingAccounts: number;
  missingCcs: number;
  /** Helpers for the UI — which endpoint backfills which side. */
  subsidiaryBackfillPath: string | null;
  ccBackfillPath: string | null;
}

router.get("/dimensional-routing/health", authorize({ feature: "finance.cost_centers", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;

    // Each row: an entity type that should be financially routed, the
    // source table, the column name carrying its id in subsidiary_accounts,
    // and the per-side backfill endpoint (null = no backfill exists,
    // operator must use POST /subsidiary-accounts manually).
    type EntitySpec = {
      entityType: string;
      label: string;
      sourceTable: string;
      sourceWhere: string; // soft-delete clause shape, varies per table
      subsidiaryEntityType: string | null;
      ccEntityType: string | null;
      subsidiaryBackfill: string | null;
      ccBackfill: string | null;
    };

    const specs: EntitySpec[] = [
      // Branches — CC only (no subsidiary_account concept).
      { entityType: "branch", label: "الفروع", sourceTable: "branches", sourceWhere: "",
        subsidiaryEntityType: null, ccEntityType: "branch",
        subsidiaryBackfill: null, ccBackfill: "/finance/cost-centers/backfill" },
      // Departments — CC only.
      { entityType: "department", label: "الإدارات", sourceTable: "departments", sourceWhere: "",
        subsidiaryEntityType: null, ccEntityType: "department",
        subsidiaryBackfill: null, ccBackfill: "/finance/cost-centers/backfill" },
      // Projects — CC only.
      { entityType: "project", label: "المشاريع", sourceTable: "projects", sourceWhere: `AND "deletedAt" IS NULL`,
        subsidiaryEntityType: null, ccEntityType: "project",
        subsidiaryBackfill: null, ccBackfill: "/finance/cost-centers/backfill" },
      // Contracts — CC only.
      { entityType: "contract", label: "العقود القانونية", sourceTable: "legal_contracts", sourceWhere: `AND "deletedAt" IS NULL`,
        subsidiaryEntityType: null, ccEntityType: "contract",
        subsidiaryBackfill: null, ccBackfill: "/finance/cost-centers/backfill" },
      // Vehicles — both subsidiary (custody) AND CC (per-vehicle spend).
      { entityType: "vehicle", label: "المركبات", sourceTable: "fleet_vehicles", sourceWhere: `AND "deletedAt" IS NULL`,
        subsidiaryEntityType: "vehicle", ccEntityType: "vehicle",
        subsidiaryBackfill: null, ccBackfill: "/finance/cost-centers/backfill" },
      // Drivers — subsidiary only (cash custody).
      { entityType: "driver", label: "السائقون", sourceTable: "fleet_drivers", sourceWhere: `AND "deletedAt" IS NULL`,
        subsidiaryEntityType: "driver", ccEntityType: null,
        subsidiaryBackfill: null, ccBackfill: null },
      // Umrah agents — both (revenue + cost routing).
      { entityType: "umrah_agent", label: "وكلاء العمرة", sourceTable: "umrah_agents", sourceWhere: `AND "deletedAt" IS NULL`,
        subsidiaryEntityType: "umrah_agent", ccEntityType: null,
        subsidiaryBackfill: "/umrah/backfill-dimensional-accounts", ccBackfill: null },
      // Umrah sub-agents — subsidiary (nested under their agent).
      { entityType: "umrah_sub_agent", label: "الوكلاء الفرعيون", sourceTable: "umrah_sub_agents", sourceWhere: `AND "deletedAt" IS NULL`,
        subsidiaryEntityType: "umrah_sub_agent", ccEntityType: null,
        subsidiaryBackfill: "/umrah/backfill-dimensional-accounts", ccBackfill: null },
      // Umrah seasons — subsidiary (season-wide revenue routing).
      { entityType: "umrah_season", label: "مواسم العمرة", sourceTable: "umrah_seasons", sourceWhere: `AND "deletedAt" IS NULL`,
        subsidiaryEntityType: "umrah_season", ccEntityType: null,
        subsidiaryBackfill: "/umrah/backfill-dimensional-accounts", ccBackfill: null },
    ];

    const rows: DimensionalHealthRow[] = [];
    for (const spec of specs) {
      const [totalRow] = await rawQuery<{ total: number }>(
        `SELECT COUNT(*)::int AS total FROM ${spec.sourceTable}
          WHERE "companyId" = $1 ${spec.sourceWhere}`,
        [scope.companyId],
      );
      const total = Number(totalRow?.total ?? 0);

      // Linked-via-subsidiary count. NULL spec → skip (the side
      // doesn't apply for this entity type).
      let linked = 0;
      if (spec.subsidiaryEntityType) {
        const [r] = await rawQuery<{ linked: number }>(
          `SELECT COUNT(DISTINCT "entityId")::int AS linked
             FROM subsidiary_accounts
            WHERE "companyId" = $1
              AND "entityType" = $2
              AND "isActive" = true
              AND "deletedAt" IS NULL`,
          [scope.companyId, spec.subsidiaryEntityType],
        );
        linked = Number(r?.linked ?? 0);
      }

      let withCc = 0;
      if (spec.ccEntityType) {
        const [r] = await rawQuery<{ withcc: number }>(
          `SELECT COUNT(DISTINCT "relatedEntityId")::int AS withcc
             FROM cost_centers
            WHERE "companyId" = $1
              AND "relatedEntityType" = $2
              AND status != 'deleted'
              AND "deletedAt" IS NULL`,
          [scope.companyId, spec.ccEntityType],
        );
        withCc = Number(r?.withcc ?? 0);
      }

      rows.push({
        entityType: spec.entityType,
        label: spec.label,
        total,
        linked,
        withCc,
        missingAccounts: spec.subsidiaryEntityType ? Math.max(0, total - linked) : 0,
        missingCcs:      spec.ccEntityType         ? Math.max(0, total - withCc) : 0,
        subsidiaryBackfillPath: spec.subsidiaryBackfill,
        ccBackfillPath: spec.ccBackfill,
      });
    }

    // Tenant-level rollup — single tile at the top of the dashboard.
    const totals = rows.reduce(
      (acc, r) => ({
        entities: acc.entities + r.total,
        missingAccounts: acc.missingAccounts + r.missingAccounts,
        missingCcs: acc.missingCcs + r.missingCcs,
      }),
      { entities: 0, missingAccounts: 0, missingCcs: 0 },
    );

    res.json(maskFields(req, { data: rows, totals }));
  } catch (err) { handleRouteError(err, res, "Dimensional-routing health error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PER-ENTITY P&L — the natural payoff of the journal-line dimensional
// enrichment. For any of the 9 routable entities the system enriches
// (client, vendor, employee, vehicle, driver, project, contract,
// umrah_agent, umrah_season), this endpoint returns:
//   - revenue:  SUM(credit - debit) on credit-natured CoA rows
//   - expense:  SUM(debit - credit) on debit-natured CoA rows
//   - net:      revenue - expense
//   - recent:   top 50 JEs touching this entity (drill list)
//
// The query uses journal_lines.<entityField> directly because the
// enrichment guarantees that field is populated on every NEW line and
// the backfill endpoint fills it on historical lines. No joins back
// to source documents needed — drill-down works on the GL itself.
// ─────────────────────────────────────────────────────────────────────────────
const ENTITY_TYPE_TO_JL_COLUMN: Record<string, string> = {
  client:        `"clientId"`,
  vendor:        `"vendorId"`,
  employee:      `"employeeId"`,
  vehicle:       `"vehicleId"`,
  driver:        `"driverId"`,
  project:       `"projectId"`,
  contract:      `"contractId"`,
  umrah_agent:   `"umrahAgentId"`,
  umrah_season:  `"umrahSeasonId"`,
};

const ENTITY_TYPE_TO_NAME_SQL: Record<string, string> = {
  client:        `SELECT name FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
  vendor:        `SELECT name FROM vendors WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
  employee:      `SELECT name FROM employees WHERE id = $1 AND "deletedAt" IS NULL LIMIT 1`,
  vehicle:       `SELECT (make || ' ' || model || ' — ' || "plateNumber") AS name FROM fleet_vehicles WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
  driver:        `SELECT name FROM fleet_drivers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
  project:       `SELECT name FROM projects WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
  contract:      `SELECT title AS name FROM legal_contracts WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
  umrah_agent:   `SELECT name FROM umrah_agents WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
  umrah_season:  `SELECT title AS name FROM umrah_seasons WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
};

router.get("/entity-pnl/:entityType/:entityId", authorize({ feature: "finance.cost_centers", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const entityType = String(req.params.entityType);
    const entityId = parseId(req.params.entityId, "entityId");
    const column = ENTITY_TYPE_TO_JL_COLUMN[entityType];
    const nameSql = ENTITY_TYPE_TO_NAME_SQL[entityType];
    if (!column || !nameSql) {
      throw new ValidationError(`نوع الكيان غير مدعوم: ${entityType}`, { field: "entityType" });
    }

    const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    // Default to all-time when no range given — entity P&L is most
    // useful as a lifetime view, with the operator narrowing on demand.
    const from = dateFrom || "1970-01-01";
    const to = dateTo || "2099-12-31";

    // Confirm the entity exists in the tenant (defence; also surfaces
    // the human-readable name for the UI header).
    const [name] = await rawQuery<{ name: string }>(nameSql, [entityId, scope.companyId]);
    if (!name) throw new NotFoundError("الكيان غير موجود");

    // Two buckets in a single query. SAFE column interpolation — the
    // column comes from a closed map, not user input.
    const [agg] = await rawQuery<{
      revenue: string; expense: string; entries: number;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN ca.type = 'revenue'
                           THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
         COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales')
                           THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
         COUNT(DISTINCT je.id)::int AS entries
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
       LEFT JOIN chart_of_accounts ca
              ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
       WHERE je."companyId" = $1
         AND je."deletedAt" IS NULL
         AND je.date BETWEEN $2 AND $3
         AND jl.${column} = $4`,
      [scope.companyId, from, to, entityId],
    );

    const num = (v: unknown) => Number(v ?? 0);
    const revenue = num(agg?.revenue);
    const expense = num(agg?.expense);

    const recent = await rawQuery<{
      jeId: number; ref: string; date: string; description: string | null;
      debit: string; credit: string;
    }>(
      `SELECT je.id AS "jeId", je.ref, je.date::text AS date, je.description,
              COALESCE(SUM(jl.debit), 0) AS debit,
              COALESCE(SUM(jl.credit), 0) AS credit
         FROM journal_entries je
         JOIN journal_lines jl ON jl."journalId" = je.id AND jl."deletedAt" IS NULL
        WHERE je."companyId" = $1
          AND je."deletedAt" IS NULL
          AND je.date BETWEEN $2 AND $3
          AND jl.${column} = $4
        GROUP BY je.id, je.ref, je.date, je.description
        ORDER BY je.date DESC, je.id DESC
        LIMIT 50`,
      [scope.companyId, from, to, entityId],
    );

    res.json({
      entity: { type: entityType, id: entityId, name: name.name },
      dateFrom: from,
      dateTo: to,
      bucket: { revenue, expense, net: revenue - expense, entries: num(agg?.entries) },
      recentEntries: recent.map((r) => ({ ...r, debit: Number(r.debit), credit: Number(r.credit) })),
    });
  } catch (err) { handleRouteError(err, res, "Entity P&L error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PER-ENTITY TIME-SERIES — month-by-month P&L for one entity.
//
// Same 9-entityType allowlist + closed column map as the drill, so
// any drill page can render a small sparkline + a "monthly trend"
// table side-by-side with no extra resolver code.
//
// Bucketing: PostgreSQL `date_trunc('month', je.date)` produces stable
// YYYY-MM-01 keys. Returns ALL months in [from, to] including months
// with zero activity (via a generate_series LEFT JOIN) so the front-
// end can render a continuous chart without gap-filling logic.
// ─────────────────────────────────────────────────────────────────────────────
router.get("/entity-pnl/:entityType/:entityId/series", authorize({ feature: "finance.cost_centers", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const entityType = String(req.params.entityType);
    const entityId = parseId(req.params.entityId, "entityId");
    const column = ENTITY_TYPE_TO_JL_COLUMN[entityType];
    if (!column) {
      throw new ValidationError(`نوع الكيان غير مدعوم: ${entityType}`, { field: "entityType" });
    }

    const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    // Default to last 12 months ending today (Riyadh calendar). The
    // operator's mental model on a per-entity trend is "the past year"
    // — annual cycles in umrah, retail, fleet maintenance all surface.
    const today = new Date();
    const defaultTo = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0))
      .toISOString().slice(0, 10);
    const defaultFrom = new Date(Date.UTC(today.getUTCFullYear() - 1, today.getUTCMonth(), 1))
      .toISOString().slice(0, 10);
    const from = dateFrom || defaultFrom;
    const to = dateTo || defaultTo;

    // generate_series produces one month per bucket so months with
    // zero activity still appear in the result (chart continuity).
    // Outer LEFT JOIN onto the aggregate ensures the row count equals
    // the month count, not the active-month count.
    const rows = await rawQuery<{
      month: string;
      revenue: string;
      expense: string;
      entries: number;
    }>(
      `WITH months AS (
         SELECT generate_series(
                  date_trunc('month', $2::date),
                  date_trunc('month', $3::date),
                  interval '1 month'
                )::date AS m
       ),
       agg AS (
         SELECT date_trunc('month', je.date)::date AS m,
                COALESCE(SUM(CASE WHEN ca.type = 'revenue'
                                  THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales')
                                  THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
                COUNT(DISTINCT je.id)::int AS entries
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
           LEFT JOIN chart_of_accounts ca
                  ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
          WHERE je."companyId" = $1
            AND je."deletedAt" IS NULL
            AND je.date BETWEEN $2 AND $3
            AND jl.${column} = $4
          GROUP BY 1
       )
       SELECT to_char(months.m, 'YYYY-MM') AS month,
              COALESCE(agg.revenue, 0) AS revenue,
              COALESCE(agg.expense, 0) AS expense,
              COALESCE(agg.entries, 0) AS entries
         FROM months
         LEFT JOIN agg ON agg.m = months.m
        ORDER BY months.m ASC`,
      [scope.companyId, from, to, entityId],
    );

    const buckets = rows.map((r) => {
      const revenue = Number(r.revenue);
      const expense = Number(r.expense);
      return {
        month: r.month,
        revenue,
        expense,
        net: revenue - expense,
        entries: Number(r.entries),
      };
    });

    const totals = buckets.reduce(
      (acc, b) => ({
        revenue: acc.revenue + b.revenue,
        expense: acc.expense + b.expense,
        net: acc.net + b.net,
        entries: acc.entries + b.entries,
      }),
      { revenue: 0, expense: 0, net: 0, entries: 0 },
    );

    res.json({
      entityType,
      entityId,
      dateFrom: from,
      dateTo: to,
      buckets,
      totals,
    });
  } catch (err) { handleRouteError(err, res, "Entity time-series error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// PER-ENTITY YEAR-OVER-YEAR — same shape as the entity-pnl drill but
// returns TWO buckets (current period + prior-year same period) and a
// delta computed server-side. Closes the natural "how am I doing vs
// last year?" question for any customer / agent / vehicle.
//
// The prior period is computed by shifting the current range back by
// exactly one calendar year (preserving the calendar window, not
// rolling 365 days — operators think "vs same month last year",
// not "vs 365 days ago", so this matches the mental model).
// ─────────────────────────────────────────────────────────────────────────────
router.get("/entity-pnl/:entityType/:entityId/yoy", authorize({ feature: "finance.cost_centers", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const entityType = String(req.params.entityType);
    const entityId = parseId(req.params.entityId, "entityId");
    const column = ENTITY_TYPE_TO_JL_COLUMN[entityType];
    if (!column) {
      throw new ValidationError(`نوع الكيان غير مدعوم: ${entityType}`, { field: "entityType" });
    }

    // Default to the year-to-date (Jan 1 → today). This is the
    // most common YoY framing — "this year vs same period last year".
    const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const today = new Date();
    const defaultFrom = `${today.getUTCFullYear()}-01-01`;
    const defaultTo = today.toISOString().slice(0, 10);
    const currentFrom = dateFrom || defaultFrom;
    const currentTo = dateTo || defaultTo;

    // Shift the range back by exactly one year. Using string
    // manipulation rather than Date arithmetic to avoid timezone
    // drift on the boundary days (Riyadh time-zone safe).
    const shiftYear = (iso: string): string => {
      const [yStr, m, d] = iso.split("-");
      const y = Number(yStr) - 1;
      return `${y}-${m}-${d}`;
    };
    const priorFrom = shiftYear(currentFrom);
    const priorTo = shiftYear(currentTo);

    // Two aggregates in ONE query via UNION ALL with a `period`
    // discriminator column. Keeps the round-trip count to 1.
    const aggRows = await rawQuery<{
      period: "current" | "prior";
      revenue: string;
      expense: string;
      entries: number;
    }>(
      `SELECT 'current' AS period,
              COALESCE(SUM(CASE WHEN ca.type = 'revenue'
                                THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales')
                                THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
              COUNT(DISTINCT je.id)::int AS entries
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
         LEFT JOIN chart_of_accounts ca
                ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
        WHERE je."companyId" = $1
          AND je."deletedAt" IS NULL
          AND je.date BETWEEN $2 AND $3
          AND jl.${column} = $6
       UNION ALL
       SELECT 'prior' AS period,
              COALESCE(SUM(CASE WHEN ca.type = 'revenue'
                                THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales')
                                THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
              COUNT(DISTINCT je.id)::int AS entries
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
         LEFT JOIN chart_of_accounts ca
                ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
        WHERE je."companyId" = $1
          AND je."deletedAt" IS NULL
          AND je.date BETWEEN $4 AND $5
          AND jl.${column} = $6`,
      [scope.companyId, currentFrom, currentTo, priorFrom, priorTo, entityId],
    );

    const num = (v: unknown) => Number(v ?? 0);
    const bucketFor = (period: "current" | "prior") => {
      const row = aggRows.find((r) => r.period === period);
      const revenue = num(row?.revenue);
      const expense = num(row?.expense);
      return {
        revenue, expense, net: revenue - expense, entries: num(row?.entries),
      };
    };
    const current = bucketFor("current");
    const prior = bucketFor("prior");

    // Delta — Δ = current - prior. Percentage uses |prior| as the
    // denominator (sign-agnostic so a negative-to-positive flip
    // doesn't render a bogus % drop). Returns null when prior is 0
    // — the front-end shows "—" instead of "+∞%".
    const pctChange = (cur: number, pri: number): number | null => {
      if (pri === 0) return null;
      return Math.round(((cur - pri) / Math.abs(pri)) * 1000) / 10; // 1 decimal
    };

    res.json({
      entityType,
      entityId,
      current: {
        dateFrom: currentFrom,
        dateTo: currentTo,
        bucket: current,
      },
      prior: {
        dateFrom: priorFrom,
        dateTo: priorTo,
        bucket: prior,
      },
      delta: {
        revenue:    current.revenue - prior.revenue,
        expense:    current.expense - prior.expense,
        net:        current.net - prior.net,
        entries:    current.entries - prior.entries,
        revenuePct: pctChange(current.revenue, prior.revenue),
        expensePct: pctChange(current.expense, prior.expense),
        netPct:     pctChange(current.net, prior.net),
      },
    });
  } catch (err) { handleRouteError(err, res, "Entity YoY error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENTITY RANKING — "who are my best/worst customers/vendors/vehicles?"
//
// Top-N rollup across all entities of a given type, ordered by a
// chosen metric. Mirrors the per-entity P&L drill (same allowlist of
// 9 entity types, same revenue/expense classification) but aggregates
// across the whole tenant and ranks the results.
//
// Reuses ENTITY_TYPE_TO_JL_COLUMN — the column to GROUP BY is resolved
// from the same closed map so the entityType path param can never
// inject arbitrary SQL.
//
// The name lookup is a CORRELATED subquery (one per row of the top-N)
// rather than a JOIN because each entity type has a different source
// table; the subquery shape mirrors ENTITY_TYPE_TO_NAME_SQL. Limit
// caps the per-tenant scan at 100 rows so the correlated lookups stay
// cheap.
// ─────────────────────────────────────────────────────────────────────────────
const RANKING_METRICS = new Set(["revenue", "expense", "net", "entries"]);

const ENTITY_TYPE_TO_NAME_LATERAL_SQL: Record<string, string> = {
  client:        `SELECT name FROM clients c WHERE c.id = id_col AND c."companyId" = $1 AND c."deletedAt" IS NULL LIMIT 1`,
  vendor:        `SELECT name FROM vendors v WHERE v.id = id_col AND v."companyId" = $1 AND v."deletedAt" IS NULL LIMIT 1`,
  employee:      `SELECT name FROM employees e WHERE e.id = id_col AND e."deletedAt" IS NULL LIMIT 1`,
  vehicle:       `SELECT (make || ' ' || model || ' — ' || "plateNumber") AS name FROM fleet_vehicles fv WHERE fv.id = id_col AND fv."companyId" = $1 AND fv."deletedAt" IS NULL LIMIT 1`,
  driver:        `SELECT name FROM fleet_drivers fd WHERE fd.id = id_col AND fd."companyId" = $1 AND fd."deletedAt" IS NULL LIMIT 1`,
  project:       `SELECT name FROM projects p WHERE p.id = id_col AND p."companyId" = $1 AND p."deletedAt" IS NULL LIMIT 1`,
  contract:      `SELECT title AS name FROM legal_contracts lc WHERE lc.id = id_col AND lc."companyId" = $1 AND lc."deletedAt" IS NULL LIMIT 1`,
  umrah_agent:   `SELECT name FROM umrah_agents ua WHERE ua.id = id_col AND ua."companyId" = $1 AND ua."deletedAt" IS NULL LIMIT 1`,
  umrah_season:  `SELECT title AS name FROM umrah_seasons us WHERE us.id = id_col AND us."companyId" = $1 AND us."deletedAt" IS NULL LIMIT 1`,
};

router.get("/entity-ranking", authorize({ feature: "finance.cost_centers", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const q = req.query as Record<string, string | undefined>;
    const entityType = String(q.entityType ?? "");
    const metric = String(q.metric ?? "revenue");
    const column = ENTITY_TYPE_TO_JL_COLUMN[entityType];
    const nameLateral = ENTITY_TYPE_TO_NAME_LATERAL_SQL[entityType];
    if (!column || !nameLateral) {
      throw new ValidationError(`نوع الكيان غير مدعوم: ${entityType}`, { field: "entityType" });
    }
    if (!RANKING_METRICS.has(metric)) {
      throw new ValidationError(`المقياس غير مدعوم: ${metric}`, { field: "metric" });
    }

    // Clamp limit [5, 100] to keep correlated name lookups cheap.
    const limit = Math.max(5, Math.min(100, Number(q.limit) > 0 ? Number(q.limit) : 20));
    const from = q.dateFrom || "1970-01-01";
    const to = q.dateTo || "2099-12-31";

    // Direction: revenue / net favour DESC (top earners first), expense
    // also DESC (top spenders), entries DESC (busiest). All DESC by
    // default but `direction=asc` flips for "worst" rankings.
    const direction = q.direction === "asc" ? "ASC" : "DESC";

    // ORDER BY column is mapped from `metric` (also a closed
    // allowlist) — never user input. NULLS LAST so a missing name
    // doesn't push to the top of an ASC ranking.
    const orderCol: Record<string, string> = {
      revenue: "revenue",
      expense: "expense",
      net:     "net",
      entries: "entries",
    };

    const rows = await rawQuery<{
      entityId: number;
      entityName: string | null;
      revenue: string;
      expense: string;
      net: string;
      entries: number;
    }>(
      `WITH agg AS (
         SELECT jl.${column} AS id_col,
                COALESCE(SUM(CASE WHEN ca.type = 'revenue'
                                  THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales')
                                  THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
                COUNT(DISTINCT je.id)::int AS entries
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
           LEFT JOIN chart_of_accounts ca
                  ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
          WHERE je."companyId" = $1
            AND je."deletedAt" IS NULL
            AND je.date BETWEEN $2 AND $3
            AND jl.${column} IS NOT NULL
          GROUP BY jl.${column}
       )
       SELECT id_col AS "entityId",
              (revenue - expense) AS net,
              revenue, expense, entries,
              (${nameLateral}) AS "entityName"
         FROM agg
        ORDER BY ${orderCol[metric]} ${direction} NULLS LAST, id_col ASC
        LIMIT ${limit}`,
      [scope.companyId, from, to],
    );

    // OPTIONAL: prior-period rollup for the same entities. When
    // `includePrior=true`, we compute the same aggregate over the
    // prior calendar-year window — enables per-row anomaly badges on
    // the frontend (delta + % change) without a per-row round-trip.
    //
    // Shifts both `from` and `to` back by exactly one calendar year
    // (same "preserve the calendar window" logic the entity-pnl YoY
    // endpoint uses). Skipped when the top-N is empty.
    let priorRows: Array<{ entityId: number; revenue: number; expense: number; net: number; entries: number }> = [];
    if (q.includePrior === "true" && rows.length > 0) {
      const shiftYear = (iso: string): string => {
        const [yStr, m, d] = iso.split("-");
        return `${Number(yStr) - 1}-${m}-${d}`;
      };
      const priorFrom = shiftYear(from);
      const priorTo = shiftYear(to);
      const ids = rows.map((r) => r.entityId);
      const priorAgg = await rawQuery<{
        entityId: number;
        revenue: string;
        expense: string;
        entries: number;
      }>(
        `SELECT jl.${column} AS "entityId",
                COALESCE(SUM(CASE WHEN ca.type = 'revenue'
                                  THEN jl.credit - jl.debit ELSE 0 END), 0) AS revenue,
                COALESCE(SUM(CASE WHEN ca.type IN ('expense','cost_of_sales')
                                  THEN jl.debit - jl.credit ELSE 0 END), 0) AS expense,
                COUNT(DISTINCT je.id)::int AS entries
           FROM journal_lines jl
           JOIN journal_entries je ON je.id = jl."journalId" AND jl."deletedAt" IS NULL
           LEFT JOIN chart_of_accounts ca
                  ON ca."companyId" = je."companyId" AND ca.code = jl."accountCode"
          WHERE je."companyId" = $1
            AND je."deletedAt" IS NULL
            AND je.date BETWEEN $2 AND $3
            AND jl.${column} = ANY($4::int[])
          GROUP BY jl.${column}`,
        [scope.companyId, priorFrom, priorTo, ids],
      );
      priorRows = priorAgg.map((r) => ({
        entityId: r.entityId,
        revenue: Number(r.revenue),
        expense: Number(r.expense),
        net: Number(r.revenue) - Number(r.expense),
        entries: Number(r.entries),
      }));
    }

    const priorByEntity = new Map(priorRows.map((p) => [p.entityId, p]));

    res.json({
      entityType,
      metric,
      direction: direction.toLowerCase(),
      dateFrom: from,
      dateTo: to,
      limit,
      includePrior: q.includePrior === "true",
      rows: rows.map((r) => {
        const prior = priorByEntity.get(r.entityId) ?? null;
        return {
          entityId: r.entityId,
          entityName: r.entityName,
          revenue: Number(r.revenue),
          expense: Number(r.expense),
          net: Number(r.net),
          entries: Number(r.entries),
          prior: prior
            ? {
                revenue: prior.revenue,
                expense: prior.expense,
                net: prior.net,
                entries: prior.entries,
              }
            : null,
        };
      }),
    });
  } catch (err) { handleRouteError(err, res, "Entity ranking error"); }
});

export { router as costCentersRouter };
