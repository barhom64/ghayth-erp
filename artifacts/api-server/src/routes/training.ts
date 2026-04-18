import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError, ValidationError, NotFoundError } from "../lib/errorHandler.js";
import { createAuditLog } from "../lib/businessHelpers.js";

const router = Router();
router.use(authMiddleware);

router.get("/programs", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM training_programs WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.post("/programs", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, description, category, startDate, endDate, location, trainer, capacity, status } = req.body;
    if (!title || !String(title).trim()) {
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
      `INSERT INTO training_programs (title, description, category, "startDate", "endDate", location, trainer, capacity, status, "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [String(title).trim(), description ?? null, category ?? null, startDate ?? null, endDate ?? null, location ?? null, trainer ?? null, Number(capacity ?? 0), status ?? "upcoming", scope.companyId]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "training_programs", entityId: r.insertId,
      after: { title, category: category ?? null, startDate: startDate ?? null, endDate: endDate ?? null, capacity: Number(capacity ?? 0) },
    }).catch(console.error);
    res.status(201).json({ id: r.insertId, title, status: status ?? "upcoming" });
  } catch (err) { handleRouteError(err, res, "Create training program error:"); }
});

router.get("/programs/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "البرنامج التدريبي غير موجود" }); return; }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.patch("/programs/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "البرنامج التدريبي غير موجود" }); return; }
    const b = req.body;
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
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.patch("/programs/:id/approve", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [program] = await rawQuery<any>(`SELECT * FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!program) throw new NotFoundError("البرنامج التدريبي غير موجود");
    await rawExecute(`UPDATE training_programs SET status='approved' WHERE id=$1`, [id]);
    try { await rawExecute(`INSERT INTO approval_actions ("entityType","entityId",action,notes,"actionBy","companyId") VALUES ('training_program',$1,'approved',$2,$3,$4)`, [id, req.body?.notes || null, scope.userId, scope.companyId]); } catch (e) { console.error(e); }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "training_program.approved", entity: "training_programs", entityId: id, before: { status: program.status }, after: { status: "approved" } }).catch(console.error);
    res.json({ message: "تم اعتماد البرنامج التدريبي", status: "approved" });
  } catch (err) { handleRouteError(err, res, "Training approve error:"); }
});

router.patch("/programs/:id/reject", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const { notes } = req.body as any;
    if (!notes || !String(notes).trim()) throw new ValidationError("يجب ذكر سبب الرفض", { field: "notes" });
    const [program] = await rawQuery<any>(`SELECT * FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!program) throw new NotFoundError("البرنامج التدريبي غير موجود");
    await rawExecute(`UPDATE training_programs SET status='rejected' WHERE id=$1`, [id]);
    try { await rawExecute(`INSERT INTO approval_actions ("entityType","entityId",action,notes,"actionBy","companyId") VALUES ('training_program',$1,'rejected',$2,$3,$4)`, [id, notes, scope.userId, scope.companyId]); } catch (e) { console.error(e); }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "training_program.rejected", entity: "training_programs", entityId: id, before: { status: program.status }, after: { status: "rejected" } }).catch(console.error);
    res.json({ message: "تم رفض البرنامج التدريبي", status: "rejected" });
  } catch (err) { handleRouteError(err, res, "Training reject error:"); }
});

router.delete("/programs/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "البرنامج التدريبي غير موجود" }); return; }
    await rawExecute(`DELETE FROM training_programs WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "training_programs", entityId: id,
      before: existing,
    }).catch(console.error);
    res.json({ message: "تم حذف البرنامج التدريبي بنجاح" });
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.get("/enrollments", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { programId } = req.query;
    let where = `tp."companyId"=$1`;
    const params: any[] = [scope.companyId];
    if (programId) { params.push(programId); where += ` AND e."programId"=$${params.length}`; }
    const rows = await rawQuery(`SELECT e.*, tp.title as "programTitle" FROM training_enrollments e LEFT JOIN training_programs tp ON e."programId"=tp.id WHERE ${where} ORDER BY e."createdAt" DESC`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.post("/enrollments", requirePermission("hr:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { programId, employeeId, employeeName, status } = req.body;
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
        `SELECT id FROM employees WHERE id=$1 LIMIT 1`,
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
    }).catch(console.error);
    res.status(201).json({ id: r.insertId, programId: Number(programId), employeeId: employeeId ?? null, status: status ?? "enrolled" });
  } catch (err) { handleRouteError(err, res, "Create training enrollment error:"); }
});

router.get("/enrollments/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT e.*, tp.title as "programTitle" FROM training_enrollments e LEFT JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "التسجيل غير موجود" }); return; }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.patch("/enrollments/:id", requirePermission("hr:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT e.id FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "التسجيل غير موجود" }); return; }
    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.score !== undefined) { params.push(b.score); sets.push(`score=$${params.length}`); }
    if (b.feedback !== undefined) { params.push(b.feedback); sets.push(`feedback=$${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id);
    await rawExecute(`UPDATE training_enrollments SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM training_enrollments WHERE id=$1`, [id]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "training_enrollments", entityId: id,
      before: existing, after: b,
    }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.delete("/enrollments/:id", requirePermission("hr:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT e.id, e."programId" FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "التسجيل غير موجود" }); return; }
    await rawExecute(`DELETE FROM training_enrollments WHERE id=$1`, [id]);
    await rawExecute(`UPDATE training_programs SET enrolled = GREATEST(0, enrolled - 1) WHERE id=$1`, [existing.programId]);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "training_enrollments", entityId: id,
      before: existing,
    }).catch(console.error);
    res.json({ message: "تم حذف التسجيل بنجاح" });
  } catch (err) { handleRouteError(err, res, "training"); }
});

router.get("/stats", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [programs] = await rawQuery(`SELECT COUNT(*) as count FROM training_programs WHERE "companyId"=$1`, [cid]);
    const [active] = await rawQuery(`SELECT COUNT(*) as count FROM training_programs WHERE status='active' AND "companyId"=$1`, [cid]);
    const [enrollments] = await rawQuery(`SELECT COUNT(*) as count FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE tp."companyId"=$1`, [cid]);
    const [completed] = await rawQuery(`SELECT COUNT(*) as count FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.status='completed' AND tp."companyId"=$1`, [cid]);
    res.json({
      totalPrograms: Number(programs.count),
      activePrograms: Number(active.count),
      totalEnrollments: Number(enrollments.count),
      completedEnrollments: Number(completed.count),
    });
  } catch (err) { handleRouteError(err, res, "training"); }
});

export default router;
