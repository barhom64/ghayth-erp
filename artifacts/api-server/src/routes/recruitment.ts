import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { handleRouteError } from "../lib/errorHandler.js";

const router = Router();
router.use(authMiddleware);

router.get("/postings", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM job_postings WHERE "companyId"=$1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/postings", async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, department, location, type, description, requirements, salaryMin, salaryMax, status, closingDate } = req.body;
    const r = await rawExecute(
      `INSERT INTO job_postings (title, department, location, type, description, requirements, "salaryMin", "salaryMax", status, "closingDate", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [title, department, location, type || "full-time", description, requirements, salaryMin, salaryMax, status || "open", closingDate, scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/postings/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM job_postings WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "الإعلان الوظيفي غير موجود" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/postings/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.department !== undefined) { params.push(b.department); sets.push(`department=$${params.length}`); }
    if (b.location !== undefined) { params.push(b.location); sets.push(`location=$${params.length}`); }
    if (b.type !== undefined) { params.push(b.type); sets.push(`type=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.requirements !== undefined) { params.push(b.requirements); sets.push(`requirements=$${params.length}`); }
    if (b.salaryMin !== undefined) { params.push(b.salaryMin); sets.push(`"salaryMin"=$${params.length}`); }
    if (b.salaryMax !== undefined) { params.push(b.salaryMax); sets.push(`"salaryMax"=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.closingDate !== undefined) { params.push(b.closingDate); sets.push(`"closingDate"=$${params.length}`); }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE job_postings SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    if (result.affectedRows === 0) { res.status(404).json({ error: "الإعلان الوظيفي غير موجود" }); return; }
    const [row] = await rawQuery<any>(`SELECT * FROM job_postings WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// Close a job posting with cascade to open applications + candidate notifications.
router.post("/postings/:id/close", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const reason = (req.body?.reason as string | undefined)?.trim();
    if (!reason) {
      res.status(400).json({ error: "سبب الإغلاق مطلوب", field: "reason" });
      return;
    }
    const updated = await applyTransition({
      entity: "job_postings",
      id,
      scope,
      action: "recruitment.job.closed",
      fromStates: ["open", "draft", "paused"],
      toState: "closed",
      reason,
      setExtras: {
        closedAt: { raw: "NOW()" },
        closedReason: reason,
      },
      after: { closedReason: reason },
      onApply: async (_row, client) => {
        // Cascade: withdraw applications still in the pipeline.
        await client.query(
          `UPDATE job_applications
              SET status = 'withdrawn_due_to_job_closure',
                  notes  = COALESCE(notes || E'\n', '') || $2,
                  "updatedAt" = NOW()
            WHERE "postingId" = $1
              AND status NOT IN ('hired', 'rejected', 'withdrawn', 'withdrawn_due_to_job_closure')`,
          [id, `تم إغلاق الإعلان الوظيفي: ${reason}`]
        );
      },
    });
    res.json({ ...updated, event: "recruitment.job.closed" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Close job posting error:");
  }
});

// Reopen a previously closed job posting.
router.post("/postings/:id/reopen", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const updated = await applyTransition({
      entity: "job_postings",
      id,
      scope,
      action: "recruitment.job.reopened",
      fromStates: ["closed", "paused"],
      toState: "open",
      setExtras: {
        reopenedAt: { raw: "NOW()" },
        closedAt: null,
        closedReason: null,
      },
    });
    res.json({ ...updated, event: "recruitment.job.reopened" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Reopen job posting error:");
  }
});

router.delete("/postings/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const result = await rawExecute(`DELETE FROM job_postings WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (result.affectedRows === 0) { res.status(404).json({ error: "الإعلان الوظيفي غير موجود" }); return; }
    res.json({ message: "تم حذف الإعلان الوظيفي بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/applications", async (req, res) => {
  try {
    const scope = req.scope!;
    const { postingId } = req.query;
    let where = `(jp."companyId"=$1 OR jp."companyId" IS NULL)`;
    const params: any[] = [scope.companyId];
    if (postingId) { params.push(postingId); where += ` AND a."postingId"=$${params.length}`; }
    const rows = await rawQuery(`SELECT a.*, jp.title as "postingTitle" FROM job_applications a LEFT JOIN job_postings jp ON a."postingId"=jp.id WHERE ${where} ORDER BY a."createdAt" DESC`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/applications", async (req, res) => {
  try {
    const scope = req.scope!;
    const { postingId, applicantName, email, phone, resumeUrl, status, notes, rating } = req.body;
    const [posting] = await rawQuery<any>(`SELECT id FROM job_postings WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL)`, [postingId, scope.companyId]);
    if (!posting) { res.status(404).json({ error: "الإعلان الوظيفي غير موجود" }); return; }
    const r = await rawExecute(
      `INSERT INTO job_applications ("postingId", "applicantName", email, phone, "resumeUrl", status, notes, rating) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [postingId, applicantName, email, phone, resumeUrl, status || "new", notes, rating]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/applications/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT a.*, jp.title as "postingTitle" FROM job_applications a LEFT JOIN job_postings jp ON a."postingId"=jp.id WHERE a.id=$1 AND (jp."companyId"=$2 OR jp."companyId" IS NULL)`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "طلب التوظيف غير موجود" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/applications/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT a.id FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.id=$1 AND jp."companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "طلب التوظيف غير موجود" }); return; }
    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (b.rating !== undefined) { params.push(b.rating); sets.push(`rating=$${params.length}`); }
    if (b.interviewDate !== undefined) { params.push(b.interviewDate); sets.push(`"interviewDate"=$${params.length}`); }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
    params.push(id);
    await rawExecute(`UPDATE job_applications SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM job_applications WHERE id=$1`, [id]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/applications/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT a.id FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.id=$1 AND jp."companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "طلب التوظيف غير موجود" }); return; }
    await rawExecute(`DELETE FROM job_applications WHERE id=$1`, [id]);
    res.json({ message: "تم حذف طلب التوظيف بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [postings] = await rawQuery(`SELECT COUNT(*) as count FROM job_postings WHERE status='open' AND ("companyId"=$1 OR "companyId" IS NULL)`, [cid]);
    const [applications] = await rawQuery(`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE jp."companyId"=$1 OR jp."companyId" IS NULL`, [cid]);
    const [newApps] = await rawQuery(`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.status='new' AND (jp."companyId"=$1 OR jp."companyId" IS NULL)`, [cid]);
    const [interviews] = await rawQuery(`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.status='interview' AND (jp."companyId"=$1 OR jp."companyId" IS NULL)`, [cid]);
    res.json({
      openPostings: Number(postings.count),
      totalApplications: Number(applications.count),
      newApplications: Number(newApps.count),
      scheduledInterviews: Number(interviews.count),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
