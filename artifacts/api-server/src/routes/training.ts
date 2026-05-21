import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { z } from "zod";
import { logger } from "../lib/logger.js";

// Local row shapes — training_programs / training_enrollments not in
// @workspace/db Drizzle schema.

interface TrainingProgramRow extends Record<string, unknown> {
  id: number;
  companyId: number;
  title: string;
  type?: string | null;
  description?: string | null;
  provider?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  duration?: number | null;
  cost?: number | string | null;
  capacity?: number | null;
  status: string;
  createdBy?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

interface TrainingEnrollmentRow extends Record<string, unknown> {
  id: number;
  programId: number;
  employeeId?: number | null;
  assignmentId?: number | null;
  status: string;
  completedAt?: string | null;
  score?: number | string | null;
  createdAt: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
  programTitle?: string | null;
}

const VALID_PROGRAM_TRANSITIONS: Record<string, string[]> = {
  upcoming: ["draft", "active", "cancelled"],
  draft: ["pending", "cancelled"],
  pending: ["approved", "rejected"],
  approved: ["active", "cancelled"],
  rejected: ["draft"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: ["draft"],
};

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
  objectives: z.string().optional(),
  targetAudience: z.string().optional(),
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

router.get("/programs", authorize({ feature: "hr.training", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM training_programs WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.post("/programs", authorize({ feature: "hr.training", action: "create" }), async (req, res) => {
  try {
    const body = zodParse(createProgramSchema.safeParse(req.body));
    const scope = req.scope!;
    const { title, description, category, startDate, endDate, location, trainer, capacity, status, type, provider, duration, durationUnit, cost, maxParticipants, objectives, targetAudience } = body;
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
      `INSERT INTO training_programs (title, description, category, "startDate", "endDate", location, trainer, capacity, status, "companyId", type, provider, duration, "durationUnit", cost, "maxParticipants", objectives, "targetAudience") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [String(title).trim(), description ?? null, category ?? null, startDate ?? null, endDate ?? null, location ?? null, trainer ?? null, Number(capacity ?? 0), status ?? "upcoming", scope.companyId, type ?? null, provider ?? null, duration ? Number(duration) : null, durationUnit ?? null, cost ? Number(cost) : 0, maxParticipants ? Number(maxParticipants) : null, objectives ?? null, targetAudience ?? null]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "training_programs", entityId: r.insertId,
      after: { title, category: category ?? null, startDate: startDate ?? null, endDate: endDate ?? null, capacity: Number(capacity ?? 0) },
    }).catch((e) => logger.error(e, "training background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "training.program.created", entity: "training_programs", entityId: r.insertId, details: JSON.stringify({ title, category }) }).catch((e) => logger.error(e, "training background task failed"));
    const [row] = await rawQuery<TrainingProgramRow>(`SELECT * FROM training_programs WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, title, status: status ?? "upcoming" });
  } catch (err) { handleRouteError(err, res, "Create training program error:"); }
});

router.get("/programs/:id", authorize({ feature: "hr.training", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<TrainingProgramRow>(`SELECT * FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("البرنامج التدريبي غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.patch("/programs/:id", authorize({ feature: "hr.training", action: "update" }), async (req, res) => {
  try {
    const b = zodParse(patchProgramSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number; status: string }>(`SELECT id, status FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("البرنامج التدريبي غير موجود");
    if (b.status && b.status !== existing.status) {
      const allowed = VALID_PROGRAM_TRANSITIONS[existing.status];
      if (allowed && !allowed.includes(b.status)) {
        throw new ConflictError(`لا يمكن نقل البرنامج من "${existing.status}" إلى "${b.status}"`);
      }
    }
    const sets: string[] = [];
    const params: unknown[] = [];
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
    let updateWhere = `id=$${params.length - 1} AND "companyId"=$${params.length}`;
    if (b.status && b.status !== existing.status) {
      params.push(existing.status);
      updateWhere += ` AND status=$${params.length}`;
    }
    await rawExecute(`UPDATE training_programs SET ${sets.join(",")} WHERE ${updateWhere} AND "deletedAt" IS NULL`, params);
    const [row] = await rawQuery<TrainingProgramRow>(`SELECT * FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "training_programs", entityId: id,
      before: existing, after: b,
    }).catch((e) => logger.error(e, "training background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "training.program.updated", entity: "training_programs", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "training background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.patch("/programs/:id/approve", authorize({ feature: "hr.training", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(approveSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
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

router.patch("/programs/:id/reject", authorize({ feature: "hr.training", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(rejectSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
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

router.delete("/programs/:id", authorize({ feature: "hr.training", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number }>(`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
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

router.get("/enrollments", authorize({ feature: "hr.training", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { programId } = req.query;
    let where = `tp."companyId"=$1 AND tp."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (programId) { params.push(programId); where += ` AND e."programId"=$${params.length}`; }
    const rows = await rawQuery(`SELECT e.*, tp.title as "programTitle" FROM training_enrollments e LEFT JOIN training_programs tp ON e."programId"=tp.id WHERE ${where} ORDER BY e."createdAt" DESC LIMIT 500`, params);
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.post("/enrollments", authorize({ feature: "hr.training", action: "create" }), async (req, res) => {
  try {
    const body = zodParse(createEnrollmentSchema.safeParse(req.body));
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
    const [prog] = await rawQuery<{ id: number }>(`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [programId, scope.companyId]);
    if (!prog) throw new NotFoundError("البرنامج التدريبي غير موجود");
    if (employeeId) {
      const [emp] = await rawQuery<{ id: number }>(
        `SELECT e.id FROM employees e JOIN employee_assignments ea ON ea."employeeId" = e.id WHERE e.id = $1 AND ea."companyId" = $2 AND e."deletedAt" IS NULL AND ea.status = 'active' LIMIT 1`,
        [Number(employeeId), scope.companyId]
      );
      if (!emp) {
        throw new ValidationError(`الموظف رقم ${employeeId} غير موجود`, {
          field: "employeeId",
          fix: "اختر موظفاً مسجلاً",
        });
      }
    }
    let enrollId!: number;
    await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO training_enrollments ("programId", "employeeId", "employeeName", status) VALUES ($1,$2,$3,$4) RETURNING id`,
        [Number(programId), employeeId ? Number(employeeId) : null, employeeName ?? null, status ?? "enrolled"]
      );
      enrollId = ins.rows[0].id;
      await client.query(`UPDATE training_programs SET enrolled = enrolled + 1 WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [Number(programId), scope.companyId]);
    });
    const r = { insertId: enrollId };
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "training_enrollments", entityId: r.insertId,
      after: { programId: Number(programId), employeeId: employeeId ? Number(employeeId) : null, employeeName: employeeName ?? null, status: status ?? "enrolled" },
    }).catch((e) => logger.error(e, "training background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "training.enrollment.created", entity: "training_enrollments", entityId: r.insertId, details: JSON.stringify({ programId, employeeId }) }).catch((e) => logger.error(e, "training background task failed"));
    const [row] = await rawQuery<TrainingEnrollmentRow>(`SELECT e.* FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, programId: Number(programId), employeeId: employeeId ?? null, status: status ?? "enrolled" });
  } catch (err) { handleRouteError(err, res, "Create training enrollment error:"); }
});

router.get("/enrollments/:id", authorize({ feature: "hr.training", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<TrainingEnrollmentRow>(`SELECT e.*, tp.title as "programTitle" FROM training_enrollments e LEFT JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2 AND e."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("التسجيل غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.patch("/enrollments/:id", authorize({ feature: "hr.training", action: "update" }), async (req, res) => {
  try {
    const b = zodParse(patchEnrollmentSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number }>(`SELECT e.id FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("التسجيل غير موجود");
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.score !== undefined) { params.push(b.score); sets.push(`score=$${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id);
    params.push(scope.companyId);
    await rawExecute(`UPDATE training_enrollments SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "deletedAt" IS NULL AND "programId" IN (SELECT id FROM training_programs WHERE "companyId"=$${params.length})`, params);
    const [row] = await rawQuery<TrainingEnrollmentRow>(`SELECT e.* FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2 AND e."deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "training_enrollments", entityId: id,
      before: existing, after: b,
    }).catch((e) => logger.error(e, "training background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "training.enrollment.updated", entity: "training_enrollments", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "training background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.delete("/enrollments/:id", authorize({ feature: "hr.training", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number; programId: number }>(`SELECT e.id, e."programId" FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("التسجيل غير موجود");
    await withTransaction(async (client) => {
      await client.query(`UPDATE training_enrollments SET "deletedAt" = NOW() WHERE id=$1 AND "deletedAt" IS NULL`, [id]);
      await client.query(`UPDATE training_programs SET enrolled = GREATEST(0, enrolled - 1) WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [existing.programId, scope.companyId]);
    });
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "training_enrollments", entityId: id,
      before: existing,
    }).catch((e) => logger.error(e, "training background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "training.enrollment.deleted", entity: "training_enrollments", entityId: id, details: JSON.stringify({ programId: existing.programId }) }).catch((e) => logger.error(e, "training background task failed"));
    res.json({ message: "تم حذف التسجيل بنجاح" });
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.get("/stats", authorize({ feature: "hr.training", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [[programs], [active], [enrollments], [completed]] = await Promise.all([
      rawQuery(`SELECT COUNT(*) as count FROM training_programs WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM training_programs WHERE status='active' AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE tp."companyId"=$1 AND tp."deletedAt" IS NULL AND e."deletedAt" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.status='completed' AND tp."companyId"=$1 AND tp."deletedAt" IS NULL AND e."deletedAt" IS NULL`, [cid]),
    ]);
    res.json(maskFields(req, {
      totalPrograms: Number(programs.count),
      activePrograms: Number(active.count),
      totalEnrollments: Number(enrollments.count),
      completedEnrollments: Number(completed.count),
    }));
  } catch (err) { handleRouteError(err, res, "training"); }
});

export default router;
