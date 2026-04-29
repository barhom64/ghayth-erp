import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError, ValidationError, NotFoundError } from "../lib/errorHandler.js";
import { rawQuery } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { emitEvent } from "../lib/businessHelpers.js";
import {
  ensureObligationsTable,
  queryObligations,
  obligationSummary,
  scanObligations,
  registerObligation,
  markObligationMet,
  cancelObligation,
  type ObligationStatus,
  type ObligationType,
} from "../lib/obligationsEngine.js";
import { logger } from "../lib/logger.js";

export const obligationsRouter = Router();
obligationsRouter.use(authMiddleware);

const createObligationSchema = z.object({
  entityType: z.string().min(1, "نوع الكيان مطلوب"),
  entityId: z.union([z.coerce.number(), z.string()]).transform((v) => Number(v)).refine((v) => v > 0, "معرف الكيان مطلوب"),
  obligationType: z.string().min(1, "نوع الالتزام مطلوب"),
  title: z.string().min(1, "العنوان مطلوب"),
  dueAt: z.string().min(1, "تاريخ الاستحقاق مطلوب"),
  assignedTo: z.coerce.number().int().positive().nullable().optional(),
  escalationSteps: z.array(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  dedupeKey: z.string().optional(),
});

const entityActionSchema = z.object({
  entityType: z.string().min(1, "نوع الكيان مطلوب"),
  entityId: z.union([z.coerce.number(), z.string()]).transform((v) => Number(v)).refine((v) => v > 0, "معرف الكيان مطلوب"),
  obligationType: z.string().optional(),
});

// List obligations (filtered)
obligationsRouter.get("/", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { entityType, entityId, status, assignedTo, dueBefore, dueAfter, limit } = req.query as any;
    const statuses: ObligationStatus[] | undefined = status
      ? String(status).split(",").filter(Boolean) as ObligationStatus[]
      : undefined;
    const rows = await queryObligations({
      companyId: scope.companyId,
      entityType,
      entityId: entityId ? Number(entityId) : undefined,
      status: statuses,
      assignedTo: assignedTo ? Number(assignedTo) : undefined,
      dueBefore,
      dueAfter,
      limit: limit ? Number(limit) : undefined,
    });
    res.json({ data: rows, count: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List obligations error:");
  }
});

obligationsRouter.get("/summary", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const summary = await obligationSummary(scope.companyId);
    res.json(summary);
  } catch (err) {
    handleRouteError(err, res, "Obligation summary error:");
  }
});

// Manually create an obligation (useful for ad-hoc reminders)
obligationsRouter.post("/", async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createObligationSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { entityType, entityId, obligationType, title, dueAt, assignedTo, escalationSteps, metadata, dedupeKey } = parsed.data;
    const id = await registerObligation({
      companyId: scope.companyId,
      branchId: scope.branchId,
      entityType,
      entityId,
      obligationType: obligationType as ObligationType,
      title,
      dueAt,
      assignedTo: assignedTo ?? null,
      escalationSteps,
      metadata,
      dedupeKey,
    });
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "obligation.created", entity: "obligations", entityId: id, details: JSON.stringify({ entityType, entityId, obligationType, title, dueAt }) }).catch((e) => logger.error(e, "obligations background task failed"));
    res.status(201).json({ id });
  } catch (err) {
    handleRouteError(err, res, "Create obligation error:");
  }
});

// Mark as met (called when underlying event happens)
obligationsRouter.post("/:id/met", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    await ensureObligationsTable();
    const rows = await rawQuery<any>(
      `UPDATE obligations SET status='met', "metAt"=NOW(), "updatedAt"=NOW()
       WHERE id=$1 AND "companyId"=$2 RETURNING id, status`,
      [id, scope.companyId]
    );
    if (rows.length === 0) throw new NotFoundError("الالتزام غير موجود");
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "obligation.met", entity: "obligations", entityId: id, details: JSON.stringify({ status: "met" }) }).catch((e) => logger.error(e, "obligations background task failed"));
    res.json(rows[0]);
  } catch (err) {
    handleRouteError(err, res, "Mark obligation met error:");
  }
});

// Mark as met by entity (used internally by event handlers)
obligationsRouter.post("/met-by-entity", async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = entityActionSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { entityType, entityId, obligationType } = parsed.data;
    const n = await markObligationMet(
      scope.companyId,
      entityType,
      entityId,
      obligationType as ObligationType | undefined
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "obligation.met_by_entity", entity: "obligations", entityId: entityId, details: JSON.stringify({ entityType, entityId, obligationType, marked: n }) }).catch((e) => logger.error(e, "obligations background task failed"));
    res.json({ marked: n });
  } catch (err) {
    handleRouteError(err, res, "Mark obligation met by entity error:");
  }
});

obligationsRouter.post("/:id/cancel", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    await ensureObligationsTable();
    const rows = await rawQuery<any>(
      `UPDATE obligations SET status='cancelled', "updatedAt"=NOW()
       WHERE id=$1 AND "companyId"=$2 RETURNING id, status`,
      [id, scope.companyId]
    );
    if (rows.length === 0) throw new NotFoundError("الالتزام غير موجود");
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "obligation.cancelled", entity: "obligations", entityId: id, details: JSON.stringify({ status: "cancelled" }) }).catch((e) => logger.error(e, "obligations background task failed"));
    res.json(rows[0]);
  } catch (err) {
    handleRouteError(err, res, "Cancel obligation error:");
  }
});

obligationsRouter.post("/cancel-by-entity", async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = entityActionSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { entityType, entityId, obligationType } = parsed.data;
    const n = await cancelObligation(
      scope.companyId,
      entityType,
      entityId,
      obligationType as ObligationType | undefined
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "obligation.cancelled_by_entity", entity: "obligations", entityId: entityId, details: JSON.stringify({ entityType, entityId, obligationType, cancelled: n }) }).catch((e) => logger.error(e, "obligations background task failed"));
    res.json({ cancelled: n });
  } catch (err) {
    handleRouteError(err, res, "Cancel obligation by entity error:");
  }
});

// Manual trigger for the scanner (normally runs via cron)
obligationsRouter.post("/scan", requirePermission("operations:create"), async (_req, res) => {
  try {
    const result = await scanObligations();
    emitEvent({ companyId: 0, userId: null, action: "obligation.scan_triggered", entity: "obligations", entityId: 0, details: JSON.stringify(result) }).catch((e) => logger.error(e, "obligations background task failed"));
    res.json({ ...result, scannedAt: new Date().toISOString() });
  } catch (err) {
    handleRouteError(err, res, "Obligation scan error:");
  }
});

export default obligationsRouter;
