import { Router } from "express";
import { rawQuery } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { todayISO, currentPeriod, currentYear, toDateISO } from "../lib/businessHelpers.js";

const router = Router();
router.use(authMiddleware);

router.get("/", async (req, res) => {
  try {
    const scope = req.scope!;
    const today = todayISO();
    const year = currentYear();
    const period = today.slice(0, 7);

    const [attendance] = await rawQuery<any>(
      `SELECT id, date, "checkIn", "checkOut", "lateMinutes", status
       FROM attendance
       WHERE "assignmentId" = $1 AND date = $2`,
      [scope.activeAssignmentId, today]
    ).catch((e) => { console.error("my-space attendance error:", e); return [null]; });

    let leaveBalances: any[] = [];
    try {
      const balancesFromTable = await rawQuery<any>(
        `SELECT lb."leaveTypeId", lt.name, lb.entitled, lb.used, lb.reserved, lb.remaining
         FROM hr_leave_balances lb
         JOIN hr_leave_types lt ON lt.id = lb."leaveTypeId"
         WHERE lb."companyId" = $1 AND lb."employeeId" = $2 AND lb.year = $3`,
        [scope.companyId, scope.employeeId, year]
      );
      if (balancesFromTable.length > 0) {
        leaveBalances = balancesFromTable.map((b: any) => ({
          leaveTypeId: b.leaveTypeId,
          name: b.name,
          entitled: Number(b.entitled),
          used: Number(b.used),
          remaining: Number(b.remaining),
        }));
      } else {
        const computed = await rawQuery<any>(
          `SELECT lt.id AS "leaveTypeId", lt.name, lt."annualDays" AS entitled,
                  COALESCE(SUM(lr.days) FILTER (
                    WHERE lr.status = 'approved' AND EXTRACT(YEAR FROM lr."startDate") = $3
                  ), 0) AS used
           FROM hr_leave_types lt
           LEFT JOIN hr_leave_requests lr ON lr."leaveTypeId" = lt.id AND lr."employeeId" = $2
           WHERE lt."companyId" = $1
           GROUP BY lt.id, lt.name, lt."annualDays"`,
          [scope.companyId, scope.employeeId, year]
        );
        leaveBalances = computed.map((b: any) => ({
          leaveTypeId: b.leaveTypeId,
          name: b.name,
          entitled: Number(b.entitled ?? 21),
          used: Number(b.used),
          remaining: Number(b.entitled ?? 21) - Number(b.used),
        }));
      }
    } catch (e) {
      console.error("my-space leaveBalances error:", e);
    }

    let openRequests: any[] = [];
    try {
      const leaveReqs = await rawQuery<any>(
        `SELECT lr.id, 'leave' AS type, lt.name AS title, lr.status, lr."createdAt"
         FROM hr_leave_requests lr
         JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
         WHERE lr."employeeId" = $1 AND lr.status IN ('pending','under_review')
         ORDER BY lr."createdAt" DESC LIMIT 10`,
        [scope.employeeId]
      ).catch((e) => { console.error("my-space leaveReqs error:", e); return []; });

      let advanceReqs: any[] = [];
      try {
        advanceReqs = await rawQuery<any>(
          `SELECT je.id, 'salary_advance' AS type, 'سلفة راتب' AS title, je.status, je."createdAt"
           FROM journal_entries je
           WHERE je."createdBy" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'SALARY-ADV%'
             AND je.status IN ('pending','pending_approval')
           ORDER BY je."createdAt" DESC LIMIT 5`,
          [scope.activeAssignmentId]
        );
      } catch (e) {
        console.error("my-space advanceReqs error:", e);
      }

      let letterReqs: any[] = [];
      try {
        letterReqs = await rawQuery<any>(
          `SELECT ol.id, 'letter' AS type, ol.type AS title, ol.status, ol."createdAt"
           FROM official_letters ol
           WHERE ol."employeeId" = $1 AND ol.status IN ('pending','pending_approval')
           ORDER BY ol."createdAt" DESC LIMIT 5`,
          [scope.employeeId]
        );
      } catch (e) {
        console.error("my-space letterReqs error:", e);
      }

      let custodyReqs: any[] = [];
      try {
        custodyReqs = await rawQuery<any>(
          `SELECT je.id, 'custody' AS type, je.description AS title, je.status, je."createdAt"
           FROM journal_entries je
           WHERE je."createdBy" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%'
             AND je.status IN ('pending','pending_approval')
           ORDER BY je."createdAt" DESC LIMIT 5`,
          [scope.activeAssignmentId]
        );
      } catch (e) {
        console.error("my-space custodyReqs error:", e);
      }

      let loanReqs: any[] = [];
      try {
        loanReqs = await rawQuery<any>(
          `SELECT id, 'loan' AS type, CONCAT('سلفة ', "loanNumber") AS title, status, "createdAt"
           FROM hr_employee_loans
           WHERE "assignmentId" = $1 AND status IN ('pending') AND "deletedAt" IS NULL
           ORDER BY "createdAt" DESC LIMIT 5`,
          [scope.activeAssignmentId]
        );
      } catch (e) {
        console.error("my-space loanReqs error:", e);
      }

      let overtimeReqs: any[] = [];
      try {
        overtimeReqs = await rawQuery<any>(
          `SELECT id, 'overtime' AS type, CONCAT('وقت إضافي ', "requestNumber") AS title, status, "createdAt"
           FROM hr_overtime_requests
           WHERE "assignmentId" = $1 AND status IN ('pending') AND "deletedAt" IS NULL
           ORDER BY "createdAt" DESC LIMIT 5`,
          [scope.activeAssignmentId]
        );
      } catch (e) {
        console.error("my-space overtimeReqs error:", e);
      }

      let exitReqs: any[] = [];
      try {
        exitReqs = await rawQuery<any>(
          `SELECT id, 'exit' AS type, CONCAT('نهاية خدمة #', id) AS title, status, "createdAt"
           FROM hr_exit_requests
           WHERE "assignmentId" = $1 AND status IN ('pending','in_progress') AND "deletedAt" IS NULL
           ORDER BY "createdAt" DESC LIMIT 5`,
          [scope.activeAssignmentId]
        );
      } catch (e) {
        console.error("my-space exitReqs error:", e);
      }

      openRequests = [...leaveReqs, ...advanceReqs, ...letterReqs, ...custodyReqs, ...loanReqs, ...overtimeReqs, ...exitReqs]
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } catch (e) {
      console.error("my-space openRequests error:", e);
    }

    let pendingApprovals: any[] = [];
    try {
      if (scope.role !== "employee") {
        const leaveApprovals = await rawQuery<any>(
          `SELECT lr.id, 'leave' AS type, e.name AS "employeeName", lt.name AS title, lr.status, lr."createdAt"
           FROM hr_leave_requests lr
           JOIN employees e ON e.id = lr."employeeId"
           JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
           LEFT JOIN leave_approval_stages las ON las."leaveRequestId" = lr.id AND las.status = 'pending'
           WHERE lr."companyId" = $1 AND lr.status = 'pending'
             AND (
               $2 = 'owner'
               OR las."assignedTo" = $3
               OR (las."assignedTo" IS NULL AND las."requiredRole" = $2)
             )
           ORDER BY lr."createdAt" DESC LIMIT 10`,
          [scope.companyId, scope.role, scope.activeAssignmentId]
        ).catch((e) => { console.error("my-space leaveApprovals error:", e); return []; });

        let loanApprovals: any[] = [];
        try {
          loanApprovals = await rawQuery<any>(
            `SELECT l.id, 'loan' AS type, e.name AS "employeeName",
                    CONCAT('سلفة ', l."loanNumber", ' — ', l.amount, ' ر.س') AS title,
                    l.status, l."createdAt"
             FROM hr_employee_loans l
             JOIN employees e ON e.id = l."employeeId"
             WHERE l."companyId" = $1 AND l.status = 'pending' AND l."deletedAt" IS NULL
             ORDER BY l."createdAt" DESC LIMIT 5`,
            [scope.companyId]
          );
        } catch (e) { console.error("my-space loanApprovals error:", e); }

        let overtimeApprovals: any[] = [];
        try {
          overtimeApprovals = await rawQuery<any>(
            `SELECT o.id, 'overtime' AS type, e.name AS "employeeName",
                    CONCAT('وقت إضافي ', o."requestNumber", ' — ', o.hours, ' ساعة') AS title,
                    o.status, o."createdAt"
             FROM hr_overtime_requests o
             JOIN employees e ON e.id = o."employeeId"
             WHERE o."companyId" = $1 AND o.status = 'pending' AND o."deletedAt" IS NULL
             ORDER BY o."createdAt" DESC LIMIT 5`,
            [scope.companyId]
          );
        } catch (e) { console.error("my-space overtimeApprovals error:", e); }

        let exitApprovals: any[] = [];
        try {
          exitApprovals = await rawQuery<any>(
            `SELECT x.id, 'exit' AS type, e.name AS "employeeName",
                    CONCAT('نهاية خدمة #', x.id) AS title,
                    x.status, x."createdAt"
             FROM hr_exit_requests x
             JOIN employees e ON e.id = x."employeeId"
             WHERE x."companyId" = $1 AND x.status = 'pending' AND x."deletedAt" IS NULL
             ORDER BY x."createdAt" DESC LIMIT 5`,
            [scope.companyId]
          );
        } catch (e) { console.error("my-space exitApprovals error:", e); }

        pendingApprovals = [...leaveApprovals, ...loanApprovals, ...overtimeApprovals, ...exitApprovals]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }
    } catch (e) {
      console.error("my-space pendingApprovals error:", e);
    }

    let documents: any[] = [];
    try {
      documents = await rawQuery<any>(
        `SELECT id, type, name, "expiryDate", "createdAt"
         FROM employee_documents
         WHERE "employeeId" = $1
         ORDER BY "createdAt" DESC LIMIT 10`,
        [scope.employeeId]
      );
    } catch (e) {
      console.error("my-space documents error:", e);
    }

    let lastPayslip: any = null;
    try {
      const [ps] = await rawQuery<any>(
        `SELECT pl.id, pr.period,
                pl.basic AS "basicSalary",
                (COALESCE(pl."housingAllowance",0) + COALESCE(pl."transportAllowance",0) + COALESCE(pl.overtime,0)) AS "totalAllowances",
                (COALESCE(pl.gosi,0) + COALESCE(pl."lateDeduction",0) + COALESCE(pl."absenceDeduction",0) + COALESCE(pl."violationDeduction",0) + COALESCE(pl."loanDeduction",0)) AS "totalDeductions",
                pl."netSalary",
                pr.status
         FROM payroll_lines pl
         JOIN payroll_runs pr ON pr.id = pl."runId"
         WHERE pl."assignmentId" = $1 AND pl."deletedAt" IS NULL AND pr."deletedAt" IS NULL
         ORDER BY pr.period DESC LIMIT 1`,
        [scope.activeAssignmentId]
      );
      lastPayslip = ps || null;
    } catch (e) {
      console.error("my-space lastPayslip error:", e);
    }

    let todayTasks: any[] = [];
    try {
      todayTasks = await rawQuery<any>(
        `SELECT id, title, status, priority, "scheduledDate"
         FROM tasks
         WHERE "assignedTo" = $1 AND "scheduledDate" = $2 AND status NOT IN ('completed','cancelled')
         ORDER BY priority DESC LIMIT 10`,
        [scope.activeAssignmentId, today]
      );
    } catch (e) {
      console.error("my-space todayTasks error:", e);
    }

    let notifications: any[] = [];
    try {
      notifications = await rawQuery<any>(
        `SELECT id, type, title, body, priority, "isRead", "createdAt"
         FROM notifications
         WHERE "assignmentId" = $1
         ORDER BY "createdAt" DESC LIMIT 10`,
        [scope.activeAssignmentId]
      );
    } catch (e) {
      console.error("my-space notifications error:", e);
    }

    let custodies: any[] = [];
    try {
      custodies = await rawQuery<any>(
        `SELECT je.id, je.description,
                COALESCE((SELECT SUM(jl.debit) FROM journal_lines jl WHERE jl."journalId" = je.id AND jl.debit > 0), 0) AS amount,
                je.status, je."createdAt"
         FROM journal_entries je
         WHERE je."createdBy" = $1 AND je."deletedAt" IS NULL AND je.ref LIKE 'CUSTODY%'
           AND je.status IN ('approved','pending','pending_approval')
         ORDER BY je."createdAt" DESC LIMIT 10`,
        [scope.activeAssignmentId]
      );
    } catch (e) {
      console.error("my-space custodies error:", e);
    }

    let violations: any[] = [];
    try {
      violations = await rawQuery<any>(
        `SELECT id, type, description, severity, deduction, period, "createdAt"
         FROM employee_violations
         WHERE "assignmentId" = $1 AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 5`,
        [scope.activeAssignmentId]
      );
    } catch (e) {
      console.error("my-space violations error:", e);
    }

    let activeLoans: any[] = [];
    try {
      activeLoans = await rawQuery<any>(
        `SELECT id, "loanNumber", "loanType", amount, "remainingAmount",
                "installmentAmount", "installmentCount", "paidAmount", status, "createdAt"
         FROM hr_employee_loans
         WHERE "assignmentId" = $1 AND status IN ('active','pending') AND "deletedAt" IS NULL
         ORDER BY "createdAt" DESC LIMIT 5`,
        [scope.activeAssignmentId]
      );
    } catch (e) {
      console.error("my-space activeLoans error:", e);
    }

    let currentShift: any = null;
    try {
      const [shiftAssignment] = await rawQuery<any>(
        `SELECT s.name, s."startTime", s."endTime", s.days
         FROM employee_shift_assignments esa
         JOIN shifts s ON s.id = esa."shiftId"
         WHERE esa."assignmentId" = $1
           AND (esa."endDate" IS NULL OR esa."endDate" >= $2)
         ORDER BY esa.id DESC LIMIT 1`,
        [scope.activeAssignmentId, today]
      );
      if (shiftAssignment) {
        currentShift = shiftAssignment;
      } else {
        const [defaultShift] = await rawQuery<any>(
          `SELECT name, "startTime", "endTime", days FROM shifts
           WHERE "companyId" = $1 AND status = 'active'
           ORDER BY "isDefault" DESC LIMIT 1`,
          [scope.companyId]
        );
        currentShift = defaultShift || null;
      }
    } catch (e) {
      console.error("my-space currentShift error:", e);
    }

    let monthlyStats: any = null;
    try {
      const [ms] = await rawQuery<any>(
        `SELECT "presentDays", "absentDays", "lateDays", "totalLateMinutes", "totalDeduction"
         FROM employee_monthly_attendance
         WHERE "assignmentId" = $1 AND period = $2`,
        [scope.activeAssignmentId, period]
      );
      monthlyStats = ms || null;
    } catch (e) {
      console.error("my-space monthlyStats error:", e);
    }

    let recentActions: any[] = [];
    try {
      recentActions = await rawQuery<any>(
        `SELECT id, action, entity AS "entityType", "entityId", reason AS description, "createdAt"
         FROM audit_logs
         WHERE "userId" = $1
         ORDER BY "createdAt" DESC LIMIT 5`,
        [scope.userId]
      );
    } catch (e) {
      console.error("my-space recentActions error:", e);
    }

    let performanceReviews: any[] = [];
    try {
      performanceReviews = await rawQuery<any>(
        `SELECT pr.id, pr.period, pr."overallScore", pr.status, e.name AS "reviewerName", pr."createdAt"
         FROM performance_reviews pr
         LEFT JOIN employees e ON e.id = pr."reviewerId"
         WHERE pr."employeeId" = $1
         ORDER BY pr."createdAt" DESC LIMIT 5`,
        [scope.employeeId]
      );
    } catch (e) {
      console.error("my-space performanceReviews error:", e);
    }

    let overdueItems: any[] = [];
    try {
      const overdueTasks = await rawQuery<any>(
        `SELECT id, title, 'task' AS "itemType", "scheduledDate" AS deadline, status
         FROM tasks
         WHERE "assignedTo" = $1 AND status NOT IN ('completed','cancelled')
           AND "scheduledDate" < $2
         ORDER BY "scheduledDate" ASC LIMIT 10`,
        [scope.activeAssignmentId, today]
      );
      const overdueRequests = await rawQuery<any>(
        `SELECT lr.id, lt.name AS title, 'leave_request' AS "itemType", lr."createdAt" AS deadline, lr.status
         FROM hr_leave_requests lr
         JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
         WHERE lr."employeeId" = $1 AND lr.status = 'pending'
           AND lr."createdAt" < NOW() - INTERVAL '3 days'
         ORDER BY lr."createdAt" ASC LIMIT 5`,
        [scope.employeeId]
      ).catch(() => []);
      overdueItems = [...overdueTasks, ...overdueRequests];
    } catch (e) {
      console.error("my-space overdueItems error:", e);
    }

    let expiringSoon: any[] = [];
    try {
      const thirtyDaysLater = new Date();
      thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      const expiringDocs = await rawQuery<any>(
        `SELECT id, type AS title, 'document' AS "itemType", "expiryDate"
         FROM employee_documents
         WHERE "employeeId" = $1 AND "expiryDate" IS NOT NULL
           AND "expiryDate" BETWEEN $2 AND $3
         ORDER BY "expiryDate" ASC LIMIT 10`,
        [scope.employeeId, today, toDateISO(thirtyDaysLater)]
      ).catch(() => []);
      const expiringContracts = await rawQuery<any>(
        `SELECT c.id, CONCAT('عقد إيجار - ', pu."unitNumber") AS title, 'contract' AS "itemType", c."endDate" AS "expiryDate"
         FROM rental_contracts c
         JOIN property_units pu ON pu.id = c."unitId"
         WHERE c."companyId" = $1 AND c.status = 'active'
           AND c."endDate" BETWEEN $2 AND $3
         ORDER BY c."endDate" ASC LIMIT 10`,
        [scope.companyId, today, toDateISO(thirtyDaysLater)]
      ).catch(() => []);
      let expiringInsurance: any[] = [];
      try {
        expiringInsurance = await rawQuery<any>(
          `SELECT fi.id, CONCAT('تأمين - ', fv.make, ' ', fv.model) AS title, 'insurance' AS "itemType",
                  fi."endDate" AS "expiryDate"
           FROM fleet_insurance fi
           JOIN fleet_vehicles fv ON fv.id = fi."vehicleId"
           WHERE fv."companyId" = $1 AND fi."endDate" BETWEEN $2 AND $3
           ORDER BY fi."endDate" ASC LIMIT 5`,
          [scope.companyId, today, toDateISO(thirtyDaysLater)]
        );
      } catch (e) { console.error("my-space expiringInsurance error:", e); }
      expiringSoon = [...expiringDocs, ...expiringContracts, ...expiringInsurance]
        .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
    } catch (e) {
      console.error("my-space expiringSoon error:", e);
    }

    let roleEntities: any = null;
    try {
      const managerRoles = ["owner", "branch_manager", "general_manager", "property_manager", "fleet_manager", "legal_manager", "hr_manager", "finance_manager", "operations_manager"];
      if (managerRoles.includes(scope.role)) {
        let unitsSummary: any = null;
        if (["owner", "branch_manager", "general_manager", "property_manager", "operations_manager"].includes(scope.role)) {
          try {
            const [us] = await rawQuery<any>(
              `SELECT COUNT(*) AS total,
                      COUNT(*) FILTER (WHERE status = 'rented') AS rented,
                      COUNT(*) FILTER (WHERE status = 'available') AS available,
                      COUNT(*) FILTER (WHERE status = 'maintenance') AS maintenance
               FROM property_units WHERE "companyId" = $1`,
              [scope.companyId]
            );
            unitsSummary = us;
          } catch (e) { console.error("my-space roleEntities units error:", e); }
        }
        let vehiclesSummary: any = null;
        if (["owner", "branch_manager", "general_manager", "fleet_manager", "operations_manager"].includes(scope.role)) {
          try {
            const [vs] = await rawQuery<any>(
              `SELECT COUNT(*) AS total,
                      COUNT(*) FILTER (WHERE status = 'available') AS available,
                      COUNT(*) FILTER (WHERE status = 'in_use') AS in_use,
                      COUNT(*) FILTER (WHERE status = 'maintenance') AS maintenance
               FROM fleet_vehicles WHERE "companyId" = $1`,
              [scope.companyId]
            );
            vehiclesSummary = vs;
          } catch (e) { console.error("my-space roleEntities vehicles error:", e); }
        }
        let casesSummary: any = null;
        if (["owner", "branch_manager", "general_manager", "legal_manager"].includes(scope.role)) {
          try {
            const [cs] = await rawQuery<any>(
              `SELECT COUNT(*) AS total,
                      COUNT(*) FILTER (WHERE status = 'open') AS open,
                      COUNT(*) FILTER (WHERE status = 'closed') AS closed
               FROM legal_cases WHERE "companyId" = $1`,
              [scope.companyId]
            );
            casesSummary = cs;
          } catch (e) { console.error("my-space roleEntities cases error:", e); }
        }
        let hrSummary: any = null;
        if (["owner", "branch_manager", "general_manager", "hr_manager"].includes(scope.role)) {
          try {
            const [hs] = await rawQuery<any>(
              `SELECT COUNT(*) AS total,
                      COUNT(*) FILTER (WHERE ea.status = 'active') AS active,
                      COUNT(*) FILTER (WHERE ea.status = 'inactive' OR ea.status = 'terminated') AS inactive
               FROM employee_assignments ea
               WHERE ea."companyId" = $1`,
              [scope.companyId]
            );
            hrSummary = hs;
          } catch (e) { console.error("my-space roleEntities hr error:", e); }
        }
        let financeSummary: any = null;
        if (["owner", "branch_manager", "general_manager", "finance_manager"].includes(scope.role)) {
          try {
            const [fs] = await rawQuery<any>(
              `SELECT COUNT(*) AS total,
                      COUNT(*) FILTER (WHERE status = 'overdue') AS overdue,
                      COUNT(*) FILTER (WHERE status = 'paid') AS paid,
                      COUNT(*) FILTER (WHERE status = 'pending' OR status = 'draft') AS pending
               FROM invoices WHERE "companyId" = $1 AND "deletedAt" IS NULL`,
              [scope.companyId]
            );
            financeSummary = fs;
          } catch (e) { console.error("my-space roleEntities finance error:", e); }
        }
        roleEntities = {
          units: unitsSummary,
          vehicles: vehiclesSummary,
          cases: casesSummary,
          hr: hrSummary,
          finance: financeSummary,
        };
      }
    } catch (e) {
      console.error("my-space roleEntities error:", e);
    }

    res.json({
      attendance,
      leaveBalances,
      openRequests,
      pendingApprovals,
      documents,
      lastPayslip,
      todayTasks,
      notifications,
      custodies,
      violations,
      activeLoans,
      currentShift,
      monthlyStats,
      recentActions,
      performanceReviews,
      overdueItems,
      expiringSoon,
      roleEntities,
      role: scope.role,
    });
  } catch (err) {
    handleRouteError(err, res, "My-space error:");
  }
});

router.get("/attendance", async (req, res) => {
  try {
    const scope = req.scope!;
    const { month } = req.query as Record<string, string>;
    const monthStr = month ?? currentPeriod();
    const rows = await rawQuery<any>(
      `SELECT a.id, a.date, a."checkIn", a."checkOut", a."lateMinutes", a.status,
              COALESCE(a."overtimeMinutes", 0) AS "overtimeMinutes",
              CASE WHEN a."checkIn" IS NOT NULL AND a."checkOut" IS NOT NULL
                THEN ROUND(EXTRACT(EPOCH FROM (a."checkOut" - a."checkIn")) / 3600.0, 2)
                ELSE NULL
              END AS "workHours",
              COALESCE(d.total_deductions, 0) AS "totalDeductions",
              COALESCE(v.violation_count, 0) AS "violationCount",
              v.max_severity AS "violationSeverity"
       FROM attendance a
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(ad.amount), 0) AS total_deductions
         FROM attendance_deductions ad
         WHERE ad."attendanceId" = a.id
       ) d ON TRUE
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS violation_count, MAX(ev.severity) AS max_severity
         FROM employee_violations ev
         WHERE ev."assignmentId" = a."assignmentId"
           AND ev."deletedAt" IS NULL
           AND ev.period = TO_CHAR(a.date, 'YYYY-MM')
       ) v ON TRUE
       WHERE a."assignmentId" = $1
         AND TO_CHAR(a.date, 'YYYY-MM') = $2
       ORDER BY a.date DESC`,
      [scope.activeAssignmentId, monthStr]
    );

    const [monthlyStats] = await rawQuery<any>(
      `SELECT COALESCE("presentDays", 0) AS "presentDays",
              COALESCE("lateDays", 0) AS "lateDays",
              COALESCE("totalLateMinutes", 0) AS "totalLateMinutes",
              COALESCE("totalDeduction", 0) AS "totalDeduction",
              COALESCE("overtimeMinutes", 0) AS "overtimeMinutes"
       FROM employee_monthly_attendance
       WHERE "assignmentId" = $1 AND period = $2`,
      [scope.activeAssignmentId, monthStr]
    );

    res.json({ data: rows, total: rows.length, monthly: monthlyStats ?? null });
  } catch (err) {
    handleRouteError(err, res, "my-attendance error:");
  }
});

router.get("/payslip", async (req, res) => {
  try {
    const scope = req.scope!;
    const { period } = req.query as Record<string, string>;
    const params: any[] = [scope.activeAssignmentId];
    let periodFilter = "";
    if (period) {
      params.push(period);
      periodFilter = `AND pr.period = $${params.length}`;
    }
    const [ps] = await rawQuery<any>(
      `SELECT pl.id, pr.period,
              pl.basic AS "baseSalary",
              COALESCE(pl."housingAllowance",0) AS "housingAllowance",
              COALESCE(pl."transportAllowance",0) AS "transportAllowance",
              COALESCE(pl.overtime,0) AS "overtimePay",
              (pl.basic + COALESCE(pl."housingAllowance",0) + COALESCE(pl."transportAllowance",0) + COALESCE(pl.overtime,0)) AS "grossSalary",
              COALESCE(pl.gosi,0) AS gosi,
              COALESCE(pl."lateDeduction",0) AS "lateDeduction",
              COALESCE(pl."absenceDeduction",0) AS "absenceDeduction",
              COALESCE(pl."violationDeduction",0) AS "otherDeductions",
              COALESCE(pl."loanDeduction",0) AS "advanceDeduction",
              (COALESCE(pl.gosi,0) + COALESCE(pl."lateDeduction",0) + COALESCE(pl."absenceDeduction",0) + COALESCE(pl."violationDeduction",0) + COALESCE(pl."loanDeduction",0)) AS "totalDeductions",
              pl."netSalary",
              pr.status
       FROM payroll_lines pl
       JOIN payroll_runs pr ON pr.id = pl."runId"
       WHERE pl."assignmentId" = $1 AND pl."deletedAt" IS NULL AND pr."deletedAt" IS NULL ${periodFilter}
       ORDER BY pr.period DESC LIMIT 1`,
      params
    );
    res.json({ data: ps || null });
  } catch (err) {
    handleRouteError(err, res, "my-payslip error:");
  }
});

router.get("/performance", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT pr.id, pr.period, pr."overallScore" AS "overallRating", pr.comments AS notes,
              pr.status, pr."createdAt"
       FROM performance_reviews pr
       WHERE pr."employeeId" = $1 AND pr."companyId" = $2
       ORDER BY pr."createdAt" DESC LIMIT 20`,
      [scope.employeeId, scope.companyId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "my-performance error:");
  }
});

router.get("/documents", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT id, type, name AS title, "fileUrl" AS url, "expiryDate", "createdAt"
       FROM employee_documents
       WHERE "employeeId" = $1
       ORDER BY "createdAt" DESC LIMIT 50`,
      [scope.employeeId]
    );
    res.json({ data: rows });
  } catch (err) {
    handleRouteError(err, res, "my-documents error:");
  }
});

router.get("/requests", async (req, res) => {
  try {
    const scope = req.scope!;
    const { status, type, limit = "50" } = req.query as Record<string, string>;

    const conditions: string[] = [`wi."submittedBy" = $1`];
    const params: any[] = [scope.activeAssignmentId];

    if (status) {
      params.push(status);
      conditions.push(`wi.status = $${params.length}`);
    }
    if (type) {
      params.push(type);
      conditions.push(`wi."requestType" = $${params.length}`);
    }

    params.push(Number(limit));
    const rows = await rawQuery<any>(
      `SELECT wi.id, wi."requestType", wi.title, wi.status, wi."slaStatus",
              wi."currentStepOrder", wi."createdAt", wi."completedAt",
              wi."refTable", wi."refId",
              (SELECT COUNT(*) FROM workflow_step_actions wsa WHERE wsa."instanceId" = wi.id) AS "actionCount"
       FROM workflow_instances wi
       WHERE ${conditions.join(" AND ")}
       ORDER BY wi."createdAt" DESC
       LIMIT $${params.length}`,
      params
    );

    const leaveRows = await rawQuery<any>(
      `SELECT lr.id, lt.name AS "leaveTypeName", lr."startDate", lr."endDate", lr.days, lr.status, lr."createdAt"
       FROM hr_leave_requests lr
       JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
       WHERE lr."employeeId" = $1
       ORDER BY lr."createdAt" DESC LIMIT 20`,
      [scope.employeeId]
    ).catch(() => []);

    res.json({ data: rows, leaveRequests: leaveRows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "my-requests error:");
  }
});

export default router;
