import { handleRouteError, ValidationError, NotFoundError, ForbiddenError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import {
  resolveSettings,
  getSettingsByScope,
  upsertSetting,
  deleteSetting,
  type SettingScope,
} from "../lib/settings.js";
import { auditLog } from "../lib/audit.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { reloadCronScheduler } from "../lib/cronScheduler.js";
import { bootstrapCompany } from "../lib/companyBootstrap.js";
import { z } from "zod";
import { logger } from "../lib/logger.js";

/* ── Zod Schemas ────────────────────────────────────────────── */

const settingUpsertSchema = z.object({
  scopeOverride: z.enum(["system", "company", "branch"]).optional(),
  key: z.string().min(1),
  value: z.unknown(),
});

const settingDeleteSchema = z.object({
  scopeOverride: z.enum(["system", "company", "branch"]).optional(),
  key: z.string().min(1, "key مطلوب"),
});

const generalSettingsSchema = z.record(z.string().min(1), z.string());

const createBranchSchema = z.object({
  name: z.string().min(1),
  nameEn: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  logoUrl: z.string().optional(),
  address: z.string().optional(),
  taxNumber: z.string().optional(),
  crNumber: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  footerText: z.string().optional(),
  companyId: z.coerce.number().optional(),
});

const updateBranchSchema = z.object({
  name: z.string().min(1).optional(),
  nameEn: z.string().optional(),
  city: z.string().optional(),
  phone: z.string().optional(),
  logoUrl: z.string().optional(),
  address: z.string().optional(),
  taxNumber: z.string().optional(),
  crNumber: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  footerText: z.string().optional(),
  companyId: z.coerce.number().optional(),
});

const createDepartmentSchema = z.object({
  name: z.string().min(1),
  nameEn: z.string().optional(),
  manager: z.string().optional(),
});

const updateDepartmentSchema = z.object({
  name: z.string().min(1),
  manager: z.string().optional(),
});

const createCompanySchema = z.object({
  name: z.string().min(1),
  nameEn: z.string().optional(),
  taxNumber: z.string().optional(),
  crNumber: z.string().optional(),
});

const updateCompanySchema = z.object({
  name: z.string().min(1),
  nameEn: z.string().optional(),
  taxNumber: z.string().optional(),
  crNumber: z.string().optional(),
});

const systemControlsSchema = z.record(z.string().min(1), z.unknown());

const roleModulesSchema = z.object({
  modules: z.array(z.string()),
});

const approvalConfigSchema = z.object({
  chainType: z.string().min(1),
  name: z.string().optional(),
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().nullable().optional(),
  isActive: z.boolean().optional(),
});

const channelsSchema = z.record(z.string().min(1), z.string().nullable());

const publicRouter = Router();

publicRouter.get("/display", async (_req, res) => {
  try {
    const rows = await rawQuery<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings WHERE key IN ('currency','timezone','companyName') AND "companyId" IS NULL AND "branchId" IS NULL`
    );
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    res.json({ data: result });
  } catch (e) {
    logger.warn(e, "failed to load public system settings, using defaults");
    res.json({ data: { currency: "SAR", timezone: "Asia/Riyadh", companyName: "" } });
  }
});

const router = Router();
router.use(publicRouter);

router.get("/resolve", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { key } = req.query as { key: string };
    if (!key) {
      throw new ValidationError("key مطلوب");
    }
    const value = await resolveSettings(key, scope.companyId, scope.branchId);
    res.json({ key, value: value ?? null });
  } catch (err) {
    handleRouteError(err, res, "Resolve settings error:");
  }
});

router.get("/", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { scopeOverride } = req.query as { scopeOverride?: SettingScope };
    const requestedScope: SettingScope = scopeOverride ?? "company";

    let scopeId: number | null = null;
    if (requestedScope === "company") scopeId = scope.companyId;
    else if (requestedScope === "branch") scopeId = scope.branchId;
    else if (requestedScope === "system" && !scope.isOwner) {
      throw new ForbiddenError("فقط المالك يمكنه قراءة إعدادات النظام");
    }

    const settings = await getSettingsByScope(requestedScope, scopeId);
    res.json(settings);
  } catch (err) {
    handleRouteError(err, res, "Get settings error:");
  }
});

router.put("/", requirePermission("settings:write"), async (req, res) => {
  try {
    const body = zodParse(settingUpsertSchema.safeParse(req.body));
    const scope = req.scope!;
    const { scopeOverride, key, value } = body;

    const requestedScope: SettingScope = scopeOverride ?? "company";

    let scopeId: number | null = null;
    if (requestedScope === "company") scopeId = scope.companyId;
    else if (requestedScope === "branch") scopeId = scope.branchId;
    else if (requestedScope === "system" && !scope.isOwner) {
      throw new ForbiddenError("فقط المالك يمكنه تعديل إعدادات النظام");
    }

    await upsertSetting(requestedScope, scopeId, key, value);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_setting",
      entity: "settings", entityId: scopeId ?? 0,
      after: { scope: requestedScope, scopeId, key, value },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: scopeId ?? 0, details: JSON.stringify({ key }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Upsert setting error:");
  }
});

router.delete("/", requirePermission("settings:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(settingDeleteSchema.safeParse(req.body ?? {}));
    const { scopeOverride, key } = b;

    const requestedScope: SettingScope = scopeOverride ?? "company";

    let scopeId: number | null = null;
    if (requestedScope === "company") scopeId = scope.companyId;
    else if (requestedScope === "branch") scopeId = scope.branchId;
    else if (requestedScope === "system" && !scope.isOwner) {
      throw new ForbiddenError("فقط المالك يمكنه حذف إعدادات النظام");
    }

    await deleteSetting(requestedScope, scopeId, key);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_setting",
      entity: "settings", entityId: scopeId ?? 0,
      before: { scope: requestedScope, scopeId, key },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: scopeId ?? 0, details: JSON.stringify({ key }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete setting error:");
  }
});

router.get("/general", requirePermission("settings:read"), async (_req, res) => {
  try {
    const rows = await rawQuery(`SELECT * FROM system_settings WHERE "companyId" IS NULL AND "branchId" IS NULL ORDER BY key LIMIT 500`);
    res.json({ data: maskSecretSettings(rows) });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/resolved", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const systemRows = await rawQuery<any>(
      `SELECT key, value FROM system_settings WHERE "companyId" IS NULL AND "branchId" IS NULL`
    );
    const companyRows = await rawQuery<any>(
      `SELECT key, value FROM system_settings WHERE "companyId" = $1 AND "branchId" IS NULL`,
      [scope.companyId]
    );
    const branchRows = scope.branchId ? await rawQuery<any>(
      `SELECT key, value FROM system_settings WHERE "companyId" = $1 AND "branchId" = $2`,
      [scope.companyId, scope.branchId]
    ) : [];

    const systemMap = new Map(systemRows.map((r: any) => [r.key, r.value]));
    const companyMap = new Map(companyRows.map((r: any) => [r.key, r.value]));
    const branchMap = new Map(branchRows.map((r: any) => [r.key, r.value]));

    const allKeys = new Set([...systemMap.keys(), ...companyMap.keys(), ...branchMap.keys()]);
    const resolved: { key: string; value: any; source: "system" | "company" | "branch" }[] = [];

    for (const key of allKeys) {
      if (branchMap.has(key)) {
        resolved.push({ key, value: branchMap.get(key), source: "branch" });
      } else if (companyMap.has(key)) {
        resolved.push({ key, value: companyMap.get(key), source: "company" });
      } else {
        resolved.push({ key, value: systemMap.get(key), source: "system" });
      }
    }

    for (const item of resolved) {
      if (SETTINGS_SECRET_KEYS.has(item.key) && item.value) item.value = "__configured__";
    }
    res.json({ data: resolved });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/general", requirePermission("settings:write"), async (req, res) => {
  try {
    const entries: Record<string, string> = zodParse(generalSettingsSchema.safeParse(req.body));
    const hasTimezoneChange = "timezone" in entries;
    for (const [key, value] of Object.entries(entries)) {
      if (!key) continue;
      const existing = await rawQuery(`SELECT id FROM system_settings WHERE key=$1 AND "companyId" IS NULL AND "branchId" IS NULL`, [key]);
      if (existing.length > 0) {
        await rawExecute(`UPDATE system_settings SET value=$1, "updatedAt"=NOW() WHERE key=$2 AND "companyId" IS NULL AND "branchId" IS NULL`, [value, key]);
      } else {
        await rawExecute(`INSERT INTO system_settings (key, value) VALUES ($1,$2)`, [key, value]);
      }
    }
    if (hasTimezoneChange) {
      reloadCronScheduler().catch((err) => logger.error(err, "[SETTINGS] Failed to reload cron after timezone change:"));
    }
    const scope = req.scope!;
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_general_settings",
      entity: "system_settings", entityId: 0,
      after: { keys: Object.keys(entries) },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: 0, details: JSON.stringify({ key: "general_settings" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/branches", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT * FROM branches WHERE "companyId" = ANY($1) ORDER BY name`,
      [scope.allowedCompanies]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/branches/:id", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT * FROM branches WHERE id = $1 AND "companyId" = ANY($2)`,
      [id, scope.allowedCompanies]
    );
    if (!row) { throw new NotFoundError("الفرع غير موجود"); }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/departments", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT * FROM departments WHERE "companyId" = ANY($1) ORDER BY name`,
      [scope.allowedCompanies]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/companies", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT * FROM companies WHERE id = ANY($1) ORDER BY name`,
      [scope.allowedCompanies]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/audit-log", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT * FROM audit_logs WHERE "companyId" = ANY($1) ORDER BY "createdAt" DESC LIMIT 100`,
      [scope.allowedCompanies]
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.post("/branches", requirePermission("settings:write"), async (req, res) => {
  try {
    const body = zodParse(createBranchSchema.safeParse(req.body));
    const scope = req.scope!;
    const { name, nameEn, city, phone, logoUrl, address, taxNumber, crNumber, email, website, footerText, companyId } = body;
    const targetCompanyId = companyId && scope.allowedCompanies.includes(Number(companyId)) ? Number(companyId) : scope.companyId;
    const r = await rawExecute(
      `INSERT INTO branches (name, "nameEn", "companyId", city, phone, "logoUrl", address, "taxNumber", "crNumber", email, website, "footerText") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [name, nameEn || null, targetCompanyId, city || null, phone || null, logoUrl || null, address || null, taxNumber || null, crNumber || null, email || null, website || null, footerText || null]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_branch",
      entity: "branches", entityId: r.insertId,
      after: { name, nameEn, city, phone, companyId: targetCompanyId },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.created", entity: "settings", entityId: r.insertId, details: JSON.stringify({ key: "branch" }) }).catch((e) => logger.error(e, "settings background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM branches WHERE id=$1 AND "companyId"=$2`, [r.insertId, targetCompanyId]);
    res.status(201).json(row || { id: r.insertId });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/branches/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const body = zodParse(updateBranchSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery(`SELECT id, "companyId" FROM branches WHERE id=$1 AND "companyId" = ANY($2)`, [id, scope.allowedCompanies]);
    if (!existing) { throw new NotFoundError("الفرع غير موجود"); }
    const { name, nameEn, city, phone, logoUrl, address, taxNumber, crNumber, email, website, footerText } = body;
    const sets: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { params.push(name); sets.push(`name=$${params.length}`); }
    if (nameEn !== undefined) { params.push(nameEn); sets.push(`"nameEn"=$${params.length}`); }
    if (city !== undefined) { params.push(city); sets.push(`city=$${params.length}`); }
    if (phone !== undefined) { params.push(phone); sets.push(`phone=$${params.length}`); }
    if (logoUrl !== undefined) { params.push(logoUrl); sets.push(`"logoUrl"=$${params.length}`); }
    if (address !== undefined) { params.push(address); sets.push(`address=$${params.length}`); }
    if (taxNumber !== undefined) { params.push(taxNumber); sets.push(`"taxNumber"=$${params.length}`); }
    if (crNumber !== undefined) { params.push(crNumber); sets.push(`"crNumber"=$${params.length}`); }
    if (email !== undefined) { params.push(email); sets.push(`email=$${params.length}`); }
    if (website !== undefined) { params.push(website); sets.push(`website=$${params.length}`); }
    if (footerText !== undefined) { params.push(footerText); sets.push(`"footerText"=$${params.length}`); }
    if (sets.length === 0) { res.json({ message: "لا توجد تحديثات" }); return; }
    params.push(id);
    params.push(existing.companyId);
    await rawExecute(`UPDATE branches SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [updated] = await rawQuery(`SELECT * FROM branches WHERE id=$1 AND "companyId"=$2`, [id, existing.companyId]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_branch",
      entity: "branches", entityId: id,
      before: existing, after: body,
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: id, details: JSON.stringify({ key: "branch" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.delete("/branches/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const branchId = parseId(req.params.id, "id");
    const scope = req.scope!;

    const [activeEmployees] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM employee_assignments WHERE "branchId" = $1 AND status = 'active' AND "companyId" = $2`,
      [branchId, scope.companyId]
    );
    const [openOrders] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM purchase_orders WHERE "branchId" = $1 AND status NOT IN ('cancelled','received','completed') AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [branchId, scope.companyId]
    );

    const blockers: string[] = [];
    if (Number(activeEmployees?.cnt ?? 0) > 0) {
      blockers.push(`يوجد ${activeEmployees.cnt} موظف نشط مرتبط بهذا الفرع`);
    }
    if (Number(openOrders?.cnt ?? 0) > 0) {
      blockers.push(`يوجد ${openOrders.cnt} أمر شراء مفتوح مرتبط بهذا الفرع`);
    }
    if (blockers.length > 0) {
      throw new ValidationError("لا يمكن حذف الفرع — يوجد بيانات مرتبطة نشطة", { meta: { blockers } });
    }

    const [beforeBranch] = await rawQuery(`SELECT * FROM branches WHERE id=$1 AND "companyId"=$2`, [branchId, scope.companyId]);
    if (!beforeBranch) throw new NotFoundError("الفرع غير موجود");
    await rawExecute(`DELETE FROM branches WHERE id=$1 AND "companyId"=$2 RETURNING id`, [branchId, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_branch",
      entity: "branches", entityId: branchId,
      before: beforeBranch,
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: branchId, details: JSON.stringify({ key: "branch" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.post("/departments", requirePermission("settings:write"), async (req, res) => {
  try {
    const body = zodParse(createDepartmentSchema.safeParse(req.body));
    const { name, nameEn, manager } = body;
    const scope = req.scope!;
    const r = await rawExecute(`INSERT INTO departments (name, "companyId", "managerId") VALUES ($1,$2,$3)`, [name, scope.companyId, manager || null]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_department",
      entity: "departments", entityId: r.insertId,
      after: { name, nameEn, manager },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.created", entity: "settings", entityId: r.insertId, details: JSON.stringify({ key: "department" }) }).catch((e) => logger.error(e, "settings background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM departments WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/departments/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const body = zodParse(updateDepartmentSchema.safeParse(req.body));
    const id = parseId(req.params.id, "id");
    const { name, manager } = body;
    const scope = req.scope!;
    const { affectedRows } = await rawExecute(`UPDATE departments SET name=$1, "managerId"=$2 WHERE id=$3 AND "companyId"=$4 RETURNING id`, [name, manager || null, id, scope.companyId]);
    if (!affectedRows) throw new NotFoundError("القسم غير موجود");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_department",
      entity: "departments", entityId: id,
      after: { name, manager },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: id, details: JSON.stringify({ key: "department" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.delete("/departments/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const id = parseId(req.params.id, "id");
    const scope = req.scope!;
    const [empCheck] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM employee_assignments WHERE "departmentId" = $1 AND status = 'active' AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (empCheck && Number(empCheck.cnt) > 0) {
      throw new ValidationError("لا يمكن حذف القسم لأن هناك موظفين مرتبطين به");
    }
    const [beforeDept] = await rawQuery(`SELECT * FROM departments WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!beforeDept) throw new NotFoundError("القسم غير موجود");
    await rawExecute(`DELETE FROM departments WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_department",
      entity: "departments", entityId: id,
      before: beforeDept,
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: id, details: JSON.stringify({ key: "department" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.post("/companies", requirePermission("settings:write"), async (req, res) => {
  try {
    const body = zodParse(createCompanySchema.safeParse(req.body));
    const scope = req.scope!;
    const { name, nameEn, taxNumber, crNumber } = body;
    const r = await rawExecute(`INSERT INTO companies (name, "nameEn", "vatNumber", "crNumber") VALUES ($1,$2,$3,$4)`, [name, nameEn || null, taxNumber || null, crNumber || null]);
    const companyId = r.insertId;

    let branchId: number | undefined;
    let bootstrapped = false;
    try {
      const result = await bootstrapCompany(companyId, name);
      branchId = result.branchId;
      bootstrapped = true;
      emitEvent({
        companyId,
        branchId: branchId ?? 0,
        userId: scope.userId,
        action: "company.created",
        entity: "companies",
        entityId: companyId,
        details: JSON.stringify({ name, nameEn, taxNumber, crNumber, branchId }),
      }).catch((e) => logger.error(e, "settings background task failed"));
    } catch (bootstrapErr: any) {
      logger.error(bootstrapErr, "[CompanyBootstrap] Partial failure, cleaning up company:");
      try {
        await rawExecute(`DELETE FROM companies WHERE id = $1`, [companyId]);
      } catch (_cleanupErr) { logger.error(_cleanupErr, "cleanup error"); }
      handleRouteError(bootstrapErr, res, "Bootstrap company error");
      return;
    }

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_company",
      entity: "companies", entityId: companyId,
      after: { name, nameEn, taxNumber, crNumber, branchId },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.created", entity: "settings", entityId: companyId, details: JSON.stringify({ key: "company" }) }).catch((e) => logger.error(e, "settings background task failed"));

    res.status(201).json({
      id: companyId,
      defaultBranchId: branchId,
      bootstrapped,
      operations: [
        "فرع افتراضي",
        "10 أنواع إجازات",
        "6 أنواع مخالفات",
        "3 ورديات",
        "5 سلاسل موافقات",
        "6 مكونات رواتب",
        "26 حساب محاسبي",
        "6 أدوار وصلاحيات",
        "8 بادئات ترقيم",
        "سلم عقوبات تدريجي (9 مستويات)",
        "120+ إعداد افتراضي",
      ],
      ...body,
    });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/companies/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const body = zodParse(updateCompanySchema.safeParse(req.body));
    const id = parseId(req.params.id, "id");
    const { name, nameEn, taxNumber, crNumber } = body;
    const scope = req.scope!;
    if (!scope.allowedCompanies?.includes(id) && scope.companyId !== id) {
      throw new ForbiddenError("لا يمكنك تعديل شركة لا تملك صلاحية عليها");
    }
    await rawExecute(`UPDATE companies SET name=$1, "nameEn"=$2, "vatNumber"=$3, "crNumber"=$4 WHERE id=$5 RETURNING id`, [name, nameEn || null, taxNumber || null, crNumber || null, id]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_company",
      entity: "companies", entityId: id,
      after: { name, nameEn, taxNumber, crNumber },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: id, details: JSON.stringify({ key: "company" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.delete("/companies/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const id = parseId(req.params.id, "id");
    const scope = req.scope!;
    if (!scope.allowedCompanies?.includes(id) && scope.companyId !== id) {
      throw new ForbiddenError("لا يمكنك حذف شركة لا تملك صلاحية عليها");
    }
    if (id === scope.companyId) {
      throw new ValidationError("لا يمكنك حذف الشركة الحالية");
    }
    const [beforeCompany] = await rawQuery(`SELECT * FROM companies WHERE id=$1`, [id]);
    if (!beforeCompany) throw new NotFoundError("الشركة غير موجودة");
    await rawExecute(`DELETE FROM companies WHERE id=$1 RETURNING id`, [id]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_company",
      entity: "companies", entityId: id,
      before: beforeCompany,
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: id, details: JSON.stringify({ key: "company" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/timezone", requirePermission("settings:read"), async (_req, res) => {
  try {
    const rows = await rawQuery(`SELECT value FROM system_settings WHERE key='timezone' AND "companyId" IS NULL AND "branchId" IS NULL`);
    const timezone = rows.length > 0 ? rows[0].value : "Asia/Riyadh";
    res.json({ timezone });
  } catch (e) {
    logger.warn(e, "failed to load timezone setting, using default");
    res.json({ timezone: "Asia/Riyadh" });
  }
});

router.get("/system-controls", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT key, value FROM settings WHERE scope='company' AND "scopeId"=$1 ORDER BY key`,
      [scope.companyId]
    );
    const controls: Record<string, any> = {};
    for (const r of rows) {
      try { controls[r.key] = JSON.parse(r.value as string); } catch (e) { logger.warn(e, `failed to parse system control JSON for key ${r.key}`); controls[r.key] = r.value; }
    }
    res.json({ data: controls });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/system-controls", requirePermission("settings:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const entries: Record<string, unknown> = zodParse(systemControlsSchema.safeParse(req.body));
    for (const [key, value] of Object.entries(entries)) {
      const jsonVal = JSON.stringify(value);
      const existing = await rawQuery(`SELECT id FROM settings WHERE scope='company' AND "scopeId"=$1 AND key=$2`, [scope.companyId, key]);
      if (existing.length > 0) {
        await rawExecute(`UPDATE settings SET value=$1 WHERE scope='company' AND "scopeId"=$2 AND key=$3`, [jsonVal, scope.companyId, key]);
      } else {
        await rawExecute(`INSERT INTO settings (scope, "scopeId", key, value) VALUES ('company', $1, $2, $3)`, [scope.companyId, key, jsonVal]);
      }
    }
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_system_controls",
      entity: "settings", entityId: 0,
      after: { keys: Object.keys(entries) },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: 0, details: JSON.stringify({ key: "system_controls" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

// P02-CRIT1 — both endpoints used to ignore the caller's company
// scope entirely. The GET listed `SELECT DISTINCT` across the global
// user_roles table, so a `settings:read` user in company A could see
// every roleKey/label/modules combination in use anywhere on the
// platform. The PUT then ran `UPDATE … WHERE "roleKey"=$1` with no
// scope clause, so saving the role-permissions form in company A
// rewrote the modules JSON for every user with that roleKey across
// every other company on the system — silent cross-tenant
// permission rewrite. Migration 063 added the companyId column on
// user_roles for exactly this reason; the rest of the codebase
// (admin.ts:95, :167, :363, :195) already scopes inserts/deletes
// the same way. These two routes were the last hold-outs.
router.get("/role-modules", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const roles = await rawQuery(
      `SELECT DISTINCT "roleKey", label, modules, level FROM user_roles WHERE "companyId" = $1 ORDER BY level DESC`,
      [scope.companyId]
    );
    res.json({ data: roles });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/role-modules/:roleKey", requirePermission("settings:write"), async (req, res) => {
  try {
    const body = zodParse(roleModulesSchema.safeParse(req.body));
    const scope = req.scope!;
    const { roleKey } = req.params;
    const { modules } = body;
    await rawExecute(
      `UPDATE user_roles SET modules=$1 WHERE "roleKey"=$2 AND "companyId"=$3`,
      [JSON.stringify(modules), roleKey, scope.companyId]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_role_modules",
      entity: "user_roles", entityId: 0,
      after: { roleKey, modules },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: 0, details: JSON.stringify({ key: "role_modules" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/approval-config", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const chains = await rawQuery(
      `SELECT * FROM approval_chains WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "chainType", "name"`,
      [scope.companyId]
    );
    res.json({ data: chains });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.post("/approval-config", requirePermission("settings:write"), async (req, res) => {
  try {
    const body = zodParse(approvalConfigSchema.safeParse(req.body));
    const scope = req.scope!;
    const { chainType, name, minAmount, maxAmount, isActive } = body;
    const r = await rawExecute(
      `INSERT INTO approval_chains ("companyId", "chainType", "name", "minAmount", "maxAmount", "isActive") VALUES ($1,$2,$3,$4,$5,$6)`,
      [scope.companyId, chainType, name || chainType, minAmount || 0, maxAmount || null, isActive !== false]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_approval_config",
      entity: "approval_chains", entityId: r.insertId,
      after: { chainType, name, minAmount, maxAmount, isActive },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.created", entity: "settings", entityId: r.insertId, details: JSON.stringify({ key: "approval_config" }) }).catch((e) => logger.error(e, "settings background task failed"));
    const [row] = await rawQuery<any>(`SELECT * FROM approval_chains WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.delete("/approval-config/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [beforeChain] = await rawQuery(`SELECT * FROM approval_chains WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!beforeChain) throw new NotFoundError("سلسلة الاعتماد غير موجودة");
    await rawExecute(`UPDATE approval_chains SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_approval_config",
      entity: "approval_chains", entityId: id,
      before: beforeChain,
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: id, details: JSON.stringify({ key: "approval_config" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

const SETTINGS_SECRET_KEYS = new Set(["sms_auth_token", "whatsapp_access_token", "whatsapp_verify_token"]);

function maskSecretSettings(rows: any[]): any[] {
  return rows.map((r: any) => SETTINGS_SECRET_KEYS.has(r.key) && r.value ? { ...r, value: "__configured__" } : r);
}

const CHANNEL_SETTING_KEYS = [
  "sms_account_sid",
  "sms_auth_token",
  "sms_from_number",
  "sms_enabled",
  "whatsapp_access_token",
  "whatsapp_phone_id",
  "whatsapp_verify_token",
  "whatsapp_enabled",
  "push_enabled",
];

router.get("/channels", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings WHERE key = ANY($1) AND "companyId" = $2`,
      [CHANNEL_SETTING_KEYS, scope.companyId]
    );
    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;

    const SECRET_KEYS = ["sms_auth_token", "whatsapp_access_token", "whatsapp_verify_token"];
    const result: Record<string, string> = { ...settings };
    for (const key of SECRET_KEYS) {
      if (result[key]) {
        result[key] = "__configured__";
      }
    }

    res.json({ data: result });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/channels", requirePermission("settings:write"), async (req, res) => {
  try {
    const entries: Record<string, string | null> = zodParse(channelsSchema.safeParse(req.body));
    const scope = req.scope!;

    const SECRET_KEYS_PUT = new Set(["sms_auth_token", "whatsapp_access_token"]);
    const allowedKeys = new Set(CHANNEL_SETTING_KEYS);
    for (const [key, value] of Object.entries(entries)) {
      if (!allowedKeys.has(key)) continue;
      if (SECRET_KEYS_PUT.has(key) && value === "__configured__") continue;

      if (value === null || value === undefined || value === "") {
        await rawExecute(
          `DELETE FROM system_settings WHERE key=$1 AND "companyId"=$2`,
          [key, scope.companyId]
        );
      } else {
        const existing = await rawQuery(
          `SELECT id FROM system_settings WHERE key=$1 AND "companyId"=$2`,
          [key, scope.companyId]
        );
        if (existing.length > 0) {
          await rawExecute(
            `UPDATE system_settings SET value=$1, "updatedAt"=NOW() WHERE key=$2 AND "companyId"=$3`,
            [value, key, scope.companyId]
          );
        } else {
          await rawExecute(
            `INSERT INTO system_settings (key, value, "companyId") VALUES ($1, $2, $3)`,
            [key, value, scope.companyId]
          );
        }
      }
    }

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_channels",
      entity: "settings", entityId: 0,
      after: { keys: Object.keys(entries) },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: 0, details: JSON.stringify({ key: "channels" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

export default router;
