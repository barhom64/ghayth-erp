import cron from "node-cron";
import { rawQuery, rawExecute, pool, withTransaction } from "./rawdb.js";
import { logger } from "./logger.js";
import { saveAllCompaniesKPISnapshots } from "./kpiEngine.js";
import { runSmartAlertsAllCompanies } from "./smartAlerts.js";
import { runSelfAuditAllCompanies } from "./selfAuditEngine.js";
import {
  createNotification,
  getManagerAssignmentId,
  getDirectorAssignmentId,
  getCfoAssignmentId,
  getLegalResponsible,
  emitEvent,
  createAuditLog,
  todayISO,
  toDateISO,
  currentYear,
  currentPeriod,
  roundTo2,
} from "./businessHelpers.js";
import { broadcastAlert, sendNotification } from "./notificationService.js";
import { processFallbackChains } from "./notificationEngine.js";
import { checkSlaStatus } from "./workflowEngine.js";
import { applyTransition } from "./lifecycleEngine.js";
import { runAllProactiveChecks, registerProactiveEventListeners } from "./proactiveEngine.js";
import { eventBus } from "./eventBus.js";
import { decryptSecret } from "./secrets.js";
import { processDueRecurringJournals } from "./recurringJournalProcessor.js";
import { scanObligations } from "./obligationsEngine.js";
import { runAutoDetectionAllCompanies } from "./autoViolationEngine.js";
import { getRedisRateLimitStatus, type RedisRateLimitStatus } from "./rateLimitStore.js";
import { zatcaRetryDrain } from "./zatca/worker.js";
import { dailyFxRateFetchCron } from "./fx/jobs.js";
import { fxStalenessCheckCron } from "./fx/staleness-alert.js";
import { lotExpiryScanCron } from "./inventory/lots.js";
import { abcMonthlyClassificationCron } from "./inventory/abc-analysis.js";
import { iqamaDailyAlertCron } from "./saudi-compliance/iqama-cron.js";
import { saudizationMonthlySnapshotCron } from "./saudi-compliance/saudization-snapshot.js";
import { recordJobRun } from "./observability.js";
import { runWithCorrelationId } from "./requestContext.js";
import { randomUUID } from "node:crypto";

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
    logger.error(err, "Failed to log cron job:");
  }
}

const LOCK_OWNER = process.env.HOSTNAME ?? "api-server";
const LOCK_TTL_MINUTES = 30;

async function acquireCronLock(jobName: string): Promise<boolean> {
  try {
    const upsertResult = await pool.query(
      `INSERT INTO cron_locks (job_name, locked_at, locked_by, expires_at)
       VALUES ($1, NOW(), $2, NOW() + make_interval(mins => $3))
       ON CONFLICT (job_name) DO UPDATE
         SET locked_at  = EXCLUDED.locked_at,
             locked_by  = EXCLUDED.locked_by,
             expires_at = EXCLUDED.expires_at
         WHERE cron_locks.expires_at < NOW()`,
      [jobName, LOCK_OWNER, LOCK_TTL_MINUTES]
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
  } catch (e) {
    logger.error(e, "[cronScheduler] failed to release cron lock");
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
    logger.debug({ job: def.name }, "CRON job skipped — already running on another instance");
    return;
  }

  const start = Date.now();
  try {
    const result = await def.handler();
    const duration = Date.now() - start;
    await logCronJob(def.name, "success", duration, result);
    recordJobRun(def.name, "success", duration);
    logger.info({ job: def.name, result, duration }, "CRON job completed");
  } catch (err) {
    const duration = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : String(err);
    await logCronJob(def.name, "failed", duration, "Job failed", errMsg);
    recordJobRun(def.name, "failed", duration);
    logger.error(err, `[CRON] ${def.name} failed:`);
  } finally {
    await releaseCronLock(def.name);
  }
}

async function documentExpiryAlerts(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let alerted = 0;
  for (const company of companies) {
    // Scan 90-day window to cover all three alert thresholds (90, 30, 14 days)
    const docs = await rawQuery<Record<string, unknown>>(
      `SELECT ed.id, ed."employeeId", ed."type", ed."expiryDate",
              e.name AS "employeeName",
              (ed."expiryDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM employee_documents ed
       JOIN employees e ON e.id = ed."employeeId"
       WHERE ed."companyId" = $1 AND ed."expiryDate" IS NOT NULL
         AND ed."expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`,
      [company.id]
    );

    // Also scan employees' personal documents (iqama, passport, work permit)
    const empDocs = await rawQuery<Record<string, unknown>>(
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
        .map((d) => ({
          ...d,
          daysLeft: Math.floor((new Date(d.expiryDate as string | Date).getTime() - Date.now()) / 86400000),
          id: null,
        }))
        .filter((d: any) => d.daysLeft >= 0 && d.daysLeft <= 90),
    ];

    // Also scan fixed-term employee contracts (90/30/14 days)
    const contractDocs = await rawQuery<Record<string, unknown>>(
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

    // Fleet: driver license, vehicle registration, vehicle insurance expiry
    const fleetDocs = await rawQuery<Record<string, unknown>>(
      `SELECT fd.id, NULL AS "employeeId", fd.name AS "employeeName",
              'driving_license' AS "documentType", fd."licenseExpiry" AS "expiryDate",
              (fd."licenseExpiry"::date - CURRENT_DATE) AS "daysLeft"
       FROM fleet_drivers fd
       WHERE fd."companyId"=$1 AND fd.status='active'
         AND fd."licenseExpiry" IS NOT NULL
         AND fd."licenseExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
       UNION ALL
       SELECT fv.id, NULL, CONCAT(fv.make,' ',fv.model,' ',fv."plateNumber"),
              'vehicle_registration', fv."registrationExpiry",
              (fv."registrationExpiry"::date - CURRENT_DATE)
       FROM fleet_vehicles fv
       WHERE fv."companyId"=$1 AND fv."deletedAt" IS NULL
         AND fv."registrationExpiry" IS NOT NULL
         AND fv."registrationExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
       UNION ALL
       SELECT fv.id, NULL, CONCAT(fv.make,' ',fv.model,' ',fv."plateNumber"),
              'vehicle_insurance', fv."insuranceExpiry",
              (fv."insuranceExpiry"::date - CURRENT_DATE)
       FROM fleet_vehicles fv
       WHERE fv."companyId"=$1 AND fv."deletedAt" IS NULL
         AND fv."insuranceExpiry" IS NOT NULL
         AND fv."insuranceExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`,
      [company.id]
      // as-any-reason: justified-pragmatic - catch fallback preserves existing empty-result behavior while satisfying route return typing
    ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [] as any[]; });

    // Company documents (commercial registration, municipality license, etc.)
    const companyDocAlerts = await rawQuery<Record<string, unknown>>(
      `SELECT cd.id, NULL AS "employeeId", cd."type" AS "employeeName",
              cd."type", cd."expiryDate",
              (cd."expiryDate"::date - CURRENT_DATE) AS "daysLeft"
       FROM company_documents cd
       WHERE cd."companyId"=$1 AND cd.status='active'
         AND cd."expiryDate" IS NOT NULL
         AND cd."expiryDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'`,
      [company.id]
      // as-any-reason: justified-pragmatic - catch fallback preserves existing empty-result behavior while satisfying route return typing
    ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [] as any[]; });

    const allDocsCombined = [
      ...allDocs,
      ...contractDocs.filter((d: any) => Number(d.daysLeft) >= 0),
      ...fleetDocs.filter((d: any) => Number(d.daysLeft) >= 0),
      ...companyDocAlerts.filter((d: any) => Number(d.daysLeft) >= 0),
    ];

    const [hrAsgn] = await rawQuery<Record<string, unknown>>(
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
            companyId: company.id, assignmentId: hrAsgn.id as number,
            type: "document_expiry", title: `وثيقة تنتهي: ${doc.employeeName}`,
            body: `${doc.documentType} تنتهي خلال ${daysLeft} يوم — ${doc.expiryDate}`,
            priority: daysLeft <= 14 ? "high" : "normal",
            refType: "employee_document", refId: doc.id ?? doc.employeeId,
          });
          alerted++;
        }
        // Also notify the employee directly
        const [empAsgn] = await rawQuery<Record<string, unknown>>(
          `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
          [doc.employeeId, company.id]
        );
        if (empAsgn && empAsgn.id !== hrAsgn?.id) {
          await createNotification({
            companyId: company.id, assignmentId: empAsgn.id as number,
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
    const contracts = await rawQuery<Record<string, unknown>>(
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
          "legal_contract", c.id as number
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
    const overdueService = await rawQuery<Record<string, unknown>>(
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
        "warning", "fleet_vehicle", v.id as number
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
      } catch (e) { logger.error(e, "[cronScheduler] fleet preventive due event failed"); }
      emitEvent({
        companyId: company.id, branchId: 0, userId: null,
        action: "fleet.vehicle.breakdown", entity: "fleet_vehicles", entityId: Number(v.id),
        details: JSON.stringify({ plateNumber: v.plateNumber, description: "صيانة متأخرة — تجاوزت موعد الصيانة المحدد", source: "preventive_due" }),
      }).catch((e) => logger.error(e, "[cronScheduler] fleet vehicle breakdown event failed"));
      actions++;
    }

    const expiredInsurance = await rawQuery<Record<string, unknown>>(
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
        "critical", "fleet_vehicle", ins.vehicleId as number
      );
      actions++;
    }

    const expiredLicenses = await rawQuery<Record<string, unknown>>(
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
        "critical", "fleet_driver", d.id as number
      );
      actions++;
    }
  }
  return `Fleet check: ${actions} actions taken`;
}

async function leaveEscalationCheck(): Promise<string> {
  const now = new Date();
  let reminders = 0, warnings = 0, escalations = 0, autoApprovals = 0;

  const pendingStages = await rawQuery<Record<string, unknown>>(
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
    const stageCreatedAt = new Date(stage.createdAt as string | Date);
    const hoursSinceCreation = (now.getTime() - stageCreatedAt.getTime()) / 3600000;

    if (hoursSinceCreation >= 28 && !stage.autoApprovedAt) {
      // Wrap all database writes in a transaction to prevent partial updates
      // on crash. Notifications and events are fire-and-forget and stay outside.
      const { allAssignments, managersByAsn, isFullyApproved } = await withTransaction(async (client) => {
        // 1. Approve this stage
        await client.query(
          `UPDATE leave_approval_stages SET status = 'approved', decision = 'موافقة تلقائية - تجاوز المهلة', "autoApprovedAt" = NOW() WHERE id = $1`,
          [stage.id]
        );

        // 2. Check if there are remaining unapproved stages for this leave request
        const remainingRes = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM leave_approval_stages
           WHERE "leaveRequestId" = $1 AND id != $2 AND status NOT IN ('approved','skipped')`,
          [stage.leaveRequestId, stage.id]
        );
        const remainingUnapproved = remainingRes.rows[0]?.cnt ?? 0;
        const fullyApproved = remainingUnapproved === 0;

        if (fullyApproved) {
          // 3. Only mark the overall leave request approved when ALL stages are done
          await client.query(
            `UPDATE hr_leave_requests SET status = 'approved', "approvedAt" = NOW() WHERE id = $1`,
            [stage.leaveRequestId]
          );

          // 4. Deduct leave balance
          const year = new Date(stage.startDate as string | Date).getFullYear();
          await client.query(
            `UPDATE hr_leave_balances SET used = used + $1, reserved = reserved - $1
             WHERE "employeeId" = $2 AND "companyId" = $3 AND "leaveTypeId" = $4 AND year = $5`,
            [stage.days, stage.employeeId, stage.companyId, stage.leaveTypeId, year]
          );

          // 5. Mark approval_requests as completed
          await client.query(
            `UPDATE approval_requests SET status = 'approved', "decidedAt" = NOW()
             WHERE "refType" = 'leave_request' AND "refId" = $1`,
            [stage.leaveRequestId]
          );

          // 6. Fetch assignments inside the transaction so reads are consistent
          const asnRes = await client.query(
            `SELECT id, "companyId", "branchId" FROM employee_assignments
             WHERE "employeeId" = $1 AND status = 'active'`,
            [stage.employeeId]
          );
          const assignments = asnRes.rows;

          // 7. Insert attendance records and reassign tasks
          const leaveStart = new Date(stage.startDate as string | Date);
          const leaveEnd = new Date(stage.endDate as string | Date);
          const managers: Record<string, any> = {};
          for (const asn of assignments) {
            for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
              const dateStr = toDateISO(d);
              await client.query(
                `INSERT INTO attendance ("assignmentId","companyId","branchId",date,status,notes)
                 VALUES ($1,$2,$3,$4,'on_leave',$5) ON CONFLICT DO NOTHING`,
                [asn.id, asn.companyId, asn.branchId, dateStr, `إجازة معتمدة تلقائياً - طلب رقم ${stage.leaveRequestId}`]
              );
            }
            const mgrRes = await client.query(
              `SELECT ea.id FROM employee_assignments ea
               WHERE ea."companyId" = $1 AND ea."branchId" = $2
                 AND ea.role IN ('branch_manager','hr_manager','general_manager','owner') AND ea.status = 'active' AND ea.id != $3
               ORDER BY CASE ea.role WHEN 'branch_manager' THEN 1 WHEN 'hr_manager' THEN 2 WHEN 'general_manager' THEN 3 ELSE 4 END LIMIT 1`,
              [asn.companyId, asn.branchId, asn.id]
            );
            const managerAId = mgrRes.rows[0] ?? null;
            managers[asn.id] = managerAId;
            if (managerAId) {
              await client.query(
                `UPDATE project_tasks SET "assigneeId" = (SELECT "employeeId" FROM employee_assignments WHERE id = $1)
                 WHERE "assigneeId" = (SELECT "employeeId" FROM employee_assignments WHERE id = $2)
                   AND status NOT IN ('completed','cancelled')
                   AND ("dueDate" IS NULL OR "dueDate" BETWEEN $3 AND $4)`,
                [managerAId.id, asn.id, stage.startDate, stage.endDate]
              );
            }
          }
          return { allAssignments: assignments, managersByAsn: managers, isFullyApproved: true };
        }

        // Stage approved but other stages still pending — don't finalize the leave request
        // as-any-reason: justified-pragmatic - empty-literal type widening on sentinel return shape; values are []/{} only, no behavior change
        return { allAssignments: [] as any[], managersByAsn: {} as Record<string, any>, isFullyApproved: false };
      });

      // Fire-and-forget notifications and events (outside the transaction)
      if (isFullyApproved) {
        for (const asn of allAssignments) {
          const managerAId = managersByAsn[asn.id];
          createNotification({
            companyId: asn.companyId, assignmentId: asn.id as number,
            type: "leave_approved", title: "تمت الموافقة التلقائية على طلب الإجازة",
            body: `تمت الموافقة تلقائياً على إجازة ${stage.leaveTypeName} من ${stage.startDate} إلى ${stage.endDate} بسبب تجاوز المهلة`,
            priority: "high", refType: "leave_request", refId: stage.leaveRequestId as number,
          }).catch((e) => logger.error(e, "[cronScheduler] background task failed"));
          if (managerAId) {
            createNotification({
              companyId: asn.companyId, assignmentId: managerAId.id,
              type: "leave_approved", title: "موظف في إجازة معتمدة تلقائياً",
              body: `تمت الموافقة تلقائياً على إجازة موظف من ${stage.startDate} إلى ${stage.endDate}. تم إعادة توزيع المهام.`,
              priority: "normal", refType: "leave_request", refId: stage.leaveRequestId as number,
            }).catch((e) => logger.error(e, "[cronScheduler] background task failed"));
          }
        }
        // Emit the canonical leave.approved event so downstream listeners
        // (audit trail, calendar, reporting) see auto-approvals the same way
        // they see manual approvals. Without this, cron-approved leaves were
        // invisible to every listener that keyed on leave.approved.
        emitEvent({
          companyId: stage.companyId as number,
          userId: null,
          action: "leave.approved",
          entity: "hr_leave_requests",
          entityId: stage.leaveRequestId as number,
          details: JSON.stringify({
            autoApproved: true,
            reason: "timeout",
            days: stage.days,
            startDate: stage.startDate,
            endDate: stage.endDate,
            leaveTypeId: stage.leaveTypeId,
          }),
        }).catch((e) => logger.error(e, "[cronScheduler] background task failed"));
      }
      autoApprovals++;
    } else if (hoursSinceCreation >= 24 && !stage.escalatedAt) {
      const [hrAssignment] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
        [stage.companyId]
      );
      if (hrAssignment) {
        await createNotification({
          companyId: stage.companyId as number, assignmentId: hrAssignment.id as number,
          type: "leave_escalated", title: "تصعيد طلب إجازة - تجاوز 24 ساعة",
          body: `طلب إجازة رقم ${stage.leaveRequestId} لم يتم البت فيه خلال 24 ساعة. سيتم الموافقة التلقائية خلال 4 ساعات.`,
          priority: "urgent", refType: "leave_request", refId: stage.leaveRequestId as number,
        });
      }
      await rawExecute(`UPDATE leave_approval_stages SET "escalatedAt" = NOW() WHERE id = $1`, [stage.id]);
      escalations++;
    } else if (hoursSinceCreation >= 20 && !stage.warningSentAt) {
      if (stage.assignedTo) {
        await createNotification({
          companyId: stage.companyId as number, assignmentId: stage.assignedTo as number,
          type: "leave_warning", title: "تنبيه عاجل - طلب إجازة ينتظر",
          body: `طلب إجازة رقم ${stage.leaveRequestId} ينتظر منذ 20 ساعة. سيتم التصعيد خلال 4 ساعات.`,
          priority: "urgent", refType: "leave_request", refId: stage.leaveRequestId as number,
        });
      }
      await rawExecute(`UPDATE leave_approval_stages SET "warningSentAt" = NOW() WHERE id = $1`, [stage.id]);
      warnings++;
    } else if (hoursSinceCreation >= 12 && !stage.reminderSentAt) {
      if (stage.assignedTo) {
        await createNotification({
          companyId: stage.companyId as number, assignmentId: stage.assignedTo as number,
          type: "leave_reminder", title: "تذكير - طلب إجازة ينتظر موافقتك",
          body: `طلب إجازة رقم ${stage.leaveRequestId} ينتظر موافقتك منذ 12 ساعة.`,
          priority: "high", refType: "leave_request", refId: stage.leaveRequestId as number,
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
  const ended = await rawQuery<Record<string, unknown>>(
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
      ).catch((e) => logger.error(e, "[cronScheduler] leave request approval cleanup failed"));

      // Find active employee assignment so we can notify the employee.
      const [asn] = await rawQuery<Record<string, unknown>>(
        `SELECT id, "branchId" FROM employee_assignments
          WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`,
        [lv.employeeId, lv.companyId]
      );

      if (asn) {
        createNotification({
          companyId: lv.companyId as number,
          assignmentId: asn.id as number,
          type: "leave_completed",
          title: "انتهاء فترة الإجازة — مرحباً بعودتك",
          body: `انتهت إجازة ${lv.leaveTypeName} (${lv.startDate} → ${lv.endDate}). يمكنك الآن تسجيل الحضور.`,
          priority: "normal",
          refType: "leave_request",
          refId: lv.id as number,
        }).catch((e) => logger.error(e, "[cronScheduler] background task failed"));

        // Also nudge the direct manager so staffing dashboards update.
        const managerAssignmentId = await getManagerAssignmentId(lv.companyId as number, asn.branchId as number).catch((e) => { logger.error(e, "[cronScheduler] manager lookup failed"); return null; });
        if (managerAssignmentId) {
          createNotification({
            companyId: lv.companyId as number,
            assignmentId: managerAssignmentId,
            type: "leave_completed",
            title: "موظف عاد من إجازته",
            body: `عاد الموظف من إجازة ${lv.leaveTypeName} المنتهية ${lv.endDate}.`,
            priority: "low",
            refType: "leave_request",
            refId: lv.id as number,
          }).catch((e) => logger.error(e, "[cronScheduler] background task failed"));
        }
      }

      emitEvent({
        companyId: lv.companyId as number,
        userId: null,
        action: "leave.completed",
        entity: "hr_leave_requests",
        entityId: lv.id as number,
        details: JSON.stringify({ leaveTypeId: lv.leaveTypeId, endDate: lv.endDate }),
      }).catch((e) => logger.error(e, "[cronScheduler] background task failed"));

      closed++;
    } catch (err) {
      logger.error(err, `[leaveReturnToWorkClosure] failed to close leave ${lv.id}:`);
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
  const stuck = await rawQuery<Record<string, unknown>>(
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
      ).catch((e) => logger.error(e, "[cronScheduler] inquiry memo auto-decline event insert failed"));

      // Tell the employee why their memo moved on — otherwise the auto-decline
      // is silent from the employee's perspective and they may later dispute
      // an imposed penalty without ever seeing the 72h window close.
      if (memo.assignmentId) {
        createNotification({
          companyId: memo.companyId as number,
          assignmentId: memo.assignmentId as number,
          type: "inquiry_memo",
          title: "تجاوز مهلة الرد على محضر الاستفسار",
          body: `انقضت مهلة 72 ساعة على المحضر ${memo.memoNumber} دون رد، وقد اعتُبر عدم الرد رفضاً ضمنياً.`,
          priority: "high",
          refType: "hr_inquiry_memo",
          refId: memo.id as number,
        }).catch((e) => logger.error(e, "[cronScheduler] background task failed"));
      }

      const managerAssignmentId = await getManagerAssignmentId(memo.companyId as number, memo.branchId as number).catch((e) => { logger.error(e, "[cronScheduler] manager lookup failed"); return null; });
      if (managerAssignmentId) {
        createNotification({
          companyId: memo.companyId as number,
          assignmentId: managerAssignmentId,
          type: "inquiry_memo",
          title: "محضر استفسار بانتظار توصيتك (تلقائي)",
          body: `المحضر ${memo.memoNumber} تم تمريره تلقائياً لأن الموظف لم يرد خلال 72 ساعة.`,
          priority: "high",
          refType: "hr_inquiry_memo",
          refId: memo.id as number,
        }).catch((e) => logger.error(e, "[cronScheduler] background task failed"));
      }

      emitEvent({
        companyId: memo.companyId as number,
        userId: null,
        action: "hr.memo.auto_escalated",
        entity: "hr_inquiry_memos",
        entityId: memo.id as number,
        details: JSON.stringify({ reason: "employee_no_response_72h" }),
      }).catch((e) => logger.error(e, "[cronScheduler] background task failed"));

      advanced++;
    } catch (err) {
      logger.error(err, `[inquiryMemoEscalation] failed memo ${memo.id}:`);
    }
  }

  return `Inquiry memo escalation: ${advanced} memos advanced to pending_manager`;
}

async function reconcileAttendance(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let total = 0;
  for (const company of companies) {
    // Skip absent-marking if today is a public holiday for this company
    const today = todayISO();
    const [holiday] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM public_holidays WHERE "companyId"=$1 AND $2::date BETWEEN "startDate"::date AND "endDate"::date`,
      [company.id, today]
    );
    if (holiday) {
      continue; // No absent records on public holidays
    }

    const { affectedRows } = await rawExecute(
      `INSERT INTO attendance ("assignmentId", "companyId", "branchId", date, status, "createdAt")
       SELECT ea.id, ea."companyId", ea."branchId", CURRENT_DATE, 'absent', NOW()
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
      const [hrAsgn] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
        [company.id]
      );
      if (hrAsgn) {
        await createNotification({
          companyId: company.id, assignmentId: hrAsgn.id as number,
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
  const today = todayISO();
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
    const tickets = await rawQuery<Record<string, unknown>>(
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
        "critical", "support_ticket", t.id as number
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

  const pendingRequests = await rawQuery<Record<string, unknown>>(
    `SELECT * FROM approval_requests WHERE status = 'pending' ORDER BY "createdAt" ASC`
  );

  for (const req of pendingRequests) {
    const hoursSinceCreation = (now.getTime() - new Date(req.createdAt as string | Date).getTime()) / 3600000;
    const expiresAt = req.expiresAt ? new Date(req.expiresAt as string | Date) : null;
    const isExpired = expiresAt ? now > expiresAt : hoursSinceCreation >= 48;

    if (hoursSinceCreation >= 24 && !req.lastReminderAt) {
      if (req.assignedTo) {
        await createNotification({
          companyId: req.companyId as number, assignmentId: req.assignedTo as number,
          type: "approval_reminder", title: "تذكير - طلب موافقة ينتظر",
          body: `يوجد طلب موافقة (${req.refType}) ينتظر منذ 24 ساعة`,
          priority: "high", refType: req.refType as string, refId: req.refId as number,
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
        const [currentStep] = await rawQuery<Record<string, unknown>>(
          `SELECT * FROM approval_chain_steps WHERE "chainId" = $1 AND "stepOrder" = $2`,
          [req.chainId, req.currentStepOrder]
        );
        shouldAutoApprove = !!currentStep?.autoApproveOnTimeout;
      }

      if (shouldAutoApprove) {
        const { processApprovalStep } = await import("./businessHelpers.js");
        const result = await processApprovalStep({
          companyId: req.companyId as number, branchId: req.branchId as number,
          refType: req.refType as string, refId: req.refId as number,
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
          const target = entityUpdateMap[req.refType as string];
          if (target) {
            await rawExecute(
              `UPDATE ${target.table} SET ${target.column} = 'approved' WHERE id = $1`,
              [req.refId]
            ).catch((e) => logger.error(e, "[hourly_escalation] domain update failed:"));
          }
          const journalRefTypes = ["expense", "salary_advance", "custody"];
          if (journalRefTypes.includes(req.refType as string)) {
            await rawExecute(
              `UPDATE journal_entries SET status = 'posted' WHERE id = $1 AND status = 'pending_approval'`,
              [req.refId]
            ).catch((e) => logger.error(e, "[hourly_escalation] journal update failed:"));
          }
          // Audit + event so the auto-approval is visible in reports.
          createAuditLog({
            companyId: req.companyId as number, branchId: req.branchId as number, userId: 0,
            action: "auto_approved", entity: req.refType as string, entityId: req.refId as number,
            reason: "Auto-approved on timeout by hourly escalation cron",
          }).catch((e) => logger.error(e, "[cronScheduler] background task failed"));
          emitEvent({
            companyId: req.companyId as number, userId: 0,
            action: `${req.refType}.auto_approved`, entity: req.refType as string, entityId: req.refId as number,
            details: `Auto-approved on timeout after ${Math.round(hoursSinceCreation)}h`,
          }).catch((e) => logger.error(e, "[cronScheduler] background task failed"));
        }
        autoApprovals++;
      } else {
        const [hrAssignment] = await rawQuery<Record<string, unknown>>(
          `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
          [req.companyId]
        );
        if (hrAssignment) {
          await createNotification({
            companyId: req.companyId as number, assignmentId: hrAssignment.id as number,
            type: "approval_escalated", title: "تصعيد طلب موافقة",
            body: `طلب موافقة (${req.refType}) رقم ${req.refId} تجاوز المهلة`,
            priority: "urgent", refType: req.refType as string, refId: req.refId as number,
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
    const absentees = await rawQuery<Record<string, unknown>>(
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
        `INSERT INTO payroll_deductions ("companyId", "employeeId", type, amount, description, "effectiveDate", "createdAt")
         SELECT $1, $2, 'absence', 0, $3, CURRENT_DATE, NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM payroll_deductions
           WHERE "companyId" = $1 AND "employeeId" = $2 AND "effectiveDate" = CURRENT_DATE AND type = 'absence'
         )`,
        [company.id, a.employeeId, `خصم غياب تلقائي — ${a.name}`]
      ).catch((e) => logger.error(e, "[cronScheduler] absence deduction insert failed"));
      deductions++;

      // 2) تسجيل مخالفة + فتح محضر استفسار (idempotent) بموجب لائحة الانضباط
      try {
        const period = currentPeriod();
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
          branchId: a.branchId as number | null,
          assignmentId: a.assignmentId as number,
          employeeId: a.employeeId as number,
          violationId,
          incidentType: "absence",
          incidentDate: String(a.date).slice(0, 10),
          incidentDescription: `غياب يوم ${a.date} دون إذن كتابي`,
          source: "auto",
          createdBy: null,
        });
        if (result.created) memos++;
      } catch (err) {
        logger.error(err, "absence memo error:");
      }
    }
  }
  return `Processed ${deductions} absence deductions, ${memos} new inquiry memos`;
}

async function dailyInvoiceOverdueEscalation(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let actions = 0;
  for (const company of companies) {
    const invoices = await rawQuery<Record<string, unknown>>(
      `SELECT i.id, i.ref, i."clientId", i.total, i."paidAmount", i."dueDate",
              c.name AS "clientName", c.phone AS "clientPhone",
              (CURRENT_DATE - i."dueDate"::date) AS "daysOverdue",
              i.status
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId"
       WHERE i."companyId" = $1 AND i.status NOT IN ('paid','cancelled','overdue')
         AND i."dueDate" < CURRENT_DATE`,
      [company.id]
    );

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

      // Flip the invoice status to 'overdue' when appropriate — reports,
      // collection stages and dashboards key off invoices.status.
      await rawExecute(
        `UPDATE invoices
            SET status = CASE
                  WHEN status IN ('sent','partial') THEN 'overdue'
                  ELSE status
                END
          WHERE id = $1`,
        [inv.id]
      ).catch((e) => logger.error(e, "[cronScheduler] invoice overdue status update failed"));

      await broadcastAlert(
        company.id, "invoice_overdue",
        `فاتورة متأخرة ${days} يوم: ${inv.ref}`,
        `العميل: ${inv.clientName || 'غير محدد'} — المبلغ: ${inv.total} ريال — المرحلة: ${phase}`,
        days >= 30 ? "critical" : "warning",
        "invoice", inv.id as number
      );
      actions++;
    }
  }
  return `Invoice overdue escalation: ${actions} actions`;
}

async function dailyFuelMonitor(): Promise<string> {
  // Skipped: fleet_vehicles table does not have a "monthlyFuelBudget" column.
  // Fuel budget monitoring requires a schema migration before it can be enabled.
  return `Fuel monitor: 0 alerts (disabled — no monthlyFuelBudget column)`;
}

async function dailyInventoryCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let pos = 0;
  for (const company of companies) {
    const products = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, "currentStock", COALESCE("minStock", 0) AS threshold
       FROM warehouse_products
       WHERE "companyId" = $1
         AND COALESCE("minStock", 0) > 0
         AND "currentStock" < COALESCE("minStock", 0)`,
      [company.id]
    );
    for (const p of products) {
      const existing = await rawQuery<Record<string, unknown>>(
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
        ).catch((e) => logger.error(e, "[cronScheduler] auto purchase order insert failed"));
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
    const expiring = await rawQuery<Record<string, unknown>>(
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
        "rental_contract", c.id as number
      );
      alerted++;
    }

    // 2. Send renewal notice at renewalNoticeDays (default 60) before endDate — only once
    const needsNotice = await rawQuery<Record<string, unknown>>(
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
        "warning", "rental_contract", c.id as number
      );
      await rawExecute(
        `UPDATE rental_contracts SET "renewalNoticeSentAt"=NOW() WHERE id=$1`, [c.id]
      ).catch((e) => logger.error(e, "[cronScheduler] rental contract renewal notice update failed"));
      try {
        await emitEvent({
          companyId: company.id, userId: null,
          action: "lease.renewal_notice", entity: "rental_contracts", entityId: Number(c.id),
          details: `تنبيه تجديد — ينتهي ${c.endDate}`,
        });
      } catch (e) { logger.error(e, "[cronScheduler] rental renewal notice event failed"); }
      renewalNotices++;
    }

    // 3. Auto-expire contracts whose endDate has passed — mark expired, free the unit, cancel pending rent_payments
    const expiredContracts = await rawQuery<Record<string, unknown>>(
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
      ).catch((e) => logger.error(e, "[cronScheduler] rent payments cancellation on contract expiry failed"));
      try {
        await emitEvent({
          companyId: company.id, userId: null,
          action: "lease.expired", entity: "rental_contracts", entityId: Number(c.id),
          details: `انتهاء تلقائي — ${c.tenantName ?? ''}`,
        });
      } catch (e) { logger.error(e, "[cronScheduler] lease expired event failed"); }
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
    const upcoming = await rawQuery<Record<string, unknown>>(
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
        "legal_case", c.id as number
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
    const projects = await rawQuery<Record<string, unknown>>(
      `SELECT id, name, "endDate", budget, "spentAmount", progress
       FROM projects
       WHERE "companyId" = $1 AND "deletedAt" IS NULL AND status = 'active' AND "endDate" < CURRENT_DATE`,
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
        "project", p.id as number
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
    const overdue = await rawQuery<Record<string, unknown>>(
      `SELECT ca.id, ca."opportunityId", ca.description, co."assignedTo", co.title AS "oppTitle"
       FROM crm_activities ca
       JOIN crm_opportunities co ON co.id = ca."opportunityId"
       WHERE co."companyId" = $1 AND ca."completedAt" IS NULL
         AND ca."scheduledAt" < NOW() - INTERVAL '3 days'`,
      [company.id]
    );
    for (const a of overdue) {
      if (!a.assignedTo) continue;
      const [asgn] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND status = 'active' LIMIT 1`,
        [a.assignedTo]
      );
      if (asgn) {
        await createNotification({
          companyId: company.id, assignmentId: asgn.id as number,
          type: "crm_overdue",
          title: `متابعة CRM متأخرة: ${a.oppTitle}`,
          body: `نشاط متأخر أكثر من 3 أيام`,
          priority: "high", refType: "crm_opportunities", refId: a.opportunityId as number,
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
    const overduePayments = await rawQuery<Record<string, unknown>>(
      `SELECT rp.id, rp."dueDate", rp.amount, rp."contractId", c."tenantName", c."tenantPhone", c."unitId"
         FROM rent_payments rp
         JOIN rental_contracts c ON c.id = rp."contractId"
        WHERE c."companyId" = $1 AND rp.status IN ('pending','partial')
          AND rp."dueDate" < CURRENT_DATE`,
      [company.id]
    );
    for (const p of overduePayments) {
      const lateDays = Math.floor((Date.now() - new Date(p.dueDate as string | Date).getTime()) / 86400000);
      let targetStage: string | null = null;
      if (lateDays >= 90) targetStage = 'legal_transfer';
      else if (lateDays >= 60) targetStage = 'penalty_applied';
      else if (lateDays >= 30) targetStage = 'escalation';
      else if (lateDays >= 14) targetStage = 'field_visit';
      else if (lateDays >= 7) targetStage = 'notification';
      else if (lateDays >= 3) targetStage = 'alert';
      if (!targetStage) continue;

      const existing = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM late_rent_actions WHERE "paymentId" = $1 AND phase = $2 LIMIT 1`,
        [p.id, targetStage]
      );
      if (existing.length > 0) continue;

      let actionLabel = targetStage;
      if (targetStage === 'penalty_applied') {
        const lateFee = roundTo2(Number(p.amount) * 0.02);
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
          logger.error(err, "[monthlyRentPenalties] legal_cases insert failed:");
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
      ).catch((e) => logger.error(e, "[cronScheduler] late rent action insert failed"));

      try {
        await emitEvent({
          companyId: company.id, userId: null,
          action: `rent.late.${targetStage}`, entity: "rent_payments", entityId: Number(p.id),
          details: `تأخر ${lateDays} يوم — ${actionLabel}`,
        });
      } catch (e) { logger.error(e, "[cronScheduler] rent late escalation event failed"); }
    }
  }
  return `Rent escalation: ${penalties} penalties, ${legalHandoffs} legal handoffs`;
}

async function monthlyPayrollPrep(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let actions = 0;
  for (const company of companies) {
    const [hrAsgn] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (hrAsgn) {
      const [pending] = await rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*) AS count FROM payroll_runs WHERE "companyId" = $1 AND status = 'draft'`,
        [company.id]
      );
      if (Number(pending?.count) > 0) {
        await createNotification({
          companyId: company.id, assignmentId: hrAsgn.id as number,
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
    const [ownerAsgn] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('finance_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (ownerAsgn) {
      await createNotification({
        companyId: company.id, assignmentId: ownerAsgn.id as number,
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
    const [stats] = await rawQuery<Record<string, unknown>>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE status = 'active') AS active,
         COUNT(*) FILTER (WHERE "hireDate" >= CURRENT_DATE - INTERVAL '7 days') AS "newHires"
       FROM employee_assignments WHERE "companyId" = $1`,
      [company.id]
    );
    const [hrAsgn] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (hrAsgn) {
      await createNotification({
        companyId: company.id, assignmentId: hrAsgn.id as number,
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
    const [stats] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status = 'active') AS active
       FROM fleet_vehicles WHERE "companyId" = $1`,
      [company.id]
    );
    const [mgrAsgn] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('branch_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (mgrAsgn) {
      await createNotification({
        companyId: company.id, assignmentId: mgrAsgn.id as number,
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
    const [stats] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE stage = 'closed_won') AS won,
              COALESCE(SUM(value) FILTER (WHERE stage = 'closed_won'), 0) AS "wonValue"
       FROM crm_opportunities WHERE "companyId" = $1
         AND "createdAt" >= CURRENT_DATE - INTERVAL '7 days'`,
      [company.id]
    );
    const [mgrAsgn] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('branch_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (mgrAsgn) {
      await createNotification({
        companyId: company.id, assignmentId: mgrAsgn.id as number,
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
    const [income] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM("paidAmount"), 0) AS total FROM invoices WHERE "companyId" = $1 AND "createdAt" >= CURRENT_DATE - INTERVAL '7 days'`,
      [company.id]
    );
    const [expenses] = await rawQuery<Record<string, unknown>>(
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
    const [stats] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(CASE WHEN rp.status = 'paid' THEN rp.amount ELSE 0 END), 0) AS paid,
              COALESCE(SUM(CASE WHEN rp.status IN ('pending','partial') THEN rp.amount ELSE 0 END), 0) AS pending
       FROM rent_payments rp
       JOIN rental_contracts rc ON rc.id = rp."contractId"
       WHERE rc."companyId" = $1
         AND rp."dueDate" >= CURRENT_DATE - INTERVAL '7 days'`,
      [company.id]
    );
    const [ownerAsgn] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('finance_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    );
    if (ownerAsgn) {
      await createNotification({
        companyId: company.id, assignmentId: ownerAsgn.id as number,
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
    const clients = await rawQuery<Record<string, unknown>>(
      `SELECT c.id, c.name, c.classification,
              COALESCE(c."totalRevenue", 0) AS revenue,
              (SELECT MAX(i."createdAt") FROM invoices i WHERE i."clientId" = c.id) AS "lastInvoice"
       FROM clients c WHERE c."companyId" = $1`,
      [company.id]
    );
    for (const client of clients) {
      const rev = Number(client.revenue);
      const lastInvoice = client.lastInvoice ? new Date(client.lastInvoice as string | Date) : null;
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
    const negative = await rawQuery<Record<string, unknown>>(
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
        "warning", "warehouse_product", p.id as number
      );
    }
  }
  return `Monthly inventory audit: ${issues} issues`;
}

async function yearlyLeaveBalanceRenewal(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  const year = currentYear();
  let renewed = 0;
  for (const company of companies) {
    const balances = await rawQuery<Record<string, unknown>>(
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
      ).catch((e) => logger.error(e, "[cronScheduler] leave balance renewal insert failed"));
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
  const contracts = await rawQuery<Record<string, unknown>>(
    `SELECT ec.id, ec."companyId", ec."employeeId", ec."assignmentId", ec."probationEndDate",
            e.name AS "employeeName"
     FROM employee_contracts ec
     JOIN employees e ON e.id = ec."employeeId"
     WHERE ec."probationStatus" = 'active' AND ec."probationAlertSent" = false
       AND ec."probationEndDate" <= CURRENT_DATE + INTERVAL '14 days'`
  );

  let alerted = 0;
  for (const contract of contracts) {
    const daysLeft = Math.ceil((new Date(contract.probationEndDate as string | Date).getTime() - Date.now()) / 86400000);
    const [hrAssignment] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
      [contract.companyId]
    );
    if (hrAssignment) {
      await createNotification({
        companyId: contract.companyId as number, assignmentId: hrAssignment.id as number,
        type: "probation_alert", title: "تنبيه انتهاء فترة تجربة",
        body: `فترة تجربة الموظف ${contract.employeeName} تنتهي خلال ${daysLeft} يوم. يرجى اتخاذ قرار التثبيت.`,
        priority: "high", refType: "employee", refId: contract.employeeId as number,
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
  const stuck = await rawQuery<Record<string, unknown>>(
    `SELECT id, "companyId", subject, type, "employeeId", status, "approvedAt"
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
        companyId: letter.companyId as number,
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
      logger.error(err, "[retryStuckOfficialLetters] emit failed:");
    }
  }
  return `Stuck official letters retried: ${retried}`;
}

async function processEmailQueue(): Promise<string> {
  const pending = await rawQuery<Record<string, unknown>>(
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
      const smtp = (email.smtpSettings as { host?: string; port?: number; secure?: boolean; user?: string; password?: string; from?: string } | null) ?? null;

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
      const meta = (email.metadata as { attachments?: Array<{ filename: string; content: string; contentType: string; encoding?: string }> } | null) ?? null;
      if (meta?.attachments && Array.isArray(meta.attachments) && meta.attachments.length > 0) {
        mailOptions.attachments = meta.attachments.map((a) => ({
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
      ).catch((e) => logger.error(e, "[cronScheduler] background task failed"));
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
      logger.error(err, `[CRON] Workflow SLA check failed for company ${company.id}:`);
    }
  }
  return `Workflow SLA: ${totalWarnings} warnings, ${totalEscalations} escalations, ${totalAutoApprovals} auto-approvals`;
}

async function processSmsQueue(): Promise<string> {
  const pending = await rawQuery<Record<string, unknown>>(
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
            To: sms.recipientPhone as string,
            From: sms.fromNumber as string,
            Body: sms.message as string,
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
        const newCount = (Number(sms.attemptCount) || 0) + 1;
        const newStatus = newCount >= 3 ? "failed" : "pending";
        await rawExecute(
          `UPDATE sms_queue SET status=$1, "errorMessage"=$2, "attemptCount"=$3, "updatedAt"=NOW() WHERE id=$4`,
          [newStatus, errText.substring(0, 500), newCount, sms.id]
        );
        failed++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const newCount = (Number(sms.attemptCount) || 0) + 1;
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
  const pending = await rawQuery<Record<string, unknown>>(
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
        const newCount = (Number(msg.attemptCount) || 0) + 1;
        const newStatus = newCount >= 3 ? "failed" : "pending";
        await rawExecute(
          `UPDATE whatsapp_queue SET status=$1, "errorMessage"=$2, "attemptCount"=$3, "updatedAt"=NOW() WHERE id=$4`,
          [newStatus, errText.substring(0, 500), newCount, msg.id]
        );
        failed++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const newCount = (Number(msg.attemptCount) || 0) + 1;
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
    logger.error(err, "[CRON] weeklyLogsArchiving: audit_logs archiving failed:");
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
    logger.error(err, "[CRON] weeklyLogsArchiving: integration_logs archiving failed:");
  }

  return `Archived ${auditArchived} audit logs (>${AUDIT_LOG_RETENTION_DAYS}d old), ${integrationArchived} integration logs (>${INTEGRATION_LOG_RETENTION_DAYS}d old)`;
}

async function monthlyAutoDepreciation(): Promise<string> {
  const period = currentPeriod();
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let processed = 0;
  let totalDepreciated = 0;

  for (const company of companies) {
    const assets = await rawQuery<Record<string, unknown>>(
      `SELECT fa.* FROM fixed_assets fa
       WHERE fa."companyId" = $1 AND fa.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM depreciation_entries de WHERE de."assetId" = fa.id AND de.period = $2
         )`,
      [company.id, period]
    );

    const [systemBranch] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM branches WHERE "companyId" = $1 LIMIT 1`,
      [company.id]
    );
    const branchId = systemBranch?.id ?? null;

    const [systemUser] = await rawQuery<Record<string, unknown>>(
      `SELECT ea.id FROM employee_assignments ea WHERE ea."companyId" = $1 AND ea.role IN ('finance_manager','general_manager','owner') AND ea.status='active' ORDER BY ea.role='owner' DESC LIMIT 1`,
      [company.id]
    );
    if (!systemUser) {
      logger.warn(`[CRON] monthlyAutoDepreciation: No finance/owner user found for company ${company.id}, skipping`);
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
        depAmount = Math.max(0, roundTo2(currentBookValue * (2 / usefulLife / 12)));
      } else {
        depAmount = Math.max(0, roundTo2((purchaseCost - salvageValue) / (usefulLife * 12)));
      }

      if (currentBookValue - depAmount < salvageValue) {
        depAmount = Math.max(0, currentBookValue - salvageValue);
      }
      if (depAmount <= 0) continue;

      const newAccumulated = Number(asset.accumulatedDepreciation) + depAmount;
      const newBookValue = Math.max(purchaseCost - newAccumulated, salvageValue);

      try {
        const ref = `DEP-AUTO-${asset.code ?? asset.id}-${period}`;
        const { financialEngine } = await import("./engines/index.js");
        // GL boundary: depreciation journal goes through financialEngine so
        // sourceKey idempotency, period checks, and account validation are
        // applied uniformly. The asset-specific bookkeeping (depreciation_entries
        // + fixed_assets) stays in this cron because those are domain tables.
        const { journalId, alreadyExists } = await financialEngine.postJournalEntry({
          companyId: Number(company.id),
          branchId: Number(asset.branchId ?? branchId),
          createdBy: Number(createdBy),
          ref,
          description: `إهلاك تلقائي: ${asset.name} — ${period}`,
          type: "depreciation",
          sourceType: "fixed_asset_depreciation",
          sourceId: Number(asset.id),
          sourceKey: `finance:depreciation:${asset.id}:${period}`,
          lines: [
            {
              accountCode: (asset.depreciationAccountCode as string | undefined) ?? "6100",
              debit: depAmount,
              credit: 0,
            },
            {
              accountCode: (asset.accDepreciationAccountCode as string | undefined) ?? "1590",
              debit: 0,
              credit: depAmount,
            },
          ],
          status: "posted",
        });

        if (alreadyExists) {
          // Another cron run already posted this depreciation. Skip the
          // asset-side bookkeeping to avoid double-counting.
          continue;
        }

        await withTransaction(async (client) => {
          await client.query(
            `INSERT INTO depreciation_entries ("assetId","companyId",period,"depreciationAmount","bookValueAfter","journalEntryId",status,"postedAt")
             VALUES ($1,$2,$3,$4,$5,$6,'posted',NOW())`,
            [asset.id, company.id, period, depAmount, newBookValue, journalId]
          );
          await client.query(
            `UPDATE fixed_assets SET "accumulatedDepreciation"=$1, "currentBookValue"=$2, "updatedAt"=NOW() WHERE id=$3`,
            [newAccumulated, newBookValue, asset.id]
          );
        });

        processed++;
        totalDepreciated += depAmount;
      } catch (err) {
        logger.error(err, `[CRON] Depreciation failed for asset ${asset.id}:`);
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

  const activeReports = await rawQuery<Record<string, unknown>>(
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
      const recipients: string[] = (report.recipients as string[] | null) || [];
      const params = (report.params as { startDate?: string; endDate?: string; period?: string }) || {};

      const { exportTrialBalanceExcel, exportIncomeStatementExcel, exportPayrollExcel, exportAttendanceExcel } = await import("./excelExport.js");
      const { exportTrialBalancePdf } = await import("./pdfExport.js");

      let attachment: { filename: string; content: Buffer; contentType: string } | undefined;

      if (report.reportType === "trial-balance") {
        const buf = await exportTrialBalanceExcel(report.companyId as number, params.startDate, params.endDate);
        attachment = { filename: "trial-balance.xlsx", content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
      } else if (report.reportType === "income-statement") {
        const buf = await exportIncomeStatementExcel(report.companyId as number, params.startDate, params.endDate);
        attachment = { filename: "income-statement.xlsx", content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
      } else if (report.reportType === "payroll") {
        const buf = await exportPayrollExcel(report.companyId as number, params.period);
        attachment = { filename: "payroll.xlsx", content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
      } else if (report.reportType === "attendance") {
        const buf = await exportAttendanceExcel(report.companyId as number, params.startDate, params.endDate);
        attachment = { filename: "attendance.xlsx", content: buf, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
      } else if (report.reportType === "trial-balance-pdf") {
        const buf = await exportTrialBalancePdf(report.companyId as number, params.startDate, params.endDate);
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
      logger.error(err, `[CRON] runScheduledReports: failed for report ${report.id}:`);
      await rawExecute(
        `INSERT INTO scheduled_report_history ("scheduledReportId", status, "sentAt", error)
         VALUES ($1, 'failed', NOW(), $2)`,
        [report.id, errMsg]
      ).catch((e) => logger.error(e, "[cronScheduler] scheduled report error history insert failed"));
      errors++;
    }
  }

  return `Sent ${sent} scheduled reports, ${errors} errors`;
}

async function govExpiryAlerts(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let alerted = 0;

  for (const company of companies) {
    const [hrAsgn] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
      [company.id]
    );
    if (!hrAsgn) continue;

    const expiringEmployees = await rawQuery<Record<string, unknown>>(
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
            companyId: company.id, assignmentId: hrAsgn.id as number,
            type: "gov_expiry_alert",
            title: `${check.label} تنتهي: ${emp.name}`,
            body: `${check.label} الموظف ${emp.name} (${emp.iqamaNumber || "-"}) تنتهي خلال ${check.daysLeft} يوم — يرجى تجديدها عبر نظام مقيم`,
            priority: check.daysLeft <= 7 ? "high" : "normal",
            refType: "employee", refId: emp.id as number,
          });
          alerted++;
        }
      }
    }

    const expiringVehicles = await rawQuery<Record<string, unknown>>(
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
            companyId: company.id, assignmentId: hrAsgn.id as number,
            type: "gov_expiry_alert",
            title: `${check.label} تنتهي: ${v.plateNumber}`,
            body: `${check.label} للمركبة ${v.plateNumber} (${v.make} ${v.model}) تنتهي خلال ${check.daysLeft} يوم — يرجى التجديد عبر نظام تم`,
            priority: check.daysLeft <= 7 ? "high" : "normal",
            refType: "fleet_vehicle", refId: v.id as number,
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
    const expiring = await rawQuery<Record<string, unknown>>(
      `SELECT v.id AS "vendorId", v.name AS "vendorName",
              vc."endDate", (vc."endDate"::date - CURRENT_DATE) AS "daysLeft",
              vc.title AS "contractTitle"
       FROM vendor_contracts vc
       JOIN suppliers v ON v.id = vc."vendorId"
       WHERE vc."companyId" = $1 AND vc.status = 'active'
         AND vc."endDate" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '90 days'
         AND NOT EXISTS (
           SELECT 1 FROM automation_logs al
           WHERE al."automationType" = 'vendor_contract_expiry'
             AND al."entityType" = 'vendor_contract' AND al."entityId" = vc.id
             AND al."createdAt" > NOW() - INTERVAL '7 days'
         )`,
      [company.id]
    ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return []; });

    for (const c of expiring) {
      const daysLeft = Number(c.daysLeft);
      if (![90, 60, 30, 14, 7].some((d) => daysLeft <= d + 2 && daysLeft >= d - 2)) continue;

      const [purchaseAsgn] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM employee_assignments WHERE "companyId" = $1
         AND role IN ('finance_manager','general_manager','owner') AND status = 'active' LIMIT 1`,
        [company.id]
      ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [null]; });

      if (!purchaseAsgn) continue;

      await createNotification({
        companyId: company.id,
        assignmentId: purchaseAsgn.id as number,
        type: "vendor_contract_expiry",
        title: `عقد مورد ينتهي: ${c.vendorName}`,
        body: `عقد "${c.contractTitle}" مع المورد ${c.vendorName} ينتهي خلال ${daysLeft} يوم (${c.endDate}) — يرجى المراجعة والتجديد`,
        priority: daysLeft <= 14 ? "high" : "normal",
        refType: "vendor", refId: c.vendorId as number,
      });

      await rawExecute(
        `INSERT INTO automation_logs ("companyId","automationType","triggerReason","actionTaken","entityType","entityId","createdAt")
         VALUES ($1,'vendor_contract_expiry',$2,$3,'vendor_contract',$4,NOW())`,
        [company.id, `عقد المورد ${c.vendorName} ينتهي خلال ${daysLeft} يوم`, "إرسال إشعار تنبيه للمشتريات", c.vendorId]
      ).catch((e) => logger.error(e, "[cronScheduler] vendor contract expiry log insert failed"));
      alerted++;
    }
  }
  return `Vendor contract expiry alerts: ${alerted} notifications sent`;
}

async function dailySystemHealthReport(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let reports = 0;

  const [errorCount] = await rawQuery<Record<string, unknown>>(
    `SELECT COUNT(*) AS cnt FROM cron_logs WHERE status = 'failed' AND "createdAt" > NOW() - INTERVAL '24 hours'`
  ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [{ cnt: 0 }]; });

  const [failedNotifs] = await rawQuery<Record<string, unknown>>(
    `SELECT COUNT(*) AS cnt FROM notification_delivery_log WHERE status = 'failed' AND "queuedAt" > NOW() - INTERVAL '24 hours'`
  ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [{ cnt: 0 }]; });

  const [dbSize] = await rawQuery<Record<string, unknown>>(
    `SELECT pg_size_pretty(pg_database_size(current_database())) AS size`
  ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [{ size: 'N/A' }]; });

  for (const company of companies) {
    const [activeUsers] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(DISTINCT "userId") AS cnt FROM activity_logs
       WHERE "companyId" = $1 AND "createdAt" > NOW() - INTERVAL '24 hours'`,
      [company.id]
    ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [{ cnt: 0 }]; });

    const [techAsgn] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1
       AND role IN ('general_manager','owner') AND status = 'active' LIMIT 1`,
      [company.id]
    ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [null]; });

    if (!techAsgn) continue;

    const errorCnt = Number(errorCount?.cnt ?? 0);
    const failedNotifCnt = Number(failedNotifs?.cnt ?? 0);
    const activeUsersCnt = Number(activeUsers?.cnt ?? 0);

    await createNotification({
      companyId: company.id,
      assignmentId: techAsgn.id as number,
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
  ).catch((e) => { logger.error(e, "[cronScheduler] cleanup query failed"); return { affectedRows: 0 }; });
  cleaned += expiredSessions;

  const { affectedRows: oldCronLogs } = await rawExecute(
    `DELETE FROM cron_logs WHERE "createdAt" < NOW() - INTERVAL '90 days'`
  ).catch((e) => { logger.error(e, "[cronScheduler] cleanup query failed"); return { affectedRows: 0 }; });
  cleaned += oldCronLogs;

  const { affectedRows: oldDeliveryLogs } = await rawExecute(
    `DELETE FROM notification_delivery_log WHERE "queuedAt" < NOW() - INTERVAL '90 days' AND status IN ('delivered','failed')`
  ).catch((e) => { logger.error(e, "[cronScheduler] cleanup query failed"); return { affectedRows: 0 }; });
  cleaned += oldDeliveryLogs;

  const { affectedRows: oldNotifLogs } = await rawExecute(
    `DELETE FROM notification_log WHERE "createdAt" < NOW() - INTERVAL '90 days'`
  ).catch((e) => { logger.error(e, "[cronScheduler] cleanup query failed"); return { affectedRows: 0 }; });
  cleaned += oldNotifLogs;

  // user_activity_log fills up fast (every page-view + action gets a row).
  // 90 days is enough for behavioural-intelligence and proactive analytics;
  // older rows would only inflate the table without analytical value.
  const { affectedRows: oldActivityLogs } = await rawExecute(
    `DELETE FROM user_activity_log WHERE "createdAt" < NOW() - INTERVAL '90 days'`
  ).catch((e) => { logger.error(e, "[cronScheduler] cleanup query failed"); return { affectedRows: 0 }; });
  cleaned += oldActivityLogs;

  try {
    await rawExecute(
      `INSERT INTO audit_archive SELECT * FROM event_logs WHERE "createdAt" < NOW() - INTERVAL '365 days'
       ON CONFLICT DO NOTHING`
    ).catch((e) => logger.error(e, "[cronScheduler] audit archive insert failed"));
    const { affectedRows: archivedLogs } = await rawExecute(
      `DELETE FROM event_logs WHERE "createdAt" < NOW() - INTERVAL '365 days'`
    ).catch((e) => { logger.error(e, "[cronScheduler] cleanup query failed"); return { affectedRows: 0 }; });
    cleaned += archivedLogs;
  } catch (e) { logger.error(e, "[cronScheduler] event log archival failed"); }

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
      ).catch((e) => { logger.error(e, "[cronScheduler] cleanup query failed"); return { affectedRows: 0 }; });
      cleaned += affectedRows;
    }
  } catch (e) { logger.error(e, "[cronScheduler] orphaned workflow instances cleanup failed"); }

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
      ).catch((e) => { logger.error(e, "[cronScheduler] cleanup query failed"); return { affectedRows: 0 }; });
      cleaned += affectedRows;
    }
  } catch (e) { logger.error(e, "[cronScheduler] orphaned approval requests cleanup failed"); }

  return `Data cleanup: ${cleaned} records cleaned`;
}

// ─────────────────────────────────────────────────────────────────────────────
// OBLIGATIONS SCANNER (Track C.2) — يرقّي الالتزامات المتأخرة وتصعيداتها
// ─────────────────────────────────────────────────────────────────────────────
async function hourlyObligationsScan(): Promise<string> {
  const r = await scanObligations();
  return `Obligations scan: breached=${r.breachedCount}, L1=${r.escalatedL1}, L2=${r.escalatedL2}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DUNNING AUTO-SEND (Track C.3) — يرسل خطابات التحصيل حسب المرحلة تلقائياً
// ─────────────────────────────────────────────────────────────────────────────
async function dailyDunningAutoSend(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(
    `SELECT id FROM companies WHERE status = 'active'`
  );
  let totalSent = 0;
  let totalSkipped = 0;

  for (const c of companies) {
    try {
      // Ensure dunning tables exist
      await rawExecute(`
        CREATE TABLE IF NOT EXISTS dunning_letters (
          id SERIAL PRIMARY KEY,
          "companyId" INTEGER NOT NULL,
          "invoiceId" INTEGER NOT NULL,
          "clientId" INTEGER,
          stage INTEGER NOT NULL,
          "daysPastDue" INTEGER NOT NULL,
          "outstandingAmount" NUMERIC(18,2) NOT NULL,
          "letterContent" TEXT,
          "sentAt" TIMESTAMP DEFAULT NOW(),
          "sentBy" INTEGER,
          "sentVia" VARCHAR(16) DEFAULT 'manual',
          status VARCHAR(16) DEFAULT 'sent'
        )
      `);
      await rawExecute(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "lastDunningStage" INTEGER DEFAULT 0`);
      await rawExecute(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "lastDunningAt" TIMESTAMP`);

      // Find overdue invoices needing dunning
      const today = todayISO();
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT i.id, i.ref, i."dueDate", i.total, COALESCE(i."paidAmount",0) AS "paidAmount",
                i."clientId", COALESCE(i."lastDunningStage",0) AS "lastStage", i."lastDunningAt",
                GREATEST(0, ($1::date - i."dueDate"::date))::int AS "daysPastDue"
         FROM invoices i
         WHERE i."companyId"=$2
           AND i.status NOT IN ('paid','cancelled')
           AND COALESCE(i."deletedAt",NULL) IS NULL
           AND i."dueDate" IS NOT NULL
           AND i."dueDate"::date < $1::date
           AND (i.total - COALESCE(i."paidAmount",0)) > 0
         LIMIT 500`,
        [today, c.id]
      );

      for (const r of rows) {
        const days = Number(r.daysPastDue);
        let stage: number;
        if (days <= 14) stage = 1;
        else if (days <= 30) stage = 2;
        else if (days <= 60) stage = 3;
        else if (days <= 90) stage = 4;
        else stage = 5;

        // Skip if already at this stage within last 24h or already past this stage
        if (Number(r.lastStage) >= stage && r.lastDunningAt) {
          const hoursSince = (Date.now() - new Date(r.lastDunningAt as string | Date).getTime()) / 36e5;
          if (hoursSince < 24) { totalSkipped++; continue; }
        }

        const outstanding = roundTo2(Number(r.total) - Number(r.paidAmount));
        await rawExecute(
          `INSERT INTO dunning_letters ("companyId","invoiceId","clientId",stage,"daysPastDue","outstandingAmount","sentVia")
           VALUES ($1,$2,$3,$4,$5,$6,'auto')`,
          [c.id, r.id, r.clientId, stage, days, outstanding]
        );
        await rawExecute(
          `UPDATE invoices SET "lastDunningStage"=$1, "lastDunningAt"=NOW() WHERE id=$2`,
          [stage, r.id]
        );
        totalSent++;
      }
    } catch (err) {
      logger.error(err, `Dunning auto-send error for company ${c.id}:`);
    }
  }
  return `Dunning auto-send: sent=${totalSent}, skipped=${totalSkipped}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY BAD DEBT PROVISION REMINDER (Track C.3)
// ─────────────────────────────────────────────────────────────────────────────
async function monthlyBadDebtReminder(): Promise<string> {
  const companies = await rawQuery<{ id: number; name: string }>(
    `SELECT id, name FROM companies WHERE status = 'active'`
  );
  let notified = 0;
  for (const c of companies) {
    try {
      const [cfoRow] = await rawQuery<{ id: number }>(
        `SELECT ea.id FROM employee_assignments ea
         JOIN user_roles ur ON ur."userId" = ea."employeeId"
         WHERE ea."companyId"=$1 AND ea.status='active' AND ur."roleKey"='finance_manager'
         LIMIT 1`,
        [c.id]
        // as-any-reason: justified-pragmatic - catch fallback preserves existing empty-result behavior while satisfying route return typing
      ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [] as any; });
      const cfoId = cfoRow?.id;
      if (!cfoId) continue;
      await createNotification({
        companyId: c.id,
        assignmentId: cfoId,
        type: "bad_debt_reminder",
        title: "تذكير: احتساب مخصص الديون المشكوك فيها",
        body: `تم دخول شهر جديد — يرجى مراجعة قائمة تقادم الذمم واحتساب مخصص الديون المشكوك في تحصيلها عبر /finance/bad-debt/post`,
        priority: "medium",
      });
      notified++;
    } catch (err) {
      logger.error(err, `Bad debt reminder error for company ${c.id}:`);
    }
  }
  return `Bad debt reminders sent: ${notified}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// MONTHLY FX REVALUATION REMINDER (Track C.3)
// ─────────────────────────────────────────────────────────────────────────────
async function monthlyFxRevaluationReminder(): Promise<string> {
  const companies = await rawQuery<{ id: number; name: string }>(
    `SELECT id, name FROM companies WHERE status = 'active'`
  );
  let notified = 0;
  for (const c of companies) {
    try {
      // Only remind if company has foreign-currency exposure
      const [fxExposure] = await rawQuery<Record<string, unknown>>(
        `SELECT COUNT(*)::int AS n FROM invoices
         WHERE "companyId"=$1 AND currency IS NOT NULL AND currency<>'SAR' AND status NOT IN ('paid','cancelled')`,
        [c.id]
      ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [{ n: 0 }]; });
      if (!fxExposure || fxExposure.n === 0) continue;

      const [cfoRow] = await rawQuery<{ id: number }>(
        `SELECT ea.id FROM employee_assignments ea
         JOIN user_roles ur ON ur."userId" = ea."employeeId"
         WHERE ea."companyId"=$1 AND ea.status='active' AND ur."roleKey"='finance_manager'
         LIMIT 1`,
        [c.id]
        // as-any-reason: justified-pragmatic - catch fallback preserves existing empty-result behavior while satisfying route return typing
      ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [] as any; });
      const cfoId = cfoRow?.id;
      if (!cfoId) continue;
      await createNotification({
        companyId: c.id,
        assignmentId: cfoId,
        type: "fx_revaluation_reminder",
        title: "تذكير: إعادة تقييم العملات الأجنبية",
        body: `يوجد ${fxExposure.n} فاتورة بعملة أجنبية مفتوحة — يرجى ترحيل إعادة التقييم الشهرية عبر /finance/fx/revaluation/post`,
        priority: "medium",
      });
      notified++;
    } catch (err) {
      logger.error(err, `FX reminder error for company ${c.id}:`);
    }
  }
  return `FX revaluation reminders sent: ${notified}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// DAILY BUDGET VARIANCE ALERT (Track C.3)
// ─────────────────────────────────────────────────────────────────────────────
async function dailyBudgetVarianceAlert(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(
    `SELECT id FROM companies WHERE status = 'active'`
  );
  const period = currentPeriod();
  let alerted = 0;

  for (const c of companies) {
    try {
      const [y, m] = period.split("-").map(Number);
      const periodStart = `${y}-${String(m).padStart(2, "0")}-01`;
      const periodEnd = toDateISO(new Date(y, m, 0));

      // Find budgets near or over limit
      const overBudget = await rawQuery<Record<string, unknown>>(
        `SELECT b."accountCode", coa.name AS "accountName", b.amount AS "budgetAmount",
                COALESCE((
                  SELECT SUM(jl.debit - jl.credit)
                  FROM journal_lines jl
                  JOIN journal_entries je ON je.id = jl."journalId"
                  WHERE je."companyId" = b."companyId" AND je."deletedAt" IS NULL
                    AND jl."accountCode" = b."accountCode"
                    AND je."createdAt"::date BETWEEN $2::date AND $3::date
                ), 0) AS "actualAmount"
         FROM budgets b
         LEFT JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = b."companyId"
         WHERE b."companyId"=$1 AND b.period=$4 AND b.amount > 0`,
        [c.id, periodStart, periodEnd, period]
      );

      const overages = overBudget.filter((r: Record<string, unknown>) => {
        const actual = Number(r.actualAmount);
        const budget = Number(r.budgetAmount);
        return budget > 0 && actual > budget * 0.9;
      });

      if (overages.length === 0) continue;

      const [cfoRow] = await rawQuery<{ id: number }>(
        `SELECT ea.id FROM employee_assignments ea
         JOIN user_roles ur ON ur."userId" = ea."employeeId"
         WHERE ea."companyId"=$1 AND ea.status='active' AND ur."roleKey"='finance_manager'
         LIMIT 1`,
        [c.id]
        // as-any-reason: justified-pragmatic - catch fallback preserves existing empty-result behavior while satisfying route return typing
      ).catch((e) => { logger.error(e, "[cronScheduler] query failed"); return [] as any; });
      const cfoId = cfoRow?.id;
      if (!cfoId) continue;

      const summary = overages
        .slice(0, 5)
        .map((r: Record<string, unknown>) => `• ${r.accountName ?? r.accountCode}: ${Math.round((Number(r.actualAmount) / Number(r.budgetAmount)) * 100)}%`)
        .join("\n");

      await createNotification({
        companyId: c.id,
        assignmentId: cfoId,
        type: "budget_variance_alert",
        title: `تنبيه: ${overages.length} حساب قارب أو تجاوز الميزانية`,
        body: summary + (overages.length > 5 ? `\n... و${overages.length - 5} حساب آخر` : ""),
        priority: overages.some((r: any) => Number(r.actualAmount) > Number(r.budgetAmount)) ? "high" : "medium",
      });
      alerted++;
    } catch (err) {
      logger.error(err, `Budget variance alert error for company ${c.id}:`);
    }
  }
  return `Budget variance alerts sent: ${alerted}`;
}

async function dailyAutoViolationDetection(): Promise<string> {
  const result = await runAutoDetectionAllCompanies();
  return `الرصد التلقائي: ${result.totalDetected} واقعة مكتشفة، ${result.totalMemos} محضر جديد عبر ${result.companies} شركة`;
}

// ── Umrah cron handlers (C27, C29-C32) ──

// C27 — daily proactive overstay scan. Spec §15 row C27:
// "SELECT معتمرين is_inside_kingdom AND actual_stay > program_duration → إنشاء غرامة + تنبيه"
// Distinct from C28 (absconder) which only fires on status='violated'. This one
// pre-empts: a pilgrim who is still INSIDE KSA but past their program-duration
// gets flagged + a violation row added (de-duped via NOT EXISTS).
async function umrahDailyOverstayScan(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE status = 'active'`);
  let detected = 0;
  for (const c of companies) {
    const overstayed = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p."fullName", p."passportNumber", p."groupId", p."subAgentId",
              p."actualStayDays", p."programDuration",
              GREATEST(0, COALESCE(p."actualStayDays",0) - COALESCE(p."programDuration",0)) AS "overDays"
         FROM umrah_pilgrims p
        WHERE p."companyId"=$1
          AND p."deletedAt" IS NULL
          AND COALESCE(p."isInsideKingdom", true) = true
          AND p.status NOT IN ('departed','cancelled','violated')
          AND COALESCE(p."actualStayDays",0) > COALESCE(p."programDuration",0)
          AND COALESCE(p."programDuration",0) > 0
          AND NOT EXISTS (
            SELECT 1 FROM umrah_violations v
             WHERE v."companyId"=$1 AND v."mutamerId"=p.id
               AND v.type='overstay' AND v."deletedAt" IS NULL
          )`,
      [c.id]
    );
    for (const o of overstayed) {
      // Per-day penalty pulled from settings (default 0 — spec leaves it as a
      // company-set value). The violation row is still created so the agent
      // sees the breach even if penalty is 0.
      const [setting] = await rawQuery<{ value: string }>(
        `SELECT value FROM system_settings
          WHERE key='umrah.overstay_daily_penalty'
            AND ( ("companyId" IS NULL AND "branchId" IS NULL)
                  OR ("companyId" = $1 AND "branchId" IS NULL) )
          ORDER BY "companyId" NULLS FIRST LIMIT 1`,
        [c.id]
      );
      const perDay = Number(setting?.value ?? 0);
      const penalty = Math.max(0, Number(o.overDays) || 0) * perDay;
      await rawExecute(
        `INSERT INTO umrah_violations ("companyId","branchId",type,"referenceType","referenceNumber",
          "mutamerId","groupId","subAgentId","penaltyAmount",status,description,"createdAt","updatedAt")
         VALUES ($1,0,'overstay','passport',$2,$3,$4,$5,$6,'detected',$7,NOW(),NOW())`,
        [
          c.id, o.passportNumber || '', o.id, o.groupId, o.subAgentId, penalty,
          `تجاوز مدة البرنامج بـ ${o.overDays} يوم — رصد تلقائي`,
        ]
      );
      detected++;
    }
    if (overstayed.length > 0) {
      const mgr = await getManagerAssignmentId(c.id, 0);
      if (mgr) {
        await createNotification({
          companyId: c.id, assignmentId: mgr,
          type: "umrah", title: "رصد معتمرين متجاوزين",
          body: `${overstayed.length} معتمر تجاوز مدة البرنامج — تم إنشاء غرامات`,
          priority: "high",
        });
      }
    }
  }
  return `فحص المتجاوزين: ${detected} حالة جديدة عبر ${companies.length} شركة`;
}

async function umrahDailyAbsconderCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE status = 'active'`);
  let detected = 0;
  for (const c of companies) {
    const absconders = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p."fullName", p."passportNumber", p."groupId", p."subAgentId"
       FROM umrah_pilgrims p
       WHERE p."companyId"=$1 AND p."deletedAt" IS NULL
         AND p.status = 'violated'
         AND NOT EXISTS (
           SELECT 1 FROM umrah_violations v
           WHERE v."companyId"=$1 AND v."mutamerId"=p.id AND v.type='absconded' AND v."deletedAt" IS NULL
         )`,
      [c.id]
    );
    for (const ab of absconders) {
      await rawExecute(
        `INSERT INTO umrah_violations ("companyId","branchId",type,"referenceType","referenceNumber",
          "mutamerId","groupId","subAgentId","penaltyAmount",status,description,"createdAt","updatedAt")
         VALUES ($1,0,'absconded','passport',$2,$3,$4,$5,2000,'detected','غرامة هروب معتمر — رصد تلقائي',NOW(),NOW())`,
        [c.id, ab.passportNumber || '', ab.id, ab.groupId, ab.subAgentId]
      );
      detected++;
    }
    if (absconders.length > 0) {
      const mgr = await getManagerAssignmentId(c.id, 0);
      if (mgr) {
        await createNotification({
          companyId: c.id, assignmentId: mgr,
          type: "umrah", title: "رصد هاربين جدد",
          body: `تم رصد ${absconders.length} معتمر متغيّب جديد وإنشاء غرامات 2,000 ر.س لكل منهم`,
          priority: "urgent",
        });
      }
    }
  }
  return `فحص الهاربين: ${detected} حالة جديدة عبر ${companies.length} شركة`;
}

async function umrahOverdueInvoiceEscalation(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE status = 'active'`);
  let escalated = 0;
  for (const c of companies) {
    const overdue = await rawQuery<Record<string, unknown>>(
      `SELECT si.id, si.ref, si.total, si."paidAmount", si."dueDate", si."subAgentId",
              sa.name AS "subAgentName"
       FROM umrah_sales_invoices si
       JOIN umrah_sub_agents sa ON sa.id = si."subAgentId"
       WHERE si."companyId"=$1 AND si.status NOT IN ('paid','cancelled')
         AND si."dueDate" < CURRENT_DATE AND si."deletedAt" IS NULL`,
      [c.id]
    );
    if (overdue.length === 0) continue;
    await rawExecute(
      `UPDATE umrah_sales_invoices SET status='overdue', "updatedAt"=NOW()
       WHERE "companyId"=$1 AND status NOT IN ('paid','cancelled','overdue')
         AND "dueDate" < CURRENT_DATE AND "deletedAt" IS NULL`,
      [c.id]
    );
    const mgr = await getManagerAssignmentId(c.id, 0);
    if (mgr) {
      await createNotification({
        companyId: c.id, assignmentId: mgr,
        type: "umrah", title: "فواتير عمرة متأخرة",
        body: `${overdue.length} فاتورة عمرة متأخرة بقيمة إجمالية ${overdue.reduce((s: number, i) => s + Number(i.total) - Number(i.paidAmount), 0).toFixed(2)} ر.س`,
        priority: "high",
      });
    }
    escalated += overdue.length;
  }
  return `تصعيد فواتير العمرة المتأخرة: ${escalated} فاتورة عبر ${companies.length} شركة`;
}

async function umrahWeeklyAgentPerformance(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE status = 'active'`);
  let reports = 0;
  for (const c of companies) {
    const stats = await rawQuery<Record<string, unknown>>(
      `SELECT sa.id, sa.name,
              COUNT(DISTINCT p.id)::int AS pilgrim_count,
              COUNT(DISTINCT v.id) FILTER (WHERE v.status IN ('detected','open'))::int AS violation_count,
              COALESCE(SUM(si.total), 0)::numeric(12,2) AS total_invoiced,
              COALESCE(SUM(si."paidAmount"), 0)::numeric(12,2) AS total_paid
       FROM umrah_sub_agents sa
       LEFT JOIN umrah_pilgrims p ON p."subAgentId"=sa.id AND p."companyId"=sa."companyId" AND p."deletedAt" IS NULL
       LEFT JOIN umrah_violations v ON v."subAgentId"=sa.id AND v."companyId"=sa."companyId" AND v."deletedAt" IS NULL
       LEFT JOIN umrah_sales_invoices si ON si."subAgentId"=sa.id AND si."companyId"=sa."companyId" AND si."deletedAt" IS NULL
       WHERE sa."companyId"=$1 AND sa."deletedAt" IS NULL
       GROUP BY sa.id, sa.name
       HAVING COUNT(DISTINCT p.id) > 0`,
      [c.id]
    );
    if (stats.length === 0) continue;
    const mgr = await getManagerAssignmentId(c.id, 0);
    if (mgr) {
      const top = stats.sort((a: any, b: any) => b.pilgrim_count - a.pilgrim_count).slice(0, 5);
      await createNotification({
        companyId: c.id, assignmentId: mgr,
        type: "umrah", title: "تقرير أداء وكلاء العمرة الأسبوعي",
        body: `${stats.length} وكيل فرعي نشط — أعلى 5: ${top.map((s: any) => `${s.name}(${s.pilgrim_count})`).join("، ")}`,
        priority: "normal",
      });
    }
    reports++;
  }
  return `تقارير أداء وكلاء العمرة: ${reports} شركة`;
}

async function umrahVisaExpiryAlerts(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE status = 'active'`);
  let alerted = 0;
  for (const c of companies) {
    const expiring = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p."fullName", p."visaNumber", p."visaExpiry", g.name AS "groupName"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_groups g ON g.id = p."groupId"
       WHERE p."companyId"=$1 AND p."deletedAt" IS NULL
         AND p.status NOT IN ('departed','cancelled')
         AND p."visaExpiry" IS NOT NULL
         AND p."visaExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`,
      [c.id]
    );
    if (expiring.length === 0) continue;
    const mgr = await getManagerAssignmentId(c.id, 0);
    if (mgr) {
      await createNotification({
        companyId: c.id, assignmentId: mgr,
        type: "umrah", title: "تنبيه انتهاء تأشيرات عمرة",
        body: `${expiring.length} تأشيرة ستنتهي خلال 7 أيام — ${expiring.slice(0, 3).map((p) => p.fullName).join("، ")}${expiring.length > 3 ? "..." : ""}`,
        priority: "high",
      });
    }
    alerted += expiring.length;
  }
  return `تنبيهات انتهاء التأشيرات: ${alerted} تأشيرة عبر ${companies.length} شركة`;
}

async function umrahMonthlyFinancialSummary(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE status = 'active'`);
  let sent = 0;
  for (const c of companies) {
    const summary = await rawQuery<Record<string, unknown>>(
      `SELECT
         COUNT(DISTINCT si.id)::int AS invoice_count,
         COALESCE(SUM(si.total), 0)::numeric(12,2) AS total_invoiced,
         COALESCE(SUM(si."paidAmount"), 0)::numeric(12,2) AS total_paid,
         COALESCE(SUM(si.total) - SUM(si."paidAmount"), 0)::numeric(12,2) AS outstanding,
         COUNT(DISTINCT si.id) FILTER (WHERE si.status='overdue')::int AS overdue_count,
         COALESCE(SUM(ni."totalAmount"), 0)::numeric(12,2) AS total_cost
       FROM umrah_sales_invoices si
       LEFT JOIN umrah_nusk_invoices ni ON ni."companyId"=si."companyId" AND ni."deletedAt" IS NULL
       WHERE si."companyId"=$1 AND si."deletedAt" IS NULL
         AND si."createdAt" >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
         AND si."createdAt" < DATE_TRUNC('month', CURRENT_DATE)`,
      [c.id]
    );
    const s = summary[0];
    if (!s || Number(s.invoice_count) === 0) continue;
    const cfo = await getCfoAssignmentId(c.id, 0);
    const mgr = await getManagerAssignmentId(c.id, 0);
    const target = cfo || mgr;
    if (target) {
      await createNotification({
        companyId: c.id, assignmentId: target,
        type: "umrah", title: "ملخص العمرة المالي الشهري",
        body: `الشهر الماضي: ${s.invoice_count} فاتورة، إيرادات ${s.total_invoiced} ر.س، محصّل ${s.total_paid} ر.س، مستحق ${s.outstanding} ر.س، متأخر ${s.overdue_count}`,
        priority: "normal",
      });
    }
    sent++;
  }
  return `الملخص المالي الشهري للعمرة: ${sent} شركة`;
}

// C5 (DT-4) — daily pilgrim-status advance.
//
// `POST /umrah/run-daily-status` is the only thing that walks a pilgrim
// through pending → arrived → overstayed / departed, and nothing ever
// triggered it: the daily run depended on an operator remembering to press
// the button. Because `run-penalty-engine` only looks at pilgrims already in
// `overstayed`, a forgotten click silently froze the whole overstay→penalty
// path. This cron runs the exact same status logic for every active company
// so the lifecycle advances on its own.
//
// Deliberately STATUS-ONLY (DT-4): it does not run the penalty engine and
// posts no GL. Penalty creation stays a manual, supervised action — the cron
// only keeps statuses current so that manual step has accurate input.
async function umrahDailyStatusAdvance(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE status = 'active'`);
  const today = todayISO();
  let arrived = 0, overstayed = 0, departed = 0;
  for (const c of companies) {
    const scope = { companyId: c.id, userId: 0, branchId: null };
    const [pendingToArrived, toOverstayed, toDeparted] = await Promise.all([
      rawQuery<{ id: number }>(
        `SELECT id FROM umrah_pilgrims WHERE "companyId"=$1 AND status='pending' AND "arrivalDate" <= $2 AND ("departureDate" IS NULL OR "departureDate" >= $2) AND "deletedAt" IS NULL`,
        [c.id, today]
      ),
      rawQuery<{ id: number }>(
        `SELECT id FROM umrah_pilgrims WHERE "companyId"=$1 AND status IN ('arrived','active') AND "departureDate" < $2 AND "actualDeparture" IS NULL AND "deletedAt" IS NULL`,
        [c.id, today]
      ),
      rawQuery<{ id: number }>(
        `SELECT id FROM umrah_pilgrims WHERE "companyId"=$1 AND status IN ('arrived','active') AND "actualDeparture" IS NOT NULL AND "actualDeparture" <= $2 AND "deletedAt" IS NULL`,
        [c.id, today]
      ),
    ]);

    let cArrived = 0, cOverstayed = 0, cDeparted = 0;
    for (const p of pendingToArrived) {
      try {
        await applyTransition({
          entity: "umrah_pilgrims", id: p.id, scope,
          action: "umrah.pilgrim.arrived",
          fromStates: ["pending"], toState: "arrived",
          setExtras: { actualArrival: today },
          extraWhere: `"deletedAt" IS NULL`,
        });
        cArrived++;
      } catch (e) { logger.warn(e, "[umrah_daily_status] arrival transition skipped"); }
    }
    for (const p of toOverstayed) {
      try {
        await applyTransition({
          entity: "umrah_pilgrims", id: p.id, scope,
          action: "umrah.pilgrim.overstayed",
          fromStates: ["arrived", "active"], toState: "overstayed",
          extraWhere: `"deletedAt" IS NULL`,
        });
        cOverstayed++;
      } catch (e) { logger.warn(e, "[umrah_daily_status] overstayed transition skipped"); }
    }
    for (const p of toDeparted) {
      try {
        await applyTransition({
          entity: "umrah_pilgrims", id: p.id, scope,
          action: "umrah.pilgrim.departed",
          fromStates: ["arrived", "active"], toState: "departed",
          extraWhere: `"deletedAt" IS NULL`,
        });
        cDeparted++;
      } catch (e) { logger.warn(e, "[umrah_daily_status] departed transition skipped"); }
    }

    arrived += cArrived; overstayed += cOverstayed; departed += cDeparted;
    if (cArrived + cOverstayed + cDeparted > 0) {
      emitEvent({
        companyId: c.id, userId: null,
        action: "umrah.daily_status.run", entity: "umrah_pilgrims", entityId: 0,
        details: JSON.stringify({
          date: today,
          arrivedUpdated: cArrived,
          overstayedUpdated: cOverstayed,
          departedUpdated: cDeparted,
          source: "cron",
        }),
      }).catch((e) => logger.error(e, "[cronScheduler] umrah daily status event failed"));
    }
  }
  return `تقديم حالة المعتمرين: ${arrived} وصول، ${overstayed} تجاوز، ${departed} مغادرة عبر ${companies.length} شركة`;
}

// --- Rate-limit fallback alerter (Task #176) ---------------------------------
// Notify GM/owner when getRedisRateLimitStatus() degrades to fallback-memory
// (and on recovery). Cooldown gates ALL fallback alerts (including flap
// re-entries). State is persisted in `system_settings` for cross-replica
// consistency under cron lock ownership changes.
const RATE_LIMIT_STATE_KEY = "rate_limit_alerter_state";
const RATE_LIMIT_REALERT_COOLDOWN_MS = 30 * 60_000;

interface RateLimitAlerterState {
  lastSeenStatus: RedisRateLimitStatus | null;
  lastAlertedAt: number;
  fallbackSince: number | null;
}

const EMPTY_RATE_LIMIT_STATE: RateLimitAlerterState = {
  lastSeenStatus: null,
  lastAlertedAt: 0,
  fallbackSince: null,
};

async function loadRateLimitAlerterState(): Promise<RateLimitAlerterState> {
  try {
    const rows = await rawQuery<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = $1 AND "companyId" IS NULL AND "branchId" IS NULL`,
      [RATE_LIMIT_STATE_KEY]
    );
    if (rows.length === 0 || !rows[0]?.value) return { ...EMPTY_RATE_LIMIT_STATE };
    const parsed = JSON.parse(rows[0].value) as Partial<RateLimitAlerterState>;
    return {
      lastSeenStatus: (parsed.lastSeenStatus as RedisRateLimitStatus | null) ?? null,
      lastAlertedAt: typeof parsed.lastAlertedAt === "number" ? parsed.lastAlertedAt : 0,
      fallbackSince: typeof parsed.fallbackSince === "number" ? parsed.fallbackSince : null,
    };
  } catch (e) {
    logger.error(e, "[cronScheduler] rate-limit alerter state load failed");
    return { ...EMPTY_RATE_LIMIT_STATE };
  }
}

async function saveRateLimitAlerterState(state: RateLimitAlerterState): Promise<void> {
  const value = JSON.stringify(state);
  try {
    // Upsert via INSERT … ON CONFLICT against the partial unique index that
    // covers `(key) WHERE "companyId" IS NULL AND "branchId" IS NULL` (see
    // migration 006_system_settings_table.sql). This makes the read+write
    // safe under concurrent ticks: the "DO UPDATE" branch atomically replaces
    // the JSON blob with the latest decision.
    await rawExecute(
      `INSERT INTO system_settings (key, value, "createdAt", "updatedAt")
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (key) WHERE "companyId" IS NULL AND "branchId" IS NULL
       DO UPDATE SET value = EXCLUDED.value, "updatedAt" = NOW()`,
      [RATE_LIMIT_STATE_KEY, value]
    );
  } catch (e) {
    logger.error(e, "[cronScheduler] rate-limit alerter state save failed");
  }
}

interface RateLimitAdminRecipient {
  companyId: number;
  assignmentId: number;
  email: string | null;
}

// Task #177: a configurable list of "infra admin" recipient emails that get
// the rate-limit fallback / recovery email even if they aren't a GM/owner of
// any tenant. Sources are merged (env + system_settings), de-duplicated case-
// insensitively, and applied on top of the per-tenant GM list. Cooldown in
// rateLimitFallbackAlertCheck still gates ALL emails (incl. these), so a
// flapping outage cannot storm the inbox.
const INFRA_ADMIN_EMAILS_SETTING_KEY = "infra_admin_emails";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmailList(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && EMAIL_RE.test(s));
}

function getInfraAdminEmailsFromEnv(): string[] {
  const raw = process.env.INFRA_ADMIN_EMAILS ?? "";
  return parseEmailList(raw);
}

async function getInfraAdminEmailsFromSettings(): Promise<string[]> {
  try {
    const rows = await rawQuery<{ value: string }>(
      `SELECT value FROM system_settings WHERE key = $1 AND "companyId" IS NULL AND "branchId" IS NULL`,
      [INFRA_ADMIN_EMAILS_SETTING_KEY]
    );
    if (rows.length === 0 || !rows[0]?.value) return [];
    const v = rows[0].value;
    // Accept both a JSON array (["a@x", "b@y"]) and a delimited string.
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) {
        return parsed
          .map((x) => (typeof x === "string" ? x.trim() : ""))
          .filter((s) => s.length > 0 && EMAIL_RE.test(s));
      }
    } catch {
      /* fall through to delimited parsing */
    }
    return parseEmailList(v);
  } catch (e) {
    logger.error(e, "[cronScheduler] infra admin emails settings lookup failed");
    return [];
  }
}

async function getInfraAdminEmails(): Promise<string[]> {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (e: string) => {
    const k = e.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(e);
  };
  for (const e of getInfraAdminEmailsFromEnv()) push(e);
  for (const e of await getInfraAdminEmailsFromSettings()) push(e);
  return out;
}

// Pivot company id used to satisfy the `email_queue."companyId"` column for
// infra-admin emails (which are platform-wide, not tenant-scoped). Prefers a
// company we already touched (admins[0]) so we never invent a foreign-key
// mismatch; falls back to any active company.
async function getPivotCompanyId(admins: RateLimitAdminRecipient[]): Promise<number | null> {
  if (admins.length > 0 && admins[0]) return admins[0].companyId;
  try {
    const rows = await rawQuery<{ id: number }>(
      `SELECT id FROM companies ORDER BY id ASC LIMIT 1`
    );
    return rows[0]?.id ?? null;
  } catch (e) {
    logger.error(e, "[cronScheduler] pivot company lookup failed");
    return null;
  }
}

async function sendInfraAdminEmails(
  emails: string[],
  pivotCompanyId: number | null,
  type: "rate_limit_fallback" | "rate_limit_recovered",
  title: string,
  body: string,
  excludeEmails: Iterable<string> = []
): Promise<number> {
  if (emails.length === 0 || pivotCompanyId === null) return 0;
  // Dedupe against GM/owner mailboxes that already received the same alert
  // through sendNotification — same human shouldn't get the same page twice.
  const exclude = new Set<string>();
  for (const e of excludeEmails) {
    if (e) exclude.add(e.toLowerCase());
  }
  let queued = 0;
  for (const toEmail of emails) {
    if (exclude.has(toEmail.toLowerCase())) continue;
    try {
      await rawExecute(
        `INSERT INTO email_queue ("companyId", "toEmail", "recipientName", subject, body, status, "createdAt", "refType", "refId")
         VALUES ($1, $2, $3, $4, $5, 'pending', NOW(), $6, $7)`,
        [pivotCompanyId, toEmail, "Infra Admin", title, body, "system_health", null]
      );
      queued++;
    } catch (e) {
      logger.error(e, `[cronScheduler] failed to queue infra-admin email for ${toEmail} (${type})`);
    }
  }
  return queued;
}

// Resolve one GM/owner per company (with their login email if any). Used by
// both the fallback alert and the recovery alert so the recipient set stays
// consistent — anyone who got the "degraded" ping will get the "recovered"
// ping from the same address.
async function getRateLimitAlertRecipients(): Promise<RateLimitAdminRecipient[]> {
  try {
    return await rawQuery<RateLimitAdminRecipient>(
      `SELECT DISTINCT ON (ea."companyId")
              ea."companyId" AS "companyId",
              ea.id          AS "assignmentId",
              u.email        AS "email"
       FROM employee_assignments ea
       LEFT JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN users u ON u."employeeId" = e.id
       WHERE ea.role IN ('general_manager','owner') AND ea.status = 'active'
       ORDER BY ea."companyId",
                CASE ea.role WHEN 'owner' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END,
                ea.id`
    );
  } catch (e) {
    logger.error(e, "[cronScheduler] rate-limit alert recipient lookup failed");
    return [];
  }
}

export async function rateLimitFallbackAlertCheck(): Promise<string> {
  const current = getRedisRateLimitStatus();
  const state = await loadRateLimitAlerterState();
  const previous = state.lastSeenStatus;

  // `disabled` = REDIS_URL not set (intentional, e.g. local dev). Not a
  // degradation worth alerting on — just clear any prior fallback timer.
  if (current === "disabled") {
    if (state.lastSeenStatus !== "disabled" || state.fallbackSince !== null) {
      await saveRateLimitAlerterState({
        lastSeenStatus: "disabled",
        lastAlertedAt: 0,
        fallbackSince: null,
      });
    }
    return "skipped (REDIS_URL not configured)";
  }

  const now = Date.now();

  if (current === "fallback-memory") {
    const fallbackSince = state.fallbackSince ?? now;
    const sinceLastAlert = now - state.lastAlertedAt;
    const isTransition = previous !== null && previous !== "fallback-memory";
    // Cooldown gates ALL fallback notifications (including fresh transitions
    // back into fallback after a brief recovery), so a flapping outage
    // — connected ↔ fallback every few minutes — cannot storm the inbox.
    if (state.lastAlertedAt > 0 && sinceLastAlert < RATE_LIMIT_REALERT_COOLDOWN_MS) {
      if (state.fallbackSince === null || state.lastSeenStatus !== "fallback-memory") {
        await saveRateLimitAlerterState({
          lastSeenStatus: "fallback-memory",
          lastAlertedAt: state.lastAlertedAt,
          fallbackSince,
        });
      }
      return "fallback active, within cooldown";
    }
    const minutesInFallback = Math.floor((now - fallbackSince) / 60000);
    const admins = await getRateLimitAlertRecipients();
    const fallbackTitle = "تنبيه أمني: حدود الطلبات تعمل بالذاكرة المحلية فقط";
    const fallbackBody = isTransition
      ? "تعذّر الاتصال بـ Redis — حدود معدّل الطلبات (rate limit) عادت للذاكرة المحلية لكل خادم. يبقى الحد مطبّقاً ولكن مشاركته بين النسخ والإقلاعات معطّلة. تحقّق من المتغيّر REDIS_URL وحالة خادم Redis."
      : `لا يزال نظام حدود الطلبات يعمل بالذاكرة المحلية منذ ${minutesInFallback} دقيقة — تحقّق من المتغيّر REDIS_URL وحالة خادم Redis.`;
    for (const admin of admins) {
      await sendNotification({
        companyId: admin.companyId,
        assignmentId: admin.assignmentId,
        type: "rate_limit_fallback",
        title: fallbackTitle,
        body: fallbackBody,
        priority: "high",
        refType: "system_health",
        // Push on both in-app AND email so an overnight degradation reaches an
        // admin who isn't looking at the dashboard. Email is silently dropped
        // by sendNotification when recipientEmail is unset, so this is safe
        // even for admin users without an email on file.
        channels: admin.email ? ["in_app", "email"] : ["in_app"],
        recipientEmail: admin.email ?? undefined,
      });
    }
    // Task #177: also email the configurable infra-admin recipient list
    // (env INFRA_ADMIN_EMAILS + system_settings 'infra_admin_emails'). These
    // are platform-level on-call addresses that may not map to any tenant GM.
    // The 30-minute cooldown above gates this whole branch, so infra admins
    // are not flooded by a flapping outage either.
    const infraEmails = await getInfraAdminEmails();
    const pivot = await getPivotCompanyId(admins);
    const adminEmails = admins.map((a) => a.email).filter((e): e is string => !!e);
    const infraQueued = await sendInfraAdminEmails(infraEmails, pivot, "rate_limit_fallback", fallbackTitle, fallbackBody, adminEmails);
    await saveRateLimitAlerterState({
      lastSeenStatus: "fallback-memory",
      lastAlertedAt: now,
      fallbackSince,
    });
    return `Rate-limit fallback alert sent to ${admins.length} admins + ${infraQueued} infra emails (${isTransition ? "transition" : `still degraded ${minutesInFallback}m`})`;
  }

  // current === "connected"
  if (previous === "fallback-memory") {
    const downtimeMin = state.fallbackSince ? Math.floor((now - state.fallbackSince) / 60000) : 0;
    const admins = await getRateLimitAlertRecipients();
    const recoveredTitle = "تم استعادة الاتصال بـ Redis";
    const recoveredBody = `عادت حدود معدّل الطلبات إلى وضعها المشترك بين النسخ بعد ${downtimeMin} دقيقة من العمل بالذاكرة المحلية.`;
    for (const admin of admins) {
      await sendNotification({
        companyId: admin.companyId,
        assignmentId: admin.assignmentId,
        type: "rate_limit_recovered",
        title: recoveredTitle,
        body: recoveredBody,
        priority: "normal",
        refType: "system_health",
        channels: admin.email ? ["in_app", "email"] : ["in_app"],
        recipientEmail: admin.email ?? undefined,
      });
    }
    // Mirror the infra-admin email recipients on recovery too — anyone who
    // was woken up by the "degraded" page deserves the all-clear.
    const infraEmails = await getInfraAdminEmails();
    const pivot = await getPivotCompanyId(admins);
    const adminEmails = admins.map((a) => a.email).filter((e): e is string => !!e);
    const infraQueued = await sendInfraAdminEmails(infraEmails, pivot, "rate_limit_recovered", recoveredTitle, recoveredBody, adminEmails);
    // Preserve `lastAlertedAt` so a fresh fallback within the cooldown
    // window after this recovery is still suppressed (flap suppression).
    await saveRateLimitAlerterState({
      lastSeenStatus: "connected",
      lastAlertedAt: state.lastAlertedAt,
      fallbackSince: null,
    });
    return `Rate-limit recovery alert sent to ${admins.length} admins + ${infraQueued} infra emails (downtime ${downtimeMin}m)`;
  }

  if (state.lastSeenStatus !== "connected") {
    await saveRateLimitAlerterState({
      lastSeenStatus: "connected",
      lastAlertedAt: state.lastAlertedAt,
      fallbackSince: null,
    });
  }
  return "ok";
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
  { name: "daily_auto_violation_detection", description: "الرصد التلقائي للمخالفات — تأخر وغياب ومغادرة مبكرة وخروج GPS", schedule: "30 23 * * *", handler: dailyAutoViolationDetection },
  { name: "umrah_daily_overstay_scan", description: "C27 — فحص المعتمرين المتجاوزين مدة البرنامج (داخل المملكة)", schedule: "0 6 * * *", handler: umrahDailyOverstayScan },
  { name: "umrah_daily_absconder_check", description: "فحص المعتمرين الهاربين يومياً وإنشاء غرامات", schedule: "0 6 * * *", handler: umrahDailyAbsconderCheck },
  { name: "umrah_overdue_invoice_escalation", description: "تصعيد فواتير العمرة المتأخرة يومياً", schedule: "0 8 * * *", handler: umrahOverdueInvoiceEscalation },
  { name: "umrah_weekly_agent_performance", description: "تقرير أداء وكلاء العمرة الأسبوعي", schedule: "0 9 * * 0", handler: umrahWeeklyAgentPerformance },
  { name: "umrah_visa_expiry_alerts", description: "تنبيهات انتهاء تأشيرات العمرة", schedule: "0 7 * * *", handler: umrahVisaExpiryAlerts },
  { name: "umrah_monthly_financial_summary", description: "ملخص العمرة المالي الشهري", schedule: "0 9 1 * *", handler: umrahMonthlyFinancialSummary },
  { name: "umrah_daily_status_advance", description: "C5 — تقديم حالة المعتمرين اليومية (وصول/تجاوز/مغادرة) — حالة فقط دون غرامات", schedule: "0 5 * * *", handler: umrahDailyStatusAdvance },
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
  { name: "zatca_retry_drain", description: "محاولة إعادة إرسال فواتير ZATCA المعلقة", schedule: "* * * * *", handler: zatcaRetryDrain },
  { name: "daily_fx_rate_fetch", description: "تحديث أسعار الصرف اليومية من المصادر الرسمية", schedule: "0 5 * * *", handler: dailyFxRateFetchCron },
  { name: "fx_staleness_check", description: "تنبيه أسعار الصرف القديمة", schedule: "0 6 * * *", handler: fxStalenessCheckCron },
  { name: "lot_expiry_scan", description: "تحويل الدفعات المنتهية تلقائياً إلى expired", schedule: "0 4 * * *", handler: lotExpiryScanCron },
  { name: "iqama_daily_alert", description: "تنبيه انتهاء الإقامات (90/60/30/14/7/1 يوم)", schedule: "0 7 * * *", handler: iqamaDailyAlertCron },
  { name: "saudization_monthly_snapshot", description: "لقطة شهرية للسعودة (نطاقات)", schedule: "0 2 1 * *", handler: saudizationMonthlySnapshotCron },
  { name: "abc_monthly_classification", description: "تصنيف ABC الشهري للمنتجات (Pareto)", schedule: "0 3 1 * *", handler: abcMonthlyClassificationCron },
  { name: "sms_queue_worker", description: "معالجة قائمة انتظار الرسائل النصية", schedule: "* * * * *", handler: processSmsQueue },
  { name: "whatsapp_queue_worker", description: "معالجة قائمة انتظار واتساب", schedule: "* * * * *", handler: processWhatsAppQueue },
  { name: "weekly_logs_archiving", description: "أرشفة السجلات القديمة أسبوعياً", schedule: "0 3 * * 0", handler: weeklyLogsArchiving },
  { name: "scheduled_reports_runner", description: "إرسال التقارير المجدولة", schedule: "0 * * * *", handler: runScheduledReports },
  { name: "notification_fallback_chains", description: "معالجة سلاسل التصعيد للإشعارات الفاشلة", schedule: "*/2 * * * *", handler: processFallbackChains },
  { name: "weekly_vendor_contract_expiry", description: "تنبيه انتهاء عقود الموردين (90/30 يوم)", schedule: "0 7 * * 1", handler: vendorContractExpiryAlerts },
  { name: "daily_system_health_report", description: "تقرير صحة النظام اليومي للمدير التقني", schedule: "0 6 * * *", handler: dailySystemHealthReport },
  { name: "weekly_data_cleanup", description: "تنظيف البيانات المؤقتة وأرشفة السجلات القديمة", schedule: "0 3 * * 0", handler: weeklyDataCleanup },
  { name: "retry_stuck_official_letters", description: "إعادة محاولة إرسال الخطابات المعتمدة العالقة", schedule: "*/15 * * * *", handler: retryStuckOfficialLetters },
  { name: "daily_recurring_journals", description: "تنفيذ القيود المحاسبية الدورية المستحقة", schedule: "0 1 * * *", handler: processDueRecurringJournals },
  { name: "hourly_obligations_scan", description: "فحص الالتزامات — ترقية المتأخرات وتصعيد المهام", schedule: "15 * * * *", handler: hourlyObligationsScan },
  { name: "daily_dunning_auto_send", description: "إرسال تلقائي لخطابات التحصيل حسب المرحلة", schedule: "0 9 * * *", handler: dailyDunningAutoSend },
  { name: "monthly_bad_debt_reminder", description: "تذكير CFO باحتساب مخصص الديون المشكوك فيها", schedule: "0 9 1 * *", handler: monthlyBadDebtReminder },
  { name: "monthly_fx_revaluation_reminder", description: "تذكير CFO بترحيل إعادة تقييم العملات", schedule: "0 9 28 * *", handler: monthlyFxRevaluationReminder },
  { name: "daily_budget_variance_alert", description: "تنبيه تجاوز الميزانية اليومي", schedule: "0 10 * * *", handler: dailyBudgetVarianceAlert },
  { name: "rate_limit_fallback_alert", description: "تنبيه عند انتقال حدود الطلبات إلى الذاكرة المحلية (Redis fallback)", schedule: "*/2 * * * *", handler: rateLimitFallbackAlertCheck },
  { name: "rbac_v2_expired_grants_cleanup", description: "تنظيف منح RBAC v2 منتهية الصلاحية", schedule: "0 3 * * *", handler: rbacV2ExpiredGrantsCleanup },
];

async function rbacV2ExpiredGrantsCleanup(): Promise<string> {
  // Drop user-level grants whose expires_at has passed. We delete rather
  // than mark as expired so the engine's hot-path query (which only
  // selects rows with expires_at IS NULL OR expires_at > NOW()) doesn't
  // grow unbounded.
  const userGrants = await rawExecute(
    `DELETE FROM rbac_user_grants
      WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '7 days'`
  );

  // Same for time-bound role assignments (rbac_user_roles.expires_at).
  // We keep them for a 7-day grace period after expiry for forensics,
  // then remove them.
  const userRoles = await rawExecute(
    `DELETE FROM rbac_user_roles
      WHERE expires_at IS NOT NULL AND expires_at < NOW() - INTERVAL '7 days'`
  );

  // Mark approved JIT requests whose grant has expired as 'expired' so
  // the user's JIT history shows the lifecycle correctly. The matching
  // rbac_user_grants row is already gone (deleted above) — this just
  // updates the JIT request bookkeeping.
  const jitExpired = await rawExecute(
    `UPDATE rbac_jit_requests
        SET status = 'expired', "updatedAt" = NOW()
      WHERE status = 'approved' AND expires_at IS NOT NULL AND expires_at < NOW()`
  );

  // Bump cache version on every company that lost grants/roles so the
  // engine refreshes its in-memory cache.
  if ((userGrants.affectedRows ?? 0) > 0 || (userRoles.affectedRows ?? 0) > 0) {
    await rawExecute(
      `UPDATE rbac_cache_version SET version = version + 1, "updatedAt" = NOW()`
    );
  }

  return `Removed ${userGrants.affectedRows ?? 0} expired user-grants, ${userRoles.affectedRows ?? 0} expired user-roles, marked ${jitExpired.affectedRows ?? 0} JIT requests as expired`;
}

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
      logger.error(err, `Failed to seed cron job ${job.name}:`);
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
        // A scheduled fire has no ambient context — give the whole run a
        // correlation id so every log line it emits (handler included) is
        // traceable to this one execution.
        await runWithCorrelationId(
          `cron-${def.name}-${randomUUID()}`,
          () => runJob(def),
        );
      }, {
        timezone: tz,
      });
      scheduledTasks.push(task);
      logger.info({ job: def.name, schedule: def.schedule }, "CRON job scheduled");
    } catch (err) {
      logger.error(err, `[CRON] Failed to schedule ${def.name}:`);
    }
  }

  logger.info({ jobCount: scheduledTasks.length }, "CRON scheduler started");
}

export async function triggerJobByName(jobName: string): Promise<{ success: boolean; result?: string; error?: string }> {
  const def = JOB_DEFINITIONS.find((j) => j.name === jobName);
  if (!def) return { success: false, error: `Job not found: ${jobName}` };

  const acquired = await acquireCronLock(def.name);
  if (!acquired) {
    return { success: false, error: `Job "${jobName}" is already running on another instance` };
  }

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
  } finally {
    await releaseCronLock(def.name);
  }
}

export function stopCronScheduler(): void {
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;
  logger.info("CRON scheduler stopped");
}

export async function reloadCronScheduler(): Promise<void> {
  logger.info("CRON scheduler reloading with updated timezone");
  stopCronScheduler();
  await startCronScheduler();
}
