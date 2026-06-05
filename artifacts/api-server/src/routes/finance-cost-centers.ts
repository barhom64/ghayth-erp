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
  entityType: z.enum(["branch", "project"]).optional(),
  entityId: z.coerce.number().int().positive().optional(),
});

router.post("/cost-centers/backfill", authorize({ feature: "finance.cost_centers", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(backfillCostCentersSchema.safeParse(req.body));
    const onlyType = body.entityType;
    const onlyId = body.entityId;

    const summary = { branches: 0, projects: 0, created: 0, reused: 0 };
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

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "cost_center.backfill", entity: "cost_centers", entityId: 0,
      after: { summary, filters: body },
    });
    res.json({ summary, details });
  } catch (err) { handleRouteError(err, res, "Backfill cost centers error"); }
});

export { router as costCentersRouter };
