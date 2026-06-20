import { handleRouteError, NotFoundError, parseId, zodParse } from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { requireRole } from "../middlewares/roleGuard.js";
import { aiEngine } from "../lib/aiEngine.js";
import { createAuditLog, emitEvent, todayISO } from "../lib/businessHelpers.js";
import { calculateEmployeeKPIs, getCompanyKPIs } from "../lib/kpiEngine.js";
import { buildAllSchedules, buildEmployeeSchedule } from "../lib/scheduleBuilder.js";
import { runSmartAlerts } from "../lib/smartAlerts.js";
import { haversineDistance, movingAverage, selectLeastLoadedResource, loadBalanceAssign } from "../lib/algorithms.js";
import { getUsageStats } from "../lib/activityTracker.js";
import { calculateClientRFM, calculateAllClientsRFM, getClientAnalyticsSummary, getBestContactTime, detectSeasonalPatterns } from "../lib/clientAnalytics.js";
import { getPersonalizedRecommendations } from "../lib/smartRecommendations.js";
import { logger } from "../lib/logger.js";
import {
  loadInfraCriticalDigestConfig,
  saveInfraCriticalDigestConfig,
  deleteInfraCriticalDigestCompanyOverride,
  hasInfraCriticalDigestCompanyOverride,
  parseInfraCriticalDigestConfig,
  INFRA_CRITICAL_DIGEST_CONFIG_KEY,
  INFRA_CRITICAL_DIGEST_DEFAULT_CONFIG,
  INFRA_CRITICAL_DIGEST_MIN_COOLDOWN_MINUTES,
  INFRA_CRITICAL_DIGEST_MAX_COOLDOWN_MINUTES,
  type InfraCriticalDigestConfig,
} from "../lib/infraAlerts.js";

// ── Zod Schemas ──────────────────────────────────────────────────────────────

const aiCategorizeSchema = z.object({
  message: z.string().min(1),
  context: z.any().optional(),
});

const aiDraftReplySchema = z.object({
  ticketTitle: z.string().min(1),
  ticketDescription: z.string().min(1),
  history: z.any().optional(),
});

const aiTranslateSchema = z.object({
  text: z.string().min(1),
  targetLanguage: z.enum(["ar", "en"]),
});

const aiSummarizeSchema = z.object({
  content: z.string().min(1),
  maxLength: z.coerce.number().optional(),
});

const aiEvaluateRulesSchema = z.object({
  context: z.any(),
  data: z.any(),
  rules: z.any().optional(),
});

const aiForecastSchema = z.object({
  metricName: z.string().min(1),
  historicalData: z.any(),
  forecastPeriods: z.coerce.number().optional(),
});

const haversineSchema = z.object({
  lat1: z.coerce.number(),
  lon1: z.coerce.number(),
  lat2: z.coerce.number(),
  lon2: z.coerce.number(),
});

const movingAverageSchema = z.object({
  values: z.array(z.coerce.number()),
  periods: z.coerce.number(),
});

const loadBalanceSchema = z.object({
  resources: z.array(z.any()),
  targetLat: z.coerce.number().optional(),
  targetLon: z.coerce.number().optional(),
  maxWorkload: z.coerce.number().optional(),
});

const smartAssignSchema = z.object({
  taskType: z.string().optional(),
  targetLat: z.coerce.number().optional(),
  targetLon: z.coerce.number().optional(),
  requiredSpecialty: z.string().optional(),
  taskTitle: z.string().optional(),
});

const router = Router();

router.get("/alerts", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { severity, isRead } = req.query as Record<string, string | undefined>;
    const conditions = [`"companyId" = $1`];
    const params: unknown[] = [scope.companyId];
    if (severity) { params.push(severity); conditions.push(`severity = $${params.length}`); }
    if (isRead !== undefined) { params.push(isRead === 'true'); conditions.push(`"isRead" = $${params.length}`); }
    const rows = await rawQuery<Record<string, unknown>>(`SELECT * FROM smart_alerts WHERE ${conditions.join(" AND ")} ORDER BY "createdAt" DESC LIMIT 100`, params);
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "Alerts error:"); }
});

router.post("/alerts/scan", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const result = await runSmartAlerts(scope.companyId);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "smart_alerts", entityId: 0, after: { fired: result.fired } }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.alert.scanned",
      entity: "smart_alerts",
      entityId: 0,
      details: JSON.stringify({ fired: result.fired }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({ message: `تم فحص التنبيهات الذكية`, fired: result.fired, details: result.details });
  } catch (err) { handleRouteError(err, res, "Alert scan error:"); }
});

router.patch("/alerts/:id/read", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawQuery(
      `UPDATE smart_alerts SET "isRead"=true WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "smart_alerts", entityId: id, after: { isRead: true } }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.alert.read",
      entity: "smart_alerts",
      entityId: id,
      details: JSON.stringify({ isRead: true }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({ message: "تم تعليم التنبيه كمقروء" });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ── Infrastructure alerts (platform "infra" health) ──────────────────────────
// One place for admins to see recent platform-level alerts — Redis rate-limit
// fallback/recovery, event-DLQ backlog, and recurring suppression-trace write
// failures — instead of digging through email or the generic alerts screen.
// All such alerts land in smart_alerts with relatedType = 'system_health'.
router.get("/alerts/infra", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { severity, state } = req.query as Record<string, string | undefined>;
    const conditions = [`sa."companyId" = $1`, `sa."relatedType" = 'system_health'`];
    const params: unknown[] = [scope.companyId];
    if (severity) { params.push(severity); conditions.push(`sa.severity = $${params.length}`); }
    // state: 'open' (default) | 'acknowledged' | 'all'
    if (state === "acknowledged") conditions.push(`sa."isDismissed" = true`);
    else if (state !== "all") conditions.push(`sa."isDismissed" = false`);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT sa.id, sa.type, sa.severity, sa.title, sa.description,
              sa."relatedType", sa."relatedId", sa."isRead", sa."isDismissed",
              sa."createdAt", sa."companyId", c.name AS "companyName"
       FROM smart_alerts sa
       LEFT JOIN companies c ON c.id = sa."companyId"
       WHERE ${conditions.join(" AND ")}
       ORDER BY sa."createdAt" DESC
       LIMIT 200`,
      params
    );
    const [counts] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) FILTER (WHERE "isDismissed" = false) AS open,
              COUNT(*) FILTER (WHERE "isDismissed" = false AND severity = 'critical') AS "openCritical"
       FROM smart_alerts
       WHERE "companyId" = $1 AND "relatedType" = 'system_health'`,
      [scope.companyId]
    );
    res.json(maskFields(req, {
      data: rows,
      total: rows.length,
      open: Number(counts?.open ?? 0),
      openCritical: Number(counts?.openCritical ?? 0),
    }));
  } catch (err) { handleRouteError(err, res, "Infra alerts error:"); }
});

router.patch("/alerts/:id/dismiss", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await rawQuery(
      `UPDATE smart_alerts SET "isDismissed"=true, "isRead"=true WHERE id=$1 AND "companyId"=$2`,
      [id, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "smart_alerts", entityId: id, after: { isDismissed: true } }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.alert.dismissed",
      entity: "smart_alerts",
      entityId: id,
      details: JSON.stringify({ isDismissed: true }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({ message: "تم اعتماد التنبيه" });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// Bulk-acknowledge open infra (system_health) alerts in one shot. During an
// incident the same root cause can fire many alerts (one per company); this lets
// an admin clear a wave at once, optionally narrowed to a single alert `type`.
router.post("/alerts/infra/dismiss-bulk", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const type = typeof req.body?.type === "string" && req.body.type.trim() ? String(req.body.type).trim() : undefined;
    const conditions = [`"companyId" = $1`, `"relatedType" = 'system_health'`, `"isDismissed" = false`];
    const params: unknown[] = [scope.companyId];
    if (type) { params.push(type); conditions.push(`type = $${params.length}`); }
    const updated = await rawQuery<{ id: number }>(
      `UPDATE smart_alerts SET "isDismissed"=true, "isRead"=true
       WHERE ${conditions.join(" AND ")} RETURNING id`,
      params
    );
    const count = updated.length;
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "smart_alerts", entityId: 0, after: { isDismissed: true, bulk: true, type: type ?? null, count } }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.alert.dismissed_bulk",
      entity: "smart_alerts",
      entityId: 0,
      details: JSON.stringify({ isDismissed: true, type: type ?? null, count }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({ dismissed: count, message: count > 0 ? `تم اعتماد ${count} تنبيه` : "لا توجد تنبيهات مفتوحة للاعتماد" });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

// ── Infra-critical digest config (Task #834 / per-company Task #845) ──────────
// Settings that control which severities page on-call and the re-alert cooldown
// for the critical-infra-alert digest (cronScheduler infraCriticalAlertDigestScan).
// Read by the cron scan; tuned here by admins. A company can set its OWN override
// (scope "company", the default) that falls back to the system default (scope
// "system"). The cron resolves the effective config per company.
const infraDigestConfigSchema = z.object({
  severityThreshold: z.enum(["info", "warning", "critical"]),
  cooldownMinutes: z
    .number()
    .int()
    .min(INFRA_CRITICAL_DIGEST_MIN_COOLDOWN_MINUTES)
    .max(INFRA_CRITICAL_DIGEST_MAX_COOLDOWN_MINUTES),
  // Which level this write targets. Defaults to the caller's own company so the
  // common case (a tenant tuning its own paging) needs no extra field.
  scope: z.enum(["company", "system"]).optional(),
  // Optional target company (Task #851) — lets an admin tune ANY company they
  // manage, not just their own. Validated against allowedCompanies server-side;
  // ignored when scope === "system". Absent → the caller's own company.
  companyId: z.number().int().positive().optional(),
});

router.get("/alerts/infra/settings", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    // Which company this read targets. An admin may tune any company they manage
    // (Task #851), so an optional ?companyId selects one of the caller's
    // allowed companies; absent/invalid falls back to the caller's own company
    // (the original single-company behaviour).
    const requestedCompanyId = Number(req.query.companyId);
    const targetCompanyId =
      Number.isInteger(requestedCompanyId) && scope.allowedCompanies.includes(requestedCompanyId)
        ? requestedCompanyId
        : scope.companyId;
    // Effective config for the target company (override → system default →
    // built-in), plus the raw system default and whether that company has its
    // own override so the UI can show "using system default" vs "company
    // override". `companies` powers the picker and flags which already have an
    // override (no settings:view needed — stays under the admin feature).
    const [config, systemConfig, hasOverride, companyRows, overrideRows] = await Promise.all([
      loadInfraCriticalDigestConfig(targetCompanyId),
      loadInfraCriticalDigestConfig(),
      hasInfraCriticalDigestCompanyOverride(targetCompanyId),
      rawQuery<{ id: number; name: string }>(
        `SELECT id, name FROM companies WHERE id = ANY($1) ORDER BY name`,
        [scope.allowedCompanies]
      ),
      rawQuery<{ companyId: number; value: string }>(
        `SELECT "companyId", value FROM system_settings WHERE key = $1 AND "companyId" = ANY($2) AND "branchId" IS NULL`,
        [INFRA_CRITICAL_DIGEST_CONFIG_KEY, scope.allowedCompanies]
      ),
    ]);
    // Map each overriding company to its parsed config so the UI can list which
    // companies deviate from the system default and HOW (Task #861), without an
    // extra per-company round-trip.
    const overrideConfigById = new Map<number, InfraCriticalDigestConfig>();
    for (const r of overrideRows) {
      overrideConfigById.set(Number(r.companyId), parseInfraCriticalDigestConfig(r.value));
    }
    const companies = companyRows.map((c) => {
      const override = overrideConfigById.get(Number(c.id));
      return {
        id: c.id,
        name: c.name,
        hasOverride: !!override,
        // Only overriding companies carry a config; inheritors use systemConfig.
        ...(override ? { config: override } : {}),
      };
    });
    res.json(maskFields(req, {
      companyId: targetCompanyId,
      companies,
      config,
      systemConfig,
      hasCompanyOverride: hasOverride,
      defaults: INFRA_CRITICAL_DIGEST_DEFAULT_CONFIG,
      limits: {
        minCooldownMinutes: INFRA_CRITICAL_DIGEST_MIN_COOLDOWN_MINUTES,
        maxCooldownMinutes: INFRA_CRITICAL_DIGEST_MAX_COOLDOWN_MINUTES,
      },
    }));
  } catch (err) { handleRouteError(err, res, "Infra digest settings error:"); }
});

router.put("/alerts/infra/settings", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    // zodParse for the shape, then parse... to normalise/clamp defensively.
    const input = zodParse(infraDigestConfigSchema.safeParse(req.body));
    const config = parseInfraCriticalDigestConfig(input);
    // A company-scoped write may target any company the admin manages
    // (Task #851); fall back to the caller's own company when unset/invalid.
    // Back-compat default: a bare write (no scope, no companyId) targets the
    // SYSTEM default — the original pre-#851 single-config behaviour and exactly
    // what the system-wide digest cron reads. A companyId without an explicit
    // scope is an unambiguous company-targeted write (Task #851). The frontend
    // always sends an explicit scope, so this only affects API callers that omit
    // it (e.g. the admin tuning the system default with no company picked).
    const effectiveScope: "system" | "company" =
      input.scope ?? (input.companyId != null ? "company" : "system");
    const overrideCompanyId =
      input.companyId != null && scope.allowedCompanies.includes(input.companyId)
        ? input.companyId
        : scope.companyId;
    const targetCompanyId = effectiveScope === "system" ? null : overrideCompanyId;
    await saveInfraCriticalDigestConfig(config, targetCompanyId);
    const auditPayload = { ...config, scope: effectiveScope, targetCompanyId };
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "update",
      entity: "system_settings", entityId: 0, after: { infra_critical_digest_config: auditPayload },
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "intelligence.infra_digest_settings.updated", entity: "system_settings", entityId: 0,
      details: JSON.stringify(auditPayload),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({
      message: effectiveScope === "system"
        ? "تم حفظ الإعداد الافتراضي للنظام"
        : "تم حفظ إعدادات تنبيهات البنية التحتية للشركة",
      config,
      scope: effectiveScope,
    });
  } catch (err) { handleRouteError(err, res, "Infra digest settings update error:"); }
});

// Remove a company's override so it falls back to the system default. An admin
// may reset any company they manage (Task #851) via ?companyId; absent/invalid
// resets the caller's own company.
router.delete("/alerts/infra/settings", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const requestedCompanyId = Number(req.query.companyId);
    const targetCompanyId =
      Number.isInteger(requestedCompanyId) && scope.allowedCompanies.includes(requestedCompanyId)
        ? requestedCompanyId
        : scope.companyId;
    await deleteInfraCriticalDigestCompanyOverride(targetCompanyId);
    const config = await loadInfraCriticalDigestConfig();
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId, action: "delete",
      entity: "system_settings", entityId: 0, after: { infra_critical_digest_config: "reset_to_system_default", targetCompanyId },
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "intelligence.infra_digest_settings.reset", entity: "system_settings", entityId: 0,
      details: JSON.stringify({ scope: "company", targetCompanyId }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({ message: "تمت إعادة الإعداد إلى الافتراضي للنظام", config });
  } catch (err) { handleRouteError(err, res, "Infra digest settings reset error:"); }
});

router.get("/kpis", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { employeeId, metricName } = req.query as Record<string, string | undefined>;
    const conditions = [`"companyId" = $1`];
    const params: unknown[] = [scope.companyId];
    if (employeeId) { params.push(Number(employeeId) || 0); conditions.push(`"employeeId" = $${params.length}`); }
    if (metricName) { params.push(metricName); conditions.push(`"metricName" = $${params.length}`); }
    const rows = await rawQuery<Record<string, unknown>>(`SELECT * FROM kpi_snapshots WHERE ${conditions.join(" AND ")} ORDER BY "snapshotDate" DESC LIMIT 200`, params);
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "KPIs error:"); }
});

router.get("/kpis/employee/:employeeId", authorize({ feature: "admin", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const employeeId = parseId(req.params.employeeId, "employeeId");
    const date = (req.query.date as string) ?? todayISO();
    const metrics = await calculateEmployeeKPIs(scope.companyId, employeeId, date);
    res.json(maskFields(req, { employeeId, date, metrics }));
  } catch (err) { handleRouteError(err, res, "Employee KPI error:"); }
});

router.get("/daily-schedule", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const date = (req.query.date as string) ?? todayISO();
    const schedules = await buildAllSchedules(cid, date);
    res.json(maskFields(req, { date, schedules }));
  } catch (err) { handleRouteError(err, res, "Daily schedule error:"); }
});

router.get("/daily-schedule/employee/:employeeId", authorize({ feature: "admin", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const employeeId = parseId(req.params.employeeId, "employeeId");
    const date = (req.query.date as string) ?? todayISO();
    const schedule = await buildEmployeeSchedule(scope.companyId, employeeId, date);
    res.json(maskFields(req, schedule));
  } catch (err) { handleRouteError(err, res, "Employee schedule error:"); }
});

router.get("/overview", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [[employees], [vehicles], [properties], [projects], [tickets], [revenue], [alerts]] = await Promise.all([
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total FROM employee_assignments WHERE "companyId"=$1 AND status='active'`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total FROM fleet_vehicles WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total FROM property_units WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as active FROM projects WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as open FROM support_tickets WHERE "companyId"=$1 AND status='open' AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COALESCE(SUM("paidAmount"),0) as total FROM invoices WHERE "companyId"=$1 AND "deletedAt" IS NULL AND "createdAt" >= date_trunc('month', CURRENT_DATE)`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as unread FROM smart_alerts WHERE "companyId"=$1 AND "isRead"=false`, [cid]),
    ]);

    res.json(maskFields(req, {
      totalEmployees: Number(employees?.total ?? 0),
      totalVehicles: Number(vehicles?.total ?? 0),
      totalProperties: Number(properties?.total ?? 0),
      activeProjects: Number(projects?.active ?? 0),
      openTickets: Number(tickets?.open ?? 0),
      monthlyRevenue: Number(revenue?.total ?? 0),
      unreadAlerts: Number(alerts?.unread ?? 0),
    }));
  } catch (err) { handleRouteError(err, res, "Intelligence overview error:"); }
});

router.get("/suggestions", requireRole("branch_manager", "general_manager", "hr_manager", "finance_manager", "owner"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    type Suggestion = { id: string; type: string; severity: string; title: string; description: string; action: string; actionLink?: string };
    const suggestions: Suggestion[] = [];

    const [overloadedEmployees, expiringContracts, overdueClients, slowDepartments, costlyVehicles, prodDrops, revTrendRows, churnClients] = await Promise.all([
      rawQuery<Record<string, unknown>>(
        // Was 2× correlated COUNT subquery per active assignment — same
        // expression in SELECT and WHERE. Single CTE aggregates once
        // and the outer query filters with HAVING-like semantics.
        `WITH active_task_counts AS (
           SELECT t."assignedTo" AS "assignmentId", COUNT(*)::int AS c
             FROM tasks t
            WHERE t."companyId" = $1
              AND t.status NOT IN ('completed','cancelled')
              AND t."deletedAt" IS NULL
            GROUP BY t."assignedTo"
         )
         SELECT e.name, atc.c AS "activeTasks"
           FROM employee_assignments ea
           JOIN employees e ON e.id = ea."employeeId" AND e."deletedAt" IS NULL
           JOIN active_task_counts atc ON atc."assignmentId" = ea.id
          WHERE ea."companyId" = $1 AND ea.status = 'active'
            AND atc.c > 6
          LIMIT 5`,
        [cid]
      ).catch((e) => { logger.error(e, "intelligence query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `SELECT id, title, "endDate",
                (lc."endDate"::date - CURRENT_DATE) AS "daysLeft"
         FROM legal_contracts lc
         WHERE lc."companyId" = $1 AND lc.status = 'active' AND lc."deletedAt" IS NULL
           AND lc."endDate"::date - CURRENT_DATE BETWEEN 0 AND 30
         ORDER BY "daysLeft" ASC LIMIT 5`,
        [cid]
      ).catch((e) => { logger.error(e, "intelligence query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `SELECT c.name,
                COALESCE(SUM(i.total - i."paidAmount"), 0) AS "overdueAmount",
                MAX(CURRENT_DATE - i."dueDate"::date) AS "maxDaysLate"
         FROM invoices i
         JOIN clients c ON c.id = i."clientId"
         WHERE i."companyId" = $1 AND i."deletedAt" IS NULL AND i.status IN ('overdue','sent') AND i."dueDate" < CURRENT_DATE
         GROUP BY c.name
         HAVING MAX(CURRENT_DATE - i."dueDate"::date) > 30
         ORDER BY "maxDaysLate" DESC LIMIT 5`,
        [cid]
      ).catch((e) => { logger.error(e, "intelligence query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `SELECT COALESCE(d.name, 'بدون قسم') AS department,
                ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(lr."approvedAt", NOW()) - lr."createdAt")) / 86400), 1) AS "avgDays"
         FROM hr_leave_requests lr
         LEFT JOIN employees e ON e.id = lr."employeeId"
         LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1
         LEFT JOIN departments d ON d.id = ea."departmentId"
         WHERE lr."companyId" = $1 AND lr.status = 'pending' AND lr."deletedAt" IS NULL
         GROUP BY d.name
         HAVING AVG(EXTRACT(EPOCH FROM (NOW() - lr."createdAt")) / 86400) > 2
         ORDER BY "avgDays" DESC LIMIT 3`,
        [cid]
      ).catch((e) => { logger.error(e, "intelligence query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `SELECT fv.id, fv."plateNumber",
                COALESCE(SUM(fm.cost), 0)::float AS "maintenanceCost"
         FROM fleet_maintenance fm
         JOIN fleet_vehicles fv ON fv.id = fm."vehicleId"
         WHERE fm."companyId" = $1
           AND fm."createdAt" >= NOW() - INTERVAL '12 months'
           AND fm."deletedAt" IS NULL
           AND fv."deletedAt" IS NULL
         GROUP BY fv.id, fv."plateNumber"
         ORDER BY "maintenanceCost" DESC LIMIT 3`,
        [cid]
      ).catch((e) => { logger.error(e, "intelligence query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `WITH recent AS (
           SELECT t."assignedTo", COUNT(*) FILTER (WHERE t.status='completed')::float / NULLIF(COUNT(*),0) AS rate
           FROM tasks t WHERE t."companyId"=$1 AND t."deletedAt" IS NULL AND t."scheduledDate"::date >= CURRENT_DATE - INTERVAL '7 days'
           GROUP BY t."assignedTo"
         ),
         historical AS (
           SELECT t."assignedTo", COUNT(*) FILTER (WHERE t.status='completed')::float / NULLIF(COUNT(*),0) AS rate
           FROM tasks t WHERE t."companyId"=$1 AND t."deletedAt" IS NULL AND t."scheduledDate"::date BETWEEN CURRENT_DATE - INTERVAL '37 days' AND CURRENT_DATE - INTERVAL '8 days'
           GROUP BY t."assignedTo"
         )
         SELECT r."assignedTo", e.name,
                ROUND(r.rate * 100)::int AS "recentRate",
                ROUND(h.rate * 100)::int AS "historicalRate"
         FROM recent r JOIN historical h ON h."assignedTo"=r."assignedTo"
         JOIN employee_assignments ea2 ON ea2.id=r."assignedTo"
         JOIN employees e ON e.id=ea2."employeeId"
         WHERE h.rate > 0.3 AND r.rate < h.rate * 0.7
         LIMIT 3`,
        [cid]
      ).catch((e) => { logger.error(e, "intelligence query failed"); return []; }),
      rawQuery<Record<string, unknown>>(
        `SELECT
           COALESCE(SUM(CASE WHEN "createdAt" >= CURRENT_DATE - INTERVAL '30 days' THEN "paidAmount" ELSE 0 END),0)::float AS curr,
           COALESCE(SUM(CASE WHEN "createdAt" BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '30 days' THEN "paidAmount" ELSE 0 END),0)::float AS prev
         FROM invoices WHERE "companyId"=$1 AND "deletedAt" IS NULL AND status NOT IN ('cancelled','draft')`,
        [cid]
      ).catch((e) => { logger.error(e, "intelligence query failed"); return [] as any[]; }),
      rawQuery<Record<string, unknown>>(
        `SELECT c.name, rs."recencyDays", rs."churnScore"
         FROM client_rfm_scores rs
         JOIN clients c ON c.id=rs."clientId"
         WHERE rs."companyId"=$1 AND rs."churnRisk"='high'
         ORDER BY rs."churnScore" DESC LIMIT 3`,
        [cid]
      ).catch((e) => { logger.error(e, "intelligence query failed"); return []; }),
    ]);

    for (const emp of overloadedEmployees) {
      suggestions.push({
        id: `overload-${emp.name}`, type: "employee_overload", severity: "warning",
        title: `${emp.name} لديه ضغط عالي (${emp.activeTasks} مهمة مفتوحة)`,
        description: `يُقترح إعادة توزيع المهام لتخفيف العبء عن هذا الموظف`,
        action: "توزيع المهام", actionLink: "/tasks",
      });
    }
    for (const c of expiringContracts) {
      suggestions.push({
        id: `contract-${c.id}`, type: "contract_expiring", severity: Number(c.daysLeft) <= 7 ? "critical" : "warning",
        title: `عقد "${c.title || c.id}" ينتهي خلال ${c.daysLeft} يوم`,
        description: `يُقترح بدء إجراءات التجديد قبل انتهاء العقد`,
        action: "مراجعة العقد", actionLink: "/legal/contracts",
      });
    }
    for (const cl of overdueClients) {
      suggestions.push({
        id: `overdue-${cl.name}`, type: "client_overdue", severity: Number(cl.maxDaysLate) > 60 ? "critical" : "warning",
        title: `عميل ${cl.name} متأخر في السداد ${cl.maxDaysLate} يوم`,
        description: `المبلغ المستحق: ${Number(cl.overdueAmount).toLocaleString()} — يُقترح تصعيد التحصيل`,
        action: "متابعة التحصيل", actionLink: "/finance/invoices",
      });
    }
    for (const dept of slowDepartments) {
      suggestions.push({
        id: `slow-dept-${dept.department}`, type: "slow_approvals", severity: "info",
        title: `قسم ${dept.department} أبطأ قسم في الاعتمادات (متوسط ${dept.avgDays} أيام)`,
        description: `يُقترح مراجعة سلسلة الموافقات وتسريع الإجراءات`,
        action: "مراجعة الموافقات", actionLink: "/hr/leaves",
      });
    }
    for (const v of costlyVehicles) {
      suggestions.push({
        id: `vehicle-${v.id}`, type: "vehicle_costly", severity: "warning",
        title: `مركبة ${v.plateNumber} تكلفة صيانتها مرتفعة`,
        description: `تكلفة الصيانة ${Number(v.maintenanceCost).toLocaleString()} — يُقترح استبدال المركبة`,
        action: "مراجعة المركبة", actionLink: "/fleet",
      });
    }
    for (const emp of prodDrops) {
      suggestions.push({
        id: `prod-drop-${emp.assignedTo}`, type: "productivity_drop_historical", severity: "warning",
        title: `انخفاض إنتاجية تاريخي: ${emp.name}`,
        description: `انخفضت إنتاجية ${emp.name} من ${emp.historicalRate}% (معدل 30 يوم) إلى ${emp.recentRate}% (آخر 7 أيام) — تحليل بياني متاح`,
        action: "عرض التحليل", actionLink: "/insights",
      });
    }
    const revTrend = revTrendRows[0] ?? null;
    if (revTrend && revTrend.prev > 0) {
      const revChange = Math.round(((revTrend.curr - revTrend.prev) / revTrend.prev) * 100);
      if (revChange < -15) {
        suggestions.push({
          id: "revenue-decline", type: "revenue_trend", severity: "critical",
          title: `تراجع الإيرادات ${Math.abs(revChange)}% مقارنة بالشهر الماضي`,
          description: `الإيرادات انخفضت من ${Number(revTrend.prev).toLocaleString()} إلى ${Number(revTrend.curr).toLocaleString()} ريال — يُنصح بمراجعة أسباب التراجع`,
          action: "تحليل الإيرادات", actionLink: "/bi",
        });
      } else if (revChange > 20) {
        suggestions.push({
          id: "revenue-growth", type: "revenue_trend", severity: "info",
          title: `نمو الإيرادات ${revChange}% مقارنة بالشهر الماضي`,
          description: `الإيرادات ارتفعت من ${Number(revTrend.prev).toLocaleString()} إلى ${Number(revTrend.curr).toLocaleString()} ريال — أداء ممتاز`,
          action: "عرض التقرير", actionLink: "/bi",
        });
      }
    }
    for (const cl of churnClients) {
      suggestions.push({
        id: `churn-hist-${cl.name}`, type: "churn_risk_historical", severity: "warning",
        title: `خطر فقدان عميل (تحليل RFM): ${cl.name}`,
        description: `بناءً على التحليل التاريخي: ${cl.name} لم يتعامل منذ ${cl.recencyDays} يوم — خطر الفقدان ${Math.round(Number(cl.churnScore))}%`,
        action: "التواصل مع العميل", actionLink: "/clients",
      });
    }

    res.json(maskFields(req, { data: suggestions, total: suggestions.length }));
  } catch (err) { handleRouteError(err, res, "Smart suggestions"); }
});

router.post("/ai/categorize", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const body = zodParse(aiCategorizeSchema.safeParse(req.body));
    const scope = req.scope!;
    const { message, context } = body;
    const result = await aiEngine.receptionCategorize(message, context, { companyId: scope.companyId, userId: scope.userId });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_categorize", entityId: 0, after: { message: message?.substring(0, 100) } }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.ai.categorized",
      entity: "ai_categorize",
      entityId: 0,
      details: JSON.stringify({ message: message?.substring(0, 100) }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json(maskFields(req, result));
  } catch (err) { handleRouteError(err, res, "AI categorize error:"); }
});

router.post("/ai/draft-reply", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const body = zodParse(aiDraftReplySchema.safeParse(req.body));
    const scope = req.scope!;
    const { ticketTitle, ticketDescription, history } = body;
    const draft = await aiEngine.responderDraft(ticketTitle, ticketDescription, history, { companyId: scope.companyId, userId: scope.userId });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_draft_reply", entityId: 0, after: { ticketTitle } }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.ai.draft_replied",
      entity: "ai_draft_reply",
      entityId: 0,
      details: JSON.stringify({ ticketTitle }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({ draft });
  } catch (err) { handleRouteError(err, res, "AI draft reply error:"); }
});

router.post("/ai/translate", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const body = zodParse(aiTranslateSchema.safeParse(req.body));
    const scope = req.scope!;
    const { text, targetLanguage } = body;
    const translated = await aiEngine.translatorTranslate(text, targetLanguage, { companyId: scope.companyId, userId: scope.userId });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_translate", entityId: 0, after: { targetLanguage } }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.ai.translated",
      entity: "ai_translate",
      entityId: 0,
      details: JSON.stringify({ targetLanguage }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({ translated, targetLanguage });
  } catch (err) { handleRouteError(err, res, "AI translate error:"); }
});

router.post("/ai/summarize", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const body = zodParse(aiSummarizeSchema.safeParse(req.body));
    const scope = req.scope!;
    const { content, maxLength } = body;
    const summary = await aiEngine.summarizerSummarize(content, maxLength, { companyId: scope.companyId, userId: scope.userId });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_summarize", entityId: 0 }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.ai.summarized",
      entity: "ai_summarize",
      entityId: 0,
      details: JSON.stringify({ maxLength }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({ summary });
  } catch (err) { handleRouteError(err, res, "AI summarize error:"); }
});

router.post("/ai/evaluate-rules", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const body = zodParse(aiEvaluateRulesSchema.safeParse(req.body));
    const scope = req.scope!;
    const { context, data, rules } = body;
    const result = await aiEngine.rulesEngineEvaluate({ context, data, rules }, { companyId: scope.companyId, userId: scope.userId });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_evaluate_rules", entityId: 0, after: { context } }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.ai.rules_evaluated",
      entity: "ai_evaluate_rules",
      entityId: 0,
      details: JSON.stringify({ context }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json(maskFields(req, result));
  } catch (err) { handleRouteError(err, res, "AI rules engine error:"); }
});

router.post("/ai/forecast", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const body = zodParse(aiForecastSchema.safeParse(req.body));
    const scope = req.scope!;
    const { metricName, historicalData, forecastPeriods } = body;
    const result = await aiEngine.predictorForecast({ metricName, historicalData, forecastPeriods }, { companyId: scope.companyId, userId: scope.userId });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_forecast", entityId: 0, after: { metricName } }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.ai.forecasted",
      entity: "ai_forecast",
      entityId: 0,
      details: JSON.stringify({ metricName }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json(maskFields(req, result));
  } catch (err) { handleRouteError(err, res, "AI forecast error:"); }
});

router.post("/algorithms/haversine", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const body = zodParse(haversineSchema.safeParse(req.body));
    const scope = req.scope!;
    const { lat1, lon1, lat2, lon2 } = body;
    const distance = haversineDistance(lat1, lon1, lat2, lon2);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "preview", entity: "algorithms", entityId: 0,
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.algorithm.haversine",
      entity: "algorithms",
      entityId: 0,
      details: JSON.stringify({ lat1, lon1, lat2, lon2, distance }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({ distance, unit: "km" });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.post("/algorithms/moving-average", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const body = zodParse(movingAverageSchema.safeParse(req.body));
    const scope = req.scope!;
    const { values, periods } = body;
    const result = movingAverage(values, periods);
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "preview", entity: "algorithms", entityId: 0,
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.algorithm.moving_average",
      entity: "algorithms",
      entityId: 0,
      details: JSON.stringify({ periods, dataPoints: values.length }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({ result, periods, dataPoints: values.length });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.post("/algorithms/load-balance", authorize({ feature: "admin", action: "update" }), async (req, res): Promise<void> => {
  try {
    const body = zodParse(loadBalanceSchema.safeParse(req.body));
    const scope = req.scope!;
    const { resources, targetLat, targetLon, maxWorkload } = body;
    const selected = selectLeastLoadedResource(resources, { targetLat, targetLon, maxWorkload });
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "preview", entity: "algorithms", entityId: 0,
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.algorithm.load_balanced",
      entity: "algorithms",
      entityId: 0,
      details: JSON.stringify({ resourceCount: resources.length }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json({ selected });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});


router.get("/activity/stats", requireRole("branch_manager", "general_manager", "owner", "admin"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const days = Number(req.query.days) || 30;
    const stats = await getUsageStats(scope.companyId, days);
    res.json(maskFields(req, stats));
  } catch (err) { handleRouteError(err, res, "Activity stats error:"); }
});

// ── Client Analytics ─────────────────────────────────────────────────────────

router.get("/clients/analytics", requireRole("branch_manager", "general_manager", "owner", "finance_manager"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const summary = await getClientAnalyticsSummary(scope.companyId);
    res.json(maskFields(req, summary));
  } catch (err) { handleRouteError(err, res, "Client analytics error:"); }
});

router.get("/clients/analytics/recalculate", requireRole("branch_manager", "general_manager", "owner"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const count = await calculateAllClientsRFM(scope.companyId);
    res.json(maskFields(req, { message: `تم تحديث تحليل ${count} عميل`, count }));
  } catch (err) { handleRouteError(err, res, "RFM recalculate error:"); }
});

router.get("/clients/:clientId/rfm", requireRole("branch_manager", "general_manager", "owner", "finance_manager"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const clientId = parseId(req.params.clientId, "clientId");
    const rfm = await calculateClientRFM(scope.companyId, clientId);
    if (!rfm) throw new NotFoundError("العميل غير موجود");
    const contactTime = await getBestContactTime(scope.companyId, clientId);
    res.json(maskFields(req, { ...rfm, bestContactTime: contactTime }));
  } catch (err) { handleRouteError(err, res, "Client RFM error:"); }
});

router.get("/seasonal-patterns", requireRole("branch_manager", "general_manager", "owner", "finance_manager"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const patterns = await detectSeasonalPatterns(scope.companyId);
    res.json(maskFields(req, { data: patterns }));
  } catch (err) { handleRouteError(err, res, "Seasonal patterns error:"); }
});

// ── Smart Recommendations ─────────────────────────────────────────────────────

router.get("/recommendations", authorize({ feature: "admin", action: "list" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const recs = await getPersonalizedRecommendations(
      scope.companyId, scope.userId, scope.activeAssignmentId, scope.role
    );
    res.json(maskFields(req, { data: recs, total: recs.length }));
  } catch (err) { handleRouteError(err, res, "Recommendations error:"); }
});

// ── Company KPIs ──────────────────────────────────────────────────────────────

router.get("/company-kpis", requireRole("branch_manager", "general_manager", "owner", "finance_manager"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const kpis = await getCompanyKPIs(scope.companyId);
    res.json(maskFields(req, kpis));
  } catch (err) { handleRouteError(err, res, "Company KPIs error:"); }
});

// ── Smart Task Assignment ──────────────────────────────────────────────────────

router.post("/smart-assign", requireRole("branch_manager", "general_manager", "owner", "hr_manager"), async (req, res): Promise<void> => {
  try {
    const body = zodParse(smartAssignSchema.safeParse(req.body));
    const scope = req.scope!;
    const { taskType, targetLat, targetLon, requiredSpecialty, taskTitle } = body;

    const result = await loadBalanceAssign(
      scope.companyId,
      taskType ?? "general",
      targetLat ? Number(targetLat) : undefined,
      targetLon ? Number(targetLon) : undefined,
      requiredSpecialty
    );

    if (!result) {
      throw new NotFoundError("لا يوجد موظف متاح لهذه المهمة");
    }

    const [emp] = await rawQuery<Record<string, unknown>>(
      `SELECT e.id, e.name, e.email,
              (SELECT COUNT(*) FROM tasks t JOIN employee_assignments ea3 ON ea3.id = t."assignedTo"
               WHERE ea3."employeeId"=e.id AND t."companyId"=$1 AND t.status NOT IN ('completed','cancelled') AND t."deletedAt" IS NULL)::int AS "currentTasks"
       FROM employees e WHERE e.id=$2 AND e."deletedAt" IS NULL`,
      [scope.companyId, result.employeeId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "smart_assign", entityId: result.assignmentId, after: { employeeId: result.employeeId, taskType: taskType ?? "general" } }).catch((e) => logger.error(e, "intelligence background task failed"));
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "intelligence.smart_assign.created",
      entity: "smart_assign",
      entityId: result.assignmentId,
      details: JSON.stringify({ employeeId: result.employeeId, taskType: taskType ?? "general", taskTitle }),
    }).catch((e) => logger.error(e, "intelligence background task failed"));
    res.json(maskFields(req, {
      recommended: {
        employeeId: result.employeeId,
        assignmentId: result.assignmentId,
        name: emp?.name ?? "غير محدد",
        currentTasks: emp?.currentTasks ?? 0,
        score: result.score,
      },
      reasoning: `الموظف ${emp?.name} هو الأنسب بناءً على: عبء العمل الحالي (${emp?.currentTasks ?? 0} مهمة)${requiredSpecialty ? `، التخصص المطلوب (${requiredSpecialty})` : ""}`,
    }));
  } catch (err) { handleRouteError(err, res, "Smart assign error:"); }
});

// ── Insights Dashboard ────────────────────────────────────────────────────────

router.get("/insights-summary", requireRole("branch_manager", "general_manager", "owner"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [usageStats, clientSummary, companyKpis, recs, seasonalPatterns] = await Promise.all([
      getUsageStats(cid, 30),
      getClientAnalyticsSummary(cid),
      getCompanyKPIs(cid),
      getPersonalizedRecommendations(cid, scope.userId, scope.activeAssignmentId, scope.role),
      detectSeasonalPatterns(cid),
    ]);

    const [totalEmployees] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) AS count FROM employee_assignments WHERE "companyId"=$1 AND status='active'`, [cid]);
    const [totalClients] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) AS count FROM clients WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [monthRevenue] = await rawQuery<Record<string, unknown>>(`SELECT COALESCE(SUM("paidAmount"),0) AS total FROM invoices WHERE "companyId"=$1 AND "deletedAt" IS NULL AND "createdAt" >= date_trunc('month',CURRENT_DATE)`, [cid]);
    const [prevMonthRevenue] = await rawQuery<Record<string, unknown>>(`SELECT COALESCE(SUM("paidAmount"),0) AS total FROM invoices WHERE "companyId"=$1 AND "deletedAt" IS NULL AND "createdAt" >= date_trunc('month',CURRENT_DATE - INTERVAL '1 month') AND "createdAt" < date_trunc('month',CURRENT_DATE)`, [cid]);

    const monthRev = Number(monthRevenue?.total ?? 0);
    const prevRev = Number(prevMonthRevenue?.total ?? 0);
    const revenueChange = prevRev > 0 ? Math.round(((monthRev - prevRev) / prevRev) * 100) : 0;

    res.json(maskFields(req, {
      overview: {
        totalEmployees: Number(totalEmployees?.count ?? 0),
        totalClients: Number(totalClients?.count ?? 0),
        monthRevenue: monthRev,
        prevMonthRevenue: prevRev,
        revenueChange,
      },
      usageStats: {
        topPages: usageStats.topPages.slice(0, 8),
        peakHours: usageStats.peakHours,
        topUsers: usageStats.topUsers.slice(0, 5),
        moduleUsage: usageStats.moduleUsage.slice(0, 8),
        dailyActivity: usageStats.dailyActivity,
      },
      clientAnalytics: clientSummary,
      companyKpis,
      recommendations: recs.slice(0, 10),
      seasonalPatterns,
    }));
  } catch (err) { handleRouteError(err, res, "Insights summary error:"); }
});

export default router;
