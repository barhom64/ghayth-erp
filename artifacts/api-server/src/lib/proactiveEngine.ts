import { rawQuery, rawExecute } from "./rawdb.js";
import { createNotification, getManagerAssignmentId, currentYear, toDateISO } from "./businessHelpers.js";
import { eventBus } from "./eventBus.js";
import { logger } from "./logger.js";

async function logAutomation(params: {
  companyId: number | null;
  automationType: string;
  triggerReason: string;
  actionTaken: string;
  entityType?: string;
  entityId?: number;
  createdEntityType?: string;
  createdEntityId?: number;
  assignedTo?: number;
  status?: string;
  details?: any;
}): Promise<void> {
  try {
    await rawExecute(
      `INSERT INTO automation_logs ("companyId","automationType","triggerReason","actionTaken","entityType","entityId","createdEntityType","createdEntityId","assignedTo",status,details,"createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())`,
      [
        params.companyId,
        params.automationType,
        params.triggerReason,
        params.actionTaken,
        params.entityType ?? null,
        params.entityId ?? null,
        params.createdEntityType ?? null,
        params.createdEntityId ?? null,
        params.assignedTo ?? null,
        params.status ?? "success",
        params.details ? JSON.stringify(params.details) : null,
      ]
    );
    await rawExecute(
      `UPDATE proactive_rules SET "lastRunAt" = NOW(), "totalExecutions" = "totalExecutions" + 1 WHERE name = $1`,
      [params.automationType]
    ).catch((e) => logger.error(e, "proactive rule execution update failed"));
  } catch (err) {
    logger.error(err, "[ProactiveEngine] Failed to log automation:");
  }
}

async function getHrAssignment(companyId: number): Promise<number | null> {
  const [hrAsgn] = await rawQuery<any>(
    `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
    [companyId]
  );
  return hrAsgn?.id ?? null;
}

async function getFinanceAssignment(companyId: number): Promise<number | null> {
  const [asgn] = await rawQuery<any>(
    `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('finance_manager','general_manager','owner') AND status = 'active' ORDER BY CASE role WHEN 'finance_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
    [companyId]
  );
  return asgn?.id ?? null;
}

async function getFleetManagerAssignment(companyId: number): Promise<number | null> {
  const [asgn] = await rawQuery<any>(
    `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('fleet_manager','branch_manager','owner') AND status = 'active' ORDER BY CASE role WHEN 'fleet_manager' THEN 1 WHEN 'branch_manager' THEN 2 ELSE 3 END LIMIT 1`,
    [companyId]
  );
  return asgn?.id ?? null;
}

async function getPropertyManagerAssignment(companyId: number): Promise<number | null> {
  const [asgn] = await rawQuery<any>(
    `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('property_manager','branch_manager','owner') AND status = 'active' ORDER BY CASE role WHEN 'property_manager' THEN 1 WHEN 'branch_manager' THEN 2 ELSE 3 END LIMIT 1`,
    [companyId]
  );
  return asgn?.id ?? null;
}

async function isRuleActive(ruleName: string, companyId?: number): Promise<boolean> {
  if (companyId) {
    const [rule] = await rawQuery<any>(
      `SELECT "isActive" FROM proactive_rules WHERE name = $1 AND "companyId" = $2`,
      [ruleName, companyId]
    );
    return rule?.isActive !== false;
  }
  const [rule] = await rawQuery<any>(
    `SELECT "isActive" FROM proactive_rules WHERE name = $1 LIMIT 1`,
    [ruleName]
  );
  return rule?.isActive !== false;
}

async function createTaskForAssignment(params: {
  companyId: number;
  branchId?: number | null;
  title: string;
  description: string;
  priority: string;
  assignedTo: number;
  dueDate?: string;
}): Promise<number | null> {
  try {
    const [row] = await rawQuery<any>(
      `INSERT INTO tasks ("companyId","branchId",title,description,priority,status,"assignedTo","scheduledDate","createdAt")
       VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,NOW()) RETURNING id`,
      [params.companyId, params.branchId ?? null, params.title, params.description, params.priority, params.assignedTo, params.dueDate ?? null]
    );
    return row?.id ?? null;
  } catch (err) {
    logger.error(err, "[ProactiveEngine] Failed to create task:");
    return null;
  }
}

export async function proactiveEmployeeContractExpiry(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let created = 0;
  for (const company of companies) {
    if (!(await isRuleActive("employee_contract_expiry", company.id))) continue;
    const contracts = await rawQuery<any>(
      `SELECT ec.id, ec."companyId", ec."employeeId", ec."endDate",
              e.name AS "employeeName",
              (ec."endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM employee_contracts ec
       JOIN employees e ON e.id = ec."employeeId"
       WHERE ec."companyId" = $1 AND ec.status = 'active'
         AND ec."endDate" IS NOT NULL
         AND ec."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
         AND NOT EXISTS (
           SELECT 1 FROM automation_logs al
           WHERE al."automationType" = 'employee_contract_expiry'
             AND al."entityType" = 'employee_contract' AND al."entityId" = ec.id
             AND al."createdAt" > NOW() - INTERVAL '30 days'
         )`,
      [company.id]
    );
    for (const c of contracts) {
      const hrAssignment = await getHrAssignment(company.id);
      if (!hrAssignment) continue;
      const daysLeft = Number(c.daysLeft);
      const taskId = await createTaskForAssignment({
        companyId: company.id,
        title: `تجديد عقد: ${c.employeeName}`,
        description: `عقد الموظف ${c.employeeName} ينتهي خلال ${daysLeft} يوم (${c.endDate}). يرجى مراجعة العقد واتخاذ إجراء التجديد أو إنهاء الخدمة.`,
        priority: daysLeft <= 7 ? "urgent" : "high",
        assignedTo: hrAssignment,
        dueDate: c.endDate,
      });
      await createNotification({
        companyId: company.id, assignmentId: hrAssignment,
        type: "proactive_automation",
        title: `مهمة تلقائية: تجديد عقد ${c.employeeName}`,
        body: `تم إنشاء مهمة تجديد عقد تلقائياً — ينتهي خلال ${daysLeft} يوم`,
        priority: daysLeft <= 7 ? "urgent" : "high",
        refType: "employee_contract", refId: c.id,
      });
      await logAutomation({
        companyId: company.id,
        automationType: "employee_contract_expiry",
        triggerReason: `عقد الموظف ${c.employeeName} ينتهي خلال ${daysLeft} يوم`,
        actionTaken: `إنشاء مهمة تجديد عقد وإشعار HR`,
        entityType: "employee_contract", entityId: c.id,
        createdEntityType: "task", createdEntityId: taskId ?? undefined,
        assignedTo: hrAssignment,
      });
      created++;
    }
  }
  return `Employee contract expiry: ${created} renewal tasks created`;
}

export async function proactiveInvoiceOverdueCollection(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let created = 0;
  for (const company of companies) {
    if (!(await isRuleActive("invoice_overdue_collection", company.id))) continue;
    const invoices = await rawQuery<any>(
      `SELECT i.id, i.ref, i.total, i."paidAmount", i."dueDate",
              c.name AS "clientName",
              (CURRENT_DATE - i."dueDate"::date) AS "daysOverdue"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId"
       WHERE i."companyId" = $1 AND i.status NOT IN ('paid','cancelled')
         AND i."dueDate" < CURRENT_DATE - INTERVAL '30 days'
         AND NOT EXISTS (
           SELECT 1 FROM automation_logs al
           WHERE al."automationType" = 'invoice_overdue_collection'
             AND al."entityType" = 'invoice' AND al."entityId" = i.id
             AND al."createdAt" > NOW() - INTERVAL '30 days'
         )`,
      [company.id]
    );
    for (const inv of invoices) {
      const financeAsgn = await getFinanceAssignment(company.id);
      if (!financeAsgn) continue;
      const daysOverdue = Number(inv.daysOverdue);
      const remaining = Number(inv.total) - Number(inv.paidAmount || 0);
      const taskId = await createTaskForAssignment({
        companyId: company.id,
        title: `مطالبة تحصيل: فاتورة ${inv.ref}`,
        description: `فاتورة ${inv.ref} متأخرة ${daysOverdue} يوم — العميل: ${inv.clientName || 'غير محدد'} — المبلغ المتبقي: ${remaining} ريال. يرجى التواصل مع العميل للتحصيل.`,
        priority: daysOverdue >= 60 ? "urgent" : "high",
        assignedTo: financeAsgn,
      });
      if (taskId === null) {
        await logAutomation({
          companyId: company.id, automationType: "invoice_overdue_collection",
          triggerReason: `فاتورة ${inv.ref} متأخرة ${daysOverdue} يوم`,
          actionTaken: `فشل إنشاء مهمة مطالبة تحصيل`,
          entityType: "invoice", entityId: inv.id, status: "failed",
        });
        continue;
      }
      await createNotification({
        companyId: company.id, assignmentId: financeAsgn,
        type: "proactive_automation",
        title: `مطالبة تحصيل تلقائية: ${inv.ref}`,
        body: `فاتورة متأخرة ${daysOverdue} يوم — ${remaining} ريال`,
        priority: daysOverdue >= 60 ? "urgent" : "high",
        refType: "invoice", refId: inv.id,
      });
      await logAutomation({
        companyId: company.id,
        automationType: "invoice_overdue_collection",
        triggerReason: `فاتورة ${inv.ref} متأخرة ${daysOverdue} يوم`,
        actionTaken: `إنشاء مهمة مطالبة تحصيل`,
        entityType: "invoice", entityId: inv.id,
        createdEntityType: "task", createdEntityId: taskId ?? undefined,
        assignedTo: financeAsgn,
      });
      created++;
    }
  }
  return `Invoice overdue collection: ${created} collection tasks created`;
}

export async function proactiveUnauthorizedAbsence(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let created = 0;
  for (const company of companies) {
    if (!(await isRuleActive("unauthorized_absence_inquiry", company.id))) continue;
    const absentees = await rawQuery<any>(
      `SELECT a."assignmentId", ea."employeeId", ea."branchId", e.name AS "employeeName"
       FROM attendance a
       JOIN employee_assignments ea ON ea.id = a."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ea."companyId" = $1 AND a.date = CURRENT_DATE AND a.status = 'absent'
         AND NOT EXISTS (
           SELECT 1 FROM hr_leave_requests lr
           WHERE lr."employeeId" = ea."employeeId" AND lr.status = 'approved'
             AND CURRENT_DATE BETWEEN lr."startDate" AND lr."endDate"
         )
         AND NOT EXISTS (
           SELECT 1 FROM automation_logs al
           WHERE al."automationType" = 'unauthorized_absence_inquiry'
             AND al."entityType" = 'attendance' AND al."entityId" = a."assignmentId"
             AND al."createdAt"::date = CURRENT_DATE
         )`,
      [company.id]
    );
    for (const a of absentees) {
      const managerId = await getManagerAssignmentId(company.id, a.branchId ?? 0);
      if (!managerId) continue;
      const taskId = await createTaskForAssignment({
        companyId: company.id,
        branchId: a.branchId,
        title: `استفسار غياب: ${a.employeeName}`,
        description: `الموظف ${a.employeeName} غائب اليوم بدون إذن مسبق. يرجى التواصل معه ومعرفة السبب.`,
        priority: "high",
        assignedTo: managerId,
      });
      await createNotification({
        companyId: company.id, assignmentId: managerId,
        type: "proactive_automation",
        title: `غياب بدون إذن: ${a.employeeName}`,
        body: `تم إنشاء مهمة استفسار تلقائية — يرجى التواصل مع الموظف`,
        priority: "high",
        refType: "employee", refId: a.employeeId,
      });
      await logAutomation({
        companyId: company.id,
        automationType: "unauthorized_absence_inquiry",
        triggerReason: `غياب الموظف ${a.employeeName} بدون إذن`,
        actionTaken: `إنشاء مهمة استفسار للمدير المباشر`,
        entityType: "attendance", entityId: a.assignmentId,
        createdEntityType: "task", createdEntityId: taskId ?? undefined,
        assignedTo: managerId,
      });
      created++;
    }
  }
  return `Unauthorized absence: ${created} inquiry tasks created`;
}

export async function proactiveVehicleInsuranceExpiry(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let created = 0;
  for (const company of companies) {
    if (!(await isRuleActive("vehicle_insurance_expiry", company.id))) continue;
    const insurances = await rawQuery<any>(
      `SELECT fi.id, fi."vehicleId", fi."endDate", fv."plateNumber",
              (fi."endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM fleet_insurance fi
       JOIN fleet_vehicles fv ON fv.id = fi."vehicleId"
       WHERE fi."companyId" = $1
         AND fi."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
         AND NOT EXISTS (
           SELECT 1 FROM automation_logs al
           WHERE al."automationType" = 'vehicle_insurance_expiry'
             AND al."entityType" = 'fleet_insurance' AND al."entityId" = fi.id
             AND al."createdAt" > NOW() - INTERVAL '30 days'
         )`,
      [company.id]
    );
    for (const ins of insurances) {
      const fleetMgr = await getFleetManagerAssignment(company.id);
      if (!fleetMgr) continue;
      const daysLeft = Number(ins.daysLeft);
      const taskId = await createTaskForAssignment({
        companyId: company.id,
        title: `تجديد تأمين مركبة: ${ins.plateNumber}`,
        description: `تأمين المركبة ${ins.plateNumber} ينتهي خلال ${daysLeft} يوم (${ins.endDate}). يرجى تجديد التأمين قبل انتهاء الصلاحية.`,
        priority: daysLeft <= 7 ? "urgent" : "high",
        assignedTo: fleetMgr,
        dueDate: ins.endDate,
      });
      await createNotification({
        companyId: company.id, assignmentId: fleetMgr,
        type: "proactive_automation",
        title: `تجديد تأمين: ${ins.plateNumber}`,
        body: `تأمين ينتهي خلال ${daysLeft} يوم — تم إنشاء مهمة تلقائية`,
        priority: daysLeft <= 7 ? "urgent" : "high",
        refType: "fleet_insurance", refId: ins.id,
      });
      await logAutomation({
        companyId: company.id,
        automationType: "vehicle_insurance_expiry",
        triggerReason: `تأمين المركبة ${ins.plateNumber} ينتهي خلال ${daysLeft} يوم`,
        actionTaken: `إنشاء مهمة تجديد تأمين`,
        entityType: "fleet_insurance", entityId: ins.id,
        createdEntityType: "task", createdEntityId: taskId ?? undefined,
        assignedTo: fleetMgr,
      });
      created++;
    }
  }
  return `Vehicle insurance expiry: ${created} renewal tasks created`;
}

export async function proactiveRentalContractExpiry(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let created = 0;
  for (const company of companies) {
    if (!(await isRuleActive("rental_contract_expiry", company.id))) continue;
    const contracts = await rawQuery<any>(
      `SELECT rc.id, rc."tenantName", rc."endDate",
              (rc."endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM rental_contracts rc
       WHERE rc."companyId" = $1 AND rc.status = 'active'
         AND rc."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
         AND NOT EXISTS (
           SELECT 1 FROM automation_logs al
           WHERE al."automationType" = 'rental_contract_expiry'
             AND al."entityType" = 'rental_contract' AND al."entityId" = rc.id
             AND al."createdAt" > NOW() - INTERVAL '60 days'
         )`,
      [company.id]
    );
    for (const c of contracts) {
      const propMgr = await getPropertyManagerAssignment(company.id);
      if (!propMgr) continue;
      const daysLeft = Number(c.daysLeft);
      const taskId = await createTaskForAssignment({
        companyId: company.id,
        title: `متابعة عقد إيجار: ${c.tenantName}`,
        description: `عقد إيجار المستأجر ${c.tenantName} ينتهي خلال ${daysLeft} يوم (${c.endDate}). يرجى التواصل مع المستأجر لمناقشة التجديد.`,
        priority: daysLeft <= 14 ? "urgent" : "high",
        assignedTo: propMgr,
        dueDate: c.endDate,
      });
      await createNotification({
        companyId: company.id, assignmentId: propMgr,
        type: "proactive_automation",
        title: `عقد إيجار ينتهي: ${c.tenantName}`,
        body: `ينتهي خلال ${daysLeft} يوم — تم إنشاء مهمة متابعة`,
        priority: daysLeft <= 14 ? "urgent" : "high",
        refType: "rental_contract", refId: c.id,
      });
      await logAutomation({
        companyId: company.id,
        automationType: "rental_contract_expiry",
        triggerReason: `عقد إيجار ${c.tenantName} ينتهي خلال ${daysLeft} يوم`,
        actionTaken: `إنشاء مهمة متابعة عقد إيجار`,
        entityType: "rental_contract", entityId: c.id,
        createdEntityType: "task", createdEntityId: taskId ?? undefined,
        assignedTo: propMgr,
      });
      created++;
    }
  }
  return `Rental contract expiry: ${created} follow-up tasks created`;
}

export async function proactiveAnnualPerformanceReview(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let created = 0;
  const currentMonth = new Date().getMonth() + 1;
  const curYear = currentYear();
  if (currentMonth !== 1 && currentMonth !== 7) return "Not review month (Jan/Jul)";
  for (const company of companies) {
    if (!(await isRuleActive("annual_performance_review", company.id))) continue;
    const employees = await rawQuery<any>(
      `SELECT ea.id AS "assignmentId", ea."employeeId", ea."branchId", e.name
       FROM employee_assignments ea
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ea."companyId" = $1 AND ea.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM automation_logs al
           WHERE al."automationType" = 'annual_performance_review'
             AND al."entityType" = 'employee_assignment' AND al."entityId" = ea.id
             AND EXTRACT(YEAR FROM al."createdAt") = $2
             AND EXTRACT(MONTH FROM al."createdAt") = $3
         )`,
      [company.id, curYear, currentMonth]
    );
    for (const emp of employees) {
      const managerId = await getManagerAssignmentId(company.id, emp.branchId ?? 0);
      const assignTo = managerId || await getHrAssignment(company.id);
      if (!assignTo) continue;
      const taskId = await createTaskForAssignment({
        companyId: company.id,
        branchId: emp.branchId,
        title: `تقييم أداء سنوي: ${emp.name}`,
        description: `حان موعد التقييم السنوي للموظف ${emp.name}. يرجى إجراء التقييم وتقديم الملاحظات.`,
        priority: "normal",
        assignedTo: assignTo,
      });
      await logAutomation({
        companyId: company.id,
        automationType: "annual_performance_review",
        triggerReason: `موعد التقييم السنوي للموظف ${emp.name}`,
        actionTaken: `إنشاء مهمة تقييم أداء`,
        entityType: "employee_assignment", entityId: emp.assignmentId,
        createdEntityType: "task", createdEntityId: taskId ?? undefined,
        assignedTo: assignTo,
      });
      created++;
    }
  }
  return `Annual performance review: ${created} review tasks created`;
}

export async function proactiveProbationCompletion(): Promise<string> {
  const contracts = await rawQuery<any>(
    `SELECT ec.id, ec."companyId", ec."employeeId", ec."probationEndDate",
            e.name AS "employeeName"
     FROM employee_contracts ec
     JOIN employees e ON e.id = ec."employeeId"
     WHERE ec."probationStatus" = 'active'
       AND ec."probationEndDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 days'
       AND NOT EXISTS (
         SELECT 1 FROM automation_logs al
         WHERE al."automationType" = 'probation_completion_review'
           AND al."entityType" = 'employee_contract' AND al."entityId" = ec.id
           AND al."createdAt" > NOW() - INTERVAL '30 days'
       )`
  );
  let created = 0;
  for (const c of contracts) {
    if (!(await isRuleActive("probation_completion_review", c.companyId))) continue;
    const hrAssignment = await getHrAssignment(c.companyId);
    if (!hrAssignment) continue;
    const daysLeft = Math.ceil((new Date(c.probationEndDate).getTime() - Date.now()) / 86400000);
    const taskId = await createTaskForAssignment({
      companyId: c.companyId,
      title: `مراجعة تثبيت: ${c.employeeName}`,
      description: `فترة تجربة الموظف ${c.employeeName} تنتهي خلال ${daysLeft} يوم (${c.probationEndDate}). يرجى مراجعة الأداء واتخاذ قرار التثبيت.`,
      priority: "high",
      assignedTo: hrAssignment,
      dueDate: c.probationEndDate,
    });
    await createNotification({
      companyId: c.companyId, assignmentId: hrAssignment,
      type: "proactive_automation",
      title: `مراجعة تثبيت: ${c.employeeName}`,
      body: `فترة التجربة تنتهي خلال ${daysLeft} يوم — تم إنشاء مهمة مراجعة`,
      priority: "high",
      refType: "employee_contract", refId: c.id,
    });
    await logAutomation({
      companyId: c.companyId,
      automationType: "probation_completion_review",
      triggerReason: `فترة تجربة ${c.employeeName} تنتهي خلال ${daysLeft} يوم`,
      actionTaken: `إنشاء مهمة مراجعة تثبيت`,
      entityType: "employee_contract", entityId: c.id,
      createdEntityType: "task", createdEntityId: taskId ?? undefined,
      assignedTo: hrAssignment,
    });
    created++;
  }
  return `Probation completion: ${created} review tasks created`;
}

export async function proactiveVehicleBreakdown(payload: {
  companyId: number;
  vehicleId: number;
  plateNumber: string;
  description?: string;
  source?: string;
}): Promise<void> {
  if (!(await isRuleActive("vehicle_breakdown_maintenance", payload.companyId))) return;

  const existing = await rawQuery<any>(
    `SELECT id FROM automation_logs WHERE "automationType" = 'vehicle_breakdown_maintenance'
       AND "entityType" = 'fleet_vehicle' AND "entityId" = $1
       AND "createdAt" > NOW() - INTERVAL '7 days'`,
    [payload.vehicleId]
  );
  if (existing.length > 0) return;

  const fleetMgr = await getFleetManagerAssignment(payload.companyId);
  if (!fleetMgr) return;

  let maintenanceId: number | null = null;
  if (payload.source !== "manual_maintenance") {
    try {
      const nextServiceDate = new Date();
      nextServiceDate.setMonth(nextServiceDate.getMonth() + 3);
      const [maint] = await rawQuery<any>(
        `INSERT INTO fleet_maintenance ("companyId","vehicleId",type,description,cost,"serviceDate",status,"nextServiceDate")
         VALUES ($1,$2,'breakdown',$3,0,CURRENT_DATE,'pending',$4) RETURNING id`,
        [payload.companyId, payload.vehicleId, payload.description || `عطل تلقائي — ${payload.plateNumber}`, toDateISO(nextServiceDate)]
      );
      maintenanceId = maint?.id ?? null;
    } catch (err) {
      logger.error(err, "[ProactiveEngine] Failed to create fleet_maintenance:");
    }
  }

  const taskId = await createTaskForAssignment({
    companyId: payload.companyId,
    title: `طلب صيانة: ${payload.plateNumber}`,
    description: `عطل في المركبة ${payload.plateNumber}. ${payload.description || 'يرجى جدولة الصيانة فوراً.'}${maintenanceId ? ` — طلب صيانة رقم #${maintenanceId}` : ''}`,
    priority: "urgent",
    assignedTo: fleetMgr,
  });
  await createNotification({
    companyId: payload.companyId, assignmentId: fleetMgr,
    type: "proactive_automation",
    title: `طلب صيانة تلقائي: ${payload.plateNumber}`,
    body: `تم إنشاء طلب صيانة تلقائي بسبب عطل في المركبة`,
    priority: "urgent",
    refType: "fleet_vehicle", refId: payload.vehicleId,
  });
  await logAutomation({
    companyId: payload.companyId,
    automationType: "vehicle_breakdown_maintenance",
    triggerReason: `عطل في المركبة ${payload.plateNumber}`,
    actionTaken: `إنشاء طلب صيانة #${maintenanceId || '-'} ومهمة متابعة`,
    entityType: "fleet_vehicle", entityId: payload.vehicleId,
    createdEntityType: "fleet_maintenance", createdEntityId: maintenanceId ?? undefined,
    assignedTo: fleetMgr,
  });
}

let proactiveListenersRegistered = false;

export function registerProactiveEventListeners(): void {
  if (proactiveListenersRegistered) {
    logger.debug("ProactiveEngine event listeners already registered, skipping");
    return;
  }
  proactiveListenersRegistered = true;

  eventBus.on("fleet.vehicle.breakdown", async (payload) => {
    try {
      if (payload.companyId && payload.entityId) {
        await proactiveVehicleBreakdown({
          companyId: payload.companyId,
          vehicleId: payload.entityId as number,
          plateNumber: (payload.plateNumber as string) || `مركبة #${payload.entityId}`,
          description: payload.description as string,
          source: payload.source as string | undefined,
        });
      }
    } catch (err) {
      logger.error(err, "[ProactiveEngine] Vehicle breakdown handler failed:");
    }
  });

  logger.info("ProactiveEngine event listeners registered");
}

export async function runAllProactiveChecks(): Promise<string> {
  const results: string[] = [];
  try { results.push(await proactiveEmployeeContractExpiry()); } catch (e) { results.push(`contract_expiry: error`); }
  try { results.push(await proactiveInvoiceOverdueCollection()); } catch (e) { results.push(`invoice_collection: error`); }
  try { results.push(await proactiveUnauthorizedAbsence()); } catch (e) { results.push(`absence_inquiry: error`); }
  try { results.push(await proactiveVehicleInsuranceExpiry()); } catch (e) { results.push(`insurance_expiry: error`); }
  try { results.push(await proactiveRentalContractExpiry()); } catch (e) { results.push(`rental_expiry: error`); }
  try { results.push(await proactiveAnnualPerformanceReview()); } catch (e) { results.push(`performance_review: error`); }
  try { results.push(await proactiveProbationCompletion()); } catch (e) { results.push(`probation_review: error`); }
  return results.join(" | ");
}
