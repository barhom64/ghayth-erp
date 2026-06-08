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
import { createAuditLog, todayISO } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

const ADMIN = { feature: "admin", action: "list" } as const;
const ADMIN_WRITE = { feature: "admin", action: "update" } as const;

// ─── helpers ────────────────────────────────────────────────────────────────
function requireScope(req: any): { companyId: number; userId: number } {
  const scope = req.scope;
  if (!scope?.companyId || !scope?.userId) {
    throw new ValidationError("scope مفقود — مطلوب companyId و userId");
  }
  return { companyId: scope.companyId, userId: scope.userId };
}

async function audit(
  req: any, action: string, entity: string, entityId: number, after: Record<string, any> = {}
): Promise<void> {
  try {
    const scope = req.scope!;
    await createAuditLog({
      userId: scope.userId, companyId: scope.companyId,
      action, entity, entityId, after,
      activeRoleKey: scope.selectedRoleKey ?? null,
    });
  } catch (e) { logger.warn({ err: e }, "[org] audit failed"); }
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
  level: z.number().int().min(0).max(100),
  isActive: z.boolean().optional(),
});

router.get("/positions", authorize(ADMIN), async (req, res) => {
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

router.get("/teams", authorize(ADMIN), async (req, res) => {
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

router.get("/committees", authorize(ADMIN), async (req, res) => {
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

router.get("/supervision-lines", authorize(ADMIN), async (req, res) => {
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

router.post("/supervision-lines", authorize(ADMIN_WRITE), async (req, res) => {
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

router.delete("/supervision-lines/:id", authorize(ADMIN_WRITE), async (req, res) => {
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

router.get("/approval-authorities", authorize(ADMIN), async (req, res) => {
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
         LEFT JOIN employees e ON e.id = ea."employeeId"
        WHERE ${where.join(" AND ")}
        ORDER BY aa."createdAt" DESC LIMIT 500`,
      vals,
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب صلاحيات الاعتماد"); }
});

router.post("/approval-authorities", authorize(ADMIN_WRITE), async (req, res) => {
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

router.delete("/approval-authorities/:id", authorize(ADMIN_WRITE), async (req, res) => {
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

export default router;
