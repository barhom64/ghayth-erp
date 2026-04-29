import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { handleRouteError, ForbiddenError } from "../lib/errorHandler.js";
import { todayISO } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { LEAVE_APPROVAL_ROLES, PAYROLL_ROLES, FINANCE_ROLES, PR_APPROVAL_ROLES, LETTER_APPROVAL_ROLES , ACTION_CENTER_ROLES} from "../lib/rbacCatalog.js";

const router = Router();

router.get("/", async (req, res) => {
  try {
    const scope = req.scope!;

    const allowedRoles = ACTION_CENTER_ROLES;
    if (!allowedRoles.includes(scope.role)) {
      throw new ForbiddenError("غير مصرح: هذه الصفحة للمدراء فقط");
    }

    const today = todayISO();
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);

    let pendingLeaves: any[] = [];
    if (LEAVE_APPROVAL_ROLES.includes(scope.role)) {
      try {
        pendingLeaves = await rawQuery<any>(
          `SELECT lr.id, e.name AS "employeeName", lt.name AS "leaveType",
                  lr."startDate", lr."endDate", lr.days, lr.status, lr."createdAt"
           FROM hr_leave_requests lr
           JOIN employees e ON e.id = lr."employeeId"
           JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
           LEFT JOIN leave_approval_stages las ON las."leaveRequestId" = lr.id AND las.status = 'pending'
           WHERE lr."companyId" = ANY($1::int[]) AND lr.status = 'pending'
             AND (
               $2 = 'owner'
               OR las."assignedTo" = $3
               OR (las."assignedTo" IS NULL AND las."requiredRole" = $2)
             )
           ORDER BY lr."createdAt" DESC LIMIT 20`,
          [scope.allowedCompanies, scope.role, scope.activeAssignmentId]
        );
      } catch (e) {
        logger.error(e, "Action-center pendingLeaves error");
      }
    }

    let pendingAdvances: any[] = [];
    if (PAYROLL_ROLES.includes(scope.role)) {
      try {
        pendingAdvances = await rawQuery<any>(
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
          [scope.allowedCompanies]
        );
      } catch (e) {
        logger.error(e, "Action-center pendingAdvances error");
      }
    }

    let pendingCustodies: any[] = [];
    if (FINANCE_ROLES.includes(scope.role)) {
      try {
        pendingCustodies = await rawQuery<any>(
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
          [scope.allowedCompanies]
        );
      } catch (e) {
        logger.error(e, "Action-center pendingCustodies error");
      }
    }

    let pendingLetters: any[] = [];
    if (LETTER_APPROVAL_ROLES.includes(scope.role)) {
      try {
        pendingLetters = await rawQuery<any>(
          `SELECT ol.id, e.name AS "employeeName", ol.type AS "letterType", ol.status, ol."createdAt"
           FROM official_letters ol
           JOIN employees e ON e.id = ol."employeeId"
           WHERE ol."companyId" = ANY($1::int[]) AND ol.status IN ('pending_approval','pending') AND ol."deletedAt" IS NULL
           ORDER BY ol."createdAt" DESC LIMIT 20`,
          [scope.allowedCompanies]
        );
      } catch (e) {
        logger.error(e, "Action-center pendingLetters error");
      }
    }

    let pendingPurchases: any[] = [];
    if (PR_APPROVAL_ROLES.includes(scope.role)) {
      try {
        pendingPurchases = await rawQuery<any>(
          `SELECT id, title, status, "createdAt"
           FROM purchase_requests
           WHERE "companyId" = ANY($1::int[]) AND status = 'pending' AND "deletedAt" IS NULL
           ORDER BY "createdAt" DESC LIMIT 20`,
          [scope.allowedCompanies]
        );
      } catch (e) {
        logger.error(e, "Action-center pendingPurchases error");
      }
    }

    let pendingExpenses: any[] = [];
    if (FINANCE_ROLES.includes(scope.role)) {
      try {
        pendingExpenses = await rawQuery<any>(
          `SELECT id, ref, title, status, "createdAt"
           FROM expense_claims
           WHERE "companyId" = ANY($1::int[]) AND status = 'pending'
           ORDER BY "createdAt" DESC LIMIT 20`,
          [scope.allowedCompanies]
        );
      } catch (e) {
        logger.error(e, "Action-center pendingExpenses error");
      }
    }

    let slaBreached: any[] = [];
    try {
      slaBreached = await rawQuery<any>(
        `SELECT id, title, "createdAt", "slaDeadline"
         FROM support_tickets
         WHERE "companyId" = ANY($1::int[]) AND "deletedAt" IS NULL AND status = 'open' AND "slaDeadline" < NOW()
         ORDER BY "slaDeadline" ASC LIMIT 10`,
        [scope.allowedCompanies]
      );
    } catch (e) {
      logger.error(e, "Action-center slaBreached error");
    }

    let escalations: any[] = [];
    try {
      escalations = await rawQuery<any>(
        `SELECT n.id, n.title, n.body, n.priority, n."createdAt"
         FROM notifications n
         WHERE n."assignmentId" = $1 AND n.type IN ('escalation','sla_breach','urgent') AND n."isRead" = false
         ORDER BY n."createdAt" DESC LIMIT 10`,
        [scope.activeAssignmentId]
      );
    } catch (e) {
      logger.error(e, "Action-center escalations error");
    }

    let todayTasks: any[] = [];
    try {
      const { where: tw, params: tp, nextParamIndex } = buildScopedWhere(scope, filters);
      todayTasks = await rawQuery<any>(
        `SELECT t.id, t.title, t.status, t.priority, t."scheduledDate",
                e.name AS "assigneeName"
         FROM tasks t
         LEFT JOIN employee_assignments ea ON ea.id = t."assignedTo"
         LEFT JOIN employees e ON e.id = ea."employeeId"
         WHERE ${tw.replace(/"companyId"/g, 't."companyId"').replace(/"branchId"/g, 't."branchId"')}
           AND t."scheduledDate" = $${nextParamIndex}
         ORDER BY t.priority DESC, t.status ASC
         LIMIT 15`,
        [...tp, today]
      );
    } catch (e) {
      logger.error(e, "Action-center todayTasks error");
    }

    let criticalAlerts: any[] = [];
    try {
      criticalAlerts = await rawQuery<any>(
        `SELECT id, type, title, body, priority, "createdAt"
         FROM notifications
         WHERE "assignmentId" = $1 AND priority IN ('high','urgent','critical') AND "isRead" = false
         ORDER BY "createdAt" DESC LIMIT 10`,
        [scope.activeAssignmentId]
      );
    } catch (e) {
      logger.error(e, "Action-center criticalAlerts error");
    }

    let pendingLoans: any[] = [];
    if (PAYROLL_ROLES.includes(scope.role)) {
      try {
        pendingLoans = await rawQuery<any>(
          `SELECT l.id, l."loanNumber", l."loanType", l.amount, l.status, l."createdAt",
                  e.name AS "employeeName"
           FROM hr_employee_loans l
           JOIN employee_assignments ea ON ea.id = l."assignmentId"
           JOIN employees e ON e.id = ea."employeeId"
           WHERE l."companyId" = ANY($1::int[]) AND l.status = 'pending'
           ORDER BY l."createdAt" DESC LIMIT 20`,
          [scope.allowedCompanies]
        );
      } catch (e) {
        logger.error(e, "Action-center pendingLoans error");
      }
    }

    let pendingOvertime: any[] = [];
    if (PAYROLL_ROLES.includes(scope.role)) {
      try {
        pendingOvertime = await rawQuery<any>(
          `SELECT o.id, o."requestNumber", o.hours, o."totalAmount", o.status, o."createdAt",
                  e.name AS "employeeName"
           FROM hr_overtime_requests o
           JOIN employee_assignments ea ON ea.id = o."assignmentId"
           JOIN employees e ON e.id = ea."employeeId"
           WHERE o."companyId" = ANY($1::int[]) AND o.status = 'pending'
           ORDER BY o."createdAt" DESC LIMIT 20`,
          [scope.allowedCompanies]
        );
      } catch (e) {
        logger.error(e, "Action-center pendingOvertime error");
      }
    }

    let pendingExitRequests: any[] = [];
    if (PAYROLL_ROLES.includes(scope.role)) {
      try {
        pendingExitRequests = await rawQuery<any>(
          `SELECT er.id, er."exitType", er.status, er."createdAt",
                  e.name AS "employeeName"
           FROM hr_exit_requests er
           JOIN employee_assignments ea ON ea.id = er."assignmentId"
           JOIN employees e ON e.id = ea."employeeId"
           WHERE er."companyId" = ANY($1::int[]) AND er.status = 'pending'
           ORDER BY er."createdAt" DESC LIMIT 20`,
          [scope.allowedCompanies]
        );
      } catch (e) {
        logger.error(e, "Action-center pendingExitRequests error");
      }
    }

    let pendingWorkflows: any[] = [];
    try {
      pendingWorkflows = await rawQuery<any>(
        `SELECT wi.id, wi."requestType", wi.title, wi.status, wi."slaStatus",
                wi."currentStepOrder", wi."createdAt", wi."submittedBy",
                e.name AS "submittedByName"
         FROM workflow_instances wi
         LEFT JOIN employee_assignments ea ON ea.id = wi."submittedBy"
         LEFT JOIN employees e ON e.id = ea."employeeId"
         WHERE wi."currentAssignee" = $1
           AND wi.status IN ('pending', 'in_review', 'escalated')
           AND wi."companyId" = ANY($2::int[])
           AND wi."requestType" NOT IN ('leave','purchase_request','official_letter','expense')
         ORDER BY wi."createdAt" DESC LIMIT 30`,
        [scope.activeAssignmentId, scope.allowedCompanies]
      );
    } catch (e) {
      logger.error(e, "Action-center pendingWorkflows error");
    }

    const totalPending =
      pendingLeaves.length +
      pendingAdvances.length +
      pendingCustodies.length +
      pendingLetters.length +
      pendingPurchases.length +
      pendingExpenses.length +
      pendingWorkflows.length +
      pendingLoans.length +
      pendingOvertime.length +
      pendingExitRequests.length;

    res.json({
      summary: {
        totalPending,
        slaBreachedCount: slaBreached.length,
        escalationsCount: escalations.length,
        criticalAlertsCount: criticalAlerts.length,
        workflowPendingCount: pendingWorkflows.length,
      },
      pendingLeaves,
      pendingAdvances,
      pendingCustodies,
      pendingLetters,
      pendingPurchases,
      pendingExpenses,
      pendingWorkflows,
      pendingLoans,
      pendingOvertime,
      pendingExitRequests,
      slaBreached,
      escalations,
      todayTasks,
      criticalAlerts,
      role: scope.role,
    });
  } catch (err) {
    handleRouteError(err, res, "Action-center error:");
  }
});

export default router;
