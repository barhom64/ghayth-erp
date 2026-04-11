import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();
router.use(authMiddleware);

router.get("/programs", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM training_programs WHERE "companyId"=$1 ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/programs", async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, description, category, startDate, endDate, location, trainer, capacity, status } = req.body;
    const r = await rawExecute(
      `INSERT INTO training_programs (title, description, category, "startDate", "endDate", location, trainer, capacity, status, "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [title, description, category, startDate, endDate, location, trainer, capacity || 0, status || "upcoming", scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/programs/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM training_programs WHERE id=$1 AND "companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "البرنامج التدريبي غير موجود" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/programs/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
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
    const [row] = await rawQuery<any>(`SELECT * FROM training_programs WHERE id=$1`, [id]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/programs/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "البرنامج التدريبي غير موجود" }); return; }
    await rawExecute(`DELETE FROM training_programs WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف البرنامج التدريبي بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/enrollments", async (req, res) => {
  try {
    const scope = req.scope!;
    const { programId } = req.query;
    let where = `tp."companyId"=$1`;
    const params: any[] = [scope.companyId];
    if (programId) { params.push(programId); where += ` AND e."programId"=$${params.length}`; }
    const rows = await rawQuery(`SELECT e.*, tp.title as "programTitle" FROM training_enrollments e LEFT JOIN training_programs tp ON e."programId"=tp.id WHERE ${where} ORDER BY e."createdAt" DESC`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/enrollments", async (req, res) => {
  try {
    const scope = req.scope!;
    const { programId, employeeId, employeeName, status } = req.body;
    const [prog] = await rawQuery<any>(`SELECT id FROM training_programs WHERE id=$1 AND "companyId"=$2`, [programId, scope.companyId]);
    if (!prog) { res.status(404).json({ error: "البرنامج التدريبي غير موجود" }); return; }
    const r = await rawExecute(
      `INSERT INTO training_enrollments ("programId", "employeeId", "employeeName", status) VALUES ($1,$2,$3,$4)`,
      [programId, employeeId, employeeName, status || "enrolled"]
    );
    await rawExecute(`UPDATE training_programs SET enrolled = enrolled + 1 WHERE id=$1`, [programId]);
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/enrollments/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT e.*, tp.title as "programTitle" FROM training_enrollments e LEFT JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "التسجيل غير موجود" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/enrollments/:id", async (req, res) => {
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
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/enrollments/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT e.id, e."programId" FROM training_enrollments e JOIN training_programs tp ON e."programId"=tp.id WHERE e.id=$1 AND tp."companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "التسجيل غير موجود" }); return; }
    await rawExecute(`DELETE FROM training_enrollments WHERE id=$1`, [id]);
    await rawExecute(`UPDATE training_programs SET enrolled = GREATEST(0, enrolled - 1) WHERE id=$1`, [existing.programId]);
    res.json({ message: "تم حذف التسجيل بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/stats", async (req, res) => {
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
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
