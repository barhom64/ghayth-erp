import { handleRouteError, ValidationError } from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { requireRole } from "../middlewares/roleGuard.js";
import { aiEngine } from "../lib/aiEngine.js";
import { createAuditLog } from "../lib/businessHelpers.js";
import { calculateEmployeeKPIs, getCompanyKPIs } from "../lib/kpiEngine.js";
import { buildAllSchedules, buildEmployeeSchedule } from "../lib/scheduleBuilder.js";
import { runSmartAlerts } from "../lib/smartAlerts.js";
import { haversineDistance, movingAverage, selectLeastLoadedResource, loadBalanceAssign } from "../lib/algorithms.js";
import { getUsageStats } from "../lib/activityTracker.js";
import { calculateClientRFM, calculateAllClientsRFM, getClientAnalyticsSummary, getBestContactTime, detectSeasonalPatterns } from "../lib/clientAnalytics.js";
import { getPersonalizedRecommendations } from "../lib/smartRecommendations.js";

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
  maxLength: z.number().optional(),
});

const aiEvaluateRulesSchema = z.object({
  context: z.any(),
  data: z.any(),
  rules: z.any().optional(),
});

const aiForecastSchema = z.object({
  metricName: z.string().min(1),
  historicalData: z.any(),
  forecastPeriods: z.number().optional(),
});

const haversineSchema = z.object({
  lat1: z.number(),
  lon1: z.number(),
  lat2: z.number(),
  lon2: z.number(),
});

const movingAverageSchema = z.object({
  values: z.array(z.number()),
  periods: z.number(),
});

const loadBalanceSchema = z.object({
  resources: z.array(z.any()),
  targetLat: z.number().optional(),
  targetLon: z.number().optional(),
  maxWorkload: z.number().optional(),
});

const smartAssignSchema = z.object({
  taskType: z.string().optional(),
  targetLat: z.number().optional(),
  targetLon: z.number().optional(),
  requiredSpecialty: z.string().optional(),
  taskTitle: z.string().optional(),
});

const router = Router();
router.use(authMiddleware);

router.get("/alerts", requirePermission("admin:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { severity, isRead } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (severity) { params.push(severity); conditions.push(`severity = $${params.length}`); }
    if (isRead !== undefined) { params.push(isRead === 'true'); conditions.push(`"isRead" = $${params.length}`); }
    const rows = await rawQuery<any>(`SELECT * FROM smart_alerts WHERE ${conditions.join(" AND ")} ORDER BY "createdAt" DESC LIMIT 100`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Alerts error:"); }
});

router.post("/alerts/scan", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const result = await runSmartAlerts(scope.companyId);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "smart_alerts", entityId: 0, after: { fired: result.fired } }).catch(console.error);
    res.json({ message: `تم فحص التنبيهات الذكية`, fired: result.fired, details: result.details });
  } catch (err) { handleRouteError(err, res, "Alert scan error:"); }
});

router.patch("/alerts/:id/read", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { id } = req.params;
    await rawQuery(
      `UPDATE smart_alerts SET "isRead"=true WHERE id=$1 AND "companyId"=$2`,
      [Number(id), scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "smart_alerts", entityId: Number(id), after: { isRead: true } }).catch(console.error);
    res.json({ message: "تم تعليم التنبيه كمقروء" });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.get("/kpis", requirePermission("admin:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { employeeId, metricName } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [scope.companyId];
    if (employeeId) { params.push(Number(employeeId)); conditions.push(`"employeeId" = $${params.length}`); }
    if (metricName) { params.push(metricName); conditions.push(`"metricName" = $${params.length}`); }
    const rows = await rawQuery<any>(`SELECT * FROM kpi_snapshots WHERE ${conditions.join(" AND ")} ORDER BY "snapshotDate" DESC LIMIT 200`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "KPIs error:"); }
});

router.get("/kpis/employee/:employeeId", requirePermission("admin:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { employeeId } = req.params;
    const date = (req.query.date as string) ?? new Date().toISOString().split("T")[0];
    const metrics = await calculateEmployeeKPIs(scope.companyId, Number(employeeId), date);
    res.json({ employeeId: Number(employeeId), date, metrics });
  } catch (err) { handleRouteError(err, res, "Employee KPI error:"); }
});

router.get("/daily-schedule", requirePermission("admin:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const date = (req.query.date as string) ?? new Date().toISOString().split("T")[0];
    const schedules = await buildAllSchedules(cid, date);
    res.json({ date, schedules });
  } catch (err) { handleRouteError(err, res, "Daily schedule error:"); }
});

router.get("/daily-schedule/employee/:employeeId", requirePermission("admin:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { employeeId } = req.params;
    const date = (req.query.date as string) ?? new Date().toISOString().split("T")[0];
    const schedule = await buildEmployeeSchedule(scope.companyId, Number(employeeId), date);
    res.json(schedule);
  } catch (err) { handleRouteError(err, res, "Employee schedule error:"); }
});

router.get("/overview", requirePermission("admin:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [employees] = await rawQuery<any>(`SELECT COUNT(*) as total FROM employee_assignments WHERE "companyId"=$1 AND status='active'`, [cid]);
    const [vehicles] = await rawQuery<any>(`SELECT COUNT(*) as total FROM fleet_vehicles WHERE "companyId"=$1`, [cid]);
    const [properties] = await rawQuery<any>(`SELECT COUNT(*) as total FROM property_units WHERE "companyId"=$1`, [cid]);
    const [projects] = await rawQuery<any>(`SELECT COUNT(*) as active FROM projects WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL`, [cid]);
    const [tickets] = await rawQuery<any>(`SELECT COUNT(*) as open FROM support_tickets WHERE "companyId"=$1 AND status='open'`, [cid]);
    const [revenue] = await rawQuery<any>(`SELECT COALESCE(SUM("paidAmount"),0) as total FROM invoices WHERE "companyId"=$1 AND "deletedAt" IS NULL AND "createdAt" >= date_trunc('month', CURRENT_DATE)`, [cid]);
    const [alerts] = await rawQuery<any>(`SELECT COUNT(*) as unread FROM smart_alerts WHERE "companyId"=$1 AND "isRead"=false`, [cid]);

    res.json({
      totalEmployees: Number(employees.total),
      totalVehicles: Number(vehicles.total),
      totalProperties: Number(properties.total),
      activeProjects: Number(projects.active),
      openTickets: Number(tickets.open),
      monthlyRevenue: Number(revenue.total),
      unreadAlerts: Number(alerts.unread),
    });
  } catch (err) { handleRouteError(err, res, "Intelligence overview error:"); }
});

router.get("/suggestions", requireRole("branch_manager", "general_manager", "hr_manager", "finance_manager", "owner"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const suggestions: Array<{ id: string; type: string; severity: string; title: string; description: string; action: string; actionLink?: string }> = [];

    const overloadedEmployees = await rawQuery<any>(
      `SELECT e.name,
              (SELECT COUNT(*) FROM tasks t WHERE t."assignedTo" = ea.id AND t."companyId" = $1
               AND t.status NOT IN ('completed','cancelled'))::int AS "activeTasks"
       FROM employee_assignments ea
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ea."companyId" = $1 AND ea.status = 'active'
         AND (SELECT COUNT(*) FROM tasks t WHERE t."assignedTo" = ea.id AND t."companyId" = $1
              AND t.status NOT IN ('completed','cancelled'))::int > 6
       LIMIT 5`,
      [cid]
    ).catch(() => []);

    for (const emp of overloadedEmployees) {
      suggestions.push({
        id: `overload-${emp.name}`, type: "employee_overload", severity: "warning",
        title: `${emp.name} لديه ضغط عالي (${emp.activeTasks} مهمة مفتوحة)`,
        description: `يُقترح إعادة توزيع المهام لتخفيف العبء عن هذا الموظف`,
        action: "توزيع المهام", actionLink: "/tasks",
      });
    }

    const expiringContracts = await rawQuery<any>(
      `SELECT id, title, "endDate",
              (lc."endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM legal_contracts lc
       WHERE lc."companyId" = $1 AND lc.status = 'active'
         AND lc."endDate"::date - CURRENT_DATE BETWEEN 0 AND 30
       ORDER BY "daysLeft" ASC LIMIT 5`,
      [cid]
    ).catch(() => []);

    for (const c of expiringContracts) {
      suggestions.push({
        id: `contract-${c.id}`, type: "contract_expiring", severity: c.daysLeft <= 7 ? "critical" : "warning",
        title: `عقد "${c.title || c.id}" ينتهي خلال ${c.daysLeft} يوم`,
        description: `يُقترح بدء إجراءات التجديد قبل انتهاء العقد`,
        action: "مراجعة العقد", actionLink: "/legal/contracts",
      });
    }

    const overdueClients = await rawQuery<any>(
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
    ).catch(() => []);

    for (const cl of overdueClients) {
      suggestions.push({
        id: `overdue-${cl.name}`, type: "client_overdue", severity: cl.maxDaysLate > 60 ? "critical" : "warning",
        title: `عميل ${cl.name} متأخر في السداد ${cl.maxDaysLate} يوم`,
        description: `المبلغ المستحق: ${Number(cl.overdueAmount).toLocaleString()} — يُقترح تصعيد التحصيل`,
        action: "متابعة التحصيل", actionLink: "/finance/invoices",
      });
    }

    const slowDepartments = await rawQuery<any>(
      `SELECT COALESCE(d.name, 'بدون قسم') AS department,
              ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(lr."approvedAt", NOW()) - lr."createdAt")) / 86400), 1) AS "avgDays"
       FROM hr_leave_requests lr
       LEFT JOIN employees e ON e.id = lr."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1
       LEFT JOIN departments d ON d.id = ea."departmentId"
       WHERE lr."companyId" = $1 AND lr.status = 'pending'
       GROUP BY d.name
       HAVING AVG(EXTRACT(EPOCH FROM (NOW() - lr."createdAt")) / 86400) > 2
       ORDER BY "avgDays" DESC LIMIT 3`,
      [cid]
    ).catch(() => []);

    for (const dept of slowDepartments) {
      suggestions.push({
        id: `slow-dept-${dept.department}`, type: "slow_approvals", severity: "info",
        title: `قسم ${dept.department} أبطأ قسم في الاعتمادات (متوسط ${dept.avgDays} أيام)`,
        description: `يُقترح مراجعة سلسلة الموافقات وتسريع الإجراءات`,
        action: "مراجعة الموافقات", actionLink: "/hr/leaves",
      });
    }

    const costlyVehicles = await rawQuery<any>(
      `SELECT fv.id, fv."plateNumber",
              COALESCE(SUM(fm.cost), 0)::float AS "maintenanceCost",
              COALESCE(fv.value, 0)::float AS "vehicleValue"
       FROM fleet_maintenance fm
       JOIN fleet_vehicles fv ON fv.id = fm."vehicleId"
       WHERE fm."companyId" = $1
         AND fm."createdAt" >= NOW() - INTERVAL '12 months'
       GROUP BY fv.id, fv."plateNumber", fv.value
       HAVING COALESCE(fv.value, 0) > 0 AND COALESCE(SUM(fm.cost), 0) > COALESCE(fv.value, 0) * 0.5
       ORDER BY "maintenanceCost" DESC LIMIT 3`,
      [cid]
    ).catch(() => []);

    for (const v of costlyVehicles) {
      suggestions.push({
        id: `vehicle-${v.id}`, type: "vehicle_costly", severity: "warning",
        title: `مركبة ${v.plateNumber} تكلفة صيانتها مرتفعة`,
        description: `تكلفة الصيانة ${Number(v.maintenanceCost).toLocaleString()} مقابل قيمة ${Number(v.vehicleValue).toLocaleString()} — يُقترح استبدال المركبة`,
        action: "مراجعة المركبة", actionLink: "/fleet",
      });
    }

    // Historical: productivity drop analysis
    const prodDrops = await rawQuery<any>(
      `WITH recent AS (
         SELECT t."assignedTo", COUNT(*) FILTER (WHERE t.status='completed')::float / NULLIF(COUNT(*),0) AS rate
         FROM tasks t WHERE t."companyId"=$1 AND t."scheduledDate"::date >= CURRENT_DATE - INTERVAL '7 days'
         GROUP BY t."assignedTo"
       ),
       historical AS (
         SELECT t."assignedTo", COUNT(*) FILTER (WHERE t.status='completed')::float / NULLIF(COUNT(*),0) AS rate
         FROM tasks t WHERE t."companyId"=$1 AND t."scheduledDate"::date BETWEEN CURRENT_DATE - INTERVAL '37 days' AND CURRENT_DATE - INTERVAL '8 days'
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
    ).catch(() => []);
    for (const emp of prodDrops) {
      suggestions.push({
        id: `prod-drop-${emp.assignedTo}`, type: "productivity_drop_historical", severity: "warning",
        title: `انخفاض إنتاجية تاريخي: ${emp.name}`,
        description: `انخفضت إنتاجية ${emp.name} من ${emp.historicalRate}% (معدل 30 يوم) إلى ${emp.recentRate}% (آخر 7 أيام) — تحليل بياني متاح`,
        action: "عرض التحليل", actionLink: "/insights",
      });
    }

    // Historical: revenue trend analysis
    const revTrendRows = await rawQuery<any>(
      `SELECT
         COALESCE(SUM(CASE WHEN "createdAt" >= CURRENT_DATE - INTERVAL '30 days' THEN "paidAmount" ELSE 0 END),0)::float AS curr,
         COALESCE(SUM(CASE WHEN "createdAt" BETWEEN CURRENT_DATE - INTERVAL '60 days' AND CURRENT_DATE - INTERVAL '30 days' THEN "paidAmount" ELSE 0 END),0)::float AS prev
       FROM invoices WHERE "companyId"=$1 AND "deletedAt" IS NULL AND status NOT IN ('cancelled','draft')`,
      [cid]
    ).catch(() => [] as any[]);
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

    // Historical: high churn risk clients from RFM
    const churnClients = await rawQuery<any>(
      `SELECT c.name, rs."recencyDays", rs."churnScore"
       FROM client_rfm_scores rs
       JOIN clients c ON c.id=rs."clientId"
       WHERE rs."companyId"=$1 AND rs."churnRisk"='high'
       ORDER BY rs."churnScore" DESC LIMIT 3`,
      [cid]
    ).catch(() => []);
    for (const cl of churnClients) {
      suggestions.push({
        id: `churn-hist-${cl.name}`, type: "churn_risk_historical", severity: "warning",
        title: `خطر فقدان عميل (تحليل RFM): ${cl.name}`,
        description: `بناءً على التحليل التاريخي: ${cl.name} لم يتعامل منذ ${cl.recencyDays} يوم — خطر الفقدان ${Math.round(cl.churnScore)}%`,
        action: "التواصل مع العميل", actionLink: "/clients",
      });
    }

    res.json({ data: suggestions, total: suggestions.length });
  } catch (err) { handleRouteError(err, res, "Smart suggestions"); }
});

router.post("/ai/categorize", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const parsed_aiCategorizeSchema = aiCategorizeSchema.safeParse(req.body);
    if (!parsed_aiCategorizeSchema.success) throw new ValidationError(parsed_aiCategorizeSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_aiCategorizeSchema.data;
    const scope = req.scope!;
    const { message, context } = body;
    const result = await aiEngine.receptionCategorize(message, context);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_categorize", entityId: 0, after: { message: message?.substring(0, 100) } }).catch(console.error);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "AI categorize error:"); }
});

router.post("/ai/draft-reply", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const parsed_aiDraftReplySchema = aiDraftReplySchema.safeParse(req.body);
    if (!parsed_aiDraftReplySchema.success) throw new ValidationError(parsed_aiDraftReplySchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_aiDraftReplySchema.data;
    const scope = req.scope!;
    const { ticketTitle, ticketDescription, history } = body;
    const draft = await aiEngine.responderDraft(ticketTitle, ticketDescription, history);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_draft_reply", entityId: 0, after: { ticketTitle } }).catch(console.error);
    res.json({ draft });
  } catch (err) { handleRouteError(err, res, "AI draft reply error:"); }
});

router.post("/ai/translate", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const parsed_aiTranslateSchema = aiTranslateSchema.safeParse(req.body);
    if (!parsed_aiTranslateSchema.success) throw new ValidationError(parsed_aiTranslateSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_aiTranslateSchema.data;
    const scope = req.scope!;
    const { text, targetLanguage } = body;
    const translated = await aiEngine.translatorTranslate(text, targetLanguage);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_translate", entityId: 0, after: { targetLanguage } }).catch(console.error);
    res.json({ translated, targetLanguage });
  } catch (err) { handleRouteError(err, res, "AI translate error:"); }
});

router.post("/ai/summarize", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const parsed_aiSummarizeSchema = aiSummarizeSchema.safeParse(req.body);
    if (!parsed_aiSummarizeSchema.success) throw new ValidationError(parsed_aiSummarizeSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_aiSummarizeSchema.data;
    const scope = req.scope!;
    const { content, maxLength } = body;
    const summary = await aiEngine.summarizerSummarize(content, maxLength);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_summarize", entityId: 0 }).catch(console.error);
    res.json({ summary });
  } catch (err) { handleRouteError(err, res, "AI summarize error:"); }
});

router.post("/ai/evaluate-rules", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const parsed_aiEvaluateRulesSchema = aiEvaluateRulesSchema.safeParse(req.body);
    if (!parsed_aiEvaluateRulesSchema.success) throw new ValidationError(parsed_aiEvaluateRulesSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_aiEvaluateRulesSchema.data;
    const scope = req.scope!;
    const { context, data, rules } = body;
    const result = await aiEngine.rulesEngineEvaluate({ context, data, rules });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_evaluate_rules", entityId: 0, after: { context } }).catch(console.error);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "AI rules engine error:"); }
});

router.post("/ai/forecast", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const parsed_aiForecastSchema = aiForecastSchema.safeParse(req.body);
    if (!parsed_aiForecastSchema.success) throw new ValidationError(parsed_aiForecastSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_aiForecastSchema.data;
    const scope = req.scope!;
    const { metricName, historicalData, forecastPeriods } = body;
    const result = await aiEngine.predictorForecast({ metricName, historicalData, forecastPeriods });
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "ai_forecast", entityId: 0, after: { metricName } }).catch(console.error);
    res.json(result);
  } catch (err) { handleRouteError(err, res, "AI forecast error:"); }
});

router.post("/algorithms/haversine", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const parsed_haversineSchema = haversineSchema.safeParse(req.body);
    if (!parsed_haversineSchema.success) throw new ValidationError(parsed_haversineSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_haversineSchema.data;
    const { lat1, lon1, lat2, lon2 } = body;
    const distance = haversineDistance(lat1, lon1, lat2, lon2);
    res.json({ distance, unit: "km" });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.post("/algorithms/moving-average", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const parsed_movingAverageSchema = movingAverageSchema.safeParse(req.body);
    if (!parsed_movingAverageSchema.success) throw new ValidationError(parsed_movingAverageSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_movingAverageSchema.data;
    const { values, periods } = body;
    const result = movingAverage(values, periods);
    res.json({ result, periods, dataPoints: values.length });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});

router.post("/algorithms/load-balance", requirePermission("admin:write"), async (req, res): Promise<void> => {
  try {
    const parsed_loadBalanceSchema = loadBalanceSchema.safeParse(req.body);
    if (!parsed_loadBalanceSchema.success) throw new ValidationError(parsed_loadBalanceSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_loadBalanceSchema.data;
    const { resources, targetLat, targetLon, maxWorkload } = body;
    const selected = selectLeastLoadedResource(resources, { targetLat, targetLon, maxWorkload });
    res.json({ selected });
  } catch (err) { handleRouteError(err, res, "خطأ غير متوقع"); }
});


router.get("/activity/stats", requireRole("branch_manager", "general_manager", "owner", "admin"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const days = Number(req.query.days) || 30;
    const stats = await getUsageStats(scope.companyId, days);
    res.json(stats);
  } catch (err) { handleRouteError(err, res, "Activity stats error:"); }
});

// ── Client Analytics ─────────────────────────────────────────────────────────

router.get("/clients/analytics", requireRole("branch_manager", "general_manager", "owner", "finance_manager"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const summary = await getClientAnalyticsSummary(scope.companyId);
    res.json(summary);
  } catch (err) { handleRouteError(err, res, "Client analytics error:"); }
});

router.get("/clients/analytics/recalculate", requireRole("branch_manager", "general_manager", "owner"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const count = await calculateAllClientsRFM(scope.companyId);
    res.json({ message: `تم تحديث تحليل ${count} عميل`, count });
  } catch (err) { handleRouteError(err, res, "RFM recalculate error:"); }
});

router.get("/clients/:clientId/rfm", requireRole("branch_manager", "general_manager", "owner", "finance_manager"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const { clientId } = req.params;
    const rfm = await calculateClientRFM(scope.companyId, Number(clientId));
    if (!rfm) { res.status(404).json({ error: "العميل غير موجود" }); return; }
    const contactTime = await getBestContactTime(scope.companyId, Number(clientId));
    res.json({ ...rfm, bestContactTime: contactTime });
  } catch (err) { handleRouteError(err, res, "Client RFM error:"); }
});

router.get("/seasonal-patterns", requireRole("branch_manager", "general_manager", "owner", "finance_manager"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const patterns = await detectSeasonalPatterns(scope.companyId);
    res.json({ data: patterns });
  } catch (err) { handleRouteError(err, res, "Seasonal patterns error:"); }
});

// ── Smart Recommendations ─────────────────────────────────────────────────────

router.get("/recommendations", requirePermission("admin:read"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const recs = await getPersonalizedRecommendations(
      scope.companyId, scope.userId, scope.activeAssignmentId, scope.role
    );
    res.json({ data: recs, total: recs.length });
  } catch (err) { handleRouteError(err, res, "Recommendations error:"); }
});

// ── Company KPIs ──────────────────────────────────────────────────────────────

router.get("/company-kpis", requireRole("branch_manager", "general_manager", "owner", "finance_manager"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const kpis = await getCompanyKPIs(scope.companyId);
    res.json(kpis);
  } catch (err) { handleRouteError(err, res, "Company KPIs error:"); }
});

// ── Smart Task Assignment ──────────────────────────────────────────────────────

router.post("/smart-assign", requireRole("branch_manager", "general_manager", "owner", "hr_manager"), async (req, res): Promise<void> => {
  try {
    const parsed_smartAssignSchema = smartAssignSchema.safeParse(req.body);
    if (!parsed_smartAssignSchema.success) throw new ValidationError(parsed_smartAssignSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_smartAssignSchema.data;
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
      res.status(404).json({ error: "لا يوجد موظف متاح لهذه المهمة" });
      return;
    }

    const [emp] = await rawQuery<any>(
      `SELECT e.id, e.name, e.email,
              (SELECT COUNT(*) FROM tasks t JOIN employee_assignments ea3 ON ea3.id = t."assignedTo"
               WHERE ea3."employeeId"=e.id AND t."companyId"=$1 AND t.status NOT IN ('completed','cancelled'))::int AS "currentTasks"
       FROM employees e WHERE e.id=$2`,
      [scope.companyId, result.employeeId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "smart_assign", entityId: result.assignmentId, after: { employeeId: result.employeeId, taskType: taskType ?? "general" } }).catch(console.error);
    res.json({
      recommended: {
        employeeId: result.employeeId,
        assignmentId: result.assignmentId,
        name: emp?.name ?? "غير محدد",
        currentTasks: emp?.currentTasks ?? 0,
        score: result.score,
      },
      reasoning: `الموظف ${emp?.name} هو الأنسب بناءً على: عبء العمل الحالي (${emp?.currentTasks ?? 0} مهمة)${requiredSpecialty ? `، التخصص المطلوب (${requiredSpecialty})` : ""}`,
    });
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

    const [totalEmployees] = await rawQuery<any>(`SELECT COUNT(*) AS count FROM employee_assignments WHERE "companyId"=$1 AND status='active'`, [cid]);
    const [totalClients] = await rawQuery<any>(`SELECT COUNT(*) AS count FROM clients WHERE "companyId"=$1`, [cid]);
    const [monthRevenue] = await rawQuery<any>(`SELECT COALESCE(SUM("paidAmount"),0) AS total FROM invoices WHERE "companyId"=$1 AND "deletedAt" IS NULL AND "createdAt" >= date_trunc('month',CURRENT_DATE)`, [cid]);
    const [prevMonthRevenue] = await rawQuery<any>(`SELECT COALESCE(SUM("paidAmount"),0) AS total FROM invoices WHERE "companyId"=$1 AND "deletedAt" IS NULL AND "createdAt" >= date_trunc('month',CURRENT_DATE - INTERVAL '1 month') AND "createdAt" < date_trunc('month',CURRENT_DATE)`, [cid]);

    const monthRev = Number(monthRevenue?.total ?? 0);
    const prevRev = Number(prevMonthRevenue?.total ?? 0);
    const revenueChange = prevRev > 0 ? Math.round(((monthRev - prevRev) / prevRev) * 100) : 0;

    res.json({
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
    });
  } catch (err) { handleRouteError(err, res, "Insights summary error:"); }
});

export default router;
