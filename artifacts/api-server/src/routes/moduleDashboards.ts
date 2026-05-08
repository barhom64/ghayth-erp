import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { todayISO, currentPeriod } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const router = Router();

const safeQuery = async <T = any>(sql: string, params: any[] = [], fallback: T[] = []): Promise<T[]> => {
  try {
    return await rawQuery<T>(sql, params);
  } catch (e) {
    logger.error(e, "module dashboard query failed");
    return fallback;
  }
};

const sq1 = async (sql: string, params: any[] = [], fb: any = {}): Promise<any> => {
  const rows = await safeQuery(sql, params, [fb]);
  return rows[0] ?? fb;
};

router.get("/hr", requirePermission("hr:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const today = todayISO();

    const [employees, attendance, leaves, violations, contracts, evaluations] = await Promise.all([
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active FROM employee_assignments WHERE "companyId" = $1`, [cid]),
      sq1(`SELECT COUNT(*) FILTER (WHERE status = 'present') AS present, COUNT(*) FILTER (WHERE status = 'absent') AS absent, COUNT(*) FILTER (WHERE status = 'late') AS late, COUNT(*) FILTER (WHERE "lateMinutes" > 0) AS "lateCount", COALESCE(AVG("lateMinutes") FILTER (WHERE "lateMinutes" > 0), 0) AS "avgLateMinutes" FROM attendance WHERE "companyId" = $1 AND date = $2`, [cid, today]),
      sq1(`SELECT COUNT(*) FILTER (WHERE status = 'pending') AS pending, COUNT(*) FILTER (WHERE status = 'approved') AS approved, COUNT(*) FILTER (WHERE status = 'rejected') AS rejected FROM hr_leave_requests WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS total, COALESCE(SUM(deduction), 0) AS "totalDeductions" FROM employee_violations WHERE "companyId" = $1 AND period = $2 AND "deletedAt" IS NULL`, [cid, today.slice(0, 7)]),
      sq1(`SELECT COUNT(*) AS "expiring" FROM employee_contracts WHERE "companyId" = $1 AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days' AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS total FROM employee_kpi_snapshots WHERE "companyId" = $1 AND "snapshotDate" >= CURRENT_DATE - INTERVAL '30 days'`, [cid]),
    ]);

    const weeklyAttendance = await safeQuery(
      `SELECT date, COUNT(*) FILTER (WHERE status = 'present') AS present, COUNT(*) FILTER (WHERE status = 'absent') AS absent, COUNT(*) FILTER (WHERE status = 'late') AS late FROM attendance WHERE "companyId" = $1 AND date >= CURRENT_DATE - INTERVAL '7 days' GROUP BY date ORDER BY date`, [cid]
    );

    res.json({
      employees: { total: Number(employees?.total ?? 0), active: Number(employees?.active ?? 0) },
      attendance: {
        present: Number(attendance?.present ?? 0), absent: Number(attendance?.absent ?? 0),
        late: Number(attendance?.late ?? 0), lateCount: Number(attendance?.lateCount ?? 0),
        avgLateMinutes: Math.round(Number(attendance?.avgLateMinutes ?? 0)),
      },
      leaves: { pending: Number(leaves?.pending ?? 0), approved: Number(leaves?.approved ?? 0), rejected: Number(leaves?.rejected ?? 0) },
      violations: { total: Number(violations?.total ?? 0), totalDeductions: Number(violations?.totalDeductions ?? 0) },
      expiringContracts: Number(contracts?.expiring ?? 0),
      evaluations: Number(evaluations?.total ?? 0),
      weeklyAttendance,
    });
  } catch (err) {
    handleRouteError(err, res, "لوحة مؤشرات HR");
  }
});

router.get("/finance", requirePermission("finance:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const monthStart = currentPeriod() + "-01";

    const [invoices, expenses, receivables, budgets] = await Promise.all([
      sq1(`SELECT COALESCE(SUM(total), 0) AS "totalRevenue", COALESCE(SUM("paidAmount"), 0) AS "totalPaid", COALESCE(SUM(total - "paidAmount"), 0) AS "outstanding", COUNT(*) AS count, COUNT(*) FILTER (WHERE status = 'overdue') AS overdue, COUNT(*) FILTER (WHERE status = 'paid') AS paid FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count FROM expense_claims WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "createdAt" >= $2`, [cid, monthStart]),
      sq1(`SELECT COALESCE(SUM(total - "paidAmount"), 0) AS amount, COUNT(*) AS count FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status IN ('sent','partial','overdue') AND "dueDate" < CURRENT_DATE`, [cid]),
      sq1(`SELECT COUNT(*) AS total, 0 AS "avgUsage" FROM budget_lines bl JOIN chart_of_accounts ca ON ca.id = bl."accountId" WHERE ca."companyId" = $1`, [cid]),
    ]);

    const monthlyRevenue = await safeQuery(
      `SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month, COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM("paidAmount"), 0) AS collected FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "createdAt" >= CURRENT_DATE - INTERVAL '6 months' GROUP BY month ORDER BY month`, [cid]
    );

    const costCenters = await safeQuery(
      `SELECT ca.code, ca.name, COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit FROM chart_of_accounts ca LEFT JOIN (SELECT jl."accountCode", jl.debit, jl.credit FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId" AND je."companyId" = $1 AND je."deletedAt" IS NULL) jl ON jl."accountCode" = ca.code WHERE ca."companyId" = $1 AND ca.type = 'expense' GROUP BY ca.code, ca.name ORDER BY debit DESC LIMIT 10`, [cid]
    );

    res.json({
      revenue: { total: Number(invoices?.totalRevenue ?? 0), paid: Number(invoices?.totalPaid ?? 0), outstanding: Number(invoices?.outstanding ?? 0) },
      invoices: { count: Number(invoices?.count ?? 0), overdue: Number(invoices?.overdue ?? 0), paid: Number(invoices?.paid ?? 0) },
      expenses: { monthTotal: Number(expenses?.total ?? 0), monthCount: Number(expenses?.count ?? 0) },
      receivables: { amount: Number(receivables?.amount ?? 0), count: Number(receivables?.count ?? 0) },
      budgets: { total: Number(budgets?.total ?? 0), avgUsage: Math.round(Number(budgets?.avgUsage ?? 0)) },
      monthlyRevenue,
      costCenters,
    });
  } catch (err) {
    handleRouteError(err, res, "لوحة مؤشرات المالية");
  }
});

router.get("/fleet", requirePermission("fleet:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [vehicles, trips, maintenance, fuel] = await Promise.all([
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active' OR status = 'available') AS active, COUNT(*) FILTER (WHERE status = 'in_use') AS "inUse", COUNT(*) FILTER (WHERE status = 'needs_service') AS "needsService", COUNT(*) FILTER (WHERE status = 'out_of_service') AS "outOfService" FROM fleet_vehicles WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'in_progress') AS active, COUNT(*) FILTER (WHERE status = 'completed') AS completed, COALESCE(SUM(distance), 0) AS "totalDistance", COALESCE(SUM(cost), 0) AS "totalCost" FROM fleet_trips WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'pending' OR status = 'scheduled') AS pending, COALESCE(SUM(cost), 0) AS "totalCost" FROM fleet_maintenance WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COALESCE(SUM("totalCost"), 0) AS "totalCost", COALESCE(SUM(liters), 0) AS "totalLiters" FROM fleet_fuel_logs WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
    ]);

    const monthlyTrips = await safeQuery(
      `SELECT TO_CHAR(DATE_TRUNC('month', "startTime"), 'YYYY-MM') AS month, COUNT(*) AS trips, COALESCE(SUM(distance), 0) AS distance, COALESCE(SUM(cost), 0) AS cost FROM fleet_trips WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "startTime" >= CURRENT_DATE - INTERVAL '6 months' GROUP BY month ORDER BY month`, [cid]
    );

    res.json({
      vehicles: { total: Number(vehicles?.total ?? 0), active: Number(vehicles?.active ?? 0), inUse: Number(vehicles?.inUse ?? 0), needsService: Number(vehicles?.needsService ?? 0), outOfService: Number(vehicles?.outOfService ?? 0) },
      trips: { total: Number(trips?.total ?? 0), active: Number(trips?.active ?? 0), completed: Number(trips?.completed ?? 0), totalDistance: Number(trips?.totalDistance ?? 0), totalCost: Number(trips?.totalCost ?? 0) },
      maintenance: { total: Number(maintenance?.total ?? 0), pending: Number(maintenance?.pending ?? 0), totalCost: Number(maintenance?.totalCost ?? 0) },
      fuel: { totalCost: Number(fuel?.totalCost ?? 0), totalLiters: Number(fuel?.totalLiters ?? 0) },
      monthlyTrips,
    });
  } catch (err) {
    handleRouteError(err, res, "لوحة مؤشرات النقليات");
  }
});

router.get("/legal", requirePermission("legal:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [contracts, cases, sessions] = await Promise.all([
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active, COUNT(*) FILTER (WHERE status = 'active' AND "endDate"::date - CURRENT_DATE <= 30) AS "expiringSoon", COALESCE(SUM(value), 0) AS "totalValue" FROM legal_contracts WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'open') AS open, COUNT(*) FILTER (WHERE status = 'in_progress') AS "inProgress", COUNT(*) FILTER (WHERE priority = 'high') AS "highPriority" FROM legal_cases WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS upcoming FROM legal_sessions ls JOIN legal_cases lc ON lc.id = ls."caseId" WHERE lc."companyId" = $1 AND lc."deletedAt" IS NULL AND ls."deletedAt" IS NULL AND ls."sessionDate" >= CURRENT_DATE AND ls."sessionDate" <= CURRENT_DATE + INTERVAL '30 days'`, [cid]),
    ]);

    const casesByStatus = await safeQuery(
      `SELECT status, COUNT(*) AS count FROM legal_cases WHERE "companyId" = $1 AND "deletedAt" IS NULL GROUP BY status`, [cid]
    );

    res.json({
      contracts: { total: Number(contracts?.total ?? 0), active: Number(contracts?.active ?? 0), expiringSoon: Number(contracts?.expiringSoon ?? 0), totalValue: Number(contracts?.totalValue ?? 0) },
      cases: { total: Number(cases?.total ?? 0), open: Number(cases?.open ?? 0), inProgress: Number(cases?.inProgress ?? 0), highPriority: Number(cases?.highPriority ?? 0) },
      upcomingSessions: Number(sessions?.upcoming ?? 0),
      casesByStatus,
    });
  } catch (err) {
    handleRouteError(err, res, "لوحة مؤشرات القانونية");
  }
});

router.get("/properties", requirePermission("property:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [units, rentalContracts, payments, maintenanceReqs] = await Promise.all([
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'available') AS available, COUNT(*) FILTER (WHERE status = 'rented') AS rented, COUNT(*) FILTER (WHERE status = 'maintenance') AS "underMaintenance" FROM property_units WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active, COUNT(*) FILTER (WHERE "endDate"::date - CURRENT_DATE <= 30 AND status = 'active') AS "expiringSoon", COALESCE(SUM("monthlyRent"), 0) AS "monthlyIncome" FROM rental_contracts WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COALESCE(SUM(amount), 0) AS "totalDue", COALESCE(SUM("paidAmount"), 0) AS "totalCollected", COUNT(*) FILTER (WHERE status = 'pending' AND "dueDate" < CURRENT_DATE) AS overdue FROM rent_payments rp JOIN rental_contracts rc ON rc.id = rp."contractId" WHERE rc."companyId" = $1 AND rc."deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status NOT IN ('completed','closed')) AS open, COUNT(*) FILTER (WHERE priority = 'critical') AS critical FROM maintenance_requests WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
    ]);

    const occupancyRate = Number(units?.total ?? 0) > 0
      ? Math.round((Number(units?.rented ?? 0) / Number(units.total)) * 100) : 0;

    res.json({
      units: { total: Number(units?.total ?? 0), available: Number(units?.available ?? 0), rented: Number(units?.rented ?? 0), underMaintenance: Number(units?.underMaintenance ?? 0) },
      contracts: { total: Number(rentalContracts?.total ?? 0), active: Number(rentalContracts?.active ?? 0), expiringSoon: Number(rentalContracts?.expiringSoon ?? 0), monthlyIncome: Number(rentalContracts?.monthlyIncome ?? 0) },
      payments: {
        totalDue: Number(payments?.totalDue ?? 0), totalCollected: Number(payments?.totalCollected ?? 0),
        overdue: Number(payments?.overdue ?? 0),
        collectionRate: Number(payments?.totalDue ?? 0) > 0 ? Math.round((Number(payments?.totalCollected ?? 0) / Number(payments.totalDue)) * 100) : 0,
      },
      maintenance: { total: Number(maintenanceReqs?.total ?? 0), open: Number(maintenanceReqs?.open ?? 0), critical: Number(maintenanceReqs?.critical ?? 0) },
      occupancyRate,
    });
  } catch (err) {
    handleRouteError(err, res, "لوحة مؤشرات الأملاك");
  }
});

router.get("/projects", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [projects, budgetInfo, tasks] = await Promise.all([
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active' OR status = 'in_progress') AS active, COUNT(*) FILTER (WHERE status = 'completed') AS completed, COUNT(*) FILTER (WHERE status = 'active' AND "endDate" < CURRENT_DATE) AS delayed, COALESCE(AVG(progress), 0) AS "avgProgress" FROM projects WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COALESCE(SUM(budget), 0) AS "totalBudget", COALESCE(SUM("spentAmount"), 0) AS "totalSpent", COUNT(*) FILTER (WHERE budget > 0 AND "spentAmount" >= budget * 0.8) AS "overBudget" FROM projects WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'done') AS done, COUNT(*) FILTER (WHERE status = 'blocked') AS blocked, COUNT(*) FILTER (WHERE status NOT IN ('done','cancelled') AND "dueDate" < CURRENT_DATE) AS overdue FROM project_tasks pt JOIN projects p ON p.id = pt."projectId" WHERE p."companyId" = $1 AND p."deletedAt" IS NULL`, [cid]),
    ]);

    const budgetVariance = Number(budgetInfo?.totalBudget ?? 0) > 0
      ? Math.round(((Number(budgetInfo.totalBudget) - Number(budgetInfo.totalSpent)) / Number(budgetInfo.totalBudget)) * 100) : 0;

    const projectProgress = await safeQuery(
      `SELECT id, name, progress, budget, "spentAmount", status, "startDate", "endDate" FROM projects WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status IN ('active','in_progress') ORDER BY "endDate" ASC LIMIT 10`, [cid]
    );

    res.json({
      projects: { total: Number(projects?.total ?? 0), active: Number(projects?.active ?? 0), completed: Number(projects?.completed ?? 0), delayed: Number(projects?.delayed ?? 0), avgProgress: Math.round(Number(projects?.avgProgress ?? 0)) },
      budget: { totalBudget: Number(budgetInfo?.totalBudget ?? 0), totalSpent: Number(budgetInfo?.totalSpent ?? 0), overBudget: Number(budgetInfo?.overBudget ?? 0), variance: budgetVariance },
      tasks: { total: Number(tasks?.total ?? 0), done: Number(tasks?.done ?? 0), blocked: Number(tasks?.blocked ?? 0), overdue: Number(tasks?.overdue ?? 0) },
      projectProgress,
    });
  } catch (err) {
    handleRouteError(err, res, "لوحة مؤشرات المشاريع");
  }
});

router.get("/crm", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [opportunities, contacts, activities] = await Promise.all([
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'open') AS open, COUNT(*) FILTER (WHERE status = 'won') AS won, COUNT(*) FILTER (WHERE status = 'lost') AS lost, COALESCE(SUM(value), 0) AS "totalValue", COALESCE(SUM(value) FILTER (WHERE status = 'won'), 0) AS "wonValue" FROM crm_opportunities WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS total FROM crm_contacts WHERE "companyId" = $1`, [cid]),
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE a."completedAt" IS NOT NULL) AS completed, COUNT(*) FILTER (WHERE a."completedAt" IS NULL) AS pending FROM crm_activities a JOIN crm_opportunities o ON o.id = a."opportunityId" WHERE o."companyId" = $1 AND o."deletedAt" IS NULL`, [cid]),
    ]);

    const pipeline = await safeQuery(
      `SELECT ps.name, ps."order", COUNT(o.id) AS count, COALESCE(SUM(o.value), 0) AS value FROM crm_pipeline_stages ps LEFT JOIN crm_opportunities o ON o."pipelineStageId" = ps.id AND o."companyId" = $1 WHERE ps."companyId" = $1 GROUP BY ps.id, ps.name, ps."order" ORDER BY ps."order"`, [cid]
    );

    res.json({
      opportunities: { total: Number(opportunities?.total ?? 0), open: Number(opportunities?.open ?? 0), won: Number(opportunities?.won ?? 0), lost: Number(opportunities?.lost ?? 0), totalValue: Number(opportunities?.totalValue ?? 0), wonValue: Number(opportunities?.wonValue ?? 0) },
      contacts: { total: Number(contacts?.total ?? 0) },
      activities: { total: Number(activities?.total ?? 0), completed: Number(activities?.completed ?? 0), pending: Number(activities?.pending ?? 0) },
      pipeline,
    });
  } catch (err) {
    handleRouteError(err, res, "لوحة مؤشرات CRM");
  }
});

router.get("/store", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [orders, products, revenue] = await Promise.all([
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'pending') AS pending, COUNT(*) FILTER (WHERE status = 'completed') AS completed, COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled FROM store_orders WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE "isActive" = true) AS active FROM store_products WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COALESCE(SUM("totalAmount"), 0) AS "totalRevenue", COALESCE(SUM("totalAmount") FILTER (WHERE status = 'completed'), 0) AS "completedRevenue" FROM store_orders WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
    ]);

    const monthlyOrders = await safeQuery(
      `SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month, COUNT(*) AS orders, COALESCE(SUM("totalAmount"), 0) AS revenue FROM store_orders WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "createdAt" >= CURRENT_DATE - INTERVAL '6 months' GROUP BY month ORDER BY month`, [cid]
    );

    res.json({
      orders: { total: Number(orders?.total ?? 0), pending: Number(orders?.pending ?? 0), completed: Number(orders?.completed ?? 0), cancelled: Number(orders?.cancelled ?? 0) },
      products: { total: Number(products?.total ?? 0), active: Number(products?.active ?? 0) },
      revenue: { total: Number(revenue?.totalRevenue ?? 0), completed: Number(revenue?.completedRevenue ?? 0) },
      monthlyOrders,
    });
  } catch (err) {
    handleRouteError(err, res, "لوحة مؤشرات المتجر");
  }
});

router.get("/support", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [tickets, sla] = await Promise.all([
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'open') AS open, COUNT(*) FILTER (WHERE status = 'in_progress') AS "inProgress", COUNT(*) FILTER (WHERE status = 'resolved' OR status = 'closed') AS resolved, COUNT(*) FILTER (WHERE priority = 'critical' OR priority = 'high') AS "highPriority", COALESCE(AVG(EXTRACT(EPOCH FROM (COALESCE("resolvedAt", NOW()) - "createdAt")) / 3600) FILTER (WHERE status IN ('resolved','closed')), 0) AS "avgResolutionHours" FROM support_tickets WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) FILTER (WHERE "slaBreached" = true) AS breached, COUNT(*) AS total FROM support_tickets WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "createdAt" >= CURRENT_DATE - INTERVAL '30 days'`, [cid]),
    ]);

    const byCategory = await safeQuery(
      `SELECT COALESCE(category, 'غير مصنف') AS category, COUNT(*) AS count FROM support_tickets WHERE "companyId" = $1 AND "deletedAt" IS NULL GROUP BY category ORDER BY count DESC LIMIT 10`, [cid]
    );

    const weeklyTickets = await safeQuery(
      `SELECT DATE("createdAt") AS date, COUNT(*) AS created, COUNT(*) FILTER (WHERE status IN ('resolved','closed')) AS resolved FROM support_tickets WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "createdAt" >= CURRENT_DATE - INTERVAL '7 days' GROUP BY date ORDER BY date`, [cid]
    );

    res.json({
      tickets: { total: Number(tickets?.total ?? 0), open: Number(tickets?.open ?? 0), inProgress: Number(tickets?.inProgress ?? 0), resolved: Number(tickets?.resolved ?? 0), highPriority: Number(tickets?.highPriority ?? 0), avgResolutionHours: Math.round(Number(tickets?.avgResolutionHours ?? 0)) },
      sla: { breached: Number(sla?.breached ?? 0), total: Number(sla?.total ?? 0), compliance: Number(sla?.total ?? 0) > 0 ? Math.round(((Number(sla.total) - Number(sla.breached)) / Number(sla.total)) * 100) : 100 },
      byCategory,
      weeklyTickets,
    });
  } catch (err) {
    handleRouteError(err, res, "لوحة مؤشرات الدعم الفني");
  }
});

router.get("/tasks", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [taskStats] = await Promise.all([
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'todo' OR status = 'pending') AS pending, COUNT(*) FILTER (WHERE status = 'in_progress') AS "inProgress", COUNT(*) FILTER (WHERE status = 'done' OR status = 'completed') AS completed, COUNT(*) FILTER (WHERE status NOT IN ('done','completed','cancelled') AND "scheduledDate" < CURRENT_DATE) AS overdue, COUNT(*) FILTER (WHERE priority = 'high' OR priority = 'critical') AS "highPriority" FROM tasks WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
    ]);

    const byPriority = await safeQuery(
      `SELECT COALESCE(priority, 'normal') AS priority, COUNT(*) AS count FROM tasks WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status NOT IN ('done','completed','cancelled') GROUP BY priority`, [cid]
    );

    const weeklyCompleted = await safeQuery(
      `SELECT DATE("completedAt") AS date, COUNT(*) AS count FROM tasks WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status IN ('done','completed') AND "completedAt" >= CURRENT_DATE - INTERVAL '7 days' GROUP BY date ORDER BY date`, [cid]
    );

    res.json({
      tasks: { total: Number(taskStats?.total ?? 0), pending: Number(taskStats?.pending ?? 0), inProgress: Number(taskStats?.inProgress ?? 0), completed: Number(taskStats?.completed ?? 0), overdue: Number(taskStats?.overdue ?? 0), highPriority: Number(taskStats?.highPriority ?? 0) },
      byPriority,
      weeklyCompleted,
    });
  } catch (err) {
    handleRouteError(err, res, "لوحة مؤشرات المهام");
  }
});

router.get("/warehouse", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;

    const [products, movements, lowStock] = await Promise.all([
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'active') AS active, COALESCE(SUM("currentStock"), 0) AS "totalQty", COALESCE(SUM("currentStock" * COALESCE("costPrice", 0)), 0) AS "totalValue" FROM warehouse_products WHERE "companyId" = $1 AND "deletedAt" IS NULL`, [cid]),
      sq1(`SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE type = 'in') AS "inCount", COUNT(*) FILTER (WHERE type = 'out') AS "outCount", COALESCE(SUM(quantity) FILTER (WHERE type = 'in'), 0) AS "inQty", COALESCE(SUM(quantity) FILTER (WHERE type = 'out'), 0) AS "outQty" FROM warehouse_movements WHERE "companyId" = $1 AND "createdAt" >= CURRENT_DATE - INTERVAL '30 days'`, [cid]),
      sq1(`SELECT COUNT(*) AS count FROM warehouse_products WHERE "companyId" = $1 AND "deletedAt" IS NULL AND "currentStock" <= COALESCE("minStock", 0) AND "currentStock" >= 0`, [cid]),
    ]);

    const categories = await safeQuery(
      `SELECT wc.name, COUNT(wp.id) AS "productCount", COALESCE(SUM(wp."currentStock"), 0) AS "totalQty" FROM warehouse_categories wc LEFT JOIN warehouse_products wp ON wp."categoryId" = wc.id AND wp."companyId" = $1 AND wp."deletedAt" IS NULL WHERE wc."companyId" = $1 GROUP BY wc.id, wc.name ORDER BY "productCount" DESC LIMIT 10`, [cid]
    );

    const recentMovements = await safeQuery(
      `SELECT DATE("createdAt") AS date, COUNT(*) FILTER (WHERE type = 'in') AS "inCount", COUNT(*) FILTER (WHERE type = 'out') AS "outCount" FROM warehouse_movements WHERE "companyId" = $1 AND "createdAt" >= CURRENT_DATE - INTERVAL '7 days' GROUP BY date ORDER BY date`, [cid]
    );

    res.json({
      products: { total: Number(products?.total ?? 0), active: Number(products?.active ?? 0), totalQty: Number(products?.totalQty ?? 0), totalValue: Number(products?.totalValue ?? 0) },
      movements: { total: Number(movements?.total ?? 0), inCount: Number(movements?.inCount ?? 0), outCount: Number(movements?.outCount ?? 0), inQty: Number(movements?.inQty ?? 0), outQty: Number(movements?.outQty ?? 0) },
      lowStock: Number(lowStock?.count ?? 0),
      categories,
      recentMovements,
    });
  } catch (err) {
    handleRouteError(err, res, "لوحة مؤشرات المستودعات");
  }
});

export default router;
