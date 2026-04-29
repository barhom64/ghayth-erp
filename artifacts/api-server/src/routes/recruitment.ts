import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { handleRouteError, ValidationError, NotFoundError,
  parseId,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const createPostingSchema = z.object({
  title: z.string().min(1, "عنوان الإعلان الوظيفي مطلوب"),
  department: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  requirements: z.string().optional().nullable(),
  salaryMin: z.coerce.number().optional().nullable(),
  salaryMax: z.coerce.number().optional().nullable(),
  status: z.enum(["open", "closed", "draft", "paused"]).default("open"),
  closingDate: z.string().optional().nullable(),
});

const createApplicationSchema = z.object({
  postingId: z.coerce.number({ required_error: "الإعلان الوظيفي مطلوب" }),
  applicantName: z.string().min(1, "اسم المتقدم مطلوب"),
  email: z.string().email("البريد الإلكتروني غير صالح").optional().nullable(),
  phone: z.string().optional().nullable(),
  resumeUrl: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  rating: z.coerce.number().optional().nullable(),
});

const updatePostingSchema = z.object({
  title: z.string().optional(),
  department: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  requirements: z.string().optional().nullable(),
  salaryMin: z.coerce.number().optional().nullable(),
  salaryMax: z.coerce.number().optional().nullable(),
  status: z.enum(["open", "closed", "draft", "paused"]).optional(),
  closingDate: z.string().optional().nullable(),
});

const updateApplicationSchema = z.object({
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
  rating: z.coerce.number().optional().nullable(),
  interviewDate: z.string().optional().nullable(),
});

const router = Router();

router.get("/postings", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM job_postings WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.post("/postings", requirePermission("hr:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createPostingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { title, department, location, type, description, requirements, salaryMin, salaryMax, status, closingDate } = parsed.data;
    if (salaryMin !== undefined && salaryMin !== null && salaryMax !== undefined && salaryMax !== null && Number(salaryMax) < Number(salaryMin)) {
      throw new ValidationError("الحد الأعلى للراتب أقل من الحد الأدنى", {
        field: "salaryMax",
        fix: "تأكد من أن الحد الأعلى أكبر من الحد الأدنى",
      });
    }
    const r = await rawExecute(
      `INSERT INTO job_postings (title, department, location, type, description, requirements, "salaryMin", "salaryMax", status, "closingDate", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [String(title).trim(), department ?? null, location ?? null, type || "full-time", description ?? null, requirements ?? null, salaryMin ?? null, salaryMax ?? null, status || "open", closingDate ?? null, scope.companyId]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "job_postings", entityId: r.insertId,
      after: { title, type: type || "full-time", status: status || "open" },
    }).catch((e) => logger.error(e, "recruitment background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recruitment.posting.created",
      entity: "job_postings",
      entityId: r.insertId,
      details: JSON.stringify({ title, type: type || "full-time", status: status || "open" }),
    }).catch((e) => logger.error(e, "recruitment background task failed"));
    res.status(201).json({ id: r.insertId, title, status: status || "open" });
  } catch (err) { handleRouteError(err, res, "Create job posting error:"); }
});

router.get("/postings/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT * FROM job_postings WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("الإعلان الوظيفي غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.patch("/postings/:id", requirePermission("hr:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = updatePostingSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;
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
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(id); params.push(scope.companyId);
    const result = await rawExecute(`UPDATE job_postings SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    if (result.affectedRows === 0) throw new NotFoundError("الإعلان الوظيفي غير موجود");
    const [row] = await rawQuery<any>(`SELECT * FROM job_postings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "job_postings", entityId: id, after: b }).catch((e) => logger.error(e, "recruitment background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recruitment.posting.updated",
      entity: "job_postings",
      entityId: id,
    }).catch((e) => logger.error(e, "recruitment background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

// Close a job posting with cascade to open applications + candidate notifications.
router.post("/postings/:id/close", requirePermission("hr:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const reason = (req.body?.reason as string | undefined)?.trim();
    if (!reason) throw new ValidationError("سبب الإغلاق مطلوب", { field: "reason" });
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
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "job_postings", entityId: id, after: { status: "closed", closedReason: reason } }).catch((e) => logger.error(e, "recruitment background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recruitment.posting.closed",
      entity: "job_postings",
      entityId: id,
      details: JSON.stringify({ reason }),
    }).catch((e) => logger.error(e, "recruitment background task failed"));
    res.json({ ...updated, event: "recruitment.job.closed" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Close job posting error:");
  }
});

// Reopen a previously closed job posting.
router.post("/postings/:id/reopen", requirePermission("hr:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
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
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "job_postings", entityId: id, after: { status: "open", reopened: true } }).catch((e) => logger.error(e, "recruitment background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recruitment.posting.reopened",
      entity: "job_postings",
      entityId: id,
    }).catch((e) => logger.error(e, "recruitment background task failed"));
    res.json({ ...updated, event: "recruitment.job.reopened" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Reopen job posting error:");
  }
});

router.delete("/postings/:id", requirePermission("hr:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [before] = await rawQuery<any>(`SELECT * FROM job_postings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!before) throw new NotFoundError("الإعلان الوظيفي غير موجود");
    await rawExecute(`UPDATE job_postings SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "job_postings", entityId: id, before }).catch((e) => logger.error(e, "recruitment background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recruitment.posting.deleted",
      entity: "job_postings",
      entityId: id,
    }).catch((e) => logger.error(e, "recruitment background task failed"));
    res.json({ message: "تم حذف الإعلان الوظيفي بنجاح" });
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.get("/applications", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { postingId } = req.query;
    let where = `(jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL AND jp."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (postingId) { params.push(postingId); where += ` AND a."postingId"=$${params.length}`; }
    const rows = await rawQuery(`SELECT a.*, jp.title as "postingTitle" FROM job_applications a LEFT JOIN job_postings jp ON a."postingId"=jp.id WHERE ${where} ORDER BY a."createdAt" DESC`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.post("/applications", requirePermission("hr:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createApplicationSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const { postingId, applicantName, email, phone, resumeUrl, status, notes, rating } = parsed.data;
    const [posting] = await rawQuery<{ id: number }>(
      `SELECT id FROM job_postings WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [Number(postingId), scope.companyId]
    );
    if (!posting) throw new NotFoundError("الإعلان الوظيفي غير موجود");
    const r = await rawExecute(
      `INSERT INTO job_applications ("postingId", "applicantName", email, phone, "resumeUrl", status, notes, rating) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [Number(postingId), String(applicantName).trim(), email ?? null, phone ?? null, resumeUrl ?? null, status || "new", notes ?? null, rating ?? null]
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "job_applications", entityId: r.insertId,
      after: { postingId: Number(postingId), applicantName, status: status || "new" },
    }).catch((e) => logger.error(e, "recruitment background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recruitment.application.created",
      entity: "job_applications",
      entityId: r.insertId,
      details: JSON.stringify({ postingId: Number(postingId), applicantName }),
    }).catch((e) => logger.error(e, "recruitment background task failed"));
    res.status(201).json({ id: r.insertId, postingId: Number(postingId), applicantName, status: status || "new" });
  } catch (err) { handleRouteError(err, res, "Create application error:"); }
});

router.get("/applications/:id", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT a.*, jp.title as "postingTitle" FROM job_applications a LEFT JOIN job_postings jp ON a."postingId"=jp.id WHERE a.id=$1 AND (jp."companyId"=$2 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("طلب التوظيف غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.patch("/applications/:id", requirePermission("hr:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT a.id FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.id=$1 AND jp."companyId"=$2 AND a."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("طلب التوظيف غير موجود");
    const parsed = updateApplicationSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (b.rating !== undefined) { params.push(b.rating); sets.push(`rating=$${params.length}`); }
    if (b.interviewDate !== undefined) { params.push(b.interviewDate); sets.push(`"interviewDate"=$${params.length}`); }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(id);
    await rawExecute(`UPDATE job_applications SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM job_applications WHERE id=$1 AND "deletedAt" IS NULL`, [id]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "job_applications", entityId: id, after: b }).catch((e) => logger.error(e, "recruitment background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recruitment.application.updated",
      entity: "job_applications",
      entityId: id,
    }).catch((e) => logger.error(e, "recruitment background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.delete("/applications/:id", requirePermission("hr:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [before] = await rawQuery<any>(`SELECT a.* FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.id=$1 AND jp."companyId"=$2`, [id, scope.companyId]);
    if (!before) throw new NotFoundError("طلب التوظيف غير موجود");
    await rawExecute(`UPDATE job_applications SET "deletedAt" = NOW() WHERE id=$1 AND "deletedAt" IS NULL`, [id]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "job_applications", entityId: id, before }).catch((e) => logger.error(e, "recruitment background task failed"));
    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "recruitment.application.deleted",
      entity: "job_applications",
      entityId: id,
    }).catch((e) => logger.error(e, "recruitment background task failed"));
    res.json({ message: "تم حذف طلب التوظيف بنجاح" });
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.get("/stats", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [postings] = await rawQuery(`SELECT COUNT(*) as count FROM job_postings WHERE status='open' AND ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]);
    const [applications] = await rawQuery(`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE (jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL AND jp."deletedAt" IS NULL`, [cid]);
    const [newApps] = await rawQuery(`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.status='new' AND (jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL`, [cid]);
    const [interviews] = await rawQuery(`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.status='interview' AND (jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL`, [cid]);
    res.json({
      openPostings: Number(postings.count),
      totalApplications: Number(applications.count),
      newApplications: Number(newApps.count),
      scheduledInterviews: Number(interviews.count),
    });
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

export default router;
