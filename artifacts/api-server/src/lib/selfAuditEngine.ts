import { rawQuery, rawExecute } from "./rawdb.js";
import { createNotification, todayISO } from "./businessHelpers.js";
import { logger } from "./logger.js";

interface AuditViolation {
  type: string;
  entityType: string;
  entityId: number | null;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  department: string;
}

const TYPE_DEPARTMENT: Record<string, string> = {
  employee_no_contract: "hr",
  expired_contract_not_renewed: "hr",
  vehicle_no_insurance: "fleet",
  overdue_invoice_no_action: "finance",
  unsettled_custody: "finance",
  stalled_request: "operations",
  hearing_no_preparation: "legal",
  employee_no_assignment: "hr",
  incomplete_attendance: "hr",
  negative_leave_balance: "hr",
};

async function checkEmployeesWithoutActiveContract(companyId: number): Promise<AuditViolation[]> {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT e.id, e.name FROM employees e
     WHERE EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active')
       AND NOT EXISTS (
         SELECT 1 FROM employee_contracts ec
         WHERE ec."employeeId" = e.id AND ec."companyId" = $1
           AND ec.status = 'active' AND ec."endDate" >= CURRENT_DATE
       )`,
    [companyId]
  );
  return rows.map((r: any) => ({
    type: "employee_no_contract",
    entityType: "employee",
    entityId: r.id,
    description: `الموظف "${r.name}" ليس لديه عقد ساري المفعول`,
    priority: "high" as const,
    department: "hr",
  }));
}

async function checkExpiredContractsNotRenewed(companyId: number): Promise<AuditViolation[]> {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT ec.id, e.name, ec."endDate"
     FROM employee_contracts ec
     JOIN employees e ON e.id = ec."employeeId"
     WHERE ec."companyId" = $1 AND ec.status = 'active'
       AND ec."endDate" < CURRENT_DATE
       AND NOT EXISTS (
         SELECT 1 FROM employee_contracts ec2
         WHERE ec2."employeeId" = ec."employeeId" AND ec2."companyId" = $1
           AND ec2.id != ec.id AND ec2."startDate" > ec."endDate"
       )`,
    [companyId]
  );
  return rows.map((r: any) => ({
    type: "expired_contract_not_renewed",
    entityType: "employee_contract",
    entityId: r.id,
    description: `عقد الموظف "${r.name}" انتهى في ${r.endDate} ولم يُجدَّد`,
    priority: "high" as const,
    department: "hr",
  }));
}

async function checkVehiclesWithoutInsurance(companyId: number): Promise<AuditViolation[]> {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT fv.id, fv."plateNumber"
     FROM fleet_vehicles fv
     WHERE fv."companyId" = $1 AND fv.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM fleet_insurance fi
         WHERE fi."vehicleId" = fv.id AND fi."companyId" = $1
           AND fi."endDate" >= CURRENT_DATE
       )`,
    [companyId]
  );
  return rows.map((r: any) => ({
    type: "vehicle_no_insurance",
    entityType: "fleet_vehicle",
    entityId: r.id,
    description: `المركبة "${r.plateNumber}" بدون تأمين ساري المفعول`,
    priority: "critical" as const,
    department: "fleet",
  }));
}

async function checkOverdueInvoicesNoCollection(companyId: number): Promise<AuditViolation[]> {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT i.id, i.ref, i."dueDate",
            (CURRENT_DATE - i."dueDate"::date) AS "daysOverdue"
     FROM invoices i
     WHERE i."companyId" = $1
       AND i.status NOT IN ('paid','cancelled')
       AND i."dueDate" < CURRENT_DATE - INTERVAL '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM invoice_collection_stages ics
         WHERE ics."invoiceId" = i.id AND ics."companyId" = $1
       )`,
    [companyId]
  );
  return rows.map((r: any) => ({
    type: "overdue_invoice_no_action",
    entityType: "invoice",
    entityId: r.id,
    description: `الفاتورة "${r.ref}" متأخرة ${r.daysOverdue} يوم بدون إجراء تحصيل`,
    priority: Number(r.daysOverdue) > 30 ? "critical" as const : "high" as const,
    department: "finance",
  }));
}

async function checkUnsettledCustody(companyId: number): Promise<AuditViolation[]> {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT je.id, je.description, e.name AS "employeeName",
            (CURRENT_DATE - je."createdAt"::date) AS "daysSince"
     FROM journal_entries je
     JOIN employee_assignments ea ON ea.id = je."createdBy"
     JOIN employees e ON e.id = ea."employeeId"
     WHERE je."companyId" = $1 AND je."sourceType" = 'custody'
       AND je."deletedAt" IS NULL
       AND je."createdAt" < CURRENT_DATE - INTERVAL '30 days'
       AND je.ref LIKE 'CUSTODY%' AND je.ref NOT LIKE 'CUSTODY-SETTLE%'`,
    [companyId]
  );
  return rows.map((r: any) => ({
    type: "unsettled_custody",
    entityType: "custody",
    entityId: r.id,
    description: `عهدة "${r.description}" للموظف "${r.employeeName}" لم تُسوَّ منذ ${r.daysSince} يوم`,
    priority: "medium" as const,
    department: "finance",
  }));
}

async function checkStalledRequests(companyId: number): Promise<AuditViolation[]> {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT ar.id, ar."refType", ar."refId",
            (CURRENT_DATE - ar."createdAt"::date) AS "daysPending"
     FROM approval_requests ar
     WHERE ar."companyId" = $1 AND ar.status = 'pending'
       AND ar."createdAt" < NOW() - INTERVAL '7 days'`,
    [companyId]
  );
  return rows.map((r: any) => ({
    type: "stalled_request",
    entityType: "approval_request",
    entityId: r.id,
    description: `طلب موافقة (${r.refType}) رقم ${r.refId} متوقف منذ ${r.daysPending} يوم`,
    priority: Number(r.daysPending) > 14 ? "high" as const : "medium" as const,
    department: "operations",
  }));
}

async function checkUpcomingHearingsNoAction(companyId: number): Promise<AuditViolation[]> {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT lc.id, lc.title, ls."nextSessionDate" AS "nextHearingDate"
     FROM legal_cases lc
     JOIN legal_sessions ls ON ls."caseId" = lc.id AND ls."deletedAt" IS NULL
     WHERE lc."companyId" = $1 AND lc.status = 'open'
       AND ls."nextSessionDate" IS NOT NULL
       AND ls."nextSessionDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
       AND NOT EXISTS (
         SELECT 1 FROM event_logs el
         WHERE el.entity = 'legal_case' AND el."entityId" = lc.id
           AND el."createdAt" > NOW() - INTERVAL '7 days'
           AND (el."companyId" = $1 OR el."companyId" IS NULL)
       )`,
    [companyId]
  );
  return rows.map((r: any) => ({
    type: "hearing_no_preparation",
    entityType: "legal_case",
    entityId: r.id,
    description: `جلسة قانونية "${r.title}" بتاريخ ${r.nextHearingDate} بدون إجراء تحضيري مسبق`,
    priority: "high" as const,
    department: "legal",
  }));
}

async function checkEmployeesWithoutActiveAssignment(companyId: number): Promise<AuditViolation[]> {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT e.id, e.name FROM employees e
     WHERE e.status = 'active'
       AND EXISTS (
         SELECT 1 FROM employee_assignments ea2
         WHERE ea2."employeeId" = e.id AND ea2."companyId" = $1
       )
       AND NOT EXISTS (
         SELECT 1 FROM employee_assignments ea
         WHERE ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active'
       )`,
    [companyId]
  );
  return rows.map((r: any) => ({
    type: "employee_no_assignment",
    entityType: "employee",
    entityId: r.id,
    description: `الموظف "${r.name}" بدون تعيين نشط في أي فرع`,
    priority: "medium" as const,
    department: "hr",
  }));
}

async function checkIncompleteAttendance(companyId: number): Promise<AuditViolation[]> {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT a.id, a."assignmentId", a.date, e.name
     FROM attendance a
     JOIN employee_assignments ea ON ea.id = a."assignmentId"
     JOIN employees e ON e.id = ea."employeeId"
     WHERE ea."companyId" = $1
       AND a."checkIn" IS NOT NULL AND a."checkOut" IS NULL
       AND a.date < CURRENT_DATE
       AND a.status NOT IN ('on_leave','absent')`,
    [companyId]
  );
  return rows.map((r: any) => ({
    type: "incomplete_attendance",
    entityType: "attendance",
    entityId: r.id,
    description: `الموظف "${r.name}" لديه تسجيل حضور بتاريخ ${r.date} بدون تسجيل انصراف`,
    priority: "low" as const,
    department: "hr",
  }));
}

async function checkNegativeLeaveBalance(companyId: number): Promise<AuditViolation[]> {
  const rows = await rawQuery<Record<string, unknown>>(
    `SELECT lb.id, lb."employeeId", e.name, lt.name AS "leaveType",
            (lb.entitled - lb.used) AS balance
     FROM hr_leave_balances lb
     JOIN employees e ON e.id = lb."employeeId"
     JOIN hr_leave_types lt ON lt.id = lb."leaveTypeId"
     WHERE lb."companyId" = $1 AND lb.year = EXTRACT(YEAR FROM CURRENT_DATE)
       AND (lb.entitled - lb.used) < 0`,
    [companyId]
  );
  return rows.map((r: any) => ({
    type: "negative_leave_balance",
    entityType: "hr_leave_balance",
    entityId: r.id,
    description: `رصيد إجازات سالب: "${r.name}" — ${r.leaveType}: ${r.balance} يوم`,
    priority: "medium" as const,
    department: "hr",
  }));
}

export async function runSelfAudit(companyId: number): Promise<{ total: number; byType: Record<string, number> }> {
  const checks = [
    checkEmployeesWithoutActiveContract,
    checkExpiredContractsNotRenewed,
    checkVehiclesWithoutInsurance,
    checkOverdueInvoicesNoCollection,
    checkUnsettledCustody,
    checkStalledRequests,
    checkUpcomingHearingsNoAction,
    checkEmployeesWithoutActiveAssignment,
    checkIncompleteAttendance,
    checkNegativeLeaveBalance,
  ];

  const allViolations: AuditViolation[] = [];
  for (const check of checks) {
    try {
      const results = await check(companyId);
      allViolations.push(...results);
    } catch (err) {
      logger.error(err, `[AUDIT] Check failed for company ${companyId}:`);
    }
  }

  const today = todayISO();
  const byType: Record<string, number> = {};

  for (const v of allViolations) {
    const existing = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM audit_violations
       WHERE "companyId" = $1 AND type = $2 AND "entityType" = $3
         AND ("entityId" = $4 OR ($4 IS NULL AND "entityId" IS NULL))
         AND status = 'open'`,
      [companyId, v.type, v.entityType, v.entityId]
    );
    if (existing.length === 0) {
      await rawExecute(
        `INSERT INTO audit_violations (type, "entityType", "entityId", description, priority, status, department, "companyId", "auditDate", "createdAt")
         VALUES ($1, $2, $3, $4, $5, 'open', $6, $7, $8, NOW())`,
        [v.type, v.entityType, v.entityId, v.description, v.priority, v.department, companyId, today]
      );
    }
    byType[v.type] = (byType[v.type] || 0) + 1;
  }

  return { total: allViolations.length, byType };
}

export async function runSelfAuditAllCompanies(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let grandTotal = 0;
  for (const company of companies) {
    const result = await runSelfAudit(company.id);
    grandTotal += result.total;

    if (result.total > 0) {
      const [hrAsgn] = await rawQuery<{ id: number }>(
        `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
        [company.id]
      );
      if (hrAsgn) {
        const typeSummary = Object.entries(result.byType)
          .map(([t, c]) => `${t}: ${c}`)
          .slice(0, 5)
          .join("، ");
        await createNotification({
          companyId: company.id,
          assignmentId: hrAsgn.id,
          type: "daily_audit",
          title: `تدقيق يومي: ${result.total} مخالفة مكتشفة`,
          body: `تم اكتشاف ${result.total} مخالفة — ${typeSummary}`,
          priority: result.total > 10 ? "urgent" : "high",
          refType: "audit_violations",
        });
      }
    }
  }
  return `Daily self-audit: ${grandTotal} violations found across ${companies.length} companies`;
}
