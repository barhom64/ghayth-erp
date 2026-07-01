import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { handleRouteError, ValidationError, NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { createAuditLog, emitEvent, todayISO } from "../lib/businessHelpers.js";
import { issueNumber } from "../lib/numberingService.js";
import { logger } from "../lib/logger.js";

// Local row shapes for recruitment tables.

interface JobPostingRow {
  id: number;
  companyId?: number | null;
  title: string;
  department?: string | null;
  departmentId?: number | null;
  location?: string | null;
  type?: string | null;
  description?: string | null;
  requirements?: string | null;
  salaryMin?: number | string | null;
  salaryMax?: number | string | null;
  status: string;
  closingDate?: string | null;
  createdBy?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

interface JobApplicationRow {
  id: number;
  postingId: number;
  applicantName: string;
  email?: string | null;
  phone?: string | null;
  resumeUrl?: string | null;
  status?: string | null;
  notes?: string | null;
  rating?: number | string | null;
  createdAt: string;
  updatedAt?: string | null;
  deletedAt?: string | null;
  postingTitle?: string | null;
}

const createPostingSchema = z.object({
  title: z.string().min(1, "عنوان الإعلان الوظيفي مطلوب"),
  department: z.string().optional().nullable(),
  // #fk — القسم كمفتاح أجنبي. الواجهة قد ترسل الاسم (department) أو المعرّف
  // (departmentId)؛ الخادم يوفّق بينهما ويخزّن الاثنين (المعرّف للعلاقة، الاسم
  // denormalized للعرض في بوابة التوظيف العامة).
  departmentId: z.coerce.number().int().optional().nullable(),
  location: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  requirements: z.string().optional().nullable(),
  salaryMin: z.coerce.number().nonnegative().optional().nullable(),
  salaryMax: z.coerce.number().nonnegative().optional().nullable(),
  status: z.enum(["open", "closed", "draft", "paused"]).default("open"),
  closingDate: z.string().optional().nullable(),
  experienceLevel: z.string().optional().nullable(),
  education: z.string().optional().nullable(),
  vacancies: z.coerce.number().int().optional().nullable(),
  benefits: z.string().optional().nullable(),
  skills: z.string().optional().nullable(),
});

const createApplicationSchema = z.object({
  postingId: z.coerce.number({ required_error: "الإعلان الوظيفي مطلوب" }),
  applicantName: z.string().min(1, "اسم المتقدم مطلوب"),
  email: z.string().email("البريد الإلكتروني غير صالح").optional().nullable(),
  phone: z.string().optional().nullable(),
  resumeUrl: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  // NF-REC-APP-01 — rating is shown on a 1-5 scale in the UI; the
  // backend had no bounds so a misconfigured client could store 999
  // or -1 and skew "rating >= 4" filters used by shortlist reports.
  rating: z.coerce.number().min(1, "التقييم يجب أن يكون بين 1 و5").max(5, "التقييم يجب أن يكون بين 1 و5").optional().nullable(),
  source: z.string().optional().nullable(),
  experience: z.string().optional().nullable(),
  education: z.string().optional().nullable(),
  expectedSalary: z.coerce.number().optional().nullable(),
  currentCompany: z.string().optional().nullable(),
});

const updatePostingSchema = z.object({
  title: z.string().optional(),
  department: z.string().optional().nullable(),
  departmentId: z.coerce.number().int().optional().nullable(),
  location: z.string().optional().nullable(),
  type: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  requirements: z.string().optional().nullable(),
  salaryMin: z.coerce.number().nonnegative().optional().nullable(),
  salaryMax: z.coerce.number().nonnegative().optional().nullable(),
  status: z.enum(["open", "closed", "draft", "paused"]).optional(),
  closingDate: z.string().optional().nullable(),
});

const updateApplicationSchema = z.object({
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
  rating: z.coerce.number().min(1, "التقييم يجب أن يكون بين 1 و5").max(5, "التقييم يجب أن يكون بين 1 و5").optional().nullable(),
  interviewDate: z.string().optional().nullable(),
});

const closePostingSchema = z.object({
  reason: z.string().min(1, "سبب الإغلاق مطلوب"),
});

// #fk — يوفّق بين اسم القسم ومعرّفه ضمن نطاق الشركة. يقبل أيًّا منهما (الواجهة
// الحالية ترسل الاسم؛ الواجهات المستقبلية قد ترسل المعرّف) ويعيد الزوج المتسق:
//   • معرّف مُمرَّر صالح   → يُشتق منه الاسم (denormalized للعرض).
//   • اسم فقط             → يُشتق منه المعرّف (للعلاقة).
//   • معرّف غير صالح      → يُهمَل (لا نخزّن FK مكسورًا)، ويبقى الاسم إن وُجد.
async function resolveDepartment(
  companyId: number | null | undefined,
  departmentId?: number | null,
  departmentName?: string | null,
): Promise<{ id: number | null; name: string | null }> {
  let id = departmentId ?? null;
  let name = (departmentName ?? "").trim() || null;
  if (id != null) {
    const [d] = await rawQuery<{ name: string }>(
      `SELECT name FROM departments WHERE id=$1 AND "companyId"=$2`, [id, companyId],
    );
    if (d) name = d.name; else id = null;
  } else if (name) {
    // اسم فقط → اشتق المعرّف فقط عند تطابق فريد. الأقسام لا تملك قيد تفرّد على
    // (companyId, name) (قد يتكرر الاسم عبر فروع/إدارات)، فالاسم الغامض يُترك
    // بلا FK (الاسم محفوظ) بدل ربطه بصف عشوائي.
    const matches = await rawQuery<{ id: number }>(
      `SELECT id FROM departments WHERE name=$1 AND "companyId"=$2`, [name, companyId],
    );
    if (matches.length === 1) id = matches[0].id;
  }
  return { id, name };
}

const router = Router();

router.get("/postings", authorize({ feature: "hr.recruitment", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM job_postings WHERE ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 500`, [scope.companyId]);
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.post("/postings", authorize({ feature: "hr.recruitment", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, department, departmentId, location, type, description, requirements, salaryMin, salaryMax, status, closingDate, experienceLevel, education, vacancies, benefits, skills } = zodParse(createPostingSchema.safeParse(req.body));
    if (salaryMin !== undefined && salaryMin !== null && salaryMax !== undefined && salaryMax !== null && Number(salaryMax) < Number(salaryMin)) {
      throw new ValidationError("الحد الأعلى للراتب أقل من الحد الأدنى", {
        field: "salaryMax",
        fix: "تأكد من أن الحد الأعلى أكبر من الحد الأدنى",
      });
    }
    const dept = await resolveDepartment(scope.companyId, departmentId, department);
    const r = await rawExecute(
      `INSERT INTO job_postings (title, department, "departmentId", location, type, description, requirements, "salaryMin", "salaryMax", status, "closingDate", "companyId", "experienceLevel", education, vacancies, benefits, skills) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
      [String(title).trim(), dept.name, dept.id, location ?? null, type || "full-time", description ?? null, requirements ?? null, salaryMin ?? null, salaryMax ?? null, status || "open", closingDate ?? null, scope.companyId, experienceLevel ?? null, education ?? null, vacancies ?? null, benefits ?? null, skills ?? null]
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
    const [row] = await rawQuery<JobPostingRow>(`SELECT * FROM job_postings WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId, title, status: status || "open" });
  } catch (err) { handleRouteError(err, res, "Create job posting error:"); }
});

router.get("/postings/:id", authorize({ feature: "hr.recruitment", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<JobPostingRow>(`SELECT * FROM job_postings WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("الإعلان الوظيفي غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.patch("/postings/:id", authorize({ feature: "hr.recruitment", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updatePostingSchema.safeParse(req.body));
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    // #fk — عند تغيير القسم (بالاسم أو المعرّف) نوفّق بينهما ونحدّث العمودين معًا.
    if (b.department !== undefined || b.departmentId !== undefined) {
      const dept = await resolveDepartment(scope.companyId, b.departmentId ?? null, b.department ?? null);
      params.push(dept.name); sets.push(`department=$${params.length}`);
      params.push(dept.id); sets.push(`"departmentId"=$${params.length}`);
    }
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
    const result = await rawExecute(`UPDATE job_postings SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    if (result.affectedRows === 0) throw new NotFoundError("الإعلان الوظيفي غير موجود");
    const [row] = await rawQuery<JobPostingRow>(`SELECT * FROM job_postings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
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
router.post("/postings/:id/close", authorize({ feature: "hr.recruitment", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { reason: rawReason } = zodParse(closePostingSchema.safeParse(req.body ?? {}));
    const reason = rawReason.trim();
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
                  notes  = COALESCE(notes || E'\n', '') || $2
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
router.post("/postings/:id/reopen", authorize({ feature: "hr.recruitment", action: "create" }), async (req, res) => {
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

router.delete("/postings/:id", authorize({ feature: "hr.recruitment", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [before] = await rawQuery<JobPostingRow>(`SELECT * FROM job_postings WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!before) throw new NotFoundError("الإعلان الوظيفي غير موجود");
    await rawExecute(`UPDATE job_postings SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
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

router.get("/applications", authorize({ feature: "hr.recruitment", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { postingId } = req.query;
    let where = `(jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL AND jp."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (postingId) { params.push(postingId); where += ` AND a."postingId"=$${params.length}`; }
    const rows = await rawQuery(`SELECT a.*, jp.title as "postingTitle" FROM job_applications a LEFT JOIN job_postings jp ON a."postingId"=jp.id WHERE ${where} ORDER BY a."createdAt" DESC LIMIT 500`, params);
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.post("/applications", authorize({ feature: "hr.recruitment", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { postingId, applicantName, email, phone, resumeUrl, status, notes, rating, source, experience, education, expectedSalary, currentCompany } = zodParse(createApplicationSchema.safeParse(req.body));
    const [posting] = await rawQuery<{ id: number }>(
      `SELECT id FROM job_postings WHERE id=$1 AND ("companyId"=$2 OR "companyId" IS NULL) AND "deletedAt" IS NULL`,
      [Number(postingId), scope.companyId]
    );
    if (!posting) throw new NotFoundError("الإعلان الوظيفي غير موجود");
    const r = await rawExecute(
      `INSERT INTO job_applications ("postingId", "applicantName", email, phone, "resumeUrl", status, notes, rating, source, experience, education, "expectedSalary", "currentCompany") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [Number(postingId), String(applicantName).trim(), email ?? null, phone ?? null, resumeUrl ?? null, status || "new", notes ?? null, rating ?? null, source ?? null, experience ?? null, education ?? null, expectedSalary ?? null, currentCompany ?? null]
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
    const [row] = await rawQuery<JobApplicationRow>(
      `SELECT ja.* FROM job_applications ja JOIN job_postings jp ON jp.id = ja."postingId" WHERE ja.id=$1 AND jp."companyId"=$2 AND ja."deletedAt" IS NULL`,
      [r.insertId, scope.companyId]
    );
    res.status(201).json(row || { id: r.insertId, postingId: Number(postingId), applicantName, status: status || "new" });
  } catch (err) { handleRouteError(err, res, "Create application error:"); }
});

router.get("/applications/:id", authorize({ feature: "hr.recruitment", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<JobApplicationRow>(`SELECT a.*, jp.title as "postingTitle" FROM job_applications a LEFT JOIN job_postings jp ON a."postingId"=jp.id WHERE a.id=$1 AND (jp."companyId"=$2 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("طلب التوظيف غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.patch("/applications/:id", authorize({ feature: "hr.recruitment", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<{ id: number }>(`SELECT a.id FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.id=$1 AND jp."companyId"=$2 AND a."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("طلب التوظيف غير موجود");
    const b = zodParse(updateApplicationSchema.safeParse(req.body));
    const sets: string[] = [];
    const params: unknown[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (b.rating !== undefined) { params.push(b.rating); sets.push(`rating=$${params.length}`); }
    if (b.interviewDate !== undefined) { params.push(b.interviewDate); sets.push(`"interviewDate"=$${params.length}`); }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    params.push(id);
    await rawExecute(
      `UPDATE job_applications SET ${sets.join(",")} WHERE id=$${params.length} AND "deletedAt" IS NULL
       AND "postingId" IN (SELECT id FROM job_postings WHERE "companyId"=$${params.length + 1})`,
      [...params, scope.companyId]
    );
    const [row] = await rawQuery<JobApplicationRow>(
      `SELECT ja.* FROM job_applications ja JOIN job_postings jp ON jp.id = ja."postingId" WHERE ja.id=$1 AND jp."companyId"=$2 AND ja."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
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

// HR-REV-8 (#2222) — Convert an accepted applicant to an employee via the
// quick-activate path. This closes the recruitment→onboarding gap: before
// this endpoint, HR had to copy the applicant's data manually into the
// full 46-field employee form. Now a single POST marks the application
// hired and creates an inactive employee + distributed onboarding plan
// (same as POST /employees/quick-activate) in one transaction.
//
// Required body: { name, phone, nationality, nationalId, branchId,
//   departmentId, jobTitle, salary } — the minimal fields quick-activate
//   needs. name/phone/email prefill from the application row if omitted.
// Optional: email, categoryKey, teamId, positionId, costCenterId
router.post("/applications/:id/hire", authorize({ feature: "hr.recruitment", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [app] = await rawQuery<JobApplicationRow>(
      `SELECT a.*, jp."companyId" AS "postingCompanyId", jp.title AS "postingTitle"
         FROM job_applications a
         JOIN job_postings jp ON jp.id = a."postingId"
        WHERE a.id = $1 AND jp."companyId" = $2 AND a."deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!app) throw new NotFoundError("طلب التوظيف غير موجود");
    if (app.status === "hired") throw new ValidationError("المرشح محوَّل إلى موظف مسبقًا", { field: "status" });
    if (app.status === "rejected" || app.status === "withdrawn") {
      throw new ValidationError(`لا يمكن تعيين مرشح بحالة ${app.status}`, { field: "status", fix: "أعِد فتح الطلب أولًا إذا كان الرفض بالخطأ." });
    }
    const hireSchema = z.object({
      name: z.string().min(1).optional(),
      phone: z.string().min(1).optional(),
      email: z.string().email().optional().nullable(),
      nationality: z.string().min(1, "الجنسية مطلوبة"),
      nationalId: z.string().min(1, "رقم الهوية مطلوب"),
      branchId: z.coerce.number().int().positive("الفرع مطلوب"),
      departmentId: z.coerce.number().int().positive("القسم مطلوب"),
      jobTitle: z.string().min(1, "المسمى الوظيفي مطلوب"),
      salary: z.coerce.number().positive("الراتب مطلوب"),
      categoryKey: z.string().optional().nullable(),
      teamId: z.coerce.number().int().positive().optional().nullable(),
      positionId: z.coerce.number().int().positive().optional().nullable(),
      costCenterId: z.coerce.number().int().positive().optional().nullable(),
      hireDate: z.string().optional().nullable(),
    });
    const b = zodParse(hireSchema.safeParse(req.body));
    // Prefill name/phone/email from the application row when not supplied.
    const name = b.name || app.applicantName;
    const phone = b.phone || app.phone || "";
    const email = b.email ?? app.email ?? null;
    if (!name) throw new ValidationError("اسم المرشح مطلوب", { field: "name" });
    if (!phone) throw new ValidationError("رقم جوال المرشح مطلوب", { field: "phone" });

    // Issue the employee number OUTSIDE the transaction via the numbering
    // center (`hr.employee_code`) — same call as employees.ts POST / — so the
    // audit:numbering-coverage check stays satisfied: the INSERT into
    // employees gets its number from the numbering service.
    const preIssued = await issueNumber({
      companyId: scope.companyId,
      branchId: scope.branchId ?? null,
      moduleKey: "hr",
      entityKey: "employee_code",
      entityTable: "employees",
      actorId: scope.userId,
      expectedTiming: "on_draft",
    });
    const empNumber = preIssued.number;

    // All writes (application flip, employee insert, assignment insert,
    // numbering link, optional institutional links) must be atomic — a partial
    // failure would leave a hired application with no employee, or an employee
    // with no assignment. rawQuery/rawExecute auto-join the ambient transaction.
    const hireDate = b.hireDate || todayISO();
    const { empId, assignmentId } = await withTransaction(async () => {
      // 1. Mark the application hired.
      await rawExecute(
        `UPDATE job_applications SET status = 'hired' WHERE id = $1`,
        [id],
      );
      // 2. Insert the inactive employee with its issued empNumber.
      // hireDate lives on the assignment, not on employees; employees has no
      // updatedAt column — both were dropped to match the head-of-main schema.
      const [empRow] = await rawQuery<{ id: number }>(
        `INSERT INTO employees (name, phone, email, "empNumber", nationality, "nationalId", status, "createdAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'inactive', NOW())
         RETURNING id`,
        [name, phone, email, empNumber, b.nationality, b.nationalId],
      );
      const newEmpId = empRow.id;
      // Link the numbering assignment to the new employee row.
      await rawExecute(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [newEmpId, preIssued.assignmentId],
      );
      // 3. Insert the active assignment.
      const [assignRow] = await rawQuery<{ id: number }>(
        `INSERT INTO employee_assignments ("employeeId", "companyId", "branchId", "departmentId", "jobTitle", salary, status, "hireDate", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, 'active', $7, NOW(), NOW())
         RETURNING id`,
        [newEmpId, scope.companyId, b.branchId, b.departmentId, b.jobTitle, b.salary, hireDate],
      );
      const newAssignmentId = assignRow.id;
      // 4. Link the optional institutional fields.
      if (b.positionId) await rawExecute(`INSERT INTO employee_position_assignments ("employeeId","positionId","assignmentId","startDate","isActive","createdAt") VALUES($1,$2,$3,$4,true,NOW()) ON CONFLICT DO NOTHING`, [newEmpId, b.positionId, newAssignmentId, hireDate]);
      if (b.teamId) await rawExecute(`INSERT INTO employee_team_memberships ("teamId","assignmentId","startDate","createdAt") VALUES($1,$2,$3,NOW()) ON CONFLICT DO NOTHING`, [b.teamId, newAssignmentId, hireDate]);
      return { empId: newEmpId, assignmentId: newAssignmentId };
    });
    // 5. Audit + event.
    await createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "hire", entity: "job_applications", entityId: id, after: { employeeId: empId, name, jobTitle: b.jobTitle } });
    await emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "recruitment.application.hired", entity: "job_applications", entityId: id }).catch((e) => logger.error(e, "recruitment background task failed"));
    res.status(201).json({ data: { employeeId: empId, assignmentId, applicationId: id, status: "inactive", message: "تم إنشاء الموظف بنجاح — استكمل خطة التفعيل في لوحة قيد التفعيل" } });
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

router.delete("/applications/:id", authorize({ feature: "hr.recruitment", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [before] = await rawQuery<JobApplicationRow>(`SELECT a.* FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.id=$1 AND jp."companyId"=$2 AND a."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!before) throw new NotFoundError("طلب التوظيف غير موجود");
    await rawExecute(`UPDATE job_applications SET "deletedAt" = NOW() WHERE id=$1 AND "deletedAt" IS NULL AND "postingId" IN (SELECT id FROM job_postings WHERE "companyId"=$2)`, [id, scope.companyId]);
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

router.get("/stats", authorize({ feature: "hr.recruitment", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [[postings], [applications], [newApps], [interviews]] = await Promise.all([
      rawQuery(`SELECT COUNT(*) as count FROM job_postings WHERE status='open' AND ("companyId"=$1 OR "companyId" IS NULL) AND "deletedAt" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE (jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL AND jp."deletedAt" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.status='new' AND (jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL`, [cid]),
      rawQuery(`SELECT COUNT(*) as count FROM job_applications a JOIN job_postings jp ON a."postingId"=jp.id WHERE a.status='interview' AND (jp."companyId"=$1 OR jp."companyId" IS NULL) AND a."deletedAt" IS NULL`, [cid]),
    ]);
    res.json(maskFields(req, {
      openPostings: Number(postings.count),
      totalApplications: Number(applications.count),
      newApplications: Number(newApps.count),
      scheduledInterviews: Number(interviews.count),
    }));
  } catch (err) { handleRouteError(err, res, "recruitment"); }
});

export default router;
