import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";

const router = Router();
router.use(authMiddleware);

router.get("/dashboards", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM bi_dashboards WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/dashboards", async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, description, layout, isDefault } = req.body;
    const r = await rawExecute(
      `INSERT INTO bi_dashboards (title, description, layout, "isDefault", "createdBy", "companyId") VALUES ($1,$2,$3,$4,$5,$6)`,
      [title, description, layout ? JSON.stringify(layout) : '{}', isDefault || false, scope.userId, scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/kpis", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM bi_kpis WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY module, name`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/kpis", async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, description, module, formula, target, currentValue, unit, frequency } = req.body;
    const r = await rawExecute(
      `INSERT INTO bi_kpis (name, description, module, formula, target, "currentValue", unit, frequency, "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [name, description, module, formula, target, currentValue, unit, frequency || "monthly", scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/reports", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM bi_reports WHERE "companyId" = $1 OR "companyId" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/reports", async (req, res) => {
  try {
    const scope = req.scope!;
    const { title, description, type, query, filters, scheduledAt } = req.body;
    const r = await rawExecute(
      `INSERT INTO bi_reports (title, description, type, query, filters, "scheduledAt", "createdBy", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [title, description, type, query, filters ? JSON.stringify(filters) : '{}', scheduledAt || null, scope.userId, scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/overview", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [row] = await rawQuery<any>(
      `SELECT
         (SELECT COUNT(*) FROM employee_assignments WHERE "companyId" = $1) AS employees,
         (SELECT COUNT(*) FROM clients WHERE "companyId" = $1) AS clients,
         (SELECT COUNT(*) FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL) AS invoices,
         (SELECT COUNT(*) FROM projects WHERE "companyId" = $1) AS projects,
         (SELECT COUNT(*) FROM fleet_vehicles WHERE "companyId" = $1) AS vehicles,
         (SELECT COUNT(*) FROM support_tickets WHERE "companyId" = $1 AND status = 'open') AS "openTickets",
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
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/operations/sla-delays", async (req, res) => {
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
      if (isNaN(depId)) { res.status(400).json({ error: "رقم القسم غير صالح" }); return; }
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

router.get("/operations/rejection-rate", async (req, res) => {
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

router.get("/operations/bottleneck", async (req, res) => {
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
      if (isNaN(depId)) { res.status(400).json({ error: "رقم القسم غير صالح" }); return; }
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

router.get("/operations/employee-productivity", async (req, res) => {
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
      if (isNaN(depId)) { res.status(400).json({ error: "رقم القسم غير صالح" }); return; }
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

router.get("/operations/approval-timeliness", async (req, res) => {
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
      if (isNaN(depId)) { res.status(400).json({ error: "رقم القسم غير صالح" }); return; }
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

router.get("/operations/avg-completion-time", async (req, res) => {
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
      if (isNaN(depId)) { res.status(400).json({ error: "رقم القسم غير صالح" }); return; }
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

router.get("/operations/trend", async (req, res) => {
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
      if (isNaN(depId)) { res.status(400).json({ error: "رقم القسم غير صالح" }); return; }
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

router.get("/admin-reports/daily", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const date = (req.query.date as string) || new Date().toISOString().split("T")[0];

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
       WHERE "companyId" = $1`,
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

router.get("/admin-reports/weekly", async (req, res) => {
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
         WHERE "companyId" = $1`,
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

    const fmt = (d: Date) => d.toISOString().split("T")[0];
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

router.get("/admin-reports/monthly", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    const fmt = (d: Date) => d.toISOString().split("T")[0];

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
         FROM support_tickets WHERE "companyId" = $1`,
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

export default router;
