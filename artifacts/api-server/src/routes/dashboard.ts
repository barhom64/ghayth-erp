import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { todayISO } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

function buildFilter(scope: any, req: any, opts: { branchColumn?: string } = {}) {
  const filters = parseScopeFilters(req);
  return buildScopedWhere(scope, filters, opts);
}

function buildFilterNoBranch(scope: any, req: any) {
  const filters = parseScopeFilters(req);
  const stripped = { ...filters, branchIds: undefined };
  return buildScopedWhere(scope, stripped);
}

router.get("/", async (req, res) => {
  try {
    const scope = req.scope!;
    const today = todayISO();
    const { where, params, nextParamIndex } = buildFilter(scope, req);

    const todayIdx = nextParamIndex;
    const assignIdx = nextParamIndex + 1;
    const taskParams = [...params, today, scope.activeAssignmentId];

    const [taskStats] = await rawQuery<any>(
      `SELECT
        COUNT(*) FILTER (WHERE status IN ('pending','in_progress') AND "scheduledDate" = $${todayIdx}) AS "todayTasks",
        COUNT(*) FILTER (WHERE status IN ('pending','in_progress') AND "assignedTo" = $${assignIdx}) AS "awaitingMe",
        COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND "scheduledDate" < CURRENT_DATE) AS overdue,
        COUNT(*) FILTER (WHERE status = 'completed' AND DATE("completedAt") = $${todayIdx}) AS "completedToday",
        COUNT(*) AS total,
        ROUND(
          100.0 * COUNT(*) FILTER (WHERE status = 'completed' AND DATE("completedAt") = $${todayIdx})
          / NULLIF(COUNT(*) FILTER (WHERE "scheduledDate" = $${todayIdx}), 0), 0
        ) AS "completedPct"
       FROM tasks
       WHERE ${where}`,
      taskParams
    );

    const todayTasks = await rawQuery<any>(
      `SELECT t.id, t.title, t.status, t.priority, t."scheduledDate",
              e.name AS "assigneeName"
       FROM tasks t
       LEFT JOIN employee_assignments ea ON ea.id = t."assignedTo"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE ${where.replace(/"companyId"/g, 't."companyId"').replace(/"branchId"/g, 't."branchId"')}
         AND t."scheduledDate" = $${todayIdx}
       ORDER BY t.priority DESC, t.status ASC
       LIMIT 15`,
      [...params, today]
    );

    const { where: leaveWhere, params: leaveParams } = buildFilterNoBranch(scope, req);
    const pendingApprovals = await rawQuery<any>(
      `SELECT lr.id, e.name AS "employeeName", lt.name AS "leaveType",
              lr."startDate", lr."endDate", lr.days, lr.status, lr."createdAt"
       FROM hr_leave_requests lr
       JOIN employees e ON e.id = lr."employeeId"
       JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
       WHERE ${leaveWhere.replace(/"companyId"/g, 'lr."companyId"')} AND lr.status = 'pending'
       ORDER BY lr."createdAt" DESC
       LIMIT 10`,
      leaveParams
    );

    let pendingFinanceApprovals: any[] = [];
    try {
      const { where: fw, params: fp } = buildFilter(scope, req);
      pendingFinanceApprovals = await rawQuery<any>(
        `SELECT id, ref, title, status, "createdAt"
         FROM expense_claims
         WHERE ${fw} AND status = 'pending'
         ORDER BY "createdAt" DESC
         LIMIT 5`,
        fp
      );
    } catch (_e) { logger.error(_e, "Dashboard: failed to load pending expense claims:"); }

    let pendingPurchaseRequests: any[] = [];
    try {
      const { where: pw, params: pp } = buildFilter(scope, req);
      pendingPurchaseRequests = await rawQuery<any>(
        `SELECT id, title, status, "createdAt"
         FROM purchase_requests
         WHERE ${pw} AND status = 'pending' AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC
         LIMIT 5`,
        pp
      );
    } catch (_e) { logger.error(_e, "Dashboard: failed to load pending purchase requests:"); }

    const notifications = await rawQuery<any>(
      `SELECT id, type, title, body, priority, "isRead", "createdAt"
       FROM notifications
       WHERE "assignmentId" = $1 AND "isRead" = false
       ORDER BY "createdAt" DESC
       LIMIT 8`,
      [scope.activeAssignmentId]
    );

    res.json({
      cards: {
        todayTasks: Number(taskStats?.todayTasks ?? 0),
        awaitingMe: Number(taskStats?.awaitingMe ?? 0),
        overdue: Number(taskStats?.overdue ?? 0),
        completedToday: Number(taskStats?.completedToday ?? 0),
        completedPct: Number(taskStats?.completedPct ?? 0),
        total: Number(taskStats?.total ?? 0),
      },
      todayTasks,
      pendingApprovals,
      pendingFinanceApprovals,
      pendingPurchaseRequests,
      notifications,
      role: scope.role,
    });
  } catch (err) {
    handleRouteError(err, res, "تحميل بيانات لوحة التحكم");
  }
});

router.get("/summary", async (req, res) => {
  try {
    const scope = req.scope!;
    const today = todayISO();
    const monthStart = today.slice(0, 7) + "-01";

    const { where, params, nextParamIndex } = buildFilter(scope, req);

    const [employees] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM employee_assignments WHERE ${where} AND status = 'active'`,
      params
    );
    const { where: noBranchWhere, params: noBranchParams, nextParamIndex: noBranchNextIdx } = buildFilterNoBranch(scope, req);
    const [clients] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM clients WHERE ${noBranchWhere} AND "deletedAt" IS NULL`,
      [...noBranchParams]
    );
    const [invoices] = await rawQuery<any>(
      `SELECT
         COALESCE(SUM("paidAmount"), 0) AS revenue,
         COUNT(*) FILTER (WHERE status IN ('sent','partial','overdue')) AS pending
       FROM invoices
       WHERE ${where} AND "deletedAt" IS NULL AND DATE("createdAt") >= $${nextParamIndex}`,
      [...params, monthStart]
    );
    const [att] = await rawQuery<any>(
      `SELECT COUNT(*) AS present
       FROM attendance
       WHERE ${where} AND date = $${nextParamIndex} AND status = 'present'`,
      [...params, today]
    );
    const [tasks] = await rawQuery<any>(
      `SELECT COUNT(*) AS active
       FROM tasks
       WHERE ${where} AND status IN ('in_progress','pending')
         AND "scheduledDate" = $${nextParamIndex}`,
      [...params, today]
    );

    let vehicles = { total: 0, active: 0 };
    try {
      const [v] = await rawQuery<any>(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='active') AS active FROM fleet_vehicles WHERE ${where}`,
        [...params]
      );
      vehicles = { total: Number(v?.total ?? 0), active: Number(v?.active ?? 0) };
    } catch (_e) { logger.error(_e, "Dashboard summary: failed to load fleet vehicles:"); }

    let tickets = { open: 0, breached: 0 };
    try {
      const [t] = await rawQuery<any>(
        `SELECT COUNT(*) FILTER (WHERE status='open') AS open, COUNT(*) FILTER (WHERE status='open' AND "slaDeadline" < NOW()) AS breached FROM support_tickets WHERE ${noBranchWhere} AND "deletedAt" IS NULL`,
        [...noBranchParams]
      );
      tickets = { open: Number(t?.open ?? 0), breached: Number(t?.breached ?? 0) };
    } catch (_e) { logger.error(_e, "Dashboard summary: failed to load support tickets:"); }

    let projects = { active: 0, total: 0 };
    try {
      const [p] = await rawQuery<any>(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status='in_progress') AS active FROM projects WHERE ${noBranchWhere} AND "deletedAt" IS NULL`,
        [...noBranchParams]
      );
      projects = { total: Number(p?.total ?? 0), active: Number(p?.active ?? 0) };
    } catch (_e) { logger.error(_e, "Dashboard summary: failed to load projects:"); }

    let contracts = { active: 0, expiringSoon: 0 };
    try {
      const [c] = await rawQuery<any>(
        `SELECT COUNT(*) FILTER (WHERE status='active') AS active, COUNT(*) FILTER (WHERE status='active' AND "endDate"::date - CURRENT_DATE <= 30) AS "expiringSoon" FROM legal_contracts WHERE ${noBranchWhere} AND "deletedAt" IS NULL`,
        [...noBranchParams]
      );
      contracts = { active: Number(c?.active ?? 0), expiringSoon: Number(c?.expiringSoon ?? 0) };
    } catch (_e) { logger.error(_e, "Dashboard summary: failed to load contracts:"); }

    let opportunities = { total: 0, value: 0 };
    try {
      const [o] = await rawQuery<any>(
        `SELECT COUNT(*) AS total, COALESCE(SUM(value),0) AS value FROM crm_opportunities WHERE ${noBranchWhere} AND "deletedAt" IS NULL AND stage NOT IN ('lost','won')`,
        [...noBranchParams]
      );
      opportunities = { total: Number(o?.total ?? 0), value: Number(o?.value ?? 0) };
    } catch (_e) { logger.error(_e, "Dashboard summary: failed to load CRM opportunities:"); }

    let warehouseAlerts = 0;
    try {
      const [w] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM warehouse_products WHERE ${where} AND status='active' AND "deletedAt" IS NULL AND "currentStock" <= "minStock"`,
        [...params]
      );
      warehouseAlerts = Number(w?.total ?? 0);
    } catch (_e) { logger.error(_e, "Dashboard summary: failed to load warehouse alerts:"); }

    let pendingLeaveRequests = 0;
    try {
      const [lr] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM hr_leave_requests WHERE ${noBranchWhere} AND status = 'pending'`,
        [...noBranchParams]
      );
      pendingLeaveRequests = Number(lr?.total ?? 0);
    } catch (_e) { logger.error(_e, "Dashboard summary: failed to load pending leave requests:"); }

    res.json({
      totalEmployees: Number(employees?.total ?? 0),
      totalClients: Number(clients?.total ?? 0),
      totalRevenue: Number(invoices?.revenue ?? 0),
      pendingInvoices: Number(invoices?.pending ?? 0),
      activeTasksToday: Number(tasks?.active ?? 0),
      presentToday: Number(att?.present ?? 0),
      vehicles,
      tickets,
      projects,
      contracts,
      opportunities,
      warehouseAlerts,
      pendingLeaveRequests,
    });
  } catch (err) {
    handleRouteError(err, res, "تحميل ملخص لوحة التحكم");
  }
});

// Role-specific data for dashboard
router.get("/role-data", async (req, res) => {
  try {
    const scope = req.scope!;
    const { where, params } = buildFilter(scope, req);
    const role = scope.role;
    const result: any = { role };

    if (["hr_manager", "general_manager", "owner"].includes(role)) {
      const [onboarding] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM tasks WHERE ${where} AND category = 'onboarding' AND status != 'completed'`, params
      ).catch(() => [{ total: 0 }]);
      const probationRows = await rawQuery<any>(
        `SELECT e.name, ec."probationEndDate"
         FROM employee_contracts ec
         JOIN employees e ON e.id = ec."employeeId"
         WHERE ec."companyId" = ANY($1::int[]) AND ec."probationEndDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
         LIMIT 10`,
        [scope.allowedCompanies]
      ).catch(() => []);
      const [expiringDocs] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM employee_documents WHERE "companyId" = ANY($1::int[]) AND "expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
        [scope.allowedCompanies]
      ).catch(() => [{ total: 0 }]);
      result.hr = {
        pendingOnboarding: Number(onboarding?.total ?? 0),
        probationEnding: probationRows,
        expiringDocuments: Number(expiringDocs?.total ?? 0),
      };
    }

    if (["finance_manager", "general_manager", "owner"].includes(role)) {
      const [overdueInvoices] = await rawQuery<any>(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total - "paidAmount"), 0) AS amount
         FROM invoices WHERE ${where} AND "deletedAt" IS NULL AND status IN ('overdue','sent') AND "dueDate" < CURRENT_DATE`, params
      ).catch(() => [{ count: 0, amount: 0 }]);
      const [advancedCollection] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM invoice_collection_stages ics
         JOIN invoices i ON i.id = ics."invoiceId" AND i."deletedAt" IS NULL
         WHERE i."companyId" = ANY($1::int[]) AND ics.stage >= 4`,
        [scope.allowedCompanies]
      ).catch(() => [{ total: 0 }]);
      const [budgetUsage] = await rawQuery<any>(
        `SELECT COALESCE(AVG(CASE WHEN b."totalAmount" > 0 THEN (COALESCE(bl_used.total,0)::numeric / b."totalAmount") * 100 ELSE 0 END), 0) AS avg
         FROM budgets b
         LEFT JOIN LATERAL (SELECT COALESCE(SUM(bl.amount),0) AS total FROM budget_lines bl WHERE bl."budgetId" = b.id) bl_used ON TRUE
         WHERE b."companyId" = ANY($1::int[]) AND b."deletedAt" IS NULL AND b.status = 'active'`,
        [scope.allowedCompanies]
      ).catch(() => [{ avg: 0 }]);
      result.finance = {
        overdueCount: Number(overdueInvoices?.count ?? 0),
        overdueAmount: Number(overdueInvoices?.amount ?? 0),
        advancedCollectionCount: Number(advancedCollection?.total ?? 0),
        avgBudgetUsage: Math.round(Number(budgetUsage?.avg ?? 0)),
      };
    }

    if (["branch_manager", "general_manager", "owner"].includes(role)) {
      const [teamTasks] = await rawQuery<any>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND "scheduledDate" < CURRENT_DATE) AS overdue
         FROM tasks WHERE ${where}`, params
      ).catch(() => [{ total: 0, completed: 0, overdue: 0 }]);
      result.manager = {
        teamTasksTotal: Number(teamTasks?.total ?? 0),
        teamTasksCompleted: Number(teamTasks?.completed ?? 0),
        teamTasksOverdue: Number(teamTasks?.overdue ?? 0),
      };
    }

    res.json(result);
  } catch (err) {
    handleRouteError(err, res, "تحميل بيانات الصلاحية في لوحة التحكم");
  }
});

router.get("/charts/revenue", async (req, res) => {
  try {
    const scope = req.scope!;
    const { where, params } = buildFilter(scope, req);
    const rows = await rawQuery<any>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month_key,
         COALESCE(SUM(total), 0) AS revenue,
         COALESCE(SUM("paidAmount"), 0) AS paid
       FROM invoices
       WHERE ${where} AND "deletedAt" IS NULL
         AND "createdAt" >= (CURRENT_DATE - INTERVAL '6 months')
       GROUP BY month_key
       ORDER BY month_key`,
      params
    );
    const monthNames: Record<string, string> = {
      "01": "يناير", "02": "فبراير", "03": "مارس", "04": "أبريل",
      "05": "مايو", "06": "يونيو", "07": "يوليو", "08": "أغسطس",
      "09": "سبتمبر", "10": "أكتوبر", "11": "نوفمبر", "12": "ديسمبر",
    };
    const { where: voucherWhere, params: voucherParams } = buildFilterNoBranch(scope, req);
    const expenseRows = await rawQuery<any>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', v."createdAt"), 'YYYY-MM') AS month_key,
         COALESCE(SUM(v.amount), 0) AS total
       FROM vouchers v
       WHERE ${voucherWhere.replace(/"companyId"/g, 'v."companyId"')}
         AND v.type = 'payment'
         AND v."createdAt" >= (CURRENT_DATE - INTERVAL '6 months')
       GROUP BY month_key`,
      [...voucherParams]
    ).catch(() => [] as any[]);
    const expenseMap: Record<string, number> = {};
    for (const e of expenseRows) expenseMap[e.month_key] = Number(e.total);

    const data = rows.map((r: any) => ({
      month: monthNames[r.month_key?.split("-")[1]] || r.month_key,
      revenue: Number(r.revenue),
      expenses: expenseMap[r.month_key] || 0,
    }));
    res.json({ data });
  } catch (err) {
    handleRouteError(err, res, "تحميل مخطط الإيرادات");
  }
});

router.get("/charts/attendance", async (req, res) => {
  try {
    const scope = req.scope!;
    const { where, params } = buildFilter(scope, req);
    const rows = await rawQuery<any>(
      `SELECT
         EXTRACT(DOW FROM date) AS dow,
         COUNT(*) FILTER (WHERE status = 'present') AS present,
         COUNT(*) FILTER (WHERE status = 'absent') AS absent,
         COUNT(*) FILTER (WHERE status = 'late') AS late
       FROM attendance
       WHERE ${where}
         AND date >= (CURRENT_DATE - INTERVAL '7 days')
       GROUP BY dow
       ORDER BY dow`,
      params
    );
    const dayNames: Record<number, string> = {
      0: "الأحد", 1: "الاثنين", 2: "الثلاثاء", 3: "الأربعاء",
      4: "الخميس", 5: "الجمعة", 6: "السبت",
    };
    const data = rows.map((r: any) => ({
      day: dayNames[Number(r.dow)] || `يوم ${r.dow}`,
      present: Number(r.present),
      absent: Number(r.absent),
      late: Number(r.late),
    }));
    res.json({ data });
  } catch (err) {
    handleRouteError(err, res, "تحميل مخطط الحضور");
  }
});

router.get("/charts/departments", async (req, res) => {
  try {
    const scope = req.scope!;
    const { where, params } = buildFilter(scope, req);
    const rows = await rawQuery<any>(
      `SELECT
         COALESCE(d.name, 'بدون قسم') AS name,
         COUNT(ea.id) AS value
       FROM employee_assignments ea
       LEFT JOIN departments d ON d.id = ea."departmentId"
       WHERE ${where.replace(/"companyId"/g, 'ea."companyId"').replace(/"branchId"/g, 'ea."branchId"')} AND ea.status = 'active'
       GROUP BY d.name
       ORDER BY value DESC
       LIMIT 8`,
      params
    );
    const colors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#f97316", "#ec4899"];
    const data = rows.map((r: any, i: number) => ({
      name: r.name,
      value: Number(r.value),
      color: colors[i % colors.length],
    }));
    res.json({ data });
  } catch (err) {
    handleRouteError(err, res, "Department chart error:");
  }
});

router.get("/charts/recent-events", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const companyIds = filters.companyIds?.length ? filters.companyIds : scope.allowedCompanies;
    const companyParam = companyIds.length === 1 ? companyIds[0] : companyIds;
    const companyWhere = companyIds.length === 1 ? `"companyId" = $1` : `"companyId" = ANY($1)`;

    const events = await rawQuery<any>(
      `(SELECT 'invoice' AS type, id, 'فاتورة جديدة #' || id AS text, "createdAt"
        FROM invoices WHERE ${companyWhere} AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 3)
       UNION ALL
       (SELECT 'leave' AS type, id, 'طلب إجازة من ' || (SELECT name FROM employees WHERE id = lr."employeeId") AS text, lr."createdAt"
        FROM hr_leave_requests lr WHERE lr.${companyWhere} ORDER BY lr."createdAt" DESC LIMIT 3)
       UNION ALL
       (SELECT 'ticket' AS type, id, 'تذكرة دعم: ' || COALESCE(title, '#' || id) AS text, "createdAt"
        FROM support_tickets WHERE ${companyWhere} ORDER BY "createdAt" DESC LIMIT 3)
       UNION ALL
       (SELECT 'task' AS type, id, 'مهمة: ' || COALESCE(title, '#' || id) AS text, "createdAt"
        FROM tasks WHERE ${companyWhere} ORDER BY "createdAt" DESC LIMIT 3)
       UNION ALL
       (SELECT 'attendance' AS type, id, 'تسجيل حضور - ' || (SELECT name FROM employees e JOIN employee_assignments ea ON ea."employeeId"=e.id WHERE ea.id=a."assignmentId" LIMIT 1) AS text, "createdAt"
        FROM attendance a WHERE a.${companyWhere} ORDER BY "createdAt" DESC LIMIT 3)
       ORDER BY "createdAt" DESC
       LIMIT 10`,
      [companyParam]
    );
    const now = Date.now();
    const data = events.map((e: any) => {
      const diffMs = now - new Date(e.createdAt).getTime();
      const diffMin = Math.floor(diffMs / 60000);
      let time: string;
      if (diffMin < 1) time = "الآن";
      else if (diffMin < 60) time = `منذ ${diffMin} دقيقة`;
      else if (diffMin < 1440) time = `منذ ${Math.floor(diffMin / 60)} ساعة`;
      else time = `منذ ${Math.floor(diffMin / 1440)} يوم`;
      return { type: e.type, text: e.text || `حدث #${e.id}`, time, createdAt: e.createdAt };
    });
    res.json({ data });
  } catch (err) {
    handleRouteError(err, res, "Recent events error:");
  }
});

export default router;
