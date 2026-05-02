import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import {
  emitEvent,
  createAuditLog,
  todayISO,
  generateTimeRef,
} from "../lib/businessHelpers.js";
import { applyTransition, lifecycleErrorResponse, LifecycleError } from "../lib/lifecycleEngine.js";
import { logger } from "../lib/logger.js";
import { encryptField, decryptPilgrimRow, blindIndex, SENSITIVE_PILGRIM_FIELDS, logSensitiveAccess } from "../lib/fieldEncryption.js";

// ─────────────────────────────────────────────────────────────────────────────
// LIFECYCLE STATE MACHINES — Umrah domain
// ─────────────────────────────────────────────────────────────────────────────
const PILGRIM_STATUSES = ["pending", "arrived", "active", "overstayed", "departed", "violated", "cancelled"] as const;
const PILGRIM_TRANSITIONS: Record<string, readonly string[]> = {
  pending:    ["arrived", "cancelled"],
  arrived:    ["active", "departed", "overstayed", "cancelled"],
  active:     ["departed", "overstayed", "violated"],
  overstayed: ["departed", "violated"],
  departed:   [],
  violated:   [],
  cancelled:  [],
};

const SEASON_STATUSES = ["open", "closed", "archived"] as const;
const SEASON_TRANSITIONS: Record<string, readonly string[]> = {
  open:     ["closed"],
  closed:   ["archived"],
  archived: [],
};

const TRANSPORT_STATUSES = ["scheduled", "in_progress", "completed", "cancelled"] as const;
const TRANSPORT_TRANSITIONS: Record<string, readonly string[]> = {
  scheduled:   ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed:   [],
  cancelled:   [],
};

const AGENT_STATUSES = ["active", "inactive", "suspended", "blocked"] as const;
const AGENT_TRANSITIONS: Record<string, readonly string[]> = {
  active:    ["inactive", "suspended", "blocked"],
  inactive:  ["active"],
  suspended: ["active", "blocked"],
  blocked:   [],
};

const PENALTY_STATUSES = ["pending", "invoiced", "paid", "waived"] as const;
const PENALTY_TRANSITIONS: Record<string, readonly string[]> = {
  pending:  ["invoiced", "waived"],
  invoiced: ["paid", "waived"],
  paid:     [],
  waived:   [],
};

const AGENT_INVOICE_STATUSES = ["draft", "sent", "partially_paid", "paid", "overdue", "cancelled"] as const;
const AGENT_INVOICE_TRANSITIONS: Record<string, readonly string[]> = {
  draft:          ["sent", "cancelled"],
  sent:           ["partially_paid", "paid", "overdue", "cancelled"],
  partially_paid: ["paid", "overdue"],
  overdue:        ["partially_paid", "paid", "cancelled"],
  paid:           [],
  cancelled:      [],
};

const router = Router();

const createSeasonSchema = z.object({
  title: z.string().min(1, "اسم الموسم مطلوب"),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string().min(1, "تاريخ النهاية مطلوب"),
  notes: z.string().optional(),
});

const createAgentSchema = z.object({
  name: z.string().min(1, "اسم الوكيل مطلوب"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  country: z.string().optional(),
  profitMargin: z.coerce.number().optional(),
  contractRef: z.string().optional(),
  currency: z.string().optional(),
  notes: z.string().optional(),
});

const createPackageSchema = z.object({
  name: z.string().min(1, "اسم الباقة مطلوب"),
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  costPrice: z.coerce.number().optional(),
  sellPrice: z.coerce.number().optional(),
  includesTransport: z.boolean().optional(),
  includesHotel: z.boolean().optional(),
  includesMeals: z.boolean().optional(),
  includesZiyarat: z.boolean().optional(),
  duration: z.coerce.number().optional(),
  description: z.string().optional(),
});

const createPilgrimSchema = z.object({
  fullName: z.string().min(1, "الاسم الكامل مطلوب"),
  passportNumber: z.string().min(1, "رقم جواز السفر مطلوب"),
  seasonId: z.coerce.number().optional(),
  agentId: z.coerce.number().optional(),
  packageId: z.coerce.number().optional(),
  visaNumber: z.string().optional(),
  nationality: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  phone: z.string().optional(),
  arrivalDate: z.string().optional(),
  departureDate: z.string().optional(),
  hotelName: z.string().optional(),
  roomNumber: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const createTransportSchema = z.object({
  seasonId: z.coerce.number().optional(),
  tripDate: z.string(),
  fromLocation: z.string(),
  toLocation: z.string(),
  vehicleId: z.coerce.number().optional(),
  driverId: z.coerce.number().optional(),
  capacity: z.coerce.number().optional(),
  pilgrimCount: z.coerce.number().optional(),
  cost: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const patchSeasonSchema = z.object({
  title: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const patchAgentSchema = z.object({
  name: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  country: z.string().optional(),
  profitMargin: z.coerce.number().optional(),
  contractRef: z.string().optional(),
  currency: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const patchPackageSchema = z.object({
  name: z.string().optional(),
  seasonId: z.coerce.number().optional(),
  costPrice: z.coerce.number().optional(),
  sellPrice: z.coerce.number().optional(),
  includesTransport: z.boolean().optional(),
  includesHotel: z.boolean().optional(),
  includesMeals: z.boolean().optional(),
  includesZiyarat: z.boolean().optional(),
  duration: z.coerce.number().optional(),
  description: z.string().optional(),
});

const patchPilgrimSchema = z.object({
  status: z.string().optional(),
  agentId: z.coerce.number().optional().nullable(),
  packageId: z.coerce.number().optional().nullable(),
  fullName: z.string().optional(),
  passportNumber: z.string().optional(),
  visaNumber: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  gender: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  arrivalDate: z.string().optional().nullable(),
  departureDate: z.string().optional().nullable(),
  actualArrival: z.string().optional().nullable(),
  actualDeparture: z.string().optional().nullable(),
  hotelName: z.string().optional().nullable(),
  roomNumber: z.string().optional().nullable(),
  transportAssigned: z.boolean().optional(),
  notes: z.string().optional().nullable(),
});

const importPreviewSchema = z.object({
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  rows: z.array(z.any()).min(1, "بيانات المعاينة غير مكتملة"),
  fileType: z.string().optional(),
});

const importMutamersSchema = z.object({
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  rows: z.array(z.any()).min(1, "بيانات الاستيراد غير مكتملة"),
});

const importVouchersSchema = z.object({
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  rows: z.array(z.any()).min(1, "بيانات الاستيراد غير مكتملة"),
});

const importSchema = z.object({
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  rows: z.array(z.any()).min(1, "بيانات الاستيراد غير مكتملة"),
  fileType: z.string().optional(),
  fileName: z.string().optional(),
});

const runPenaltyEngineSchema = z.object({
  overstayDays: z.coerce.number().optional(),
  dailyRate: z.coerce.number().optional(),
});

const waivePenaltySchema = z.object({
  reason: z.string().min(1, "سبب الإعفاء مطلوب"),
});

const recordPaymentSchema = z.object({
  amount: z.coerce.number().positive("مبلغ الدفع مطلوب"),
  paymentMethod: z.string().optional(),
  reference: z.string().optional(),
});

const generateInvoiceSchema = z.object({
  agentId: z.coerce.number({ required_error: "الوكيل مطلوب" }),
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
});

const patchTransportSchema = z.object({
  status: z.string().optional(),
  seasonId: z.coerce.number().optional(),
  tripDate: z.string().optional(),
  fromLocation: z.string().optional(),
  toLocation: z.string().optional(),
  vehicleId: z.coerce.number().optional(),
  driverId: z.coerce.number().optional(),
  capacity: z.coerce.number().optional(),
  pilgrimCount: z.coerce.number().optional(),
  cost: z.coerce.number().optional(),
  notes: z.string().optional(),
});

const assignPilgrimsSchema = z.object({
  pilgrimIds: z.array(z.coerce.number()).min(1, "يجب تحديد معتمر واحد على الأقل"),
});

const bulkAssignSchema = z.object({
  pilgrimIds: z.array(z.coerce.number()).min(1, "بيانات التوزيع غير مكتملة"),
  agentId: z.coerce.number({ required_error: "بيانات التوزيع غير مكتملة" }),
});

const createViolationSchema = z.object({
  type: z.string().min(1, "نوع المخالفة مطلوب"),
  referenceType: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  mutamerId: z.coerce.number().optional().nullable(),
  agentId: z.coerce.number().optional().nullable(),
  subAgentId: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable(),
  penaltyAmount: z.coerce.number().optional(),
  status: z.string().optional(),
});

const patchViolationSchema = z.object({
  type: z.string().optional(),
  referenceType: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  mutamerId: z.coerce.number().optional().nullable(),
  agentId: z.coerce.number().optional().nullable(),
  subAgentId: z.coerce.number().optional().nullable(),
  description: z.string().optional().nullable(),
  penaltyAmount: z.coerce.number().optional(),
  status: z.string().optional(),
  linkedInvoiceId: z.coerce.number().optional().nullable(),
});

const createPenaltySchema = z.object({
  pilgrimId: z.coerce.number().optional().nullable(),
  agentId: z.coerce.number().optional().nullable(),
  seasonId: z.coerce.number().optional().nullable(),
  type: z.string().optional(),
  amount: z.coerce.number().optional(),
  reason: z.string().optional().nullable(),
  status: z.string().optional(),
});

router.get("/seasons", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_seasons WHERE "companyId"=$1 ORDER BY "startDate" DESC LIMIT 100`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List seasons error"); }
});

router.get("/seasons/:id", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT * FROM umrah_seasons WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الموسم غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Season detail error"); }
});

router.post("/seasons", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createSeasonSchema.safeParse(req.body)) as any;
    const rows = await rawQuery(
      `INSERT INTO umrah_seasons ("companyId",title,"startDate","endDate",notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [scope.companyId, b.title, b.startDate, b.endDate, b.notes]
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء الموسم");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_seasons", entityId: rows[0].id, after: { title: b.title } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.season.opened", entity: "umrah_seasons", entityId: rows[0].id, after: { title: b.title } }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create season error"); }
});

router.patch("/seasons/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchSeasonSchema.safeParse(req.body));
    let originalStatus: string | undefined;
    if (b.status !== undefined) {
      const [existing] = await rawQuery<any>(`SELECT status FROM umrah_seasons WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
      if (!existing) throw new NotFoundError("الموسم غير موجود");
      originalStatus = existing.status;
      if (b.status !== existing.status) {
        const allowed = SEASON_TRANSITIONS[existing.status] ?? [];
        if (!allowed.includes(b.status)) {
          throw new ConflictError(
            `لا يمكن نقل الموسم من "${existing.status}" إلى "${b.status}"`,
            { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد (حالة نهائية)"}` }
          );
        }
      }
    }
    if (b.status === "closed") {
      const open = await rawQuery(
        `SELECT COUNT(*) as c FROM umrah_pilgrims WHERE "seasonId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND status IN ('arrived','active','overstayed')`,
        [id, scope.companyId]
      );
      if (Number(open[0]?.c) > 0) {
        throw new ValidationError(`لا يمكن إغلاق الموسم — يوجد ${open[0].c} معتمر نشط`, { meta: { blockers: [{ type: "active_pilgrims", count: Number(open[0].c) }] } });
      }
      const unpaid = await rawQuery(
        `SELECT COUNT(*) as c FROM umrah_agent_invoices WHERE "seasonId"=$1 AND "companyId"=$2 AND status NOT IN ('paid','cancelled')`,
        [id, scope.companyId]
      );
      if (Number(unpaid[0]?.c) > 0) {
        throw new ValidationError(`لا يمكن إغلاق الموسم — يوجد ${unpaid[0].c} فاتورة غير مسددة`, { meta: { blockers: [{ type: "unpaid_invoices", count: Number(unpaid[0].c) }] } });
      }
    }
    const params: any[] = [];
    const sets: string[] = [];
    if (b.title !== undefined) { params.push(b.title); sets.push(`title=$${params.length}`); }
    if (b.startDate !== undefined) { params.push(b.startDate); sets.push(`"startDate"=$${params.length}`); }
    if (b.endDate !== undefined) { params.push(b.endDate); sets.push(`"endDate"=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    let seasonUpdateWhere = `id=$${params.length-1} AND "companyId"=$${params.length}`;
    if (originalStatus !== undefined) { params.push(originalStatus); seasonUpdateWhere += ` AND status=$${params.length}`; }
    await rawExecute(`UPDATE umrah_seasons SET ${sets.join(",")} WHERE ${seasonUpdateWhere}`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_seasons WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_seasons", entityId: Number(id), after: { status: b.status } }).catch((e) => logger.error(e, "umrah background task failed"));
    if (b.status) {
      emitEvent({ companyId: scope.companyId, userId: scope.userId, action: `umrah.season.${b.status}`, entity: "umrah_seasons", entityId: Number(id), after: { status: b.status } }).catch((e) => logger.error(e, "umrah background task failed"));
    }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update season error"); }
});

router.get("/agents", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_agents WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY name LIMIT 500`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List agents error"); }
});

router.get("/agents/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) { throw new NotFoundError("الوكيل غير موجود"); }
    const stats = await rawQuery(
      `SELECT COUNT(*)::int AS "pilgrimCount",
              COUNT(*) FILTER (WHERE status='overstayed')::int AS "overstayedCount"
       FROM umrah_pilgrims WHERE "agentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    res.json({ ...row, ...(stats[0] || {}) });
  } catch (err) { handleRouteError(err, res, "Get agent error"); }
});

router.post("/agents", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createAgentSchema.safeParse(req.body)) as any;
    const rows = await rawQuery(
      `INSERT INTO umrah_agents ("companyId",name,"contactPerson",phone,email,country,"profitMargin","contractRef",currency,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [scope.companyId, b.name, b.contactPerson, b.phone, b.email, b.country, b.profitMargin || 0, b.contractRef, b.currency || "SAR", b.notes]
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء الوكيل");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_agents", entityId: rows[0].id, after: { name: b.name } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.agent.created", entity: "umrah_agents", entityId: rows[0].id, details: JSON.stringify({ name: b.name, country: b.country }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create agent error"); }
});

router.patch("/agents/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchAgentSchema.safeParse(req.body));
    let originalAgentStatus: string | undefined;
    if (b.status !== undefined) {
      const [existing] = await rawQuery<any>(`SELECT status FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
      if (!existing) throw new NotFoundError("الوكيل غير موجود");
      originalAgentStatus = existing.status;
      if (b.status !== existing.status) {
        const allowed = AGENT_TRANSITIONS[existing.status] ?? [];
        if (!allowed.includes(b.status)) {
          throw new ConflictError(
            `لا يمكن نقل حالة الوكيل من "${existing.status}" إلى "${b.status}"`,
            { field: "status", fix: `الانتقالات المسموحة: ${allowed.length ? allowed.join(", ") : "لا يوجد (حالة نهائية)"}` }
          );
        }
      }
    }
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["name","contactPerson","phone","email","country","profitMargin","contractRef","currency","status","notes"] as const) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    let agentUpdateWhere = `id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`;
    if (originalAgentStatus !== undefined) { params.push(originalAgentStatus); agentUpdateWhere += ` AND status=$${params.length}`; }
    await rawExecute(`UPDATE umrah_agents SET ${sets.join(",")} WHERE ${agentUpdateWhere}`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_agents", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.agent.updated", entity: "umrah_agents", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update agent error"); }
});

router.delete("/agents/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT id, name FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("الوكيل غير موجود");
    const [inUse] = await rawQuery<any>(`SELECT COUNT(*)::int AS c FROM umrah_pilgrims WHERE "agentId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (Number(inUse?.c) > 0) {
      throw new ConflictError(`لا يمكن حذف الوكيل — مرتبط بـ ${inUse.c} معتمر`);
    }
    await rawExecute(`UPDATE umrah_agents SET "deletedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_agents", entityId: id, before: { name: existing.name } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.agent.deleted", entity: "umrah_agents", entityId: id, details: JSON.stringify({ name: existing.name }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete agent error"); }
});

router.get("/packages", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT p.*, s.title as "seasonTitle" FROM umrah_packages p LEFT JOIN umrah_seasons s ON p."seasonId"=s.id WHERE p."companyId"=$1 ORDER BY p.name LIMIT 500`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List packages error"); }
});

router.post("/packages", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createPackageSchema.safeParse(req.body)) as any;
    const rows = await rawQuery(
      `INSERT INTO umrah_packages ("companyId",name,"seasonId","costPrice","sellPrice","includesTransport","includesHotel","includesMeals","includesZiyarat",duration,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [scope.companyId, b.name, b.seasonId, b.costPrice, b.sellPrice, b.includesTransport || false, b.includesHotel || false, b.includesMeals || false, b.includesZiyarat || false, b.duration || 7, b.description]
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء الباقة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_packages", entityId: rows[0].id, after: { name: b.name } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.package.created", entity: "umrah_packages", entityId: rows[0].id, details: JSON.stringify({ name: b.name, costPrice: b.costPrice, sellPrice: b.sellPrice }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create package error"); }
});

router.get("/packages/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT p.*, s.title AS "seasonTitle" FROM umrah_packages p
       LEFT JOIN umrah_seasons s ON p."seasonId" = s.id
       WHERE p.id = $1 AND p."companyId" = $2`,
      [id, scope.companyId]
    );
    if (!row) { throw new NotFoundError("الباقة غير موجودة"); }
    const pilgrims = await rawQuery(
      `SELECT COUNT(*)::int AS c FROM umrah_pilgrims WHERE "packageId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    res.json({ ...row, pilgrimCount: pilgrims[0]?.c || 0 });
  } catch (err) { handleRouteError(err, res, "Get package error"); }
});

router.patch("/packages/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchPackageSchema.safeParse(req.body));
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["name","seasonId","costPrice","sellPrice","includesTransport","includesHotel","includesMeals","includesZiyarat","duration","description"] as const) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    sets.push(`"updatedAt"=NOW()`);
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE umrah_packages SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_packages WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_packages", entityId: id, after: b }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.package.updated", entity: "umrah_packages", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update package error"); }
});

router.delete("/packages/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const inUse = await rawQuery(
      `SELECT COUNT(*)::int AS c FROM umrah_pilgrims WHERE "packageId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (Number(inUse[0]?.c) > 0) {
      throw new ConflictError(`لا يمكن حذف الباقة — مرتبطة بـ ${inUse[0].c} معتمر`);
    }
    await applyTransition({
      entity: "umrah_packages",
      id: id,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: "umrah.package.deleted",
      toState: "deleted",
    });
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete package error"); }
});

router.get("/pilgrims", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, status, agentId, search, page = "1", limit = "20" } = req.query as any;
    let where = `p."companyId"=$1 AND p."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND p."seasonId"=$${params.length}`; }
    if (status) { params.push(status); where += ` AND p.status=$${params.length}`; }
    if (agentId) { params.push(agentId); where += ` AND p."agentId"=$${params.length}`; }
    if (search) {
      const searchHash = blindIndex(String(search));
      params.push(`%${search}%`);
      const likePh = params.length;
      params.push(searchHash);
      const hashPh = params.length;
      where += ` AND (p."fullName" ILIKE $${likePh} OR p."passportNumber_hash" = $${hashPh} OR p."visaNumber_hash" = $${hashPh})`;
    }
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Number(limit) || 20;
    const offset = (pageNum - 1) * perPage;
    const countQ = await rawQuery(`SELECT COUNT(*) as c FROM umrah_pilgrims p WHERE ${where}`, params);
    params.push(perPage); params.push(offset);
    const rows = await rawQuery(
      `SELECT p.*, a.name as "agentName", pkg.name as "packageName"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_agents a ON p."agentId"=a.id
       LEFT JOIN umrah_packages pkg ON p."packageId"=pkg.id
       WHERE ${where}
       ORDER BY p."createdAt" DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    logSensitiveAccess({ companyId: scope.companyId, userId: scope.userId, action: "list", entity: "umrah_pilgrims", ipAddress: req.ip, userAgent: req.headers["user-agent"], details: { count: rows.length, search: search || null } });
    res.json({ data: rows.map(decryptPilgrimRow), total: Number(countQ[0]?.c || 0), page: pageNum, pageSize: perPage });
  } catch (err) { handleRouteError(err, res, "List pilgrims error"); }
});

router.post("/pilgrims", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createPilgrimSchema.safeParse(req.body)) as any;

    if (!b.fullName || !String(b.fullName).trim()) {
      throw new ValidationError("اسم المعتمر مطلوب", {
        field: "fullName",
        fix: "أدخل الاسم الكامل للمعتمر كما في جواز السفر",
      });
    }
    if (!b.passportNumber || !String(b.passportNumber).trim()) {
      throw new ValidationError("رقم جواز السفر مطلوب", {
        field: "passportNumber",
        fix: "أدخل رقم جواز السفر",
      });
    }
    if (!b.seasonId) {
      throw new ValidationError("الموسم مطلوب", {
        field: "seasonId",
        fix: "اختر موسم العمرة من القائمة",
      });
    }

    // FK pre-check: season must be in caller's company. Prevents opaque
    // 23503 on FK violation.
    const [season] = await rawQuery<{ id: number }>(
      `SELECT id FROM umrah_seasons WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
      [Number(b.seasonId), scope.companyId]
    );
    if (!season) {
      throw new ValidationError(`الموسم رقم ${b.seasonId} غير موجود`, {
        field: "seasonId",
        fix: "اختر موسماً مسجلاً",
      });
    }
    if (b.agentId) {
      const [agent] = await rawQuery<{ id: number }>(
        `SELECT id FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [Number(b.agentId), scope.companyId]
      );
      if (!agent) {
        throw new ValidationError(`الوكيل رقم ${b.agentId} غير موجود`, {
          field: "agentId",
          fix: "اختر وكيلاً مسجلاً أو اتركه فارغاً",
        });
      }
    }
    if (b.packageId) {
      const [pkg] = await rawQuery<{ id: number }>(
        `SELECT id FROM umrah_packages WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
        [Number(b.packageId), scope.companyId]
      );
      if (!pkg) {
        throw new ValidationError(`الباقة رقم ${b.packageId} غير موجودة`, {
          field: "packageId",
          fix: "اختر باقة مسجلة أو اتركها فارغة",
        });
      }
    }

    const passportPlain = String(b.passportNumber).trim();
    const visaPlain = b.visaNumber ? String(b.visaNumber).trim() : null;
    const rows = await rawQuery(
      `INSERT INTO umrah_pilgrims ("companyId","branchId","seasonId","agentId","packageId","fullName","passportNumber","passportNumber_hash","visaNumber","visaNumber_hash",nationality,gender,"dateOfBirth",phone,"arrivalDate","departureDate","hotelName","roomNumber",notes,"createdBy","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW()) RETURNING *`,
      [
        scope.companyId,
        scope.branchId || null,
        Number(b.seasonId),
        b.agentId ? Number(b.agentId) : null,
        b.packageId ? Number(b.packageId) : null,
        String(b.fullName).trim(),
        encryptField(passportPlain),
        blindIndex(passportPlain),
        visaPlain ? encryptField(visaPlain) : null,
        visaPlain ? blindIndex(visaPlain) : null,
        b.nationality ?? null,
        b.gender ?? null,
        b.dateOfBirth ?? null,
        b.phone ?? null,
        b.arrivalDate ?? null,
        b.departureDate ?? null,
        b.hotelName ?? null,
        b.roomNumber ?? null,
        b.notes ?? null,
        scope.userId,
      ]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_pilgrims", entityId: rows[0]?.id, after: { fullName: String(b.fullName).trim() } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.pilgrim.created", entity: "umrah_pilgrims", entityId: rows[0]?.id, after: { fullName: String(b.fullName).trim() } }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(decryptPilgrimRow(rows[0]));
  } catch (err) { handleRouteError(err, res, "Create pilgrim error"); }
});

router.patch("/pilgrims/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const b = zodParse(patchPilgrimSchema.safeParse(req.body));
    const pilgrimId = parseId(req.params.id, "id");
    const fieldKeys = ["agentId","packageId","fullName","passportNumber","visaNumber","nationality","gender","dateOfBirth","phone","arrivalDate","departureDate","actualArrival","actualDeparture","hotelName","roomNumber","transportAssigned","notes"] as const;

    const encryptIfSensitive = (key: string, val: any): any => {
      if (!val) return val;
      if (key === "passportNumber" || key === "visaNumber" || key === "mofaNumber" || key === "borderNumber") {
        return encryptField(String(val).trim());
      }
      return val;
    };

    if (b.status !== undefined) {
      const setExtras: Record<string, any> = {};
      for (const key of fieldKeys) {
        if (b[key] !== undefined) {
          setExtras[key] = encryptIfSensitive(key, b[key]);
          if (key === "passportNumber") setExtras["passportNumber_hash"] = blindIndex(String(b[key]).trim());
          if (key === "visaNumber") setExtras["visaNumber_hash"] = blindIndex(String(b[key]).trim());
        }
      }
      const fromStates = Object.entries(PILGRIM_TRANSITIONS)
        .filter(([, targets]) => targets.includes(b.status!))
        .map(([from]) => from);

      const row = await applyTransition({
        entity: "umrah_pilgrims",
        id: pilgrimId,
        scope,
        action: "umrah.pilgrim.status_changed",
        fromStates,
        toState: b.status!,
        setExtras: Object.keys(setExtras).length > 0 ? setExtras : undefined,
        extraWhere: `"deletedAt" IS NULL`,
        after: { newStatus: b.status },
      });
      res.json(decryptPilgrimRow(row));
    } else {
      const params: any[] = [];
      const sets: string[] = [];
      for (const key of fieldKeys) {
        if (b[key] !== undefined) {
          params.push(encryptIfSensitive(key, b[key]));
          sets.push(`"${key}"=$${params.length}`);
          if (key === "passportNumber") { params.push(blindIndex(String(b[key]).trim())); sets.push(`"passportNumber_hash"=$${params.length}`); }
          if (key === "visaNumber") { params.push(blindIndex(String(b[key]).trim())); sets.push(`"visaNumber_hash"=$${params.length}`); }
        }
      }
      if (sets.length === 0) {
        const [row] = await rawQuery(`SELECT * FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [pilgrimId, scope.companyId]);
        if (!row) throw new NotFoundError("المعتمر غير موجود");
        res.json(decryptPilgrimRow(row));
        return;
      }
      sets.push(`"updatedAt"=NOW()`);
      params.push(pilgrimId); params.push(scope.companyId);
      await rawExecute(`UPDATE umrah_pilgrims SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
      const [row] = await rawQuery(`SELECT * FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [pilgrimId, scope.companyId]);
      if (!row) throw new NotFoundError("المعتمر غير موجود");
      createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_pilgrims", entityId: pilgrimId }).catch((e) => logger.error(e, "umrah background task failed"));
      emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pilgrim.updated", entity: "umrah_pilgrims", entityId: pilgrimId, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah background task failed"));
      res.json(decryptPilgrimRow(row));
    }
  } catch (err) {
    const lr = lifecycleErrorResponse(err);
    if (lr) { res.status(lr.status).json(lr.body); return; }
    handleRouteError(err, res, "Update pilgrim error");
  }
});

router.get("/pilgrims/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT p.*, a.name as "agentName", pkg.name as "packageName", s.title as "seasonTitle"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_agents a ON p."agentId"=a.id
       LEFT JOIN umrah_packages pkg ON p."packageId"=pkg.id
       LEFT JOIN umrah_seasons s ON p."seasonId"=s.id
       WHERE p.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL`, [id, scope.companyId]
    );
    if (!row) { throw new NotFoundError("المعتمر غير موجود"); }
    logSensitiveAccess({ companyId: scope.companyId, userId: scope.userId, action: "read", entity: "umrah_pilgrims", entityId: id, ipAddress: req.ip, userAgent: req.headers["user-agent"] });
    const penalties = await rawQuery(`SELECT * FROM umrah_penalties WHERE "pilgrimId"=$1 AND "companyId"=$2 ORDER BY "createdAt" DESC LIMIT 500`, [id, scope.companyId]);
    res.json({ ...decryptPilgrimRow(row), penalties });
  } catch (err) { handleRouteError(err, res, "Get pilgrim error"); }
});

router.delete("/pilgrims/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT id, "fullName", status FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("المعتمر غير موجود");
    if (existing.status === "arrived") {
      throw new ConflictError("لا يمكن حذف معتمر وصل بالفعل");
    }
    const [invoiced] = await rawQuery<any>(`SELECT COUNT(*)::int AS c FROM umrah_penalties WHERE "pilgrimId"=$1 AND "companyId"=$2 AND status='invoiced'`, [id, scope.companyId]);
    if (Number(invoiced?.c) > 0) {
      throw new ConflictError("لا يمكن حذف معتمر عليه غرامات مُفوترة");
    }
    await rawExecute(`UPDATE umrah_pilgrims SET "deletedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_pilgrims", entityId: id, before: { fullName: existing.fullName } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pilgrim.deleted", entity: "umrah_pilgrims", entityId: id, details: JSON.stringify({ fullName: existing.fullName }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete pilgrim error"); }
});

router.post("/import/preview", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { seasonId, rows: importRows, fileType } = zodParse(importPreviewSchema.safeParse(req.body));
    const passportNumbers = importRows.filter((r: any) => r.passportNumber).map((r: any) => r.passportNumber);
    const existingRows = passportNumbers.length > 0
      ? await rawQuery<any>(`SELECT "passportNumber" FROM umrah_pilgrims WHERE "companyId"=$1 AND "seasonId"=$2 AND "passportNumber" = ANY($3) AND "deletedAt" IS NULL`, [scope.companyId, seasonId, passportNumbers])
      : [];
    const existingSet = new Set(existingRows.map((r: any) => r.passportNumber));
    const newRows = importRows.filter((r: any) => r.passportNumber && !existingSet.has(r.passportNumber));
    const duplicateRows = importRows.filter((r: any) => r.passportNumber && existingSet.has(r.passportNumber));
    const errorRows = importRows.filter((r: any) => !r.passportNumber || !r.fullName);
    const nuskCodes = [...new Set(importRows.map((r: any) => r.nuskCode).filter(Boolean))];
    const linkedAgents = nuskCodes.length > 0
      ? await rawQuery<any>(`SELECT "nuskCode", name FROM umrah_sub_agents WHERE "companyId"=$1 AND "nuskCode" = ANY($2)`, [scope.companyId, nuskCodes])
      : [];
    const linkedSet = new Set(linkedAgents.map((a: any) => a.nuskCode));
    const unlinkedSubAgents = nuskCodes.filter((c) => !linkedSet.has(c)).map((c) => ({ nuskCode: c }));
    res.json({
      totalRows: importRows.length,
      newRecords: newRows.length,
      duplicateRecords: duplicateRows.length,
      errorRecords: errorRows.length,
      unlinkedSubAgents,
      sampleNew: newRows.slice(0, 5),
      sampleDuplicate: duplicateRows.slice(0, 5),
      sampleErrors: errorRows.slice(0, 5),
    });
  } catch (err) { handleRouteError(err, res, "Import preview error"); }
});

router.post("/import/mutamers", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { seasonId, rows: importRows } = zodParse(importMutamersSchema.safeParse(req.body));
    const importBody = { seasonId, rows: importRows, fileType: "mutamers", fileName: "import-mutamers" };
    const fakeReq = { ...req, body: importBody };
    // Reuse existing import logic via internal redirect
    const result = await doImport(scope, importBody);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Import mutamers error"); }
});

router.post("/import/vouchers", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { seasonId, rows: importRows } = zodParse(importVouchersSchema.safeParse(req.body));
    const result = await doImport(scope, { seasonId, rows: importRows, fileType: "vouchers", fileName: "import-vouchers" });
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Import vouchers error"); }
});



async function doImport(scope: any, body: { seasonId: number; rows: any[]; fileType?: string; fileName?: string }) {
  const { seasonId, rows: importRows, fileType, fileName } = body;
  if (!seasonId || !Array.isArray(importRows) || importRows.length === 0) {
    throw new ValidationError("بيانات الاستيراد غير مكتملة");
  }

  const { insertId: logId } = await rawExecute(
    `INSERT INTO umrah_import_logs ("companyId","seasonId","userId","fileName","fileType","totalRows","newRecords","updatedRecords","duplicateRecords","errorRecords",errors,status)
     VALUES ($1,$2,$3,$4,$5,$6,0,0,0,0,'[]','processing') RETURNING id`,
    [scope.companyId, seasonId, scope.userId, fileName || "import", fileType || "excel", importRows.length]
  );

  const BATCH_SIZE = 100;
  let newCount = 0, updateCount = 0, dupCount = 0, errCount = 0;
  const errors: any[] = [];

  for (let batchStart = 0; batchStart < importRows.length; batchStart += BATCH_SIZE) {
    const batch = importRows.slice(batchStart, batchStart + BATCH_SIZE);
    const passportNumbers = batch.filter((r: any) => r.passportNumber).map((r: any) => r.passportNumber as string);
    const existingRows = passportNumbers.length > 0
      ? await rawQuery<any>(`SELECT id, "passportNumber" FROM umrah_pilgrims WHERE "companyId"=$1 AND "seasonId"=$2 AND "passportNumber" = ANY($3)`, [scope.companyId, seasonId, passportNumbers])
      : [];
    const existingMap = new Map<string, number>(existingRows.map((r: any) => [r.passportNumber, r.id]));

    for (let i = 0; i < batch.length; i++) {
      const globalRow = batchStart + i;
      const r = batch[i];
      if (!r.passportNumber || !r.fullName) { errCount++; errors.push({ row: globalRow + 1, error: "بيانات ناقصة" }); continue; }
      if (existingMap.has(r.passportNumber)) {
        const existingId = existingMap.get(r.passportNumber)!;
        const sets: string[] = []; const params: any[] = [];
        for (const key of ["fullName","visaNumber","nationality","gender","phone","arrivalDate","departureDate","agentId","hotelName","roomNumber"]) {
          if (r[key] !== undefined && r[key] !== null && r[key] !== "") { params.push(r[key]); sets.push(`"${key}"=$${params.length}`); }
        }
        if (sets.length > 0) {
          sets.push(`"updatedAt"=NOW()`); params.push(existingId); params.push(scope.companyId);
          await rawExecute(`UPDATE umrah_pilgrims SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length}`, params);
          updateCount++;
        } else { dupCount++; }
      } else {
        try {
          await rawExecute(
            `INSERT INTO umrah_pilgrims ("companyId","seasonId","agentId","fullName","passportNumber","visaNumber",nationality,gender,phone,"arrivalDate","departureDate","hotelName","roomNumber") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [scope.companyId, seasonId, r.agentId || null, r.fullName, r.passportNumber, r.visaNumber || null, r.nationality || null, r.gender || null, r.phone || null, r.arrivalDate || null, r.departureDate || null, r.hotelName || null, r.roomNumber || null]
          );
          newCount++;
        } catch (insertErr: any) { errCount++; errors.push({ row: globalRow + 1, error: insertErr?.message ?? "خطأ في الإدراج" }); }
      }
    }
    await rawExecute(
      `UPDATE umrah_import_logs SET "newRecords"=$1,"updatedRecords"=$2,"duplicateRecords"=$3,"errorRecords"=$4,errors=$5,"processedRows"=$6 WHERE id=$7 AND "companyId"=$8`,
      [newCount, updateCount, dupCount, errCount, JSON.stringify(errors), Math.min(batchStart + BATCH_SIZE, importRows.length), logId, scope.companyId]
    ).catch((e) => logger.error(e, "umrah background task failed"));
  }

  await rawExecute(
    `UPDATE umrah_import_logs SET "newRecords"=$1,"updatedRecords"=$2,"duplicateRecords"=$3,"errorRecords"=$4,errors=$5,"processedRows"=$6,status='completed' WHERE id=$7 AND "companyId"=$8`,
    [newCount, updateCount, dupCount, errCount, JSON.stringify(errors), importRows.length, logId, scope.companyId]
  );
  createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_import_logs", entityId: logId, after: { total: importRows.length, new: newCount, updated: updateCount } }).catch((e) => logger.error(e, "umrah background task failed"));
  emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.import.completed", entity: "umrah_import_logs", entityId: logId, details: JSON.stringify({ total: importRows.length, new: newCount, updated: updateCount, errors: errCount }) }).catch((e) => logger.error(e, "umrah background task failed"));
  return { importLogId: logId, batchId: logId, total: importRows.length, new: newCount, updated: updateCount, duplicates: dupCount, errors: errCount, errorDetails: errors };
}

router.post("/import", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const result = await doImport(scope, zodParse(importSchema.safeParse(req.body)));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Import error"); }
});

router.get("/dashboard", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as any;
    let seasonFilter = "";
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); seasonFilter = ` AND "seasonId"=$${params.length}`; }
    const stats = await rawQuery(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='pending') as pending,
        COUNT(*) FILTER (WHERE status='arrived') as arrived,
        COUNT(*) FILTER (WHERE status='active') as active,
        COUNT(*) FILTER (WHERE status='overstayed') as overstayed,
        COUNT(*) FILTER (WHERE status='departed') as departed,
        COUNT(*) FILTER (WHERE status='violated') as violated,
        COUNT(*) FILTER (WHERE status='cancelled') as cancelled,
        COUNT(*) FILTER (WHERE "agentId" IS NULL) as unassigned
      FROM umrah_pilgrims WHERE "companyId"=$1 AND "deletedAt" IS NULL${seasonFilter}
    `, params);
    const penaltyStats = await rawQuery(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(amount),0) as "totalAmount",
        COUNT(*) FILTER (WHERE status='pending') as pending
      FROM umrah_penalties WHERE "companyId"=$1${seasonFilter}
    `, params);
    const agentStats = await rawQuery(`
      SELECT a.id, a.name, COUNT(p.id) as "pilgrimCount",
        COUNT(p.id) FILTER (WHERE p.status='overstayed') as "overstayedCount"
      FROM umrah_agents a
      LEFT JOIN umrah_pilgrims p ON p."agentId"=a.id AND p."companyId"=$1 AND p."deletedAt" IS NULL${seasonFilter}
      WHERE a."companyId"=$1 AND a.status='active' AND a."deletedAt" IS NULL
      GROUP BY a.id, a.name ORDER BY "pilgrimCount" DESC LIMIT 10
    `, params);
    const recentArrivals = await rawQuery(`
      SELECT id,"fullName","passportNumber",nationality,"actualArrival",status
      FROM umrah_pilgrims WHERE "companyId"=$1 AND "deletedAt" IS NULL${seasonFilter} AND "actualArrival" IS NOT NULL
      ORDER BY "actualArrival" DESC LIMIT 10
    `, params);
    res.json({
      pilgrims: stats[0],
      penalties: penaltyStats[0],
      topAgents: agentStats,
      recentArrivals
    });
  } catch (err) { handleRouteError(err, res, "Dashboard error"); }
});

router.post("/run-daily-status", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const today = todayISO();

    const pendingToArrived = await rawQuery<any>(
      `SELECT id FROM umrah_pilgrims WHERE "companyId"=$1 AND status='pending' AND "arrivalDate" <= $2 AND ("departureDate" IS NULL OR "departureDate" >= $2) AND "deletedAt" IS NULL`,
      [scope.companyId, today]
    );
    const toOverstayed = await rawQuery<any>(
      `SELECT id, status FROM umrah_pilgrims WHERE "companyId"=$1 AND status IN ('arrived','active') AND "departureDate" < $2 AND "actualDeparture" IS NULL AND "deletedAt" IS NULL`,
      [scope.companyId, today]
    );
    const toDeparted = await rawQuery<any>(
      `SELECT id, status FROM umrah_pilgrims WHERE "companyId"=$1 AND status IN ('arrived','active') AND "actualDeparture" IS NOT NULL AND "actualDeparture" <= $2 AND "deletedAt" IS NULL`,
      [scope.companyId, today]
    );

    let arrivedUpdated = 0, overstayedUpdated = 0, departedUpdated = 0;

    for (const p of pendingToArrived) {
      try {
        await applyTransition({
          entity: "umrah_pilgrims", id: p.id, scope,
          action: "umrah.pilgrim.arrived",
          fromStates: ["pending"], toState: "arrived",
          setExtras: { actualArrival: today },
          extraWhere: `"deletedAt" IS NULL`,
        });
        arrivedUpdated++;
      } catch (e) { logger.warn(e, "umrah pilgrim arrival state already changed"); }
    }
    for (const p of toOverstayed) {
      try {
        await applyTransition({
          entity: "umrah_pilgrims", id: p.id, scope,
          action: "umrah.pilgrim.overstayed",
          fromStates: ["arrived", "active"], toState: "overstayed",
          extraWhere: `"deletedAt" IS NULL`,
        });
        overstayedUpdated++;
      } catch (e) { logger.warn(e, "umrah pilgrim overstayed state already changed"); }
    }
    for (const p of toDeparted) {
      try {
        await applyTransition({
          entity: "umrah_pilgrims", id: p.id, scope,
          action: "umrah.pilgrim.departed",
          fromStates: ["arrived", "active"], toState: "departed",
          extraWhere: `"deletedAt" IS NULL`,
        });
        departedUpdated++;
      } catch (e) { logger.warn(e, "umrah pilgrim departed state already changed"); }
    }

    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.daily_status.run", entity: "umrah_pilgrims", entityId: 0, details: JSON.stringify({ date: today, arrivedUpdated, overstayedUpdated, departedUpdated }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ date: today, arrivedUpdated, overstayedUpdated, departedUpdated });
  } catch (err) { handleRouteError(err, res, "Daily status error"); }
});

router.post("/run-penalty-engine", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { overstayDays = 3, dailyRate = 500 } = zodParse(runPenaltyEngineSchema.safeParse(req.body));
    const today = todayISO();
    const overstayed = await rawQuery(
      `SELECT p.id, p."passportNumber", p."fullName", p."agentId", p."seasonId", p."departureDate",
        ($1::date - p."departureDate"::date) as "daysOver"
       FROM umrah_pilgrims p
       WHERE p."companyId"=$2 AND p."deletedAt" IS NULL AND p.status='overstayed' AND p."departureDate" < $1
         AND NOT EXISTS (SELECT 1 FROM umrah_penalties pen WHERE pen."pilgrimId"=p.id AND pen.type='overstay' AND pen.status IN ('pending','invoiced'))`,
      [today, scope.companyId]
    );
    let created = 0;
    for (const p of overstayed) {
      if (Number(p.daysOver) >= overstayDays) {
        const amount = Number(p.daysOver) * dailyRate;
        const penRows = await withTransaction(async (client) => {
          const penRes = await client.query(
            `INSERT INTO umrah_penalties ("companyId","pilgrimId","agentId","seasonId",type,"daysOverstayed",amount,notes)
             VALUES ($1,$2,$3,$4,'overstay',$5,$6,$7) RETURNING id`,
            [scope.companyId, p.id, p.agentId, p.seasonId, p.daysOver, amount, `غرامة تأخر ${p.daysOver} يوم — ${p.fullName}`]
          );
          return penRes.rows;
        });
        await applyTransition({
          entity: "umrah_pilgrims",
          id: p.id,
          scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
          action: "umrah.pilgrim.violated",
          fromStates: ["overstayed"],
          toState: "violated",
          extraWhere: `"deletedAt" IS NULL`,
        });
        if (penRows[0]?.id) {
          try {
            const { umrahEngine } = await import("../lib/engines/index.js");
            await umrahEngine.postPenaltyGL(
              { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
              { id: penRows[0].id, amount, pilgrimName: p.fullName, agentName: undefined, type: "overstay" }
            );
          } catch (e) { logger.error(e, "umrah penalty GL posting failed (non-blocking)"); }
        }
        created++;
      }
    }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_penalties", entityId: 0, after: { checked: overstayed.length, penaltiesCreated: created } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.penalty_engine.run", entity: "umrah_penalties", entityId: 0, details: JSON.stringify({ checked: overstayed.length, penaltiesCreated: created }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ checked: overstayed.length, penaltiesCreated: created });
  } catch (err) { handleRouteError(err, res, "Penalty engine error"); }
});

router.get("/penalties", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId, status } = req.query as any;
    let where = `pen."companyId"=$1`;
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND pen."seasonId"=$${params.length}`; }
    if (status) { params.push(status); where += ` AND pen.status=$${params.length}`; }
    const rows = await rawQuery(
      `SELECT pen.*, p."fullName" as "pilgrimName", p."passportNumber", a.name as "agentName"
       FROM umrah_penalties pen
       LEFT JOIN umrah_pilgrims p ON pen."pilgrimId"=p.id
       LEFT JOIN umrah_agents a ON pen."agentId"=a.id
       WHERE ${where} ORDER BY pen."createdAt" DESC LIMIT 500`, params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List penalties error"); }
});

router.get("/penalties/:id", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT pen.*, p."fullName" AS "pilgrimName", p."passportNumber", a.name AS "agentName"
       FROM umrah_penalties pen
       LEFT JOIN umrah_pilgrims p ON pen."pilgrimId"=p.id
       LEFT JOIN umrah_agents a ON pen."agentId"=a.id
       WHERE pen.id=$1 AND pen."companyId"=$2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("العقوبة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Penalty detail error"); }
});

router.patch("/penalties/:id/waive", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { reason } = zodParse(waivePenaltySchema.safeParse(req.body));
    const [penalty] = await rawQuery<any>(`SELECT pen.*, p."fullName" as "pilgrimName" FROM umrah_penalties pen LEFT JOIN umrah_pilgrims p ON pen."pilgrimId"=p.id WHERE pen.id=$1 AND pen."companyId"=$2`, [id, scope.companyId]);
    if (!penalty) throw new NotFoundError("العقوبة غير موجودة");
    await applyTransition({
      entity: "umrah_penalties",
      id,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: "umrah.penalty.waived",
      fromStates: ["pending", "invoiced"],
      toState: "waived",
      reason,
      setExtras: { waivedBy: scope.userId, waivedAt: { raw: "NOW()" } },
      skipUpdatedAt: true,
    });
    if (Number(penalty.amount) > 0) {
      try {
        const { umrahEngine } = await import("../lib/engines/index.js");
        await umrahEngine.postPenaltyWaiverGL(
          { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
          { id, amount: Number(penalty.amount), pilgrimName: penalty.pilgrimName || "" }
        );
      } catch (e) { logger.error(e, "umrah penalty waiver GL posting failed (non-blocking)"); }
    }
    const [row] = await rawQuery(`SELECT * FROM umrah_penalties WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json(row);
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Waive penalty error");
  }
});

router.post("/agent-invoices/:id/record-payment", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { amount, paymentMethod, reference } = zodParse(recordPaymentSchema.safeParse(req.body));
    const [invoice] = await rawQuery<any>(`SELECT * FROM umrah_agent_invoices WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!invoice) throw new NotFoundError("الفاتورة غير موجودة");
    const paidSoFar = Number(invoice.paidAmount || 0) + Number(amount);
    const newStatus = paidSoFar >= Number(invoice.total) ? "paid" : "partially_paid";
    await applyTransition({
      entity: "umrah_agent_invoices",
      id,
      scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
      action: `umrah.agent_invoice.${newStatus}`,
      fromStates: ["sent", "partially_paid", "overdue"],
      toState: newStatus,
      setExtras: { paidAmount: paidSoFar },
      after: { paymentAmount: Number(amount), paymentMethod, reference, paidSoFar },
    });
    const [row] = await rawQuery(`SELECT * FROM umrah_agent_invoices WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json(row);
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Record payment error");
  }
});

router.post("/agent-invoices/generate", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { agentId, seasonId } = zodParse(generateInvoiceSchema.safeParse(req.body));
    const pilgrims = await rawQuery(
      `SELECT COUNT(*) as c FROM umrah_pilgrims WHERE "agentId"=$1 AND "seasonId"=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
      [agentId, seasonId, scope.companyId]
    );
    const pilgrimCount = Number(pilgrims[0]?.c || 0);
    if (pilgrimCount === 0) { throw new ValidationError("لا يوجد معتمرين لهذا الوكيل في هذا الموسم"); }
    const [agent] = await rawQuery(`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [agentId, scope.companyId]);
    if (!agent) { throw new NotFoundError("الوكيل غير موجود"); }
    const penalties = await rawQuery(
      `SELECT COALESCE(SUM(amount),0) as total FROM umrah_penalties WHERE "agentId"=$1 AND "seasonId"=$2 AND "companyId"=$3 AND status='pending'`,
      [agentId, seasonId, scope.companyId]
    );
    const penaltiesTotal = Number(penalties[0]?.total || 0);
    const pkgCosts = await rawQuery(
      `SELECT COALESCE(SUM(pkg."sellPrice"),0) as "servicesTotal"
       FROM umrah_pilgrims p
       JOIN umrah_packages pkg ON p."packageId"=pkg.id
       WHERE p."agentId"=$1 AND p."seasonId"=$2 AND p."companyId"=$3 AND p."deletedAt" IS NULL`,
      [agentId, seasonId, scope.companyId]
    );
    const servicesTotal = Number(pkgCosts[0]?.servicesTotal || 0);
    const subtotal = servicesTotal + penaltiesTotal;
    const commission = subtotal * (Number(agent?.profitMargin || 0) / 100);
    const total = subtotal - commission;
    const ref = generateTimeRef("UMRAH-INV");
    const rows = await rawQuery(
      `INSERT INTO umrah_agent_invoices ("companyId","agentId","seasonId",ref,type,"pilgrimCount","penaltiesTotal","servicesTotal",subtotal,commission,total,status)
       VALUES ($1,$2,$3,$4,'sales',$5,$6,$7,$8,$9,$10,'draft') RETURNING *`,
      [scope.companyId, agentId, seasonId, ref, pilgrimCount, penaltiesTotal, servicesTotal, subtotal, commission, total]
    );
    if (penaltiesTotal > 0) {
      await rawExecute(
        `UPDATE umrah_penalties SET status='invoiced', "invoiceId"=$1 WHERE "agentId"=$2 AND "seasonId"=$3 AND "companyId"=$4 AND status='pending'`,
        [rows[0].id, agentId, seasonId, scope.companyId]
      );
    }

    try {
      const { umrahEngine } = await import("../lib/engines/index.js");
      const journalId = await umrahEngine.postAgentInvoiceGL(
        { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
        { id: rows[0].id, ref, agentName: agent.name, agentId, total, servicesTotal, penaltiesTotal, commission }
      );

      await rawExecute(
        `UPDATE umrah_agent_invoices SET "journalEntryId"=$1 WHERE id=$2 AND "companyId"=$3`,
        [journalId, rows[0].id, scope.companyId]
      ).catch((e) => logger.error(e, "umrah background task failed"));

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "umrah.invoice.gl_posted",
        entity: "umrah_agent_invoices",
        entityId: rows[0].id,
        details: JSON.stringify({ journalId, total, servicesTotal, penaltiesTotal, commission }),
      }).catch((e) => logger.error(e, "umrah background task failed"));
    } catch (glErr) {
      logger.error({ err: glErr, invoiceId: rows[0].id }, "[umrah] GL posting failed for agent invoice");
    }

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_agent_invoices", entityId: rows[0]?.id, after: { agentId, seasonId, total } }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Generate invoice error"); }
});

router.get("/agent-invoices", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { agentId, seasonId } = req.query as any;
    let where = `i."companyId"=$1`;
    const params: any[] = [scope.companyId];
    if (agentId) { params.push(agentId); where += ` AND i."agentId"=$${params.length}`; }
    if (seasonId) { params.push(seasonId); where += ` AND i."seasonId"=$${params.length}`; }
    const rows = await rawQuery(
      `SELECT i.*, a.name as "agentName", s.title as "seasonTitle"
       FROM umrah_agent_invoices i
       LEFT JOIN umrah_agents a ON i."agentId"=a.id
       LEFT JOIN umrah_seasons s ON i."seasonId"=s.id
       WHERE ${where} ORDER BY i."createdAt" DESC LIMIT 500`, params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List agent invoices error"); }
});

router.get("/invoices/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT i.*, a.name as "agentName", s.title as "seasonTitle"
       FROM umrah_agent_invoices i
       LEFT JOIN umrah_agents a ON i."agentId"=a.id
       LEFT JOIN umrah_seasons s ON i."seasonId"=s.id
       WHERE i.id=$1 AND i."companyId"=$2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الفاتورة غير موجودة");
    const penalties = await rawQuery(
      `SELECT * FROM umrah_penalties WHERE "invoiceId"=$1 AND "companyId"=$2 ORDER BY "createdAt" DESC LIMIT 500`,
      [id, scope.companyId]
    );
    res.json({ ...row, penalties });
  } catch (err) { handleRouteError(err, res, "Get invoice error"); }
});

router.get("/transport", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT t.*, v."plateNumber" as "vehiclePlate", d.name as "driverName"
       FROM umrah_transport t
       LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId"
       LEFT JOIN fleet_drivers d ON d.id = t."driverId"
       WHERE t."companyId"=$1 ORDER BY t."tripDate" DESC LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List transport error"); }
});

router.get("/transport/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT t.*, v."plateNumber" as "vehiclePlate", v.make as "vehicleMake", v.model as "vehicleModel",
              d.name as "driverName", d.phone as "driverPhone"
       FROM umrah_transport t
       LEFT JOIN fleet_vehicles v ON v.id = t."vehicleId"
       LEFT JOIN fleet_drivers d ON d.id = t."driverId"
       WHERE t.id=$1 AND t."companyId"=$2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("رحلة النقل غير موجودة");
    const pilgrims = await rawQuery(
      `SELECT id, "fullName", "passportNumber", nationality, status FROM umrah_pilgrims WHERE "companyId"=$1 AND "transportAssigned"=true AND "deletedAt" IS NULL ORDER BY "fullName"`,
      [scope.companyId]
    );
    res.json({ ...row, pilgrims });
  } catch (err) { handleRouteError(err, res, "Get transport error"); }
});

router.delete("/transport/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT id, status FROM umrah_transport WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("رحلة النقل غير موجودة");
    if (existing.status === "in_progress") {
      throw new ConflictError("لا يمكن حذف رحلة قيد التنفيذ");
    }
    await rawExecute(`DELETE FROM umrah_transport WHERE id=$1 AND "companyId"=$2 AND status != 'in_progress'`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_transport", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.transport.deleted", entity: "umrah_transport", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete transport error"); }
});

router.post("/transport", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createTransportSchema.safeParse(req.body)) as any;
    if (b.vehicleId) {
      const [vehicle] = await rawQuery<any>(
        `SELECT id, status FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2`,
        [b.vehicleId, scope.companyId]
      );
      if (!vehicle) throw new ValidationError("المركبة غير موجودة في الأسطول");
      if (vehicle.status === "maintenance") throw new ConflictError("المركبة قيد الصيانة ولا يمكن تخصيصها");
    }
    if (b.driverId) {
      const [driver] = await rawQuery<any>(
        `SELECT id, status, "licenseExpiry" FROM fleet_drivers WHERE id=$1 AND "companyId"=$2`,
        [b.driverId, scope.companyId]
      );
      if (!driver) throw new ValidationError("السائق غير موجود في الأسطول");
      if (driver.status === "inactive") throw new ConflictError("السائق غير نشط ولا يمكن تخصيصه");
      if (driver.licenseExpiry && new Date(driver.licenseExpiry) < new Date(b.tripDate)) {
        throw new ConflictError("رخصة السائق منتهية الصلاحية في تاريخ الرحلة");
      }
    }
    if (b.pilgrimCount && b.capacity && b.pilgrimCount > b.capacity) {
      throw new ValidationError(`عدد المعتمرين (${b.pilgrimCount}) يتجاوز سعة المركبة (${b.capacity})`);
    }
    const rows = await rawQuery(
      `INSERT INTO umrah_transport ("companyId","seasonId","tripDate","fromLocation","toLocation","vehicleId","driverId",capacity,"pilgrimCount",cost,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [scope.companyId, b.seasonId, b.tripDate, b.fromLocation, b.toLocation, b.vehicleId, b.driverId, b.capacity || 45, b.pilgrimCount || 0, b.cost || 0, b.notes]
    );

    const tripCost = Number(b.cost || 0);
    if (tripCost > 0) {
      try {
        const { umrahEngine } = await import("../lib/engines/index.js");
        await umrahEngine.postTransportExpenseGL(
          { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
          { id: rows[0].id, cost: tripCost, fromLocation: b.fromLocation, toLocation: b.toLocation, vehicleId: b.vehicleId || undefined, driverId: b.driverId || undefined }
        );
      } catch (glErr) {
        logger.error(glErr, "Transport GL posting failed:");
      }
    }

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_transport", entityId: rows[0]?.id, after: { fromLocation: b.fromLocation, toLocation: b.toLocation } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.transport.created", entity: "umrah_transport", entityId: rows[0]?.id, details: JSON.stringify({ fromLocation: b.fromLocation, toLocation: b.toLocation, cost: b.cost }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create transport error"); }
});

router.patch("/transport/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchTransportSchema.safeParse(req.body));
    if (b.vehicleId) {
      const [vehicle] = await rawQuery<any>(`SELECT id, status FROM fleet_vehicles WHERE id=$1 AND "companyId"=$2`, [b.vehicleId, scope.companyId]);
      if (!vehicle) throw new ValidationError("المركبة غير موجودة في الأسطول");
      if (vehicle.status === "maintenance") throw new ConflictError("المركبة قيد الصيانة");
    }
    if (b.driverId) {
      const [driver] = await rawQuery<any>(`SELECT id, status, "licenseExpiry" FROM fleet_drivers WHERE id=$1 AND "companyId"=$2`, [b.driverId, scope.companyId]);
      if (!driver) throw new ValidationError("السائق غير موجود في الأسطول");
      if (driver.status === "inactive") throw new ConflictError("السائق غير نشط");
    }

    if (b.status !== undefined) {
      const fieldKeys = ["seasonId","tripDate","fromLocation","toLocation","vehicleId","driverId","capacity","pilgrimCount","cost","notes"] as const;
      const setExtras: Record<string, any> = {};
      for (const key of fieldKeys) { if (b[key] !== undefined) setExtras[key] = b[key]; }
      const fromStates = Object.entries(TRANSPORT_TRANSITIONS)
        .filter(([, targets]) => targets.includes(b.status!))
        .map(([from]) => from);

      const row = await applyTransition({
        entity: "umrah_transport",
        id,
        scope,
        action: "umrah.transport.status_changed",
        fromStates,
        toState: b.status!,
        setExtras: Object.keys(setExtras).length > 0 ? setExtras : undefined,
        skipUpdatedAt: true,
      });
      res.json(row);
    } else {
      const params: any[] = [];
      const sets: string[] = [];
      for (const key of ["seasonId","tripDate","fromLocation","toLocation","vehicleId","driverId","capacity","pilgrimCount","cost","notes"] as const) {
        if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
      }
      if (sets.length === 0) {
        const [row] = await rawQuery(`SELECT * FROM umrah_transport WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
        if (!row) throw new NotFoundError("رحلة النقل غير موجودة");
        res.json(row); return;
      }
      params.push(id); params.push(scope.companyId);
      await rawExecute(`UPDATE umrah_transport SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length}`, params);
      const [row] = await rawQuery(`SELECT * FROM umrah_transport WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
      if (!row) throw new NotFoundError("رحلة النقل غير موجودة");
      createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_transport", entityId: id, after: b }).catch((e) => logger.error(e, "umrah background task failed"));
      emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.transport.updated", entity: "umrah_transport", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "umrah background task failed"));
      res.json(row);
    }
  } catch (err) {
    const lr = lifecycleErrorResponse(err);
    if (lr) { res.status(lr.status).json(lr.body); return; }
    handleRouteError(err, res, "Update transport error");
  }
});

router.post("/transport/:id/assign-pilgrims", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const transportId = parseId(req.params.id, "id");
    const { pilgrimIds } = zodParse(assignPilgrimsSchema.safeParse(req.body));
    const [transport] = await rawQuery<any>(`SELECT * FROM umrah_transport WHERE id=$1 AND "companyId"=$2`, [transportId, scope.companyId]);
    if (!transport) throw new NotFoundError("رحلة النقل غير موجودة");
    if (transport.status === "completed" || transport.status === "cancelled") {
      throw new ConflictError("لا يمكن إضافة معتمرين لرحلة مكتملة أو ملغاة");
    }
    const newCount = (transport.pilgrimCount || 0) + pilgrimIds.length;
    if (newCount > (transport.capacity || 45)) {
      throw new ValidationError(`عدد المعتمرين (${newCount}) يتجاوز سعة المركبة (${transport.capacity || 45})`);
    }
    const placeholders = pilgrimIds.map((_: any, i: number) => `$${i + 2}`).join(",");
    await rawExecute(
      `UPDATE umrah_pilgrims SET "transportAssigned"=true, "updatedAt"=NOW() WHERE "companyId"=$1 AND "deletedAt" IS NULL AND id IN (${placeholders})`,
      [scope.companyId, ...pilgrimIds]
    );
    await rawExecute(
      `UPDATE umrah_transport SET "pilgrimCount"=$1 WHERE id=$2 AND "companyId"=$3`,
      [newCount, transportId, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_transport", entityId: transportId, after: { assignedPilgrims: pilgrimIds.length, totalCount: newCount } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.transport.pilgrims_assigned", entity: "umrah_transport", entityId: transportId, details: JSON.stringify({ pilgrimIds, count: pilgrimIds.length }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ transportId, assignedCount: pilgrimIds.length, totalPilgrimCount: newCount });
  } catch (err) { handleRouteError(err, res, "Assign pilgrims to transport error"); }
});

router.get("/import-logs", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_import_logs WHERE "companyId"=$1 ORDER BY "createdAt" DESC LIMIT 50`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List import logs error"); }
});

router.get("/unassigned", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { seasonId } = req.query as any;
    let where = `"companyId"=$1 AND "agentId" IS NULL AND "deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (seasonId) { params.push(seasonId); where += ` AND "seasonId"=$${params.length}`; }
    const rows = await rawQuery(`SELECT * FROM umrah_pilgrims WHERE ${where} ORDER BY "createdAt" DESC LIMIT 1000`, params);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List unassigned error"); }
});

router.post("/assign-bulk", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { pilgrimIds, agentId } = zodParse(bulkAssignSchema.safeParse(req.body));
    const placeholders = pilgrimIds.map((_: any, i: number) => `$${i + 3}`).join(",");
    await rawExecute(
      `UPDATE umrah_pilgrims SET "agentId"=$1, "updatedAt"=NOW() WHERE "companyId"=$2 AND "deletedAt" IS NULL AND status NOT IN ('departed','cancelled') AND id IN (${placeholders})`,
      [agentId, scope.companyId, ...pilgrimIds]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_pilgrims", entityId: 0, after: { assigned: pilgrimIds.length, agentId } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pilgrims.bulk_assigned", entity: "umrah_pilgrims", entityId: 0, details: JSON.stringify({ count: pilgrimIds.length, agentId }) }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ assigned: pilgrimIds.length, agentId });
  } catch (err) { handleRouteError(err, res, "Bulk assign error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// VIOLATIONS CRUD
// ─────────────────────────────────────────────────────────────────────────────

router.get("/violations", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT v.*,
              p."fullName" AS "mutamerName", p."passportNumber",
              a.name AS "agentName",
              sa.name AS "subAgentName"
       FROM umrah_violations v
       LEFT JOIN umrah_pilgrims p ON p.id = v."mutamerId"
       LEFT JOIN umrah_agents a ON a.id = v."agentId"
       LEFT JOIN umrah_sub_agents sa ON sa.id = v."subAgentId"
       WHERE v."companyId"=$1 AND v."deletedAt" IS NULL
       ORDER BY v."detectedAt" DESC LIMIT 500`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "List violations error"); }
});

router.get("/violations/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT v.*,
              p."fullName" AS "mutamerName", p."passportNumber",
              a.name AS "agentName",
              sa.name AS "subAgentName"
       FROM umrah_violations v
       LEFT JOIN umrah_pilgrims p ON p.id = v."mutamerId"
       LEFT JOIN umrah_agents a ON a.id = v."agentId"
       LEFT JOIN umrah_sub_agents sa ON sa.id = v."subAgentId"
       WHERE v.id=$1 AND v."companyId"=$2 AND v."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المخالفة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get violation error"); }
});

router.post("/violations", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createViolationSchema.safeParse(req.body));
    const rows = await rawQuery(
      `INSERT INTO umrah_violations ("companyId","branchId",type,"referenceType","referenceNumber","mutamerId","agentId","subAgentId",description,"penaltyAmount",status,"createdBy","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW()) RETURNING *`,
      [scope.companyId, scope.branchId || null, b.type, b.referenceType || null, b.referenceNumber || null, b.mutamerId || null, b.agentId || null, b.subAgentId || null, b.description || null, b.penaltyAmount || 0, b.status || "open", scope.userId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_violations", entityId: rows[0]?.id, after: { type: b.type, penaltyAmount: b.penaltyAmount } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.violation.created", entity: "umrah_violations", entityId: rows[0]?.id, after: { type: b.type } }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create violation error"); }
});

router.patch("/violations/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchViolationSchema.safeParse(req.body));
    const sets: string[] = ['"updatedAt"=NOW()', `"updatedBy"=${scope.userId}`];
    const params: any[] = [id, scope.companyId];
    for (const key of ["type","referenceType","referenceNumber","mutamerId","agentId","subAgentId","description","penaltyAmount","status","linkedInvoiceId"] as const) {
      if (b[key] !== undefined) {
        params.push(b[key]);
        const col = /[A-Z]/.test(key) ? `"${key}"` : key;
        sets.push(`${col}=$${params.length}`);
      }
    }
    const [row] = await rawQuery(
      `UPDATE umrah_violations SET ${sets.join(",")} WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("المخالفة غير موجودة");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update violation error"); }
});

router.delete("/violations/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `UPDATE umrah_violations SET "deletedAt"=NOW(), "updatedBy"=$3 WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL RETURNING id`,
      [id, scope.companyId, scope.userId]
    );
    if (!row) throw new NotFoundError("المخالفة غير موجودة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_violations", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.violation.deleted", entity: "umrah_violations", entityId: id }).catch((e) => logger.error(e, "umrah background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete violation error"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// MANUAL PENALTY CREATION
// ─────────────────────────────────────────────────────────────────────────────

router.post("/penalties", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createPenaltySchema.safeParse(req.body));
    if (!b.pilgrimId && !b.agentId) throw new ValidationError("يجب تحديد المعتمر أو الوكيل");
    const rows = await rawQuery(
      `INSERT INTO umrah_penalties ("companyId","pilgrimId","agentId","seasonId",type,amount,reason,status,"createdBy")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [scope.companyId, b.pilgrimId || null, b.agentId || null, b.seasonId || null, b.type || "manual", b.amount || 0, b.reason || null, b.status || "pending", scope.userId]
    );
    if (Number(b.amount) > 0) {
      try {
        let pilgrimName = "غير محدد";
        let agentName: string | undefined;
        if (b.pilgrimId) {
          const [p] = await rawQuery<any>(`SELECT "fullName" FROM umrah_pilgrims WHERE id=$1`, [b.pilgrimId]);
          if (p) pilgrimName = p.fullName;
        }
        if (b.agentId) {
          const [a] = await rawQuery<any>(`SELECT name FROM umrah_agents WHERE id=$1`, [b.agentId]);
          if (a) agentName = a.name;
        }
        const { umrahEngine } = await import("../lib/engines/index.js");
        await umrahEngine.postPenaltyGL(
          { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
          { id: rows[0].id, amount: Number(b.amount), pilgrimName, agentName, type: b.type || "manual" }
        );
      } catch (glErr) {
        logger.error(glErr, "Penalty GL posting failed:");
      }
    }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_penalties", entityId: rows[0]?.id, after: { amount: b.amount, type: b.type } }).catch((e) => logger.error(e, "umrah background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.penalty.created", entity: "umrah_penalties", entityId: rows[0]?.id }).catch((e) => logger.error(e, "umrah background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create penalty error"); }
});

export default router;
