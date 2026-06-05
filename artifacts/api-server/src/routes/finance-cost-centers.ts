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
  allocatedAmount: z.coerce.number().optional(),
});

const updateCostCenterSchema = z.object({
  name: z.string().min(1).optional(),
  code: z.string().nullable().optional(),
  type: z.string().optional(),
  parentId: z.coerce.number().nullable().optional(),
  allocatedAmount: z.coerce.number().optional(),
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
              (SELECT COALESCE(SUM(jl.debit - jl.credit), 0)
                 FROM journal_lines jl
                 JOIN journal_entries je ON je.id = jl."journalId"
                WHERE je."companyId" = $1
                  AND je."deletedAt" IS NULL
                  AND jl."costCenterId" = t.id) AS "descendantSpend"
         FROM tree t
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
    const rows = await rawQuery<CostCenterListRow>(
      `SELECT cc.*,
              CASE WHEN cc."relatedEntityType" = 'project' THEN (SELECT name FROM projects WHERE id = cc."relatedEntityId" AND "companyId" = cc."companyId" AND "deletedAt" IS NULL LIMIT 1)
                   WHEN cc."relatedEntityType" = 'vehicle' THEN (SELECT "plateNumber" FROM fleet_vehicles WHERE id = cc."relatedEntityId" AND "companyId" = cc."companyId" AND "deletedAt" IS NULL LIMIT 1)
                   WHEN cc."relatedEntityType" = 'employee' THEN (SELECT e.name FROM employees e JOIN employee_assignments ea ON ea."employeeId"=e.id WHERE e.id = cc."relatedEntityId" AND ea."companyId" = cc."companyId" AND e."deletedAt" IS NULL LIMIT 1)
                   WHEN cc."relatedEntityType" = 'department' THEN (SELECT name FROM departments WHERE id = cc."relatedEntityId" AND "companyId" = cc."companyId" LIMIT 1)
                   WHEN cc."relatedEntityType" = 'branch' THEN (SELECT name FROM branches WHERE id = cc."relatedEntityId" AND "companyId" = cc."companyId" LIMIT 1)
                   ELSE NULL
              END AS "relatedEntityName"
       FROM cost_centers cc
       WHERE ${where}
       ORDER BY cc.code, cc.name
       LIMIT 1000`,
      params,
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "List cost centers error"); }
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
  entityType: z.enum(["branch", "project", "contract", "vehicle"]).optional(),
  entityId: z.coerce.number().int().positive().optional(),
});

router.post("/cost-centers/backfill", authorize({ feature: "finance.cost_centers", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(backfillCostCentersSchema.safeParse(req.body));
    const onlyType = body.entityType;
    const onlyId = body.entityId;

    const summary = { branches: 0, projects: 0, contracts: 0, vehicles: 0, created: 0, reused: 0 };
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

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "cost_center.backfill", entity: "cost_centers", entityId: 0,
      after: { summary, filters: body },
    });
    res.json({ summary, details });
  } catch (err) { handleRouteError(err, res, "Backfill cost centers error"); }
});

export { router as costCentersRouter };
