import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

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
    const rows = await rawQuery<any>(
      `SELECT cc.*,
              CASE WHEN cc."relatedEntityType" = 'project' THEN (SELECT name FROM projects WHERE id = cc."relatedEntityId" AND "companyId" = $1 AND "deletedAt" IS NULL LIMIT 1)
                   WHEN cc."relatedEntityType" = 'vehicle' THEN (SELECT "plateNumber" FROM fleet_vehicles WHERE id = cc."relatedEntityId" AND "companyId" = $1 AND "deletedAt" IS NULL LIMIT 1)
                   WHEN cc."relatedEntityType" = 'employee' THEN (SELECT e.name FROM employees e JOIN employee_assignments ea ON ea."employeeId"=e.id WHERE e.id = cc."relatedEntityId" AND ea."companyId" = $1 AND e."deletedAt" IS NULL LIMIT 1)
                   WHEN cc."relatedEntityType" = 'department' THEN (SELECT name FROM departments WHERE id = cc."relatedEntityId" AND "companyId" = $1 LIMIT 1)
                   WHEN cc."relatedEntityType" = 'branch' THEN (SELECT name FROM branches WHERE id = cc."relatedEntityId" AND "companyId" = $1 LIMIT 1)
                   ELSE NULL
              END AS "relatedEntityName"
       FROM cost_centers cc
       WHERE cc."companyId" = $1 AND cc.status != 'deleted'
       ORDER BY cc.code, cc.name
       LIMIT 1000`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "List cost centers error"); }
});

router.get("/cost-centers/:id", authorize({ feature: "finance.cost_centers", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT * FROM cost_centers WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("مركز التكلفة غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get cost center error"); }
});

router.post("/cost-centers", authorize({ feature: "finance.cost_centers", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(createCostCenterSchema.safeParse(req.body));
    const { code, name, type, parentId, relatedEntityType, relatedEntityId, allocatedAmount } = parsed;

    const [existing] = code
      ? await rawQuery<any>(
          `SELECT id FROM cost_centers WHERE "companyId" = $1 AND code = $2 AND status != 'deleted'`,
          [scope.companyId, code]
        )
      : [];
    if (existing) throw new ValidationError("رمز مركز التكلفة مستخدم بالفعل", { field: "code" });

    const [row] = await rawQuery<any>(
      `INSERT INTO cost_centers ("companyId", code, name, type, "parentId", "relatedEntityType", "relatedEntityId", "allocatedAmount")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
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
    const [existing] = await rawQuery<any>(
      `SELECT * FROM cost_centers WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("مركز التكلفة غير موجود");

    const parsed = zodParse(updateCostCenterSchema.safeParse(req.body));
    const { name, code, type, parentId, allocatedAmount, status } = parsed;
    const sets: string[] = [];
    const params: any[] = [];
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
    const [row] = await rawQuery<any>(
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

export { router as costCentersRouter };
