import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { handleRouteError, ForbiddenError } from "../lib/errorHandler.js";
import { todayISO } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { LEAVE_APPROVAL_ROLES, PAYROLL_ROLES, FINANCE_ROLES, PR_APPROVAL_ROLES, LETTER_APPROVAL_ROLES , ACTION_CENTER_ROLES} from "../lib/rbacCatalog.js";
import { authorize } from "../lib/rbac/authorize.js";

const router = Router();

router.get("/", authorize({ feature: "dashboard.action_center", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const allowedRoles = ACTION_CENTER_ROLES;
    if (!allowedRoles.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: هذه الصفحة للمدراء فقط");
    }

    const today = todayISO();
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);

    const safe = (p: Promise<any[]>, label: string): Promise<any[]> =>
      p.catch((e) => { logger.error(e, `Action-center ${label} error`); return []; });
    const ifRole = (roles: readonly string[], p: () => Promise<any[]>, label: string): Promise<any[]> =>
      roles.includes(scope.role) ? safe(p(), label) : Promise.resolve([]);

    const cc = scope.allowedCompanies;
    const { where: tw, params: tp, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 't."companyId"', branchColumn: 't."branchId"', enforceBranchScope: true });

    const [
      pendingLeaves, pendingAdvances, pendingCustodies, pendingLetters,
      pendingPurchases, pendingExpenses, slaBreached, escalations,
      todayTasks, criticalAlerts, pendingLoans, pendingOvertime,
      pendingExitRequests, pendingTransfers, pendingExcuses, pendingViolations,
      pendingPurchaseOrders, pendingTrainings, pendingMaintenance,
      pendingJournals, pendingInventory, pendingWorkflows,
    ] = await Promise.all([
      ifRole(LEAVE_APPROVAL_ROLES, () => rawQuery<any>(
        `SELECT lr.id, e.name AS "employeeName", lt.name AS "leaveType",
                lr."startDate", lr."endDate", lr.days, lr.status, lr."createdAt"
         FROM hr_leave_requests lr
         JOIN employees e ON e.id = lr."employeeId"
         JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
         LEFT JOIN leave_approval_stages las ON las."leaveRequestId" = lr.id AND las.status = 'pending'
         WHERE lr."companyId" = ANY($1::int[]) AND lr.status = 'pending' AND lr."deletedAt" IS NULL
           AND (
             $2 = 'owner'
             OR las."assignedTo" = $3
             OR (las."assignedTo" IS NULL AND las."requiredRole" = $2)
           )
         ORDER BY lr."createdAt" DESC LIMIT 20`,
        [cc, scope.role, scope.activeAssignmentId]
      ), "pendingLeaves"),
      ifRole(PAYROLL_ROLES, () => rawQuery<any>(
        `SELECT je.id, je.description AS reason,
                COALESCE((SELECT SUM(jl.debit) FROM journal_lines jl WHERE jl."journalId" = je.id AND jl.debit > 0), 0) AS amount,
                ea2.id IS NOT NULL AS "hasAssignment",
                COALESCE(emp.name, je.description) AS "employeeName",
                je.status, je."createdAt"
         FROM journal_entries je
         LEFT JOIN employee_assignments ea2 ON ea2.id = je."createdBy"
         LEFT JOIN employees emp ON emp.id = ea2."employeeId"
         WHERE je."companyId" = ANY($1::int[]) AND je."deletedAt" IS NULL AND je.ref LIKE 'SALARY-ADV%'
           AND je.status IN ('pending_approval','pending')
         ORDER BY je."createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingAdvances"),
      ifRole(FINANCE_ROLES, () => rawQuery<any>(
        `SELECT je.id, je.description,
                COALESCE((SELECT SUM(jl.debit) FROM journal_lines jl WHERE jl."journalId" = je.id AND jl.debit > 0), 0) AS amount,
                COALESCE(emp.name, je.description) AS "employeeName",
                je.status, je."createdAt"
         FROM journal_entries je
         LEFT JOIN employee_assignments ea2 ON ea2.id = je."createdBy"
         LEFT JOIN employees emp ON emp.id = ea2."employeeId"
         WHERE je."companyId" = ANY($1::int[]) AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%'
           AND je.status IN ('pending_approval','pending')
         ORDER BY je."createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingCustodies"),
      ifRole(LETTER_APPROVAL_ROLES, () => rawQuery<any>(
        `SELECT ol.id, e.name AS "employeeName", ol.type AS "letterType", ol.status, ol."createdAt"
         FROM official_letters ol
         JOIN employees e ON e.id = ol."employeeId"
         WHERE ol."companyId" = ANY($1::int[]) AND ol.status IN ('pending_approval','pending') AND ol."deletedAt" IS NULL
         ORDER BY ol."createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingLetters"),
      ifRole(PR_APPROVAL_ROLES, () => rawQuery<any>(
        `SELECT id, title, status, "createdAt"
         FROM purchase_requests
         WHERE "companyId" = ANY($1::int[]) AND status = 'pending'
         ORDER BY "createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingPurchases"),
      ifRole(FINANCE_ROLES, () => rawQuery<any>(
        `SELECT id, ref, title, status, "createdAt"
         FROM expense_claims
         WHERE "companyId" = ANY($1::int[]) AND status = 'pending' AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingExpenses"),
      safe(rawQuery<any>(
        `SELECT id, title, "createdAt", "slaDeadline"
         FROM support_tickets
         WHERE "companyId" = ANY($1::int[]) AND "deletedAt" IS NULL AND status = 'open' AND "slaDeadline" < NOW()
         ORDER BY "slaDeadline" ASC LIMIT 10`,
        [cc]
      ), "slaBreached"),
      safe(rawQuery<any>(
        `SELECT n.id, n.title, n.body, n.priority, n."createdAt"
         FROM notifications n
         WHERE n."assignmentId" = $1 AND n."companyId" = ANY($2::int[]) AND n.type IN ('escalation','sla_breach','urgent') AND n."isRead" = false
         ORDER BY n."createdAt" DESC LIMIT 10`,
        [scope.activeAssignmentId, cc]
      ), "escalations"),
      safe(rawQuery<any>(
        `SELECT t.id, t.title, t.status, t.priority, t."scheduledDate",
                e.name AS "assigneeName"
         FROM tasks t
         LEFT JOIN employee_assignments ea ON ea.id = t."assignedTo"
         LEFT JOIN employees e ON e.id = ea."employeeId"
         WHERE ${tw}
           AND t."deletedAt" IS NULL
           AND t."scheduledDate" = $${nextParamIndex}
         ORDER BY t.priority DESC, t.status ASC
         LIMIT 15`,
        [...tp, today]
      ), "todayTasks"),
      safe(rawQuery<any>(
        `SELECT id, type, title, body, priority, "createdAt"
         FROM notifications
         WHERE "assignmentId" = $1 AND "companyId" = ANY($2::int[]) AND priority IN ('high','urgent','critical') AND "isRead" = false
         ORDER BY "createdAt" DESC LIMIT 10`,
        [scope.activeAssignmentId, cc]
      ), "criticalAlerts"),
      ifRole(PAYROLL_ROLES, () => rawQuery<any>(
        `SELECT l.id, l."loanNumber", l."loanType", l.amount, l.status, l."createdAt",
                e.name AS "employeeName"
         FROM hr_employee_loans l
         JOIN employee_assignments ea ON ea.id = l."assignmentId"
         JOIN employees e ON e.id = ea."employeeId"
         WHERE l."companyId" = ANY($1::int[]) AND l.status = 'pending' AND l."deletedAt" IS NULL
         ORDER BY l."createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingLoans"),
      ifRole(PAYROLL_ROLES, () => rawQuery<any>(
        `SELECT o.id, o."requestNumber", o.hours, o."totalAmount", o.status, o."createdAt",
                e.name AS "employeeName"
         FROM hr_overtime_requests o
         JOIN employee_assignments ea ON ea.id = o."assignmentId"
         JOIN employees e ON e.id = ea."employeeId"
         WHERE o."companyId" = ANY($1::int[]) AND o.status = 'pending' AND o."deletedAt" IS NULL
         ORDER BY o."createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingOvertime"),
      ifRole(PAYROLL_ROLES, () => rawQuery<any>(
        `SELECT er.id, er."exitType", er.status, er."createdAt",
                e.name AS "employeeName"
         FROM hr_exit_requests er
         JOIN employee_assignments ea ON ea.id = er."assignmentId"
         JOIN employees e ON e.id = ea."employeeId"
         WHERE er."companyId" = ANY($1::int[]) AND er.status = 'pending' AND er."deletedAt" IS NULL
         ORDER BY er."createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingExitRequests"),
      ifRole(PAYROLL_ROLES, () => rawQuery<any>(
        `SELECT t.id, t.status, t."createdAt",
                e.name AS "employeeName"
         FROM employee_transfers t
         JOIN employees e ON e.id = t."employeeId"
         WHERE t."companyId" = ANY($1::int[]) AND t.status = 'pending' AND t."deletedAt" IS NULL
         ORDER BY t."createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingTransfers"),
      ifRole(LEAVE_APPROVAL_ROLES, () => rawQuery<any>(
        `SELECT er.id, er."excuseDate", er."excuseType", er.reason, er.status, er."createdAt",
                e.name AS "employeeName"
         FROM hr_excuse_requests er
         JOIN employee_assignments ea ON ea.id = er."assignmentId"
         JOIN employees e ON e.id = ea."employeeId"
         WHERE er."companyId" = ANY($1::int[]) AND er.status = 'pending' AND er."deletedAt" IS NULL
         ORDER BY er."createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingExcuses"),
      ifRole(PAYROLL_ROLES, () => rawQuery<any>(
        `SELECT dm.id, dm.status, dm."createdAt",
                e.name AS "employeeName"
         FROM hr_inquiry_memos dm
         JOIN employee_assignments ea ON ea.id = dm."assignmentId"
         JOIN employees e ON e.id = ea."employeeId"
         WHERE dm."companyId" = ANY($1::int[]) AND dm.status IN ('draft','issued','appealed','escalated','gm_review') AND dm."deletedAt" IS NULL
         ORDER BY dm."createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingViolations"),
      ifRole(FINANCE_ROLES, () => rawQuery<any>(
        `SELECT id, ref, status, "createdAt"
         FROM purchase_orders
         WHERE "companyId" = ANY($1::int[]) AND status = 'pending_approval' AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingPurchaseOrders"),
      ifRole(PAYROLL_ROLES, () => rawQuery<any>(
        `SELECT id, name AS title, status, "createdAt"
         FROM training_programs
         WHERE "companyId" = ANY($1::int[]) AND status = 'pending' AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingTrainings"),
      safe(rawQuery<any>(
        `SELECT id, title, status, priority, "createdAt"
         FROM maintenance_requests
         WHERE "companyId" = ANY($1::int[]) AND status = 'pending' AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingMaintenance"),
      ifRole(FINANCE_ROLES, () => rawQuery<any>(
        `SELECT id, ref, description, status, "createdAt"
         FROM journal_entries
         WHERE "companyId" = ANY($1::int[]) AND status = 'pending_approval' AND "deletedAt" IS NULL
           AND ref LIKE 'JV-MAN%'
         ORDER BY "createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingJournals"),
      safe(rawQuery<any>(
        `SELECT id, status, "countDate", notes, "createdAt"
         FROM inventory_counts
         WHERE "companyId" = ANY($1::int[]) AND status = 'pending_approval' AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 20`,
        [cc]
      ), "pendingInventory"),
      safe(rawQuery<any>(
        `SELECT wi.id, wi."requestType", wi.title, wi.status, wi."slaStatus",
                wi."currentStepOrder", wi."createdAt", wi."submittedBy",
                e.name AS "submittedByName"
         FROM workflow_instances wi
         LEFT JOIN employee_assignments ea ON ea.id = wi."submittedBy"
         LEFT JOIN employees e ON e.id = ea."employeeId"
         WHERE wi."currentAssignee" = $1
           AND wi.status IN ('pending', 'in_review', 'escalated')
           AND wi."deletedAt" IS NULL
           AND wi."companyId" = ANY($2::int[])
           AND wi."requestType" NOT IN ('leave','purchase_request','official_letter','expense')
         ORDER BY wi."createdAt" DESC LIMIT 30`,
        [scope.activeAssignmentId, cc]
      ), "pendingWorkflows"),
    ]);

    const totalPending =
      pendingLeaves.length + pendingAdvances.length + pendingCustodies.length +
      pendingLetters.length + pendingPurchases.length + pendingExpenses.length +
      pendingLoans.length + pendingOvertime.length + pendingExitRequests.length +
      pendingTransfers.length + pendingExcuses.length + pendingViolations.length +
      pendingPurchaseOrders.length + pendingTrainings.length + pendingMaintenance.length +
      pendingJournals.length + pendingInventory.length + pendingWorkflows.length;

    res.json({
      summary: {
        totalPending,
        slaBreachedCount: slaBreached.length,
        escalationsCount: escalations.length,
        criticalAlertsCount: criticalAlerts.length,
        workflowPendingCount: pendingWorkflows.length,
      },
      pendingLeaves, pendingAdvances, pendingCustodies, pendingLetters,
      pendingPurchases, pendingExpenses, pendingLoans, pendingOvertime,
      pendingExitRequests, pendingTransfers, pendingExcuses, pendingViolations,
      pendingPurchaseOrders, pendingTrainings, pendingMaintenance,
      pendingJournals, pendingInventory, pendingWorkflows,
      slaBreached, escalations, todayTasks, criticalAlerts,
      role: scope.role,
    });
  } catch (err) {
    handleRouteError(err, res, "Action-center error:");
  }
});

export default router;
