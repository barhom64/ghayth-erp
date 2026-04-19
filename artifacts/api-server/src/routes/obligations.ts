import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError, ValidationError } from "../lib/errorHandler.js";
import { rawExecute, rawQuery } from "../lib/rawdb.js";
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

export const obligationsRouter = Router();
obligationsRouter.use(authMiddleware);

const createObligationSchema = z.object({
  entityType: z.string().min(1, "نوع الكيان مطلوب"),
  entityId: z.union([z.number(), z.string()]).transform((v) => Number(v)).refine((v) => v > 0, "معرف الكيان مطلوب"),
  obligationType: z.string().min(1, "نوع الالتزام مطلوب"),
  title: z.string().min(1, "العنوان مطلوب"),
  dueAt: z.string().min(1, "تاريخ الاستحقاق مطلوب"),
  assignedTo: z.number().int().positive().nullable().optional(),
  escalationSteps: z.array(z.any()).optional(),
  metadata: z.record(z.any()).optional(),
  dedupeKey: z.string().optional(),
});

const entityActionSchema = z.object({
  entityType: z.string().min(1, "نوع الكيان مطلوب"),
  entityId: z.union([z.number(), z.string()]).transform((v) => Number(v)).refine((v) => v > 0, "معرف الكيان مطلوب"),
  obligationType: z.string().optional(),
});

// List obligations (filtered)
obligationsRouter.get("/", async (req, res) => {
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

obligationsRouter.get("/summary", async (req, res) => {
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
    if (rows.length === 0) { res.status(404).json({ error: "الالتزام غير موجود" }); return; }
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
    if (rows.length === 0) { res.status(404).json({ error: "الالتزام غير موجود" }); return; }
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
    res.json({ cancelled: n });
  } catch (err) {
    handleRouteError(err, res, "Cancel obligation by entity error:");
  }
});

// Manual trigger for the scanner (normally runs via cron)
obligationsRouter.post("/scan", async (_req, res) => {
  try {
    const result = await scanObligations();
    res.json({ ...result, scannedAt: new Date().toISOString() });
  } catch (err) {
    handleRouteError(err, res, "Obligation scan error:");
  }
});

// Helper: suppress unused import warning
void rawExecute;

export default obligationsRouter;
