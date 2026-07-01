import { handleRouteError, ValidationError, NotFoundError, ForbiddenError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { buildScopedWhere } from "../lib/scopedQuery.js";
import { authorize, authorizeAny, maskFields } from "../lib/rbac/authorize.js";
import {
  resolveSettings,
  getSettingsByScope,
  upsertSetting,
  deleteSetting,
  type SettingScope,
} from "../lib/settings.js";
import { auditLog } from "../lib/audit.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { createCostCenterForEntity } from "../lib/costCenterAutoCreate.js";
import { reloadCronScheduler } from "../lib/cronScheduler.js";
import { bootstrapCompany } from "../lib/companyBootstrap.js";
import { previewCompanyPurge, purgeCompanies } from "../lib/purgeCompany.js";
import {
  TASK_SLA_REMINDER_SETTING_KEY,
  DEFAULT_TASK_SLA_REMINDER_CONFIG,
  resolveTaskSlaReminderConfig,
  validateTaskSlaReminderConfig,
  TASK_ROLE_CHAIN_SETTING_KEY,
  ROLES_BY_TASK_TYPE,
  DEFAULT_TASK_ROLE_CHAIN,
  INBOX_TASK_TYPES,
  CATCHALL_ROLE,
  resolveTaskRoleChains,
  validateRoleChainMap,
} from "../lib/inboxClassifier.js";
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
  // PR-7 (#2077) — the unified org tree. A department now lives under
  // an administration (إدارة) which itself sits under a branch. Both
  // fields are optional for back-compat with the existing wizard +
  // seed scripts; the admin UI surfaces «orphan» rows so HR can fill
  // them in incrementally.
  administrationId: z.coerce.number().int().positive().optional().nullable(),
  branchId: z.coerce.number().int().positive().optional().nullable(),
});

const updateDepartmentSchema = z.object({
  name: z.string().min(1),
  nameEn: z.string().optional(),
  manager: z.string().optional(),
  administrationId: z.coerce.number().int().positive().optional().nullable(),
  branchId: z.coerce.number().int().positive().optional().nullable(),
});

// PR-7 (#2077) — administrations: the missing layer between Branch
// and Department in the org tree. Decided shape:
//   Company → Branch → Administration → Department → Team
// Committee + Project + Cost Center stay as OPERATIONAL bridges, not
// tree nodes (PR-1's wiring).
const createAdministrationSchema = z.object({
  name: z.string().min(1).max(200),
  nameEn: z.string().max(200).optional().nullable(),
  description: z.string().optional().nullable(),
  branchId: z.coerce.number().int().positive().optional().nullable(),
  managerAssignmentId: z.coerce.number().int().positive().optional().nullable(),
  isActive: z.boolean().optional(),
});
const updateAdministrationSchema = createAdministrationSchema.partial();

const createCompanySchema = z.object({
  name: z.string().min(1),
  nameEn: z.string().optional(),
  taxNumber: z.string().optional(),
  crNumber: z.string().optional(),
  parentCompanyId: z.number().int().positive().nullable().optional(),
});

const updateCompanySchema = z.object({
  name: z.string().min(1),
  nameEn: z.string().optional(),
  taxNumber: z.string().optional(),
  crNumber: z.string().optional(),
  parentCompanyId: z.number().int().positive().nullable().optional(),
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

interface SettingKvRow {
  key: string;
  value: string;
}

interface BranchRow {
  id: number;
  companyId: number;
  name: string;
  nameEn: string | null;
  city: string | null;
  phone: string | null;
  logoUrl: string | null;
  address: string | null;
  taxNumber: string | null;
  crNumber: string | null;
  email: string | null;
  website: string | null;
  footerText: string | null;
  createdAt: string;
  updatedAt: string | null;
}

interface DepartmentRow {
  id: number;
  name: string;
  nameEn: string | null;
  companyId: number;
  managerId: number | null;
  createdAt: string;
  updatedAt: string | null;
}

interface CountRow {
  cnt: string | number;
}

interface ApprovalChainRow {
  id: number;
  companyId: number;
  chainType: string;
  name: string;
  minAmount: number | string | null;
  maxAmount: number | string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string | null;
  deletedAt: string | null;
}

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

router.get("/resolve", authorize({ feature: "settings", action: "view" }), async (req, res) => {
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

router.get("/", authorize({ feature: "settings", action: "view" }), async (req, res) => {
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

router.put("/", authorize({ feature: "settings", action: "update" }), async (req, res) => {
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
      companyId: scope.companyId, userId: scope.userId, action: "settings.updated",
      entity: "settings", entityId: scopeId ?? 0,
      after: { scope: requestedScope, scopeId, key, value },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: scopeId ?? 0, details: JSON.stringify({ key }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Upsert setting error:");
  }
});

router.delete("/", authorize({ feature: "settings", action: "update" }), async (req, res) => {
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
      companyId: scope.companyId, userId: scope.userId, action: "settings.deleted",
      entity: "settings", entityId: scopeId ?? 0,
      before: { scope: requestedScope, scopeId, key },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: scopeId ?? 0, details: JSON.stringify({ key }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete setting error:");
  }
});

/* ── Inbox task SLA reminder tuning (key: inbox.task_sla_reminder) ────
 * Thin read/write surface over the 3-level settings engine consumed by the
 * inbox_task_sla_reminder_scan cron. No new table — the value is a JSON blob
 * validated by validateTaskSlaReminderConfig. */

router.get("/task-sla-reminder", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const stored = await resolveSettings(TASK_SLA_REMINDER_SETTING_KEY, scope.companyId, scope.branchId);
    res.json({
      data: {
        config: resolveTaskSlaReminderConfig(stored),
        defaults: DEFAULT_TASK_SLA_REMINDER_CONFIG,
        isOverridden: stored !== undefined && stored !== null,
      },
    });
  } catch (err) {
    handleRouteError(err, res, "Get task SLA reminder settings error:");
  }
});

router.put("/task-sla-reminder", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { config, errors } = validateTaskSlaReminderConfig(req.body);
    if (errors.length > 0) throw new ValidationError(errors.join("، "));
    await upsertSetting("company", scope.companyId, TASK_SLA_REMINDER_SETTING_KEY, config);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.updated",
      entity: "settings", entityId: scope.companyId,
      after: { key: TASK_SLA_REMINDER_SETTING_KEY, value: config },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: scope.companyId, details: JSON.stringify({ key: TASK_SLA_REMINDER_SETTING_KEY }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ data: { config, defaults: DEFAULT_TASK_SLA_REMINDER_CONFIG, isOverridden: true } });
  } catch (err) {
    handleRouteError(err, res, "Update task SLA reminder settings error:");
  }
});

router.delete("/task-sla-reminder", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    await deleteSetting("company", scope.companyId, TASK_SLA_REMINDER_SETTING_KEY);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.deleted",
      entity: "settings", entityId: scope.companyId,
      before: { key: TASK_SLA_REMINDER_SETTING_KEY },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: scope.companyId, details: JSON.stringify({ key: TASK_SLA_REMINDER_SETTING_KEY }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ data: { config: DEFAULT_TASK_SLA_REMINDER_CONFIG, defaults: DEFAULT_TASK_SLA_REMINDER_CONFIG, isOverridden: false } });
  } catch (err) {
    handleRouteError(err, res, "Reset task SLA reminder settings error:");
  }
});

/* ── Inbox auto-routing role chains (key: inbox.task_role_chains) ─────
 * Per-company override of the classifier's role escalation chains, consumed by
 * eventListeners auto-routing via resolveTaskRoleChains. No new table. */

const INBOX_ROLE_LABEL_FALLBACK: Record<string, string> = {
  owner: "مالك النظام",
  general_manager: "مدير عام",
  branch_manager: "مدير فرع",
  support_manager: "مدير الدعم الفني",
  finance_manager: "مدير المالية",
  accountant: "محاسب",
};

router.get("/inbox-routing", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const stored = await resolveSettings(TASK_ROLE_CHAIN_SETTING_KEY, scope.companyId, scope.branchId);
    const resolved = resolveTaskRoleChains(stored);

    const taskTypes = INBOX_TASK_TYPES.map((type) => {
      const def = [...(ROLES_BY_TASK_TYPE[type] ?? DEFAULT_TASK_ROLE_CHAIN)];
      const chain = [...resolved[type]];
      const isOverridden = chain.length !== def.length || chain.some((v, i) => v !== def[i]);
      return { type, defaultChain: def, chain, isOverridden };
    });

    // Canonical Arabic labels come from the company's own rbac_roles; the inbox
    // fallback map covers any chain role not yet seeded as an rbac_roles row.
    const dbRoles = await rawQuery<{ key: string; label: string }>(
      `SELECT role_key AS "key", label_ar AS "label" FROM rbac_roles WHERE "companyId" = $1 ORDER BY level DESC`,
      [scope.companyId],
    ).catch(() => [] as Array<{ key: string; label: string }>);
    const labelMap = new Map<string, string>();
    for (const r of dbRoles) labelMap.set(r.key, r.label);

    const roleKeys = new Set<string>(dbRoles.map((r) => r.key));
    for (const type of INBOX_TASK_TYPES) {
      for (const role of ROLES_BY_TASK_TYPE[type] ?? []) roleKeys.add(role);
      for (const role of resolved[type]) roleKeys.add(role);
    }
    roleKeys.add(CATCHALL_ROLE);
    const availableRoles = [...roleKeys].map((key) => ({
      key,
      label: labelMap.get(key) ?? INBOX_ROLE_LABEL_FALLBACK[key] ?? key,
    }));

    res.json({ data: { taskTypes, availableRoles, catchAllRole: CATCHALL_ROLE } });
  } catch (err) {
    handleRouteError(err, res, "Get inbox routing settings error:");
  }
});

router.put("/inbox-routing", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const raw = (req.body ?? {}) as { chains?: unknown };
    const { chains, errors } = validateRoleChainMap(raw.chains);
    if (errors.length > 0) throw new ValidationError(errors.map((e) => `${e.taskType}: ${e.message}`).join("، "));
    await upsertSetting("company", scope.companyId, TASK_ROLE_CHAIN_SETTING_KEY, chains);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.updated",
      entity: "settings", entityId: scope.companyId,
      after: { key: TASK_ROLE_CHAIN_SETTING_KEY, value: chains },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: scope.companyId, details: JSON.stringify({ key: TASK_ROLE_CHAIN_SETTING_KEY }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Update inbox routing settings error:");
  }
});

router.delete("/inbox-routing", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    await deleteSetting("company", scope.companyId, TASK_ROLE_CHAIN_SETTING_KEY);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.deleted",
      entity: "settings", entityId: scope.companyId,
      before: { key: TASK_ROLE_CHAIN_SETTING_KEY },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: scope.companyId, details: JSON.stringify({ key: TASK_ROLE_CHAIN_SETTING_KEY }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Reset inbox routing settings error:");
  }
});

router.get("/general", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const rows = await rawQuery(`SELECT * FROM system_settings WHERE "companyId" IS NULL AND "branchId" IS NULL ORDER BY key LIMIT 500`);
    res.json(maskFields(req, { data: maskSecretSettings(rows) }));
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/resolved", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const systemRows = await rawQuery<SettingKvRow>(
      `SELECT key, value FROM system_settings WHERE "companyId" IS NULL AND "branchId" IS NULL`
    );
    const companyRows = await rawQuery<SettingKvRow>(
      `SELECT key, value FROM system_settings WHERE "companyId" = $1 AND "branchId" IS NULL`,
      [scope.companyId]
    );
    const branchRows: SettingKvRow[] = scope.branchId ? await rawQuery<SettingKvRow>(
      `SELECT key, value FROM system_settings WHERE "companyId" = $1 AND "branchId" = $2`,
      [scope.companyId, scope.branchId]
    ) : [];

    const systemMap = new Map(systemRows.map((r) => [r.key, r.value]));
    const companyMap = new Map(companyRows.map((r) => [r.key, r.value]));
    const branchMap = new Map(branchRows.map((r) => [r.key, r.value]));

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
    res.json(maskFields(req, { data: resolved }));
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/general", authorize({ feature: "settings", action: "update" }), async (req, res) => {
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
      companyId: scope.companyId, userId: scope.userId, action: "settings.updated",
      entity: "system_settings", entityId: 0,
      after: { keys: Object.keys(entries) },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: 0, details: JSON.stringify({ key: "general_settings" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/branches", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // Hide disabled branches by default so the header picker, every
    // dropdown, and every list consumer sees only active branches.
    // Settings → Branches page can opt in to archived rows via
    // `?includeInactive=true`.
    const includeInactive = String(req.query.includeInactive ?? "") === "true";
    const statusFilter = includeInactive ? "" : ` AND COALESCE(status, 'active') = 'active'`;
    const rows = await rawQuery(
      `SELECT * FROM branches WHERE "companyId" = ANY($1)${statusFilter} ORDER BY name`,
      [scope.allowedCompanies]
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/branches/:id", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery(
      `SELECT * FROM branches WHERE id = $1 AND "companyId" = ANY($2)`,
      [id, scope.allowedCompanies]
    );
    if (!row) { throw new NotFoundError("الفرع غير موجود"); }
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/departments", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT * FROM departments WHERE "companyId" = ANY($1) ORDER BY name`,
      [scope.allowedCompanies]
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/companies", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT * FROM companies WHERE id = ANY($1) ORDER BY name`,
      [scope.allowedCompanies]
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/audit-log", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(
      `SELECT * FROM audit_logs WHERE "companyId" = ANY($1) ORDER BY "createdAt" DESC LIMIT 100`,
      [scope.allowedCompanies]
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.post("/branches", authorize({ feature: "settings", action: "update" }), async (req, res) => {
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
      companyId: scope.companyId, userId: scope.userId, action: "settings.created",
      entity: "branches", entityId: r.insertId,
      after: { name, nameEn, city, phone, companyId: targetCompanyId },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.created", entity: "settings", entityId: r.insertId, details: JSON.stringify({ key: "branch" }) }).catch((e) => logger.error(e, "settings background task failed"));
    // Auto-mint a top-level cost centre representing the branch so
    // per-branch P&L works out of the box (one row, code BR-####).
    // Fire-and-forget — the operator's branch create must succeed even
    // if the CC insert hiccups; the resolver falls back to the seed CCs.
    createCostCenterForEntity(
      targetCompanyId, "branch", r.insertId, name,
      { actorUserId: scope.userId },
    ).catch((e) => logger.error(e, "branch cost-centre auto-create failed"));
    const [row] = await rawQuery<BranchRow>(`SELECT * FROM branches WHERE id=$1 AND "companyId"=$2`, [r.insertId, targetCompanyId]);
    res.status(201).json(row || { id: r.insertId });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/branches/:id", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(updateBranchSchema.safeParse(req.body));
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery(`SELECT id, "companyId" FROM branches WHERE id=$1 AND "companyId" = ANY($2)`, [id, scope.allowedCompanies]);
    if (!existing) { throw new NotFoundError("الفرع غير موجود"); }
    const { name, nameEn, city, phone, logoUrl, address, taxNumber, crNumber, email, website, footerText } = body;
    const sets: string[] = [];
    const params: unknown[] = [];
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
      companyId: scope.companyId, userId: scope.userId, action: "settings.updated",
      entity: "branches", entityId: id,
      before: existing, after: body,
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: id, details: JSON.stringify({ key: "branch" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "settings"); }
});

// DELETE /settings/branches/:id is a *soft* disable: it flips the row's
// status to "inactive" instead of removing the record. Branches sit at the
// root of 15 FK relations (employee_assignments, purchase_orders, departments,
// shifts, credit/debit_memos, bank_guarantees, customer_advances,
// document_templates, employee_of_month, hr_employee_loans, hr_exit_requests,
// hr_inquiry_memos, hr_overtime_requests, payment_runs), so a hard DELETE
// would either fail under RESTRICT or orphan data; soft-disable hides the
// branch from the header picker (the GET filter above already excludes
// `status != 'active'`) while keeping every historical row addressable.
//
// Force-disable is blocked when active employees or open purchase orders
// still reference the branch — the operator is asked to reassign or close
// those first. `?force=true` is reserved for a future hard-delete path
// gated on every FK count being zero; until then it has no effect.
router.delete("/branches/:id", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const branchId = parseId(req.params.id, "id");
    const scope = req.scope!;

    // Optional: move the active employees + open purchase orders that
    // would otherwise block the disable to this target branch first, so
    // the operator can retire an old branch in one step (e.g. after
    // consolidating into a new branch). When omitted, the blockers below
    // are surfaced so the caller can pick a destination.
    const reassignRaw = (req.body?.reassignToBranchId ?? req.body?.reassignTo) as unknown;
    const reassignToBranchId =
      reassignRaw === undefined || reassignRaw === null || reassignRaw === ""
        ? null
        : Number(reassignRaw);
    if (
      reassignToBranchId !== null &&
      (!Number.isInteger(reassignToBranchId) || reassignToBranchId <= 0)
    ) {
      throw new ValidationError("الفرع البديل غير صالح");
    }

    const [beforeBranch] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM branches WHERE id=$1 AND "companyId"=$2`,
      [branchId, scope.companyId],
    );
    if (!beforeBranch) throw new NotFoundError("الفرع غير موجود");
    if ((beforeBranch.status as string | null) === "inactive") {
      throw new ValidationError("الفرع مُعطَّل مسبقاً");
    }

    // Validate the reassignment target up front: it must be a different,
    // active branch owned by the same company.
    if (reassignToBranchId !== null) {
      if (reassignToBranchId === branchId) {
        throw new ValidationError("لا يمكن نقل البيانات إلى نفس الفرع المراد تعطيله");
      }
      const [target] = await rawQuery<{ id: number; status: string | null }>(
        `SELECT id, status FROM branches WHERE id=$1 AND "companyId"=$2`,
        [reassignToBranchId, scope.companyId],
      );
      if (!target) throw new ValidationError("الفرع البديل غير موجود في شركتك");
      if ((target.status as string | null) === "inactive") {
        throw new ValidationError("الفرع البديل مُعطَّل — اختر فرعاً نشطاً");
      }
    }

    const [activeEmployees] = await rawQuery<CountRow>(
      `SELECT COUNT(*) AS cnt FROM employee_assignments WHERE "branchId" = $1 AND status = 'active' AND "companyId" = $2`,
      [branchId, scope.companyId],
    );
    const [openOrders] = await rawQuery<CountRow>(
      `SELECT COUNT(*) AS cnt FROM purchase_orders WHERE "branchId" = $1 AND status NOT IN ('cancelled','received','completed') AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [branchId, scope.companyId],
    );
    const empCount = Number(activeEmployees?.cnt ?? 0);
    const poCount = Number(openOrders?.cnt ?? 0);

    const blockers: string[] = [];
    if (empCount > 0) {
      blockers.push(`يوجد ${empCount} موظف نشط مرتبط بهذا الفرع — أعد إسنادهم أولاً`);
    }
    if (poCount > 0) {
      blockers.push(`يوجد ${poCount} أمر شراء مفتوح مرتبط بهذا الفرع — أغلقها أو حوّلها`);
    }
    // Blocked and no destination supplied → tell the caller exactly what's
    // in the way and that it can be cleared by reassigning to another branch.
    if (blockers.length > 0 && reassignToBranchId === null) {
      throw new ConflictError("لا يمكن تعطيل الفرع — يوجد بيانات نشطة مرتبطة", {
        meta: { blockers, canReassign: true },
      });
    }

    // Move the blocking active data to the destination branch (if any) and
    // disable the source branch atomically.
    // حدود المسارات (#2839): الإعدادات تُنسّق تعطيل الفرع وتكتب جدولها (branches)،
    // لكن إعادة إسناد بيانات HR/المالية المملوكة تتمّ عبر عقدَي المسارين القائدين
    // (rawExecute فيهما ينضمّ للمعاملة المحيطة فتبقى العملية ذرّية).
    await withTransaction(async () => {
      if (reassignToBranchId !== null) {
        if (empCount > 0) {
          const { reassignActiveAssignmentsToBranch } = await import("./hr.js");
          await reassignActiveAssignmentsToBranch(scope.companyId, branchId, reassignToBranchId);
        }
        if (poCount > 0) {
          const { reassignOpenPurchaseOrdersToBranch } = await import("./finance-purchase.js");
          await reassignOpenPurchaseOrdersToBranch(scope.companyId, branchId, reassignToBranchId);
        }
      }
      await rawExecute(
        `UPDATE branches SET status='inactive' WHERE id=$1 AND "companyId"=$2`,
        [branchId, scope.companyId],
      );
    });

    const reassigned = reassignToBranchId !== null && (empCount > 0 || poCount > 0);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.deleted",
      entity: "branches", entityId: branchId,
      before: beforeBranch,
      after: { ...beforeBranch, status: "inactive" },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: branchId, details: JSON.stringify({ key: "branch", mode: "soft-disable", reassignToBranchId, reassigned }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({
      success: true,
      mode: "soft-disable",
      reassignedTo: reassigned ? reassignToBranchId : null,
      movedEmployees: reassignToBranchId !== null ? empCount : 0,
      movedPurchaseOrders: reassignToBranchId !== null ? poCount : 0,
    });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

// N13 fix: departments are co-owned by SysAdmin (settings feature) and
// HR Director (hr.organization feature). authorizeAny accepts whichever
// the caller's role grants — previously the page was reachable but the
// "create department" button silently failed for HR Director.
router.post("/departments", authorizeAny(
  { feature: "settings", action: "update" },
  { feature: "hr.organization", action: "create" },
), async (req, res) => {
  try {
    const body = zodParse(createDepartmentSchema.safeParse(req.body));
    const { name, nameEn, manager, administrationId, branchId } = body;
    const scope = req.scope!;
    // PR-7 (#2077) — the tree fields (administrationId + branchId) are
    // optional inputs that, when present, anchor the department to its
    // parent administration + branch. Validation: when administrationId
    // is provided, the row must belong to this company (back-end FK +
    // company filter guards against cross-tenant linkage).
    if (administrationId) {
      const [adm] = await rawQuery<{ id: number }>(
        `SELECT id FROM administrations WHERE id=$1 AND "companyId"=$2 AND "isActive"=TRUE LIMIT 1`,
        [administrationId, scope.companyId]
      );
      if (!adm) throw new ValidationError("الإدارة غير موجودة أو غير مفعّلة في شركتك");
    }
    const r = await rawExecute(
      `INSERT INTO departments (name, "nameEn", "companyId", "managerId", "administrationId", "branchId") VALUES ($1,$2,$3,$4,$5,$6)`,
      [name, nameEn || null, scope.companyId, manager || null, administrationId ?? null, branchId ?? null]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.created",
      entity: "departments", entityId: r.insertId,
      after: { name, nameEn, manager },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.created", entity: "settings", entityId: r.insertId, details: JSON.stringify({ key: "department" }) }).catch((e) => logger.error(e, "settings background task failed"));
    // Department → CC nested under the current branch when one is in
    // scope. Salaries / overheads can then be drilled by department.
    // Code: BR-####-D####. Fire-and-forget — non-blocking.
    createCostCenterForEntity(
      scope.companyId, "department", r.insertId, name,
      {
        parentEntityType: scope.branchId ? "branch" : null,
        parentEntityId: scope.branchId ?? null,
        actorUserId: scope.userId,
      },
    ).catch((e) => logger.error(e, "department cost-centre auto-create failed"));
    const [row] = await rawQuery<DepartmentRow>(`SELECT * FROM departments WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/departments/:id", authorizeAny(
  { feature: "settings", action: "update" },
  { feature: "hr.organization", action: "update" },
), async (req, res) => {
  try {
    const body = zodParse(updateDepartmentSchema.safeParse(req.body));
    const id = parseId(req.params.id, "id");
    const { name, nameEn, manager, administrationId, branchId } = body;
    const scope = req.scope!;
    if (administrationId) {
      const [adm] = await rawQuery<{ id: number }>(
        `SELECT id FROM administrations WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
        [administrationId, scope.companyId]
      );
      if (!adm) throw new ValidationError("الإدارة غير موجودة في شركتك");
    }
    const { affectedRows } = await rawExecute(
      `UPDATE departments SET name=$1, "nameEn"=$2, "managerId"=$3, "administrationId"=$4, "branchId"=$5 WHERE id=$6 AND "companyId"=$7 RETURNING id`,
      [name, nameEn || null, manager || null, administrationId ?? null, branchId ?? null, id, scope.companyId]
    );
    if (!affectedRows) throw new NotFoundError("القسم غير موجود");
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.updated",
      entity: "departments", entityId: id,
      after: { name, manager },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: id, details: JSON.stringify({ key: "department" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.delete("/departments/:id", authorizeAny(
  { feature: "settings", action: "update" },
  { feature: "hr.organization", action: "delete" },
), async (req, res) => {
  try {
    const id = parseId(req.params.id, "id");
    const scope = req.scope!;
    const [empCheck] = await rawQuery<CountRow>(
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
      companyId: scope.companyId, userId: scope.userId, action: "settings.deleted",
      entity: "departments", entityId: id,
      before: beforeDept,
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: id, details: JSON.stringify({ key: "department" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.post("/companies", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(createCompanySchema.safeParse(req.body));
    const scope = req.scope!;
    const { name, nameEn, taxNumber, crNumber } = body;
    // Validate the optional parent BEFORE creating the company, so an invalid
    // parent rejects the whole request instead of leaving a half-created company.
    if (body.parentCompanyId !== undefined && body.parentCompanyId !== null) {
      const parentId = body.parentCompanyId;
      if (!scope.allowedCompanies.includes(parentId)) throw new ForbiddenError("لا تملك صلاحية على الشركة الأم المحددة");
      const [parentExists] = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE id=$1`, [parentId]);
      if (!parentExists) throw new NotFoundError("الشركة الأم غير موجودة");
    }
    const r = await rawExecute(`INSERT INTO companies (name, "nameEn", "vatNumber", "crNumber") VALUES ($1,$2,$3,$4)`, [name, nameEn || null, taxNumber || null, crNumber || null]);
    const companyId = r.insertId;

    let branchId: number | undefined;
    let bootstrapped = false;
    try {
      const result = await bootstrapCompany(companyId, name, scope.employeeId);
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

    // Apply the optional parent-company link (already validated above). A
    // brand-new company is a leaf, so no cycle is possible here.
    if (body.parentCompanyId !== undefined && body.parentCompanyId !== null && body.parentCompanyId !== companyId) {
      await rawExecute(`UPDATE companies SET "parentCompanyId"=$1 WHERE id=$2`, [body.parentCompanyId, companyId]);
    }

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.created",
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

/* ── Company hard-purge (owner only) ────────────────────────────────────────
 * Two-step, owner-gated permanent deletion of an ENTIRE company and all of its
 * data across the schema. `purge-preview` returns the per-table row counts that
 * WOULD be deleted (read-only); `purge` performs the irreversible delete inside
 * a single transaction. The plain DELETE /companies/:id cannot remove a company
 * that has any child data (half the FKs to companies are NO ACTION) — this
 * clears dependents in FK-safe order first. See lib/purgeCompany.ts. Mounted
 * before /companies/:id so the literal paths are not captured by the :id param.
 */
const companyPurgeSchema = z.object({
  companyIds: z.array(z.number().int().positive()).min(1).max(20),
  confirm: z.boolean().optional(),
});

router.post("/companies/purge-preview", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!scope.isOwner) throw new ForbiddenError("هذه العملية متاحة للمالك فقط");
    const { companyIds } = zodParse(companyPurgeSchema.safeParse(req.body ?? {}));
    for (const id of companyIds) {
      if (!scope.allowedCompanies?.includes(id) && scope.companyId !== id) {
        throw new ForbiddenError(`لا تملك صلاحية على الشركة رقم ${id}`);
      }
      if (id === scope.companyId) throw new ValidationError("لا يمكنك حذف الشركة الحالية — بدّل إلى شركة أخرى أولاً");
    }
    const preview = await withTransaction((client) => previewCompanyPurge(client, companyIds));
    res.json({ companyIds, ...preview });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.post("/companies/purge", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    if (!scope.isOwner) throw new ForbiddenError("هذه العملية متاحة للمالك فقط");
    const { companyIds, confirm } = zodParse(companyPurgeSchema.safeParse(req.body ?? {}));
    if (confirm !== true) throw new ValidationError("يجب تأكيد الحذف النهائي (confirm=true)");
    for (const id of companyIds) {
      if (!scope.allowedCompanies?.includes(id) && scope.companyId !== id) {
        throw new ForbiddenError(`لا تملك صلاحية على الشركة رقم ${id}`);
      }
      if (id === scope.companyId) throw new ValidationError("لا يمكنك حذف الشركة الحالية — بدّل إلى شركة أخرى أولاً");
    }
    const before = await withTransaction((client) => previewCompanyPurge(client, companyIds));
    const result = await withTransaction((client) => purgeCompanies(client, companyIds));
    for (const id of companyIds) {
      createAuditLog({
        companyId: scope.companyId, userId: scope.userId, action: "settings.deleted",
        entity: "companies", entityId: id,
        before: { purgedCompanyId: id, preview: before.rows, totalRows: result.total },
      }).catch((e) => logger.error(e, "settings background task failed"));
    }
    logger.warn({ companyIds, total: result.total, passes: result.passes, by: scope.userId }, "company hard-purge executed");
    res.json({ success: true, ...result });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/companies/:id", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(updateCompanySchema.safeParse(req.body));
    const id = parseId(req.params.id, "id");
    const { name, nameEn, taxNumber, crNumber } = body;
    const scope = req.scope!;
    if (!scope.allowedCompanies?.includes(id) && scope.companyId !== id) {
      throw new ForbiddenError("لا يمكنك تعديل شركة لا تملك صلاحية عليها");
    }
    const { affectedRows } = await rawExecute(`UPDATE companies SET name=$1, "nameEn"=$2, "vatNumber"=$3, "crNumber"=$4 WHERE id=$5 RETURNING id`, [name, nameEn || null, taxNumber || null, crNumber || null, id]);
    if (!affectedRows) throw new NotFoundError("الشركة غير موجودة");

    // Optional parent-company link: set, change, or clear (null) the parent.
    if (body.parentCompanyId !== undefined) {
      const parentId = body.parentCompanyId;
      if (parentId === null) {
        await rawExecute(`UPDATE companies SET "parentCompanyId"=NULL WHERE id=$1`, [id]);
      } else {
        if (parentId === id) throw new ValidationError("لا يمكن أن تكون الشركة تابعة لنفسها");
        if (!scope.allowedCompanies?.includes(parentId)) throw new ForbiddenError("لا تملك صلاحية على الشركة الأم المحددة");
        const [parent] = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE id=$1`, [parentId]);
        if (!parent) throw new NotFoundError("الشركة الأم غير موجودة");
        // Reject ANY cycle (A→B→C→A), not just a direct 2-cycle: walk the
        // proposed parent's ancestry chain; if it already contains this company,
        // linking would close a loop.
        const cycle = await rawQuery<{ one: number }>(
          `WITH RECURSIVE anc AS (
             SELECT c0.id AS id, c0."parentCompanyId" AS "parentCompanyId" FROM companies c0 WHERE c0.id = $1
             UNION ALL
             SELECT c.id AS id, c."parentCompanyId" AS "parentCompanyId" FROM companies c JOIN anc ON c.id = anc."parentCompanyId"
           ) SELECT 1 AS one FROM anc WHERE anc.id = $2 LIMIT 1`,
          [parentId, id],
        );
        if (cycle.length > 0) throw new ValidationError("لا يمكن إنشاء ارتباط دائري بين الشركات");
        await rawExecute(`UPDATE companies SET "parentCompanyId"=$1 WHERE id=$2`, [parentId, id]);
      }
    }
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.updated",
      entity: "companies", entityId: id,
      after: { name, nameEn, taxNumber, crNumber },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: id, details: JSON.stringify({ key: "company" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

// البند ٣ (دفعة ٣) — عقد الإعدادات: تطبيق مستخرَج OCR مؤكَّد (سجل تجاري) على الشركة.
// حدّ المسار: الوثائق (خادم) لا تكتب على الشركة؛ هذا العقد المملوك للإعدادات يكتب
// crNumber بصلاحية settings + حارس ملكية الشركة (نفس PUT أعلاه) + تدقيق، بسياسة «املأ
// الفارغ فقط» (لا يطمس سجلًا تجاريًّا قائمًا). جهة الإصدار بلا عمود → تبقى للمراجعة.
router.post("/companies/:id/ocr-apply", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    if (!scope.allowedCompanies?.includes(id) && scope.companyId !== id) {
      throw new ForbiddenError("لا يمكنك تعديل شركة لا تملك صلاحية عليها");
    }
    const docType = String(req.body?.docType ?? "");
    const fields = req.body?.fields && typeof req.body.fields === "object" ? req.body.fields : {};
    if (!/commercial|سجل\s*تجاري|cr_?reg|registration/i.test(docType)) {
      throw new ValidationError("نوع المستند غير مدعوم بعد للتطبيق على الشركة", { field: "docType", fix: "المدعوم: السجل التجاري." });
    }
    const crNumber = typeof fields.crNumber === "string" && /^\d{10}$/.test(fields.crNumber) ? fields.crNumber : null;
    if (!crNumber) {
      res.json({ ok: true, applied: [], skipped: [], message: "لا رقم سجل صالح للتطبيق." });
      return;
    }
    const [comp] = await rawQuery<{ id: number; crNumber: string | null }>(`SELECT id, "crNumber" FROM companies WHERE id=$1`, [id]);
    if (!comp) throw new NotFoundError("الشركة غير موجودة");
    if (comp.crNumber) {
      res.json({ ok: true, applied: [], skipped: ["crNumber"], message: "سجل تجاري قائم — لم يُطمَس." });
      return;
    }
    await rawExecute(`UPDATE companies SET "crNumber"=$1 WHERE id=$2`, [crNumber, id]);
    void createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "company.ocr.applied",
      entity: "companies", entityId: id, after: { docType, applied: ["crNumber"], crNumber },
    }).catch((e) => logger.error(e, "company ocr apply audit failed"));
    res.json({ ok: true, applied: ["crNumber"], skipped: [] });
  } catch (err) { handleRouteError(err, res, "company OCR apply error:"); }
});

router.delete("/companies/:id", authorize({ feature: "settings", action: "update" }), async (req, res) => {
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
      companyId: scope.companyId, userId: scope.userId, action: "settings.deleted",
      entity: "companies", entityId: id,
      before: beforeCompany,
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: id, details: JSON.stringify({ key: "company" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.get("/timezone", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const rows = await rawQuery(`SELECT value FROM system_settings WHERE key='timezone' AND "companyId" IS NULL AND "branchId" IS NULL`);
    const timezone = rows.length > 0 ? rows[0].value : "Asia/Riyadh";
    res.json(maskFields(req, { timezone }));
  } catch (e) {
    logger.warn(e, "failed to load timezone setting, using default");
    res.json({ timezone: "Asia/Riyadh" });
  }
});

router.get("/system-controls", authorize({ feature: "settings", action: "view" }), async (req, res) => {
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
    res.json(maskFields(req, { data: controls }));
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/system-controls", authorize({ feature: "settings", action: "update" }), async (req, res) => {
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
      companyId: scope.companyId, userId: scope.userId, action: "settings.updated",
      entity: "settings", entityId: 0,
      after: { keys: Object.keys(entries) },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: 0, details: JSON.stringify({ key: "system_controls" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

// /role-modules GET+PUT removed in #1791 — role→module visibility now derives
// from RBAC v2 grants (rbac_role_grants), surfaced via /api/permissions/my and
// edited in the RBAC v2 editor. roleModulesSchema above is now unused (kept
// harmless; noUnusedLocals is off).

router.get("/approval-config", authorize({ feature: "settings", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // #685 PR-A6 — branch tracer-bullet: approval_chains has NO branchId column
    // (verified against information_schema 2026-05-20), so disableBranchScope:true
    // preserves existing behavior exactly. softDeleteColumn keeps the deletedAt
    // filter inside the helper instead of hand-rolled.
    const { where, params } = buildScopedWhere(scope, {}, {
      disableBranchScope: true,
      softDeleteColumn: '"deletedAt"',
    });
    const chains = await rawQuery(
      `SELECT * FROM approval_chains WHERE ${where} ORDER BY "chainType", "name"`,
      params
    );
    res.json(maskFields(req, { data: chains }));
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.post("/approval-config", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const body = zodParse(approvalConfigSchema.safeParse(req.body));
    const scope = req.scope!;
    const { chainType, name, minAmount, maxAmount, isActive } = body;
    const r = await rawExecute(
      `INSERT INTO approval_chains ("companyId", "chainType", "name", "minAmount", "maxAmount", "isActive") VALUES ($1,$2,$3,$4,$5,$6)`,
      [scope.companyId, chainType, name || chainType, minAmount || 0, maxAmount || null, isActive !== false]
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.created",
      entity: "approval_chains", entityId: r.insertId,
      after: { chainType, name, minAmount, maxAmount, isActive },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.created", entity: "settings", entityId: r.insertId, details: JSON.stringify({ key: "approval_config" }) }).catch((e) => logger.error(e, "settings background task failed"));
    const [row] = await rawQuery<ApprovalChainRow>(`SELECT * FROM approval_chains WHERE id=$1 AND "companyId"=$2`, [r.insertId, scope.companyId]);
    res.status(201).json(row || { id: r.insertId });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.delete("/approval-config/:id", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [beforeChain] = await rawQuery(`SELECT * FROM approval_chains WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!beforeChain) throw new NotFoundError("سلسلة الاعتماد غير موجودة");
    await rawExecute(`UPDATE approval_chains SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.deleted",
      entity: "approval_chains", entityId: id,
      before: beforeChain,
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.deleted", entity: "settings", entityId: id, details: JSON.stringify({ key: "approval_config" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

const SETTINGS_SECRET_KEYS = new Set(["sms_auth_token", "whatsapp_access_token", "whatsapp_verify_token"]);

function maskSecretSettings<T extends { key: string; value: unknown }>(rows: T[]): T[] {
  return rows.map((r) => SETTINGS_SECRET_KEYS.has(r.key) && r.value ? { ...r, value: "__configured__" } : r);
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

router.get("/channels", authorize({ feature: "settings", action: "view" }), async (req, res) => {
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

    res.json(maskFields(req, { data: result }));
  } catch (err) { handleRouteError(err, res, "settings"); }
});

router.put("/channels", authorize({ feature: "settings", action: "update" }), async (req, res) => {
  try {
    const entries: Record<string, string | null> = zodParse(channelsSchema.safeParse(req.body));
    const scope = req.scope!;

    const SECRET_KEYS_PUT = new Set(["sms_auth_token", "whatsapp_access_token"]);
    const allowedKeys = new Set(CHANNEL_SETTING_KEYS);
    await withTransaction(async (client) => {
      for (const [key, value] of Object.entries(entries)) {
        if (!allowedKeys.has(key)) continue;
        if (SECRET_KEYS_PUT.has(key) && value === "__configured__") continue;

        if (value === null || value === undefined || value === "") {
          await client.query(
            `DELETE FROM system_settings WHERE key=$1 AND "companyId"=$2`,
            [key, scope.companyId]
          );
        } else {
          const existing = await client.query(
            `SELECT id FROM system_settings WHERE key=$1 AND "companyId"=$2`,
            [key, scope.companyId]
          );
          if (existing.rows.length > 0) {
            await client.query(
              `UPDATE system_settings SET value=$1, "updatedAt"=NOW() WHERE key=$2 AND "companyId"=$3`,
              [value, key, scope.companyId]
            );
          } else {
            await client.query(
              `INSERT INTO system_settings (key, value, "companyId") VALUES ($1, $2, $3)`,
              [key, value, scope.companyId]
            );
          }
        }
      }
    });

    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "settings.updated",
      entity: "settings", entityId: 0,
      after: { keys: Object.keys(entries) },
    }).catch((e) => logger.error(e, "settings background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "settings.updated", entity: "settings", entityId: 0, details: JSON.stringify({ key: "channels" }) }).catch((e) => logger.error(e, "settings background task failed"));
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "settings"); }
});

// ════════════════════════════════════════════════════════════════════════════
// PR-7 (#2077) — Administrations CRUD + unified org tree.
//
// Administrations are the NEW level the deep audit found missing:
//   Company → Branch → Administration → Department → Team
// They're company-scoped, optionally branch-anchored (an «إدارة» can
// span branches OR live under one), with the same activate/archive
// shape every other org node uses.
//
// Committee + Project + Cost Center are NOT mounted here. They live in
// /org/{committees,projects,scoring-weights}/* and stay as operational
// bridges (employee_committee_memberships, employee_project_assignments)
// per the product owner's final decision.
// ════════════════════════════════════════════════════════════════════════════

const HR_ORG_READ  = { feature: "hr.organization", action: "list" } as const;
const HR_ORG_WRITE = { feature: "hr.organization", action: "update" } as const;

router.get("/administrations", authorize(HR_ORG_READ), async (req, res) => {
  try {
    const scope = req.scope!;
    const includeInactive = req.query.includeInactive === "true";
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT a.id, a.name, a."nameEn", a.description, a."branchId",
              b.name AS "branchName",
              a."managerAssignmentId", a."isActive",
              a."createdAt", a."updatedAt",
              (SELECT COUNT(*)::int FROM departments d WHERE d."administrationId" = a.id) AS "departmentCount",
              (SELECT COUNT(*)::int FROM employee_assignments ea
                JOIN departments d ON d.id = ea."departmentId"
                WHERE d."administrationId" = a.id AND ea.status = 'active') AS "employeeCount"
         FROM administrations a
         LEFT JOIN branches b ON b.id = a."branchId"
        WHERE a."companyId" = $1
          ${includeInactive ? "" : `AND a."isActive" = TRUE`}
        ORDER BY a."isActive" DESC, a.name`,
      [scope.companyId],
    );
    res.json({ data: rows, total: rows.length });
  } catch (e) { handleRouteError(e, res, "تعذّر جلب الإدارات"); }
});

router.post("/administrations", authorize(HR_ORG_WRITE), async (req, res) => {
  try {
    const scope = req.scope!;
    const body = zodParse(createAdministrationSchema.safeParse(req.body));
    if (body.branchId) {
      const [br] = await rawQuery<{ id: number }>(
        `SELECT id FROM branches WHERE id=$1 AND "companyId"=$2 LIMIT 1`,
        [body.branchId, scope.companyId]
      );
      if (!br) throw new ValidationError("الفرع غير موجود في شركتك");
    }
    const [row] = await rawQuery<{ id: number; name: string }>(
      `INSERT INTO administrations
        ("companyId", "branchId", name, "nameEn", description, "managerAssignmentId", "isActive")
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, TRUE))
       RETURNING id, name`,
      [scope.companyId, body.branchId ?? null, body.name, body.nameEn ?? null,
       body.description ?? null, body.managerAssignmentId ?? null, body.isActive ?? null],
    );
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "administrations", entityId: row.id,
      activeRoleKey: scope.selectedRoleKey ?? null,
      activeDepartmentId: scope.activeDepartmentId ?? null,
      resolvedScope: scope.resolvedScope ?? null,
      impersonationSourceUser: scope.impersonationSourceUser ?? null,
      after: { name: body.name, branchId: body.branchId ?? null },
    }).catch((e) => logger.warn(e, "administration audit failed"));
    await emitEvent({
      companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
      action: "org.administration.created", entity: "administrations", entityId: row.id,
      details: JSON.stringify({ name: body.name, branchId: body.branchId ?? null }),
    }).catch((e) => logger.warn(e, "administration event failed"));
    res.status(201).json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر إنشاء الإدارة"); }
});

router.patch("/administrations/:id", authorize(HR_ORG_WRITE), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id);
    const body = zodParse(updateAdministrationSchema.safeParse(req.body));
    const sets: string[] = []; const vals: unknown[] = [];
    let i = 1;
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      sets.push(`"${k}" = $${i++}`); vals.push(v);
    }
    if (sets.length === 0) { res.json({ data: null, noop: true }); return; }
    sets.push(`"updatedAt" = now()`);
    vals.push(id, scope.companyId);
    const [row] = await rawQuery<{ id: number; name: string }>(
      `UPDATE administrations SET ${sets.join(", ")}
        WHERE id = $${i++} AND "companyId" = $${i++} RETURNING id, name`,
      vals,
    );
    if (!row) throw new NotFoundError("الإدارة غير موجودة");
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "administrations", entityId: id,
      activeRoleKey: scope.selectedRoleKey ?? null,
      activeDepartmentId: scope.activeDepartmentId ?? null,
      resolvedScope: scope.resolvedScope ?? null,
      impersonationSourceUser: scope.impersonationSourceUser ?? null,
      after: body,
    }).catch((e) => logger.warn(e, "administration audit failed"));
    res.json({ data: row });
  } catch (e) { handleRouteError(e, res, "تعذّر تعديل الإدارة"); }
});

router.delete("/administrations/:id", authorize(HR_ORG_WRITE), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id);
    // Soft-delete pattern (same as teams/committees): flip isActive
    // off. Departments that reference this administration are NOT
    // cascade-deleted — they become «orphan» and the admin UI flags
    // them. Hard-delete would risk losing audit lineage.
    const result = await rawExecute(
      `UPDATE administrations SET "isActive" = FALSE, "updatedAt" = now()
        WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId],
    );
    if (result.affectedRows === 0) throw new NotFoundError("الإدارة غير موجودة");
    await createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "archive", entity: "administrations", entityId: id,
      activeRoleKey: scope.selectedRoleKey ?? null,
      activeDepartmentId: scope.activeDepartmentId ?? null,
      resolvedScope: scope.resolvedScope ?? null,
      impersonationSourceUser: scope.impersonationSourceUser ?? null,
    }).catch((e) => logger.warn(e, "administration audit failed"));
    res.json({ data: { id, isActive: false } });
  } catch (e) { handleRouteError(e, res, "تعذّر أرشفة الإدارة"); }
});

// ════════════════════════════════════════════════════════════════════════════
// Unified org tree: Company → Branch → Administration → Department → Team.
// Returns the nested structure in ONE call so the admin page renders
// the tree without 5 separate queries. Committee + Project are NOT
// included — they're surfaced separately as operational bridges.
// ════════════════════════════════════════════════════════════════════════════
router.get("/org-tree", authorize(HR_ORG_READ), async (req, res) => {
  try {
    const scope = req.scope!;
    const [company] = await rawQuery<{ id: number; name: string }>(
      `SELECT id, name FROM companies WHERE id = $1`,
      [scope.companyId],
    );
    if (!company) throw new NotFoundError("الشركة غير موجودة");

    const branches = await rawQuery<{ id: number; name: string }>(
      `SELECT id, name FROM branches
        WHERE "companyId" = $1 AND status = 'active'
        ORDER BY name`,
      [scope.companyId],
    );
    const administrations = await rawQuery<{ id: number; name: string; branchId: number | null; isActive: boolean }>(
      `SELECT id, name, "branchId", "isActive"
         FROM administrations
        WHERE "companyId" = $1
        ORDER BY "isActive" DESC, name`,
      [scope.companyId],
    );
    const departments = await rawQuery<{ id: number; name: string; branchId: number | null; administrationId: number | null; managerId: number | null }>(
      `SELECT id, name, "branchId", "administrationId", "managerId"
         FROM departments
        WHERE "companyId" = $1 AND status = 'active'
        ORDER BY name`,
      [scope.companyId],
    );
    const teams = await rawQuery<{ id: number; name: string; departmentId: number | null; leaderAssignmentId: number | null }>(
      `SELECT id, name, "departmentId", "leaderAssignmentId"
         FROM teams
        WHERE "companyId" = $1 AND "isActive" = TRUE
        ORDER BY name`,
      [scope.companyId],
    );

    // Employee count rollup per (administrationId | departmentId | teamId).
    const empCounts = await rawQuery<{ administrationId: number | null; departmentId: number | null; teamId: number | null; count: string }>(
      `SELECT d."administrationId", ea."departmentId",
              etm."teamId", COUNT(*)::int AS count
         FROM employee_assignments ea
         LEFT JOIN departments d ON d.id = ea."departmentId"
         LEFT JOIN employee_team_memberships etm
           ON etm."assignmentId" = ea.id
          AND (etm."endDate" IS NULL OR etm."endDate" >= CURRENT_DATE)
        WHERE ea."companyId" = $1 AND ea.status = 'active'
        GROUP BY d."administrationId", ea."departmentId", etm."teamId"`,
      [scope.companyId],
    );
    const empByDept: Record<number, number> = {};
    const empByAdm: Record<number, number> = {};
    const empByTeam: Record<number, number> = {};
    for (const r of empCounts) {
      if (r.departmentId) empByDept[r.departmentId] = (empByDept[r.departmentId] ?? 0) + Number(r.count);
      if (r.administrationId) empByAdm[r.administrationId] = (empByAdm[r.administrationId] ?? 0) + Number(r.count);
      if (r.teamId) empByTeam[r.teamId] = (empByTeam[r.teamId] ?? 0) + Number(r.count);
    }

    // Build the nested structure. Departments without administrationId
    // become «orphan» at the branch level (handled by the admin UI).
    const teamsByDept: Record<number, Array<Record<string, unknown>>> = {};
    for (const t of teams) {
      const key = t.departmentId ?? 0;
      if (!teamsByDept[key]) teamsByDept[key] = [];
      teamsByDept[key].push({ ...t, employeeCount: empByTeam[t.id] ?? 0 });
    }
    const deptsByAdm: Record<number, Array<Record<string, unknown>>> = {};
    const orphanDepts: Array<Record<string, unknown>> = [];
    for (const d of departments) {
      const entry = { ...d, employeeCount: empByDept[d.id] ?? 0, teams: teamsByDept[d.id] ?? [] };
      if (d.administrationId) {
        if (!deptsByAdm[d.administrationId]) deptsByAdm[d.administrationId] = [];
        deptsByAdm[d.administrationId].push(entry);
      } else {
        orphanDepts.push(entry);
      }
    }
    const admsByBranch: Record<number, Array<Record<string, unknown>>> = {};
    const adminsWithoutBranch: Array<Record<string, unknown>> = [];
    for (const a of administrations) {
      const entry = {
        ...a,
        employeeCount: empByAdm[a.id] ?? 0,
        departments: deptsByAdm[a.id] ?? [],
      };
      if (a.branchId) {
        if (!admsByBranch[a.branchId]) admsByBranch[a.branchId] = [];
        admsByBranch[a.branchId].push(entry);
      } else {
        adminsWithoutBranch.push(entry);
      }
    }

    res.json({
      company: { id: company.id, name: company.name },
      branches: branches.map((b) => ({
        ...b,
        administrations: admsByBranch[b.id] ?? [],
      })),
      // Adminisrtations not bound to a branch (cross-branch) + departments
      // not bound to an administration. The UI surfaces them with an
      // «orphan» label so HR completes the chain.
      crossBranchAdministrations: adminsWithoutBranch,
      orphanDepartments: orphanDepts,
    });
  } catch (e) { handleRouteError(e, res, "تعذّر بناء الشجرة التنظيمية"); }
});

export default router;
