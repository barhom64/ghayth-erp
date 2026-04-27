import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError, ValidationError, NotFoundError, ForbiddenError, ConflictError } from "../lib/errorHandler.js";
import {
  emitEvent,
  createAuditLog,
} from "../lib/businessHelpers.js";

const router = Router();
router.use(authMiddleware);

const createSeasonSchema = z.object({
  title: z.string().min(1, "اسم الموسم مطلوب"),
  startDate: z.string().min(1, "تاريخ البداية مطلوب"),
  endDate: z.string().optional(),
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
  nationality: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

const createTransportSchema = z.object({
  type: z.string().optional(),
  provider: z.string().optional(),
  pilgrimsCount: z.coerce.number().optional(),
  vehicleNumber: z.string().optional(),
  driverName: z.string().optional(),
  departureDate: z.string().optional(),
  arrivalDate: z.string().optional(),
  notes: z.string().optional(),
});

router.get("/seasons", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_seasons WHERE "companyId"=$1 ORDER BY "startDate" DESC`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List seasons error"); }
});

router.get("/seasons/:id", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
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
    const parsed = createSeasonSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;
    const rows = await rawQuery(
      `INSERT INTO umrah_seasons ("companyId",title,"startDate","endDate",notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [scope.companyId, b.title, b.startDate, b.endDate, b.notes]
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء الموسم");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_seasons", entityId: rows[0].id, after: { title: b.title } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.season.opened", entity: "umrah_seasons", entityId: rows[0].id, after: { title: b.title } }).catch(console.error);
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create season error"); }
});

router.patch("/seasons/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    const b = req.body;
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
    await rawExecute(`UPDATE umrah_seasons SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_seasons WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_seasons", entityId: Number(id), after: { status: b.status } }).catch(console.error);
    if (b.status) {
      emitEvent({ companyId: scope.companyId, userId: scope.userId, action: `umrah.season.${b.status}`, entity: "umrah_seasons", entityId: Number(id), after: { status: b.status } }).catch(console.error);
    }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update season error"); }
});

router.get("/agents", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_agents WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY name`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List agents error"); }
});

router.get("/agents/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery(`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [req.params.id, scope.companyId]);
    if (!row) { throw new NotFoundError("الوكيل غير موجود"); }
    const stats = await rawQuery(
      `SELECT COUNT(*)::int AS "pilgrimCount",
              COUNT(*) FILTER (WHERE status='overstayed')::int AS "overstayedCount"
       FROM umrah_pilgrims WHERE "agentId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    res.json({ ...row, ...(stats[0] || {}) });
  } catch (err) { handleRouteError(err, res, "Get agent error"); }
});

router.post("/agents", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;
    const rows = await rawQuery(
      `INSERT INTO umrah_agents ("companyId",name,"contactPerson",phone,email,country,"profitMargin","contractRef",currency,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [scope.companyId, b.name, b.contactPerson, b.phone, b.email, b.country, b.profitMargin || 0, b.contractRef, b.currency || "SAR", b.notes]
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء الوكيل");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_agents", entityId: rows[0].id, after: { name: b.name } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.agent.created", entity: "umrah_agents", entityId: rows[0].id, details: JSON.stringify({ name: b.name, country: b.country }) }).catch(console.error);
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create agent error"); }
});

router.patch("/agents/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["name","contactPerson","phone","email","country","profitMargin","contractRef","currency","status","notes"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    sets.push(`"updatedAt"=NOW()`);
    params.push(req.params.id); params.push(scope.companyId);
    await rawExecute(`UPDATE umrah_agents SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [req.params.id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_agents", entityId: Number(req.params.id) }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.agent.updated", entity: "umrah_agents", entityId: Number(req.params.id), details: JSON.stringify(b) }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update agent error"); }
});

router.delete("/agents/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id, name FROM umrah_agents WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("الوكيل غير موجود");
    const [inUse] = await rawQuery<any>(`SELECT COUNT(*)::int AS c FROM umrah_pilgrims WHERE "agentId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (Number(inUse?.c) > 0) {
      throw new ConflictError(`لا يمكن حذف الوكيل — مرتبط بـ ${inUse.c} معتمر`);
    }
    await rawExecute(`UPDATE umrah_agents SET "deletedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_agents", entityId: id, before: { name: existing.name } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.agent.deleted", entity: "umrah_agents", entityId: id, details: JSON.stringify({ name: existing.name }) }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete agent error"); }
});

router.get("/packages", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT p.*, s.title as "seasonTitle" FROM umrah_packages p LEFT JOIN umrah_seasons s ON p."seasonId"=s.id WHERE p."companyId"=$1 ORDER BY p.name`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List packages error"); }
});

router.post("/packages", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createPackageSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;
    const rows = await rawQuery(
      `INSERT INTO umrah_packages ("companyId",name,"seasonId","costPrice","sellPrice","includesTransport","includesHotel","includesMeals","includesZiyarat",duration,description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [scope.companyId, b.name, b.seasonId, b.costPrice, b.sellPrice, b.includesTransport || false, b.includesHotel || false, b.includesMeals || false, b.includesZiyarat || false, b.duration || 7, b.description]
    );
    if (!rows[0]) throw new NotFoundError("فشل في إنشاء الباقة");
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_packages", entityId: rows[0].id, after: { name: b.name } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.package.created", entity: "umrah_packages", entityId: rows[0].id, details: JSON.stringify({ name: b.name, costPrice: b.costPrice, sellPrice: b.sellPrice }) }).catch(console.error);
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create package error"); }
});

router.get("/packages/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery(
      `SELECT p.*, s.title AS "seasonTitle" FROM umrah_packages p
       LEFT JOIN umrah_seasons s ON p."seasonId" = s.id
       WHERE p.id = $1 AND p."companyId" = $2`,
      [req.params.id, scope.companyId]
    );
    if (!row) { throw new NotFoundError("الباقة غير موجودة"); }
    const pilgrims = await rawQuery(
      `SELECT COUNT(*)::int AS c FROM umrah_pilgrims WHERE "packageId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    res.json({ ...row, pilgrimCount: pilgrims[0]?.c || 0 });
  } catch (err) { handleRouteError(err, res, "Get package error"); }
});

router.patch("/packages/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["name","seasonId","costPrice","sellPrice","includesTransport","includesHotel","includesMeals","includesZiyarat","duration","description"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    if (sets.length === 0) throw new ValidationError("لا توجد بيانات للتحديث");
    sets.push(`"updatedAt"=NOW()`);
    params.push(req.params.id); params.push(scope.companyId);
    await rawExecute(`UPDATE umrah_packages SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_packages WHERE id=$1 AND "companyId"=$2`, [req.params.id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_packages", entityId: Number(req.params.id), after: b }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.package.updated", entity: "umrah_packages", entityId: Number(req.params.id), details: JSON.stringify(b) }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update package error"); }
});

router.delete("/packages/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const inUse = await rawQuery(
      `SELECT COUNT(*)::int AS c FROM umrah_pilgrims WHERE "packageId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [req.params.id, scope.companyId]
    );
    if (Number(inUse[0]?.c) > 0) {
      throw new ConflictError(`لا يمكن حذف الباقة — مرتبطة بـ ${inUse[0].c} معتمر`);
    }
    await rawExecute(`UPDATE umrah_packages SET status='deleted' WHERE id=$1 AND "companyId"=$2`, [req.params.id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_packages", entityId: Number(req.params.id) }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.package.deleted", entity: "umrah_packages", entityId: Number(req.params.id), details: "{}" }).catch(console.error);
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
    if (search) { params.push(`%${search}%`); where += ` AND (p."fullName" ILIKE $${params.length} OR p."passportNumber" ILIKE $${params.length} OR p."visaNumber" ILIKE $${params.length})`; }
    const offset = (Number(page) - 1) * Number(limit);
    const countQ = await rawQuery(`SELECT COUNT(*) as c FROM umrah_pilgrims p WHERE ${where}`, params);
    params.push(Number(limit)); params.push(offset);
    const rows = await rawQuery(
      `SELECT p.*, a.name as "agentName", pkg.name as "packageName"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_agents a ON p."agentId"=a.id
       LEFT JOIN umrah_packages pkg ON p."packageId"=pkg.id
       WHERE ${where}
       ORDER BY p."createdAt" DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json({ data: rows, total: Number(countQ[0]?.c || 0), page: Number(page), pageSize: Number(limit) });
  } catch (err) { handleRouteError(err, res, "List pilgrims error"); }
});

router.post("/pilgrims", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createPilgrimSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;

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

    const rows = await rawQuery(
      `INSERT INTO umrah_pilgrims ("companyId","branchId","seasonId","agentId","packageId","fullName","passportNumber","visaNumber",nationality,gender,"dateOfBirth",phone,"arrivalDate","departureDate",notes,"createdBy","updatedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,NOW()) RETURNING *`,
      [
        scope.companyId,
        scope.branchId || null,
        Number(b.seasonId),
        b.agentId ? Number(b.agentId) : null,
        b.packageId ? Number(b.packageId) : null,
        String(b.fullName).trim(),
        String(b.passportNumber).trim(),
        b.visaNumber ?? null,
        b.nationality ?? null,
        b.gender ?? null,
        b.dateOfBirth ?? null,
        b.phone ?? null,
        b.arrivalDate ?? null,
        b.departureDate ?? null,
        b.notes ?? null,
        scope.userId,
      ]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_pilgrims", entityId: rows[0]?.id, after: { fullName: String(b.fullName).trim(), passportNumber: String(b.passportNumber).trim() } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "umrah.pilgrim.created", entity: "umrah_pilgrims", entityId: rows[0]?.id, after: { fullName: String(b.fullName).trim() } }).catch(console.error);
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create pilgrim error"); }
});

router.patch("/pilgrims/:id", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const params: any[] = [];
    const sets: string[] = [];
    for (const key of ["agentId","packageId","fullName","passportNumber","visaNumber","nationality","gender","dateOfBirth","phone","arrivalDate","departureDate","actualArrival","actualDeparture","status","hotelName","roomNumber","transportAssigned","notes"]) {
      if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
    }
    sets.push(`"updatedAt"=NOW()`);
    params.push(req.params.id); params.push(scope.companyId);
    await rawExecute(`UPDATE umrah_pilgrims SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`, params);
    const [row] = await rawQuery(`SELECT * FROM umrah_pilgrims WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [req.params.id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_pilgrims", entityId: Number(req.params.id) }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pilgrim.updated", entity: "umrah_pilgrims", entityId: Number(req.params.id), details: JSON.stringify(b) }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update pilgrim error"); }
});

router.get("/pilgrims/:id", requirePermission("umrah:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery(
      `SELECT p.*, a.name as "agentName", pkg.name as "packageName", s.title as "seasonTitle"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_agents a ON p."agentId"=a.id
       LEFT JOIN umrah_packages pkg ON p."packageId"=pkg.id
       LEFT JOIN umrah_seasons s ON p."seasonId"=s.id
       WHERE p.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL`, [req.params.id, scope.companyId]
    );
    if (!row) { throw new NotFoundError("المعتمر غير موجود"); }
    const penalties = await rawQuery(`SELECT * FROM umrah_penalties WHERE "pilgrimId"=$1 AND "companyId"=$2 ORDER BY "createdAt" DESC`, [req.params.id, scope.companyId]);
    res.json({ ...row, penalties });
  } catch (err) { handleRouteError(err, res, "Get pilgrim error"); }
});

router.delete("/pilgrims/:id", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
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
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "umrah_pilgrims", entityId: id, before: { fullName: existing.fullName } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pilgrim.deleted", entity: "umrah_pilgrims", entityId: id, details: JSON.stringify({ fullName: existing.fullName }) }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Delete pilgrim error"); }
});

router.post("/import", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { seasonId, rows: importRows, fileType, fileName } = req.body;
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

      const passportNumbers = batch
        .filter((r: any) => r.passportNumber)
        .map((r: any) => r.passportNumber as string);

      const existingRows = passportNumbers.length > 0
        ? await rawQuery<any>(
            `SELECT id, "passportNumber" FROM umrah_pilgrims WHERE "companyId"=$1 AND "seasonId"=$2 AND "passportNumber" = ANY($3)`,
            [scope.companyId, seasonId, passportNumbers]
          )
        : [];
      const existingMap = new Map<string, number>(existingRows.map((r: any) => [r.passportNumber, r.id]));

      for (let i = 0; i < batch.length; i++) {
        const globalRow = batchStart + i;
        const r = batch[i];
        if (!r.passportNumber || !r.fullName) {
          errCount++;
          errors.push({ row: globalRow + 1, error: "بيانات ناقصة" });
          continue;
        }

        if (existingMap.has(r.passportNumber)) {
          const existingId = existingMap.get(r.passportNumber)!;
          const sets: string[] = [];
          const params: any[] = [];
          for (const key of ["fullName","visaNumber","nationality","gender","phone","arrivalDate","departureDate","agentId","hotelName","roomNumber"]) {
            if (r[key] !== undefined && r[key] !== null && r[key] !== "") {
              params.push(r[key]);
              sets.push(`"${key}"=$${params.length}`);
            }
          }
          if (sets.length > 0) {
            sets.push(`"updatedAt"=NOW()`);
            params.push(existingId); params.push(scope.companyId);
            await rawExecute(`UPDATE umrah_pilgrims SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length}`, params);
            updateCount++;
          } else {
            dupCount++;
          }
        } else {
          try {
            await rawExecute(
              `INSERT INTO umrah_pilgrims ("companyId","seasonId","agentId","fullName","passportNumber","visaNumber",nationality,gender,phone,"arrivalDate","departureDate","hotelName","roomNumber")
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
              [scope.companyId, seasonId, r.agentId || null, r.fullName, r.passportNumber, r.visaNumber || null, r.nationality || null, r.gender || null, r.phone || null, r.arrivalDate || null, r.departureDate || null, r.hotelName || null, r.roomNumber || null]
            );
            newCount++;
          } catch (insertErr: any) {
            errCount++;
            errors.push({ row: globalRow + 1, error: insertErr?.message ?? "خطأ في الإدراج" });
          }
        }
      }

      const processed = Math.min(batchStart + BATCH_SIZE, importRows.length);
      await rawExecute(
        `UPDATE umrah_import_logs SET "newRecords"=$1,"updatedRecords"=$2,"duplicateRecords"=$3,"errorRecords"=$4,errors=$5,"processedRows"=$6 WHERE id=$7 AND "companyId"=$8`,
        [newCount, updateCount, dupCount, errCount, JSON.stringify(errors), processed, logId, scope.companyId]
      ).catch(console.error);
    }

    await rawExecute(
      `UPDATE umrah_import_logs SET "newRecords"=$1,"updatedRecords"=$2,"duplicateRecords"=$3,"errorRecords"=$4,errors=$5,"processedRows"=$6,status='completed' WHERE id=$7 AND "companyId"=$8`,
      [newCount, updateCount, dupCount, errCount, JSON.stringify(errors), importRows.length, logId, scope.companyId]
    );

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_import_logs", entityId: logId, after: { total: importRows.length, new: newCount, updated: updateCount } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.import.completed", entity: "umrah_import_logs", entityId: logId, details: JSON.stringify({ total: importRows.length, new: newCount, updated: updateCount, errors: errCount }) }).catch(console.error);
    res.json({ importLogId: logId, total: importRows.length, new: newCount, updated: updateCount, duplicates: dupCount, errors: errCount, errorDetails: errors });
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
    const today = new Date().toISOString().split("T")[0];
    const result = await withTransaction(async (client) => {
      const arrivedRes = await client.query(
        `UPDATE umrah_pilgrims SET status='arrived', "actualArrival"=$1, "updatedAt"=NOW()
         WHERE "companyId"=$2 AND status='pending' AND "arrivalDate" <= $1 AND ("departureDate" IS NULL OR "departureDate" >= $1)`,
        [today, scope.companyId]
      );
      const overstayedRes = await client.query(
        `UPDATE umrah_pilgrims SET status='overstayed', "updatedAt"=NOW()
         WHERE "companyId"=$1 AND status IN ('arrived','active') AND "departureDate" < $2 AND "actualDeparture" IS NULL`,
        [scope.companyId, today]
      );
      const departedRes = await client.query(
        `UPDATE umrah_pilgrims SET status='departed', "updatedAt"=NOW()
         WHERE "companyId"=$1 AND status IN ('arrived','active') AND "actualDeparture" IS NOT NULL AND "actualDeparture" <= $2`,
        [scope.companyId, today]
      );
      return {
        arrivedUpdated: arrivedRes.rowCount ?? 0,
        overstayedUpdated: overstayedRes.rowCount ?? 0,
        departedUpdated: departedRes.rowCount ?? 0,
      };
    });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_pilgrims", entityId: 0, after: { date: today, ...result } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.daily_status.run", entity: "umrah_pilgrims", entityId: 0, details: JSON.stringify({ date: today, ...result }) }).catch(console.error);
    res.json({ date: today, ...result });
  } catch (err) { handleRouteError(err, res, "Daily status error"); }
});

router.post("/run-penalty-engine", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { overstayDays = 3, dailyRate = 500 } = req.body;
    const today = new Date().toISOString().split("T")[0];
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
        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO umrah_penalties ("companyId","pilgrimId","agentId","seasonId",type,"daysOverstayed",amount,notes)
             VALUES ($1,$2,$3,$4,'overstay',$5,$6,$7)`,
            [scope.companyId, p.id, p.agentId, p.seasonId, p.daysOver, amount, `غرامة تأخر ${p.daysOver} يوم — ${p.fullName}`]
          );
          await client.query(
            `UPDATE umrah_pilgrims SET status='overstay_penalized' WHERE id=$1 AND "companyId"=$2 AND status='overstayed'`,
            [p.id, scope.companyId]
          );
        });
        created++;
      }
    }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_penalties", entityId: 0, after: { checked: overstayed.length, penaltiesCreated: created } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.penalty_engine.run", entity: "umrah_penalties", entityId: 0, details: JSON.stringify({ checked: overstayed.length, penaltiesCreated: created }) }).catch(console.error);
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
       WHERE ${where} ORDER BY pen."createdAt" DESC`, params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List penalties error"); }
});

router.get("/penalties/:id", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
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

router.post("/agent-invoices/generate", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { agentId, seasonId } = req.body;
    if (!agentId || !seasonId) { throw new ValidationError("الوكيل والموسم مطلوبان"); }
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
    const ref = `UMRAH-INV-${Date.now().toString(36).toUpperCase()}`;
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
      ).catch(console.error);

      emitEvent({
        companyId: scope.companyId,
        userId: scope.userId,
        action: "umrah.invoice.gl_posted",
        entity: "umrah_agent_invoices",
        entityId: rows[0].id,
        details: JSON.stringify({ journalId, total, servicesTotal, penaltiesTotal, commission }),
      }).catch(console.error);
    } catch (glErr) {
      console.error("[umrah] GL posting failed for agent invoice", rows[0].id, glErr);
    }

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_agent_invoices", entityId: rows[0]?.id, after: { agentId, seasonId, total } }).catch(console.error);
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
       WHERE ${where} ORDER BY i."createdAt" DESC`, params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List agent invoices error"); }
});

router.get("/transport", requirePermission("umrah:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM umrah_transport WHERE "companyId"=$1 ORDER BY "tripDate" DESC`, [scope.companyId]);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List transport error"); }
});

router.post("/transport", requirePermission("umrah:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = createTransportSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const b = parsed.data as any;
    const rows = await rawQuery(
      `INSERT INTO umrah_transport ("companyId","seasonId","tripDate","fromLocation","toLocation","vehicleId","driverId",capacity,"pilgrimCount",cost,notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [scope.companyId, b.seasonId, b.tripDate, b.fromLocation, b.toLocation, b.vehicleId, b.driverId, b.capacity || 45, b.pilgrimCount || 0, b.cost || 0, b.notes]
    );

    const tripCost = Number(b.cost || 0);
    if (tripCost > 0) {
      const { umrahEngine } = await import("../lib/engines/index.js");
      await umrahEngine.postTransportExpenseGL(
        { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
        { id: rows[0].id, cost: tripCost, fromLocation: b.fromLocation, toLocation: b.toLocation, vehicleId: b.vehicleId || undefined, driverId: b.driverId || undefined }
      );
    }

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "umrah_transport", entityId: rows[0]?.id, after: { fromLocation: b.fromLocation, toLocation: b.toLocation } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.transport.created", entity: "umrah_transport", entityId: rows[0]?.id, details: JSON.stringify({ fromLocation: b.fromLocation, toLocation: b.toLocation, cost: b.cost }) }).catch(console.error);
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Create transport error"); }
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
    const rows = await rawQuery(`SELECT * FROM umrah_pilgrims WHERE ${where} ORDER BY "createdAt" DESC`, params);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "List unassigned error"); }
});

router.post("/assign-bulk", requirePermission("umrah:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { pilgrimIds, agentId } = req.body;
    if (!agentId || !Array.isArray(pilgrimIds) || pilgrimIds.length === 0) {
      throw new ValidationError("بيانات التوزيع غير مكتملة");
    }
    const placeholders = pilgrimIds.map((_: any, i: number) => `$${i + 3}`).join(",");
    await rawExecute(
      `UPDATE umrah_pilgrims SET "agentId"=$1, "updatedAt"=NOW() WHERE "companyId"=$2 AND id IN (${placeholders})`,
      [agentId, scope.companyId, ...pilgrimIds]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "umrah_pilgrims", entityId: 0, after: { assigned: pilgrimIds.length, agentId } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.pilgrims.bulk_assigned", entity: "umrah_pilgrims", entityId: 0, details: JSON.stringify({ count: pilgrimIds.length, agentId }) }).catch(console.error);
    res.json({ assigned: pilgrimIds.length, agentId });
  } catch (err) { handleRouteError(err, res, "Bulk assign error"); }
});

export default router;
