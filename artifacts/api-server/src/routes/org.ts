// ════════════════════════════════════════════════════════════════════════════
// نموذج المؤسسة التشغيلي — CRUD للجداول التي أنشأتها migrations 274/275.
// تُمكِّن مدير الموارد البشرية من إدارة:
//   - legal_entities (الكيانات القانونية)
//   - positions (المناصب الإدارية، شركة-محدودة)
//   - teams (الفِرَق)
//   - committees (اللجان)
//   - supervision_lines (خطوط الإشراف الإدارية/الوظيفية/المشاريعية)
//   - approval_authorities (صلاحيات الاعتماد المالي على مستوى الشخص)
//
// كل endpoint محكوم بـ companyId scope + authorize({feature:"admin"}).
// system templates (companyId IS NULL) لا تُعدَّل من هذه الـ routes — فقط
// company-scoped rows.
// ════════════════════════════════════════════════════════════════════════════
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError, NotFoundError, ValidationError, parseId, zodParse } from "../lib/errorHandler.js";
import { authorize } from "../lib/rbac/authorize.js";
import { auditFromRequest, emitEvent, todayISO } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

const ADMIN = { feature: "admin", action: "list" } as const;
const ADMIN_WRITE = { feature: "admin", action: "update" } as const;
// PR-3 (#2077) — domain-correct guards for the HR-side org surfaces.
// The previous ADMIN gate was too tight: an HR Manager who can edit
// the company-wide attendance policy (/hr/attendance-policy) couldn't
// open the per-category override page (/org/attendance-policies-per-
// category) — the page was technically built but the API 403'd. The
// employee-categories catalog has the same coupling: PR-1's wizard
// reads it for the category dropdown, but a non-owner caller hit a
// 403 and saw an empty list.
//
// Splitting the gates: the CATALOG read is shared with every HR
// operator who manages employees (hr.employees:list — the basic
// «can see employee list» permission). The per-category policy
// surface is gated on hr.attendance — the same module that owns the
// company-wide policy editor, so the two pages stay in the same
// permission lane.
const HR_EMPLOYEES_READ = { feature: "hr.employees", action: "list" } as const;
const HR_ATTENDANCE_READ = { feature: "hr.attendance", action: "list" } as const;
const HR_ATTENDANCE_WRITE = { feature: "hr.attendance", action: "update" } as const;

// HR-REV-1 §6 decision #4 — supervision_lines + approval_authorities are
// part of the ORGANIZATION model (who reports to whom; who may approve
// what), so they belong on the domain-correct `hr.organization` feature —
// NOT the generic `admin` gate. `admin` is too tight here: it is held only
// by the owner (no seeded role grants it, and `hr:*`/`governance:*` do not
// expand to it), so the HR Manager this file is explicitly built for
// («تُمكِّن مدير الموارد البشرية من إدارة supervision_lines/approval_authorities»)
// was locked out. `hr.organization` is already held by owner (*) and by
// general_manager/hr_manager (hr:*), so this LETS THE RIGHT OPERATORS IN
// with zero migration and no lockout — same split rationale as the
// HR_ATTENDANCE gates above (PR-3 #2077).
const ORG_READ = { feature: "hr.organization", action: "list" } as const;
const ORG_CREATE = { feature: "hr.organization", action: "create" } as const;
const ORG_DELETE = { feature: "hr.organization", action: "delete" } as const;

// ─── helpers ────────────────────────────────────────────────────────────────
function requireScope(req: any): { companyId: number; userId: number } {
  const scope = req.scope;
  if (!scope?.companyId || !scope?.userId) {
    throw new ValidationError("scope مفقود — مطلوب companyId و userId");
  }
  return { companyId: scope.companyId, userId: scope.userId };
}

// Every write in this file routes through here, so it is also the single
// place to emit the domain event — keeps the org model's mutations observable
// (and satisfies the stop-ship events guard) without scattering emitEvent across
// all 16 endpoints. Event name: org.<entity>.<created|updated|deleted>.
const EVENT_VERB: Record<string, string> = { create: "created", update: "updated", delete: "deleted" };

async function audit(
  req: any, action: string, entity: string, entityId: number, after: Record<string, any> = {}
): Promise<void> {
  const scope = req.scope!;
  // Delegate to the canonical helper so the full IGOC context lands
  // on EVERY org-bridge write (activeRoleKey + activeDepartmentId +
  // resolvedScope + impersonationSourceUser + branchId). The previous
  // local copy was passing only activeRoleKey — left department/scope/
  // impersonation columns NULL on every audit row, which the HR-019
  // live probe surfaced. See lib/businessHelpers.ts:auditFromRequest.
  await auditFromRequest(req, action, entity, entityId, { after });
  try {
    await emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: `org.${entity}.${EVENT_VERB[action] ?? action}`,
      entity, entityId, details: JSON.stringify(after ?? {}),
    });
  } catch (e) { logger.warn({ err: e }, "[org] event failed"); }
}

// ════════════════════════════════════════════════════════════════════════════
// 1. LEGAL ENTITIES
// ════════════════════════════════════════════════════════════════════════════
const legalEntitySchema = z.object({
  nameAr: z.string().min(1, "الاسم بالعربية مطلوب").max(200),
  nameEn: z.string().max(200).optional().nullable(),
  crNumber: z.string().max(40).optional().nullable(),
  vatNumber: z.string().max(40).optional().nullable(),
  taxNumber: z.string().max(40).optional().nullable(),
  isActive: z.boolean().optional(),
});

router.get("/legal-entities", authorize(ADMIN), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const includeInactive = req.query.includeInactive === "true";
    const rows = await rawQuery(
      `SELECT id, "nameAr", "nameEn", "crNumber", "vatNumber", "taxNumber",
              "isActive", "createdAt", "updatedAt"
         FROM legal_entities
        WHERE "companyId" = $1 ${includeInactive ? "" : `AND "isActive" = TRUE`}
        ORDER BY "isActive" DESC, "nameAr"`,
      [companyId],
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب الكيانات القانونية"); }
});

router.post("/legal-entities", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const body = zodParse(legalEntitySchema.safeParse(req.body));
    const [row] = await rawQuery<any>(
      `INSERT INTO legal_entities ("companyId", "nameAr", "nameEn", "crNumber", "vatNumber", "taxNumber", "isActive")
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE))
       RETURNING *`,
      [companyId, body.nameAr, body.nameEn ?? null, body.crNumber ?? null,
       body.vatNumber ?? null, body.taxNumber ?? null, body.isActive ?? null],
    );
    await audit(req, "create", "legal_entity", row.id, { nameAr: row.nameAr });
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر إنشاء الكيان القانوني"); }
});

router.patch("/legal-entities/:id", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const body = zodParse(legalEntitySchema.partial().safeParse(req.body));
    const sets: string[] = []; const vals: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      sets.push(`"${k}" = $${i++}`); vals.push(v);
    }
    if (sets.length === 0) { res.json({ data: null, noop: true }); return; }
    sets.push(`"updatedAt" = now()`);
    vals.push(id, companyId);
    const [row] = await rawQuery<any>(
      `UPDATE legal_entities SET ${sets.join(", ")}
        WHERE id = $${i++} AND "companyId" = $${i++} RETURNING *`,
      vals,
    );
    if (!row) throw new NotFoundError("الكيان القانوني غير موجود");
    await audit(req, "update", "legal_entity", id, body);
    res.json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر تعديل الكيان القانوني"); }
});

router.delete("/legal-entities/:id", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const result = await rawExecute(
      `UPDATE legal_entities SET "isActive" = FALSE, "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("الكيان القانوني غير موجود");
    await audit(req, "delete", "legal_entity", id, {});
    res.json({ data: { id, isActive: false } });
  } catch (e) { handleRouteError(e, res, "تعذّر حذف الكيان القانوني"); }
});

// ════════════════════════════════════════════════════════════════════════════
// 2. POSITIONS (company-scoped only; system templates managed via migrations)
// ════════════════════════════════════════════════════════════════════════════
const positionSchema = z.object({
  positionKey: z.string().regex(/^[a-z][a-z0-9_]*$/, "مفتاح إنجليزي صغير فقط").max(60),
  labelAr: z.string().min(1, "الاسم بالعربية مطلوب").max(200),
  labelEn: z.string().max(200).optional().nullable(),
  description: z.string().optional().nullable(),
  // #institutional-link — `level` orders the position matrix but is NOT
  // something the inline quick-create dialog (positionKey + labelAr only)
  // can supply. It was a hard-required number, so "+ منصب جديد" from the
  // employee-create picker always 422'd ("Required"). Coerce (the dialog
  // sends strings) + default to 50 (the DB column default) so a minimal
  // quick-create succeeds; the full positions admin form still sets it.
  level: z.coerce.number().int().min(0).max(100).optional().default(50),
  isActive: z.boolean().optional(),
});

router.get("/positions", authorize(HR_EMPLOYEES_READ), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const includeSystem = req.query.includeSystem !== "false";
    const includeInactive = req.query.includeInactive === "true";
    const rows = await rawQuery(
      `SELECT id, "companyId", "positionKey", "labelAr", "labelEn", description,
              level, "isActive",
              ("companyId" IS NULL) AS "isSystem"
         FROM positions
        WHERE ("companyId" = $1 ${includeSystem ? `OR "companyId" IS NULL` : ""})
          ${includeInactive ? "" : `AND "isActive" = TRUE`}
        ORDER BY level DESC, "labelAr"`,
      [companyId],
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب المناصب"); }
});

router.post("/positions", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const body = zodParse(positionSchema.safeParse(req.body));
    const [row] = await rawQuery<any>(
      `INSERT INTO positions ("companyId", "positionKey", "labelAr", "labelEn", description, level, "isActive")
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE))
       ON CONFLICT ("companyId", "positionKey") DO NOTHING
       RETURNING *`,
      [companyId, body.positionKey, body.labelAr, body.labelEn ?? null,
       body.description ?? null, body.level, body.isActive ?? null],
    );
    if (!row) throw new ValidationError("مفتاح المنصب موجود مسبقًا");
    await audit(req, "create", "position", row.id, { positionKey: body.positionKey });
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر إنشاء المنصب"); }
});

router.patch("/positions/:id", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const body = zodParse(positionSchema.partial().safeParse(req.body));
    const sets: string[] = []; const vals: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined || k === "positionKey") continue; // مفتاح المنصب لا يُعدَّل
      sets.push(`"${k}" = $${i++}`); vals.push(v);
    }
    if (sets.length === 0) { res.json({ data: null, noop: true }); return; }
    // positions has no updatedAt column — see migration 274.
    vals.push(id, companyId);
    const [row] = await rawQuery<any>(
      `UPDATE positions SET ${sets.join(", ")}
        WHERE id = $${i++} AND "companyId" = $${i++} RETURNING *`,
      vals,
    );
    if (!row) throw new NotFoundError("المنصب غير موجود أو لا يخص شركتك");
    await audit(req, "update", "position", id, body);
    res.json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر تعديل المنصب"); }
});

router.delete("/positions/:id", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const result = await rawExecute(
      `UPDATE positions SET "isActive" = FALSE
        WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("المنصب غير موجود");
    await audit(req, "delete", "position", id, {});
    res.json({ data: { id, isActive: false } });
  } catch (e) { handleRouteError(e, res, "تعذّر حذف المنصب"); }
});

// ════════════════════════════════════════════════════════════════════════════
// 3. TEAMS
// ════════════════════════════════════════════════════════════════════════════
const teamSchema = z.object({
  name: z.string().min(1, "اسم الفريق مطلوب").max(200),
  departmentId: z.number().int().positive().optional().nullable(),
  leaderAssignmentId: z.number().int().positive().optional().nullable(),
  description: z.string().optional().nullable(),
  scopeType: z.enum(["department", "branch", "cross_company"]).optional(),
  isActive: z.boolean().optional(),
});

router.get("/teams", authorize(HR_EMPLOYEES_READ), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const includeInactive = req.query.includeInactive === "true";
    const rows = await rawQuery(
      `SELECT t.id, t.name, t."departmentId", t."leaderAssignmentId", t.description,
              t."scopeType", t."isActive", t."createdAt", t."updatedAt",
              d.name AS "departmentName",
              le.name AS "leaderName"
         FROM teams t
         LEFT JOIN departments d ON d.id = t."departmentId"
         LEFT JOIN employee_assignments ea ON ea.id = t."leaderAssignmentId"
         LEFT JOIN employees le ON le.id = ea."employeeId"
        WHERE t."companyId" = $1 ${includeInactive ? "" : `AND t."isActive" = TRUE`}
        ORDER BY t."isActive" DESC, t.name`,
      [companyId],
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب الفِرَق"); }
});

router.post("/teams", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const body = zodParse(teamSchema.safeParse(req.body));
    const [row] = await rawQuery<any>(
      `INSERT INTO teams ("companyId", name, "departmentId", "leaderAssignmentId",
                           description, "scopeType", "isActive")
       VALUES ($1, $2, $3, $4, $5, COALESCE($6, 'department'), COALESCE($7, TRUE))
       RETURNING *`,
      [companyId, body.name, body.departmentId ?? null, body.leaderAssignmentId ?? null,
       body.description ?? null, body.scopeType ?? null, body.isActive ?? null],
    );
    await audit(req, "create", "team", row.id, { name: body.name });
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر إنشاء الفريق"); }
});

router.patch("/teams/:id", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const body = zodParse(teamSchema.partial().safeParse(req.body));
    const sets: string[] = []; const vals: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      sets.push(`"${k}" = $${i++}`); vals.push(v);
    }
    if (sets.length === 0) { res.json({ data: null, noop: true }); return; }
    sets.push(`"updatedAt" = now()`);
    vals.push(id, companyId);
    const [row] = await rawQuery<any>(
      `UPDATE teams SET ${sets.join(", ")}
        WHERE id = $${i++} AND "companyId" = $${i++} RETURNING *`,
      vals,
    );
    if (!row) throw new NotFoundError("الفريق غير موجود");
    await audit(req, "update", "team", id, body);
    res.json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر تعديل الفريق"); }
});

router.delete("/teams/:id", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const result = await rawExecute(
      `UPDATE teams SET "isActive" = FALSE, "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("الفريق غير موجود");
    await audit(req, "delete", "team", id, {});
    res.json({ data: { id, isActive: false } });
  } catch (e) { handleRouteError(e, res, "تعذّر حذف الفريق"); }
});

// ════════════════════════════════════════════════════════════════════════════
// 4. COMMITTEES
// ════════════════════════════════════════════════════════════════════════════
const committeeSchema = z.object({
  name: z.string().min(1, "اسم اللجنة مطلوب").max(200),
  type: z.string().min(1, "نوع اللجنة مطلوب").max(40),
  chairAssignmentId: z.number().int().positive().optional().nullable(),
  description: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
});

router.get("/committees", authorize(HR_EMPLOYEES_READ), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const includeInactive = req.query.includeInactive === "true";
    const rows = await rawQuery(
      `SELECT c.id, c.name, c.type, c."chairAssignmentId", c.description,
              c."startDate", c."endDate", c."isActive", c."createdAt", c."updatedAt",
              ce.name AS "chairName"
         FROM committees c
         LEFT JOIN employee_assignments ea ON ea.id = c."chairAssignmentId"
         LEFT JOIN employees ce ON ce.id = ea."employeeId"
        WHERE c."companyId" = $1 ${includeInactive ? "" : `AND c."isActive" = TRUE`}
        ORDER BY c."isActive" DESC, c.type, c.name`,
      [companyId],
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب اللجان"); }
});

router.post("/committees", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const body = zodParse(committeeSchema.safeParse(req.body));
    const [row] = await rawQuery<any>(
      `INSERT INTO committees ("companyId", name, type, "chairAssignmentId",
                                description, "startDate", "endDate", "isActive")
       VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, TRUE))
       RETURNING *`,
      [companyId, body.name, body.type, body.chairAssignmentId ?? null,
       body.description ?? null, body.startDate ?? null, body.endDate ?? null,
       body.isActive ?? null],
    );
    await audit(req, "create", "committee", row.id, { name: body.name, type: body.type });
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر إنشاء اللجنة"); }
});

router.patch("/committees/:id", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const body = zodParse(committeeSchema.partial().safeParse(req.body));
    const sets: string[] = []; const vals: any[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      sets.push(`"${k}" = $${i++}`); vals.push(v);
    }
    if (sets.length === 0) { res.json({ data: null, noop: true }); return; }
    sets.push(`"updatedAt" = now()`);
    vals.push(id, companyId);
    const [row] = await rawQuery<any>(
      `UPDATE committees SET ${sets.join(", ")}
        WHERE id = $${i++} AND "companyId" = $${i++} RETURNING *`,
      vals,
    );
    if (!row) throw new NotFoundError("اللجنة غير موجودة");
    await audit(req, "update", "committee", id, body);
    res.json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر تعديل اللجنة"); }
});

router.delete("/committees/:id", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const result = await rawExecute(
      `UPDATE committees SET "isActive" = FALSE, "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("اللجنة غير موجودة");
    await audit(req, "delete", "committee", id, {});
    res.json({ data: { id, isActive: false } });
  } catch (e) { handleRouteError(e, res, "تعذّر حذف اللجنة"); }
});

// ════════════════════════════════════════════════════════════════════════════
// 5. SUPERVISION LINES
// ════════════════════════════════════════════════════════════════════════════
const supervisionLineSchema = z.object({
  supervisorAssignmentId: z.number().int().positive(),
  superviseeAssignmentId: z.number().int().positive(),
  lineType: z.enum(["administrative", "project", "functional", "dotted"]).optional(),
  scopeType: z.string().max(20).optional().nullable(),
  scopeId: z.number().int().positive().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  isPrimary: z.boolean().optional(),
});

router.get("/supervision-lines", authorize(ORG_READ), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const where: string[] = [`sl."companyId" = $1`];
    const vals: any[] = [companyId];
    if (req.query.supervisorAssignmentId) {
      where.push(`sl."supervisorAssignmentId" = $${vals.length + 1}`);
      vals.push(parseId(String(req.query.supervisorAssignmentId)));
    }
    if (req.query.superviseeAssignmentId) {
      where.push(`sl."superviseeAssignmentId" = $${vals.length + 1}`);
      vals.push(parseId(String(req.query.superviseeAssignmentId)));
    }
    if (req.query.active === "true") {
      where.push(`(sl."endDate" IS NULL OR sl."endDate" >= CURRENT_DATE)`);
    }
    const rows = await rawQuery(
      `SELECT sl.id, sl."supervisorAssignmentId", sl."superviseeAssignmentId",
              sl."lineType", sl."scopeType", sl."scopeId",
              sl."startDate", sl."endDate", sl."isPrimary", sl."createdAt",
              sup.name AS "supervisorName",
              svee.name AS "superviseeName"
         FROM supervision_lines sl
         LEFT JOIN employee_assignments sa ON sa.id = sl."supervisorAssignmentId"
         LEFT JOIN employees sup ON sup.id = sa."employeeId"
         LEFT JOIN employee_assignments sva ON sva.id = sl."superviseeAssignmentId"
         LEFT JOIN employees svee ON svee.id = sva."employeeId"
        WHERE ${where.join(" AND ")}
        ORDER BY sl."isPrimary" DESC, sl."startDate" DESC, sl.id DESC
        LIMIT 500`,
      vals,
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب خطوط الإشراف"); }
});

router.post("/supervision-lines", authorize(ORG_CREATE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const body = zodParse(supervisionLineSchema.safeParse(req.body));
    if (body.supervisorAssignmentId === body.superviseeAssignmentId) {
      throw new ValidationError("لا يمكن للموظف أن يشرف على نفسه");
    }
    const [row] = await rawQuery<any>(
      `INSERT INTO supervision_lines
        ("companyId", "supervisorAssignmentId", "superviseeAssignmentId",
         "lineType", "scopeType", "scopeId", "startDate", "endDate", "isPrimary")
       VALUES ($1, $2, $3, COALESCE($4, 'administrative'), $5, $6,
               COALESCE($7::date, CURRENT_DATE), $8, COALESCE($9, FALSE))
       RETURNING *`,
      [companyId, body.supervisorAssignmentId, body.superviseeAssignmentId,
       body.lineType ?? null, body.scopeType ?? null, body.scopeId ?? null,
       body.startDate ?? null, body.endDate ?? null, body.isPrimary ?? null],
    );
    await audit(req, "create", "supervision_line", row.id, {
      supervisor: body.supervisorAssignmentId, supervisee: body.superviseeAssignmentId, lineType: body.lineType,
    });
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر إنشاء خط الإشراف"); }
});

router.delete("/supervision-lines/:id", authorize(ORG_DELETE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const result = await rawExecute(
      `UPDATE supervision_lines SET "endDate" = CURRENT_DATE
        WHERE id = $1 AND "companyId" = $2 AND ("endDate" IS NULL OR "endDate" > CURRENT_DATE)`,
      [id, companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("خط الإشراف غير موجود أو منتهٍ مسبقًا");
    await audit(req, "delete", "supervision_line", id, {});
    res.json({ data: { id, endedAt: todayISO() } });
  } catch (e) { handleRouteError(e, res, "تعذّر إنهاء خط الإشراف"); }
});

// ════════════════════════════════════════════════════════════════════════════
// 6. APPROVAL AUTHORITIES (per-person grants — bypass the role matrix)
// ════════════════════════════════════════════════════════════════════════════
const approvalAuthoritySchema = z.object({
  assignmentId: z.number().int().positive(),
  featureKey: z.string().min(1).max(80),
  action: z.string().min(1).max(40),
  currency: z.string().length(3).optional(),
  maxAmount: z.number().nonnegative().optional().nullable(),
  requiresDualControl: z.boolean().optional(),
  reason: z.string().min(1, "السبب مطلوب — هذا تجاوز للقالب"),
  expiresAt: z.string().optional().nullable(),
});

router.get("/approval-authorities", authorize(ORG_READ), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const where: string[] = [`aa."companyId" = $1`];
    const vals: any[] = [companyId];
    if (req.query.assignmentId) {
      where.push(`aa."assignmentId" = $${vals.length + 1}`);
      vals.push(parseId(String(req.query.assignmentId)));
    }
    if (req.query.featureKey) {
      where.push(`aa."featureKey" = $${vals.length + 1}`);
      vals.push(String(req.query.featureKey));
    }
    if (req.query.active === "true") {
      where.push(`(aa."expiresAt" IS NULL OR aa."expiresAt" > now())`);
    }
    const rows = await rawQuery(
      `SELECT aa.id, aa."assignmentId", aa."featureKey", aa.action, aa.currency,
              aa."maxAmount", aa."requiresDualControl", aa.reason,
              aa."expiresAt", aa."grantedBy", aa."createdAt",
              e.name AS "employeeName"
         FROM approval_authorities aa
         LEFT JOIN employee_assignments ea ON ea.id = aa."assignmentId"
         LEFT JOIN employees e ON e.id = ea."employeeId" AND e."deletedAt" IS NULL
        WHERE ${where.join(" AND ")}
        ORDER BY aa."createdAt" DESC LIMIT 500`,
      vals,
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب صلاحيات الاعتماد"); }
});

router.post("/approval-authorities", authorize(ORG_CREATE), async (req, res) => {
  try {
    const { companyId, userId } = requireScope(req);
    const body = zodParse(approvalAuthoritySchema.safeParse(req.body));
    const [row] = await rawQuery<any>(
      `INSERT INTO approval_authorities
        ("companyId", "assignmentId", "featureKey", action, currency,
         "maxAmount", "requiresDualControl", reason, "expiresAt", "grantedBy")
       VALUES ($1, $2, $3, $4, COALESCE($5, 'SAR'), $6, COALESCE($7, FALSE), $8, $9, $10)
       ON CONFLICT ("assignmentId", "featureKey", action, currency) DO UPDATE
          SET "maxAmount" = EXCLUDED."maxAmount",
              "requiresDualControl" = EXCLUDED."requiresDualControl",
              reason = EXCLUDED.reason,
              "expiresAt" = EXCLUDED."expiresAt",
              "grantedBy" = EXCLUDED."grantedBy"
       RETURNING *`,
      [companyId, body.assignmentId, body.featureKey, body.action,
       body.currency ?? null, body.maxAmount ?? null, body.requiresDualControl ?? null,
       body.reason, body.expiresAt ?? null, userId],
    );
    await audit(req, "create", "approval_authority", row.id, {
      assignment: body.assignmentId, feature: body.featureKey, action: body.action,
      maxAmount: body.maxAmount, reason: body.reason,
    });
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر منح صلاحية الاعتماد"); }
});

router.delete("/approval-authorities/:id", authorize(ORG_DELETE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const result = await rawExecute(
      `DELETE FROM approval_authorities WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("صلاحية الاعتماد غير موجودة");
    await audit(req, "delete", "approval_authority", id, {});
    res.json({ data: { id, deleted: true } });
  } catch (e) { handleRouteError(e, res, "تعذّر إلغاء صلاحية الاعتماد"); }
});

// ════════════════════════════════════════════════════════════════════════════
// 7. EMPLOYEE CATEGORIES + ATTENDANCE POLICIES PER CATEGORY (HR-015)
//    System categories live with companyId IS NULL (6 seeded in migration
//    270). Companies can NOT edit system categories from this UI — only
//    add per-company overrides in attendance_policies_per_category.
// ════════════════════════════════════════════════════════════════════════════
// PR-3 (#2077) — the categories catalog is a lookup table used by
// every employee-create form (the wizard's EmployeeCategorySelect)
// and by the per-category attendance settings page. Gated on
// hr.employees:list so any HR operator can render the dropdown;
// the system rows are read-only here regardless of the guard.
router.get("/employee-categories", authorize(HR_EMPLOYEES_READ), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const rows = await rawQuery(
      `SELECT id, "companyId", "categoryKey", "labelAr", "labelEn", description,
              color, "displayOrder", "exemptFromAutoDeduction",
              "trackingFrequencySeconds", "isActive",
              ("companyId" IS NULL) AS "isSystem"
         FROM employee_categories
        WHERE "companyId" = $1 OR "companyId" IS NULL
        ORDER BY "displayOrder", "labelAr"`,
      [companyId],
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب فئات الموظفين"); }
});

const attendancePolicyPerCategorySchema = z.object({
  categoryKey: z.string().min(1).max(40),
  lateThresholdMinutes: z.number().int().min(0).max(180).optional().nullable(),
  gracePeriodMinutes: z.number().int().min(0).max(60).optional().nullable(),
  gpsRadiusMeters: z.number().int().min(0).max(5000).optional().nullable(),
  penaltyLevel1: z.number().nonnegative().optional().nullable(),
  penaltyLevel2: z.number().nonnegative().optional().nullable(),
  penaltyLevel3: z.number().nonnegative().optional().nullable(),
  penaltyLevel4: z.number().nonnegative().optional().nullable(),
  penaltyLevel5: z.number().nonnegative().optional().nullable(),
  autoDeductionEnabled: z.boolean().optional().nullable(),
  trackingFrequencySeconds: z.number().int().min(0).max(3600).optional().nullable(),
});

// PR-3 (#2077) — the per-category policy is a sibling of the
// company-wide /hr/attendance-policy (which uses hr.attendance:list).
// Gating both with the same key keeps the HR Manager flow coherent:
// you can edit the default policy AND its per-category overrides
// from the same permission level (the override page lives under the
// /hr/attendance-categories navigation, not /admin/*).
router.get("/attendance-policies-per-category", authorize(HR_ATTENDANCE_READ), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const rows = await rawQuery(
      `SELECT app.*, ec."labelAr" AS "categoryLabelAr",
              ec."exemptFromAutoDeduction" AS "categoryExempt"
         FROM attendance_policies_per_category app
         LEFT JOIN employee_categories ec ON ec."categoryKey" = app."categoryKey"
          AND (ec."companyId" IS NULL OR ec."companyId" = $1)
        WHERE app."companyId" = $1
        ORDER BY app."categoryKey"`,
      [companyId],
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب overrides سياسة الحضور"); }
});

router.post("/attendance-policies-per-category", authorize(HR_ATTENDANCE_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const body = zodParse(attendancePolicyPerCategorySchema.safeParse(req.body));
    const [row] = await rawQuery<any>(
      `INSERT INTO attendance_policies_per_category
        ("companyId", "categoryKey", "lateThresholdMinutes", "gracePeriodMinutes",
         "gpsRadiusMeters", "penaltyLevel1", "penaltyLevel2", "penaltyLevel3",
         "penaltyLevel4", "penaltyLevel5", "autoDeductionEnabled",
         "trackingFrequencySeconds")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT ("companyId", "categoryKey") DO UPDATE
          SET "lateThresholdMinutes" = EXCLUDED."lateThresholdMinutes",
              "gracePeriodMinutes" = EXCLUDED."gracePeriodMinutes",
              "gpsRadiusMeters" = EXCLUDED."gpsRadiusMeters",
              "penaltyLevel1" = EXCLUDED."penaltyLevel1",
              "penaltyLevel2" = EXCLUDED."penaltyLevel2",
              "penaltyLevel3" = EXCLUDED."penaltyLevel3",
              "penaltyLevel4" = EXCLUDED."penaltyLevel4",
              "penaltyLevel5" = EXCLUDED."penaltyLevel5",
              "autoDeductionEnabled" = EXCLUDED."autoDeductionEnabled",
              "trackingFrequencySeconds" = EXCLUDED."trackingFrequencySeconds"
       RETURNING *`,
      [companyId, body.categoryKey,
       body.lateThresholdMinutes ?? null, body.gracePeriodMinutes ?? null,
       body.gpsRadiusMeters ?? null,
       body.penaltyLevel1 ?? null, body.penaltyLevel2 ?? null, body.penaltyLevel3 ?? null,
       body.penaltyLevel4 ?? null, body.penaltyLevel5 ?? null,
       body.autoDeductionEnabled ?? null, body.trackingFrequencySeconds ?? null],
    );
    await audit(req, "upsert", "attendance_policy_per_category", row.id, {
      categoryKey: body.categoryKey,
    });
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر حفظ override سياسة الحضور"); }
});

router.delete("/attendance-policies-per-category/:id", authorize(HR_ATTENDANCE_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const result = await rawExecute(
      `DELETE FROM attendance_policies_per_category WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("override غير موجود");
    await audit(req, "delete", "attendance_policy_per_category", id, {});
    res.json({ data: { id, deleted: true } });
  } catch (e) { handleRouteError(e, res, "تعذّر حذف override"); }
});

// ════════════════════════════════════════════════════════════════════════════
// 8. ORG MEMBERSHIP BRIDGES (HR-019) — team / committee / project assignments.
//    The 3 bridge tables were created in migration 274/276 but had no
//    way to add/remove memberships from the system. That made §B "look
//    complete" while being operationally empty — you could create a
//    committee but not name members.
//    All endpoints: assignmentId is implicitly per-company (FK chain
//    through employee_assignments which is companyId-scoped). The bridge
//    target (team / committee / project) is checked too.
// ════════════════════════════════════════════════════════════════════════════

async function assertAssignmentInCompany(assignmentId: number, companyId: number): Promise<void> {
  const [row] = await rawQuery<{ id: number }>(
    `SELECT id FROM employee_assignments WHERE id = $1 AND "companyId" = $2`,
    [assignmentId, companyId],
  );
  if (!row) throw new NotFoundError("تعيين الموظف غير موجود أو لا يخص شركتك");
}

async function assertEntityInCompany(table: "teams" | "committees" | "projects", id: number, companyId: number): Promise<void> {
  const [row] = await rawQuery<{ id: number }>(
    `SELECT id FROM ${table} WHERE id = $1 AND "companyId" = $2`,
    [id, companyId],
  );
  if (!row) throw new NotFoundError(`السجل ${id} غير موجود في ${table} بهذه الشركة`);
}

// ─── team memberships ──────────────────────────────────────────────────────
const teamMembershipSchema = z.object({
  assignmentId: z.number().int().positive(),
  teamId: z.number().int().positive(),
  role: z.enum(["member", "lead", "observer"]).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

router.get("/teams/:teamId/members", authorize(ADMIN), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const teamId = parseId(req.params.teamId);
    await assertEntityInCompany("teams", teamId, companyId);
    const rows = await rawQuery(
      `SELECT m.id, m."assignmentId", m.role, m."startDate", m."endDate", m."createdAt",
              e.id AS "employeeId", e.name AS "employeeName",
              ea."jobTitle"
         FROM employee_team_memberships m
         JOIN employee_assignments ea ON ea.id = m."assignmentId"
                                     AND ea."companyId" = $2
         JOIN employees e ON e.id = ea."employeeId" AND e."deletedAt" IS NULL
        WHERE m."teamId" = $1
          AND (m."endDate" IS NULL OR m."endDate" >= CURRENT_DATE)
        ORDER BY m.role DESC, e.name`,
      [teamId, companyId],
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب أعضاء الفريق"); }
});

router.post("/team-memberships", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const body = zodParse(teamMembershipSchema.safeParse(req.body));
    await assertAssignmentInCompany(body.assignmentId, companyId);
    await assertEntityInCompany("teams", body.teamId, companyId);
    const [row] = await rawQuery<any>(
      `INSERT INTO employee_team_memberships
        ("assignmentId", "teamId", role, "startDate", "endDate")
       VALUES ($1, $2, COALESCE($3, 'member'),
               COALESCE($4::date, CURRENT_DATE), $5)
       ON CONFLICT ("assignmentId", "teamId") DO UPDATE
          SET role = EXCLUDED.role,
              "endDate" = EXCLUDED."endDate"
       RETURNING *`,
      [body.assignmentId, body.teamId, body.role ?? null,
       body.startDate ?? null, body.endDate ?? null],
    );
    await audit(req, "upsert", "team_membership", row.id, {
      teamId: body.teamId, assignmentId: body.assignmentId, role: body.role,
    });
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر إضافة عضو الفريق"); }
});

router.delete("/team-memberships/:id", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    // The bridge is companyId-scoped via the assignment FK chain.
    const result = await rawExecute(
      `UPDATE employee_team_memberships m
          SET "endDate" = CURRENT_DATE
         FROM employee_assignments ea
        WHERE m.id = $1 AND m."assignmentId" = ea.id AND ea."companyId" = $2
          AND (m."endDate" IS NULL OR m."endDate" > CURRENT_DATE)`,
      [id, companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("العضوية غير موجودة أو منتهية");
    await audit(req, "end-date", "team_membership", id, {});
    res.json({ data: { id, endedAt: todayISO() } });
  } catch (e) { handleRouteError(e, res, "تعذّر إنهاء عضوية الفريق"); }
});

// ─── committee memberships ─────────────────────────────────────────────────
const committeeMembershipSchema = z.object({
  assignmentId: z.number().int().positive(),
  committeeId: z.number().int().positive(),
  role: z.enum(["member", "chair", "secretary"]).optional(),
  isVoting: z.boolean().optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

router.get("/committees/:committeeId/members", authorize(ADMIN), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const committeeId = parseId(req.params.committeeId);
    await assertEntityInCompany("committees", committeeId, companyId);
    const rows = await rawQuery(
      `SELECT m.id, m."assignmentId", m.role, m."isVoting",
              m."startDate", m."endDate", m."createdAt",
              e.id AS "employeeId", e.name AS "employeeName",
              ea."jobTitle"
         FROM employee_committee_memberships m
         JOIN employee_assignments ea ON ea.id = m."assignmentId"
                                     AND ea."companyId" = $2
         JOIN employees e ON e.id = ea."employeeId" AND e."deletedAt" IS NULL
        WHERE m."committeeId" = $1
          AND (m."endDate" IS NULL OR m."endDate" >= CURRENT_DATE)
        ORDER BY
          CASE m.role WHEN 'chair' THEN 0 WHEN 'secretary' THEN 1 ELSE 2 END,
          e.name`,
      [committeeId, companyId],
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب أعضاء اللجنة"); }
});

router.post("/committee-memberships", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const body = zodParse(committeeMembershipSchema.safeParse(req.body));
    await assertAssignmentInCompany(body.assignmentId, companyId);
    await assertEntityInCompany("committees", body.committeeId, companyId);
    const [row] = await rawQuery<any>(
      `INSERT INTO employee_committee_memberships
        ("assignmentId", "committeeId", role, "isVoting", "startDate", "endDate")
       VALUES ($1, $2, COALESCE($3, 'member'), COALESCE($4, TRUE),
               COALESCE($5::date, CURRENT_DATE), $6)
       ON CONFLICT ("assignmentId", "committeeId") DO UPDATE
          SET role = EXCLUDED.role,
              "isVoting" = EXCLUDED."isVoting",
              "endDate" = EXCLUDED."endDate"
       RETURNING *`,
      [body.assignmentId, body.committeeId, body.role ?? null,
       body.isVoting ?? null, body.startDate ?? null, body.endDate ?? null],
    );
    await audit(req, "upsert", "committee_membership", row.id, {
      committeeId: body.committeeId, assignmentId: body.assignmentId,
      role: body.role, isVoting: body.isVoting,
    });
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر إضافة عضو اللجنة"); }
});

router.delete("/committee-memberships/:id", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const result = await rawExecute(
      `UPDATE employee_committee_memberships m
          SET "endDate" = CURRENT_DATE
         FROM employee_assignments ea
        WHERE m.id = $1 AND m."assignmentId" = ea.id AND ea."companyId" = $2
          AND (m."endDate" IS NULL OR m."endDate" > CURRENT_DATE)`,
      [id, companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("العضوية غير موجودة أو منتهية");
    await audit(req, "end-date", "committee_membership", id, {});
    res.json({ data: { id, endedAt: todayISO() } });
  } catch (e) { handleRouteError(e, res, "تعذّر إنهاء عضوية اللجنة"); }
});

// ─── project assignments (with allocation%) ────────────────────────────────
const projectAssignmentSchema = z.object({
  assignmentId: z.number().int().positive(),
  projectId: z.number().int().positive(),
  role: z.string().max(80).optional(),
  allocationPercent: z.number().positive().max(100).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  costCenterId: z.number().int().positive().optional().nullable(),
});

router.get("/projects/:projectId/contributors", authorize(ADMIN), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const projectId = parseId(req.params.projectId);
    await assertEntityInCompany("projects", projectId, companyId);
    const rows = await rawQuery(
      `SELECT m.id, m."assignmentId", m.role, m."allocationPercent",
              m."startDate", m."endDate", m."costCenterId", m."createdAt",
              e.id AS "employeeId", e.name AS "employeeName",
              ea."jobTitle"
         FROM employee_project_assignments m
         JOIN employee_assignments ea ON ea.id = m."assignmentId"
                                     AND ea."companyId" = $2
         JOIN employees e ON e.id = ea."employeeId" AND e."deletedAt" IS NULL
        WHERE m."projectId" = $1
          AND (m."endDate" IS NULL OR m."endDate" >= CURRENT_DATE)
        ORDER BY m."allocationPercent" DESC, e.name`,
      [projectId, companyId],
    );
    // Compute allocation utilisation (sum should typically = 100).
    const totalAlloc = rows.reduce((acc, r: any) => acc + Number(r.allocationPercent || 0), 0);
    res.json({ data: rows, total: rows.length, totalAllocationPercent: totalAlloc });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب فريق المشروع"); }
});

router.post("/project-assignments", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const body = zodParse(projectAssignmentSchema.safeParse(req.body));
    await assertAssignmentInCompany(body.assignmentId, companyId);
    await assertEntityInCompany("projects", body.projectId, companyId);
    const [row] = await rawQuery<any>(
      `INSERT INTO employee_project_assignments
        ("assignmentId", "projectId", role, "allocationPercent",
         "startDate", "endDate", "costCenterId")
       VALUES ($1, $2, COALESCE($3, 'contributor'), COALESCE($4, 100),
               COALESCE($5::date, CURRENT_DATE), $6, $7)
       RETURNING *`,
      [body.assignmentId, body.projectId, body.role ?? null,
       body.allocationPercent ?? null, body.startDate ?? null,
       body.endDate ?? null, body.costCenterId ?? null],
    );
    await audit(req, "create", "project_assignment", row.id, {
      projectId: body.projectId, assignmentId: body.assignmentId,
      role: body.role, allocationPercent: body.allocationPercent,
    });
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر إضافة عضو فريق المشروع"); }
});

router.delete("/project-assignments/:id", authorize(ADMIN_WRITE), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const result = await rawExecute(
      `UPDATE employee_project_assignments m
          SET "endDate" = CURRENT_DATE
         FROM employee_assignments ea
        WHERE m.id = $1 AND m."assignmentId" = ea.id AND ea."companyId" = $2
          AND (m."endDate" IS NULL OR m."endDate" > CURRENT_DATE)`,
      [id, companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("التعيين غير موجود أو منتهٍ");
    await audit(req, "end-date", "project_assignment", id, {});
    res.json({ data: { id, endedAt: todayISO() } });
  } catch (e) { handleRouteError(e, res, "تعذّر إنهاء تعيين المشروع"); }
});

// ════════════════════════════════════════════════════════════════════════════
// 9. SCORING WEIGHTS PER COMPANY (HR-020) + COMPANY-WIDE RANKING.
//    Closes audit risk R4: weights were hardcoded in the engine.
// ════════════════════════════════════════════════════════════════════════════
const scoringWeightsSchema = z.object({
  categoryKey: z.string().max(40).optional().nullable(),
  disciplineWeight: z.number().min(0).max(1),
  activityWeight: z.number().min(0).max(1),
  productivityWeight: z.number().min(0).max(1),
  qualityWeight: z.number().min(0).max(1),
  managerWeight: z.number().min(0).max(1),
  developmentWeight: z.number().min(0).max(1),
});

// PR-4 (#2077) — same logic as the attendance-policy gates in PR-3:
// the score-weights table is per-company HR settings (drives the
// 6-dimension composite computed by employeeScoringEngine), so it
// belongs in the hr.employees lane, not under admin:*. Reads use
// hr.employees:list so the score detail page can render weight
// callouts; writes use hr.employees:update because they reshape how
// every score in the company is computed.
router.get("/scoring-weights", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const rows = await rawQuery(
      `SELECT * FROM scoring_weights_per_company
        WHERE "companyId" = $1
        ORDER BY "categoryKey" NULLS FIRST`,
      [companyId],
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب أوزان التقييم"); }
});

router.post("/scoring-weights", authorize({ feature: "hr.employees", action: "update" }), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const body = zodParse(scoringWeightsSchema.safeParse(req.body));
    // Pre-validate the sum so we return a friendlier Arabic error
    // than what Postgres would emit from the CHECK constraint.
    const sum = body.disciplineWeight + body.activityWeight + body.productivityWeight
              + body.qualityWeight + body.managerWeight + body.developmentWeight;
    if (Math.abs(sum - 1) > 0.001) {
      throw new ValidationError(`مجموع الأوزان الستة يجب أن يساوي 1.0 (الحالي: ${sum.toFixed(3)})`);
    }
    const [row] = await rawQuery<any>(
      `INSERT INTO scoring_weights_per_company
        ("companyId", "categoryKey",
         "disciplineWeight", "activityWeight", "productivityWeight",
         "qualityWeight", "managerWeight", "developmentWeight",
         "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
       ON CONFLICT ("companyId", "categoryKey") DO UPDATE
          SET "disciplineWeight" = EXCLUDED."disciplineWeight",
              "activityWeight" = EXCLUDED."activityWeight",
              "productivityWeight" = EXCLUDED."productivityWeight",
              "qualityWeight" = EXCLUDED."qualityWeight",
              "managerWeight" = EXCLUDED."managerWeight",
              "developmentWeight" = EXCLUDED."developmentWeight",
              "updatedAt" = now()
       RETURNING *`,
      [companyId, body.categoryKey ?? null,
       body.disciplineWeight, body.activityWeight, body.productivityWeight,
       body.qualityWeight, body.managerWeight, body.developmentWeight],
    );
    await audit(req, "upsert", "scoring_weights", row.id, {
      categoryKey: body.categoryKey ?? null,
    });
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر حفظ أوزان التقييم"); }
});

router.delete("/scoring-weights/:id", authorize({ feature: "hr.employees", action: "update" }), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const id = parseId(req.params.id);
    const result = await rawExecute(
      `DELETE FROM scoring_weights_per_company WHERE id = $1 AND "companyId" = $2`,
      [id, companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("override الأوزان غير موجود");
    await audit(req, "delete", "scoring_weights", id, {});
    res.json({ data: { id, deleted: true } });
  } catch (e) { handleRouteError(e, res, "تعذّر حذف override الأوزان"); }
});

// Company-wide ranking — top N employees by composite for a given period.
router.get("/scoring-ranking", authorize({ feature: "hr.employees", action: "list" }), async (req, res) => {
  try {
    const { companyId } = requireScope(req);
    const scope = (String(req.query.scope || "monthly")) as "weekly" | "monthly" | "quarterly";
    if (!["weekly", "monthly", "quarterly"].includes(scope)) {
      throw new ValidationError("scope must be weekly | monthly | quarterly");
    }
    const periodKey = req.query.periodKey ? String(req.query.periodKey) : null;
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    // If no periodKey provided, use the most recent one in the company.
    const [latest] = periodKey ? [{ periodKey }] : await rawQuery<{ periodKey: string }>(
      `SELECT "periodKey" FROM employee_scores
        WHERE "companyId" = $1 AND scope = $2
        ORDER BY "periodKey" DESC LIMIT 1`,
      [companyId, scope],
    );
    if (!latest) {
      res.json({ data: [], total: 0, scope, periodKey: null,
                 message: "لا توجد بيانات تقييم بعد — انتظر تشغيل cron التقييم" });
      return;
    }
    const rows = await rawQuery(
      `SELECT s.id, s."assignmentId", s."employeeId", s."compositeScore", s.trend,
              s."disciplineScore", s."activityScore", s."productivityScore",
              s."qualityScore", s."managerScore", s."developmentScore",
              e.name AS "employeeName",
              ea."jobTitle",
              ROW_NUMBER() OVER (ORDER BY s."compositeScore" DESC) AS rank
         FROM employee_scores s
         JOIN employees e ON e.id = s."employeeId" AND e."deletedAt" IS NULL
         JOIN employee_assignments ea ON ea.id = s."assignmentId"
        WHERE s."companyId" = $1 AND s.scope = $2 AND s."periodKey" = $3
        ORDER BY s."compositeScore" DESC
        LIMIT $4`,
      [companyId, scope, latest.periodKey, limit],
    );
    res.json({ data: rows, total: rows.length, scope, periodKey: latest.periodKey });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب ترتيب التقييم"); }
});

export default router;
