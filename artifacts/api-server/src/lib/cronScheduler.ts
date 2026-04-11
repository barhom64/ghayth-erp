import cron from "node-cron";
import { rawQuery, rawExecute, pool } from "./rawdb.js";
import { saveAllCompaniesKPISnapshots } from "./kpiEngine.js";
import { runSmartAlertsAllCompanies } from "./smartAlerts.js";
import { runSelfAuditAllCompanies } from "./selfAuditEngine.js";
import {
  createNotification,
  getManagerAssignmentId,
  getDirectorAssignmentId,
  getCfoAssignmentId,
  haversineDistance,
} from "./businessHelpers.js";
import { broadcastAlert } from "./notificationService.js";
import { processFallbackChains } from "./notificationEngine.js";
import { checkSlaStatus } from "./workflowEngine.js";
import { runAllProactiveChecks, registerProactiveEventListeners } from "./proactiveEngine.js";
import { eventBus } from "./eventBus.js";

async function getSystemTimezone(): Promise<string> {
  try {
    const rows = await rawQuery<{ value: string }>(`SELECT value FROM system_settings WHERE key='timezone' AND "companyId" IS NULL AND "branchId" IS NULL`);
    return rows.length > 0 && rows[0].value ? rows[0].value : "Asia/Riyadh";
  } catch {
    return "Asia/Riyadh";
  }
}

interface CronJobDef {
  name: string;
  description: string;
  schedule: string;
  handler: () => Promise<string>;
}

async function logCronJob(
  jobName: string,
  status: "success" | "failed",
  duration: number,
  result: string,
  error?: string
): Promise<void> {
  try {
    const job = await rawQuery<{ id: number }>(
      `SELECT id FROM cron_jobs WHERE name=$1`,
      [jobName]
    );
    const jobId = job[0]?.id ?? null;

    if (jobId) {
      await rawExecute(
        `UPDATE cron_jobs SET "lastRunAt"=NOW(), "lastStatus"=$2, "lastError"=$3 WHERE id=$1`,
        [jobId, status, error ?? null]
      );
    }

    await rawExecute(
      `INSERT INTO cron_logs ("jobId","jobName",status,duration,result,error,"createdAt")
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [jobId, jobName, status, duration, result, error ?? null]
    );
  } catch (err) {
    console.error("Failed to log cron job:", err);
  }
}

const LOCK_OWNER = process.env.HOSTNAME ?? "api-server";
const LOCK_TTL_MINUTES = 30;

async function acquireCronLock(jobName: string): Promise<boolean> {
  try {
    const upsertResult = await pool.query(
      `INSERT INTO cron_locks (job_name, locked_at, locked_by, expires_at)
       VALUES ($1, NOW(), $2, NOW() + INTERVAL '${LOCK_TTL_MINUTES} minutes')
       ON CONFLICT (job_name) DO UPDATE
         SET locked_at  = EXCLUDED.locked_at,
             locked_by  = EXCLUDED.locked_by,
             expires_at = EXCLUDED.expires_at
         WHERE cron_locks.expires_at < NOW()`,
      [jobName, LOCK_OWNER]
    );
    return (upsertResult.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
}

async function releaseCronLock(jobName: string): Promise<void> {
  try {
    await pool.query(
      `DELETE FROM cron_locks WHERE job_name = $1 AND locked_by = $2`,
      [jobName, LOCK_OWNER]
    );
  } catch {
  }
}

async function runJob(def: CronJobDef): Promise<void> {
  const isEnabled = await rawQuery<{ isActive: boolean }>(
    `SELECT "isActive" FROM cron_jobs WHERE name=$1`,
    [def.name]
  );
  if (isEnabled.length > 0 && !isEnabled[0]!.isActive) {
    return;
  }

  const acquired = await acquireCronLock(def.name);
  if (!acquired) {
    console.log(`[CRON] ${def.name}: skipped — already running on another instance`);
    return;
  }

  const start = Date.now();
  try {
    const result = await def.handler();
    const duration = Date.now() - start;
    await logCronJob(def.name, "success", duration, result);
    console.log(`[CRON] ${def.name}: ${result} (${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    await logCronJob(def.name, "failed", duration, "Job failed", errMsg);
    console.error(`[CRON] ${def.name} failed:`, err);
  } finally {
    await releaseCronLock(def.name);
  }
}

async function documentExpiryAlerts(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let alerted = 0;
  for (const company of companies) {
    const docs = await rawQuery<any>(
      `SELECT ed.id, ed."employeeId", ed."documentType", ed."expiryDate",
              e.name AS "employeeName",
              (ed."expiryDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM employee_documents ed
       JOIN employees e ON e.id = ed."employeeId"
       WHERE ed."companyId" = $1 AND ed."expiryDate" IS NOT NULL
         AND ed."expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
      [company.id]
    );
    for (const doc of docs) {
      const daysLeft = Number(doc.daysLeft);
      if ([30, 14, 7, 3, 1].includes(daysLeft)) {
        const [hrAsgn] = await rawQuery<any>(
          `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
          [company.id]
        );
        if (hrAsgn) {
          await createNotification({
            companyId: company.id, assignmentId: hrAsgn.id,
            type: "document_expiry", title: `وثيقة تنتهي: ${doc.employeeName}`,
            body: `${doc.documentType} تنتهي خلال ${daysLeft} يوم — ${doc.expiryDate}`,
            priority: daysLeft <= 7 ? "high" : "normal",
            refType: "employee_document", refId: doc.id,
          });
          alerted++;
        }
      }
    }
  }
  return `Alerted ${alerted} expiring documents`;
}

async function contractExpiryAlerts(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let alerted = 0;
  for (const company of companies) {
    const contracts = await rawQuery<any>(
      `SELECT id, title, "partyName", "endDate",
              ("endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM legal_contracts WHERE "companyId" = $1 AND status = 'active'
         AND "endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`,
      [company.id]
    );
    for (const c of contracts) {
      const daysLeft = Number(c.daysLeft);
      if ([90, 30, 14, 7].includes(daysLeft)) {
        await broadcastAlert(
          company.id, "contract_expiry",
          `عقد "${c.title}" ينتهي خلال ${daysLeft} يوم`,
          `عقد مع ${c.partyName} — تاريخ الانتهاء: ${c.endDate}`,
          daysLeft <= 14 ? "critical" : "warning",
          "legal_contract", c.id
        );
        alerted++;
      }
    }
  }
  return `Alerted ${alerted} expiring contracts`;
}

async function fleetStatusCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let actions = 0;
  for (const company of companies) {
    const overdueService = await rawQuery<any>(
      `SELECT id, "plateNumber" FROM fleet_vehicles
       WHERE "companyId" = $1 AND "nextServiceDate" IS NOT NULL
         AND "nextServiceDate" < CURRENT_DATE AND status = 'active'`,
      [company.id]
    );
    for (const v of overdueService) {
      await rawExecute(
        `UPDATE fleet_vehicles SET status = 'needs_service' WHERE id = $1 AND status = 'active'`,
        [v.id]
      );
      await broadcastAlert(
        company.id, "fleet_service_overdue",
        `صيانة متأخرة: ${v.plateNumber}`,
        `المركبة ${v.plateNumber} تجاوزت موعد الصيانة — تم تعليق حالتها`,
        "warning", "fleet_vehicle", v.id
      );
      eventBus.emit("fleet.vehicle.breakdown", {
        companyId: company.id,
        entityId: v.id,
        plateNumber: v.plateNumber,
        description: `صيانة متأخرة — تجاوزت موعد الصيانة المحدد`,
      });
      actions++;
    }

    const expiredInsurance = await rawQuery<any>(
      `SELECT fi.id, fv."plateNumber", fv.id AS "vehicleId"
       FROM fleet_insurance fi
       JOIN fleet_vehicles fv ON fv.id = fi."vehicleId"
       WHERE fi."companyId" = $1 AND fi."endDate" < CURRENT_DATE`,
      [company.id]
    );
    for (const ins of expiredInsurance) {
      await broadcastAlert(
        company.id, "fleet_insurance_expired",
        `تأمين منتهي: ${ins.plateNumber}`,
        `تأمين المركبة ${ins.plateNumber} انتهت صلاحيته — يرجى التجديد فوراً`,
        "critical", "fleet_vehicle", ins.vehicleId
      );
      actions++;
    }

    const expiredLicenses = await rawQuery<any>(
      `SELECT id, name FROM fleet_drivers
       WHERE "companyId" = $1 AND "licenseExpiry" IS NOT NULL
         AND "licenseExpiry" < CURRENT_DATE AND status = 'active'`,
      [company.id]
    );
    for (const d of expiredLicenses) {
      await rawExecute(
        `UPDATE fleet_drivers SET status = 'suspended' WHERE id = $1`,
        [d.id]
      );
      await broadcastAlert(
        company.id, "driver_license_expired",
        `رخصة منتهية: ${d.name}`,
        `رخصة السائق ${d.name} انتهت — تم تعليق حالته تلقائياً`,
        "critical", "fleet_driver", d.id
      );
      actions++;
    }
  }
  return `Fleet check: ${actions} actions taken`;
}

async function leaveEscalationCheck(): Promise<string> {
  const now = new Date();
  let reminders = 0, warnings = 0, escalations = 0, autoApprovals = 0;

  const pendingStages = await rawQuery<any>(
    `SELECT las.id, las."leaveRequestId", las.stage, las."requiredRole", las."assignedTo",
            las."createdAt", las."expiresAt", las."reminderSentAt", las."warningSentAt", las."escalatedAt",
            lr."companyId", lr."employeeId", lr.days, lr."startDate", lr."endDate",
            lr."leaveTypeId", lt.name AS "leaveTypeName"
     FROM leave_approval_stages las
     JOIN hr_leave_requests lr ON lr.id = las."leaveRequestId"
     JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
     WHERE las.status = 'pending' AND lr.status = 'pending'
     ORDER BY las."createdAt" ASC`
  );

  for (const stage of pendingStages) {
    const stageCreatedAt = new Date(stage.createdAt);
    const hoursSinceCreation = (now.getTime() - stageCreatedAt.getTime()) / 3600000;

    if (hoursSinceCreation >= 28 && !stage.autoApprovedAt) {
      await rawExecute(
        `UPDATE leave_approval_stages SET status = 'approved', decision = 'موافقة تلقائية - تجاوز المهلة', "autoApprovedAt" = NOW() WHERE id = $1`,
        [stage.id]
      );
      await rawExecute(
        `UPDATE hr_leave_requests SET status = 'approved', "approvedAt" = NOW() WHERE id = $1`,
        [stage.leaveRequestId]
      );
      const year = new Date(stage.startDate).getFullYear();
      await rawExecute(
        `UPDATE hr_leave_balances SET used = used + $1, reserved = reserved - $1
         WHERE "employeeId" = $2 AND "companyId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
        [stage.days, stage.employeeId, stage.companyId, stage.leaveTypeId, year]
      );
      await rawExecute(
        `UPDATE approval_requests SET status = 'approved', "decidedAt" = NOW()
         WHERE "refType" = 'leave_request' AND "refId" = $1`,
        [stage.leaveRequestId]
      ).catch(console.error);

      const allAssignments = await rawQuery<any>(
        `SELECT id, "companyId", "branchId" FROM employee_assignments
         WHERE "employeeId" = $1 AND status = 'active'`,
        [stage.employeeId]
      );
      const leaveStart = new Date(stage.startDate);
      const leaveEnd = new Date(stage.endDate);
      for (const asn of allAssignments) {
        for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          await rawExecute(
            `INSERT INTO attendance ("assignmentId","companyId","branchId",date,status,notes)
             VALUES ($1,$2,$3,$4,'on_leave',$5) ON CONFLICT DO NOTHING`,
            [asn.id, asn.companyId, asn.branchId, dateStr, `إجازة معتمدة تلقائياً - طلب رقم ${stage.leaveRequestId}`]
          ).catch(console.error);
        }
        const [managerAId] = await rawQuery<any>(
          `SELECT ea.id FROM employee_assignments ea
           WHERE ea."companyId" = $1 AND ea."branchId" = $2
             AND ea.role IN ('branch_manager','hr_manager','general_manager','owner') AND ea.status = 'active' AND ea.id != $3
           ORDER BY CASE ea.role WHEN 'branch_manager' THEN 1 WHEN 'hr_manager' THEN 2 WHEN 'general_manager' THEN 3 ELSE 4 END LIMIT 1`,
          [asn.companyId, asn.branchId, asn.id]
        );
        if (managerAId) {
          await rawExecute(
            `UPDATE project_tasks SET "assigneeId" = (SELECT "employeeId" FROM employee_assignments WHERE id = $1)
             WHERE "assigneeId" = (SELECT "employeeId" FROM employee_assignments WHERE id = $2)
               AND status NOT IN ('completed','cancelled')
               AND ("dueDate" IS NULL OR "dueDate" BETWEEN $3 AND $4)`,
            [managerAId.id, asn.id, stage.startDate, stage.endDate]
          ).catch(console.error);
        }
        createNotification({
          companyId: asn.companyId, assignmentId: asn.id,
          type: "leave_approved", title: "تمت الموافقة التلقائية على طلب الإجازة",
          body: `تمت الموافقة تلقائياً على إجازة ${stage.leaveTypeName} من ${stage.startDate} إلى ${stage.endDate} بسبب تجاوز المهلة`,
          priority: "high", refType: "leave_request", refId: stage.leaveRequestId,
        }).catch(console.error);
        if (managerAId) {
          createNotification({
            companyId: asn.companyId, assignmentId: managerAId.id,
            type: "leave_approved", title: "موظف في إجازة معتمدة تلقائياً",
            body: `تمت الموافقة تلقائياً على إجازة موظف من ${stage.startDate} إلى ${stage.endDate}. تم إعادة توزيع المهام.`,
            priority: "normal", refType: "leave_request", refId: stage.leaveRequestId,
          }).catch(console.error);
        }
      }
      autoApprovals++;
    } else if (hoursSinceCreation >= 24 && !stage.escalatedAt) {
      const [hrAssignment] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
        [stage.companyId]
      );
      if (hrAssignment) {
        await createNotification({
          companyId: stage.companyId, assignmentId: hrAssignment.id,
          type: "leave_escalated", title: "تصعيد طلب إجازة - تجاوز 24 ساعة",
          body: `طلب إجازة رقم ${stage.leaveRequestId} لم يتم البت فيه خلال 24 ساعة. سيتم الموافقة التلقائية خلال 4 ساعات.`,
          priority: "urgent", refType: "leave_request", refId: stage.leaveRequestId,
        });
      }
      await rawExecute(`UPDATE leave_approval_stages SET "escalatedAt" = NOW() WHERE id = $1`, [stage.id]);
      escalations++;
    } else if (hoursSinceCreation >= 20 && !stage.warningSentAt) {
      if (stage.assignedTo) {
        await createNotification({
          companyId: stage.companyId, assignmentId: stage.assignedTo,
          type: "leave_warning", title: "تنبيه عاجل - طلب إجازة ينتظر",
          body: `طلب إجازة رقم ${stage.leaveRequestId} ينتظر منذ 20 ساعة. سيتم التصعيد خلال 4 ساعات.`,
          priority: "urgent", refType: "leave_request", refId: stage.leaveRequestId,
        });
      }
      await rawExecute(`UPDATE leave_approval_stages SET "warningSentAt" = NOW() WHERE id = $1`, [stage.id]);
      warnings++;
    } else if (hoursSinceCreation >= 12 && !stage.reminderSentAt) {
      if (stage.assignedTo) {
        await createNotification({
          companyId: stage.companyId, assignmentId: stage.assignedTo,
          type: "leave_reminder", title: "تذكير - طلب إجازة ينتظر موافقتك",
          body: `طلب إجازة رقم ${stage.leaveRequestId} ينتظر موافقتك منذ 12 ساعة.`,
          priority: "high", refType: "leave_request", refId: stage.leaveRequestId,
        });
      }
      await rawExecute(`UPDATE leave_approval_stages SET "reminderSentAt" = NOW() WHERE id = $1`, [stage.id]);
      reminders++;
    }
  }

  return `Leave escalation: ${reminders} reminders, ${warnings} warnings, ${escalations} escalations, ${autoApprovals} auto-approvals`;
}

async function reconcileAttendance(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let total = 0;
  for (const company of companies) {
    const { affectedRows } = await rawExecute(
      `INSERT INTO attendance ("assignmentId", date, status, "createdAt")
       SELECT ea.id, CURRENT_DATE, 'absent', NOW()
       FROM employee_assignments ea
       WHERE ea."companyId"=$1 AND ea.status='active'
         AND NOT EXISTS (
           SELECT 1 FROM attendance a WHERE a."assignmentId"=ea.id AND a.date=CURRENT_DATE
         )`,
      [company.id]
    );
    total += affectedRows;

    if (affectedRows > 0) {
      const [hrAsgn] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
        [company.id]
      );
      if (hrAsgn) {
        await createNotification({
          companyId: company.id, assignmentId: hrAsgn.id,
          type: "attendance_absent",
          title: `${affectedRows} موظف بدون حضور اليوم`,
          body: `تم تسجيل ${affectedRows} سجل غياب تلقائي`,
          priority: "normal",
        });
      }
    }
  }
  return `Reconciled ${total} attendance records`;
}

async function dailyKpiSnapshot(): Promise<string> {
  const today = new Date().toISOString().split("T")[0]!;
  const saved = await saveAllCompaniesKPISnapshots(today);
  return `Saved KPI snapshots for ${saved} employees`;
}

async function dailySmartAlertScan(): Promise<string> {
  const result = await runSmartAlertsAllCompanies();
  return `Fired ${result.fired} alerts: ${result.details.slice(0, 5).join(", ")}`;
}

async function hourlySlaEscalation(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let escalated = 0;
  for (const company of companies) {
    const tickets = await rawQuery<any>(
      `SELECT id, ref, title, priority, "assigneeId"
       FROM support_tickets
       WHERE "companyId" = $1 AND status IN ('open','in_progress')
         AND "slaDeadline" IS NOT NULL AND "slaDeadline" < NOW()
         AND "slaBreached" = false`,
      [company.id]
    );
    for (const t of tickets) {
      await rawExecute(
        `UPDATE support_tickets SET "slaBreached" = true, "escalationLevel" = COALESCE("escalationLevel",0) + 1 WHERE id = $1`,
        [t.id]
      );
      await broadcastAlert(
        company.id, "sla_breach",
        `خرق SLA: ${t.ref}`,
        `التذكرة "${t.title}" (${t.priority}) تجاوزت SLA`,
        "critical", "support_ticket", t.id
      );
      escalated++;
    }
  }
  return `Escalated ${escalated} SLA-breached tickets`;
}

async function hourlyApprovalEscalation(): Promise<string> {
  const now = new Date();
  let reminders = 0, autoApprovals = 0;
  const { refTypeToChainType } = await import("./businessHelpers.js");

  const pendingRequests = await rawQuery<any>(
    `SELECT * FROM approval_requests WHERE status = 'pending' ORDER BY "createdAt" ASC`
  );

  for (const req of pendingRequests) {
    const hoursSinceCreation = (now.getTime() - new Date(req.createdAt).getTime()) / 3600000;
    const expiresAt = req.expiresAt ? new Date(req.expiresAt) : null;
    const isExpired = expiresAt ? now > expiresAt : hoursSinceCreation >= 48;

    if (hoursSinceCreation >= 24 && !req.lastReminderAt) {
      if (req.assignedTo) {
        await createNotification({
          companyId: req.companyId, assignmentId: req.assignedTo,
          type: "approval_reminder", title: "تذكير - طلب موافقة ينتظر",
          body: `يوجد طلب موافقة (${req.refType}) ينتظر منذ 24 ساعة`,
          priority: "high", refType: req.refType, refId: req.refId,
        });
      }
      await rawExecute(
        `UPDATE approval_requests SET "lastReminderAt" = NOW(), "escalationLevel" = "escalationLevel" + 1 WHERE id = $1`,
        [req.id]
      );
      reminders++;
    }

    if (isExpired) {
      let shouldAutoApprove = false;
      if (req.chainId && req.currentStepOrder) {
        const [currentStep] = await rawQuery<any>(
          `SELECT * FROM approval_chain_steps WHERE "chainId" = $1 AND "stepOrder" = $2`,
          [req.chainId, req.currentStepOrder]
        );
        shouldAutoApprove = !!currentStep?.autoApproveOnTimeout;
      }

      if (shouldAutoApprove) {
        const { processApprovalStep } = await import("./businessHelpers.js");
        await processApprovalStep({
          companyId: req.companyId, branchId: req.branchId,
          refType: req.refType, refId: req.refId,
          approved: true, decidedBy: 0,
        });
        autoApprovals++;
      } else {
        const [hrAssignment] = await rawQuery<any>(
          `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
          [req.companyId]
        );
        if (hrAssignment) {
          await createNotification({
            companyId: req.companyId, assignmentId: hrAssignment.id,
            type: "approval_escalated", title: "تصعيد طلب موافقة",
            body: `طلب موافقة (${req.refType}) رقم ${req.refId} تجاوز المهلة`,
            priority: "urgent", refType: req.refType, refId: req.refId,
          });
        }
      }
    }
  }
  return `Approval escalation: ${reminders} reminders, ${autoApprovals} auto-approvals`;
}

async function dailyDeductionCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let deductions = 0;
  for (const company of companies) {
    const absentees = await rawQuery<any>(
      `SELECT a."assignmentId", ea."employeeId", e.name
       FROM attendance a
       JOIN employee_assignments ea ON ea.id = a."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ea."companyId" = $1 AND a.date = CURRENT_DATE AND a.status = 'absent'
         AND NOT EXISTS (
           SELECT 1 FROM hr_leave_requests lr
           WHERE lr."employeeId" = ea."employeeId" AND lr.status = 'approved'
             AND CURRENT_DATE BETWEEN lr."startDate" AND lr."endDate"
         )`,
      [company.id]
    );
    for (const a of absentees) {
      await rawExecute(
        `INSERT INTO payroll_deductions ("companyId", "employeeId", type, amount, reason, date, "createdAt")
         SELECT $1, $2, 'absence', 0, $3, CURRENT_DATE, NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM payroll_deductions
           WHERE "companyId" = $1 AND "employeeId" = $2 AND date = CURRENT_DATE AND type = 'absence'
         )`,
        [company.id, a.employeeId, `خصم غياب تلقائي — ${a.name}`]
      ).catch(() => {});
      deductions++;
    }
  }
  return `Processed ${deductions} absence deductions`;
}

async function dailyInvoiceOverdueEscalation(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let actions = 0;
  for (const company of companies) {
    const invoices = await rawQuery<any>(
      `SELECT i.id, i.ref, i."clientId", i.total, i."paidAmount", i."dueDate",
              c.name AS "clientName", c.phone AS "clientPhone",
              (CURRENT_DATE - i."dueDate"::date) AS "daysOverdue",
              i."overduePhase"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId"
       WHERE i."companyId" = $1 AND i.status NOT IN ('paid','cancelled')
         AND i."dueDate" < CURRENT_DATE`,
      [company.id]
    );

    const PHASE_ORDER = ["alert", "first_notice", "reminder", "warning", "escalation", "legal"];

    for (const inv of invoices) {
      const days = Number(inv.daysOverdue);
      let phase: string | null = null;
      if (days >= 90) phase = "legal";
      else if (days >= 60) phase = "escalation";
      else if (days >= 30) phase = "warning";
      else if (days >= 14) phase = "reminder";
      else if (days >= 7) phase = "first_notice";
      else if (days >= 3) phase = "alert";
      if (!phase) continue;

      const currentIdx = PHASE_ORDER.indexOf(inv.overduePhase || "");
      const newIdx = PHASE_ORDER.indexOf(phase);
      if (currentIdx >= newIdx) continue;

      await rawExecute(
        `UPDATE invoices SET "overduePhase" = $1 WHERE id = $2`,
        [phase, inv.id]
      ).catch(() => {});

      await broadcastAlert(
        company.id, "invoice_overdue",
        `فاتورة متأخرة ${days} يوم: ${inv.ref}`,
        `العميل: ${inv.clientName || 'غير محدد'} — المبلغ: ${inv.total} ريال — المرحلة: ${phase}`,
        days >= 30 ? "critical" : "warning",
        "invoice", inv.id
      );
      actions++;
    }
  }
  return `Invoice overdue escalation: ${actions} actions`;
}

async function dailyFuelMonitor(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let alerts = 0;
  for (const company of companies) {
    const vehicles = await rawQuery<any>(
      `SELECT fv.id, fv."plateNumber",
              COALESCE(SUM(fl.amount), 0) AS "monthlyFuel",
              fv."monthlyFuelBudget"
       FROM fleet_vehicles fv
       LEFT JOIN fleet_fuel_logs fl ON fl."vehicleId" = fv.id
         AND fl."createdAt" >= date_trunc('month', CURRENT_DATE)
       WHERE fv."companyId" = $1 AND fv."monthlyFuelBudget" IS NOT NULL
         AND fv."monthlyFuelBudget" > 0
       GROUP BY fv.id, fv."plateNumber", fv."monthlyFuelBudget"
       HAVING COALESCE(SUM(fl.amount), 0) > fv."monthlyFuelBudget" * 0.8`,
      [company.id]
    );
    for (const v of vehicles) {
      await broadcastAlert(
        company.id, "fuel_budget_warning",
        `استهلاك وقود مرتفع: ${v.plateNumber}`,
        `الاستهلاك ${v.monthlyFuel} من الميزانية ${v.monthlyFuelBudget}`,
        "warning", "fleet_vehicle", v.id
      );
      alerts++;
    }
  }
  return `Fuel monitor: ${alerts} alerts`;
}

async function dailyInventoryCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let pos = 0;
  for (const company of companies) {
    const products = await rawQuery<any>(
      `SELECT id, name, "currentStock", COALESCE("minStock", "safetyStock", 0) AS threshold
       FROM warehouse_products
       WHERE "companyId" = $1
         AND COALESCE("minStock", "safetyStock", 0) > 0
         AND "currentStock" < COALESCE("minStock", "safetyStock", 0)`,
      [company.id]
    );
    for (const p of products) {
      const existing = await rawQuery<any>(
        `SELECT id FROM purchase_orders
         WHERE "companyId" = $1 AND title LIKE $2
         AND "createdAt" > NOW() - INTERVAL '7 days' AND status NOT IN ('cancelled','rejected')`,
        [company.id, `%${p.name}%`]
      );
      if (existing.length === 0) {
        await rawExecute(
          `INSERT INTO purchase_orders ("companyId", title, status, "totalAmount", "createdAt")
           VALUES ($1, $2, 'draft', 0, NOW())`,
          [company.id, `طلب شراء تلقائي: ${p.name} (المخزون ${p.currentStock}/${p.threshold})`]
        ).catch(() => {});
        pos++;
      }
    }
  }
  return `Inventory check: ${pos} purchase orders created`;
}

async function dailyPropertyCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let actions = 0;
  for (const company of companies) {
    const expiring = await rawQuery<any>(
      `SELECT rc.id, rc."tenantName", rc."endDate",
              (rc."endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM rental_contracts rc
       WHERE rc."companyId" = $1 AND rc.status = 'active'
         AND rc."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'`,
      [company.id]
    );
    for (const c of expiring) {
      await broadcastAlert(
        company.id, "rental_contract_expiry",
        `عقد إيجار ينتهي: ${c.tenantName}`,
        `ينتهي خلال ${c.daysLeft} يوم — ${c.endDate}`,
        Number(c.daysLeft) <= 7 ? "critical" : "warning",
        "rental_contract", c.id
      );
      actions++;
    }
  }
  return `Property check: ${actions} expiring contracts alerted`;
}

async function dailyLegalCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let actions = 0;
  for (const company of companies) {
    const cases = await rawQuery<any>(
      `SELECT id, title, "nextHearingDate"
       FROM legal_cases
       WHERE "companyId" = $1 AND status = 'open'
         AND "nextHearingDate" IS NOT NULL
         AND "nextHearingDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`,
      [company.id]
    );
    for (const c of cases) {
      await broadcastAlert(
        company.id, "legal_hearing",
        `جلسة قضائية قريبة: ${c.title}`,
        `موعد الجلسة: ${c.nextHearingDate}`,
        "warning", "legal_case", c.id
      );
      actions++;
    }
  }
  return `Legal check: ${actions} upcoming hearings`;
}

async function dailyProjectCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let actions = 0;
  for (const company of companies) {
    const projects = await rawQuery<any>(
      `SELECT id, name, "endDate", budget, "spentAmount", progress
       FROM projects
       WHERE "companyId" = $1 AND status = 'active' AND "endDate" < CURRENT_DATE`,
      [company.id]
    );
    for (const p of projects) {
      const budget = Number(p.budget) || 0;
      const spent = Number(p.spentAmount) || 0;
      const overBudget = budget > 0 && spent > budget * 0.9;
      await broadcastAlert(
        company.id, "project_delayed",
        `مشروع متأخر: ${p.name}`,
        `تجاوز الموعد المحدد${overBudget ? ` — تجاوز 90% من الميزانية (${Math.round(spent / budget * 100)}%)` : ''}`,
        overBudget ? "critical" : "warning",
        "project", p.id
      );
      actions++;
    }
  }
  return `Project check: ${actions} delayed projects`;
}

async function dailyCrmCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let actions = 0;
  for (const company of companies) {
    const overdue = await rawQuery<any>(
      `SELECT ca.id, ca."opportunityId", ca.description, co."assignedTo", co.title AS "oppTitle"
       FROM crm_activities ca
       JOIN crm_opportunities co ON co.id = ca."opportunityId"
       WHERE co."companyId" = $1 AND ca."completedAt" IS NULL
         AND ca."scheduledAt" < NOW() - INTERVAL '3 days'`,
      [company.id]
    );
    for (const a of overdue) {
      if (!a.assignedTo) continue;
      const [asgn] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND status = 'active' LIMIT 1`,
        [a.assignedTo]
      );
      if (asgn) {
        await createNotification({
          companyId: company.id, assignmentId: asgn.id,
          type: "crm_overdue",
          title: `متابعة CRM متأخرة: ${a.oppTitle}`,
          body: `نشاط متأخر أكثر من 3 أيام`,
          priority: "high", refType: "crm_opportunities", refId: a.opportunityId,
        });
        actions++;
      }
    }
  }
  return `CRM check: ${actions} overdue escalations`;
}

async function dailySlaGeneral(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let updated = 0;
  for (const company of companies) {
    const { affectedRows } = await rawExecute(
      `UPDATE support_tickets SET "slaBreached" = true
       WHERE "companyId" = $1 AND status IN ('open','in_progress') AND "slaBreached" = false
         AND "slaDeadline" IS NOT NULL AND "slaDeadline" < NOW()`,
      [company.id]
    );
    updated += affectedRows;
  }
  return `General SLA check: ${updated} tickets breached`;
}

async function monthlyRentPenalties(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let penalties = 0;
  for (const company of companies) {
    const overduePayments = await rawQuery<any>(
      `SELECT rp.id, rp."dueDate", rp.amount, c.id AS "contractId", c."tenantName"
       FROM rent_payments rp JOIN rental_contracts c ON c.id = rp."contractId"
       WHERE c."companyId" = $1 AND rp.status IN ('pending','partial')
         AND rp."dueDate" < CURRENT_DATE - INTERVAL '30 days'`,
      [company.id]
    );
    for (const p of overduePayments) {
      const lateDays = Math.floor((Date.now() - new Date(p.dueDate).getTime()) / 86400000);
      const existing = await rawQuery<any>(
        `SELECT id FROM late_rent_actions WHERE "paymentId" = $1 AND phase = 'penalty_applied' LIMIT 1`,
        [p.id]
      );
      if (existing.length > 0) continue;

      const lateFee = Number(p.amount) * 0.02;
      await rawExecute(`UPDATE rent_payments SET amount = amount + $1 WHERE id = $2`, [lateFee, p.id]);
      await rawExecute(
        `INSERT INTO late_rent_actions ("contractId","paymentId",phase,action,"sentAt",notes) VALUES ($1,$2,'penalty_applied','غرامة تأخير تلقائية',NOW(),$3)`,
        [p.contractId, p.id, `تأخر ${lateDays} يوم — غرامة ${lateFee} ريال`]
      ).catch(() => {});
      penalties++;
    }
  }
  return `Monthly rent penalties: ${penalties}`;
}

async function monthlyPayrollPrep(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let actions = 0;
  for (const company of companies) {
    const [hrAsgn] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (hrAsgn) {
      const [pending] = await rawQuery<any>(
        `SELECT COUNT(*) AS count FROM payroll_runs WHERE "companyId" = $1 AND status = 'draft'`,
        [company.id]
      );
      if (Number(pending?.count) > 0) {
        await createNotification({
          companyId: company.id, assignmentId: hrAsgn.id,
          type: "payroll_reminder",
          title: "تذكير: مسير رواتب معلّق",
          body: `يوجد ${pending.count} مسير رواتب بحالة مسودة — يرجى المراجعة قبل نهاية الشهر`,
          priority: "high",
        });
        actions++;
      }
    }
  }
  return `Payroll prep: ${actions} reminders`;
}

async function monthlyClosingPrep(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let actions = 0;
  for (const company of companies) {
    const [ownerAsgn] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('finance_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (ownerAsgn) {
      await createNotification({
        companyId: company.id, assignmentId: ownerAsgn.id,
        type: "monthly_closing",
        title: "تذكير: إقفال الشهر",
        body: "يرجى مراجعة القيود المحاسبية وإقفال الفترة المالية",
        priority: "high",
      });
      actions++;
    }
  }
  return `Monthly closing: ${actions} reminders`;
}

async function weeklyHrReport(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let sent = 0;
  for (const company of companies) {
    const [stats] = await rawQuery<any>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'active') AS active,
         COUNT(*) FILTER (WHERE "joinDate" >= CURRENT_DATE - INTERVAL '7 days') AS "newHires"
       FROM employee_assignments WHERE "companyId" = $1`,
      [company.id]
    );
    const [hrAsgn] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (hrAsgn) {
      await createNotification({
        companyId: company.id, assignmentId: hrAsgn.id,
        type: "weekly_hr_report",
        title: "تقرير HR الأسبوعي",
        body: `إجمالي: ${stats?.total || 0} — نشط: ${stats?.active || 0} — توظيف جديد: ${stats?.newHires || 0}`,
        priority: "normal",
      });
      sent++;
    }
  }
  return `Weekly HR reports: ${sent}`;
}

async function weeklyFleetReport(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let sent = 0;
  for (const company of companies) {
    const [stats] = await rawQuery<any>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'active') AS active
       FROM fleet_vehicles WHERE "companyId" = $1`,
      [company.id]
    );
    const [mgrAsgn] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('branch_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (mgrAsgn) {
      await createNotification({
        companyId: company.id, assignmentId: mgrAsgn.id,
        type: "weekly_fleet_report",
        title: "تقرير الأسطول الأسبوعي",
        body: `إجمالي المركبات: ${stats?.total || 0} — نشطة: ${stats?.active || 0}`,
        priority: "normal",
      });
      sent++;
    }
  }
  return `Weekly fleet reports: ${sent}`;
}

async function weeklyCrmReport(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let sent = 0;
  for (const company of companies) {
    const [stats] = await rawQuery<any>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE stage = 'closed_won') AS won,
              COALESCE(SUM(value) FILTER (WHERE stage = 'closed_won'), 0) AS "wonValue"
       FROM crm_opportunities WHERE "companyId" = $1
         AND "createdAt" >= CURRENT_DATE - INTERVAL '7 days'`,
      [company.id]
    );
    const [mgrAsgn] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('branch_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (mgrAsgn) {
      await createNotification({
        companyId: company.id, assignmentId: mgrAsgn.id,
        type: "weekly_crm_report",
        title: "تقرير CRM الأسبوعي",
        body: `فرص جديدة: ${stats?.total || 0} — فائزة: ${stats?.won || 0} — قيمة: ${stats?.wonValue || 0} ريال`,
        priority: "normal",
      });
      sent++;
    }
  }
  return `Weekly CRM reports: ${sent}`;
}

async function weeklyCashFlowCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let alerts = 0;
  for (const company of companies) {
    const [income] = await rawQuery<any>(
      `SELECT COALESCE(SUM("paidAmount"), 0) AS total FROM invoices WHERE "companyId" = $1 AND "createdAt" >= CURRENT_DATE - INTERVAL '7 days'`,
      [company.id]
    );
    const [expenses] = await rawQuery<any>(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE "companyId" = $1 AND "createdAt" >= CURRENT_DATE - INTERVAL '7 days'`,
      [company.id]
    );
    const netFlow = Number(income?.total || 0) - Number(expenses?.total || 0);
    if (netFlow < 0) {
      await broadcastAlert(
        company.id, "negative_cash_flow",
        "تدفق نقدي سلبي هذا الأسبوع",
        `الإيرادات: ${income?.total || 0} — المصروفات: ${expenses?.total || 0} — الصافي: ${netFlow}`,
        "warning"
      );
      alerts++;
    }
  }
  return `Cash flow: ${alerts} negative alerts`;
}

async function weeklyPropertyRevenue(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let reports = 0;
  for (const company of companies) {
    const [stats] = await rawQuery<any>(
      `SELECT COALESCE(SUM(CASE WHEN rp.status = 'paid' THEN rp.amount ELSE 0 END), 0) AS paid,
              COALESCE(SUM(CASE WHEN rp.status IN ('pending','partial') THEN rp.amount ELSE 0 END), 0) AS pending
       FROM rent_payments rp
       JOIN rental_contracts rc ON rc.id = rp."contractId"
       WHERE rc."companyId" = $1
         AND rp."dueDate" >= CURRENT_DATE - INTERVAL '7 days'`,
      [company.id]
    );
    const [ownerAsgn] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('finance_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (ownerAsgn) {
      await createNotification({
        companyId: company.id, assignmentId: ownerAsgn.id,
        type: "weekly_property_revenue",
        title: "إيرادات عقارية أسبوعية",
        body: `محصّل: ${stats?.paid || 0} — معلّق: ${stats?.pending || 0} ريال`,
        priority: "normal",
      });
      reports++;
    }
  }
  return `Property revenue reports: ${reports}`;
}

async function weeklyClientClassification(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let classified = 0;
  for (const company of companies) {
    const clients = await rawQuery<any>(
      `SELECT c.id, c.name, c.classification,
              COALESCE(c."totalRevenue", 0) AS revenue,
              (SELECT MAX(i."createdAt") FROM invoices i WHERE i."clientId" = c.id) AS "lastInvoice"
       FROM clients c WHERE c."companyId" = $1`,
      [company.id]
    );
    for (const client of clients) {
      const rev = Number(client.revenue);
      const lastInvoice = client.lastInvoice ? new Date(client.lastInvoice) : null;
      const monthsSinceLastInvoice = lastInvoice
        ? (Date.now() - lastInvoice.getTime()) / (30 * 86400000)
        : 999;

      let newClass: string;
      if (monthsSinceLastInvoice >= 12) newClass = "churned";
      else if (rev >= 100000) newClass = "vip";
      else if (rev >= 30000) newClass = "premium";
      else if (rev > 0) newClass = "regular";
      else newClass = "prospect";

      if (newClass !== client.classification) {
        await rawExecute(
          `UPDATE clients SET classification = $1 WHERE id = $2`,
          [newClass, client.id]
        );
        classified++;
      }
    }
  }
  return `Client classification: ${classified} updated`;
}

async function monthlyInventoryAudit(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let issues = 0;
  for (const company of companies) {
    const negative = await rawQuery<any>(
      `SELECT id, name, "currentStock" FROM warehouse_products
       WHERE "companyId" = $1 AND "currentStock" < 0`,
      [company.id]
    );
    issues += negative.length;
    for (const p of negative) {
      await broadcastAlert(
        company.id, "negative_stock",
        `مخزون سالب: ${p.name}`,
        `الكمية: ${p.currentStock} — يرجى المراجعة`,
        "warning", "warehouse_product", p.id
      );
    }
  }
  return `Monthly inventory audit: ${issues} issues`;
}

async function yearlyLeaveBalanceRenewal(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  const year = new Date().getFullYear();
  let renewed = 0;
  for (const company of companies) {
    const balances = await rawQuery<any>(
      `SELECT DISTINCT lb."employeeId", lb."leaveTypeId", lt.annual
       FROM hr_leave_balances lb
       JOIN hr_leave_types lt ON lt.id = lb."leaveTypeId"
       WHERE lb."companyId" = $1 AND lb.year = $2 - 1`,
      [company.id, year]
    );
    for (const b of balances) {
      await rawExecute(
        `INSERT INTO hr_leave_balances ("companyId", "employeeId", "leaveTypeId", year, total, used, reserved)
         VALUES ($1, $2, $3, $4, $5, 0, 0)
         ON CONFLICT DO NOTHING`,
        [company.id, b.employeeId, b.leaveTypeId, year, b.annual || 21]
      ).catch(() => {});
      renewed++;
    }
  }
  return `Leave balance renewal: ${renewed} for year ${year}`;
}

async function dailyNotificationCleanup(): Promise<string> {
  const { affectedRows } = await rawExecute(
    `DELETE FROM notifications WHERE "isRead"=true AND "readAt" < NOW() - INTERVAL '30 days'`,
    []
  );
  return `Cleaned up ${affectedRows} old notifications`;
}

async function probationAlertCheck(): Promise<string> {
  const contracts = await rawQuery<any>(
    `SELECT ec.id, ec."companyId", ec."employeeId", ec."assignmentId", ec."probationEndDate",
            e.name AS "employeeName"
     FROM employee_contracts ec
     JOIN employees e ON e.id = ec."employeeId"
     WHERE ec."probationStatus" = 'active' AND ec."probationAlertSent" = false
       AND ec."probationEndDate" <= CURRENT_DATE + INTERVAL '14 days'`
  );

  let alerted = 0;
  for (const contract of contracts) {
    const daysLeft = Math.ceil((new Date(contract.probationEndDate).getTime() - Date.now()) / 86400000);
    const [hrAssignment] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [contract.companyId]
    );
    if (hrAssignment) {
      await createNotification({
        companyId: contract.companyId, assignmentId: hrAssignment.id,
        type: "probation_alert", title: "تنبيه انتهاء فترة تجربة",
        body: `فترة تجربة الموظف ${contract.employeeName} تنتهي خلال ${daysLeft} يوم. يرجى اتخاذ قرار التثبيت.`,
        priority: "high", refType: "employee", refId: contract.employeeId,
      });
    }
    await rawExecute(
      `UPDATE employee_contracts SET "probationAlertSent" = true WHERE id = $1`,
      [contract.id]
    );
    if (daysLeft <= 0) {
      await rawExecute(
        `UPDATE employee_contracts SET "probationStatus" = 'completed' WHERE id = $1`,
        [contract.id]
      );
    }
    alerted++;
  }
  return `Probation alerts: ${alerted}`;
}

async function processEmailQueue(): Promise<string> {
  const pending = await rawQuery<any>(
    `SELECT eq.*, i.config AS "smtpSettings"
     FROM email_queue eq
     LEFT JOIN LATERAL (
       SELECT config FROM integrations
       WHERE "companyId" = eq."companyId" AND type IN ('smtp', 'email') AND status = 'active'
       ORDER BY id DESC LIMIT 1
     ) i ON true
     WHERE eq.status = 'pending'
     ORDER BY eq."createdAt" ASC
     LIMIT 50`
  );

  if (pending.length === 0) return "No pending emails";

  let sent = 0, failed = 0;

  for (const email of pending) {
    try {
      const smtp = email.smtpSettings ?? null;

      if (!smtp || !smtp.host) {
        await rawExecute(
          `UPDATE email_queue SET status = 'failed', "errorMessage" = $1, "attemptCount" = COALESCE("attemptCount",0) + 1, "updatedAt" = NOW() WHERE id = $2`,
          ["No active SMTP integration configured for this company", email.id]
        );
        failed++;
        continue;
      }

      const { createTransport } = await import("nodemailer");
      const transporter = createTransport({
        host: smtp.host,
        port: Number(smtp.port ?? 587),
        secure: smtp.secure === true || smtp.port === 465,
        auth: smtp.user && smtp.password ? { user: smtp.user, pass: smtp.password } : undefined,
      });

      const mailOptions: Record<string, unknown> = {
        from: smtp.from ?? smtp.user ?? "noreply@ghayth.app",
        to: email.toEmail,
        subject: email.subject,
        html: email.body ?? email.text,
      };
      const meta = email.metadata ?? null;
      if (meta?.attachments && Array.isArray(meta.attachments) && meta.attachments.length > 0) {
        mailOptions.attachments = meta.attachments.map((a: { filename: string; content: string; contentType: string; encoding?: string }) => ({
          filename: a.filename,
          content: Buffer.from(a.content, (a.encoding as BufferEncoding | undefined) ?? "base64"),
          contentType: a.contentType,
        }));
      }
      await transporter.sendMail(mailOptions);

      await rawExecute(
        `UPDATE email_queue SET status = 'sent', "sentAt" = NOW(), "attemptCount" = COALESCE("attemptCount",0) + 1, "updatedAt" = NOW() WHERE id = $1`,
        [email.id]
      );
      sent++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      await rawExecute(
        `UPDATE email_queue SET status = 'failed', "errorMessage" = $1, "attemptCount" = COALESCE("attemptCount",0) + 1, "updatedAt" = NOW() WHERE id = $2`,
        [errMsg, email.id]
      ).catch(console.error);
      failed++;
    }
  }

  return `Email queue: ${sent} sent, ${failed} failed`;
}

async function hourlyWorkflowSlaCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let totalWarnings = 0, totalEscalations = 0, totalAutoApprovals = 0;
  for (const company of companies) {
    try {
      const result = await checkSlaStatus(company.id);
      totalWarnings += result.warnings;
      totalEscalations += result.escalations;
      totalAutoApprovals += result.autoApprovals;
    } catch (err) {
      console.error(`[CRON] Workflow SLA check failed for company ${company.id}:`, err);
    }
  }
  return `Workflow SLA: ${totalWarnings} warnings, ${totalEscalations} escalations, ${totalAutoApprovals} auto-approvals`;
}

async function processSmsQueue(): Promise<string> {
  const pending = await rawQuery<any>(
    `SELECT sq.*, ss_sid.value AS "accountSid", ss_token.value AS "authToken", ss_from.value AS "fromNumber",
            COALESCE(ss_enabled.value, 'true') AS "channelEnabled"
     FROM sms_queue sq
     LEFT JOIN system_settings ss_sid ON ss_sid.key='sms_account_sid' AND ss_sid."companyId"=sq."companyId"
     LEFT JOIN system_settings ss_token ON ss_token.key='sms_auth_token' AND ss_token."companyId"=sq."companyId"
     LEFT JOIN system_settings ss_from ON ss_from.key='sms_from_number' AND ss_from."companyId"=sq."companyId"
     LEFT JOIN system_settings ss_enabled ON ss_enabled.key='sms_enabled' AND ss_enabled."companyId"=sq."companyId"
     WHERE sq.status='pending' AND COALESCE(sq."attemptCount",0) < 3
     ORDER BY sq."createdAt" ASC LIMIT 50`
  );

  let sent = 0, failed = 0, skipped = 0;

  for (const sms of pending) {
    if (sms.channelEnabled === "false") {
      await rawExecute(
        `UPDATE sms_queue SET "errorMessage"='قناة SMS معطلة — سيتم الإرسال عند التفعيل', "updatedAt"=NOW() WHERE id=$1`,
        [sms.id]
      );
      skipped++;
      continue;
    }
    if (!sms.accountSid || !sms.authToken || !sms.fromNumber) {
      await rawExecute(
        `UPDATE sms_queue SET "errorMessage"='بيانات Twilio غير مضبوطة — يرجى إعداد المفاتيح في الإعدادات', "updatedAt"=NOW() WHERE id=$1`,
        [sms.id]
      );
      skipped++;
      continue;
    }

    try {
      const credentials = Buffer.from(`${sms.accountSid}:${sms.authToken}`).toString("base64");
      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${sms.accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: sms.recipientPhone,
            From: sms.fromNumber,
            Body: sms.message,
          }).toString(),
        }
      );

      if (resp.ok) {
        const data = await resp.json() as { sid?: string };
        await rawExecute(
          `UPDATE sms_queue SET status='sent', "externalId"=$1, "sentAt"=NOW(), "attemptCount"=COALESCE("attemptCount",0)+1, "updatedAt"=NOW() WHERE id=$2`,
          [data.sid ?? null, sms.id]
        );
        sent++;
      } else {
        const errText = await resp.text();
        const newCount = (sms.attemptCount ?? 0) + 1;
        const newStatus = newCount >= 3 ? "failed" : "pending";
        await rawExecute(
          `UPDATE sms_queue SET status=$1, "errorMessage"=$2, "attemptCount"=$3, "updatedAt"=NOW() WHERE id=$4`,
          [newStatus, errText.substring(0, 500), newCount, sms.id]
        );
        failed++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const newCount = (sms.attemptCount ?? 0) + 1;
      const newStatus = newCount >= 3 ? "failed" : "pending";
      await rawExecute(
        `UPDATE sms_queue SET status=$1, "errorMessage"=$2, "attemptCount"=$3, "updatedAt"=NOW() WHERE id=$4`,
        [newStatus, errMsg, newCount, sms.id]
      );
      failed++;
    }
  }

  return `SMS queue: ${sent} sent, ${failed} failed, ${skipped} skipped (no config)`;
}

async function processWhatsAppQueue(): Promise<string> {
  const pending = await rawQuery<any>(
    `SELECT wq.*, ss_token.value AS "accessToken", ss_phone.value AS "phoneNumberId",
            COALESCE(ss_enabled.value, 'true') AS "channelEnabled"
     FROM whatsapp_queue wq
     LEFT JOIN system_settings ss_token ON ss_token.key='whatsapp_access_token' AND ss_token."companyId"=wq."companyId"
     LEFT JOIN system_settings ss_phone ON ss_phone.key='whatsapp_phone_id' AND ss_phone."companyId"=wq."companyId"
     LEFT JOIN system_settings ss_enabled ON ss_enabled.key='whatsapp_enabled' AND ss_enabled."companyId"=wq."companyId"
     WHERE wq.status='pending' AND COALESCE(wq."attemptCount",0) < 3
     ORDER BY wq."createdAt" ASC LIMIT 50`
  );

  let sent = 0, failed = 0, skipped = 0;

  for (const msg of pending) {
    if (msg.channelEnabled === "false") {
      await rawExecute(
        `UPDATE whatsapp_queue SET "errorMessage"='قناة واتساب معطلة — سيتم الإرسال عند التفعيل', "updatedAt"=NOW() WHERE id=$1`,
        [msg.id]
      );
      skipped++;
      continue;
    }
    if (!msg.accessToken || !msg.phoneNumberId) {
      await rawExecute(
        `UPDATE whatsapp_queue SET "errorMessage"='بيانات Meta API غير مضبوطة — يرجى إعداد المفاتيح في الإعدادات', "updatedAt"=NOW() WHERE id=$1`,
        [msg.id]
      );
      skipped++;
      continue;
    }

    try {
      const resp = await fetch(
        `https://graph.facebook.com/v18.0/${msg.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${msg.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: msg.phone,
            type: "text",
            text: { body: msg.message },
          }),
        }
      );

      if (resp.ok) {
        const data = await resp.json() as { messages?: { id?: string }[] };
        const msgId = data?.messages?.[0]?.id ?? null;
        await rawExecute(
          `UPDATE whatsapp_queue SET status='sent', "externalId"=$1, "sentAt"=NOW(), "attemptCount"=COALESCE("attemptCount",0)+1, "updatedAt"=NOW() WHERE id=$2`,
          [msgId, msg.id]
        );
        sent++;
      } else {
        const errText = await resp.text();
        const newCount = (msg.attemptCount ?? 0) + 1;
        const newStatus = newCount >= 3 ? "failed" : "pending";
        await rawExecute(
          `UPDATE whatsapp_queue SET status=$1, "errorMessage"=$2, "attemptCount"=$3, "updatedAt"=NOW() WHERE id=$4`,
          [newStatus, errText.substring(0, 500), newCount, msg.id]
        );
        failed++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const newCount = (msg.attemptCount ?? 0) + 1;
      const newStatus = newCount >= 3 ? "failed" : "pending";
      await rawExecute(
        `UPDATE whatsapp_queue SET status=$1, "errorMessage"=$2, "attemptCount"=$3, "updatedAt"=NOW() WHERE id=$4`,
        [newStatus, errMsg, newCount, msg.id]
      );
      failed++;
    }
  }

  return `WhatsApp queue: ${sent} sent, ${failed} failed, ${skipped} skipped (no config)`;
}

async function weeklyLogsArchiving(): Promise<string> {
  const AUDIT_LOG_RETENTION_DAYS = 180;
  const INTEGRATION_LOG_RETENTION_DAYS = 90;

  let auditArchived = 0;
  let integrationArchived = 0;

  try {
    const auditCutoff = new Date();
    auditCutoff.setDate(auditCutoff.getDate() - AUDIT_LOG_RETENTION_DAYS);

    const auditResult = await rawQuery<{ id: number }>(
      `WITH moved AS (
         DELETE FROM audit_logs
         WHERE "createdAt" < $1
         RETURNING *
       )
       INSERT INTO audit_logs_archive SELECT * FROM moved
       RETURNING id`,
      [auditCutoff.toISOString()]
    );
    auditArchived = auditResult.length;
  } catch (err) {
    console.error("[CRON] weeklyLogsArchiving: audit_logs archiving failed:", err);
  }

  try {
    const integrationCutoff = new Date();
    integrationCutoff.setDate(integrationCutoff.getDate() - INTEGRATION_LOG_RETENTION_DAYS);

    const integrationResult = await rawQuery<{ id: number }>(
      `WITH moved AS (
         DELETE FROM integration_logs
         WHERE "createdAt" < $1
         RETURNING *
       )
       INSERT INTO integration_logs_archive SELECT * FROM moved
       RETURNING id`,
      [integrationCutoff.toISOString()]
    );
    integrationArchived = integrationResult.length;
  } catch (err) {
    console.error("[CRON] weeklyLogsArchiving: integration_logs archiving failed:", err);
  }

  return `Archived ${auditArchived} audit logs (>${AUDIT_LOG_RETENTION_DAYS}d old), ${integrationArchived} integration logs (>${INTEGRATION_LOG_RETENTION_DAYS}d old)`;
}

async function monthlyAutoDepreciation(): Promise<string> {
  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let processed = 0;
  let totalDepreciated = 0;

  for (const company of companies) {
    const assets = await rawQuery<any>(
      `SELECT fa.* FROM fixed_assets fa
       WHERE fa."companyId" = $1 AND fa.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM depreciation_entries de WHERE de."assetId" = fa.id AND de.period = $2
         )`,
      [company.id, period]
    );

    const [systemBranch] = await rawQuery<any>(
      `SELECT id FROM branches WHERE "companyId" = $1 LIMIT 1`,
      [company.id]
    );
    const branchId = systemBranch?.id ?? null;

    const [systemUser] = await rawQuery<any>(
      `SELECT ea.id FROM employee_assignments ea WHERE ea."companyId" = $1 AND ea.role IN ('finance_manager','general_manager','owner') AND ea.status='active' ORDER BY ea.role='owner' DESC LIMIT 1`,
      [company.id]
    );
    if (!systemUser) {
      console.warn(`[CRON] monthlyAutoDepreciation: No finance/owner user found for company ${company.id}, skipping`);
      continue;
    }
    const createdBy = systemUser.id;

    for (const asset of assets) {
      const purchaseCost = Number(asset.purchaseCost);
      const salvageValue = Number(asset.salvageValue);
      const usefulLife = Number(asset.usefulLifeYears);
      const currentBookValue = Number(asset.currentBookValue ?? asset.purchaseCost);
      let depAmount = 0;

      if (!usefulLife || usefulLife <= 0) continue;

      if (asset.depreciationMethod === "declining_balance") {
        depAmount = Math.max(0, Math.round(currentBookValue * (2 / usefulLife / 12) * 100) / 100);
      } else {
        depAmount = Math.max(0, Math.round((purchaseCost - salvageValue) / (usefulLife * 12) * 100) / 100);
      }

      if (currentBookValue - depAmount < salvageValue) {
        depAmount = Math.max(0, currentBookValue - salvageValue);
      }
      if (depAmount <= 0) continue;

      const newAccumulated = Number(asset.accumulatedDepreciation) + depAmount;
      const newBookValue = Math.max(purchaseCost - newAccumulated, salvageValue);

      try {
        const pool = await import("./rawdb.js");
        const client = await pool.pool.connect();
        try {
          await client.query("BEGIN");
          const jeRes = await client.query(
            `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type)
             VALUES ($1,$2,$3,$4,$5,'depreciation') RETURNING id`,
            [company.id, asset.branchId ?? branchId, createdBy,
             `DEP-AUTO-${asset.code ?? asset.id}-${period}`,
             `إهلاك تلقائي: ${asset.name} — ${period}`]
          );
          const journalId = jeRes.rows[0].id;
          await client.query(
            `INSERT INTO journal_lines ("journalId","accountCode",debit,credit) VALUES ($1,$2,$3,0)`,
            [journalId, asset.depreciationAccountCode ?? "6100", depAmount]
          );
          await client.query(
            `INSERT INTO journal_lines ("journalId","accountCode",debit,credit) VALUES ($1,$2,0,$3)`,
            [journalId, asset.accDepreciationAccountCode ?? "1590", depAmount]
          );
          await client.query(
            `INSERT INTO depreciation_entries ("assetId","companyId",period,"depreciationAmount","bookValueAfter","journalEntryId",status,"postedAt")
             VALUES ($1,$2,$3,$4,$5,$6,'posted',NOW())`,
            [asset.id, company.id, period, depAmount, newBookValue, journalId]
          );
          await client.query(
            `UPDATE fixed_assets SET "accumulatedDepreciation"=$1, "currentBookValue"=$2, "updatedAt"=NOW() WHERE id=$3`,
            [newAccumulated, newBookValue, asset.id]
          );
          await client.query("COMMIT");
          processed++;
          totalDepreciated += depAmount;
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`[CRON] Depreciation failed for asset ${asset.id}:`, err);
        } finally {
          client.release();
        }
      } catch (err) {
        console.error(`[CRON] Depreciation pool error for asset ${asset.id}:`, err);
      }
    }
  }
  return `Monthly depreciation: ${processed} assets processed, total = ${totalDepreciated.toFixed(2)}`;
}

async function runScheduledReports(): Promise<string> {
  const tz = await getSystemTimezone();
  const now = new Date();

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    weekday: "short",
    day: "numeric",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = parseInt(getPart("hour"), 10);
  const weekdayStr = getPart("weekday");
  const dayOfMonth = parseInt(getPart("day"), 10);
  const dayOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayStr);

  const activeReports = await rawQuery<any>(
    `SELECT * FROM scheduled_reports WHERE "isActive" = true`
  );

  let sent = 0;
  let errors = 0;

  for (const report of activeReports) {
    let shouldRun = false;
    if (report.frequency === "daily" && hour === 7) shouldRun = true;
    if (report.frequency === "weekly" && dayOfWeek === 0 && hour === 7) shouldRun = true;
    if (report.frequency === "monthly" && dayOfMonth === 1 && hour === 7) shouldRun = true;
    if (!shouldRun) continue;

    try {
      const recipients: string[] = report.recipients || [];
      const params = report.params || {};

      const { exportTrialBalanceExcel, exportIncomeStatementExcel, exportPayrollExcel, exportAttendanceExcel } = await import("./excelExport.js");
      const { exportTrialBalancePdf } = await import("./pdfExport.js");

      let attachment: { filename: string; content: Buffer; contentType: string } | undefined;

      if (report.reportType === "trial-balance") {
        const buf = await exportTrialBalanceExcel(report.companyId, params.startDate, params.endDate);
        attachment = { filename: "trial-balance.xlsx", content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
      } else if (report.reportType === "income-statement") {
        const buf = await exportIncomeStatementExcel(report.companyId, params.startDate, params.endDate);
        attachment = { filename: "income-statement.xlsx", content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
      } else if (report.reportType === "payroll") {
        const buf = await exportPayrollExcel(report.companyId, params.period);
        attachment = { filename: "payroll.xlsx", content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
      } else if (report.reportType === "attendance") {
        const buf = await exportAttendanceExcel(report.companyId, params.startDate, params.endDate);
        attachment = { filename: "attendance.xlsx", content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
      } else if (report.reportType === "trial-balance-pdf") {
        const buf = await exportTrialBalancePdf(report.companyId, params.startDate, params.endDate);
        attachment = { filename: "trial-balance.pdf", content: buf, contentType: "application/pdf" };
      }

      if (attachment) {
        let queued = 0;
        let emailError: string | undefined;
        const subject = `[تقرير مجدول] ${report.title}`;
        const body = `مرفق تقرير <strong>${report.title}</strong> بتاريخ ${now.toLocaleDateString("ar-SA")}. تم إرساله تلقائياً من نظام غيث ERP.`;
        const attachmentBase64 = attachment.content.toString("base64");

        if (recipients.length > 0) {
          try {
            const metadataJson = JSON.stringify({
              attachments: [{
                filename: attachment.filename,
                content: attachmentBase64,
                contentType: attachment.contentType,
                encoding: "base64",
              }],
            });
            for (const email of recipients) {
              await rawExecute(
                `INSERT INTO email_queue ("companyId", "toEmail", "recipientName", subject, body, metadata, status, "createdAt")
                 VALUES ($1, $2, '', $3, $4, $5::jsonb, 'pending', NOW())`,
                [report.companyId, email, subject, body, metadataJson]
              );
              queued++;
            }
          } catch (queueErr) {
            emailError = queueErr instanceof Error ? queueErr.message : String(queueErr);
          }
        }

        const historyStatus = queued > 0 ? "sent" : (recipients.length === 0 ? "generated" : "failed");
        await rawExecute(
          `INSERT INTO scheduled_report_history ("scheduledReportId", status, "sentAt", recipients, error)
           VALUES ($1, $2, NOW(), $3, $4)`,
          [report.id, historyStatus, JSON.stringify(recipients), emailError ?? null]
        );
        if (queued > 0 || recipients.length === 0) {
          await rawExecute(
            `UPDATE scheduled_reports SET "lastSentAt" = NOW() WHERE id = $1`,
            [report.id]
          );
          sent++;
        } else {
          errors++;
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`[CRON] runScheduledReports: failed for report ${report.id}:`, err);
      await rawExecute(
        `INSERT INTO scheduled_report_history ("scheduledReportId", status, "sentAt", error)
         VALUES ($1, 'failed', NOW(), $2)`,
        [report.id, errMsg]
      ).catch(() => {});
      errors++;
    }
  }

  return `Sent ${sent} scheduled reports, ${errors} errors`;
}

async function govExpiryAlerts(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let alerted = 0;

  for (const company of companies) {
    const [hrAsgn] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
      [company.id]
    );
    if (!hrAsgn) continue;

    const expiringEmployees = await rawQuery<any>(
      `SELECT e.id, e.name, e."iqamaNumber", e."iqamaExpiry", e."visaExpiry", e."workPermitExpiry",
              (e."iqamaExpiry"::date - CURRENT_DATE) AS "iqamaDaysLeft",
              (e."visaExpiry"::date - CURRENT_DATE) AS "visaDaysLeft",
              (e."workPermitExpiry"::date - CURRENT_DATE) AS "workPermitDaysLeft"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea.status = 'active'
       WHERE ea."companyId" = $1 AND e.status = 'active'
         AND (
           (e."iqamaExpiry" IS NOT NULL AND e."iqamaExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')
           OR (e."visaExpiry" IS NOT NULL AND e."visaExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')
           OR (e."workPermitExpiry" IS NOT NULL AND e."workPermitExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')
         )`,
      [company.id]
    );

    for (const emp of expiringEmployees) {
      const checks = [
        { label: "إقامة", daysLeft: Number(emp.iqamaDaysLeft ?? 999) },
        { label: "تأشيرة", daysLeft: Number(emp.visaDaysLeft ?? 999) },
        { label: "رخصة عمل", daysLeft: Number(emp.workPermitDaysLeft ?? 999) },
      ];
      for (const check of checks) {
        if (check.daysLeft <= 30 && check.daysLeft >= 0 && [30, 15, 7, 3, 1].includes(check.daysLeft)) {
          await createNotification({
            companyId: company.id, assignmentId: hrAsgn.id,
            type: "gov_expiry_alert",
            title: `${check.label} تنتهي: ${emp.name}`,
            body: `${check.label} الموظف ${emp.name} (${emp.iqamaNumber || "-"}) تنتهي خلال ${check.daysLeft} يوم — يرجى تجديدها عبر نظام مقيم`,
            priority: check.daysLeft <= 7 ? "high" : "normal",
            refType: "employee", refId: emp.id,
          });
          alerted++;
        }
      }
    }

    const expiringVehicles = await rawQuery<any>(
      `SELECT fv.id, fv."plateNumber", fv.make, fv.model,
              (fv."registrationExpiry"::date - CURRENT_DATE) AS "registrationDaysLeft",
              (fv."nextInspectionDate"::date - CURRENT_DATE) AS "inspectionDaysLeft"
       FROM fleet_vehicles fv
       WHERE fv."companyId" = $1 AND fv.status != 'decommissioned'
         AND (
           (fv."registrationExpiry" IS NOT NULL AND fv."registrationExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')
           OR (fv."nextInspectionDate" IS NOT NULL AND fv."nextInspectionDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days')
         )`,
      [company.id]
    );

    for (const v of expiringVehicles) {
      const checks = [
        { label: "استمارة المركبة", daysLeft: Number(v.registrationDaysLeft ?? 999) },
        { label: "الفحص الدوري", daysLeft: Number(v.inspectionDaysLeft ?? 999) },
      ];
      for (const check of checks) {
        if (check.daysLeft <= 30 && check.daysLeft >= 0 && [30, 15, 7, 3, 1].includes(check.daysLeft)) {
          await createNotification({
            companyId: company.id, assignmentId: hrAsgn.id,
            type: "gov_expiry_alert",
            title: `${check.label} تنتهي: ${v.plateNumber}`,
            body: `${check.label} للمركبة ${v.plateNumber} (${v.make} ${v.model}) تنتهي خلال ${check.daysLeft} يوم — يرجى التجديد عبر نظام تم`,
            priority: check.daysLeft <= 7 ? "high" : "normal",
            refType: "fleet_vehicle", refId: v.id,
          });
          alerted++;
        }
      }
    }
  }

  return `Gov expiry alerts: ${alerted} notifications sent`;
}

const JOB_DEFINITIONS: CronJobDef[] = [
  { name: "gov_expiry_alerts", description: "تنبيهات انتهاء الإقامات والاستمارات (مقيم/تم)", schedule: "0 7 * * *", handler: govExpiryAlerts },
  { name: "document_expiry_alerts", description: "تنبيهات انتهاء وثائق الموظفين", schedule: "0 6 * * *", handler: documentExpiryAlerts },
  { name: "contract_expiry_alerts", description: "تنبيهات انتهاء العقود", schedule: "0 6 * * *", handler: contractExpiryAlerts },
  { name: "fleet_status_check", description: "فحص حالة الأسطول", schedule: "0 6 * * *", handler: fleetStatusCheck },
  { name: "leave_escalation_check", description: "تصعيد طلبات الإجازة", schedule: "0 7 * * *", handler: leaveEscalationCheck },
  { name: "daily_attendance_reconciliation", description: "مطابقة الحضور والغياب", schedule: "0 11 * * *", handler: reconcileAttendance },
  { name: "hourly_sla_escalation", description: "تصعيد SLA كل ساعة", schedule: "0 * * * *", handler: hourlySlaEscalation },
  { name: "hourly_approval_escalation", description: "تصعيد الموافقات كل ساعة", schedule: "0 * * * *", handler: hourlyApprovalEscalation },
  { name: "daily_deduction_check", description: "خصومات الغياب اليومية", schedule: "0 23 * * *", handler: dailyDeductionCheck },
  { name: "daily_invoice_overdue", description: "تصعيد الفواتير المتأخرة 6 مراحل", schedule: "0 8 * * *", handler: dailyInvoiceOverdueEscalation },
  { name: "daily_fuel_monitor", description: "مراقبة استهلاك الوقود", schedule: "0 9 * * *", handler: dailyFuelMonitor },
  { name: "daily_inventory_check", description: "فحص المخزون + طلب شراء تلقائي", schedule: "0 10 * * *", handler: dailyInventoryCheck },
  { name: "daily_property_check", description: "فحص عقود الأملاك", schedule: "0 8 * * *", handler: dailyPropertyCheck },
  { name: "daily_legal_check", description: "فحص القضايا القانونية", schedule: "0 8 * * *", handler: dailyLegalCheck },
  { name: "daily_project_check", description: "فحص تأخر المشاريع", schedule: "0 9 * * *", handler: dailyProjectCheck },
  { name: "daily_crm_check", description: "فحص متابعات CRM", schedule: "0 10 * * *", handler: dailyCrmCheck },
  { name: "daily_sla_general", description: "فحص SLA العام", schedule: "0 11 * * *", handler: dailySlaGeneral },
  { name: "monthly_rent_penalties", description: "غرامات الإيجارات المتأخرة", schedule: "0 6 1 * *", handler: monthlyRentPenalties },
  { name: "monthly_payroll_prep", description: "تذكير الرواتب يوم 25", schedule: "0 8 25 * *", handler: monthlyPayrollPrep },
  { name: "monthly_closing_prep", description: "تذكير الإقفال يوم 28", schedule: "0 8 28 * *", handler: monthlyClosingPrep },
  { name: "weekly_hr_report", description: "تقرير HR الأسبوعي", schedule: "0 8 * * 0", handler: weeklyHrReport },
  { name: "weekly_fleet_report", description: "تقرير الأسطول الأسبوعي", schedule: "0 8 * * 0", handler: weeklyFleetReport },
  { name: "weekly_crm_report", description: "تقرير CRM الأسبوعي", schedule: "0 8 * * 0", handler: weeklyCrmReport },
  { name: "weekly_cash_flow", description: "فحص التدفق النقدي الأسبوعي", schedule: "0 9 * * 1", handler: weeklyCashFlowCheck },
  { name: "weekly_property_revenue", description: "إيرادات عقارية أسبوعية", schedule: "0 9 * * 1", handler: weeklyPropertyRevenue },
  { name: "weekly_client_classification", description: "تصنيف العملاء الأسبوعي", schedule: "0 2 * * 0", handler: weeklyClientClassification },
  { name: "monthly_inventory_audit", description: "جرد المخزون الشهري", schedule: "0 6 1 * *", handler: monthlyInventoryAudit },
  { name: "monthly_auto_depreciation", description: "إهلاك الأصول الثابتة التلقائي", schedule: "0 6 2 * *", handler: monthlyAutoDepreciation },
  { name: "yearly_leave_balance_renewal", description: "تجديد أرصدة الإجازات 1 يناير", schedule: "0 0 1 1 *", handler: yearlyLeaveBalanceRenewal },
  { name: "daily_kpi_snapshot", description: "لقطة KPI اليومية", schedule: "0 2 * * *", handler: dailyKpiSnapshot },
  { name: "daily_smart_alert_scan", description: "فحص التنبيهات الذكية", schedule: "0 8 * * *", handler: dailySmartAlertScan },
  { name: "daily_notification_cleanup", description: "تنظيف الإشعارات القديمة", schedule: "0 3 * * *", handler: dailyNotificationCleanup },
  { name: "probation_alert_check", description: "تنبيه انتهاء فترة التجربة", schedule: "0 8 * * *", handler: probationAlertCheck },
  { name: "hourly_workflow_sla_check", description: "فحص مهل محرك الإجراءات الموحد", schedule: "0 * * * *", handler: hourlyWorkflowSlaCheck },
  { name: "daily_self_audit", description: "التدقيق الذاتي اليومي — كشف المخالفات والتناقضات", schedule: "0 7 * * *", handler: runSelfAuditAllCompanies },
  { name: "proactive_automation_engine", description: "الأتمتة الاستباقية — إنشاء مهام تلقائية", schedule: "0 7 * * *", handler: runAllProactiveChecks },
  { name: "email_queue_worker", description: "معالجة قائمة انتظار الإيميلات", schedule: "* * * * *", handler: processEmailQueue },
  { name: "sms_queue_worker", description: "معالجة قائمة انتظار الرسائل النصية", schedule: "* * * * *", handler: processSmsQueue },
  { name: "whatsapp_queue_worker", description: "معالجة قائمة انتظار واتساب", schedule: "* * * * *", handler: processWhatsAppQueue },
  { name: "weekly_logs_archiving", description: "أرشفة السجلات القديمة أسبوعياً", schedule: "0 3 * * 0", handler: weeklyLogsArchiving },
  { name: "scheduled_reports_runner", description: "إرسال التقارير المجدولة", schedule: "0 * * * *", handler: runScheduledReports },
  { name: "notification_fallback_chains", description: "معالجة سلاسل التصعيد للإشعارات الفاشلة", schedule: "*/2 * * * *", handler: processFallbackChains },
];

export async function seedCronJobs(): Promise<void> {
  for (const job of JOB_DEFINITIONS) {
    try {
      await rawExecute(
        `INSERT INTO cron_jobs (name, description, schedule, "isActive", "createdAt")
         VALUES ($1, $2, $3, true, NOW())
         ON CONFLICT (name) DO UPDATE SET description=EXCLUDED.description, schedule=EXCLUDED.schedule`,
        [job.name, job.description, job.schedule]
      );
    } catch (err) {
      console.error(`Failed to seed cron job ${job.name}:`, err);
    }
  }
}

const scheduledTasks: ReturnType<typeof cron.schedule>[] = [];

export async function startCronScheduler(): Promise<void> {
  await seedCronJobs();
  registerProactiveEventListeners();

  for (const def of JOB_DEFINITIONS) {
    try {
      const tz = await getSystemTimezone();
      const task = cron.schedule(def.schedule, async () => {
        await runJob(def);
      }, {
        timezone: tz,
      });
      scheduledTasks.push(task);
      console.log(`[CRON] Scheduled: ${def.name} (${def.schedule})`);
    } catch (err) {
      console.error(`[CRON] Failed to schedule ${def.name}:`, err);
    }
  }

  console.log(`[CRON] Scheduler started with ${scheduledTasks.length} jobs`);
}

export async function triggerJobByName(jobName: string): Promise<{ success: boolean; result?: string; error?: string }> {
  const def = JOB_DEFINITIONS.find((j) => j.name === jobName);
  if (!def) return { success: false, error: `Job not found: ${jobName}` };

  const start = Date.now();
  try {
    const result = await def.handler();
    const duration = Date.now() - start;
    await logCronJob(def.name, "success", duration, result);
    return { success: true, result };
  } catch (err) {
    const duration = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    await logCronJob(def.name, "failed", duration, "Job failed", errMsg);
    return { success: false, error: errMsg };
  }
}

export function stopCronScheduler(): void {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;
  console.log("[CRON] Scheduler stopped");
}

export async function reloadCronScheduler(): Promise<void> {
  console.log("[CRON] Reloading scheduler with updated timezone...");
  stopCronScheduler();
  await startCronScheduler();
}
