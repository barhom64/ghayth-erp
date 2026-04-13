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
  getLegalResponsible,
  haversineDistance,
  emitEvent,
  createAuditLog,
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
    // Scan 90-day window to cover all three alert thresholds (90, 30, 14 days)
    const docs = await rawQuery<any>(
      `SELECT ed.id, ed."employeeId", ed."documentType", ed."expiryDate",
              e.name AS "employeeName",
              (ed."expiryDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM employee_documents ed
       JOIN employees e ON e.id = ed."employeeId"
       WHERE ed."companyId" = $1 AND ed."expiryDate" IS NOT NULL
         AND ed."expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`,
      [company.id]
    );

    // Also scan employees' personal documents (iqama, passport, work permit)
    const empDocs = await rawQuery<any>(
      `SELECT e.id AS "employeeId", e.name AS "employeeName",
              UNNEST(ARRAY['iqama','passport','work_permit']) AS "documentType",
              UNNEST(ARRAY[e."iqamaExpiry", e."passportExpiry", e."workPermitExpiry"]) AS "expiryDate"
       FROM employees e
       JOIN employee_assignments ea ON ea."employeeId"=e.id AND ea."companyId"=$1 AND ea.status='active'
       WHERE e.status='active'`,
      [company.id]
    );

    const allDocs = [
      ...docs,
      ...empDocs
        .filter((d: any) => d.expiryDate != null)
        .map((d: any) => ({
          ...d,
          daysLeft: Math.floor((new Date(d.expiryDate).getTime() - Date.now()) / 86400000),
          id: null,
        }))
        .filter((d: any) => d.daysLeft >= 0 && d.daysLeft <= 90),
    ];

    // Also scan fixed-term employee contracts (90/30/14 days)
    const contractDocs = await rawQuery<any>(
      `SELECT ec.id, ec."employeeId", e.name AS "employeeName", 'employee_contract' AS "documentType",
              ec."endDate" AS "expiryDate",
              (ec."endDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM employee_contracts ec
       JOIN employees e ON e.id=ec."employeeId"
       WHERE ec."companyId"=$1 AND ec.status='active'
         AND ec."endDate" IS NOT NULL
         AND ec."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`,
      [company.id]
    );

    const allDocsCombined = [...allDocs, ...contractDocs.filter((d: any) => Number(d.daysLeft) >= 0)];

    const [hrAsgn] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );

    for (const doc of allDocsCombined) {
      const daysLeft = Number(doc.daysLeft);
      // Notify at 90, 30, 14, 7, 3, 1 days
      if ([90, 30, 14, 7, 3, 1].includes(daysLeft)) {
        // Notify HR manager
        if (hrAsgn) {
          await createNotification({
            companyId: company.id, assignmentId: hrAsgn.id,
            type: "document_expiry", title: `وثيقة تنتهي: ${doc.employeeName}`,
            body: `${doc.documentType} تنتهي خلال ${daysLeft} يوم — ${doc.expiryDate}`,
            priority: daysLeft <= 14 ? "high" : "normal",
            refType: "employee_document", refId: doc.id ?? doc.employeeId,
          });
          alerted++;
        }
        // Also notify the employee directly
        const [empAsgn] = await rawQuery<any>(
          `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
          [doc.employeeId, company.id]
        );
        if (empAsgn && empAsgn.id !== hrAsgn?.id) {
          await createNotification({
            companyId: company.id, assignmentId: empAsgn.id,
            type: "document_expiry_employee", title: `وثيقتك تنتهي خلال ${daysLeft} يوم`,
            body: `${doc.documentType} — تاريخ الانتهاء: ${doc.expiryDate}. يرجى تجديدها في أقرب وقت.`,
            priority: daysLeft <= 14 ? "high" : "normal",
            refType: "employee_document", refId: doc.id ?? doc.employeeId,
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
      // Persist the preventive-due event in event_logs so audit trail shows
      // the transition, then trigger the in-memory listener that auto-creates
      // the maintenance work order + assigns the fleet manager.
      try {
        await emitEvent({
          companyId: company.id, userId: null,
          action: "fleet.preventive.due", entity: "fleet_vehicles", entityId: Number(v.id),
          details: `المركبة ${v.plateNumber} تجاوزت موعد الصيانة — حالة needs_service`,
        });
      } catch {}
      eventBus.emit("fleet.vehicle.breakdown", {
        companyId: company.id,
        entityId: v.id,
        plateNumber: v.plateNumber,
        description: `صيانة متأخرة — تجاوزت موعد الصيانة المحدد`,
        source: "preventive_due",
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
      // Emit the canonical leave.approved event so downstream listeners
      // (audit trail, calendar, reporting) see auto-approvals the same way
      // they see manual approvals. Without this, cron-approved leaves were
      // invisible to every listener that keyed on leave.approved.
      emitEvent({
        companyId: stage.companyId,
        userId: null,
        action: "leave.approved",
        entity: "hr_leave_requests",
        entityId: stage.leaveRequestId,
        details: JSON.stringify({
          autoApproved: true,
          reason: "timeout",
          days: stage.days,
          startDate: stage.startDate,
          endDate: stage.endDate,
          leaveTypeId: stage.leaveTypeId,
        }),
      }).catch(console.error);
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

/**
 * Return-to-work closure: approved leaves whose endDate has passed but whose
 * status has not been transitioned to `completed` leave stale `on_leave`
 * attendance rows behind and keep the employee in a pseudo-on-leave state
 * forever. This job closes those requests, emits a single `leave.completed`
 * event per request and notifies both the employee and their manager.
 *
 * Runs daily at 00:05 local time (after midnight rollover).
 */
async function leaveReturnToWorkClosure(): Promise<string> {
  let closed = 0;
  const ended = await rawQuery<any>(
    `SELECT lr.id, lr."companyId", lr."employeeId", lr."startDate", lr."endDate",
            lr."leaveTypeId", lt.name AS "leaveTypeName"
       FROM hr_leave_requests lr
       JOIN hr_leave_types lt ON lt.id = lr."leaveTypeId"
      WHERE lr.status = 'approved'
        AND lr."endDate" < CURRENT_DATE
      ORDER BY lr."endDate" ASC
      LIMIT 500`
  );

  for (const lv of ended) {
    try {
      await rawExecute(
        `UPDATE hr_leave_requests SET status = 'completed', "updatedAt" = NOW() WHERE id = $1`,
        [lv.id]
      );

      // Ensure approval_requests is closed — avoid orphan pending rows.
      await rawExecute(
        `UPDATE approval_requests SET status = 'completed', "decidedAt" = NOW()
         WHERE "refType" = 'leave_request' AND "refId" = $1 AND status NOT IN ('completed','rejected')`,
        [lv.id]
      ).catch(() => {});

      // Find active employee assignment so we can notify the employee.
      const [asn] = await rawQuery<any>(
        `SELECT id, "branchId" FROM employee_assignments
          WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
        [lv.employeeId, lv.companyId]
      );

      if (asn) {
        createNotification({
          companyId: lv.companyId,
          assignmentId: asn.id,
          type: "leave_completed",
          title: "انتهاء فترة الإجازة — مرحباً بعودتك",
          body: `انتهت إجازة ${lv.leaveTypeName} (${lv.startDate} → ${lv.endDate}). يمكنك الآن تسجيل الحضور.`,
          priority: "normal",
          refType: "leave_request",
          refId: lv.id,
        }).catch(console.error);

        // Also nudge the direct manager so staffing dashboards update.
        const managerAssignmentId = await getManagerAssignmentId(lv.companyId, asn.branchId).catch(() => null);
        if (managerAssignmentId) {
          createNotification({
            companyId: lv.companyId,
            assignmentId: managerAssignmentId,
            type: "leave_completed",
            title: "موظف عاد من إجازته",
            body: `عاد الموظف من إجازة ${lv.leaveTypeName} المنتهية ${lv.endDate}.`,
            priority: "low",
            refType: "leave_request",
            refId: lv.id,
          }).catch(console.error);
        }
      }

      emitEvent({
        companyId: lv.companyId,
        userId: null,
        action: "leave.completed",
        entity: "hr_leave_requests",
        entityId: lv.id,
        details: JSON.stringify({ leaveTypeId: lv.leaveTypeId, endDate: lv.endDate }),
      }).catch(console.error);

      closed++;
    } catch (err) {
      console.error(`[leaveReturnToWorkClosure] failed to close leave ${lv.id}:`, err);
    }
  }

  return `Return-to-work closure: ${closed} leaves closed`;
}

/**
 * Inquiry-memo auto-escalation: memos that sit in `pending_employee` for more
 * than 72 hours without a justification are auto-advanced to `pending_manager`
 * with a recorded "employee declined to respond" note, so the memo chain is
 * never stranded waiting on an unresponsive employee.
 */
async function inquiryMemoEscalation(): Promise<string> {
  let advanced = 0;
  const stuck = await rawQuery<any>(
    `SELECT m.id, m."companyId", m."assignmentId", m."branchId", m."memoNumber"
       FROM hr_inquiry_memos m
      WHERE m.status = 'pending_employee'
        AND m."createdAt" < NOW() - INTERVAL '72 hours'
      ORDER BY m."createdAt" ASC
      LIMIT 200`
  );

  for (const memo of stuck) {
    try {
      await rawExecute(
        `UPDATE hr_inquiry_memos
            SET status = 'pending_manager',
                "employeeDeclined" = TRUE,
                "employeeSignedAt" = NOW(),
                "updatedAt" = NOW()
          WHERE id = $1`,
        [memo.id]
      );

      await rawExecute(
        `INSERT INTO hr_inquiry_memo_events ("memoId","companyId","actorRole",action,note,"createdAt")
         VALUES ($1,$2,'system','auto_declined','تجاوز مهلة 72 ساعة للرد — اعتُبر رفضاً ضمنياً',NOW())`,
        [memo.id, memo.companyId]
      ).catch(() => {});

      const managerAssignmentId = await getManagerAssignmentId(memo.companyId, memo.branchId).catch(() => null);
      if (managerAssignmentId) {
        createNotification({
          companyId: memo.companyId,
          assignmentId: managerAssignmentId,
          type: "inquiry_memo",
          title: "محضر استفسار بانتظار توصيتك (تلقائي)",
          body: `المحضر ${memo.memoNumber} تم تمريره تلقائياً لأن الموظف لم يرد خلال 72 ساعة.`,
          priority: "high",
          refType: "hr_inquiry_memo",
          refId: memo.id,
        }).catch(console.error);
      }

      emitEvent({
        companyId: memo.companyId,
        userId: null,
        action: "hr.memo.auto_escalated",
        entity: "hr_inquiry_memos",
        entityId: memo.id,
        details: JSON.stringify({ reason: "employee_no_response_72h" }),
      }).catch(console.error);

      advanced++;
    } catch (err) {
      console.error(`[inquiryMemoEscalation] failed memo ${memo.id}:`, err);
    }
  }

  return `Inquiry memo escalation: ${advanced} memos advanced to pending_manager`;
}

async function reconcileAttendance(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let total = 0;
  for (const company of companies) {
    // Skip absent-marking if today is a public holiday for this company
    const today = new Date().toISOString().split("T")[0];
    const [holiday] = await rawQuery<any>(
      `SELECT id FROM public_holidays WHERE "companyId"=$1 AND $2::date BETWEEN "startDate"::date AND "endDate"::date`,
      [company.id, today]
    );
    if (holiday) {
      continue; // No absent records on public holidays
    }

    const { affectedRows } = await rawExecute(
      `INSERT INTO attendance ("assignmentId", date, status, "createdAt")
       SELECT ea.id, CURRENT_DATE, 'absent', NOW()
       FROM employee_assignments ea
       WHERE ea."companyId"=$1 AND ea.status='active'
         AND NOT EXISTS (
           SELECT 1 FROM attendance a WHERE a."assignmentId"=ea.id AND a.date=CURRENT_DATE
         )
         AND NOT EXISTS (
           SELECT 1 FROM hr_leave_requests lr WHERE lr."employeeId"=ea."employeeId"
             AND lr.status='approved' AND lr."startDate"<=CURRENT_DATE AND lr."endDate">=CURRENT_DATE
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
        const result = await processApprovalStep({
          companyId: req.companyId, branchId: req.branchId,
          refType: req.refType, refId: req.refId,
          approved: true, decidedBy: 0,
        });
        // Propagate the approval onto the underlying domain record. The HR
        // route handler does this itself; the cron path must mirror the same
        // logic, otherwise an auto-approved request leaves the domain record
        // stuck in its original state forever.
        if (result.status === "approved") {
          const entityUpdateMap: Record<string, { table: string; column: string }> = {
            purchase_order: { table: "purchase_orders", column: "status" },
            official_letter: { table: "official_letters", column: "status" },
          };
          const target = entityUpdateMap[req.refType];
          if (target) {
            await rawExecute(
              `UPDATE ${target.table} SET ${target.column} = 'approved' WHERE id = $1`,
              [req.refId]
            ).catch((e) => console.error("[hourly_escalation] domain update failed:", e));
          }
          const journalRefTypes = ["expense", "salary_advance", "custody"];
          if (journalRefTypes.includes(req.refType)) {
            await rawExecute(
              `UPDATE journal_entries SET status = 'posted' WHERE id = $1 AND status = 'pending_approval'`,
              [req.refId]
            ).catch((e) => console.error("[hourly_escalation] journal update failed:", e));
          }
          // Audit + event so the auto-approval is visible in reports.
          createAuditLog({
            companyId: req.companyId, branchId: req.branchId, userId: 0,
            action: "auto_approved", entity: req.refType, entityId: req.refId,
            reason: "Auto-approved on timeout by hourly escalation cron",
          }).catch(console.error);
          emitEvent({
            companyId: req.companyId, userId: 0,
            action: `${req.refType}.auto_approved`, entity: req.refType, entityId: req.refId,
            details: `Auto-approved on timeout after ${Math.round(hoursSinceCreation)}h`,
          }).catch(console.error);
        }
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
  // lazy import لتفادي cycles مع businessHelpers
  const { ensureInquiryMemoForViolation } = await import("./disciplineEngine.js");
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let deductions = 0;
  let memos = 0;
  for (const company of companies) {
    const absentees = await rawQuery<any>(
      `SELECT a."assignmentId", ea."employeeId", ea."branchId", e.name, a.date
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
      // 1) خصم غياب في قيد الرواتب
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

      // 2) تسجيل مخالفة + فتح محضر استفسار (idempotent) بموجب لائحة الانضباط
      try {
        const period = new Date().toISOString().slice(0, 7);
        const { rows: existingViolation } = await pool.query(
          `SELECT id FROM employee_violations
            WHERE "companyId" = $1 AND "assignmentId" = $2 AND type = 'absence'
              AND period = $3 AND "deletedAt" IS NULL LIMIT 1`,
          [company.id, a.assignmentId, period]
        );
        let violationId: number;
        if (existingViolation.length) {
          violationId = existingViolation[0].id;
        } else {
          const { rows: vrows } = await pool.query(
            `INSERT INTO employee_violations
               ("companyId","assignmentId",type,description,severity,deduction,period,source)
             VALUES ($1,$2,'absence',$3,'high',0,$4,'auto')
             RETURNING id`,
            [company.id, a.assignmentId, `غياب عن العمل بتاريخ ${a.date}`, period]
          );
          violationId = vrows[0].id;
        }

        const result = await ensureInquiryMemoForViolation({
          companyId: company.id,
          branchId: a.branchId,
          assignmentId: a.assignmentId,
          employeeId: a.employeeId,
          violationId,
          incidentType: "absence",
          incidentDate: String(a.date).slice(0, 10),
          incidentDescription: `غياب يوم ${a.date} دون إذن كتابي`,
          source: "auto",
          createdBy: null,
        });
        if (result.created) memos++;
      } catch (err) {
        console.error("absence memo error:", err);
      }
    }
  }
  return `Processed ${deductions} absence deductions, ${memos} new inquiry memos`;
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

      // Also flip the invoice status to 'overdue' when appropriate — reports,
      // collection stages and dashboards key off invoices.status, not off
      // overduePhase, so leaving status='sent' made overdue invoices
      // invisible in half the UI.
      await rawExecute(
        `UPDATE invoices
            SET "overduePhase" = $1,
                status = CASE
                  WHEN status IN ('sent','partial') THEN 'overdue'
                  ELSE status
                END
          WHERE id = $2`,
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
  let alerted = 0;
  let expired = 0;
  let renewalNotices = 0;
  for (const company of companies) {
    // 1. Alert expiring contracts (≤30 days)
    const expiring = await rawQuery<any>(
      `SELECT rc.id, rc."tenantName", rc."endDate",
              (rc."endDate"::date - CURRENT_DATE) AS "daysLeft",
              rc."autoRenewal", rc."renewalNoticeDays", rc."renewalNoticeSentAt"
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
      alerted++;
    }

    // 2. Send renewal notice at renewalNoticeDays (default 60) before endDate — only once
    const needsNotice = await rawQuery<any>(
      `SELECT rc.id, rc."tenantName", rc."endDate"
       FROM rental_contracts rc
       WHERE rc."companyId" = $1 AND rc.status = 'active'
         AND rc."renewalNoticeSentAt" IS NULL
         AND rc."endDate" <= CURRENT_DATE + (COALESCE(rc."renewalNoticeDays",60) || ' days')::interval
         AND rc."endDate" > CURRENT_DATE`,
      [company.id]
    );
    for (const c of needsNotice) {
      await broadcastAlert(
        company.id, "rental_contract_renewal_notice",
        `تنبيه تجديد عقد: ${c.tenantName}`,
        `يقترب موعد انتهاء العقد (${c.endDate}) — اتخذ قرار التجديد أو الإنهاء`,
        "warning", "rental_contract", c.id
      );
      await rawExecute(
        `UPDATE rental_contracts SET "renewalNoticeSentAt"=NOW() WHERE id=$1`, [c.id]
      ).catch(() => {});
      try {
        await emitEvent({
          companyId: company.id, userId: null,
          action: "lease.renewal_notice", entity: "rental_contracts", entityId: Number(c.id),
          details: `تنبيه تجديد — ينتهي ${c.endDate}`,
        });
      } catch {}
      renewalNotices++;
    }

    // 3. Auto-expire contracts whose endDate has passed — mark expired, free the unit, cancel pending rent_payments
    const expiredContracts = await rawQuery<any>(
      `SELECT id, "unitId", "tenantName" FROM rental_contracts
       WHERE "companyId" = $1 AND status = 'active' AND "endDate" < CURRENT_DATE`,
      [company.id]
    );
    for (const c of expiredContracts) {
      await rawExecute(
        `UPDATE rental_contracts SET status='expired', "closedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1`,
        [c.id]
      );
      if (c.unitId) {
        await rawExecute(
          `UPDATE property_units SET status='available', "updatedAt"=NOW() WHERE id=$1 AND status='rented'`,
          [c.unitId]
        );
      }
      await rawExecute(
        `UPDATE rent_payments SET status='cancelled', "updatedAt"=NOW() WHERE "contractId"=$1 AND status IN ('pending','partial')`,
        [c.id]
      ).catch(() => {});
      try {
        await emitEvent({
          companyId: company.id, userId: null,
          action: "lease.expired", entity: "rental_contracts", entityId: Number(c.id),
          details: `انتهاء تلقائي — ${c.tenantName ?? ''}`,
        });
      } catch {}
      expired++;
    }
  }
  return `Property check: ${alerted} expiring alerts, ${renewalNotices} renewal notices, ${expired} auto-expired`;
}

async function dailyLegalCheck(): Promise<string> {
  // Upcoming hearings are stored on legal_sessions.nextSessionDate — the
  // parent legal_cases.nextHearingDate is never populated, so the old query
  // returned zero rows. Join to sessions and pick the soonest future session
  // per case.
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let actions = 0;
  for (const company of companies) {
    const upcoming = await rawQuery<any>(
      `SELECT DISTINCT ON (lc.id)
              lc.id, lc.title, lc."lawyerName", lc.priority,
              ls."nextSessionDate" AS "hearingDate"
         FROM legal_cases lc
         JOIN legal_sessions ls ON ls."caseId" = lc.id
        WHERE lc."companyId" = $1
          AND lc.status IN ('open','in_progress')
          AND lc."deletedAt" IS NULL
          AND ls."nextSessionDate" IS NOT NULL
          AND ls."nextSessionDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
        ORDER BY lc.id, ls."nextSessionDate" ASC`,
      [company.id]
    );
    for (const c of upcoming) {
      await broadcastAlert(
        company.id, "legal_hearing",
        `جلسة قضائية قريبة: ${c.title}`,
        `موعد الجلسة: ${c.hearingDate}${c.lawyerName ? ` — المحامي ${c.lawyerName}` : ''}`,
        c.priority === 'high' ? "critical" : "warning",
        "legal_case", c.id
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
  // Runs DAILY — full escalation ladder (alert → notification → field_visit →
  // escalation → penalty_applied → legal_transfer). Each phase is idempotent
  // (keyed on late_rent_actions.phase) and only fires once per payment.
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let penalties = 0;
  let legalHandoffs = 0;
  for (const company of companies) {
    const overduePayments = await rawQuery<any>(
      `SELECT rp.id, rp."dueDate", rp.amount, rp."contractId", c."tenantName", c."tenantPhone", c."unitId"
         FROM rent_payments rp
         JOIN rental_contracts c ON c.id = rp."contractId"
        WHERE c."companyId" = $1 AND rp.status IN ('pending','partial')
          AND rp."dueDate" < CURRENT_DATE`,
      [company.id]
    );
    for (const p of overduePayments) {
      const lateDays = Math.floor((Date.now() - new Date(p.dueDate).getTime()) / 86400000);
      let targetStage: string | null = null;
      if (lateDays >= 90) targetStage = 'legal_transfer';
      else if (lateDays >= 60) targetStage = 'penalty_applied';
      else if (lateDays >= 30) targetStage = 'escalation';
      else if (lateDays >= 14) targetStage = 'field_visit';
      else if (lateDays >= 7) targetStage = 'notification';
      else if (lateDays >= 3) targetStage = 'alert';
      if (!targetStage) continue;

      const existing = await rawQuery<any>(
        `SELECT id FROM late_rent_actions WHERE "paymentId" = $1 AND phase = $2 LIMIT 1`,
        [p.id, targetStage]
      );
      if (existing.length > 0) continue;

      let actionLabel = targetStage;
      if (targetStage === 'penalty_applied') {
        const lateFee = Math.round(Number(p.amount) * 0.02 * 100) / 100;
        await rawExecute(`UPDATE rent_payments SET amount = amount + $1, "updatedAt"=NOW() WHERE id = $2`, [lateFee, p.id]);
        actionLabel = `غرامة تأخير ${lateFee}`;
        penalties++;
      } else if (targetStage === 'legal_transfer') {
        try {
          const responsible = await getLegalResponsible(company.id);
          const lawyerName = responsible?.employeeName ?? null;

          const { insertId: caseId } = await rawExecute(
            `INSERT INTO legal_cases ("companyId","caseNumber",title,"caseType","opposingParty","lawyerName",status,priority,description)
             VALUES ($1,$2,$3,'property_rent',$4,$5,'open','high',$6)`,
            [
              company.id,
              `RENT-${p.id}-${Date.now()}`,
              `تحصيل إيجار — ${p.tenantName}`,
              p.tenantName,
              lawyerName,
              `إيجار متأخر ${lateDays} يوم — مبلغ ${p.amount} ريال`,
            ]
          );
          legalHandoffs++;

          // Notify the responsible lawyer + emit a lifecycle event so the
          // auto-created case isn't orphaned in open/NULL-assignee limbo.
          if (responsible) {
            await createNotification({
              companyId: company.id,
              assignmentId: responsible.assignmentId,
              type: "legal_case_assigned",
              title: "قضية إيجار متأخر (تلقائية)",
              body: `تم إنشاء قضية تحصيل إيجار متأخر — ${p.tenantName} — مبلغ ${p.amount} ريال`,
              priority: "high",
              refType: "legal_case",
              refId: Number(caseId),
              actionUrl: `/legal/cases/${caseId}`,
            });
          }
          await emitEvent({
            companyId: company.id, userId: null,
            action: "legal.case.created", entity: "legal_cases", entityId: Number(caseId),
            details: `قضية إيجار متأخر — ${p.tenantName}`,
          });
        } catch (err) {
          console.error("[monthlyRentPenalties] legal_cases insert failed:", err);
        }
        actionLabel = 'تحويل للقسم القانوني';
      } else if (targetStage === 'alert') actionLabel = 'تنبيه بالتأخر';
      else if (targetStage === 'notification') actionLabel = 'إشعار رسمي';
      else if (targetStage === 'field_visit') actionLabel = 'زيارة ميدانية';
      else if (targetStage === 'escalation') actionLabel = 'تصعيد لإدارة الأملاك';

      await rawExecute(
        `INSERT INTO late_rent_actions ("contractId","paymentId",phase,action,"sentAt",notes)
         VALUES ($1,$2,$3,$4,NOW(),$5)`,
        [p.contractId, p.id, targetStage, actionLabel, `تأخر ${lateDays} يوم — ${actionLabel}`]
      ).catch(() => {});

      try {
        await emitEvent({
          companyId: company.id, userId: null,
          action: `rent.late.${targetStage}`, entity: "rent_payments", entityId: Number(p.id),
          details: `تأخر ${lateDays} يوم — ${actionLabel}`,
        });
      } catch {}
    }
  }
  return `Rent escalation: ${penalties} penalties, ${legalHandoffs} legal handoffs`;
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

/**
 * Letters approved more than 30 minutes ago but never dispatched (sentAt NULL)
 * mean the in-memory `hr.letter.approved` listener fired while the queue was
 * down, or the server restarted before the listener consumed it. This job
 * re-emits the event through the persistent bus so the listener runs again.
 */
async function retryStuckOfficialLetters(): Promise<string> {
  let retried = 0;
  const stuck = await rawQuery<any>(
    `SELECT id, "companyId", "branchId", subject, type, "employeeId", status, "approvedAt"
       FROM official_letters
      WHERE status = 'approved'
        AND "sentAt" IS NULL
        AND "approvedAt" IS NOT NULL
        AND "approvedAt" < NOW() - INTERVAL '30 minutes'
      ORDER BY "approvedAt" ASC
      LIMIT 50`
  );
  for (const letter of stuck) {
    try {
      await emitEvent({
        companyId: letter.companyId,
        branchId: letter.branchId ?? undefined,
        userId: null,
        action: "hr.letter.approved",
        entity: "official_letter",
        entityId: Number(letter.id),
        details: `إعادة محاولة إرسال الخطاب #${letter.id}`,
        after: {
          status: "approved",
          subject: letter.subject,
          type: letter.type,
          employeeId: letter.employeeId,
          retry: true,
        },
      });
      retried++;
    } catch (err) {
      console.error("[retryStuckOfficialLetters] emit failed:", err);
    }
  }
  return `Stuck official letters retried: ${retried}`;
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

async function vendorContractExpiryAlerts(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let alerted = 0;
  for (const company of companies) {
    const expiring = await rawQuery<any>(
      `SELECT v.id AS "vendorId", v.name AS "vendorName",
              vc."endDate", (vc."endDate"::date - CURRENT_DATE) AS "daysLeft",
              vc.title AS "contractTitle"
       FROM vendor_contracts vc
       JOIN vendors v ON v.id = vc."vendorId"
       WHERE vc."companyId" = $1 AND vc.status = 'active'
         AND vc."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
         AND NOT EXISTS (
           SELECT 1 FROM automation_logs al
           WHERE al."automationType" = 'vendor_contract_expiry'
             AND al."entityType" = 'vendor_contract' AND al."entityId" = vc.id
             AND al."createdAt" > NOW() - INTERVAL '7 days'
         )`,
      [company.id]
    ).catch(() => []);

    for (const c of expiring) {
      const daysLeft = Number(c.daysLeft);
      if (![90, 60, 30, 14, 7].some((d) => daysLeft <= d + 2 && daysLeft >= d - 2)) continue;

      const [purchaseAsgn] = await rawQuery<any>(
        `SELECT id FROM employee_assignments WHERE "companyId" = $1
         AND role IN ('finance_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
        [company.id]
      ).catch(() => [null]);

      if (!purchaseAsgn) continue;

      await createNotification({
        companyId: company.id,
        assignmentId: purchaseAsgn.id,
        type: "vendor_contract_expiry",
        title: `عقد مورد ينتهي: ${c.vendorName}`,
        body: `عقد "${c.contractTitle}" مع المورد ${c.vendorName} ينتهي خلال ${daysLeft} يوم (${c.endDate}) — يرجى المراجعة والتجديد`,
        priority: daysLeft <= 14 ? "high" : "normal",
        refType: "vendor", refId: c.vendorId,
      });

      await rawExecute(
        `INSERT INTO automation_logs ("companyId","automationType","triggerReason","actionTaken","entityType","entityId","createdAt")
         VALUES ($1,'vendor_contract_expiry',$2,$3,'vendor_contract',$4,NOW())`,
        [company.id, `عقد المورد ${c.vendorName} ينتهي خلال ${daysLeft} يوم`, "إرسال إشعار تنبيه للمشتريات", c.vendorId]
      ).catch(() => {});
      alerted++;
    }
  }
  return `Vendor contract expiry alerts: ${alerted} notifications sent`;
}

async function dailySystemHealthReport(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let reports = 0;

  const [errorCount] = await rawQuery<any>(
    `SELECT COUNT(*) AS cnt FROM cron_logs WHERE status = 'failed' AND "createdAt" > NOW() - INTERVAL '24 hours'`
  ).catch(() => [{ cnt: 0 }]);

  const [failedNotifs] = await rawQuery<any>(
    `SELECT COUNT(*) AS cnt FROM notification_delivery_log WHERE status = 'failed' AND "queuedAt" > NOW() - INTERVAL '24 hours'`
  ).catch(() => [{ cnt: 0 }]);

  const [dbSize] = await rawQuery<any>(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS size`
  ).catch(() => [{ size: 'N/A' }]);

  for (const company of companies) {
    const [activeUsers] = await rawQuery<any>(
      `SELECT COUNT(DISTINCT "assignmentId") AS cnt FROM activity_logs
       WHERE "companyId" = $1 AND "createdAt" > NOW() - INTERVAL '24 hours'`,
      [company.id]
    ).catch(() => [{ cnt: 0 }]);

    const [techAsgn] = await rawQuery<any>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1
       AND role IN ('general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    ).catch(() => [null]);

    if (!techAsgn) continue;

    const errorCnt = Number(errorCount?.cnt ?? 0);
    const failedNotifCnt = Number(failedNotifs?.cnt ?? 0);
    const activeUsersCnt = Number(activeUsers?.cnt ?? 0);

    await createNotification({
      companyId: company.id,
      assignmentId: techAsgn.id,
      type: "system_health_report",
      title: "تقرير صحة النظام اليومي",
      body: `أخطاء Cron: ${errorCnt} | إشعارات فاشلة: ${failedNotifCnt} | مستخدمون نشطون: ${activeUsersCnt} | حجم قاعدة البيانات: ${dbSize?.size ?? 'N/A'}`,
      priority: errorCnt > 10 || failedNotifCnt > 20 ? "high" : "normal",
    });
    reports++;
  }
  return `System health reports sent to ${reports} companies`;
}

async function weeklyDataCleanup(): Promise<string> {
  let cleaned = 0;

  const { affectedRows: expiredSessions } = await rawExecute(
    `DELETE FROM user_sessions WHERE "expiresAt" < NOW() - INTERVAL '7 days'`
  ).catch(() => ({ affectedRows: 0 }));
  cleaned += expiredSessions;

  const { affectedRows: oldCronLogs } = await rawExecute(
    `DELETE FROM cron_logs WHERE "createdAt" < NOW() - INTERVAL '90 days'`
  ).catch(() => ({ affectedRows: 0 }));
  cleaned += oldCronLogs;

  const { affectedRows: oldDeliveryLogs } = await rawExecute(
    `DELETE FROM notification_delivery_log WHERE "queuedAt" < NOW() - INTERVAL '90 days' AND status IN ('delivered','failed')`
  ).catch(() => ({ affectedRows: 0 }));
  cleaned += oldDeliveryLogs;

  const { affectedRows: oldNotifLogs } = await rawExecute(
    `DELETE FROM notification_log WHERE "createdAt" < NOW() - INTERVAL '90 days'`
  ).catch(() => ({ affectedRows: 0 }));
  cleaned += oldNotifLogs;

  try {
    await rawExecute(
      `INSERT INTO audit_archive SELECT * FROM event_logs WHERE "createdAt" < NOW() - INTERVAL '365 days'
       ON CONFLICT DO NOTHING`
    ).catch(() => {});
    const { affectedRows: archivedLogs } = await rawExecute(
      `DELETE FROM event_logs WHERE "createdAt" < NOW() - INTERVAL '365 days'`
    ).catch(() => ({ affectedRows: 0 }));
    cleaned += archivedLogs;
  } catch {}

  // Orphaned workflow_instances: delete instances whose refTable row no longer exists.
  // Only handle the known refTables — safer than a generic EXISTS loop.
  try {
    const orphanRefTables = [
      "hr_leave_requests",
      "purchase_requests",
      "official_letters",
      "journal_entries",
    ];
    for (const tbl of orphanRefTables) {
      const { affectedRows } = await rawExecute(
        `DELETE FROM workflow_instances wi
           WHERE wi."refTable" = $1
             AND NOT EXISTS (SELECT 1 FROM ${tbl} t WHERE t.id = wi."refId")`,
        [tbl]
      ).catch(() => ({ affectedRows: 0 }));
      cleaned += affectedRows;
    }
  } catch {}

  // Mark orphaned approval_requests as cancelled when their referenced entity was hard-deleted.
  // approval_requests uses refType+refId (not a workflow FK).
  try {
    const orphanRefTypes: Record<string, string> = {
      leave: "hr_leave_requests",
      purchase_request: "purchase_requests",
      official_letter: "official_letters",
      journal_entry: "journal_entries",
      expense: "expenses",
      salary_advance: "salary_advances",
      custody: "custody_records",
      invoice: "invoices",
      purchase_order: "purchase_orders",
    };
    for (const [refType, tbl] of Object.entries(orphanRefTypes)) {
      const { affectedRows } = await rawExecute(
        `UPDATE approval_requests ar
            SET status = 'cancelled'
          WHERE ar."refType" = $1
            AND ar.status IN ('pending','in_progress')
            AND NOT EXISTS (SELECT 1 FROM ${tbl} t WHERE t.id = ar."refId")`,
        [refType]
      ).catch(() => ({ affectedRows: 0 }));
      cleaned += affectedRows;
    }
  } catch {}

  return `Data cleanup: ${cleaned} records cleaned`;
}

const JOB_DEFINITIONS: CronJobDef[] = [
  { name: "gov_expiry_alerts", description: "تنبيهات انتهاء الإقامات والاستمارات (مقيم/تم)", schedule: "0 7 * * *", handler: govExpiryAlerts },
  { name: "document_expiry_alerts", description: "تنبيهات انتهاء وثائق الموظفين", schedule: "0 6 * * *", handler: documentExpiryAlerts },
  { name: "contract_expiry_alerts", description: "تنبيهات انتهاء العقود", schedule: "0 6 * * *", handler: contractExpiryAlerts },
  { name: "fleet_status_check", description: "فحص حالة الأسطول", schedule: "0 6 * * *", handler: fleetStatusCheck },
  { name: "leave_escalation_check", description: "تصعيد طلبات الإجازة", schedule: "0 7 * * *", handler: leaveEscalationCheck },
  { name: "leave_return_to_work_closure", description: "إغلاق الإجازات المنتهية وتنبيه العودة للعمل", schedule: "5 0 * * *", handler: leaveReturnToWorkClosure },
  { name: "inquiry_memo_escalation", description: "تصعيد محاضر الاستفسار المعلقة 72 ساعة", schedule: "0 */6 * * *", handler: inquiryMemoEscalation },
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
  { name: "monthly_rent_penalties", description: "تصعيد الإيجارات المتأخرة (6 مراحل)", schedule: "0 7 * * *", handler: monthlyRentPenalties },
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
  { name: "weekly_vendor_contract_expiry", description: "تنبيه انتهاء عقود الموردين (90/30 يوم)", schedule: "0 7 * * 1", handler: vendorContractExpiryAlerts },
  { name: "daily_system_health_report", description: "تقرير صحة النظام اليومي للمدير التقني", schedule: "0 6 * * *", handler: dailySystemHealthReport },
  { name: "weekly_data_cleanup", description: "تنظيف البيانات المؤقتة وأرشفة السجلات القديمة", schedule: "0 3 * * 0", handler: weeklyDataCleanup },
  { name: "retry_stuck_official_letters", description: "إعادة محاولة إرسال الخطابات المعتمدة العالقة", schedule: "*/15 * * * *", handler: retryStuckOfficialLetters },
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
