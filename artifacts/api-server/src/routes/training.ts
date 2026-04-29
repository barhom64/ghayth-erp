import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError, ValidationError, NotFoundError } from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { z } from "zod";
import { logger } from "../lib/logger.js";

/* ── Zod Schemas ────────────────────────────────────────────── */

const createProgramSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: z.string().optional(),
  trainer: z.string().optional(),
  capacity: z.coerce.number().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  provider: z.string().optional(),
  duration: z.coerce.number().optional(),
  durationUnit: z.string().optional(),
  cost: z.coerce.number().optional(),
  maxParticipants: z.coerce.number().optional(),
});

const patchProgramSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  location: z.string().optional(),
  trainer: z.string().optional(),
  capacity: z.coerce.number().optional(),
  status: z.string().optional(),
});

const approveSchema = z.object({
  notes: z.string().optional(),
});

const rejectSchema = z.object({
  notes: z.string().min(1),
});

const createEnrollmentSchema = z.object({
  programId: z.coerce.number(),
  employeeId: z.coerce.number().optional(),
  employeeName: z.string().optional(),
  status: z.string().optional(),
});

const patchEnrollmentSchema = z.object({
  status: z.string().optional(),
  score: z.coerce.number().optional(),
});

const router = Router();

router.get("/programs", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM training_programs WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.post("/programs", requirePermission("hr:create"), async (req, res) => {
  try {
    const parsed_createProgramSchema = createProgramSchema.safeParse(req.body);
    if (!parsed_createProgramSchema.success) throw new ValidationError(parsed_createProgramSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_createProgramSchema.data;
    const scope = req.scope!;
    const { title, description, category, startDate, endDate, location, trainer, capacity, status, type, provider, duration, durationUnit, cost, maxParticipants } = body;
    if (!String(title).trim()) {
      throw new ValidationError("عنوان البرنامج التدريبي مطلوب", {
        field: "title",
        fix: "أدخل عنواناً واضحاً للبرنامج",
      });
    }
    if (startDate && endDate && new Date(endDate) < new Date(startDate)) {
      throw new ValidationError("تاريخ الانتهاء قبل تاريخ البداية", {
        field: "endDate",
        fix: "اختر تاريخ انتهاء بعد تاريخ البداية",
      });
    }
    const r = await rawExecute(
      `INSERT INTO training_programs (title, description, category, "startDate", "endDate", location, trainer, capacity, status, "companyId", type, provider, duration, "durationUnit", cost, "maxParticipants") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [String(title).trim(), description ?? null, category ?? null, startDate ?? null, endDate ?? null, location ?? null, trainer ?? null, Number(capacity ?? 0), status ?? "upcoming", scope.companyId, type ?? null, provider ?? null, duration ? Number(duration) : null, durationUnit ?? null, cost ? Number(cost) : 0, maxParticipants ? Number(maxParticipants) : null]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "training_programs", entityId: r.insertId,
      after: { title, category: category ?? null, startDate: startDate ?? null, endDate: endDate ?? null, capacity: Number(capacity ?? 0) },
    }).catch((e) => logger.error(e, "training background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "training.program.created", entity: "training_programs", entityId: r.insertId, details: JSON.stringify({ title, category }) }).catch((e) => logger.error(e, "training background task failed"));
    res.status(201).json({ id: r.insertId, title, status: status ?? "upcoming" });
  } catch (err) { handleRouteError(err, res, "Create training program error:"); }
});

router.get("/programs/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("البرنامج التدريبي غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.patch("/programs/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const parsed_patchProgramSchema = patchProgramSchema.safeParse(req.body);
    if (!parsed_patchProgramSchema.success) throw new ValidationError(parsed_patchProgramSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed_patchProgramSchema.data;
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("البرنامج التدريبي غير موجود");
    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.category !== undefined) { params.push(b.category); sets.push(`category=$${params.length}`); }
    if (b.startDate !== undefined) { params.push(b.startDate); sets.push(`"startDate"=$${params.length}`); }
    if (b.endDate !== undefined) { params.push(b.endDate); sets.push(`"endDate"=$${params.length}`); }
    if (b.location !== undefined) { params.push(b.location); sets.push(`location=$${params.length}`); }
    if (b.trainer !== undefined) { params.push(b.trainer); sets.push(`trainer=$${params.length}`); }
    if (b.capacity !== undefined) { params.push(b.capacity); sets.push(`capacity=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE training_programs SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM training_programs WHERE id=$1 AND "deletedAt" IS NULL`, [id]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "training_programs", entityId: id,
      before: existing, after: b,
    }).catch((e) => logger.error(e, "training background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "training.program.updated", entity: "training_programs", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "training background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.patch("/programs/:id/approve", requirePermission("hr:update"), async (req, res) => {
  try {
    const parsed_approveSchema = approveSchema.safeParse(req.body);
    if (!parsed_approveSchema.success) throw new ValidationError(parsed_approveSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_approveSchema.data;
    const scope = req.scope!;
    const id = Number(req.params.id);
    const row = await applyTransition({
      entity: "training_programs",
      id,
      scope,
      action: "training.program.approved",
      toState: "approved",
      reason: body.notes ?? undefined,
      extraWhere: '"deletedAt" IS NULL',
      onApply: async (_row, client) => {
        try {
          await client.query(
            `INSERT INTO approval_actions ("entityType","entityId",action,notes,"actionBy","companyId") VALUES ('training_program',$1,'approved',$2,$3,$4)`,
            [id, body.notes || null, scope.userId, scope.companyId]
          );
        } catch (e) { logger.error(e, "training error"); }
      },
    });
    res.json({ message: "تم اعتماد البرنامج التدريبي", status: "approved" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Training approve error:");
  }
});

router.patch("/programs/:id/reject", requirePermission("hr:update"), async (req, res) => {
  try {
    const parsed_rejectSchema = rejectSchema.safeParse(req.body);
    if (!parsed_rejectSchema.success) throw new ValidationError(parsed_rejectSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_rejectSchema.data;
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { notes } = body;
    if (!String(notes).trim()) throw new ValidationError("يجب ذكر سبب الرفض", { field: "notes" });
    const row = await applyTransition({
      entity: "training_programs",
      id,
      scope,
      action: "training.program.rejected",
      toState: "rejected",
      reason: notes,
      extraWhere: '"deletedAt" IS NULL',
      onApply: async (_row, client) => {
        try {
          await client.query(
            `INSERT INTO approval_actions ("entityType","entityId",action,notes,"actionBy","companyId") VALUES ('training_program',$1,'rejected',$2,$3,$4)`,
            [id, notes, scope.userId, scope.companyId]
          );
        } catch (e) { logger.error(e, "training error"); }
      },
      after: { notes },
    });
    res.json({ message: "تم رفض البرنامج التدريبي", status: "rejected" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Training reject error:");
  }
});

router.delete("/programs/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("البرنامج التدريبي غير موجود");
    await rawExecute(`UPDATE training_programs SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "training_programs", entityId: id,
      before: existing,
    }).catch((e) => logger.error(e, "training background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "training.program.deleted", entity: "training_programs", entityId: id, details: "{}" }).catch((e) => logger.error(e, "training background task failed"));
    res.json({ message: "تم حذف البرنامج التدريبي بنجاح" });
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.get("/enrollments", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { programId } = req.query;
    let where = `tp."companyId"=$1 AND tp."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (programId) { params.push(programId); where += ` AND e."programId"=$${params.length}`; }
    const rows = await rawQuery(`SELECT e.*, tp.title as "programTitle" FROM training_enrollments e LEFT JOIN training_programs tp ON e."programId"=tp.id WHERE ${where} ORDER BY e."createdAt" DESC`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.post("/enrollments", requirePermission("hr:create"), async (req, res) => {
  try {
    const parsed_createEnrollmentSchema = createEnrollmentSchema.safeParse(req.body);
    if (!parsed_createEnrollmentSchema.success) throw new ValidationError(parsed_createEnrollmentSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_createEnrollmentSchema.data;
    const scope = req.scope!;
    const { programId, employeeId, employeeName, status } = body;
    if (!programId) {
      throw new ValidationError("البرنامج التدريبي مطلوب", {
        field: "programId",
        fix: "اختر برنامجاً تدريبياً من القائمة",
      });
    }
    if (!employeeId && !employeeName) {
      throw new ValidationError("يرجى تحديد الموظف", {
        field: "employeeId",
        fix: "اختر موظفاً من القائمة أو أدخل اسمه",
      });
    }
    const [prog] = await rawQuery<any>(`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [programId, scope.companyId]);
    if (!prog) throw new NotFoundError("البرنامج التدريبي غير موجود");
    if (employeeId) {
      const [emp] = await rawQuery<{ id: number }>(
        `SELECT id FROM employees WHERE id=$1 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(employeeId)]
      );
      if (!emp) {
        throw new ValidationError(`الموظف رقم ${employeeId} غير موجود`, {
          field: "employeeId",
          fix: "اختر موظفاً مسجلاً",
        });
      }
    }
    const r = await rawExecute(
      `INSERT INTO training_enrollments ("programId", "employeeId", "employeeName", status) VALUES ($1,$2,$3,$4)`,
      [Number(programId), employeeId ? Number(employeeId) : null, employeeName ?? null, status ?? "enrolled"]
    );
    await rawExecute(`UPDATE training_programs SET enrolled = enrolled + 1 WHERE id=$1`, [Number(programId)]);
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "training_enrollments", entityId: r.insertId,
      after: { programId: Number(programId), employeeId: employeeId ? Number(employeeId) : null, employeeName: employeeName ?? null, status: status ?? "enrolled" },
    }).catch((e) => logger.error(e, "training background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "training.enrollment.created", entity: "training_enrollments", entityId: r.insertId, details: JSON.stringify({ programId, employeeId }) }).catch((e) => logger.error(e, "training background task failed"));
    res.status(201).json({ id: r.insertId, programId: Number(programId), employeeId: employeeId ?? null, status: status ?? "enrolled" });
  } catch (err) { handleRouteError(err, res, "Create training enrollment error:"); }
});

router.get("/enrollments/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT e.*, tp.title as "programTitle" FROM training_enrollments e LEFT JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) throw new NotFoundError("التسجيل غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.patch("/enrollments/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const parsed_patchEnrollmentSchema = patchEnrollmentSchema.safeParse(req.body);
    if (!parsed_patchEnrollmentSchema.success) throw new ValidationError(parsed_patchEnrollmentSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed_patchEnrollmentSchema.data;
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT e.id FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("التسجيل غير موجود");
    const sets: string[] = [];
    const params: any[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.score !== undefined) { params.push(b.score); sets.push(`score=$${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id);
    await rawExecute(`UPDATE training_enrollments SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM training_enrollments WHERE id=$1`, [id]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "training_enrollments", entityId: id,
      before: existing, after: b,
    }).catch((e) => logger.error(e, "training background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "training.enrollment.updated", entity: "training_enrollments", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "training background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.delete("/enrollments/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT e.id, e."programId" FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("التسجيل غير موجود");
    await rawExecute(`UPDATE training_enrollments SET "deletedAt" = NOW() WHERE id=$1 AND "deletedAt" IS NULL`, [id]);
    await rawExecute(`UPDATE training_programs SET enrolled = GREATEST(0, enrolled - 1) WHERE id=$1 AND "companyId"=$2`, [existing.programId, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "training_enrollments", entityId: id,
      before: existing,
    }).catch((e) => logger.error(e, "training background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "training.enrollment.deleted", entity: "training_enrollments", entityId: id, details: JSON.stringify({ programId: existing.programId }) }).catch((e) => logger.error(e, "training background task failed"));
    res.json({ message: "تم حذف التسجيل بنجاح" });
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.get("/stats", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [programs] = await rawQuery(`SELECT COUNT(*) as count FROM training_programs WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [active] = await rawQuery(`SELECT COUNT(*) as count FROM training_programs WHERE status='active' AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [enrollments] = await rawQuery(`SELECT COUNT(*) as count FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE tp."companyId"=$1 AND tp."deletedAt" IS NULL`, [cid]);
    const [completed] = await rawQuery(`SELECT COUNT(*) as count FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.status='completed' AND tp."companyId"=$1 AND tp."deletedAt" IS NULL`, [cid]);
    res.json({
      totalPrograms: Number(programs.count),
      activePrograms: Number(active.count),
      totalEnrollments: Number(enrollments.count),
      completedEnrollments: Number(completed.count),
    });
  } catch (err) { handleRouteError(err, res, "training"); }
});

export default router;
