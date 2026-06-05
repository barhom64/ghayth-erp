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
             JOIN journal_entries je ON je.id = jl."journalId"
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
           JOIN journal_entries je ON je.id = jl."journalId"
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
             JOIN journal_entries je ON je.id = jl."journalId"
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
             JOIN journal_entries je ON je.id = jl."journalId"
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
       JOIN journal_entries je ON je.id = jl."journalId"
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
         JOIN journal_lines jl ON jl."journalId" = je.id
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
       JOIN journal_entries je ON je.id = jl."journalId"
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
         JOIN journal_lines jl ON jl."journalId" = je.id
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

export { router as costCentersRouter };
