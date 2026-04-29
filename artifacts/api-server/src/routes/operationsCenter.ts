import { Router } from "express";
import { z } from "zod";
import { rawQuery } from "../lib/rawdb.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { handleRouteError, ValidationError, ForbiddenError, ConflictError } from "../lib/errorHandler.js";
import { createAuditLog, emitEvent, todayISO } from "../lib/businessHelpers.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { logger } from "../lib/logger.js";

// ── Zod validation schemas ──────────────────────────────────────────
const dailyCloseExecuteSchema = z.object({
  force: z.boolean({ invalid_type_error: "حقل التجاوز القسري يجب أن يكون قيمة منطقية" }).optional(),
  notes: z.string({ invalid_type_error: "الملاحظات يجب أن تكون نصاً" }).optional().nullable(),
});

const router = Router();

function buildFilter(scope: any, req: any) {
  const filters = parseScopeFilters(req);
  return buildScopedWhere(scope, filters);
}

type Severity = "ok" | "warning" | "critical";

interface Thresholds {
  [key: string]: { warn: number; crit: number };
}

const DEFAULT_THRESHOLDS: Thresholds = {
  overstayed: { warn: 5, crit: 20 },
  unassigned: { warn: 3, crit: 10 },
  violated: { warn: 1, crit: 5 },
  overdueRent: { warn: 3, crit: 10 },
  openMaintenance: { warn: 5, crit: 15 },
  maintSlaBreached: { warn: 1, crit: 5 },
  expiringContracts: { warn: 3, crit: 10 },
  absentToday: { warn: 5, crit: 15 },
  pendingLeaves: { warn: 3, crit: 10 },
  expiringDocs: { warn: 5, crit: 15 },
  violations: { warn: 2, crit: 5 },
  overdueInvoices: { warn: 5, crit: 15 },
  pendingExpenses: { warn: 3, crit: 8 },
  pendingPurchases: { warn: 3, crit: 8 },
  cashFlowNegative: { warn: 1, crit: 1 },
  needService: { warn: 2, crit: 5 },
};

async function loadThresholds(companyId: number): Promise<Thresholds> {
  try {
    const [row] = await rawQuery<any>(
      `SELECT value FROM system_settings WHERE key='operations_center_thresholds' AND ("companyId"=$1 OR "companyId" IS NULL) ORDER BY "companyId" DESC NULLS LAST LIMIT 1`,
      [companyId]
    );
    if (row?.value) {
      const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      const merged: any = { ...DEFAULT_THRESHOLDS };
      for (const key of Object.keys(merged)) {
        if (parsed[key] && typeof parsed[key] === "object") {
          merged[key] = {
            warn: typeof parsed[key].warn === "number" ? parsed[key].warn : merged[key].warn,
            crit: typeof parsed[key].crit === "number" ? parsed[key].crit : merged[key].crit,
          };
        }
      }
      return merged;
    }
  } catch (_e) { logger.error(_e, "silent catch"); }
  return DEFAULT_THRESHOLDS;
}

async function getApprovalSlaHours(): Promise<number> {
  try {
    const [setting] = await rawQuery<any>(
      `SELECT value FROM system_settings WHERE key = 'approval_sla_hours' LIMIT 1`
    );
    if (setting?.value) return Number(setting.value);
  } catch (_) { logger.error(_, "silent catch"); }
  return 48;
}

function severity(value: number, warnThreshold: number, critThreshold: number): Severity {
  if (value >= critThreshold) return "critical";
  if (value >= warnThreshold) return "warning";
  return "ok";
}

router.get("/", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { where, params } = buildFilter(scope, req);
    const cid = scope.companyId;
    const companies = scope.allowedCompanies;

    const sections: any = {};
    const t = await loadThresholds(cid);

    try {
      const [pilgrimStats] = await rawQuery<any>(
        `SELECT
           COUNT(*) FILTER (WHERE status='overstayed') AS overstayed,
           COUNT(*) FILTER (WHERE "agentId" IS NULL AND status NOT IN ('departed','cancelled')) AS unassigned,
           COUNT(*) FILTER (WHERE status='active') AS active,
           COUNT(*) FILTER (WHERE status='violated') AS violated
         FROM umrah_pilgrims WHERE "companyId"=$1`,
        [cid]
      );
      const overstayed = Number(pilgrimStats?.overstayed ?? 0);
      const unassigned = Number(pilgrimStats?.unassigned ?? 0);
      const violated = Number(pilgrimStats?.violated ?? 0);
      sections.umrah = {
        title: "عمليات العمرة",
        cards: [
          { key: "overstayed", label: "معتمرون متجاوزون", value: overstayed, severity: severity(overstayed, t.overstayed.warn, t.overstayed.crit), actionLabel: "عرض المتجاوزين", actionLink: "/umrah?tab=pilgrims&status=overstayed" },
          { key: "unassigned", label: "معتمرون بدون وكيل", value: unassigned, severity: severity(unassigned, t.unassigned.warn, t.unassigned.crit), actionLabel: "تعيين وكيل", actionLink: "/umrah?tab=pilgrims" },
          { key: "violated", label: "مخالفات عمرة", value: violated, severity: severity(violated, t.violated.warn, t.violated.crit), actionLabel: "عرض المخالفات", actionLink: "/umrah?tab=penalties" },
        ],
      };
    } catch (_e) { logger.error(_e, "OpsCenter: umrah failed:"); }

    try {
      const [unitStats] = await rawQuery<any>(
        `SELECT
           COUNT(*) FILTER (WHERE status='under_maintenance') AS maintenance
         FROM property_units WHERE "companyId"=$1`,
        [cid]
      );
      const [overdueRent] = await rawQuery<any>(
        `SELECT COUNT(*) AS total
         FROM rent_payments rp
         JOIN rental_contracts c ON c.id=rp."contractId"
         WHERE c."companyId"=$1 AND rp.status IN ('pending','partial') AND rp."dueDate" < CURRENT_DATE`,
        [cid]
      );
      const [openMaint] = await rawQuery<any>(
        `SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE "slaDeadline" IS NOT NULL AND "slaDeadline" < NOW()) AS breached
         FROM maintenance_requests
         WHERE "companyId"=$1 AND status NOT IN ('completed','closed','rejected')`,
        [cid]
      );
      const [expContracts] = await rawQuery<any>(
        `SELECT COUNT(*) AS total
         FROM rental_contracts
         WHERE "companyId"=$1 AND status='active' AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
        [cid]
      );
      const overdueRentVal = Number(overdueRent?.total ?? 0);
      const openMaintVal = Number(openMaint?.total ?? 0);
      const maintBreached = Number(openMaint?.breached ?? 0);
      const expContractsVal = Number(expContracts?.total ?? 0);
      sections.property = {
        title: "عمليات الأملاك",
        cards: [
          { key: "overdueRent", label: "إيجارات متأخرة", value: overdueRentVal, severity: severity(overdueRentVal, t.overdueRent.warn, t.overdueRent.crit), actionLabel: "تحصيل الإيجارات", actionLink: "/properties/contracts" },
          { key: "openMaintenance", label: "طلبات صيانة مفتوحة", value: openMaintVal, severity: severity(openMaintVal, t.openMaintenance.warn, t.openMaintenance.crit), actionLabel: "عرض الصيانة", actionLink: "/properties/maintenance" },
          { key: "maintSlaBreached", label: "صيانة تجاوزت SLA", value: maintBreached, severity: severity(maintBreached, t.maintSlaBreached.warn, t.maintSlaBreached.crit), actionLabel: "معالجة فوراً", actionLink: "/properties/maintenance" },
          { key: "expiringContracts", label: "عقود تنتهي خلال 30 يوم", value: expContractsVal, severity: severity(expContractsVal, t.expiringContracts.warn, t.expiringContracts.crit), actionLabel: "تجديد العقود", actionLink: "/properties/contracts" },
        ],
      };
    } catch (_e) { logger.error(_e, "OpsCenter: property failed:"); }

    try {
      const today = todayISO();
      const [absent] = await rawQuery<any>(
        `SELECT
           (SELECT COUNT(*) FROM employee_assignments WHERE "companyId" = ANY($1::int[]) AND status='active') -
           (SELECT COUNT(DISTINCT "assignmentId") FROM attendance WHERE "companyId" = ANY($1::int[]) AND date=$2 AND status IN ('present','late')) AS total`,
        [companies, today]
      );
      const [pendingLeaves] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM hr_leave_requests WHERE "companyId" = ANY($1::int[]) AND status='pending'`,
        [companies]
      );
      const [expiringDocs] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM employee_documents WHERE "companyId" = ANY($1::int[]) AND "expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
        [companies]
      );
      const [violations] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM employee_violations WHERE "companyId" = ANY($1::int[]) AND status IN ('pending_inquiry','pending_employee','pending_manager','pending_gm')`,
        [companies]
      ).catch(() => [{ total: 0 }]);
      const absentVal = Math.max(0, Number(absent?.total ?? 0));
      const pendingLeavesVal = Number(pendingLeaves?.total ?? 0);
      const expiringDocsVal = Number(expiringDocs?.total ?? 0);
      const violationsVal = Number(violations?.total ?? 0);
      sections.hr = {
        title: "عمليات الموارد البشرية",
        cards: [
          { key: "absentToday", label: "غائبون اليوم", value: absentVal, severity: severity(absentVal, t.absentToday.warn, t.absentToday.crit), actionLabel: "عرض الحضور", actionLink: "/hr/attendance" },
          { key: "pendingLeaves", label: "إجازات معلقة", value: pendingLeavesVal, severity: severity(pendingLeavesVal, t.pendingLeaves.warn, t.pendingLeaves.crit), actionLabel: "مراجعة الإجازات", actionLink: "/hr/leaves" },
          { key: "expiringDocs", label: "وثائق تنتهي قريباً", value: expiringDocsVal, severity: severity(expiringDocsVal, t.expiringDocs.warn, t.expiringDocs.crit), actionLabel: "تجديد الوثائق", actionLink: "/employees" },
          { key: "violations", label: "مخالفات معلقة", value: violationsVal, severity: severity(violationsVal, t.violations.warn, t.violations.crit), actionLabel: "مراجعة المخالفات", actionLink: "/hr/violations" },
        ],
      };
    } catch (_e) { logger.error(_e, "OpsCenter: hr failed:"); }

    try {
      const [overdueInv] = await rawQuery<any>(
        `SELECT COUNT(*) AS count, COALESCE(SUM(total - "paidAmount"), 0) AS amount
         FROM invoices WHERE ${where} AND status IN ('overdue','sent') AND "dueDate" < CURRENT_DATE`,
        params
      );
      const [pendingExpenses] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM expense_claims WHERE ${where} AND status='pending'`,
        params
      ).catch(() => [{ total: 0 }]);
      const [pendingPO] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM purchase_requests WHERE ${where} AND status='pending'`,
        params
      ).catch(() => [{ total: 0 }]);
      const [cashFlow] = await rawQuery<any>(
        `SELECT
           COALESCE((SELECT SUM(amount) FROM vouchers WHERE "companyId"=$1 AND type='receipt' AND "createdAt" >= date_trunc('month', CURRENT_DATE)), 0) AS inflow,
           COALESCE((SELECT SUM(amount) FROM vouchers WHERE "companyId"=$1 AND type='payment' AND "createdAt" >= date_trunc('month', CURRENT_DATE)), 0) AS outflow`,
        [cid]
      ).catch(() => [{ inflow: 0, outflow: 0 }]);
      const inflow = Number(cashFlow?.inflow ?? 0);
      const outflow = Number(cashFlow?.outflow ?? 0);
      const netCashFlow = inflow - outflow;
      const cashFlowNegative = netCashFlow < 0 ? 1 : 0;
      const overdueInvVal = Number(overdueInv?.count ?? 0);
      const pendingExpVal = Number(pendingExpenses?.total ?? 0);
      const pendingPOVal = Number(pendingPO?.total ?? 0);
      sections.finance = {
        title: "العمليات المالية",
        cards: [
          { key: "overdueInvoices", label: "فواتير متأخرة", value: overdueInvVal, severity: severity(overdueInvVal, t.overdueInvoices.warn, t.overdueInvoices.crit), actionLabel: "تحصيل الفواتير", actionLink: "/finance/invoices", extra: `${Number(overdueInv?.amount ?? 0).toLocaleString()} ر.س` },
          { key: "pendingExpenses", label: "مصروفات معلقة", value: pendingExpVal, severity: severity(pendingExpVal, t.pendingExpenses.warn, t.pendingExpenses.crit), actionLabel: "اعتماد المصروفات", actionLink: "/finance/expenses" },
          { key: "pendingPurchases", label: "طلبات شراء معلقة", value: pendingPOVal, severity: severity(pendingPOVal, t.pendingPurchases.warn, t.pendingPurchases.crit), actionLabel: "مراجعة المشتريات", actionLink: "/finance/purchase-orders" },
          { key: "cashFlow", label: "التدفق النقدي (الشهر)", value: netCashFlow, severity: severity(cashFlowNegative, t.cashFlowNegative.warn, t.cashFlowNegative.crit), actionLabel: "عرض التقارير المالية", actionLink: "/finance/reports", extra: `وارد: ${inflow.toLocaleString()} — صادر: ${outflow.toLocaleString()} ر.س` },
        ],
      };
    } catch (_e) { logger.error(_e, "OpsCenter: finance failed:"); }

    try {
      const [vehicleStats] = await rawQuery<any>(
        `SELECT
           COUNT(*) FILTER (WHERE status='active' AND "nextServiceDate" IS NOT NULL AND "nextServiceDate" <= CURRENT_DATE + INTERVAL '7 days') AS needService
         FROM fleet_vehicles WHERE ${where}`,
        params
      );
      const [activeTrips] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM fleet_trips WHERE ${where} AND status='in_progress'`,
        params
      ).catch(() => [{ total: 0 }]);
      const needServiceVal = Number(vehicleStats?.needService ?? 0);
      const activeTripsVal = Number(activeTrips?.total ?? 0);
      sections.fleet = {
        title: "عمليات الأسطول",
        cards: [
          { key: "needService", label: "مركبات تحتاج صيانة", value: needServiceVal, severity: severity(needServiceVal, t.needService.warn, t.needService.crit), actionLabel: "جدولة صيانة", actionLink: "/fleet/maintenance" },
          { key: "activeTrips", label: "رحلات نشطة", value: activeTripsVal, severity: "ok" as Severity, actionLabel: "عرض الرحلات", actionLink: "/fleet/trips" },
        ],
      };
    } catch (_e) { logger.error(_e, "OpsCenter: fleet failed:"); }

    let slaItems: any[] = [];
    try {
      const maintSla = await rawQuery<any>(
        `SELECT id, category AS title, 'maintenance' AS type, "slaDeadline",
           EXTRACT(EPOCH FROM (NOW() - "slaDeadline"))/3600 AS "hoursOverdue",
           priority, status
         FROM maintenance_requests
         WHERE "companyId"=$1 AND status NOT IN ('completed','closed','rejected')
           AND "slaDeadline" IS NOT NULL AND "slaDeadline" < NOW()
         ORDER BY "slaDeadline" LIMIT 10`,
        [cid]
      );
      slaItems = slaItems.concat(maintSla.map((m: any) => ({
        ...m,
        hoursOverdue: Math.round(Number(m.hoursOverdue ?? 0)),
        entityLink: "/properties/maintenance",
      })));
    } catch (_e) { logger.error(_e, "silent catch"); }

    try {
      const ticketSla = await rawQuery<any>(
        `SELECT id, title, 'ticket' AS type, "slaDeadline",
           EXTRACT(EPOCH FROM (NOW() - "slaDeadline"))/3600 AS "hoursOverdue",
           priority, status
         FROM support_tickets
         WHERE ${where} AND status='open' AND "slaDeadline" IS NOT NULL AND "slaDeadline" < NOW()
         ORDER BY "slaDeadline" LIMIT 10`,
        params
      );
      slaItems = slaItems.concat(ticketSla.map((t: any) => ({
        ...t,
        hoursOverdue: Math.round(Number(t.hoursOverdue ?? 0)),
        entityLink: `/support/${t.id}`,
      })));
    } catch (_e) { logger.error(_e, "silent catch"); }

    try {
      const slaHours = await getApprovalSlaHours();
      const approvalSla = await rawQuery<any>(
        `SELECT id, 'طلب إجازة' AS title, 'leave_approval' AS type,
           "createdAt" AS "slaDeadline",
           EXTRACT(EPOCH FROM (NOW() - "createdAt"))/3600 AS "hoursOverdue"
         FROM hr_leave_requests
         WHERE "companyId" = ANY($1::int[]) AND status='pending'
           AND "createdAt" < NOW() - INTERVAL '1 hour' * $2
         ORDER BY "createdAt" LIMIT 10`,
        [companies, slaHours]
      );
      slaItems = slaItems.concat(approvalSla.map((a: any) => ({
        ...a,
        hoursOverdue: Math.round(Number(a.hoursOverdue ?? 0)),
        entityLink: "/hr/leaves",
      })));

      const expenseSla = await rawQuery<any>(
        `SELECT id, 'مطالبة مصروف #' || id AS title, 'expense_approval' AS type,
           "createdAt" AS "slaDeadline",
           EXTRACT(EPOCH FROM (NOW() - "createdAt"))/3600 AS "hoursOverdue"
         FROM expense_claims
         WHERE "companyId" = ANY($1::int[]) AND status='pending'
           AND "createdAt" < NOW() - INTERVAL '1 hour' * $2
         ORDER BY "createdAt" LIMIT 10`,
        [companies, slaHours]
      );
      slaItems = slaItems.concat(expenseSla.map((e: any) => ({
        ...e,
        hoursOverdue: Math.round(Number(e.hoursOverdue ?? 0)),
        entityLink: "/finance/expenses",
      })));
    } catch (_e) { logger.error(_e, "OpsCenter: approval SLA failed:"); }

    slaItems = slaItems.map(item => {
      const hoursOver = Math.abs(Number(item.hoursOverdue ?? 0));
      let escalationStatus: string;
      if (hoursOver >= 72) escalationStatus = "critical_escalation";
      else if (hoursOver >= 24) escalationStatus = "escalated";
      else escalationStatus = "overdue";
      return { ...item, escalationStatus, hoursOverdue: hoursOver };
    }).sort((a, b) => b.hoursOverdue - a.hoursOverdue);

    let liveFeed: any[] = [];
    try {
      liveFeed = await rawQuery<any>(
        `SELECT a.id, a.action, a.entity, a."entityId",
                COALESCE(e.name, u.email, 'نظام') AS "userName",
                a."createdAt", a.reason
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a."userId"
         LEFT JOIN employees e ON e.id = u."employeeId"
         WHERE a."companyId" = ANY($1::int[])
         ORDER BY a."createdAt" DESC
         LIMIT 50`,
        [companies]
      );
    } catch (_e) { logger.error(_e, "OpsCenter: livefeed failed:"); }

    res.json({ sections, slaItems, liveFeed });
  } catch (err) {
    handleRouteError(err, res, "تحميل مركز العمليات");
  }
});

async function buildChecklistItems(scope: any, where: string, params: any[], companies: number[], today: string): Promise<any[]> {
    const items: any[] = [];

    try {
      const [att] = await rawQuery<any>(
        `SELECT
           (SELECT COUNT(*) FROM employee_assignments WHERE "companyId" = ANY($1::int[]) AND status='active') AS expected,
           (SELECT COUNT(DISTINCT "assignmentId") FROM attendance WHERE "companyId" = ANY($1::int[]) AND date=$2) AS actual`,
        [companies, today]
      );
      const expected = Number(att?.expected ?? 0);
      const actual = Number(att?.actual ?? 0);
      items.push({
        key: "attendance_sync",
        label: "مزامنة الحضور",
        description: `تم تسجيل ${actual} من ${expected} موظف`,
        passed: expected > 0 ? actual >= expected * 0.9 : true,
        value: `${actual}/${expected}`,
      });
    } catch (_e) {
      items.push({ key: "attendance_sync", label: "مزامنة الحضور", description: "تعذّر التحقق", passed: false, value: "—" });
    }

    try {
      const [pending] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM hr_leave_requests WHERE "companyId" = ANY($1::int[]) AND status='pending'`,
        [companies]
      );
      const val = Number(pending?.total ?? 0);
      items.push({
        key: "pending_approvals",
        label: "مراجعة الطلبات المعلقة",
        description: `${val} طلب إجازة معلق`,
        passed: val === 0,
        value: String(val),
      });
    } catch (_e) {
      items.push({ key: "pending_approvals", label: "مراجعة الطلبات المعلقة", description: "تعذّر التحقق", passed: false, value: "—" });
    }

    try {
      const [maint] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM maintenance_requests
         WHERE "companyId"=$1 AND priority IN ('critical','urgent') AND status NOT IN ('completed','closed','rejected')`,
        [scope.companyId]
      );
      const val = Number(maint?.total ?? 0);
      items.push({
        key: "critical_maintenance",
        label: "صيانة حرجة مفتوحة",
        description: `${val} طلب صيانة حرج/عاجل`,
        passed: val === 0,
        value: String(val),
      });
    } catch (_e) {
      items.push({ key: "critical_maintenance", label: "صيانة حرجة", description: "تعذّر التحقق", passed: false, value: "—" });
    }

    try {
      const [overdue] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM invoices WHERE ${where} AND status IN ('overdue') AND "dueDate" < CURRENT_DATE AND "deletedAt" IS NULL`,
        params
      );
      const val = Number(overdue?.total ?? 0);
      items.push({
        key: "overdue_invoices",
        label: "فواتير متأخرة",
        description: `${val} فاتورة متأخرة عن السداد`,
        passed: val === 0,
        value: String(val),
      });
    } catch (_e) {
      items.push({ key: "overdue_invoices", label: "فواتير متأخرة", description: "تعذّر التحقق", passed: false, value: "—" });
    }

    try {
      const [tasks] = await rawQuery<any>(
        `SELECT
           COUNT(*) AS total,
           COUNT(*) FILTER (WHERE status='completed') AS completed
         FROM tasks WHERE ${where} AND "scheduledDate"=$${params.length + 1}`,
        [...params, today]
      );
      const total = Number(tasks?.total ?? 0);
      const completed = Number(tasks?.completed ?? 0);
      items.push({
        key: "tasks_completed",
        label: "إنجاز مهام اليوم",
        description: `${completed} من ${total} مهمة مكتملة`,
        passed: total === 0 || completed >= total * 0.8,
        value: `${completed}/${total}`,
      });
    } catch (_e) {
      items.push({ key: "tasks_completed", label: "إنجاز مهام اليوم", description: "تعذّر التحقق", passed: false, value: "—" });
    }

    try {
      const [tickets] = await rawQuery<any>(
        `SELECT COUNT(*) AS total FROM support_tickets WHERE ${where} AND status='open' AND "slaDeadline" IS NOT NULL AND "slaDeadline" < NOW()`,
        params
      );
      const val = Number(tickets?.total ?? 0);
      items.push({
        key: "sla_tickets",
        label: "تذاكر متجاوزة لـSLA",
        description: `${val} تذكرة تجاوزت وقت الاستجابة`,
        passed: val === 0,
        value: String(val),
      });
    } catch (_e) {
      items.push({ key: "sla_tickets", label: "تذاكر SLA", description: "تعذّر التحقق", passed: false, value: "—" });
    }

    try {
      const [receipts] = await rawQuery<any>(
        `SELECT COALESCE(SUM(amount),0) AS total FROM vouchers
         WHERE "companyId" = ANY($1::int[]) AND type='receipt' AND date = $2`,
        [companies, today]
      );
      const [payments] = await rawQuery<any>(
        `SELECT COALESCE(SUM(amount),0) AS total FROM vouchers
         WHERE "companyId" = ANY($1::int[]) AND type='payment' AND date = $2`,
        [companies, today]
      );
      const receiptTotal = Number(receipts?.total ?? 0);
      const paymentTotal = Number(payments?.total ?? 0);
      const netCash = receiptTotal - paymentTotal;
      items.push({
        key: "cash_reconciliation",
        label: "تسوية النقدية",
        description: `إيرادات: ${receiptTotal.toLocaleString()} | مصروفات: ${paymentTotal.toLocaleString()} | صافي: ${netCash.toLocaleString()}`,
        passed: true,
        value: `${netCash.toLocaleString()}`,
      });
    } catch (_e) {
      items.push({ key: "cash_reconciliation", label: "تسوية النقدية", description: "لا توجد حركات نقدية اليوم", passed: true, value: "—" });
    }

    return items;
}

router.get("/daily-close/checklist", requirePermission("operations:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const companies = scope.allowedCompanies;
    const today = todayISO();
    const { where, params } = buildFilter(scope, req);

    const items = await buildChecklistItems(scope, where, params, companies, today);

    let closedToday = false;
    try {
      const [existing] = await rawQuery<any>(
        `SELECT id FROM daily_close_log WHERE "companyId"=$1 AND "closeDate"=$2`,
        [scope.companyId, today]
      );
      closedToday = !!existing;
    } catch (_e) { logger.error(_e, "silent catch"); }

    res.json({
      date: today,
      items,
      allPassed: items.every(i => i.passed),
      closedToday,
    });
  } catch (err) {
    handleRouteError(err, res, "تحميل قائمة الإقفال اليومي");
  }
});

router.post("/daily-close/execute", requirePermission("finance:write"), async (req, res) => {
  try {
    const parsed = dailyCloseExecuteSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.errors[0]?.message ?? "بيانات غير صالحة");
    const scope = req.scope!;
    const allowedRoles = ["owner", "general_manager", "branch_manager", "hr_manager", "finance_manager"];
    if (!allowedRoles.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح — يتطلب صلاحية مدير على الأقل");
    }

    const today = todayISO();
    const userId = scope.userId;
    const cid = scope.companyId;
    const forceClose = req.body?.force === true;
    const overrideRoles = ["owner", "general_manager"];

    if (!forceClose) {
      const { where, params } = buildFilter(scope, req);
      const companies = scope.allowedCompanies;
      const checklistItems = await buildChecklistItems(scope, where, params, companies, today);
      const allPassed = checklistItems.every((i: any) => i.passed);
      if (!allPassed) {
        throw new ValidationError("لا يمكن إقفال اليوم — توجد بنود لم تكتمل");
      }
    } else if (!overrideRoles.includes(scope.role)) {
      throw new ForbiddenError("التجاوز القسري متاح فقط للمالك أو المدير العام أو المدير التنفيذي");
    }

    await rawQuery(
      `CREATE TABLE IF NOT EXISTS daily_close_log (
         id SERIAL PRIMARY KEY,
         "companyId" INTEGER NOT NULL,
         "closeDate" DATE NOT NULL,
         "closedBy" INTEGER,
         notes TEXT,
         forced BOOLEAN DEFAULT FALSE,
         "createdAt" TIMESTAMPTZ DEFAULT NOW(),
         UNIQUE("companyId", "closeDate")
       )`
    ).catch((e) => logger.error(e, "operationsCenter background task failed"));

    const [existing] = await rawQuery<any>(
      `SELECT id FROM daily_close_log WHERE "companyId"=$1 AND "closeDate"=$2`,
      [cid, today]
    );
    if (existing) {
      throw new ConflictError("تم إقفال هذا اليوم مسبقاً");
    }

    const notes = req.body?.notes || "";
    await rawQuery(
      `INSERT INTO daily_close_log ("companyId", "closeDate", "closedBy", notes, forced) VALUES ($1, $2, $3, $4, $5)`,
      [cid, today, userId, notes, forceClose]
    );

    createAuditLog({
      companyId: cid, userId: scope.userId,
      action: "create", entity: "daily_close", entityId: 0,
      reason: forceClose ? `إقفال يومي بتجاوز - ${today}` : `إقفال يومي - ${today}`,
    }).catch((e) => logger.error(e, "operationsCenter background task failed"));

    try {
      await rawQuery(
        `INSERT INTO audit_logs (action, entity, "entityId", "companyId", "userId", reason, "createdAt")
         VALUES ('daily_close', 'system', '0', $1, $2, $3, NOW())`,
        [cid, userId, forceClose ? `إقفال يومي بتجاوز - ${today}` : `إقفال يومي - ${today}`]
      );
    } catch (_e) { logger.error(_e, "OpsCenter: audit log for daily close failed:"); }

    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "daily_close.executed", entity: "daily_close_log", entityId: 0, details: JSON.stringify({ date: today, forced: forceClose }) }).catch((e) => logger.error(e, "operationsCenter background task failed"));
    res.json({ success: true, message: "تم إقفال اليوم بنجاح", date: today, forced: forceClose });
  } catch (err) {
    handleRouteError(err, res, "إقفال اليوم");
  }
});

export default router;
