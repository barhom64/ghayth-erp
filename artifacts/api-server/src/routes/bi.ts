import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError, ValidationError } from "../lib/errorHandler.js";
import { createAuditLog, emitEvent, todayISO, currentYear, toDateISO } from "../lib/businessHelpers.js";

const router = Router();
router.use(authMiddleware);

const createDashboardSchema = z.object({
  title: z.string().min(1, "عنوان لوحة القيادة مطلوب"),
  description: z.string().optional().nullable(),
  layout: z.any().optional(),
  isDefault: z.boolean().optional(),
});

const createKpiSchema = z.object({
  name: z.string().min(1, "اسم المؤشر مطلوب"),
  description: z.string().optional().nullable(),
  module: z.string().min(1, "الوحدة مطلوبة"),
  formula: z.string().min(1, "الصيغة مطلوبة"),
  target: z.coerce.number().optional().nullable(),
  currentValue: z.coerce.number().optional().nullable(),
  unit: z.string().optional().nullable(),
  frequency: z.string().optional(),
});

const createReportSchema = z.object({
  title: z.string().min(1, "عنوان التقرير مطلوب"),
  description: z.string().optional().nullable(),
  type: z.string().min(1, "نوع التقرير مطلوب"),
  query: z.string().min(1, "استعلام التقرير مطلوب"),
  filters: z.any().optional(),
  scheduledAt: z.string().optional().nullable(),
});

const muteAlertSchema = z.object({
  alertType: z.string().min(1, "alertType مطلوب"),
  muteUntil: z.string().optional().nullable(),
  reason: z.string().optional().nullable(),
});

router.get("/dashboards", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM bi_dashboards WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "bi"); }
});

router.post("/dashboards", requirePermission("bi:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed_createDashboardSchema = createDashboardSchema.safeParse(req.body);
    if (!parsed_createDashboardSchema.success) throw new ValidationError(parsed_createDashboardSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_createDashboardSchema.data;
    const { title, description, layout, isDefault } = body;
    const r = await rawExecute(
      `INSERT INTO bi_dashboards (title, description, layout, "isDefault", "createdBy", "companyId") VALUES ($1,$2,$3,$4,$5,$6)`,
      [title, description, layout ? JSON.stringify(layout) : '{}', isDefault || false, scope.userId, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "bi_dashboards", entityId: r.insertId, after: { title } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "bi.dashboard.created", entity: "bi_dashboards", entityId: r.insertId, details: JSON.stringify({ title }) }).catch(console.error);
    res.status(201).json({ id: r.insertId });
  } catch (err) { handleRouteError(err, res, "bi"); }
});

router.get("/kpis", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM bi_kpis WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY module, name`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "bi"); }
});

router.post("/kpis", requirePermission("bi:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed_createKpiSchema = createKpiSchema.safeParse(req.body);
    if (!parsed_createKpiSchema.success) throw new ValidationError(parsed_createKpiSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_createKpiSchema.data;
    const { name, description, module, formula, target, currentValue, unit, frequency } = body;
    const r = await rawExecute(
      `INSERT INTO bi_kpis (name, description, module, formula, target, "currentValue", unit, frequency, "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [name, description, module, formula, target, currentValue, unit, frequency || "monthly", scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "bi_kpis", entityId: r.insertId, after: { name, module } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "bi.kpi.created", entity: "bi_kpis", entityId: r.insertId, details: JSON.stringify({ name, module }) }).catch(console.error);
    res.status(201).json({ id: r.insertId });
  } catch (err) { handleRouteError(err, res, "bi"); }
});

router.get("/reports", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM bi_reports WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "bi"); }
});

router.post("/reports", requirePermission("bi:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed_createReportSchema = createReportSchema.safeParse(req.body);
    if (!parsed_createReportSchema.success) throw new ValidationError(parsed_createReportSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_createReportSchema.data;
    const { title, description, type, query, filters, scheduledAt } = body;
    const r = await rawExecute(
      `INSERT INTO bi_reports (title, description, type, query, filters, "scheduledAt", "createdBy", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [title, description, type, query, filters ? JSON.stringify(filters) : '{}', scheduledAt || null, scope.userId, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "bi_reports", entityId: r.insertId, after: { title, type } }).catch(console.error);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "bi.report.created", entity: "bi_reports", entityId: r.insertId, details: JSON.stringify({ title, type }) }).catch(console.error);
    res.status(201).json({ id: r.insertId });
  } catch (err) { handleRouteError(err, res, "bi"); }
});

router.get("/overview", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [row] = await rawQuery<any>(
      `SELECT
         (SELECT COUNT(*) FROM employee_assignments WHERE "companyId" = $1) AS employees,
         (SELECT COUNT(*) FROM clients WHERE "companyId" = $1 AND "deletedAt" IS NULL) AS clients,
         (SELECT COUNT(*) FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL) AS invoices,
         (SELECT COUNT(*) FROM projects WHERE "companyId" = $1 AND "deletedAt" IS NULL) AS projects,
         (SELECT COUNT(*) FROM fleet_vehicles WHERE "companyId" = $1) AS vehicles,
         (SELECT COUNT(*) FROM support_tickets WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status = 'open') AS "openTickets",
         (SELECT COALESCE(SUM("paidAmount"), 0) FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "paidAmount" > 0) AS "totalRevenue"`,
      [cid]
    );
    res.json({
      employees: Number(row.employees),
      clients: Number(row.clients),
      invoices: Number(row.invoices),
      projects: Number(row.projects),
      vehicles: Number(row.vehicles),
      openTickets: Number(row.openTickets),
      totalRevenue: Number(row.totalRevenue),
    });
  } catch (err) { handleRouteError(err, res, "bi"); }
});

router.get("/operations/sla-delays", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { from, to, departmentId } = req.query as any;
    const conditions = [`t."companyId" = $1`];
    const params: any[] = [cid];
    if (from) { params.push(from); conditions.push(`t."scheduledDate" >= $${params.length}::date`); }
    if (to) { params.push(to); conditions.push(`t."scheduledDate" <= $${params.length}::date`); }
    if (departmentId) {
      const depId = Number(departmentId);
      if (isNaN(depId)) { throw new ValidationError("رقم القسم غير صالح"); }
      params.push(depId); conditions.push(`ea."departmentId" = $${params.length}`);
    }

    const rows = await rawQuery<any>(
      `SELECT
         COALESCE(d.name, 'بدون قسم') AS department,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE t.status NOT IN ('completed','cancelled') AND t."scheduledDate" < CURRENT_DATE) AS delayed,
         ROUND(100.0 * COUNT(*) FILTER (WHERE t.status NOT IN ('completed','cancelled') AND t."scheduledDate" < CURRENT_DATE) / NULLIF(COUNT(*), 0), 1) AS "delayPct"
       FROM tasks t
       LEFT JOIN employee_assignments ea ON ea."employeeId" = t."assignedTo" AND ea."companyId" = $1 AND ea.status = 'active'
       LEFT JOIN departments d ON d.id = ea."departmentId"
       WHERE ${conditions.join(" AND ")}
       GROUP BY d.name
       ORDER BY delayed DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "SLA delays"); }
});

router.get("/operations/rejection-rate", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { from, to } = req.query as any;
    const conditions = [`"companyId" = $1`];
    const params: any[] = [cid];
    if (from) { params.push(from); conditions.push(`"createdAt" >= $${params.length}::date`); }
    if (to) { params.push(to); conditions.push(`"createdAt" <= $${params.length}::date`); }

    const rows = await rawQuery<any>(
      `SELECT
         COALESCE(type, 'عام') AS type,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status IN ('rejected','cancelled','returned')) AS rejected,
         ROUND(100.0 * COUNT(*) FILTER (WHERE status IN ('rejected','cancelled','returned')) / NULLIF(COUNT(*), 0), 1) AS "rejectionPct"
       FROM tasks
       WHERE ${conditions.join(" AND ")}
       GROUP BY type
       ORDER BY rejected DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "Rejection rate"); }
});

router.get("/operations/bottleneck", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { from, to, departmentId } = req.query as any;
    const conditions = [`t."companyId" = $1`];
    const params: any[] = [cid];
    if (from) { params.push(from); conditions.push(`t."createdAt" >= $${params.length}::date`); }
    if (to) { params.push(to); conditions.push(`t."createdAt" <= $${params.length}::date`); }
    if (departmentId) {
      const depId = Number(departmentId);
      if (isNaN(depId)) { throw new ValidationError("رقم القسم غير صالح"); }
      params.push(depId); conditions.push(`ea."departmentId" = $${params.length}`);
    }

    const departmentDelay = await rawQuery<any>(
      `SELECT
         COALESCE(d.name, 'بدون قسم') AS department,
         ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t."completedAt", NOW()) - t."createdAt")) / 3600), 1) AS "avgHours",
         COUNT(*) FILTER (WHERE t.status NOT IN ('completed','cancelled') AND t."scheduledDate" < CURRENT_DATE) AS "overdueCount"
       FROM tasks t
       LEFT JOIN employee_assignments ea ON ea."employeeId" = t."assignedTo" AND ea."companyId" = $1 AND ea.status = 'active'
       LEFT JOIN departments d ON d.id = ea."departmentId"
       WHERE ${conditions.join(" AND ")}
       GROUP BY d.name
       ORDER BY "avgHours" DESC
       LIMIT 10`,
      params
    );

    const approvalParams: any[] = [cid];
    const approvalConds = [`lr."companyId" = $1`, `lr.status = 'pending'`];
    if (from) { approvalParams.push(from); approvalConds.push(`lr."createdAt" >= $${approvalParams.length}::date`); }
    if (to) { approvalParams.push(to); approvalConds.push(`lr."createdAt" <= $${approvalParams.length}::date`); }
    if (departmentId) {
      approvalParams.push(Number(departmentId)); approvalConds.push(`ea."departmentId" = $${approvalParams.length}`);
    }

    const approvalBottleneck = await rawQuery<any>(
      `SELECT
         COALESCE(d.name, 'بدون قسم') AS department,
         COUNT(*) AS "pendingApprovals",
         ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - lr."createdAt")) / 3600), 1) AS "avgWaitHours"
       FROM hr_leave_requests lr
       LEFT JOIN employees e ON e.id = lr."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active'
       LEFT JOIN departments d ON d.id = ea."departmentId"
       WHERE ${approvalConds.join(" AND ")}
       GROUP BY d.name
       ORDER BY "avgWaitHours" DESC
       LIMIT 10`,
      approvalParams
    ).catch(() => []);

    res.json({ departmentDelay, approvalBottleneck });
  } catch (err) { handleRouteError(err, res, "Bottleneck analysis"); }
});

router.get("/operations/employee-productivity", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { from, to, departmentId } = req.query as any;
    const conditions = [`t."companyId" = $1`];
    const params: any[] = [cid];
    if (from) { params.push(from); conditions.push(`t."completedAt" >= $${params.length}::date`); }
    if (to) { params.push(to); conditions.push(`t."completedAt" <= $${params.length}::date`); }
    if (departmentId) {
      const depId = Number(departmentId);
      if (isNaN(depId)) { throw new ValidationError("رقم القسم غير صالح"); }
      params.push(depId); conditions.push(`ea."departmentId" = $${params.length}`);
    }

    const rows = await rawQuery<any>(
      `SELECT
         e.name,
         COALESCE(d.name, 'بدون قسم') AS department,
         COUNT(*) FILTER (WHERE t.status = 'completed') AS "completedTasks",
         COUNT(*) AS "totalTasks",
         ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(t."completedAt", NOW()) - t."createdAt")) / 3600), 1) AS "avgCompletionHours",
         ROUND(100.0 * COUNT(*) FILTER (WHERE t.status = 'completed') / NULLIF(COUNT(*), 0), 0) AS "completionRate",
         COALESCE(att.worked_hours, 0) AS "workedHours",
         CASE WHEN COALESCE(att.worked_hours, 0) > 0
           THEN ROUND(COUNT(*) FILTER (WHERE t.status = 'completed')::numeric / att.worked_hours, 2)
           ELSE 0 END AS "productivityRate"
       FROM tasks t
       JOIN employees e ON e.id = t."assignedTo"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active'
       LEFT JOIN departments d ON d.id = ea."departmentId"
       LEFT JOIN LATERAL (
         SELECT ROUND(SUM(EXTRACT(EPOCH FROM (COALESCE(a."checkOut", NOW()) - a."checkIn")) / 3600)::numeric, 1) AS worked_hours
         FROM attendance a
         WHERE a."assignmentId" IN (SELECT id FROM employee_assignments WHERE "employeeId" = e.id) AND a."companyId" = $1
           AND a."checkIn" IS NOT NULL
           ${from ? `AND a."date" >= $${params.indexOf(from) + 1}::date` : ''}
           ${to ? `AND a."date" <= $${params.indexOf(to) + 1}::date` : ''}
       ) att ON true
       WHERE ${conditions.join(" AND ")} AND t."assignedTo" IS NOT NULL
       GROUP BY e.name, d.name, att.worked_hours
       ORDER BY "productivityRate" DESC, "completedTasks" DESC
       LIMIT 20`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "Employee productivity"); }
});

router.get("/operations/approval-timeliness", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { from, to, departmentId } = req.query as any;
    const conditions = [`lr."companyId" = $1`];
    const params: any[] = [cid];
    if (from) { params.push(from); conditions.push(`lr."createdAt" >= $${params.length}::date`); }
    if (to) { params.push(to); conditions.push(`lr."createdAt" <= $${params.length}::date`); }
    if (departmentId) {
      const depId = Number(departmentId);
      if (isNaN(depId)) { throw new ValidationError("رقم القسم غير صالح"); }
      params.push(depId); conditions.push(`ea."departmentId" = $${params.length}`);
    }

    const [stats] = await rawQuery<any>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE lr.status = 'approved') AS approved,
         COUNT(*) FILTER (WHERE lr.status = 'pending') AS pending,
         COUNT(*) FILTER (WHERE lr.status = 'rejected') AS rejected,
         ROUND(AVG(CASE WHEN lr.status = 'approved' AND lr."approvedAt" IS NOT NULL
           THEN EXTRACT(EPOCH FROM (lr."approvedAt" - lr."createdAt")) / 3600 END), 1) AS "avgApprovalHours"
       FROM hr_leave_requests lr
       LEFT JOIN employees e ON e.id = lr."employeeId"
       LEFT JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active'
       WHERE ${conditions.join(" AND ")}`,
      params
    );
    res.json(stats || { total: 0, approved: 0, pending: 0, rejected: 0, avgApprovalHours: 0 });
  } catch (err) { handleRouteError(err, res, "Approval timeliness"); }
});

router.get("/operations/avg-completion-time", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { from, to, departmentId } = req.query as any;
    const conditions = [`t."companyId" = $1`, `t.status = 'completed'`, `t."completedAt" IS NOT NULL`];
    const params: any[] = [cid];
    if (from) { params.push(from); conditions.push(`t."completedAt" >= $${params.length}::date`); }
    if (to) { params.push(to); conditions.push(`t."completedAt" <= $${params.length}::date`); }
    if (departmentId) {
      const depId = Number(departmentId);
      if (isNaN(depId)) { throw new ValidationError("رقم القسم غير صالح"); }
      params.push(depId); conditions.push(`ea."departmentId" = $${params.length}`);
    }

    const rows = await rawQuery<any>(
      `SELECT
         COALESCE(t.type, 'عام') AS type,
         ROUND(AVG(EXTRACT(EPOCH FROM (t."completedAt" - t."createdAt")) / 3600), 1) AS "avgHours",
         COUNT(*) AS total
       FROM tasks t
       LEFT JOIN employee_assignments ea ON ea."employeeId" = t."assignedTo" AND ea."companyId" = $1 AND ea.status = 'active'
       WHERE ${conditions.join(" AND ")}
       GROUP BY t.type
       ORDER BY "avgHours" DESC`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "Avg completion time"); }
});

router.get("/operations/trend", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { from, to, departmentId } = req.query as any;
    const conditions = [`t."companyId" = $1`, `t."scheduledDate" >= CURRENT_DATE - INTERVAL '12 weeks'`];
    const params: any[] = [cid];
    if (from) { params.push(from); conditions.push(`t."scheduledDate" >= $${params.length}::date`); }
    if (to) { params.push(to); conditions.push(`t."scheduledDate" <= $${params.length}::date`); }
    if (departmentId) {
      const depId = Number(departmentId);
      if (isNaN(depId)) { throw new ValidationError("رقم القسم غير صالح"); }
      params.push(depId); conditions.push(`ea."departmentId" = $${params.length}`);
    }

    const rows = await rawQuery<any>(
      `SELECT
         TO_CHAR(DATE_TRUNC('week', t."scheduledDate"), 'YYYY-MM-DD') AS week,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE t.status = 'completed') AS completed,
         COUNT(*) FILTER (WHERE t.status NOT IN ('completed','cancelled') AND t."scheduledDate" < CURRENT_DATE) AS overdue
       FROM tasks t
       ${departmentId ? `LEFT JOIN employee_assignments ea ON ea."employeeId" = t."assignedTo" AND ea."companyId" = $1 AND ea.status = 'active'` : ''}
       WHERE ${conditions.join(" AND ")}
       GROUP BY week
       ORDER BY week`,
      params
    );
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "Operations trend"); }
});

router.get("/admin-reports/daily", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const date = (req.query.date as string) || todayISO();

    const [attendance] = await rawQuery<any>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'present') AS present,
         COUNT(*) FILTER (WHERE status = 'absent') AS absent,
         COUNT(*) FILTER (WHERE status = 'late') AS late
       FROM attendance
       WHERE "companyId" = $1 AND date = $2::date`,
      [cid, date]
    ).catch(() => [{ total: 0, present: 0, absent: 0, late: 0 }]);

    const [tasks] = await rawQuery<any>(
      `SELECT
         COUNT(*) FILTER (WHERE "scheduledDate" = $2::date) AS scheduled,
         COUNT(*) FILTER (WHERE status = 'completed' AND DATE("completedAt") = $2::date) AS completed,
         COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND "scheduledDate" < $2::date) AS overdue
       FROM tasks
       WHERE "companyId" = $1`,
      [cid, date]
    ).catch(() => [{ scheduled: 0, completed: 0, overdue: 0 }]);

    const [financial] = await rawQuery<any>(
      `SELECT
         COALESCE(SUM(total), 0) AS "invoicesTotal",
         COALESCE(SUM("paidAmount"), 0) AS "paidTotal",
         COUNT(*) AS "invoiceCount"
       FROM invoices
       WHERE "companyId" = $1 AND "deletedAt" IS NULL AND DATE("createdAt") = $2::date`,
      [cid, date]
    ).catch(() => [{ invoicesTotal: 0, paidTotal: 0, invoiceCount: 0 }]);

    const [leaves] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM hr_leave_requests
       WHERE "companyId" = $1 AND DATE("createdAt") = $2::date`,
      [cid, date]
    ).catch(() => [{ total: 0 }]);

    const [tickets] = await rawQuery<any>(
      `SELECT
         COUNT(*) FILTER (WHERE DATE("createdAt") = $2::date) AS opened,
         COUNT(*) FILTER (WHERE DATE("resolvedAt") = $2::date) AS resolved
       FROM support_tickets
       WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [cid, date]
    ).catch(() => [{ opened: 0, resolved: 0 }]);

    res.json({
      date,
      attendance: {
        total: Number(attendance?.total ?? 0),
        present: Number(attendance?.present ?? 0),
        absent: Number(attendance?.absent ?? 0),
        late: Number(attendance?.late ?? 0),
      },
      tasks: {
        scheduled: Number(tasks?.scheduled ?? 0),
        completed: Number(tasks?.completed ?? 0),
        overdue: Number(tasks?.overdue ?? 0),
      },
      financial: {
        invoicesTotal: Number(financial?.invoicesTotal ?? 0),
        paidTotal: Number(financial?.paidTotal ?? 0),
        invoiceCount: Number(financial?.invoiceCount ?? 0),
      },
      leaveRequests: Number(leaves?.total ?? 0),
      tickets: {
        opened: Number(tickets?.opened ?? 0),
        resolved: Number(tickets?.resolved ?? 0),
      },
    });
  } catch (err) { handleRouteError(err, res, "Daily report"); }
});

router.get("/admin-reports/weekly", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const buildWeekStats = async (startDate: string, endDate: string) => {
      const [tasks] = await rawQuery<any>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND "scheduledDate" < $3::date) AS overdue,
           ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0), 0) AS "completionRate"
         FROM tasks
         WHERE "companyId" = $1 AND "scheduledDate" BETWEEN $2::date AND $3::date`,
        [cid, startDate, endDate]
      ).catch(() => [{ total: 0, completed: 0, overdue: 0, completionRate: 0 }]);

      const [attendance] = await rawQuery<any>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'present') AS present,
           ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'present') / NULLIF(COUNT(*), 0), 0) AS "presentRate"
         FROM attendance
         WHERE "companyId" = $1 AND date BETWEEN $2::date AND $3::date`,
        [cid, startDate, endDate]
      ).catch(() => [{ total: 0, present: 0, presentRate: 0 }]);

      const [revenue] = await rawQuery<any>(
        `SELECT COALESCE(SUM("paidAmount"), 0) AS total
         FROM invoices
         WHERE "companyId" = $1 AND "deletedAt" IS NULL AND DATE("createdAt") BETWEEN $2::date AND $3::date`,
        [cid, startDate, endDate]
      ).catch(() => [{ total: 0 }]);

      const [tickets] = await rawQuery<any>(
        `SELECT
           COUNT(*) FILTER (WHERE DATE("createdAt") BETWEEN $2::date AND $3::date) AS opened,
           COUNT(*) FILTER (WHERE DATE("resolvedAt") BETWEEN $2::date AND $3::date) AS resolved
         FROM support_tickets
         WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
        [cid, startDate, endDate]
      ).catch(() => [{ opened: 0, resolved: 0 }]);

      return {
        tasks: {
          total: Number(tasks?.total ?? 0),
          completed: Number(tasks?.completed ?? 0),
          overdue: Number(tasks?.overdue ?? 0),
          completionRate: Number(tasks?.completionRate ?? 0),
        },
        attendance: {
          total: Number(attendance?.total ?? 0),
          present: Number(attendance?.present ?? 0),
          presentRate: Number(attendance?.presentRate ?? 0),
        },
        revenue: Number(revenue?.total ?? 0),
        tickets: {
          opened: Number(tickets?.opened ?? 0),
          resolved: Number(tickets?.resolved ?? 0),
        },
      };
    };

    const now = new Date();
    const thisWeekEnd = new Date(now);
    const thisWeekStart = new Date(now);
    thisWeekStart.setDate(now.getDate() - now.getDay());
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekStart.getDate() - 6);

    const fmt = toDateISO;
    const [thisWeek, lastWeek] = await Promise.all([
      buildWeekStats(fmt(thisWeekStart), fmt(thisWeekEnd)),
      buildWeekStats(fmt(lastWeekStart), fmt(lastWeekEnd)),
    ]);

    res.json({
      period: { from: fmt(thisWeekStart), to: fmt(thisWeekEnd) },
      previousPeriod: { from: fmt(lastWeekStart), to: fmt(lastWeekEnd) },
      current: thisWeek,
      previous: lastWeek,
      changes: {
        tasksCompletionRate: thisWeek.tasks.completionRate - lastWeek.tasks.completionRate,
        attendancePresentRate: thisWeek.attendance.presentRate - lastWeek.attendance.presentRate,
        revenueChange: lastWeek.revenue > 0 ? Math.round(((thisWeek.revenue - lastWeek.revenue) / lastWeek.revenue) * 100) : 0,
        ticketsResolved: thisWeek.tickets.resolved - lastWeek.tickets.resolved,
      },
    });
  } catch (err) { handleRouteError(err, res, "Weekly report"); }
});

router.get("/admin-reports/monthly", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const fmt = toDateISO;

    const buildMonthStats = async (startDate: string, endDate: string) => {
      const [tasks] = await rawQuery<any>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND "scheduledDate" < $3::date) AS overdue,
           ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'completed') / NULLIF(COUNT(*), 0), 0) AS "completionRate"
         FROM tasks WHERE "companyId" = $1 AND "scheduledDate" BETWEEN $2::date AND $3::date`,
        [cid, startDate, endDate]
      ).catch(() => [{ total: 0, completed: 0, overdue: 0, completionRate: 0 }]);

      const [attendance] = await rawQuery<any>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'present') AS present,
           COUNT(*) FILTER (WHERE status = 'absent') AS absent,
           COUNT(*) FILTER (WHERE status = 'late') AS late,
           ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'present') / NULLIF(COUNT(*), 0), 0) AS "presentRate"
         FROM attendance WHERE "companyId" = $1 AND date BETWEEN $2::date AND $3::date`,
        [cid, startDate, endDate]
      ).catch(() => [{ total: 0, present: 0, absent: 0, late: 0, presentRate: 0 }]);

      const [financial] = await rawQuery<any>(
        `SELECT
           COALESCE(SUM(total), 0) AS revenue,
           COALESCE(SUM("paidAmount"), 0) AS collected,
           COUNT(*) AS "invoiceCount",
           COUNT(*) FILTER (WHERE status IN ('overdue','sent') AND "dueDate" < CURRENT_DATE) AS "overdueInvoices"
         FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL AND DATE("createdAt") BETWEEN $2::date AND $3::date`,
        [cid, startDate, endDate]
      ).catch(() => [{ revenue: 0, collected: 0, invoiceCount: 0, overdueInvoices: 0 }]);

      const [hr] = await rawQuery<any>(
        `SELECT
           COUNT(*) AS "newEmployees"
         FROM employee_assignments
         WHERE "companyId" = $1 AND DATE("createdAt") BETWEEN $2::date AND $3::date`,
        [cid, startDate, endDate]
      ).catch(() => [{ newEmployees: 0 }]);

      const [leaves] = await rawQuery<any>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'approved') AS approved,
           COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
           SUM(CASE WHEN status = 'approved' THEN days ELSE 0 END) AS "totalDays"
         FROM hr_leave_requests
         WHERE "companyId" = $1 AND DATE("createdAt") BETWEEN $2::date AND $3::date`,
        [cid, startDate, endDate]
      ).catch(() => [{ total: 0, approved: 0, rejected: 0, totalDays: 0 }]);

      const [tickets] = await rawQuery<any>(
        `SELECT
           COUNT(*) FILTER (WHERE DATE("createdAt") BETWEEN $2::date AND $3::date) AS opened,
           COUNT(*) FILTER (WHERE DATE("resolvedAt") BETWEEN $2::date AND $3::date) AS resolved,
           ROUND(AVG(CASE WHEN "resolvedAt" IS NOT NULL
             THEN EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600 END), 1) AS "avgResolutionHours"
         FROM support_tickets WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
        [cid, startDate, endDate]
      ).catch(() => [{ opened: 0, resolved: 0, avgResolutionHours: 0 }]);

      return {
        tasks: {
          total: Number(tasks?.total ?? 0), completed: Number(tasks?.completed ?? 0),
          overdue: Number(tasks?.overdue ?? 0), completionRate: Number(tasks?.completionRate ?? 0),
        },
        attendance: {
          total: Number(attendance?.total ?? 0), present: Number(attendance?.present ?? 0),
          absent: Number(attendance?.absent ?? 0), late: Number(attendance?.late ?? 0),
          presentRate: Number(attendance?.presentRate ?? 0),
        },
        financial: {
          revenue: Number(financial?.revenue ?? 0), collected: Number(financial?.collected ?? 0),
          invoiceCount: Number(financial?.invoiceCount ?? 0), overdueInvoices: Number(financial?.overdueInvoices ?? 0),
        },
        hr: { newEmployees: Number(hr?.newEmployees ?? 0) },
        leaves: {
          total: Number(leaves?.total ?? 0), approved: Number(leaves?.approved ?? 0),
          rejected: Number(leaves?.rejected ?? 0), totalDays: Number(leaves?.totalDays ?? 0),
        },
        tickets: {
          opened: Number(tickets?.opened ?? 0), resolved: Number(tickets?.resolved ?? 0),
          avgResolutionHours: Number(tickets?.avgResolutionHours ?? 0),
        },
      };
    };

    const weeklyTrend = await rawQuery<any>(
      `SELECT
         TO_CHAR(DATE_TRUNC('week', "scheduledDate"), 'YYYY-MM-DD') AS week,
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'completed') AS completed
       FROM tasks
       WHERE "companyId" = $1 AND "scheduledDate" >= $2::date
       GROUP BY week ORDER BY week`,
      [cid, fmt(thisMonthStart)]
    ).catch(() => []);

    const [current, previous] = await Promise.all([
      buildMonthStats(fmt(thisMonthStart), fmt(now)),
      buildMonthStats(fmt(lastMonthStart), fmt(lastMonthEnd)),
    ]);

    res.json({
      period: { from: fmt(thisMonthStart), to: fmt(now) },
      previousPeriod: { from: fmt(lastMonthStart), to: fmt(lastMonthEnd) },
      current,
      previous,
      weeklyTrend,
      changes: {
        tasksCompletionRate: current.tasks.completionRate - previous.tasks.completionRate,
        attendancePresentRate: current.attendance.presentRate - previous.attendance.presentRate,
        revenueChange: previous.financial.revenue > 0 ? Math.round(((current.financial.revenue - previous.financial.revenue) / previous.financial.revenue) * 100) : 0,
        ticketsResolved: current.tickets.resolved - previous.tickets.resolved,
      },
    });
  } catch (err) { handleRouteError(err, res, "Monthly report"); }
});


router.get("/ceo-dashboard", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const now = new Date();
    const thisMonthStart = toDateISO(new Date(now.getFullYear(), now.getMonth(), 1));
    const lastMonthStart = toDateISO(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const lastMonthEnd = toDateISO(new Date(now.getFullYear(), now.getMonth(), 0));

    const [financial] = await rawQuery<any>(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE("createdAt") >= $2::date THEN "paidAmount" ELSE 0 END), 0) AS "revenueThisMonth",
         COALESCE(SUM(CASE WHEN DATE("createdAt") >= $3::date AND DATE("createdAt") <= $4::date THEN "paidAmount" ELSE 0 END), 0) AS "revenueLastMonth",
         COALESCE(SUM(CASE WHEN DATE("createdAt") >= $2::date THEN total ELSE 0 END), 0) AS "invoicedThisMonth",
         COUNT(*) FILTER (WHERE status IN ('sent','partial','overdue') AND "dueDate" < CURRENT_DATE) AS "overdueInvoices",
         COALESCE(SUM(total - "paidAmount") FILTER (WHERE status IN ('sent','partial','overdue') AND "dueDate" < CURRENT_DATE), 0) AS "overdueAmount"
       FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [cid, thisMonthStart, lastMonthStart, lastMonthEnd]
    ).catch(() => [{}]);

    const [expenses] = await rawQuery<any>(
      `SELECT
         COALESCE(SUM(CASE WHEN DATE("createdAt") >= $2::date THEN amount ELSE 0 END), 0) AS "expensesThisMonth",
         COALESCE(SUM(CASE WHEN DATE("createdAt") >= $3::date AND DATE("createdAt") <= $4::date THEN amount ELSE 0 END), 0) AS "expensesLastMonth"
       FROM vouchers WHERE "companyId" = $1 AND type = 'payment'`,
      [cid, thisMonthStart, lastMonthStart, lastMonthEnd]
    ).catch(() => [{}]);

    const [hr] = await rawQuery<any>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'active') AS "totalEmployees",
         COUNT(*) FILTER (WHERE status = 'pending') AS "pendingLeaveRequests"
       FROM employee_assignments WHERE "companyId" = $1`,
      [cid]
    ).catch(() => [{}]);

    const [attendance] = await rawQuery<any>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'present') AS "presentToday",
         COUNT(*) AS "totalToday"
       FROM attendance WHERE "companyId" = $1 AND date = CURRENT_DATE`,
      [cid]
    ).catch(() => [{}]);

    const [pendingLeave] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM hr_leave_requests WHERE "companyId" = $1 AND status = 'pending'`,
      [cid]
    ).catch(() => [{ cnt: 0 }]);

    const [ops] = await rawQuery<any>(
      `SELECT
         COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND "scheduledDate" < CURRENT_DATE) AS "overdueProjects",
         COUNT(*) AS "totalProjects"
       FROM projects WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [cid]
    ).catch(() => [{}]);

    const [tickets] = await rawQuery<any>(
      `SELECT COUNT(*) FILTER (WHERE status = 'open') AS "openTickets" FROM support_tickets WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [cid]
    ).catch(() => [{}]);

    const [maintenance] = await rawQuery<any>(
      `SELECT COUNT(*) FILTER (WHERE status = 'pending') AS "pendingMaintenance" FROM maintenance_requests WHERE "companyId" = $1`,
      [cid]
    ).catch(() => [{}]);

    const [contracts] = await rawQuery<any>(
      `SELECT
         COUNT(*) FILTER (WHERE status='active' AND "endDate"::date - CURRENT_DATE <= 30) AS "expiringContracts",
         COUNT(*) FILTER (WHERE status='active' AND "endDate"::date - CURRENT_DATE <= 90) AS "expiringContracts90"
       FROM legal_contracts WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
      [cid]
    ).catch(() => [{}]);

    const [docs] = await rawQuery<any>(
      `SELECT COUNT(*) AS "expiringDocs" FROM employee_documents
       WHERE "companyId" = $1 AND "expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
      [cid]
    ).catch(() => [{}]);

    const revenueThisMonth = Number(financial?.revenueThisMonth ?? 0);
    const revenueLastMonth = Number(financial?.revenueLastMonth ?? 0);
    const expensesThisMonth = Number(expenses?.expensesThisMonth ?? 0);
    const expensesLastMonth = Number(expenses?.expensesLastMonth ?? 0);
    const netProfitThisMonth = revenueThisMonth - expensesThisMonth;
    const netProfitLastMonth = revenueLastMonth - expensesLastMonth;

    res.json({
      financial: {
        revenueThisMonth,
        revenueLastMonth,
        revenueTrend: revenueLastMonth > 0 ? Math.round(((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100) : 0,
        expensesThisMonth,
        expensesLastMonth,
        expensesTrend: expensesLastMonth > 0 ? Math.round(((expensesThisMonth - expensesLastMonth) / expensesLastMonth) * 100) : 0,
        netProfitThisMonth,
        netProfitLastMonth,
        netProfitTrend: netProfitLastMonth !== 0 ? Math.round(((netProfitThisMonth - netProfitLastMonth) / Math.abs(netProfitLastMonth)) * 100) : 0,
        overdueInvoices: Number(financial?.overdueInvoices ?? 0),
        overdueAmount: Number(financial?.overdueAmount ?? 0),
      },
      hr: {
        totalEmployees: Number(hr?.totalEmployees ?? 0),
        presentToday: Number(attendance?.presentToday ?? 0),
        totalToday: Number(attendance?.totalToday ?? 0),
        attendanceRate: Number(attendance?.totalToday ?? 0) > 0
          ? Math.round((Number(attendance?.presentToday ?? 0) / Number(attendance?.totalToday ?? 1)) * 100) : 0,
        pendingLeaveRequests: Number(pendingLeave?.cnt ?? 0),
      },
      operations: {
        overdueProjects: Number(ops?.overdueProjects ?? 0),
        totalProjects: Number(ops?.totalProjects ?? 0),
        openTickets: Number(tickets?.openTickets ?? 0),
        pendingMaintenance: Number(maintenance?.pendingMaintenance ?? 0),
      },
      risks: {
        expiringContracts30: Number(contracts?.expiringContracts ?? 0),
        expiringContracts90: Number(contracts?.expiringContracts90 ?? 0),
        expiringDocs: Number(docs?.expiringDocs ?? 0),
        overdueInvoices: Number(financial?.overdueInvoices ?? 0),
      },
    });
  } catch (err) { handleRouteError(err, res, "CEO dashboard"); }
});

router.get("/reports/branch-performance", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { from, to } = req.query as any;
    const dateFrom = from || toDateISO(new Date(currentYear(), new Date().getMonth(), 1));
    const dateTo = to || todayISO();

    const branches = await rawQuery<any>(
      `SELECT b.id, b.name FROM branches b WHERE b."companyId" = $1 ORDER BY b.name`,
      [cid]
    );

    const result = await Promise.all(branches.map(async (branch: any) => {
      const [revenue] = await rawQuery<any>(
        `SELECT COALESCE(SUM("paidAmount"), 0) AS revenue, COALESCE(SUM(total), 0) AS invoiced,
                COUNT(*) AS invoiceCount
         FROM invoices WHERE "companyId" = $1 AND "branchId" = $2 AND "deletedAt" IS NULL
           AND DATE("createdAt") BETWEEN $3::date AND $4::date`,
        [cid, branch.id, dateFrom, dateTo]
      ).catch(() => [{}]);

      const [expenses] = await rawQuery<any>(
        `SELECT COALESCE(SUM(amount), 0) AS expenses FROM vouchers
         WHERE "companyId" = $1 AND "branchId" = $2 AND type = 'payment'
           AND DATE("createdAt") BETWEEN $3::date AND $4::date`,
        [cid, branch.id, dateFrom, dateTo]
      ).catch(() => [{}]);

      const [employees] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM employee_assignments
         WHERE "companyId" = $1 AND "branchId" = $2 AND status = 'active'`,
        [cid, branch.id]
      ).catch(() => [{}]);

      const [attRow] = await rawQuery<any>(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'present') AS present,
           COUNT(*) AS total
         FROM attendance
         WHERE "companyId" = $1 AND "branchId" = $2
           AND date BETWEEN $3::date AND $4::date`,
        [cid, branch.id, dateFrom, dateTo]
      ).catch(() => [{}]);

      const [ticketsRow] = await rawQuery<any>(
        `SELECT COUNT(*) AS cnt FROM support_tickets
         WHERE "companyId" = $1 AND status = 'open'`,
        [cid]
      ).catch(() => [{}]);

      const [satisfactionRow] = await rawQuery<any>(
        `SELECT COALESCE(AVG(rating), 0) AS avg FROM support_tickets
         WHERE "companyId" = $1 AND rating IS NOT NULL
           AND DATE("createdAt") BETWEEN $2::date AND $3::date`,
        [cid, dateFrom, dateTo]
      ).catch(() => [{}]);

      const rev = Number(revenue?.revenue ?? 0);
      const exp = Number(expenses?.expenses ?? 0);
      const attTotal = Number(attRow?.total ?? 0);
      const attPresent = Number(attRow?.present ?? 0);

      return {
        branchId: branch.id,
        branchName: branch.name,
        revenue: rev,
        expenses: exp,
        netProfit: rev - exp,
        invoiceCount: Number(revenue?.invoiceCount ?? 0),
        employees: Number(employees?.total ?? 0),
        attendanceRate: attTotal > 0 ? Math.round((attPresent / attTotal) * 100) : 0,
        openTickets: Number(ticketsRow?.cnt ?? 0),
        clientSatisfaction: Math.round(Number(satisfactionRow?.avg ?? 0) * 10) / 10,
      };
    }));

    result.sort((a: any, b: any) => b.revenue - a.revenue);
    result.forEach((r: any, i: number) => { r.rank = i + 1; });

    res.json({ data: result, period: { from: dateFrom, to: dateTo } });
  } catch (err) { handleRouteError(err, res, "Branch performance report"); }
});

router.get("/reports/vendor-performance", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { from, to } = req.query as any;
    const dateFrom = from || toDateISO(new Date(currentYear(), 0, 1));
    const dateTo = to || todayISO();

    const rows = await rawQuery<any>(
      `SELECT
         v.id AS "vendorId",
         v.name AS "vendorName",
         COUNT(po.id) AS "totalOrders",
         COALESCE(SUM(po."totalAmount"), 0) AS "totalSpend",
         ROUND(AVG(po."totalAmount"), 0) AS "avgOrderValue",
         COUNT(po.id) FILTER (WHERE po."deliveredAt" IS NOT NULL AND po."expectedDelivery" IS NOT NULL
           AND po."deliveredAt"::date <= po."expectedDelivery"::date) AS "onTimeDeliveries",
         COUNT(po.id) FILTER (WHERE po."deliveredAt" IS NOT NULL) AS "deliveredOrders",
         COUNT(po.id) FILTER (WHERE po.status IN ('returned','rejected')) AS "returnedOrders"
       FROM suppliers v
       LEFT JOIN purchase_orders po ON po."supplierId" = v.id AND po."companyId" = $1
         AND DATE(po."createdAt") BETWEEN $2::date AND $3::date
       WHERE v."companyId" = $1
       GROUP BY v.id, v.name
       HAVING COUNT(po.id) > 0
       ORDER BY "totalSpend" DESC`,
      [cid, dateFrom, dateTo]
    ).catch(() => []);

    const data = rows.map((r: any) => {
      const total = Number(r.totalOrders);
      const delivered = Number(r.deliveredOrders);
      const onTime = Number(r.onTimeDeliveries);
      const returned = Number(r.returnedOrders);
      return {
        vendorId: r.vendorId,
        vendorName: r.vendorName,
        totalOrders: total,
        totalSpend: Number(r.totalSpend),
        avgOrderValue: Number(r.avgOrderValue),
        onTimeDeliveryRate: delivered > 0 ? Math.round((onTime / delivered) * 100) : 0,
        returnRate: total > 0 ? Math.round((returned / total) * 100) : 0,
        qualityScore: total > 0 ? Math.round(100 - (returned / total) * 100) : 100,
      };
    });

    res.json({ data, period: { from: dateFrom, to: dateTo } });
  } catch (err) { handleRouteError(err, res, "Vendor performance report"); }
});

router.get("/reports/fleet-tco", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const rows = await rawQuery<any>(
      `SELECT
         fv.id AS "vehicleId",
         fv."plateNumber",
         fv.make,
         fv.model,
         fv.year,
         fv.status,
         0 AS "purchasePrice",
         0 AS "monthlyLeaseCost",
         COALESCE(fm_total.total, 0) AS "maintenanceCost",
         COALESCE(fuel_total.total, 0) AS "fuelCost",
         COALESCE(ins_total.total, 0) AS "insuranceCost",
         fv."currentMileage" AS "odometer"
       FROM fleet_vehicles fv
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(cost), 0) AS total FROM fleet_maintenance
         WHERE "vehicleId" = fv.id AND "companyId" = $1
       ) fm_total ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(amount), 0) AS total FROM fleet_fuel_logs
         WHERE "vehicleId" = fv.id AND "companyId" = $1
       ) fuel_total ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM("premiumAmount"), 0) AS total FROM fleet_insurance
         WHERE "vehicleId" = fv.id AND "companyId" = $1
       ) ins_total ON true
       WHERE fv."companyId" = $1
       ORDER BY fv."plateNumber"`,
      [cid]
    ).catch(() => []);

    const data = rows.map((r: any) => {
      const purchasePrice = Number(r.purchasePrice);
      const maintenanceCost = Number(r.maintenanceCost);
      const fuelCost = Number(r.fuelCost);
      const insuranceCost = Number(r.insuranceCost);
      const yearsOld = r.year ? currentYear() - Number(r.year) : 0;
      const depreciation = purchasePrice > 0 ? Math.round(purchasePrice * 0.2 * Math.min(yearsOld, 5)) : 0;
      const tco = purchasePrice + maintenanceCost + fuelCost + insuranceCost + depreciation;
      const odometer = Number(r.odometer ?? 0);
      return {
        vehicleId: r.vehicleId,
        plateNumber: r.plateNumber,
        make: r.make,
        model: r.model,
        year: r.year,
        status: r.status,
        purchasePrice,
        maintenanceCost,
        fuelCost,
        insuranceCost,
        depreciation,
        tco,
        odometer,
        costPerKm: odometer > 0 ? Math.round((tco / odometer) * 100) / 100 : 0,
      };
    });

    res.json({ data });
  } catch (err) { handleRouteError(err, res, "Fleet TCO report"); }
});

router.get("/reports/department-leave-balance", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const year = currentYear();

    const rows = await rawQuery<any>(
      `SELECT
         COALESCE(d.name, 'بدون قسم') AS department,
         d.id AS "departmentId",
         COUNT(DISTINCT ea.id) AS "totalEmployees",
         COUNT(DISTINCT ea.id) FILTER (
           WHERE EXISTS (
             SELECT 1 FROM hr_leave_requests lr
             WHERE lr."employeeId" = ea."employeeId"
               AND lr.status = 'approved'
               AND CURRENT_DATE BETWEEN lr."startDate" AND lr."endDate"
           )
         ) AS "onLeaveNow",
         ROUND(AVG(COALESCE(lb.remaining, lb.entitled, 0)), 1) AS "avgRemainingBalance",
         SUM(COALESCE(lb.used, 0)) AS "totalUsedDays",
         SUM(COALESCE(lb.remaining, lb.entitled, 0)) AS "totalRemainingDays"
       FROM employee_assignments ea
       LEFT JOIN departments d ON d.id = ea."departmentId"
       LEFT JOIN hr_leave_balances lb ON lb."employeeId" = ea."employeeId"
         AND lb."companyId" = $1 AND lb.year = $2
       WHERE ea."companyId" = $1 AND ea.status = 'active'
       GROUP BY d.id, d.name
       ORDER BY department`,
      [cid, year]
    ).catch(() => []);

    const data = rows.map((r: any) => {
      const total = Number(r.totalEmployees);
      const onLeave = Number(r.onLeaveNow);
      const onLeavePct = total > 0 ? Math.round((onLeave / total) * 100) : 0;
      return {
        department: r.department,
        departmentId: r.departmentId,
        totalEmployees: total,
        onLeaveNow: onLeave,
        onLeavePct,
        avgRemainingBalance: Number(r.avgRemainingBalance ?? 0),
        totalUsedDays: Number(r.totalUsedDays ?? 0),
        totalRemainingDays: Number(r.totalRemainingDays ?? 0),
        warning: onLeavePct >= 30,
      };
    });

    res.json({ data, year });
  } catch (err) { handleRouteError(err, res, "Department leave balance"); }
});

router.get("/reports/property-occupancy", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const rows = await rawQuery<any>(
      `SELECT
         pb.id AS "buildingId",
         pb.name AS "buildingName",
         pb.address,
         COUNT(pu.id) AS "totalUnits",
         COUNT(pu.id) FILTER (WHERE pu.status = 'occupied') AS "occupiedUnits",
         COUNT(pu.id) FILTER (WHERE pu.status = 'vacant') AS "vacantUnits",
         ROUND(AVG(rc."monthlyRent") FILTER (WHERE rc.status = 'active'), 0) AS "avgMonthlyRent",
         COALESCE(SUM(rc."monthlyRent") FILTER (WHERE rc.status = 'active'), 0) AS "totalMonthlyRevenue"
       FROM property_buildings pb
       LEFT JOIN property_units pu ON pu."buildingId" = pb.id
       LEFT JOIN rental_contracts rc ON rc."unitId" = pu.id AND rc.status = 'active'
       WHERE pb."companyId" = $1
       GROUP BY pb.id, pb.name, pb.address
       ORDER BY pb.name`,
      [cid]
    ).catch(() => []);

    const data = rows.map((r: any) => {
      const total = Number(r.totalUnits);
      const occupied = Number(r.occupiedUnits);
      const vacant = Number(r.vacantUnits);
      return {
        buildingId: r.buildingId,
        buildingName: r.buildingName,
        address: r.address,
        totalUnits: total,
        occupiedUnits: occupied,
        vacantUnits: vacant,
        occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
        avgMonthlyRent: Number(r.avgMonthlyRent ?? 0),
        totalMonthlyRevenue: Number(r.totalMonthlyRevenue ?? 0),
        annualRevenue: Number(r.totalMonthlyRevenue ?? 0) * 12,
      };
    });

    res.json({ data });
  } catch (err) { handleRouteError(err, res, "Property occupancy report"); }
});

router.get("/reports/training-roi", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { from, to } = req.query as any;
    const dateFrom = from || toDateISO(new Date(currentYear(), 0, 1));
    const dateTo = to || todayISO();

    const [summary] = await rawQuery<any>(
      `SELECT
         COUNT(DISTINCT tp."employeeId") AS "trainedEmployees",
         COUNT(*) AS "totalSessions",
         COALESCE(SUM(t.duration), 0) AS "totalHours",
         COALESCE(SUM(t.cost), 0) AS "totalCost",
         ROUND(AVG(tp.score), 1) AS "avgScore"
       FROM training_participants tp
       JOIN training_programs t ON t.id = tp."trainingId"
       WHERE t."companyId" = $1
         AND DATE(t."startDate") BETWEEN $2::date AND $3::date`,
      [cid, dateFrom, dateTo]
    ).catch(() => [{}]);

    const byProgram = await rawQuery<any>(
      `SELECT
         t.title AS "programName",
         t.type,
         COUNT(tp."employeeId") AS participants,
         COALESCE(t.duration, 0) AS "totalHours",
         COALESCE(t.cost, 0) AS cost,
         ROUND(AVG(tp.score), 1) AS "avgScore",
         ROUND(COALESCE(t.cost, 0) / NULLIF(COUNT(tp."employeeId"), 0), 0) AS "costPerParticipant"
       FROM training_programs t
       LEFT JOIN training_participants tp ON tp."trainingId" = t.id
       WHERE t."companyId" = $1 AND DATE(t."startDate") BETWEEN $2::date AND $3::date
       GROUP BY t.id, t.title, t.type, t.cost
       ORDER BY cost DESC
       LIMIT 20`,
      [cid, dateFrom, dateTo]
    ).catch(() => []);

    res.json({
      summary: {
        trainedEmployees: Number(summary?.trainedEmployees ?? 0),
        totalSessions: Number(summary?.totalSessions ?? 0),
        totalHours: Number(summary?.totalHours ?? 0),
        totalCost: Number(summary?.totalCost ?? 0),
        avgScore: Number(summary?.avgScore ?? 0),
        costPerEmployee: Number(summary?.trainedEmployees ?? 0) > 0
          ? Math.round(Number(summary?.totalCost ?? 0) / Number(summary?.trainedEmployees ?? 1)) : 0,
      },
      byProgram,
      period: { from: dateFrom, to: dateTo },
    });
  } catch (err) { handleRouteError(err, res, "Training ROI report"); }
});

router.get("/ai-insights", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const { priority, limit: limitParam } = req.query as any;
    const pageSize = Math.min(Number(limitParam) || 50, 100);

    const conditions = [`sa."companyId" = $1`, `sa."isDismissed" = false`];
    const params: any[] = [cid];

    if (priority && ["urgent", "warning", "info"].includes(priority)) {
      params.push(priority);
      conditions.push(`sa.severity = $${params.length}`);
    }

    const alerts = await rawQuery<any>(
      `SELECT sa.id, sa.type, sa.title, sa.description AS message, sa.severity, sa."createdAt",
              sa."relatedType", sa."relatedId", sa."isDismissed", sa."isRead",
              sa."suggestedAction"
       FROM smart_alerts sa
       WHERE ${conditions.join(" AND ")}
       ORDER BY
         CASE sa.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
         sa."createdAt" DESC
       LIMIT $${params.length + 1}`,
      [...params, pageSize]
    ).catch(() => []);

    const proactive = await rawQuery<any>(
      `SELECT al.id, al."automationType", al."triggerReason", al."actionTaken",
              al."entityType", al."entityId", al.status, al."createdAt"
       FROM automation_logs al
       WHERE al."companyId" = $1
       ORDER BY al."createdAt" DESC
       LIMIT 20`,
      [cid]
    ).catch(() => []);

    const [counts] = await rawQuery<any>(
      `SELECT
         COUNT(*) FILTER (WHERE severity = 'critical' AND "isDismissed" = false) AS critical,
         COUNT(*) FILTER (WHERE severity = 'warning' AND "isDismissed" = false) AS warning,
         COUNT(*) FILTER (WHERE severity = 'info' AND "isDismissed" = false) AS info,
         COUNT(*) FILTER (WHERE "isDismissed" = false) AS total
       FROM smart_alerts WHERE "companyId" = $1`,
      [cid]
    ).catch(() => [{}]);

    res.json({
      alerts,
      proactiveActions: proactive,
      counts: {
        critical: Number(counts?.critical ?? 0),
        warning: Number(counts?.warning ?? 0),
        info: Number(counts?.info ?? 0),
        total: Number(counts?.total ?? 0),
      },
    });
  } catch (err) { handleRouteError(err, res, "AI insights"); }
});

router.patch("/ai-insights/:id/dismiss", requirePermission("bi:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    await rawExecute(
      `UPDATE smart_alerts SET "isDismissed" = true WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "bi.insight.dismissed", entity: "smart_alerts", entityId: id, details: JSON.stringify({ isDismissed: true }) }).catch(console.error);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "ai_insights", entityId: id, after: { isDismissed: true } }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Dismiss insight"); }
});

router.patch("/ai-insights/:id/read", requirePermission("bi:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    await rawExecute(
      `UPDATE smart_alerts SET "isRead" = true WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "bi.insight.read", entity: "smart_alerts", entityId: id, details: JSON.stringify({ isRead: true }) }).catch(console.error);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "ai_insights", entityId: id, after: { isRead: true } }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Mark insight read"); }
});

router.get("/alert-fatigue/settings", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT * FROM alert_fatigue_settings WHERE "assignmentId" = $1`,
      [scope.activeAssignmentId]
    ).catch(() => []);
    res.json({ data: rows });
  } catch (err) { handleRouteError(err, res, "Alert fatigue settings"); }
});

router.post("/alert-fatigue/mute", requirePermission("bi:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed_muteAlertSchema = muteAlertSchema.safeParse(req.body);
    if (!parsed_muteAlertSchema.success) throw new ValidationError(parsed_muteAlertSchema.error.errors[0]?.message ?? "بيانات غير صالحة");
    const body = parsed_muteAlertSchema.data;
    const { alertType, muteUntil, reason } = body;

    await rawExecute(
      `INSERT INTO alert_mute_rules ("companyId", "assignmentId", "alertType", "muteUntil", reason, "createdAt")
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT ("assignmentId", "alertType") DO UPDATE
         SET "muteUntil" = $4, reason = $5, "updatedAt" = NOW()`,
      [scope.companyId, scope.activeAssignmentId, alertType, muteUntil || null, reason || null]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "bi.alert.muted", entity: "alert_mute_rules", entityId: 0, details: JSON.stringify({ alertType, muteUntil }) }).catch(console.error);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "alert_mute_rules", entityId: 0, after: { alertType, muteUntil, reason } }).catch(console.error);
    res.json({ success: true, message: `تم كتم تنبيهات "${alertType}"` });
  } catch (err) { handleRouteError(err, res, "Mute alert type"); }
});

router.delete("/alert-fatigue/mute/:alertType", requirePermission("bi:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { alertType } = req.params;
    await rawExecute(
      `DELETE FROM alert_mute_rules WHERE "assignmentId" = $1 AND "alertType" = $2 AND "companyId" = $3`,
      [scope.activeAssignmentId, alertType, scope.companyId]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "bi.alert.unmuted", entity: "alert_mute_rules", entityId: 0, details: JSON.stringify({ alertType }) }).catch(console.error);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "alert_mute_rules", entityId: 0, after: { alertType } }).catch(console.error);
    res.json({ success: true });
  } catch (err) { handleRouteError(err, res, "Unmute alert type"); }
});

router.get("/alert-fatigue/daily-count", requirePermission("bi:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(
      `SELECT COUNT(*) AS today_count FROM notifications
       WHERE "assignmentId" = $1 AND DATE("createdAt") = CURRENT_DATE`,
      [scope.activeAssignmentId]
    ).catch(() => [{ today_count: 0 }]);
    const limit = 50;
    const count = Number(row?.today_count ?? 0);
    res.json({ todayCount: count, dailyLimit: limit, isOverLimit: count >= limit });
  } catch (err) { handleRouteError(err, res, "Alert fatigue daily count"); }
});

export default router;
