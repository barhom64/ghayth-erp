import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import {
  resolveSettings,
  getSettingsByScope,
  upsertSetting,
  deleteSetting,
  type SettingScope,
} from "../lib/settings.js";
import { auditLog } from "../lib/audit.js";
import { createAuditLog } from "../lib/businessHelpers.js";
import { reloadCronScheduler } from "../lib/cronScheduler.js";
import { bootstrapCompany } from "../lib/companyBootstrap.js";
import { eventBus } from "../lib/eventBus.js";

const publicRouter = Router();

publicRouter.get("/display", async (_req, res) => {
  try {
    const rows = await rawQuery<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings WHERE key IN ('currency','timezone','companyName') AND "companyId" IS NULL AND "branchId" IS NULL`
    );
    const result: Record<string, string> = {};
    for (const row of rows) result[row.key] = row.value;
    res.json({ data: result });
  } catch {
    res.json({ data: { currency: "SAR", timezone: "Asia/Riyadh", companyName: "" } });
  }
});

const router = Router();
router.use(publicRouter);
router.use(authMiddleware);

router.get("/resolve", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { key } = req.query as { key: string };
    if (!key) {
      res.status(400).json({ error: "key مطلوب" });
      return;
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
      res.status(403).json({ error: "فقط المالك يمكنه قراءة إعدادات النظام" });
      return;
    }

    const settings = await getSettingsByScope(requestedScope, scopeId);
    res.json(settings);
  } catch (err) {
    handleRouteError(err, res, "Get settings error:");
  }
});

router.put("/", requirePermission("settings:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { scopeOverride, key, value } = req.body as {
      scopeOverride?: SettingScope;
      key: string;
      value: unknown;
    };

    if (!key) {
      res.status(400).json({ error: "key مطلوب" });
      return;
    }

    const requestedScope: SettingScope = scopeOverride ?? "company";

    let scopeId: number | null = null;
    if (requestedScope === "company") scopeId = scope.companyId;
    else if (requestedScope === "branch") scopeId = scope.branchId;
    else if (requestedScope === "system" && !scope.isOwner) {
      res.status(403).json({ error: "فقط المالك يمكنه تعديل إعدادات النظام" });
      return;
    }

    await upsertSetting(requestedScope, scopeId, key, value);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_setting",
      entity: "settings", entityId: scopeId ?? 0,
      after: { scope: requestedScope, scopeId, key, value },
    }).catch(console.error);
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Upsert setting error:");
  }
});

router.delete("/", requirePermission("settings:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { scopeOverride, key } = req.body as {
      scopeOverride?: SettingScope;
      key: string;
    };

    if (!key) {
      res.status(400).json({ error: "key مطلوب" });
      return;
    }

    const requestedScope: SettingScope = scopeOverride ?? "company";

    let scopeId: number | null = null;
    if (requestedScope === "company") scopeId = scope.companyId;
    else if (requestedScope === "branch") scopeId = scope.branchId;
    else if (requestedScope === "system" && !scope.isOwner) {
      res.status(403).json({ error: "فقط المالك يمكنه حذف إعدادات النظام" });
      return;
    }

    await deleteSetting(requestedScope, scopeId, key);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_setting",
      entity: "settings", entityId: scopeId ?? 0,
      before: { scope: requestedScope, scopeId, key },
    }).catch(console.error);
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete setting error:");
  }
});

router.get("/general", requirePermission("settings:read"), async (_req, res) => {
  try {
    const rows = await rawQuery(`SELECT * FROM system_settings WHERE "companyId" IS NULL AND "branchId" IS NULL ORDER BY key`);
    res.json({ data: rows });
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

    res.json({ data: resolved });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/general", requirePermission("settings:write"), async (req, res) => {
  try {
    const entries = req.body as Record<string, string>;
    if (!entries || typeof entries !== "object") {
      res.status(400).json({ error: "البيانات مطلوبة" });
      return;
    }
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
      reloadCronScheduler().catch((err) => console.error("[SETTINGS] Failed to reload cron after timezone change:", err));
    }
    const scope = req.scope!;
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_general_settings",
      entity: "system_settings", entityId: 0,
      after: { keys: Object.keys(entries) },
    }).catch(console.error);
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
    const [row] = await rawQuery(
      `SELECT * FROM branches WHERE id = $1 AND "companyId" = ANY($2)`,
      [Number(req.params.id), scope.allowedCompanies]
    );
    if (!row) { res.status(404).json({ error: "الفرع غير موجود" }); return; }
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
    const scope = req.scope!;
    const { name, nameEn, city, phone, logoUrl, address, taxNumber, crNumber, email, website, footerText, companyId } = req.body;
    if (!name) {
      res.status(400).json({ error: "اسم الفرع مطلوب" });
      return;
    }
    const targetCompanyId = companyId && scope.allowedCompanies.includes(Number(companyId)) ? Number(companyId) : scope.companyId;
    const r = await rawExecute(
      `INSERT INTO branches (name, "nameEn", "companyId", city, phone, "logoUrl", address, "taxNumber", "crNumber", email, website, "footerText") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [name, nameEn || null, targetCompanyId, city || null, phone || null, logoUrl || null, address || null, taxNumber || null, crNumber || null, email || null, website || null, footerText || null]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_branch",
      entity: "branches", entityId: r.insertId,
      after: { name, nameEn, city, phone, companyId: targetCompanyId },
    }).catch(console.error);
    res.status(201).json({ id: r.insertId, companyId: targetCompanyId, ...req.body });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/branches/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery(`SELECT id, "companyId" FROM branches WHERE id=$1 AND "companyId" = ANY($2)`, [id, scope.allowedCompanies]);
    if (!existing) { res.status(404).json({ error: "الفرع غير موجود" }); return; }
    const { name, nameEn, city, phone, logoUrl, address, taxNumber, crNumber, email, website, footerText } = req.body;
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
    await rawExecute(`UPDATE branches SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const [updated] = await rawQuery(`SELECT * FROM branches WHERE id=$1`, [id]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_branch",
      entity: "branches", entityId: id,
      before: existing, after: req.body,
    }).catch(console.error);
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.delete("/branches/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const { id } = req.params;
    const branchId = Number(id);
    const scope = req.scope!;

    const [activeEmployees] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM employee_assignments WHERE "branchId" = $1 AND status = 'active'`,
      [branchId]
    );
    const [openOrders] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM purchase_orders WHERE "branchId" = $1 AND status NOT IN ('cancelled','received','closed') AND "companyId" = $2`,
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
      res.status(422).json({
        error: "لا يمكن حذف الفرع — يوجد بيانات مرتبطة نشطة",
        blockers,
      });
      return;
    }

    const [beforeBranch] = await rawQuery(`SELECT * FROM branches WHERE id=$1 AND "companyId"=$2`, [branchId, scope.companyId]);
    await rawExecute(`DELETE FROM branches WHERE id=$1 AND "companyId"=$2 RETURNING id`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_branch",
      entity: "branches", entityId: branchId,
      before: beforeBranch,
    }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.post("/departments", requirePermission("settings:write"), async (req, res) => {
  try {
    const { name, nameEn, manager } = req.body;
    if (!name) {
      res.status(400).json({ error: "اسم القسم مطلوب" });
      return;
    }
    const scope = req.scope!;
    const r = await rawExecute(`INSERT INTO departments (name, "nameEn", manager) VALUES ($1,$2,$3)`, [name, nameEn || null, manager || null]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_department",
      entity: "departments", entityId: r.insertId,
      after: { name, nameEn, manager },
    }).catch(console.error);
    res.status(201).json({ id: r.insertId, ...req.body });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/departments/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, nameEn, manager } = req.body;
    if (!name) {
      res.status(400).json({ error: "اسم القسم مطلوب" });
      return;
    }
    const scope = req.scope!;
    await rawExecute(`UPDATE departments SET name=$1, "nameEn"=$2, manager=$3 WHERE id=$4 RETURNING id`, [name, nameEn || null, manager || null, id]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_department",
      entity: "departments", entityId: Number(id),
      after: { name, nameEn, manager },
    }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.delete("/departments/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const { id } = req.params;
    const [empCheck] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM employee_assignments WHERE "departmentId" = $1 AND status = 'active'`,
      [id]
    );
    if (empCheck && Number(empCheck.cnt) > 0) {
      res.status(400).json({ error: "لا يمكن حذف القسم لأن هناك موظفين مرتبطين به" });
      return;
    }
    const scope = req.scope!;
    const [beforeDept] = await rawQuery(`SELECT * FROM departments WHERE id=$1`, [id]);
    await rawExecute(`DELETE FROM departments WHERE id=$1`, [id]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_department",
      entity: "departments", entityId: Number(id),
      before: beforeDept,
    }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.post("/companies", requirePermission("settings:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, nameEn, taxNumber, crNumber } = req.body;
    if (!name) {
      res.status(400).json({ error: "اسم الشركة مطلوب" });
      return;
    }
    const r = await rawExecute(`INSERT INTO companies (name, "nameEn", "taxNumber", "crNumber") VALUES ($1,$2,$3,$4)`, [name, nameEn || null, taxNumber || null, crNumber || null]);
    const companyId = r.insertId;

    let branchId: number | undefined;
    let bootstrapped = false;
    try {
      const result = await bootstrapCompany(companyId, name);
      branchId = result.branchId;
      bootstrapped = true;
      eventBus.emit("company.created", {
        companyId,
        userId: scope.userId,
        entity: "company",
        entityId: companyId,
        after: { name, nameEn, taxNumber, crNumber, branchId },
      });
    } catch (bootstrapErr: any) {
      console.error("[CompanyBootstrap] Partial failure, cleaning up company:", bootstrapErr);
      try {
        await rawExecute(`DELETE FROM companies WHERE id = $1`, [companyId]);
      } catch (_cleanupErr) {}
      res.status(500).json({ error: "فشل إنشاء الشركة مع الإعدادات الافتراضية" });
      return;
    }

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_company",
      entity: "companies", entityId: companyId,
      after: { name, nameEn, taxNumber, crNumber, branchId },
    }).catch(console.error);

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
      ...req.body,
    });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/companies/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, nameEn, taxNumber, crNumber } = req.body;
    if (!name) {
      res.status(400).json({ error: "اسم الشركة مطلوب" });
      return;
    }
    const scope = req.scope!;
    await rawExecute(`UPDATE companies SET name=$1, "nameEn"=$2, "taxNumber"=$3, "crNumber"=$4 WHERE id=$5 RETURNING id`, [name, nameEn || null, taxNumber || null, crNumber || null, id]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_company",
      entity: "companies", entityId: Number(id),
      after: { name, nameEn, taxNumber, crNumber },
    }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.delete("/companies/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    const { id } = req.params;
    const scope = req.scope!;
    const [beforeCompany] = await rawQuery(`SELECT * FROM companies WHERE id=$1`, [id]);
    await rawExecute(`DELETE FROM companies WHERE id=$1 RETURNING id`, [id]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete_company",
      entity: "companies", entityId: Number(id),
      before: beforeCompany,
    }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/timezone", requirePermission("settings:read"), async (_req, res) => {
  try {
    const rows = await rawQuery(`SELECT value FROM system_settings WHERE key='timezone' AND "companyId" IS NULL AND "branchId" IS NULL`);
    const timezone = rows.length > 0 ? rows[0].value : "Asia/Riyadh";
    res.json({ timezone });
  } catch {
    res.json({ timezone: "Asia/Riyadh" });
  }
});

router.get("/system-controls", requirePermission("settings:read"), async (_req, res) => {
  try {
    const rows = await rawQuery(
      `SELECT key, value FROM settings WHERE scope='system' AND "scopeId"=0 ORDER BY key`
    );
    const controls: Record<string, any> = {};
    for (const r of rows) {
      try { controls[r.key] = JSON.parse(r.value as string); } catch { controls[r.key] = r.value; }
    }
    res.json({ data: controls });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/system-controls", requirePermission("settings:write"), async (req, res) => {
  try {
    const entries = req.body as Record<string, any>;
    for (const [key, value] of Object.entries(entries)) {
      const jsonVal = JSON.stringify(value);
      const existing = await rawQuery(`SELECT id FROM settings WHERE scope='system' AND "scopeId"=0 AND key=$1`, [key]);
      if (existing.length > 0) {
        await rawExecute(`UPDATE settings SET value=$1 WHERE scope='system' AND "scopeId"=0 AND key=$2`, [jsonVal, key]);
      } else {
        await rawExecute(`INSERT INTO settings (scope, "scopeId", key, value) VALUES ('system', 0, $1, $2)`, [key, jsonVal]);
      }
    }
    const scope = req.scope!;
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_system_controls",
      entity: "settings", entityId: 0,
      after: { keys: Object.keys(entries) },
    }).catch(console.error);
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
    const scope = req.scope!;
    const { roleKey } = req.params;
    const { modules } = req.body;
    if (!Array.isArray(modules)) { res.status(400).json({ error: "modules يجب أن يكون مصفوفة" }); return; }
    await rawExecute(
      `UPDATE user_roles SET modules=$1 WHERE "roleKey"=$2 AND "companyId"=$3`,
      [JSON.stringify(modules), roleKey, scope.companyId]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update_role_modules",
      entity: "user_roles", entityId: 0,
      after: { roleKey, modules },
    }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/approval-config", requirePermission("settings:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const chains = await rawQuery(
      `SELECT * FROM approval_chains WHERE "companyId"=$1 ORDER BY "chainType", "name"`,
      [scope.companyId]
    );
    res.json({ data: chains });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.post("/approval-config", requirePermission("settings:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { chainType, name, minAmount, maxAmount, isActive } = req.body;
    const r = await rawExecute(
      `INSERT INTO approval_chains ("companyId", "chainType", "name", "minAmount", "maxAmount", "isActive") VALUES ($1,$2,$3,$4,$5,$6)`,
      [scope.companyId, chainType, name || chainType, minAmount || 0, maxAmount || null, isActive !== false]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "create_approval_config",
      entity: "approval_chains", entityId: r.insertId,
      after: { chainType, name, minAmount, maxAmount, isActive },
    }).catch(console.error);
    res.status(201).json({ id: r.insertId });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.delete("/approval-config/:id", requirePermission("settings:write"), async (req, res) => {
  try {
    await rawExecute(`DELETE FROM approval_chains WHERE id=$1`, [Number(req.params.id)]);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

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

    const SECRET_KEYS = ["sms_auth_token", "whatsapp_access_token"];
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
    const scope = req.scope!;
    const entries = req.body as Record<string, string>;

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
    }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

export default router;
