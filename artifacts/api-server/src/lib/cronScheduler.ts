import cron from "node-cron";
import { randomUUID } from "node:crypto";
import { rawQuery, rawExecute, pool, withTransaction } from "./rawdb.js";
import { scoreEmployee, currentPeriodKey } from "./employeeScoringEngine.js";
import { detectSignals, persistSignals } from "./employeeSignalsEngine.js";
import { issueNumber } from "./numberingService.js";
import { logger } from "./logger.js";
import { config } from "./config.js";
import { saveAllCompaniesKPISnapshots } from "./kpiEngine.js";
import { runSmartAlertsAllCompanies } from "./smartAlerts.js";
import { runSelfAuditAllCompanies } from "./selfAuditEngine.js";
import { backfillCompany } from "./partyService.js";
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
  currentDateInTz,
  checkFinancialPeriodOpen,
} from "./businessHelpers.js";
import { broadcastAlert, sendNotification } from "./notificationService.js";
import { notifyBusinessEvent } from "./notifyBusinessEvent.js";
import { syncMailbox } from "./mailboxSync.js";
import { getVendorConfig } from "./vendorSettings.js";
import {
  TASK_SLA_REMINDER_SETTING_KEY,
  resolveTaskSlaReminderConfig,
  shouldFireSlaReminder,
} from "./inboxClassifier.js";
import { processFallbackChains, dispatchNotification } from "./notificationDispatch.js";
import {
  resolveSystemSmtpConfig,
  formatFromHeader,
  scrubSmtpSecrets,
  smtpTransportOptions,
  type SystemSmtpConfig,
} from "./systemSmtp.js";
import { runPendingTranscription } from "./pbxControl.js";
import { aiEngine } from "./aiEngine.js";
import { rawQuery as rawQueryShared, rawExecute as rawExecuteShared } from "./rawdb.js";
import { checkSlaStatus } from "./workflowEngine.js";
import { applyTransition } from "./lifecycleEngine.js";
import { runAllProactiveChecks, registerProactiveEventListeners } from "./proactiveEngine.js";
import { eventBus } from "./eventBus.js";
import { decryptSecret } from "./secrets.js";
import { processDueRecurringJournals } from "./recurringJournalProcessor.js";
import { processDueAmortizations } from "./engines/prepaidAmortizationEngine.js";
import { processDueRecognitions } from "./engines/deferredRevenueEngine.js";
import { overstayPenaltyAmount } from "./umrahPenaltyMath.js";
import { postBadDebtProvision } from "./finance/badDebtProvision.js";
import {
  assetDepreciationProfile, type DepreciationAssetRow,
  eosAccrualProfile, leaveAccrualProfile,
} from "./engines/recurringPostingEngine.js";
import {
  fleetTelematicsRetention,
  fleetTelematicsHeartbeat,
  fleetTelematicsPoll,
} from "./fleet/telematicsCron.js";
import { telematicsBreaker } from "./fleet/telematicsReliability.js";
import { setupBreakerCoordination } from "./fleet/telematicsBreakerCoordinator.js";
import { scanObligations, registerObligation } from "./obligationsEngine.js";
import { runAutoDetectionAllCompanies } from "./autoViolationEngine.js";
import { getRedisRateLimitStatus, type RedisRateLimitStatus } from "./rateLimitStore.js";
import { zatcaRetryDrain } from "./zatca/worker.js";
import { dailyFxRateFetchCron } from "./fx/jobs.js";
import { fxStalenessCheckCron } from "./fx/staleness-alert.js";
import { lotExpiryScanCron } from "./inventory/lots.js";
import { abcMonthlyClassificationCron } from "./inventory/abc-analysis.js";
import { iqamaDailyAlertCron } from "./saudi-compliance/iqama-cron.js";
import { selectApproachingRetirement } from "./saudi-compliance/retirement-alerts.js";
import { saudizationMonthlySnapshotCron } from "./saudi-compliance/saudization-snapshot.js";
import { recordJobRun } from "./observability.js";
import { runWithCorrelationId } from "./requestContext.js";
import { escalateSlaAllCompanies } from "./supportSlaEscalation.js";

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

// A process-unique lock owner. HOSTNAME alone is not guaranteed unique per
// autoscale replica, and releaseCronLock/renewCronLock match on locked_by —
// a shared owner id would let one replica release or renew another's lock.
const LOCK_OWNER = `${config.hostname}:${randomUUID()}`;
// Short TTL so a crashed replica frees the lock within minutes (not 30). A
// live job keeps its lock past the TTL via renewCronLock heartbeats.
const LOCK_TTL_MINUTES = 5;
const LOCK_HEARTBEAT_MS = 60_000;

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

// Heartbeat: push the lock's expiry forward while the job is still running,
// so a job that outlives LOCK_TTL_MINUTES never has its lock expire under it
// (which would let another replica double-run it). Matches on locked_by so
// it only ever renews this process's own lock.
async function renewCronLock(jobName: string): Promise<void> {
  try {
    await pool.query(
      `UPDATE cron_locks SET expires_at = NOW() + make_interval(mins => $3)
       WHERE job_name = $1 AND locked_by = $2`,
      [jobName, LOCK_OWNER, LOCK_TTL_MINUTES]
    );
  } catch (e) {
    logger.warn(e, `[cronScheduler] failed to renew cron lock for ${jobName}`);
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

  const heartbeat = setInterval(() => { void renewCronLock(def.name); }, LOCK_HEARTBEAT_MS);
  heartbeat.unref();

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
    // FND-008 — surface the failure operationally, not just in the log. A
    // failed scheduled job (SLA escalation, payroll reminders, obligation
    // scans …) affects every tenant, so raise a critical, dismissible alert
    // for each company's admins. Alerting errors are swallowed so they
    // never mask the original cron failure.
    //
    // IMPORTANT: do NOT include `errMsg` in the broadcast description.
    // Postgres exceptions routinely contain row-level values (e.g.
    // `duplicate key value violates ... (name)=(Mohamed Al-…)`), so
    // bleeding that string into every tenant's smart_alerts row leaks one
    // company's data into every other company's admin inbox. The full
    // error is already captured in `cron_jobs_log.errorMessage` (line 174
    // above) and in the server log (line 176) for ops to inspect.
    try {
      const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
      for (const c of companies) {
        await broadcastAlert(
          c.id,
          "cron_failure",
          `فشل مهمة مجدولة: ${def.name}`,
          `فشلت المهمة المجدولة "${def.name}" — راجع سجلّات المهام (cron_jobs_log)`,
          "critical",
        );
      }
    } catch (alertErr) {
      logger.error(alertErr, `[CRON] failed to raise failure alert for ${def.name}`);
    }
  } finally {
    clearInterval(heartbeat);
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
      `SELECT cd.id, NULL AS "employeeId", cd."documentType" AS "employeeName",
              cd."documentType", cd."expiryDate",
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
        // Also notify the employee directly — fan out across the
        // employee's channels (email/sms/whatsapp) via the bilingual
        // `document.expiring` template, picking the language from the
        // employee's linked user preferredLocale.
        const [empAsgn] = await rawQuery<Record<string, unknown>>(
          `SELECT id FROM employee_assignments WHERE "employeeId"=$1 AND "companyId"=$2 AND status='active' LIMIT 1`,
          [doc.employeeId, company.id]
        );
        if (empAsgn && empAsgn.id !== hrAsgn?.id) {
          await notifyBusinessEvent({
            companyId: company.id,
            templateKey: "document.expiring",
            templateVars: {
              documentType: String(doc.documentType ?? "—"),
              documentNumber: String(doc.documentNumber ?? doc.id ?? "—"),
              expiryDate: String(doc.expiryDate ?? "—"),
            },
            fallbackTitle: `وثيقتك تنتهي خلال ${daysLeft} يوم`,
            fallbackBody: `${doc.documentType} — تاريخ الانتهاء: ${doc.expiryDate}. يرجى تجديدها في أقرب وقت.`,
            assignmentId: empAsgn.id as number,
            recipientUser: doc.employeeId ? { type: "employee", id: doc.employeeId as number } : undefined,
            priority: daysLeft <= 14 ? "high" : "normal",
            refType: "employee_document",
            refId: (doc.id ?? doc.employeeId) as number,
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

// #1715 §5 — activate the dormant vehicle_maintenance_schedules table.
// It already models recurring preventive maintenance (intervalType
// days/mileage/hours + nextDueDate/nextDueKm) but NO job ever read it, so
// no reminder ever fired. This scan raises an alert + a maintenance
// obligation for every schedule that has come due (by date or by odometer),
// then advances nextDue* so it re-arms for the next cycle. Reuses the
// existing obligations/notifications backbone — no new table.
export async function scanVehicleMaintenanceSchedules(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let dueCount = 0;
  for (const company of companies) {
    const rows = await rawQuery<{
      id: number; vehicleId: number | null; scheduleName: string;
      intervalValue: number; nextDueDate: string | null; nextDueKm: number | null;
      plateNumber: string | null; currentMileage: number | null;
    }>(
      `SELECT s.id, s."vehicleId", s."scheduleName", s."intervalValue",
              s."nextDueDate"::text AS "nextDueDate", s."nextDueKm",
              v."plateNumber", v."currentMileage"
         FROM vehicle_maintenance_schedules s
         LEFT JOIN fleet_vehicles v ON v.id = s."vehicleId"
        WHERE s."companyId" = $1 AND s."isActive" = true AND s."deletedAt" IS NULL
          AND (
            (s."nextDueDate" IS NOT NULL AND s."nextDueDate" <= CURRENT_DATE)
            OR (s."nextDueKm" IS NOT NULL AND v."currentMileage" IS NOT NULL AND v."currentMileage" >= s."nextDueKm")
          )`,
      [company.id],
    );
    for (const s of rows) {
      const label = s.plateNumber ? `${s.scheduleName} — ${s.plateNumber}` : s.scheduleName;
      try {
        await broadcastAlert(
          company.id, "vehicle_maintenance_due",
          `صيانة مجدولة مستحقّة: ${label}`,
          `حان موعد «${s.scheduleName}»${s.plateNumber ? ` للمركبة ${s.plateNumber}` : ""} — جدول صيانة وقائية.`,
          "warning", "fleet_vehicle", s.vehicleId ?? undefined,
        );
        if (s.vehicleId) {
          await registerObligation({
            companyId: company.id,
            entityType: "vehicle",
            entityId: s.vehicleId,
            obligationType: "maintenance",
            title: `صيانة مجدولة: ${s.scheduleName}`,
            dueAt: s.nextDueDate ?? new Date().toISOString(),
            escalationSteps: [{ hoursAfterDue: 24, notifyRole: "fleet_manager" }],
            dedupeKey: `vmsched-${s.id}-${s.nextDueDate ?? s.nextDueKm ?? "due"}`,
            metadata: { scheduleId: s.id, nextDueKm: s.nextDueKm },
          });
        }
      } catch (e) {
        logger.error(e, "[cronScheduler] vehicle maintenance schedule notify failed");
      }
      // Re-arm: advance whichever trigger fired so it doesn't re-fire next run.
      await rawExecute(
        `UPDATE vehicle_maintenance_schedules
            SET "lastTriggeredAt" = now(),
                "lastTriggeredKm" = COALESCE($2, "lastTriggeredKm"),
                "nextDueDate" = CASE
                  WHEN "nextDueDate" IS NOT NULL AND "nextDueDate" <= CURRENT_DATE
                  THEN (CURRENT_DATE + (GREATEST("intervalValue", 1) || ' days')::interval)::date
                  ELSE "nextDueDate" END,
                "nextDueKm" = CASE
                  WHEN "nextDueKm" IS NOT NULL AND $2 IS NOT NULL AND $2 >= "nextDueKm"
                  THEN $2 + GREATEST("intervalValue", 1)
                  ELSE "nextDueKm" END,
                "updatedAt" = now()
          WHERE id = $1`,
        [s.id, s.currentMileage],
      );
      dueCount++;
    }
  }
  return `vehicle_maintenance_schedule_scan: ${dueCount} due schedule(s) processed`;
}

/**
 * TA-GAP-09 Phase 3 — sweep every active maps-usage threshold and
 * fire warning/critical events when the operator's cap is crossed.
 * Dedupe is enforced inside the lib via the alerts table UNIQUE.
 */
async function mapsUsageThresholdAlerts(): Promise<string> {
  const { runThresholdAlertCheck } = await import("./fleet/mapsUsageThresholdAlerts.js");
  const result = await runThresholdAlertCheck(new Date());
  return `[mapsUsageThresholdAlerts] checked=${result.thresholdsChecked} emitted=${result.alertsEmitted}`;
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
         -- PR-8a (#2077): access-grant assignments are not employment;
         -- never mark them absent (the admin was getting one absence
         -- row PER BRANCH per day).
         AND ea."isAccessGrant" = FALSE
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
  // SUP-015: escalation rule lives in one place — supportSlaEscalation.
  const escalated = await escalateSlaAllCompanies();
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
          // RD3-02 + RD3-03 — defense-in-depth: the refId comes from a
          // tenant-scoped approval_requests row, so under normal flow
          // the id IS company-bound. But auto-approval is a privileged
          // path with no human review, so we add an explicit companyId
          // predicate so a misconfigured request (or a future code bug
          // that lets a refId leak across tenants) can't mutate another
          // company's record.
          const entityUpdateMap: Record<string, { table: string; column: string }> = {
            purchase_order: { table: "purchase_orders", column: "status" },
            official_letter: { table: "official_letters", column: "status" },
          };
          const target = entityUpdateMap[req.refType as string];
          if (target) {
            await rawExecute(
              `UPDATE ${target.table} SET ${target.column} = 'approved' WHERE id = $1 AND "companyId" = $2`,
              [req.refId, req.companyId]
            ).catch((e) => logger.error(e, "[hourly_escalation] domain update failed:"));
          }
          const journalRefTypes = ["expense", "salary_advance", "custody"];
          if (journalRefTypes.includes(req.refType as string)) {
            await rawExecute(
              `UPDATE journal_entries SET status = 'posted' WHERE id = $1 AND "companyId" = $2 AND status = 'pending_approval'`,
              [req.refId, req.companyId]
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
        `INSERT INTO payroll_deductions ("companyId", "employeeId", type, amount, reason, date, "createdAt")
         SELECT $1, $2, 'absence', 0, $3, CURRENT_DATE, NOW()
         WHERE NOT EXISTS (
           SELECT 1 FROM payroll_deductions
           WHERE "companyId" = $1 AND "employeeId" = $2 AND date = CURRENT_DATE AND type = 'absence'
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
    // Include status='overdue' too — day-1 flips an invoice to 'overdue', so
    // excluding it here would silently skip the day-7 reminder when the cron
    // ran normally on day 1. Only paid/cancelled invoices are excluded.
    const invoices = await rawQuery<Record<string, unknown>>(
      `SELECT i.id, i.ref, i."clientId", i."branchId", i.total, i."paidAmount", i."dueDate",
              c.name AS "clientName", c.phone AS "clientPhone", c.email AS "clientEmail",
              c."isBlacklisted" AS "clientBlacklisted",
              c.classification AS "clientClassification",
              (CURRENT_DATE - i."dueDate"::date) AS "daysOverdue",
              i.status
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId"
       WHERE i."companyId" = $1 AND i.status NOT IN ('paid','cancelled')
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
      else if (days >= 1) phase = "first_reminder"; // Spec 03 §collection day-1: SMS+email to client
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

      // Spec ملف 03 §تحصيل 6 مراحل (السطر 46-47): يوم 1 → SMS+إيميل للعميل،
      // يوم 7 → إيميل ثاني للعميل (+ إشعار المحاسب الداخلي عبر broadcastAlert
      // أعلاه). تقطعنا الإشعار عند هذين اليومين فقط في هذه الشريحة (Slice 1
      // of the overdue activation plan). المراحل 21/30/60 — التصعيدات
      // الداخلية + الحظر + churn — تأتي في شريحة منفصلة لأنها قرارات أعمال.
      //
      // CHANNEL DISCIPLINE — CRITICAL: we pass `channels` EXPLICITLY here
      // because the default `invoice` routing rule resolves to
      // ["in_app","email"], and in_app without an assignmentId/targetRole
      // fans out to up to 100 ACTIVE employees in the tenant (see
      // notificationDispatch.resolveInAppRecipients). For a CLIENT-facing
      // dunning reminder that would (a) leak the client's outstanding
      // balance internally and (b) hit every employee with a malformed
      // "you have an overdue invoice" message. We keep client reminders to
      // email + sms ONLY and target the client by their own contact
      // details. The accountant's in_app awareness is preserved through
      // the broadcastAlert call above.
      if (days === 1 || days === 7) {
        const clientEmail = (inv.clientEmail as string | null) ?? null;
        const clientPhone = (inv.clientPhone as string | null) ?? null;
        if (!clientEmail && !clientPhone) {
          logger.info(`[cronScheduler] client invoice-overdue: no contact for inv=${inv.id} — skipped`);
        } else {
          const clientChannels: ("email" | "sms")[] = [];
          if (clientEmail) clientChannels.push("email");
          if (clientPhone) clientChannels.push("sms");
          try {
            const outstanding = Number(inv.total ?? 0) - Number(inv.paidAmount ?? 0);
            await dispatchNotification({
              companyId: company.id,
              eventCategory: "invoice.overdue",
              title: "",
              body: "",
              channels: clientChannels,
              templateKey: "invoice.overdue",
              templateVars: {
                invoiceRef: String(inv.ref ?? ""),
                days: String(days),
                amount: outstanding.toFixed(2),
              },
              recipientEmail: clientEmail ?? undefined,
              recipientPhone: clientPhone ?? undefined,
              recipientName: (inv.clientName as string | null) ?? undefined,
              clientId: inv.clientId as number,
              refType: "invoice",
              refId: inv.id as number,
              priority: "high",
            });
          } catch (e) {
            logger.warn(e, `[cronScheduler] client invoice-overdue notification failed (inv=${inv.id})`);
          }
        }
      }

      // ─────────────────────────────────────────────────────────────────────
      // Spec ملف 03 §تحصيل 6 مراحل (السطر 49-51): internal escalation tiers
      //   يوم 21 → تصعيد للمدير المالي
      //   يوم 30 → إشعار GM + حظر العميل + غرامة 2% شهرياً (مفوّض من إبراهيم)
      //   يوم 60 → إشعار القانوني + تصنيف العميل churned (مفوّض من إبراهيم)
      //
      // Channels: explicit ["email"] only. The internal in_app awareness is
      // already covered by the broadcastAlert call above (which fires for
      // EVERY phase). Adding in_app here would re-create the fan-out issue
      // Codex caught in slice 1.
      // ─────────────────────────────────────────────────────────────────────
      const inheritedBranchId = Number(inv.branchId ?? 0) || 1; // fallback to branch 1 if invoice has no branch
      const outstanding = Number(inv.total ?? 0) - Number(inv.paidAmount ?? 0);
      const escalationBase = {
        companyId: company.id,
        title: "",
        body: "",
        channels: ["email" as const],
        templateVars: {
          clientName: String(inv.clientName ?? "—"),
          invoiceRef: String(inv.ref ?? ""),
          days: String(days),
          amount: outstanding.toFixed(2),
        },
        clientId: inv.clientId as number,
        refType: "invoice",
        refId: inv.id as number,
        priority: "high" as const,
      };

      if (days === 21) {
        // Escalate to CFO (fallback chain CFO → GM → owner inside the helper).
        try {
          const cfoAssignmentId = await getCfoAssignmentId(company.id, inheritedBranchId);
          if (cfoAssignmentId) {
            const [cfo] = await rawQuery<{ name: string; email: string | null }>(
              `SELECT e.name, e.email FROM employee_assignments ea
                 JOIN employees e ON e.id = ea."employeeId"
                WHERE ea.id = $1`,
              [cfoAssignmentId],
            );
            await dispatchNotification({
              ...escalationBase,
              eventCategory: "invoice.escalation.fm",
              templateKey: "invoice.escalation.fm",
              templateVars: { ...escalationBase.templateVars, managerName: String(cfo?.name ?? "—") },
              assignmentId: cfoAssignmentId,
              recipientEmail: cfo?.email ?? undefined,
              recipientName: cfo?.name ?? undefined,
            });
          }
        } catch (e) {
          logger.warn(e, `[cronScheduler] invoice-overdue day-21 FM escalation failed (inv=${inv.id})`);
        }
      } else if (days === 30) {
        // 1) blacklist the client (block new invoices). Idempotent — only set
        //    if not already blacklisted, so we never thrash the row.
        if (!inv.clientBlacklisted) {
          try {
            await rawExecute(
              `UPDATE clients SET "isBlacklisted" = TRUE, "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2`,
              [inv.clientId as number, company.id],
            );
          } catch (e) {
            logger.warn(e, `[cronScheduler] invoice-overdue day-30 blacklist failed (client=${inv.clientId})`);
          }
        }
        // 2) notify GM (helper falls back to owner).
        try {
          const gmAssignmentId = await getDirectorAssignmentId(company.id, inheritedBranchId);
          if (gmAssignmentId) {
            const [gm] = await rawQuery<{ name: string; email: string | null }>(
              `SELECT e.name, e.email FROM employee_assignments ea
                 JOIN employees e ON e.id = ea."employeeId"
                WHERE ea.id = $1`,
              [gmAssignmentId],
            );
            await dispatchNotification({
              ...escalationBase,
              eventCategory: "invoice.blocked.gm",
              templateKey: "invoice.blocked.gm",
              templateVars: { ...escalationBase.templateVars, managerName: String(gm?.name ?? "—") },
              assignmentId: gmAssignmentId,
              recipientEmail: gm?.email ?? undefined,
              recipientName: gm?.name ?? undefined,
            });
          }
        } catch (e) {
          logger.warn(e, `[cronScheduler] invoice-overdue day-30 GM escalation failed (inv=${inv.id})`);
        }
      } else if (days === 60) {
        // 1) flip client classification to 'churned' — idempotent guard.
        if (inv.clientClassification !== "churned") {
          try {
            await rawExecute(
              `UPDATE clients SET classification = 'churned', "updatedAt" = NOW() WHERE id = $1 AND "companyId" = $2`,
              [inv.clientId as number, company.id],
            );
          } catch (e) {
            logger.warn(e, `[cronScheduler] invoice-overdue day-60 churn failed (client=${inv.clientId})`);
          }
        }
        // 2) hand over to legal (helper falls back GM → owner).
        try {
          const legal = await getLegalResponsible(company.id);
          if (legal) {
            const [legalContact] = await rawQuery<{ email: string | null }>(
              `SELECT e.email FROM employee_assignments ea
                 JOIN employees e ON e.id = ea."employeeId"
                WHERE ea.id = $1`,
              [legal.assignmentId],
            );
            await dispatchNotification({
              ...escalationBase,
              eventCategory: "invoice.legal_handover",
              templateKey: "invoice.legal_handover",
              templateVars: { ...escalationBase.templateVars, managerName: legal.employeeName },
              assignmentId: legal.assignmentId,
              recipientEmail: legalContact?.email ?? undefined,
              recipientName: legal.employeeName,
            });
          }
        } catch (e) {
          logger.warn(e, `[cronScheduler] invoice-overdue day-60 legal handover failed (inv=${inv.id})`);
        }
      }

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
        // G6 fix (#1141 coverage report §3 G6) — auto-generated POs
        // from inventory cron now go through the numbering center
        // (scheme `purchase.purchase_order`) instead of being created
        // with ref = NULL. Issue + INSERT + linkback wrapped in one
        // withTransaction so a failure of any step rolls back cleanly
        // — burning the counter slot was the old failure mode.
        try {
          await withTransaction(async (client) => {
            const issued = await issueNumber({
              companyId: company.id,
              branchId: null,
              moduleKey: "purchase",
              entityKey: "purchase_order",
              entityTable: "purchase_orders",
              actorId: null,
              metadata: { source: "cron.dailyInventoryCheck", productName: p.name },
              expectedTiming: "on_draft",
            });
            const ins = await client.query(
              `INSERT INTO purchase_orders ("companyId", notes, ref, status, "totalAmount", "createdAt")
               VALUES ($1, $2, $3, 'draft', 0, NOW()) RETURNING id`,
              [company.id, `طلب شراء تلقائي: ${p.name} (المخزون ${p.currentStock}/${p.threshold})`, issued.number]
            );
            await client.query(
              `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
              [ins.rows[0].id, issued.assignmentId]
            );
          });
          pos++;
        } catch (e) {
          logger.error(e, "[cronScheduler] auto purchase order issue+insert failed");
        }
      }

      // Notify the warehouse / general manager that a product hit its
      // reorder threshold — fan out via the bilingual `inventory.low_stock`
      // template (in_app + email/sms/whatsapp per routing rule).
      const [whMgr] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM employee_assignments
         WHERE "companyId" = $1 AND role IN ('warehouse_manager','general_manager','owner') AND status = 'active'
         LIMIT 1`,
        [company.id]
      );
      if (whMgr) {
        await notifyBusinessEvent({
          companyId: company.id,
          templateKey: "inventory.low_stock",
          templateVars: {
            productName: String(p.name ?? "—"),
            currentQty: String(p.currentStock ?? "0"),
          },
          fallbackTitle: "مخزون منخفض",
          fallbackBody: `الصنف ${p.name} وصل لحد المخزون الأدنى (${p.currentStock} متبقي)`,
          assignmentId: whMgr.id as number,
          priority: "normal",
          refType: "warehouse_product",
          refId: p.id as number,
          actionUrl: `/warehouse/products/${p.id}`,
        });
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

    // 2b. Rent-due reminders — notify the property manager about rent
    // installments due within 3 days that are still unpaid, via the
    // bilingual `property.rent.due` template. Once per (payment, 3-day
    // window) — keyed on dueDate landing exactly 3/1/0 days out so we
    // don't spam every run.
    const dueSoon = await rawQuery<Record<string, unknown>>(
      `SELECT rp.id, rp."dueDate", rp.amount,
              (rp."dueDate"::date - CURRENT_DATE) AS "daysLeft",
              rc."tenantName", rc."unitId",
              pu.name AS "unitName"
       FROM rent_payments rp
       JOIN rental_contracts rc ON rc.id = rp."contractId"
       LEFT JOIN property_units pu ON pu.id = rc."unitId"
       WHERE rc."companyId" = $1
         AND rp.status IN ('pending','partial')
         AND (rp."dueDate"::date - CURRENT_DATE) IN (3, 1, 0)`,
      [company.id]
    );
    const [propMgr] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM employee_assignments
       WHERE "companyId" = $1 AND role IN ('property_manager','general_manager','owner') AND status = 'active'
       LIMIT 1`,
      [company.id]
    );
    for (const rp of dueSoon) {
      await notifyBusinessEvent({
        companyId: company.id,
        templateKey: "property.rent.due",
        templateVars: {
          unitName: String(rp.unitName ?? rp.tenantName ?? "—"),
          dueDate: String(rp.dueDate ?? "—"),
          amount: String(rp.amount ?? "0"),
        },
        fallbackTitle: "إيجار مستحق",
        fallbackBody: `إيجار الوحدة ${rp.unitName ?? "—"} مستحق بتاريخ ${rp.dueDate}`,
        assignmentId: propMgr?.id as number | undefined,
        priority: Number(rp.daysLeft) <= 0 ? "high" : "normal",
        refType: "rent_payment",
        refId: rp.id as number,
        actionUrl: `/properties/rent-payments/${rp.id}`,
      });
      alerted++;
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
  // SUP-015: daily safety sweep — same unified rule as the hourly job.
  const updated = await escalateSlaAllCompanies();
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
      `SELECT rp.id, rp."dueDate", rp.amount, rp."contractId",
              c."branchId",
              COALESCE(NULLIF(c."tenantName", ''), t.name)             AS "tenantName",
              COALESCE(NULLIF(c."tenantPhone", ''), t.phone)            AS "tenantPhone",
              COALESCE(NULLIF(c."tenantEmail", ''), t.email)            AS "tenantEmail",
              c."unitId",
              COALESCE(NULLIF(TRIM(CONCAT_WS(' - ', u."buildingName", u."unitNumber")), ''), '#' || c."unitId"::text) AS "unitName"
         FROM rent_payments rp
         JOIN rental_contracts c ON c.id = rp."contractId"
         LEFT JOIN tenants t ON t.id = c."tenantId" AND t."companyId" = c."companyId"
         LEFT JOIN property_units u ON u.id = c."unitId" AND u."companyId" = c."companyId"
        WHERE c."companyId" = $1 AND rp.status IN ('pending','partial')
          AND rp."dueDate" < CURRENT_DATE`,
      [company.id]
    );
    for (const p of overduePayments) {
      const lateDays = Math.floor((Date.now() - new Date(p.dueDate as string | Date).getTime()) / 86400000);
      let targetStage: string | null = null;
      let targetPhase: number | null = null;
      // Spec ملف 05 §إيجار متأخر السداسي (السطر 59) — السلسلة الكاملة:
      //   يوم 1  → SMS تذكير (phase 0 — شريحة ٣)
      //   يوم 3  → تنبيه داخلي (phase 1)
      //   يوم 5  → غرامة 2% (phase 5 — موضعها الجديد بعد نقلها من يوم 60)
      //   يوم 7  → إشعار رسمي (phase 2)
      //   يوم 14 → زيارة ميدانية (phase 3)
      //   يوم 21 → إنذار رسمي (phase 7 — مرحلة جديدة)
      //   يوم 30 → تصعيد GM + قانوني (phase 4 — تحسين)
      //   يوم 60 → إخلاء (phase 8 — مرحلة جديدة، استبدلت الغرامة هنا)
      //   يوم 90 → إحالة قانونية كقضية (phase 6 — لجوء أخير)
      // كل مرحلة محروسة بـ idempotency على (paymentId, phase) في
      // late_rent_actions. الترتيب else-if يختار أعلى مرحلة منطبقة فقط؛ هذا
      // متعمد: لو وصلتنا دفعة قديمة (مثلاً مُستوردة) متأخرة 90 يومًا، لا
      // نُرسل سلسلة الإشعارات بأثر رجعي بل ننتقل مباشرة لمسار اللجوء الأخير.
      if (lateDays >= 90)      { targetStage = 'legal_transfer';  targetPhase = 6; }
      else if (lateDays >= 60) { targetStage = 'eviction';        targetPhase = 8; }
      else if (lateDays >= 30) { targetStage = 'escalation';      targetPhase = 4; }
      else if (lateDays >= 21) { targetStage = 'formal_notice';   targetPhase = 7; }
      else if (lateDays >= 14) { targetStage = 'field_visit';     targetPhase = 3; }
      else if (lateDays >= 7)  { targetStage = 'notification';    targetPhase = 2; }
      else if (lateDays >= 5)  { targetStage = 'penalty_applied'; targetPhase = 5; }
      else if (lateDays >= 3)  { targetStage = 'alert';           targetPhase = 1; }
      else if (lateDays >= 1)  { targetStage = 'tenant_reminder'; targetPhase = 0; }
      if (!targetStage || targetPhase === null) continue;

      const existing = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM late_rent_actions WHERE "paymentId" = $1 AND phase = $2 LIMIT 1`,
        [p.id, targetPhase]
      );
      if (existing.length > 0) continue;

      // Phase 0 — day-1 tenant-facing reminder. Dispatched BEFORE the
      // existing internal escalation ladder fires anything. Channels are
      // explicitly the tenant-facing set (sms/email/whatsapp) — we do NOT
      // include in_app here because the engine would fan it out to active
      // employees with no assignmentId/targetRole (the lesson Codex flagged
      // on PR #3010). The property manager already sees this via the
      // existing phase-tracking dashboards on late_rent_actions.
      if (targetStage === 'tenant_reminder') {
        const tenantPhone = (p.tenantPhone as string | null) ?? null;
        const tenantEmail = (p.tenantEmail as string | null) ?? null;
        if (!tenantPhone && !tenantEmail) {
          logger.info(`[cronScheduler] rent overdue day-1: tenant has no contact (rent_payment=${p.id}) — skipped`);
        } else {
          const tenantChannels: ("email" | "sms" | "whatsapp")[] = [];
          if (tenantPhone) { tenantChannels.push("sms"); tenantChannels.push("whatsapp"); }
          if (tenantEmail) tenantChannels.push("email");
          try {
            await dispatchNotification({
              companyId: company.id,
              eventCategory: "property.rent.overdue.day1",
              title: "",
              body: "",
              channels: tenantChannels,
              templateKey: "property.rent.overdue.day1",
              templateVars: {
                tenantName: String(p.tenantName ?? "—"),
                unitName: String(p.unitName ?? p.unitId ?? "—"),
                dueDate: String(p.dueDate ?? ""),
                amount: Number(p.amount ?? 0).toFixed(2),
              },
              recipientEmail: tenantEmail ?? undefined,
              recipientPhone: tenantPhone ?? undefined,
              recipientName: (p.tenantName as string | null) ?? undefined,
              refType: "rent_payment",
              refId: Number(p.id),
              priority: "high",
            });
          } catch (e) {
            logger.warn(e, `[cronScheduler] rent overdue day-1 dispatch failed (rent_payment=${p.id})`);
          }
        }
        // Record the action so the next day's cron doesn't re-send.
        await rawExecute(
          `INSERT INTO late_rent_actions ("contractId","paymentId",phase,action,"sentAt",notes)
           VALUES ($1,$2,$3,$4,NOW(),$5)`,
          [p.contractId, p.id, 0, 'تذكير المستأجر', `تذكير سداد يوم ${lateDays}`]
        ).catch((e) => logger.error(e, "[cronScheduler] tenant_reminder late_rent_actions insert failed"));
        continue;
      }

      let actionLabel = targetStage;
      if (targetStage === 'penalty_applied') {
        // يوم 5 — غرامة 2%. لا قيد دفتر جديد: تُضاف على رصيد rent_payments
        // (نفس النمط القائم قبل شريحة ٤، فقط نُقل التاريخ من يوم 60 → يوم 5
        // وفق المواصفة). كتابة سطور journal تتطلب assertion test (دستور §٣
        // قاعدة ٣) — نتركها لمسار محاسبي منفصل حين يقرّر إبراهيم اعتمادها.
        const lateFee = roundTo2(Number(p.amount) * 0.02);
        await rawExecute(`UPDATE rent_payments SET amount = amount + $1, "updatedAt"=NOW() WHERE id = $2`, [lateFee, p.id]);
        const newTotal = roundTo2(Number(p.amount) + lateFee);
        actionLabel = `غرامة تأخير ${lateFee}`;
        penalties++;
        // إشعار المستأجر بالغرامة المضافة — قنوات صريحة، بلا in_app.
        const tenantPhone = (p.tenantPhone as string | null) ?? null;
        const tenantEmail = (p.tenantEmail as string | null) ?? null;
        if (tenantPhone || tenantEmail) {
          const tenantChannels: ("email" | "sms" | "whatsapp")[] = [];
          if (tenantPhone) { tenantChannels.push("sms"); tenantChannels.push("whatsapp"); }
          if (tenantEmail) tenantChannels.push("email");
          try {
            await dispatchNotification({
              companyId: company.id,
              eventCategory: "property.rent.overdue.day5",
              title: "",
              body: "",
              channels: tenantChannels,
              templateKey: "property.rent.overdue.day5",
              templateVars: {
                tenantName: String(p.tenantName ?? "—"),
                unitName: String(p.unitName ?? p.unitId ?? "—"),
                dueDate: String(p.dueDate ?? ""),
                amount: newTotal.toFixed(2),
                lateFee: lateFee.toFixed(2),
              },
              recipientEmail: tenantEmail ?? undefined,
              recipientPhone: tenantPhone ?? undefined,
              recipientName: (p.tenantName as string | null) ?? undefined,
              refType: "rent_payment",
              refId: Number(p.id),
              priority: "high",
            });
          } catch (e) {
            logger.warn(e, `[cronScheduler] rent overdue day-5 dispatch failed (rent_payment=${p.id})`);
          }
        }
      } else if (targetStage === 'field_visit') {
        actionLabel = 'زيارة ميدانية';
        // إشعار المستأجر بقرب الزيارة الميدانية — قنوات صريحة، بلا in_app.
        const tenantPhone = (p.tenantPhone as string | null) ?? null;
        const tenantEmail = (p.tenantEmail as string | null) ?? null;
        if (tenantPhone || tenantEmail) {
          const tenantChannels: ("email" | "sms" | "whatsapp")[] = [];
          if (tenantPhone) tenantChannels.push("sms");
          if (tenantEmail) tenantChannels.push("email");
          try {
            await dispatchNotification({
              companyId: company.id,
              eventCategory: "property.rent.overdue.day14",
              title: "",
              body: "",
              channels: tenantChannels,
              templateKey: "property.rent.overdue.day14",
              templateVars: {
                tenantName: String(p.tenantName ?? "—"),
                unitName: String(p.unitName ?? p.unitId ?? "—"),
                dueDate: String(p.dueDate ?? ""),
                amount: Number(p.amount ?? 0).toFixed(2),
                lateDays: String(lateDays),
              },
              recipientEmail: tenantEmail ?? undefined,
              recipientPhone: tenantPhone ?? undefined,
              recipientName: (p.tenantName as string | null) ?? undefined,
              refType: "rent_payment",
              refId: Number(p.id),
              priority: "high",
            });
          } catch (e) {
            logger.warn(e, `[cronScheduler] rent overdue day-14 dispatch failed (rent_payment=${p.id})`);
          }
        }
      } else if (targetStage === 'formal_notice') {
        actionLabel = 'إنذار رسمي';
        // إشعار المستأجر بالإنذار الرسمي — كل القنوات (SMS+email+WA) لأنها
        // مرحلة قانونية حاسمة قبل تصعيد GM والقانونية.
        const tenantPhone = (p.tenantPhone as string | null) ?? null;
        const tenantEmail = (p.tenantEmail as string | null) ?? null;
        if (tenantPhone || tenantEmail) {
          const tenantChannels: ("email" | "sms" | "whatsapp")[] = [];
          if (tenantPhone) { tenantChannels.push("sms"); tenantChannels.push("whatsapp"); }
          if (tenantEmail) tenantChannels.push("email");
          try {
            await dispatchNotification({
              companyId: company.id,
              eventCategory: "property.rent.overdue.day21",
              title: "",
              body: "",
              channels: tenantChannels,
              templateKey: "property.rent.overdue.day21",
              templateVars: {
                tenantName: String(p.tenantName ?? "—"),
                unitName: String(p.unitName ?? p.unitId ?? "—"),
                dueDate: String(p.dueDate ?? ""),
                amount: Number(p.amount ?? 0).toFixed(2),
                lateDays: String(lateDays),
              },
              recipientEmail: tenantEmail ?? undefined,
              recipientPhone: tenantPhone ?? undefined,
              recipientName: (p.tenantName as string | null) ?? undefined,
              refType: "rent_payment",
              refId: Number(p.id),
              priority: "high",
            });
          } catch (e) {
            logger.warn(e, `[cronScheduler] rent overdue day-21 dispatch failed (rent_payment=${p.id})`);
          }
        }
      } else if (targetStage === 'escalation') {
        actionLabel = 'تصعيد GM + قانوني';
        // يوم 30 — تصعيد داخلي للـ GM والقانونية. قنوات صريحة email فقط
        // (لكل مستلم) لتجنّب in_app fan-out (درس Codex P2 من شريحة ١).
        const branchIdForLookup = Number(p.branchId ?? 0);
        try {
          const gmId = branchIdForLookup ? await getDirectorAssignmentId(company.id, branchIdForLookup) : null;
          const legalResp = await getLegalResponsible(company.id);
          for (const target of [
            { assignmentId: gmId, name: 'المدير العام' },
            { assignmentId: legalResp?.assignmentId ?? null, name: legalResp?.employeeName ?? 'القسم القانوني' },
          ]) {
            if (!target.assignmentId) continue;
            await dispatchNotification({
              companyId: company.id,
              eventCategory: "property.rent.overdue.day30",
              title: "",
              body: "",
              channels: ["email" as const],
              templateKey: "property.rent.overdue.day30",
              templateVars: {
                managerName: target.name,
                tenantName: String(p.tenantName ?? "—"),
                unitName: String(p.unitName ?? p.unitId ?? "—"),
                dueDate: String(p.dueDate ?? ""),
                amount: Number(p.amount ?? 0).toFixed(2),
                lateDays: String(lateDays),
              },
              assignmentId: target.assignmentId,
              refType: "rent_payment",
              refId: Number(p.id),
              priority: "high",
            });
          }
        } catch (e) {
          logger.warn(e, `[cronScheduler] rent overdue day-30 escalation dispatch failed (rent_payment=${p.id})`);
        }
      } else if (targetStage === 'eviction') {
        actionLabel = 'إشعار إخلاء';
        // يوم 60 — إشعار إخلاء للمستأجر + تنبيه GM/قانوني. لا نُنشئ قضية
        // قانونية تلقائيًا (legal_transfer يوم 90 يفعل ذلك): الإخلاء قرار
        // إنساني يبقى للـ GM والقانونية. هنا فقط نُشعر بالنية الموثّقة.
        const tenantPhone = (p.tenantPhone as string | null) ?? null;
        const tenantEmail = (p.tenantEmail as string | null) ?? null;
        if (tenantPhone || tenantEmail) {
          const tenantChannels: ("email" | "sms" | "whatsapp")[] = [];
          if (tenantPhone) { tenantChannels.push("sms"); tenantChannels.push("whatsapp"); }
          if (tenantEmail) tenantChannels.push("email");
          try {
            await dispatchNotification({
              companyId: company.id,
              eventCategory: "property.rent.overdue.day60",
              title: "",
              body: "",
              channels: tenantChannels,
              templateKey: "property.rent.overdue.day60",
              templateVars: {
                tenantName: String(p.tenantName ?? "—"),
                unitName: String(p.unitName ?? p.unitId ?? "—"),
                dueDate: String(p.dueDate ?? ""),
                amount: Number(p.amount ?? 0).toFixed(2),
                lateDays: String(lateDays),
              },
              recipientEmail: tenantEmail ?? undefined,
              recipientPhone: tenantPhone ?? undefined,
              recipientName: (p.tenantName as string | null) ?? undefined,
              refType: "rent_payment",
              refId: Number(p.id),
              priority: "high",
            });
          } catch (e) {
            logger.warn(e, `[cronScheduler] rent overdue day-60 tenant dispatch failed (rent_payment=${p.id})`);
          }
        }
      } else if (targetStage === 'legal_transfer') {
        try {
          const responsible = await getLegalResponsible(company.id);
          const lawyerName = responsible?.employeeName ?? null;

          // G7 fix (#1141 coverage report §3 G7) — auto-generated
          // collection cases now route through the numbering center
          // (scheme `legal.case`) instead of building a Date.now()
          // ref inline. Atomic-tx: issue + INSERT + linkback all
          // rollback together if any step fails.
          const caseId = await withTransaction(async (client) => {
            const issued = await issueNumber({
              companyId: company.id,
              branchId: null,
              moduleKey: "legal",
              entityKey: "case",
              entityTable: "legal_cases",
              actorId: null,
              metadata: { source: "cron.dailyPropertyCheck", rentPaymentId: p.id },
              expectedTiming: "on_draft",
            });
            const ins = await client.query(
              `INSERT INTO legal_cases ("companyId","caseNumber",title,"caseType","opposingParty","lawyerName",status,priority,description)
               VALUES ($1,$2,$3,'property_rent',$4,$5,'open','high',$6) RETURNING id`,
              [
                company.id,
                issued.number,
                `تحصيل إيجار — ${p.tenantName}`,
                p.tenantName,
                lawyerName,
                `إيجار متأخر ${lateDays} يوم — مبلغ ${p.amount} ريال`,
              ]
            );
            const newCaseId = ins.rows[0].id;
            await client.query(
              `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
              [newCaseId, issued.assignmentId]
            );
            return newCaseId;
          });
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
      // field_visit / formal_notice / escalation / eviction labels معالَجة
      // داخل فروعها (مع dispatch المستأجر/الداخلي).

      await rawExecute(
        `INSERT INTO late_rent_actions ("contractId","paymentId",phase,action,"sentAt",notes)
         VALUES ($1,$2,$3,$4,NOW(),$5)`,
        [p.contractId, p.id, targetPhase, actionLabel, `تأخر ${lateDays} يوم — ${actionLabel}`]
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

/**
 * Spec ملف 04 §تنبيهات الأسطول السبعة — تنبيه «استبدال محتمل»:
 * إذا تكررت أعطال مركبة (3 أو أكثر في الشهر التقويمي الحالي) → بريد
 * للمدير العام (أو مدير الفرع) مع سؤال: هل تُستبدل المركبة؟
 *
 * الموجود اليوم في smartAlerts.checkVehicleRepeatedBreakdowns: نافذة
 * 90 يومًا تضع المركبة under_review، broadcast لا أكثر. هذه الدالة
 * تكمل الفجوة: نافذة شهر تقويمي + بريد صريح للمدير + idempotency على
 * (vehicleId, alertMonth).
 *
 * تعمل يوميًا حتى يصل التنبيه يوم وقوع العطل الثالث، لا تنتظر آخر
 * الشهر. عمود alertMonth في fleet_replacement_alerts يحفظ التكرار
 * مرّة واحدة لكل شهر تقويمي حتى لو فُتح/أُغلق العمل اليومي عدّة مرات.
 *
 * channel = email فقط (داخلي للمدير) — بلا in_app fan-out (درس Codex
 * P2 من شريحة ١: in_app بلا assignmentId يتسرّب لكل الموظفين).
 */
async function dailyVehicleReplacementCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let alerted = 0;
  for (const company of companies) {
    const candidates = await rawQuery<Record<string, unknown>>(
      `SELECT fv.id AS "vehicleId",
              fv."branchId",
              fv."plateNumber",
              CONCAT_WS(' ', fv.make, fv.model) AS "vehicleName",
              COUNT(b.id) AS "breakdownCount",
              array_agg(DISTINCT b.category) FILTER (WHERE b.category IS NOT NULL) AS categories,
              date_trunc('month', CURRENT_DATE)::date AS "alertMonth"
         FROM fleet_vehicles fv
         JOIN fleet_breakdowns b
           ON b."vehicleId" = fv.id
          AND b."companyId" = fv."companyId"
          AND b."deletedAt" IS NULL
          AND b.status <> 'cancelled'
          AND b."reportedAt" >= date_trunc('month', CURRENT_DATE)
          AND b."reportedAt" <  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
        WHERE fv."companyId" = $1
          AND fv."deletedAt" IS NULL
        GROUP BY fv.id, fv."branchId", fv."plateNumber", fv.make, fv.model
        HAVING COUNT(b.id) >= 3`,
      [company.id]
    );
    for (const c of candidates) {
      const vehicleId = Number(c.vehicleId);
      const alertMonth = String(c.alertMonth).slice(0, 10);
      const branchId = c.branchId != null ? Number(c.branchId) : null;

      const existing = await rawQuery<Record<string, unknown>>(
        `SELECT 1 FROM fleet_replacement_alerts
          WHERE "vehicleId" = $1 AND "alertMonth" = $2::date LIMIT 1`,
        [vehicleId, alertMonth]
      );
      if (existing.length > 0) continue;

      // وجِّه للمدير العام (أو owner) عند branch محدد؛ ولو ما فيش branch،
      // ابحث على مستوى الشركة (branchId = 0 ⇒ مالك الشركة).
      let managerAssignment: number | null = null;
      let managerName = 'المدير العام';
      try {
        if (branchId) {
          managerAssignment = await getDirectorAssignmentId(company.id, branchId);
        }
        if (!managerAssignment) {
          const [fallback] = await rawQuery<{ id: number; name: string }>(
            `SELECT ea.id, e.name
               FROM employee_assignments ea
               LEFT JOIN employees e ON e.id = ea."employeeId"
              WHERE ea."companyId" = $1 AND ea.status = 'active'
                AND ea.role IN ('general_manager','owner')
              ORDER BY CASE ea.role WHEN 'general_manager' THEN 1 ELSE 2 END
              LIMIT 1`,
            [company.id]
          );
          if (fallback) { managerAssignment = fallback.id; managerName = fallback.name || managerName; }
        }
      } catch (e) {
        logger.warn(e, `[cronScheduler] vehicle_replacement: manager lookup failed (vehicleId=${vehicleId})`);
      }

      if (!managerAssignment) {
        logger.info(`[cronScheduler] vehicle_replacement: no manager found (company=${company.id}, vehicleId=${vehicleId}) — skipped`);
        continue;
      }

      // Codex P1 (شريحة 7 PR): dispatchNotification يُرسل البريد فقط حين
      // يُمرَّر recipientEmail (assignmentId يُستعمل للتفضيلات/in-app
      // routing لا لاستنباط البريد). نستخرج اسم + بريد المدير من
      // employees قبل dispatch.
      let managerEmail: string | null = null;
      try {
        const [mgrInfo] = await rawQuery<{ name: string; email: string | null }>(
          `SELECT e.name, e.email FROM employee_assignments ea
             JOIN employees e ON e.id = ea."employeeId"
            WHERE ea.id = $1`,
          [managerAssignment]
        );
        if (mgrInfo) {
          if (mgrInfo.name) managerName = mgrInfo.name;
          managerEmail = mgrInfo.email ?? null;
        }
      } catch (e) {
        logger.warn(e, `[cronScheduler] vehicle_replacement: manager email lookup failed (vehicleId=${vehicleId})`);
      }

      const categoriesArr = Array.isArray(c.categories)
        ? (c.categories as Array<string | null>).filter((x): x is string => typeof x === 'string')
        : [];
      const categoriesText = categoriesArr.length > 0 ? categoriesArr.join(', ') : 'غير محدد';
      const monthLabel = alertMonth.slice(0, 7); // YYYY-MM

      try {
        await dispatchNotification({
          companyId: company.id,
          eventCategory: "fleet.breakdown.replacement_candidate",
          title: "",
          body: "",
          channels: ["email" as const],
          templateKey: "fleet.breakdown.replacement_candidate",
          templateVars: {
            managerName: managerName,
            plateNumber: String(c.plateNumber ?? '—'),
            vehicleName: String(c.vehicleName ?? '—'),
            breakdownCount: String(c.breakdownCount ?? 0),
            month: monthLabel,
            categories: categoriesText,
          },
          assignmentId: managerAssignment,
          recipientEmail: managerEmail ?? undefined,
          recipientName: managerName,
          refType: "fleet_vehicle",
          refId: vehicleId,
          priority: "high",
        });
      } catch (e) {
        logger.warn(e, `[cronScheduler] vehicle_replacement dispatch failed (vehicleId=${vehicleId})`);
        continue;
      }

      // سجّل التنبيه قبل الانتقال — يضمن عدم إعادة الإرسال نفس الشهر.
      await rawExecute(
        `INSERT INTO fleet_replacement_alerts
           ("vehicleId","alertMonth","companyId","branchId","breakdownCount","alertedAssignmentId")
         VALUES ($1,$2::date,$3,$4,$5,$6)
         ON CONFLICT ("vehicleId","alertMonth") DO NOTHING`,
        [vehicleId, alertMonth, company.id, branchId, Number(c.breakdownCount), managerAssignment]
      ).catch((e) => logger.error(e, "[cronScheduler] fleet_replacement_alerts insert failed"));

      alerted++;
    }
  }
  return `Vehicle replacement alerts: ${alerted}`;
}

/**
 * Spec ملف 04 §تنبيهات الأسطول السبعة — تنبيه تقييم سائق:
 *   «تقييم سائق أقل من 3 = اجتماع تقييم أداء»
 *
 * المواصفة على مقياس 1-5، بينما fleet_drivers.reputationScore على 0-100
 * (محسوب 90 يومًا في driverReputation.ts). القرار الموثَّق: <3 من 5 =
 * <60 من 100 (نفس النسبة المئوية).
 *
 * يعمل يوميًا (06:45، بعد dailyVehicleReplacementCheck بـ 15 دقيقة)
 * ليصل التنبيه في اليوم نفسه الذي تنخفض فيه السمعة دون العتبة.
 * idempotency عبر fleet_driver_evaluation_alerts (driverId, alertMonth):
 * مرّة واحدة لكل سائق لكل شهر تقويمي حتى لا يتكرّر التنبيه يوميًا
 * طوال الشهر إذا لم ترتفع السمعة.
 *
 * channel = email فقط (داخلي للمدير) — بلا in_app fan-out (درس Codex P2
 * من شريحة ١).
 */
async function dailyDriverEvaluationCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let alerted = 0;
  for (const company of companies) {
    const candidates = await rawQuery<Record<string, unknown>>(
      `SELECT fd.id AS "driverId",
              fd."branchId",
              fd.name AS "driverName",
              fd."reputationScore",
              fd."reputationOnTimeRate",
              fd."reputationCompletionRate",
              fd."reputationTripsConsidered",
              date_trunc('month', CURRENT_DATE)::date AS "alertMonth"
         FROM fleet_drivers fd
        WHERE fd."companyId" = $1
          AND fd."deletedAt" IS NULL
          AND fd."reputationScore" IS NOT NULL
          AND fd."reputationScore" < 60
          AND fd."reputationComputedAt" IS NOT NULL`,
      [company.id]
    );
    for (const c of candidates) {
      const driverId = Number(c.driverId);
      const alertMonth = String(c.alertMonth).slice(0, 10);
      const branchId = c.branchId != null ? Number(c.branchId) : null;

      const existing = await rawQuery<Record<string, unknown>>(
        `SELECT 1 FROM fleet_driver_evaluation_alerts
          WHERE "driverId" = $1 AND "alertMonth" = $2::date LIMIT 1`,
        [driverId, alertMonth]
      );
      if (existing.length > 0) continue;

      // وجِّه عبر getManagerAssignmentId (branch_manager → hr_manager →
      // general_manager → owner). fallback لمستوى الشركة لو الفرع بلا
      // مدير. اجتماع التقييم يحتاج HR/مدير الفرع — لذلك ليس قانوني
      // ولا CFO.
      let managerAssignment: number | null = null;
      let managerName = 'المدير';
      try {
        if (branchId) {
          managerAssignment = await getManagerAssignmentId(company.id, branchId);
        }
        if (!managerAssignment) {
          const [fallback] = await rawQuery<{ id: number; name: string }>(
            `SELECT ea.id, e.name
               FROM employee_assignments ea
               LEFT JOIN employees e ON e.id = ea."employeeId"
              WHERE ea."companyId" = $1 AND ea.status = 'active'
                AND ea.role IN ('hr_manager','general_manager','owner')
              ORDER BY CASE ea.role
                         WHEN 'hr_manager' THEN 1
                         WHEN 'general_manager' THEN 2
                         ELSE 3
                       END
              LIMIT 1`,
            [company.id]
          );
          if (fallback) { managerAssignment = fallback.id; managerName = fallback.name || managerName; }
        }
      } catch (e) {
        logger.warn(e, `[cronScheduler] driver_evaluation: manager lookup failed (driverId=${driverId})`);
      }

      if (!managerAssignment) {
        logger.info(`[cronScheduler] driver_evaluation: no manager found (company=${company.id}, driverId=${driverId}) — skipped`);
        continue;
      }

      // Codex P1 (شريحة 7 PR): dispatchNotification يحتاج recipientEmail
      // ليُرسل البريد فعلًا. استخرج اسم + بريد المدير من employees بعد
      // حلّ assignmentId.
      let managerEmail: string | null = null;
      try {
        const [mgrInfo] = await rawQuery<{ name: string; email: string | null }>(
          `SELECT e.name, e.email FROM employee_assignments ea
             JOIN employees e ON e.id = ea."employeeId"
            WHERE ea.id = $1`,
          [managerAssignment]
        );
        if (mgrInfo) {
          if (mgrInfo.name) managerName = mgrInfo.name;
          managerEmail = mgrInfo.email ?? null;
        }
      } catch (e) {
        logger.warn(e, `[cronScheduler] driver_evaluation: manager email lookup failed (driverId=${driverId})`);
      }

      const score = Number(c.reputationScore);
      const onTime = c.reputationOnTimeRate != null ? Number(c.reputationOnTimeRate) : null;
      const completion = c.reputationCompletionRate != null ? Number(c.reputationCompletionRate) : null;
      const trips = c.reputationTripsConsidered != null ? Number(c.reputationTripsConsidered) : 0;
      // النافذة الحالية لحساب السمعة في driverReputation.ts = 90 يومًا.
      // نعرضها كنص في الإشعار لتوضيح أن «<60» مبنية على آخر 90 يومًا
      // لا على عمر السائق كله.
      const periodLabel = 'آخر 90 يومًا';

      try {
        await dispatchNotification({
          companyId: company.id,
          eventCategory: "fleet.driver.evaluation_meeting",
          title: "",
          body: "",
          channels: ["email" as const],
          templateKey: "fleet.driver.evaluation_meeting",
          templateVars: {
            managerName: managerName,
            driverName: String(c.driverName ?? '—'),
            reputationScore: score.toFixed(2),
            tripsConsidered: String(trips),
            onTimeRate: onTime != null ? onTime.toFixed(1) : '—',
            completionRate: completion != null ? completion.toFixed(1) : '—',
            period: periodLabel,
          },
          assignmentId: managerAssignment,
          recipientEmail: managerEmail ?? undefined,
          recipientName: managerName,
          refType: "fleet_driver",
          refId: driverId,
          priority: "high",
        });
      } catch (e) {
        logger.warn(e, `[cronScheduler] driver_evaluation dispatch failed (driverId=${driverId})`);
        continue;
      }

      // سجّل التنبيه بعد dispatch ناجح حتى يسمح فشل الإرسال بإعادة
      // المحاولة غدًا (idempotency على مستوى الشهر لا اليوم).
      await rawExecute(
        `INSERT INTO fleet_driver_evaluation_alerts
           ("driverId","alertMonth","companyId","branchId","reputationScoreAtAlert","alertedAssignmentId")
         VALUES ($1,$2::date,$3,$4,$5,$6)
         ON CONFLICT ("driverId","alertMonth") DO NOTHING`,
        [driverId, alertMonth, company.id, branchId, score, managerAssignment]
      ).catch((e) => logger.error(e, "[cronScheduler] fleet_driver_evaluation_alerts insert failed"));

      alerted++;
    }
  }
  return `Driver evaluation alerts: ${alerted}`;
}

/**
 * Spec ملف 04 §تنبيهات الأسطول السبعة — تنبيه تجاوز السرعة:
 *   «تجاوز السرعة → تنبيه»
 *
 * يفحص cron يوميًا (07:00) قراءات اليوم السابق في fleet_device_positions
 * مقارنةً بـ vehicle_speed_limits (شريحة ٧، migration 433):
 *   - effective limit = COALESCE(per-vehicle override, per-company default, 120 km/h)
 *   - violation = position.speed > effective_limit + tolerance
 *
 * التجميع يومي: مرّة تنبيه واحدة لكل مركبة لكل يوم تقويمي (idempotent عبر
 * fleet_speed_violation_alerts على (vehicleId, violationDate)).
 *
 * channel = email فقط (داخلي للمدير) — بلا in_app fan-out (درس Codex P2
 * من شريحة ١). توجيه: getManagerAssignmentId (السرعة سلوك سائق يومي،
 * يخصّ branch_manager/HR لا GM/legal).
 *
 * استبدل دالة smartAlerts.checkSpeedViolation المعطّلة (التي كانت تبحث
 * في currentSpeed غير الموجود على fleet_trips).
 */
async function dailySpeedViolationCheck(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  // Codex P2 (شريحة 7 PR): cron يُجدول في منطقة getSystemTimezone (افتراضي
  // Asia/Riyadh)؛ لو DB على UTC و schedule 07:00 Riyadh، فإن CURRENT_DATE
  // في الاستعلام تشير لـ 03:00→03:00 Riyadh وليس 00:00→00:00 المرتقب.
  // نمرّر المنطقة الزمنية كمعامل ونحوّل occurredAt إليها قبل المقارنة.
  const tz = await getSystemTimezone();
  let alerted = 0;
  for (const company of companies) {
    const candidates = await rawQuery<Record<string, unknown>>(
      `WITH effective_limits AS (
         SELECT fv.id AS "vehicleId",
                COALESCE(vsl_v."speedLimitKph", vsl_d."speedLimitKph", 120) AS "limitKph",
                COALESCE(vsl_v."toleranceKph", vsl_d."toleranceKph", 10)    AS "toleranceKph"
           FROM fleet_vehicles fv
           LEFT JOIN vehicle_speed_limits vsl_v
             ON vsl_v."companyId" = fv."companyId"
            AND vsl_v."vehicleId" = fv.id
           LEFT JOIN vehicle_speed_limits vsl_d
             ON vsl_d."companyId" = fv."companyId"
            AND vsl_d."vehicleId" IS NULL
          WHERE fv."companyId" = $1
            AND fv."deletedAt" IS NULL
       ),
       day_bounds AS (
         SELECT
           ((NOW() AT TIME ZONE $2)::date - INTERVAL '1 day')::date AS "violationDate",
           ((((NOW() AT TIME ZONE $2)::date - INTERVAL '1 day')::date)::timestamp AT TIME ZONE $2) AS "startTs",
           ((((NOW() AT TIME ZONE $2)::date)::timestamp                            AT TIME ZONE $2) ) AS "endTs"
       )
       SELECT fdp."vehicleId",
              el."limitKph",
              el."toleranceKph",
              fv."plateNumber",
              CONCAT_WS(' ', fv.make, fv.model) AS "vehicleName",
              fv."branchId",
              MAX(fdp.speed) AS "maxSpeedKph",
              COUNT(*)::int AS "violationCount",
              db."violationDate"
         FROM fleet_device_positions fdp
         JOIN effective_limits el ON el."vehicleId" = fdp."vehicleId"
         JOIN fleet_vehicles fv ON fv.id = fdp."vehicleId"
         CROSS JOIN day_bounds db
        WHERE fdp."companyId" = $1
          AND fdp."occurredAt" >= db."startTs"
          AND fdp."occurredAt" <  db."endTs"
          AND fdp.speed > (el."limitKph" + el."toleranceKph")
          AND fv."deletedAt" IS NULL
        GROUP BY fdp."vehicleId", el."limitKph", el."toleranceKph",
                 fv."plateNumber", fv.make, fv.model, fv."branchId", db."violationDate"`,
      [company.id, tz]
    );
    for (const c of candidates) {
      const vehicleId = Number(c.vehicleId);
      const violationDate = String(c.violationDate).slice(0, 10);
      const branchId = c.branchId != null ? Number(c.branchId) : null;
      const limitKph = Number(c.limitKph);
      const toleranceKph = Number(c.toleranceKph);
      const maxSpeedKph = Number(c.maxSpeedKph);
      const violationCount = Number(c.violationCount);

      const existing = await rawQuery<Record<string, unknown>>(
        `SELECT 1 FROM fleet_speed_violation_alerts
          WHERE "vehicleId" = $1 AND "violationDate" = $2::date LIMIT 1`,
        [vehicleId, violationDate]
      );
      if (existing.length > 0) continue;

      // Codex P2 (شريحة 7 PR): اختر السائق من رحلة فعّالة خلال يوم
      // التجاوز نفسه — لا «آخر رحلة مطلقًا» (التي قد تكون رحلة لاحقة
      // مُنشأة قبل تشغيل cron الصباحي). نُطابق ضمن نافذة يوم التجاوز
      // في المنطقة الزمنية المضبوطة.
      let driverName = '—';
      try {
        const [trip] = await rawQuery<{ name: string | null }>(
          `SELECT fd.name FROM fleet_trips ft
             LEFT JOIN fleet_drivers fd ON fd.id = ft."driverId"
            WHERE ft."companyId" = $1 AND ft."vehicleId" = $2
              AND ft."deletedAt" IS NULL
              AND ft."startTime" >= ($3::date)::timestamp AT TIME ZONE $4
              AND ft."startTime" <  ($3::date + 1)::timestamp AT TIME ZONE $4
            ORDER BY ft."startTime" DESC
            LIMIT 1`,
          [company.id, vehicleId, violationDate, tz]
        );
        if (trip?.name) driverName = trip.name;
      } catch (e) {
        logger.warn(e, `[cronScheduler] speed_violation: driver lookup failed (vehicleId=${vehicleId})`);
      }

      // المدير: branch_manager للسرعة (سلوك يومي تشغيلي).
      let managerAssignment: number | null = null;
      let managerName = 'المدير';
      try {
        if (branchId) {
          managerAssignment = await getManagerAssignmentId(company.id, branchId);
        }
        if (!managerAssignment) {
          const [fallback] = await rawQuery<{ id: number; name: string }>(
            `SELECT ea.id, e.name
               FROM employee_assignments ea
               LEFT JOIN employees e ON e.id = ea."employeeId"
              WHERE ea."companyId" = $1 AND ea.status = 'active'
                AND ea.role IN ('branch_manager','hr_manager','general_manager','owner')
              ORDER BY CASE ea.role
                         WHEN 'branch_manager' THEN 1
                         WHEN 'hr_manager' THEN 2
                         WHEN 'general_manager' THEN 3
                         ELSE 4
                       END
              LIMIT 1`,
            [company.id]
          );
          if (fallback) { managerAssignment = fallback.id; managerName = fallback.name || managerName; }
        }
      } catch (e) {
        logger.warn(e, `[cronScheduler] speed_violation: manager lookup failed (vehicleId=${vehicleId})`);
      }

      if (!managerAssignment) {
        logger.info(`[cronScheduler] speed_violation: no manager (company=${company.id}, vehicleId=${vehicleId}) — skipped`);
        continue;
      }

      // Codex P1 (شريحة 7 PR): dispatchNotification يحتاج recipientEmail
      // ليُرسل البريد فعلًا (assignmentId يُستعمل للتفضيلات وin-app
      // routing لا لاستنباط البريد). نستخرج اسم + بريد المدير بعد حلّ
      // assignmentId ونمرّرهما كي لا يُسقَط البريد بصمت.
      let managerEmail: string | null = null;
      try {
        const [mgrInfo] = await rawQuery<{ name: string; email: string | null }>(
          `SELECT e.name, e.email FROM employee_assignments ea
             JOIN employees e ON e.id = ea."employeeId"
            WHERE ea.id = $1`,
          [managerAssignment]
        );
        if (mgrInfo) {
          if (mgrInfo.name) managerName = mgrInfo.name;
          managerEmail = mgrInfo.email ?? null;
        }
      } catch (e) {
        logger.warn(e, `[cronScheduler] speed_violation: manager email lookup failed (vehicleId=${vehicleId})`);
      }

      try {
        await dispatchNotification({
          companyId: company.id,
          eventCategory: "fleet.speed.violation",
          title: "",
          body: "",
          channels: ["email" as const],
          templateKey: "fleet.speed.violation",
          templateVars: {
            managerName: managerName,
            driverName: driverName,
            plateNumber: String(c.plateNumber ?? '—'),
            vehicleName: String(c.vehicleName ?? '—'),
            maxSpeedKph: maxSpeedKph.toFixed(1),
            limitKph: String(limitKph),
            toleranceKph: String(toleranceKph),
            violationCount: String(violationCount),
            violationDate: violationDate,
          },
          assignmentId: managerAssignment,
          recipientEmail: managerEmail ?? undefined,
          recipientName: managerName,
          refType: "fleet_vehicle",
          refId: vehicleId,
          priority: "high",
        });
      } catch (e) {
        logger.warn(e, `[cronScheduler] speed_violation dispatch failed (vehicleId=${vehicleId})`);
        continue;
      }

      await rawExecute(
        `INSERT INTO fleet_speed_violation_alerts
           ("vehicleId","violationDate","companyId","branchId",
            "maxSpeedKphAtAlert","limitKphAtAlert","violationCount","alertedAssignmentId")
         VALUES ($1,$2::date,$3,$4,$5,$6,$7,$8)
         ON CONFLICT ("vehicleId","violationDate") DO NOTHING`,
        [vehicleId, violationDate, company.id, branchId, maxSpeedKph, limitKph, violationCount, managerAssignment]
      ).catch((e) => logger.error(e, "[cronScheduler] fleet_speed_violation_alerts insert failed"));

      alerted++;
    }
  }
  return `Speed violation alerts: ${alerted}`;
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
    // Was N+1: correlated MAX("createdAt") per client over invoices.
    // For 500 clients per company that's 500 lookups against invoices
    // — per company, per weekly run. Single GROUP BY CTE collapses to
    // one scan per company.
    const clients = await rawQuery<Record<string, unknown>>(
      `WITH last_invoice_per_client AS (
         SELECT "clientId", MAX("createdAt") AS "lastInvoice"
           FROM invoices
          WHERE "companyId" = $1
          GROUP BY "clientId"
       )
       SELECT c.id, c.name, c.classification,
              COALESCE(c."totalRevenue", 0) AS revenue,
              li."lastInvoice"
         FROM clients c
         LEFT JOIN last_invoice_per_client li ON li."clientId" = c.id
        WHERE c."companyId" = $1`,
      [company.id]
    );
    for (const client of clients) {
      const rev = Number(client.revenue);
      const lastInvoice = client.lastInvoice ? new Date(client.lastInvoice as string | Date) : null;
      const monthsSinceLastInvoice = lastInvoice
        ? (Date.now() - lastInvoice.getTime()) / (30 * 86400000)
        : 999;

      // PRESERVE LIFECYCLE CHURN — Codex review on PR #3012.
      // The daily invoice-overdue cron flips classification to 'churned'
      // on day 60 as a legal-handover lifecycle state. This weekly
      // recompute is purely revenue-based (last invoice age + total
      // revenue). If we let it run for a churned client whose last
      // invoice is recent (60 days ago, not 12 months), it would flip
      // them back to 'regular'/'prospect'/'vip' and undo the legal
      // handover. We never demote out of 'churned' from this cron —
      // exit from churn is an explicit ops decision (admin PATCH).
      if (client.classification === "churned") {
        continue;
      }

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

/**
 * HR-009 / #1799 priority #10 — weekly + monthly score computation.
 *
 * Iterates every active assignment in every company, computes the
 * 6-dimension composite score via `scoreEmployee`, then runs the
 * signals engines (Risk/Promotion/Burnout) and persists them.
 *
 * Backed by:
 *   - employee_scores (migration 272)        — the score itself
 *   - employee_signals (migration 273)       — the manager-actionable
 *                                              flags computed from
 *                                              that score
 *
 * Idempotent on re-run: both write paths UPSERT on their unique key
 * (assignment × scope × periodKey [× signalType for signals]).
 *
 * scope is passed in so a single handler can serve weekly + monthly +
 * quarterly cron entries below.
 */
async function runEmployeeScoringPeriod(scope: "weekly" | "monthly" | "quarterly"): Promise<string> {
  const periodKey = currentPeriodKey(scope);
  let scored = 0;
  let withSignals = 0;
  // Pull every active assignment in every company. This is the same
  // shape used by other HR cron handlers — single query, then per-row
  // loop with try/catch so one failure doesn't abort the whole run.
  const assignments = await rawQuery<{
    id: number; employeeId: number; companyId: number; branchId: number | null;
  }>(
    `SELECT id, "employeeId", "companyId", "branchId"
       FROM employee_assignments
      WHERE status = 'active'
        -- PR-8a (#2077): one person = one score. Access-grant rows
        -- (the admin's per-branch entries) were producing 8 composite
        -- scores for one human.
        AND "isAccessGrant" = FALSE`,
  );
  for (const a of assignments) {
    try {
      const result = await scoreEmployee({
        companyId: a.companyId,
        assignmentId: a.id,
        employeeId: a.employeeId,
        branchId: a.branchId,
        scope,
        periodKey,
      });
      scored++;
      const signals = await detectSignals({
        assignmentId: a.id,
        scope,
        periodKey,
      });
      if (signals.length > 0) {
        await persistSignals({
          companyId: a.companyId,
          branchId: a.branchId,
          assignmentId: a.id,
          employeeId: a.employeeId,
          scope,
          periodKey,
          compositeScore: result.composite,
          signals,
        });
        withSignals++;
      }
    } catch (e) {
      logger.error(e, `[cron] employee scoring failed for assignment ${a.id}`);
    }
  }
  return `Employee scoring (${scope} ${periodKey}): ${scored} scored, ${withSignals} flagged`;
}

async function weeklyEmployeeScoring(): Promise<string> {
  return runEmployeeScoringPeriod("weekly");
}

async function monthlyEmployeeScoring(): Promise<string> {
  return runEmployeeScoringPeriod("monthly");
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
      `SELECT DISTINCT lb."employeeId", lb."assignmentId", lb."leaveTypeId", lt.annual
       FROM hr_leave_balances lb
       JOIN hr_leave_types lt ON lt.id = lb."leaveTypeId"
       WHERE lb."companyId" = $1 AND lb.year = $2 - 1`,
      [company.id, year]
    );
    for (const b of balances) {
      await rawExecute(
        `INSERT INTO hr_leave_balances ("companyId", "employeeId", "assignmentId", "leaveTypeId", year, entitled, used, reserved)
         VALUES ($1, $2, $3, $4, $5, $6, 0, 0)
         ON CONFLICT DO NOTHING`,
        [company.id, b.employeeId, b.assignmentId, b.leaveTypeId, year, b.annual || 21]
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

// Phase 4 contract slice 6: the standalone mirror helper from slice 4
// (#1293) is now obsolete — each worker has its own `updateBothXxx`
// closure that does outbound_queue first + legacy mirror after, using
// the (legacyId, legacySource) carried on the row it selected. Removed.



// Exported (like the other workers above) so the #2137 integration
// suite can drive a real queue → SMTP lifecycle without the cron loop.
export async function processEmailQueue(): Promise<string> {
  // Phase 4 contract slice 6: read directly from outbound_queue
  // (channel='email').
  //
  // #2137 slice 1: SMTP config no longer comes from a per-row LATERAL
  // join on integrations.config (which the UI never wrote, and whose
  // password was read still-encrypted). Every send resolves through
  // resolveSystemSmtpConfig(companyId) — the SAME single source the
  // /admin/vendor-settings UI saves to and its test endpoints read.
  const pending = await rawQuery<Record<string, unknown>>(
    `SELECT oq.id, oq."companyId", oq.recipient AS "toEmail",
            oq."recipientName", oq.subject, oq.body, oq."isHtml", oq.metadata
     FROM outbound_queue oq
     WHERE oq.status = 'pending' AND oq.channel = 'email'
       AND (oq."scheduledAt" IS NULL OR oq."scheduledAt" <= NOW())
     ORDER BY oq."createdAt" ASC
     LIMIT 50`
  );

  if (pending.length === 0) return "No pending emails";

  let sent = 0, failed = 0;

  const updateBothEmail = async (
    row: Record<string, unknown>,
    status: "sent" | "failed",
    errorMessage: string | null,
  ) => {
    const id = row.id as number;
    const sentAtClause = status === "sent" ? `, "sentAt" = NOW()` : "";
    await rawExecute(
      `UPDATE outbound_queue
         SET status = $1, "errorMessage" = $2,
             attempts = COALESCE(attempts, 0) + 1,
             "updatedAt" = NOW()${sentAtClause}
       WHERE id = $3`,
      [status, errorMessage, id],
    );
  };

  // One resolver call per company per run — not per row.
  const smtpByCompany = new Map<number, SystemSmtpConfig | null>();
  const resolveFor = async (companyId: number): Promise<SystemSmtpConfig | null> => {
    if (!smtpByCompany.has(companyId)) {
      smtpByCompany.set(companyId, await resolveSystemSmtpConfig(companyId));
    }
    return smtpByCompany.get(companyId) ?? null;
  };

  for (const email of pending) {
    const smtp = await resolveFor(Number(email.companyId));
    try {
      if (!smtp) {
        await updateBothEmail(
          email,
          "failed",
          "لا يوجد إعداد SMTP صالح — اضبط بريد النظام من /admin/vendor-settings (أو متغيّرات البيئة)",
        );
        failed++;
        continue;
      }

      // Visible lifecycle: pending → sending → sent/failed. A crash
      // mid-send leaves the row in 'sending' for the operator to spot
      // instead of silently re-pending forever.
      await rawExecute(
        `UPDATE outbound_queue SET status = 'sending', "updatedAt" = NOW() WHERE id = $1`,
        [email.id],
      );

      const { createTransport } = await import("nodemailer");
      const { wrapBrandedEmail } = await import("./emailLayout.js");
      const rawBody = String(email.body ?? email.text ?? "");
      const mailOptions: Record<string, unknown> = {
        from: formatFromHeader(smtp),
        to: email.toEmail,
        subject: email.subject,
        html: wrapBrandedEmail(rawBody, {
          subject: email.subject != null ? String(email.subject) : null,
          recipientName: email.recipientName != null ? String(email.recipientName) : null,
          isHtml: email.isHtml !== false,
        }),
      };
      if (smtp.replyTo) mailOptions.replyTo = smtp.replyTo;
      const meta = (email.metadata as { attachments?: Array<{ filename: string; content: string; contentType: string; encoding?: string }> } | null) ?? null;
      if (meta?.attachments && Array.isArray(meta.attachments) && meta.attachments.length > 0) {
        mailOptions.attachments = meta.attachments.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content, (a.encoding as BufferEncoding | undefined) ?? "base64"),
          contentType: a.contentType,
        }));
      }

      try {
        await createTransport(smtpTransportOptions(smtp)).sendMail(mailOptions);
      } catch (primaryErr) {
        // Hostinger-style fallback: 465 SSL refused → one retry on the
        // configured fallback port (587 STARTTLS). Only when configured.
        if (smtp.fallbackPort && smtp.fallbackPort !== smtp.port) {
          await createTransport(smtpTransportOptions(smtp, smtp.fallbackPort)).sendMail(mailOptions);
        } else {
          throw primaryErr;
        }
      }

      await updateBothEmail(email, "sent", null);
      sent++;
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      const errMsg = scrubSmtpSecrets(raw, smtp);
      await updateBothEmail(email, "failed", errMsg).catch((e) =>
        logger.error(e, "[cronScheduler] background task failed"),
      );
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
  // Platform-wide SMS credentials from the vendor_secrets hub
  // (/admin/vendor-settings → SMS card). Resolved ONCE per run and used
  // only as a FALLBACK: a company's own system_settings SMS keys (read in
  // the query below) always take precedence, so existing per-company
  // configs are unaffected. This is what lets SMS be configured from the
  // same UI as Email + WhatsApp instead of the UI-less system_settings.
  const vendorSms = await getVendorConfig("sms").catch(() => null);
  const vc = vendorSms?.active ? vendorSms.config : {};
  const vendorSid = typeof vc.accountSid === "string" ? vc.accountSid : "";
  const vendorToken = typeof vc.authToken === "string" ? vc.authToken : "";
  const vendorFrom = typeof vc.fromNumber === "string" ? vc.fromNumber : "";

  // Phase 4 contract slice 6: read from outbound_queue. See
  // processEmailQueue for the rationale.
  const pending = await rawQuery<Record<string, unknown>>(
    `SELECT oq.id, oq."companyId", oq.recipient AS "recipientPhone",
            oq.body AS message, oq.attempts AS "attemptCount",
            oq."legacyId", oq."legacySource",
            ss_sid.value AS "accountSid", ss_token.value AS "authToken",
            ss_from.value AS "fromNumber",
            COALESCE(ss_enabled.value, 'true') AS "channelEnabled"
     FROM outbound_queue oq
     LEFT JOIN system_settings ss_sid ON ss_sid.key='sms_account_sid' AND ss_sid."companyId"=oq."companyId"
     LEFT JOIN system_settings ss_token ON ss_token.key='sms_auth_token' AND ss_token."companyId"=oq."companyId"
     LEFT JOIN system_settings ss_from ON ss_from.key='sms_from_number' AND ss_from."companyId"=oq."companyId"
     LEFT JOIN system_settings ss_enabled ON ss_enabled.key='sms_enabled' AND ss_enabled."companyId"=oq."companyId"
     WHERE oq.status='pending' AND oq.channel='sms'
       AND COALESCE(oq.attempts,0) < 3
       AND (oq."scheduledAt" IS NULL OR oq."scheduledAt" <= NOW())
     ORDER BY oq."createdAt" ASC LIMIT 50`
  );

  let sent = 0, failed = 0, skipped = 0;

  const updateBothSms = async (
    row: Record<string, unknown>,
    fields: { status?: string; errorMessage?: string | null; externalId?: string | null; sentAt?: boolean },
    bumpAttempts: boolean = true,
  ) => {
    const id = row.id as number;
    const setClauses: string[] = [];
    const params: unknown[] = [];
    if (fields.status !== undefined) {
      params.push(fields.status); setClauses.push(`status = $${params.length}`);
    }
    if (fields.errorMessage !== undefined) {
      params.push(fields.errorMessage); setClauses.push(`"errorMessage" = $${params.length}`);
    }
    if (fields.externalId !== undefined) {
      params.push(fields.externalId); setClauses.push(`"externalId" = $${params.length}`);
    }
    if (fields.sentAt) setClauses.push(`"sentAt" = NOW()`);
    if (bumpAttempts) setClauses.push(`attempts = COALESCE(attempts, 0) + 1`);
    setClauses.push(`"updatedAt" = NOW()`);
    params.push(id);
    await rawExecute(
      `UPDATE outbound_queue SET ${setClauses.join(", ")} WHERE id = $${params.length}`,
      params,
    );
  };

  for (const sms of pending) {
    // Per-company system_settings creds win; fall back to the platform-wide
    // vendor_secrets 'sms' card when a company has none of its own.
    const accountSid = (typeof sms.accountSid === "string" && sms.accountSid) ? sms.accountSid : vendorSid;
    const authToken = (typeof sms.authToken === "string" && sms.authToken) ? sms.authToken : vendorToken;
    const fromNumber = (typeof sms.fromNumber === "string" && sms.fromNumber) ? sms.fromNumber : vendorFrom;

    if (sms.channelEnabled === "false") {
      await updateBothSms(sms, { errorMessage: "قناة SMS معطلة — سيتم الإرسال عند التفعيل" }, false);
      skipped++;
      continue;
    }
    if (!accountSid || !authToken || !fromNumber) {
      await updateBothSms(sms, { errorMessage: "بيانات Twilio غير مضبوطة — يرجى إعداد المفاتيح في الإعدادات" }, false);
      skipped++;
      continue;
    }

    try {
      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
      const resp = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${credentials}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            To: sms.recipientPhone as string,
            From: fromNumber as string,
            Body: sms.message as string,
          }).toString(),
        }
      );

      if (resp.ok) {
        const data = await resp.json() as { sid?: string };
        await updateBothSms(sms, {
          status: "sent", externalId: data.sid ?? null, sentAt: true, errorMessage: null,
        });
        sent++;
      } else {
        const errText = await resp.text();
        const newCount = (Number(sms.attemptCount) || 0) + 1;
        const newStatus = newCount >= 3 ? "failed" : "pending";
        await updateBothSms(sms, { status: newStatus, errorMessage: errText.substring(0, 500) });
        failed++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const newCount = (Number(sms.attemptCount) || 0) + 1;
      const newStatus = newCount >= 3 ? "failed" : "pending";
      await updateBothSms(sms, { status: newStatus, errorMessage: errMsg });
      failed++;
    }
  }

  return `SMS queue: ${sent} sent, ${failed} failed, ${skipped} skipped (no config)`;
}

async function processWhatsAppQueue(): Promise<string> {
  // Phase 4 contract slice 6: read from outbound_queue.
  const pending = await rawQuery<Record<string, unknown>>(
    `SELECT oq.id, oq."companyId", oq.recipient AS phone,
            oq.body AS message, oq.attempts AS "attemptCount",
            oq."legacyId", oq."legacySource",
            ss_token.value AS "accessToken", ss_phone.value AS "phoneNumberId",
            COALESCE(ss_enabled.value, 'true') AS "channelEnabled"
     FROM outbound_queue oq
     LEFT JOIN system_settings ss_token ON ss_token.key='whatsapp_access_token' AND ss_token."companyId"=oq."companyId"
     LEFT JOIN system_settings ss_phone ON ss_phone.key='whatsapp_phone_id' AND ss_phone."companyId"=oq."companyId"
     LEFT JOIN system_settings ss_enabled ON ss_enabled.key='whatsapp_enabled' AND ss_enabled."companyId"=oq."companyId"
     WHERE oq.status='pending' AND oq.channel='whatsapp'
       AND COALESCE(oq.attempts,0) < 3
       AND (oq."scheduledAt" IS NULL OR oq."scheduledAt" <= NOW())
     ORDER BY oq."createdAt" ASC LIMIT 50`
  );

  let sent = 0, failed = 0, skipped = 0;

  const updateBothWa = async (
    row: Record<string, unknown>,
    fields: { status?: string; errorMessage?: string | null; externalId?: string | null; sentAt?: boolean },
    bumpAttempts: boolean = true,
  ) => {
    const id = row.id as number;
    const set: string[] = [];
    const params: unknown[] = [];
    if (fields.status !== undefined) { params.push(fields.status); set.push(`status = $${params.length}`); }
    if (fields.errorMessage !== undefined) { params.push(fields.errorMessage); set.push(`"errorMessage" = $${params.length}`); }
    if (fields.externalId !== undefined) { params.push(fields.externalId); set.push(`"externalId" = $${params.length}`); }
    if (fields.sentAt) set.push(`"sentAt" = NOW()`);
    if (bumpAttempts) set.push(`attempts = COALESCE(attempts, 0) + 1`);
    set.push(`"updatedAt" = NOW()`);
    params.push(id);
    await rawExecute(
      `UPDATE outbound_queue SET ${set.join(", ")} WHERE id = $${params.length}`,
      params,
    );
  };

  for (const msg of pending) {
    if (msg.channelEnabled === "false") {
      await updateBothWa(msg, { errorMessage: "قناة واتساب معطلة — سيتم الإرسال عند التفعيل" }, false);
      skipped++;
      continue;
    }
    if (!msg.accessToken || !msg.phoneNumberId) {
      await updateBothWa(msg, { errorMessage: "بيانات Meta API غير مضبوطة — يرجى إعداد المفاتيح في الإعدادات" }, false);
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
        await updateBothWa(msg, {
          status: "sent", externalId: msgId, sentAt: true, errorMessage: null,
        });
        sent++;
      } else {
        const errText = await resp.text();
        const newCount = (Number(msg.attemptCount) || 0) + 1;
        const newStatus = newCount >= 3 ? "failed" : "pending";
        await updateBothWa(msg, { status: newStatus, errorMessage: errText.substring(0, 500) });
        failed++;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const newCount = (Number(msg.attemptCount) || 0) + 1;
      const newStatus = newCount >= 3 ? "failed" : "pending";
      await updateBothWa(msg, { status: newStatus, errorMessage: errMsg });
      failed++;
    }
  }

  return `WhatsApp queue: ${sent} sent, ${failed} failed, ${skipped} skipped (no config)`;
}

/**
 * Phase 2.x live mailbox sync. Iterates over enabled mailbox_accounts
 * ordered by lastSyncedAt (oldest first → never-synced accounts go to
 * the head of the queue). Caps the per-tick work at 10 accounts so a
 * tenant with many mailboxes can't starve the rest. Per-account
 * sync failures don't abort the loop — mailboxSync.ts updates each
 * account's lastSyncStatus + lastSyncError.
 */
async function processMailboxSync(): Promise<string> {
  const due = await rawQuery<{ id: number; companyId: number; userId: number }>(
    `SELECT id, "companyId", "userId"
       FROM mailbox_accounts
      WHERE "syncEnabled" = true AND "deletedAt" IS NULL
      ORDER BY "lastSyncedAt" ASC NULLS FIRST
      LIMIT 10`,
  );
  if (due.length === 0) return "No mailboxes due";

  let okCount = 0, errCount = 0, msgs = 0;
  for (const account of due) {
    try {
      const result = await syncMailbox(account.id, account.companyId, account.userId);
      if (result.status === "ok") {
        okCount++;
        msgs += result.messagesFetched;
      } else {
        errCount++;
      }
    } catch (err) {
      errCount++;
      logger.warn(err, `[cronScheduler] mailbox sync failed for account ${account.id}`);
    }
  }
  return `Mailbox sync: ${okCount} ok (${msgs} msgs), ${errCount} err`;
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
      // الإهلاك يأتي الآن من profile المحرّك الدوري (assetDepreciationProfile) —
      // مصدر واحد للصيغة. السلوك مطابق للحساب السابق المُضمّن (مُثبَت بالتكافؤ في
      // recurringPostingEngineDepreciation.test.ts)؛ ومسك الأصل (depreciation_entries
      // + fixed_assets) يبقى هنا لأنها جداول المجال.
      const depAmount = assetDepreciationProfile.amountFor(asset as unknown as DepreciationAssetRow);
      if (depAmount <= 0) continue;

      const purchaseCost = Number(asset.purchaseCost);
      const salvageValue = Number(asset.salvageValue);
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
          sourceKey: assetDepreciationProfile.sourceKey(asset as unknown as DepreciationAssetRow, period),
          lines: assetDepreciationProfile.journalTemplate(asset as unknown as DepreciationAssetRow, depAmount),
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

        // Explicit audit log so cron-driven depreciation is distinguishable
        // from manual operator depreciation in audit_logs. Previously the
        // sourceKey + system userId were the only trace, so auditors
        // couldn't filter on "automated nightly run" vs "ad-hoc manual"
        // when reviewing depreciation entries.
        await createAuditLog({
          companyId: Number(company.id),
          branchId: Number(asset.branchId ?? branchId),
          userId: Number(createdBy),
          action: "fixed_asset.depreciate.cron",
          entity: "fixed_assets",
          entityId: Number(asset.id),
          after: {
            period,
            depreciationAmount: depAmount,
            bookValueAfter: newBookValue,
            journalEntryId: journalId,
            source: "cron",
          },
        }).catch((e) => logger.error(e, "[CRON] depreciation audit log failed"));

        processed++;
        totalDepreciated += depAmount;
      } catch (err) {
        logger.error(err, `[CRON] Depreciation failed for asset ${asset.id}:`);
      }
    }
  }
  return `Monthly depreciation: ${processed} assets processed, total = ${totalDepreciated.toFixed(2)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// monthlyHrAccruals — أتمتة استحقاقات الموارد البشرية الشهرية (إجازات + نهاية الخدمة).
// يحلّ فجوة المواصفة «الدفتر يعتمد على بشر يتذكّرون»: مسار hr.ts `/accruals/monthly`
// يدويّ. هذا الـcron يشغّله تلقائيًّا لكل شركة بنفس بنية monthlyAutoDepreciation
// (لقطة فترة + مستخدم نظام + بوابة فترة مفتوحة).
//
// السلامة الدفترية:
//   • idempotency **مشترك** مع المسار اليدوي عبر نفس المرجع `HR-ACCRUAL-{period}`
//     — أيّهما رحّل الفترة أولًا يحجب الآخر، فلا ازدواج استحقاق (لا قيد مكرّر).
//   • بوابة الفترة (checkFinancialPeriodOpen) — لا ترحيل في فترة مُقفلة.
//   • المبالغ من profiles المحرّك الدوري (eos/leaveAccrualProfile) — مصدر صيغة واحد
//     مطابق للمسار اليدوي (assertion في recurringPostingEngineHrAccruals.test.ts).
//   • الترحيل عبر hrEngine.postMonthlyAccrualsGL (نفس عقد الحدود + حلّ الحسابات
//     2150/2220/5270/5260)، فالحبيبة والحسابات مطابقة للمسار اليدوي تمامًا.
// ─────────────────────────────────────────────────────────────────────────────
async function monthlyHrAccruals(): Promise<string> {
  const period = currentPeriod();
  const accrualDate = `${period}-01`;
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let processed = 0;
  let skipped = 0;

  for (const company of companies) {
    try {
      // بوابة الفترة — لا استحقاق في فترة مُقفلة.
      const periodCheck = await checkFinancialPeriodOpen(Number(company.id), accrualDate);
      if (!periodCheck.open) { skipped++; continue; }

      // idempotency مشترك مع المسار اليدوي — مرجع واحد للفترة.
      const ref = `HR-ACCRUAL-${period}`;
      const [existing] = await rawQuery<{ id: number }>(
        `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [company.id, ref],
      );
      if (existing) { skipped++; continue; }

      const [systemUser] = await rawQuery<Record<string, unknown>>(
        `SELECT ea.id FROM employee_assignments ea WHERE ea."companyId" = $1 AND ea.role IN ('finance_manager','general_manager','owner') AND ea.status='active' ORDER BY ea.role='owner' DESC LIMIT 1`,
        [company.id],
      );
      if (!systemUser) {
        logger.warn(`[CRON] monthlyHrAccruals: no finance/owner user for company ${company.id}, skipping`);
        skipped++;
        continue;
      }
      const [systemBranch] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM branches WHERE "companyId" = $1 LIMIT 1`,
        [company.id],
      );
      if (!systemBranch?.id) {
        logger.warn(`[CRON] monthlyHrAccruals: no branch for company ${company.id}, skipping`);
        skipped++;
        continue;
      }
      const branchId = Number(systemBranch.id);

      // نفس استعلام المسار اليدوي (hr.ts /accruals/monthly): نشطون برواتب موجبة + بداية العقد.
      const employees = await rawQuery<Record<string, unknown>>(
        `SELECT ea."employeeId", ea.salary, ea."hireDate",
                COALESCE(ec."startDate", ea."hireDate") AS "contractStart"
         FROM employee_assignments ea
         LEFT JOIN employee_contracts ec ON ec."employeeId"=ea."employeeId"
                                        AND ec."companyId"=$1 AND ec.status='active'
         WHERE ea."companyId"=$1 AND ea.status='active' AND ea.salary > 0`,
        [company.id],
      );
      if (employees.length === 0) { skipped++; continue; }

      const periodEnd = new Date(`${period}-28`);
      let totalLeaveAccrual = 0;
      let totalEosAccrual = 0;
      const breakdown: Array<{ employeeId: number; branchId: number; leaveAccrual: number; eosAccrual: number }> = [];
      for (const emp of employees) {
        const salary = Number(emp.salary) || 0;
        if (salary <= 0) continue;
        const startDate = new Date((emp.contractStart || emp.hireDate) as string | Date);
        const yearsOfService = (periodEnd.getTime() - startDate.getTime()) / (365.25 * 24 * 3600 * 1000);
        const employeeId = Number(emp.employeeId);
        // مصدر الصيغة الموحّد: profiles المحرّك الدوري (مطابق للمسار اليدوي).
        const eosAccrual = eosAccrualProfile.amountFor({ id: employeeId, salary, yearsOfService });
        const leaveAccrual = leaveAccrualProfile.amountFor({ id: employeeId, salary });
        totalEosAccrual += eosAccrual;
        totalLeaveAccrual += leaveAccrual;
        breakdown.push({ employeeId, branchId, leaveAccrual, eosAccrual });
      }
      totalLeaveAccrual = roundTo2(totalLeaveAccrual);
      totalEosAccrual = roundTo2(totalEosAccrual);
      if (totalLeaveAccrual <= 0 && totalEosAccrual <= 0) { skipped++; continue; }

      const { hrEngine } = await import("./engines/index.js");
      const { journalId } = await hrEngine.postMonthlyAccrualsGL(
        { companyId: Number(company.id), branchId, createdBy: Number(systemUser.id) },
        { ref, period, totalLeaveAccrual, totalEosAccrual, employeeCount: employees.length, breakdown },
      );

      await createAuditLog({
        companyId: Number(company.id),
        branchId,
        userId: Number(systemUser.id),
        action: "hr.accruals.cron",
        entity: "journal_entries",
        entityId: Number(journalId ?? 0),
        after: { period, totalLeaveAccrual, totalEosAccrual, employeeCount: employees.length, ref, source: "cron" },
      }).catch((e) => logger.error(e, "[CRON] HR accruals audit log failed"));

      processed++;
    } catch (err) {
      logger.error(err, `[CRON] monthlyHrAccruals failed for company ${company.id}:`);
    }
  }
  return `Monthly HR accruals: ${processed} company(ies) posted, ${skipped} skipped`;
}

// مخصّص الديون المشكوك فيها — أتمتة شهرية بنهج delta-to-target (المحاسبة القياسية):
// المخصّص في 1135 رصيدٌ مستهدف، فيُرحَّل كل فترة الفرقُ فقط بين الهدف بالتقادم ورصيد
// المخصّص الحالي (زيادة DR5820/CR1135، نقص DR1135/CR5820)، بلا تراكم. idempotent
// مشترك مع المسار اليدوي عبر مرجع الفترة `BAD-DEBT-{period}`، وبوابة الفترة داخل
// المحرّك. assertion على سطور القيد في badDebtProvisionDelta.dynamic.test.ts.
async function monthlyBadDebtProvision(): Promise<string> {
  const period = currentPeriod();
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let processed = 0;
  let skipped = 0;

  for (const company of companies) {
    try {
      // idempotency مشترك مع المسار اليدوي — مرجع واحد للفترة.
      const ref = `BAD-DEBT-${period}`;
      const [existing] = await rawQuery<{ id: number }>(
        `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL LIMIT 1`,
        [company.id, ref],
      );
      if (existing) { skipped++; continue; }

      const [systemUser] = await rawQuery<Record<string, unknown>>(
        `SELECT ea.id FROM employee_assignments ea WHERE ea."companyId" = $1 AND ea.role IN ('finance_manager','general_manager','owner') AND ea.status='active' ORDER BY ea.role='owner' DESC LIMIT 1`,
        [company.id],
      );
      if (!systemUser) {
        logger.warn(`[CRON] monthlyBadDebtProvision: no finance/owner user for company ${company.id}, skipping`);
        skipped++;
        continue;
      }
      const [systemBranch] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM branches WHERE "companyId" = $1 LIMIT 1`,
        [company.id],
      );
      if (!systemBranch?.id) { skipped++; continue; }
      const branchId = Number(systemBranch.id);

      // المحرّك المشترك: يحسب الهدف بالتقادم، يقرأ رصيد 1135، ويرحّل الفرق فقط.
      // بوابة الفترة + الـidempotency (sourceKey) داخله ⇒ posted=false عند
      // (فترة مُقفلة / مطابق للهدف / مُرحَّل مسبقًا) فنتخطّى.
      const result = await postBadDebtProvision({
        companyId: Number(company.id),
        branchId,
        period,
        createdBy: Number(systemUser.id),
      });
      if (!result.posted) { skipped++; continue; }

      await createAuditLog({
        companyId: Number(company.id),
        branchId,
        userId: Number(systemUser.id),
        action: "bad_debt.provision.cron",
        entity: "journal_entries",
        entityId: Number(result.journalId ?? 0),
        after: { period, target: result.target, currentAllowance: result.currentAllowance, delta: result.delta, ref, source: "cron" },
      }).catch((e) => logger.error(e, "[CRON] bad-debt provision audit log failed"));

      processed++;
    } catch (err) {
      logger.error(err, `[CRON] monthlyBadDebtProvision failed for company ${company.id}:`);
    }
  }
  return `Monthly bad-debt provision: ${processed} company(ies) posted, ${skipped} skipped`;
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

      // Scheduled reports run through Print Engine v2 like everything else.
      // System scope (isOwner=true) bypasses RBAC since scheduled_reports
      // already gates which reports a company sees.
      const { renderPrint } = await import("./print/printService.js");
      const sysScope = {
        companyId: report.companyId as number,
        branchId: null,
        userId: 0,
        role: "system",
        isOwner: true,
      };
      const synthId = params.period
        ? params.period
        : (params.startDate || params.endDate)
          ? `${params.startDate ?? ""}..${params.endDate ?? ""}`
          : "all";

      let attachment: { filename: string; content: Buffer; contentType: string } | undefined;

      const REPORT_MAP: Record<string, { entityType: string; format: "excel" | "a4"; filename: string; contentType: string }> = {
        "trial-balance":     { entityType: "report_trial_balance",   format: "excel", filename: "trial-balance.xlsx",   contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        "income-statement":  { entityType: "report_income_statement", format: "excel", filename: "income-statement.xlsx", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        "payroll":           { entityType: "report_payroll",          format: "excel", filename: "payroll.xlsx",          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        "attendance":        { entityType: "report_attendance",       format: "excel", filename: "attendance.xlsx",       contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
        "trial-balance-pdf": { entityType: "report_trial_balance",    format: "a4",    filename: "trial-balance.pdf",     contentType: "application/pdf" },
      };
      const cfg = REPORT_MAP[report.reportType as string];
      if (cfg) {
        const out = await renderPrint(sysScope, { entityType: cfg.entityType, entityId: synthId, format: cfg.format });
        attachment = { filename: cfg.filename, content: out.bytes, contentType: cfg.contentType };
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
                `INSERT INTO outbound_queue
                   ("companyId", channel, recipient, subject, body, metadata,
                    status, "createdAt", "updatedAt")
                 VALUES ($1, 'email', $2, $3, $4, $5::jsonb, 'pending', NOW(), NOW())`,
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
          `INSERT INTO scheduled_report_history ("scheduledReportId", status, "sentAt", result, error)
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

// تنبيه اقتراب سن التقاعد — يُفعّل حقل dateOfBirth الموجود على الموظف تلقائيًّا
// (فجوة «بديهة يجب أن ينتبه لها النظام تلقائيًّا»). يمسح الموظفين النشطين ومَن
// يعبُر منهم اليومَ إحدى عتبات التنبيه (180/90/30/7/0 يومًا قبل بلوغ السن النظامي
// 60) يُخطَر به مديرُ الموارد البشرية — كنمط govExpiryAlerts. منطق التاريخ في دالة
// نقية مُختبَرة (selectApproachingRetirement). لا يمسّ الدفتر.
async function retirementAgeAlerts(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  const today = todayISO();
  let alerted = 0;

  for (const company of companies) {
    const [hrAsgn] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM employee_assignments WHERE "companyId" = $1 AND role IN ('hr_manager','general_manager','owner') AND status = 'active' ORDER BY CASE role WHEN 'hr_manager' THEN 1 WHEN 'general_manager' THEN 2 ELSE 3 END LIMIT 1`,
      [company.id]
    );
    if (!hrAsgn) continue;

    const emps = await rawQuery<{ employeeId: number; name: string; dateOfBirth: string }>(
      `SELECT e.id AS "employeeId", e.name, e."dateOfBirth"::text AS "dateOfBirth"
         FROM employees e
         JOIN employee_assignments ea ON ea."employeeId" = e.id AND ea."companyId" = $1 AND ea.status = 'active'
        WHERE e.status = 'active' AND e."dateOfBirth" IS NOT NULL AND e."deletedAt" IS NULL`,
      [company.id]
    );
    if (emps.length === 0) continue;

    const nameById = new Map(emps.map((e) => [e.employeeId, e.name]));
    const watches = selectApproachingRetirement({
      asOfDate: today,
      employees: emps.map((e) => ({ employeeId: e.employeeId, dateOfBirth: e.dateOfBirth })),
    });

    for (const w of watches) {
      const name = nameById.get(w.employeeId) ?? `#${w.employeeId}`;
      await createNotification({
        companyId: company.id, assignmentId: hrAsgn.id as number,
        type: "retirement_age_alert",
        title: w.daysLeft === 0 ? `بلوغ سن التقاعد: ${name}` : `اقتراب سن التقاعد: ${name}`,
        body: w.daysLeft === 0
          ? `الموظف ${name} يبلغ سن التقاعد النظامي (${w.retirementDate}) اليوم — يرجى بدء إجراءات نهاية الخدمة واحتساب مكافأتها.`
          : `الموظف ${name} يبلغ سن التقاعد النظامي (${w.retirementDate}) خلال ${w.daysLeft} يومًا — يرجى التحضير لإجراءات نهاية الخدمة ومكافأتها.`,
        priority: w.daysLeft <= 30 ? "high" : "normal",
        refType: "employee", refId: w.employeeId,
      });
      alerted++;
    }
  }
  return `retirement alerts sent=${alerted}`;
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

  // notification_log was dropped in Phase 4 final contract — the 90-day
  // notification cleanup now hits message_log directly (folder='sent',
  // older than 90 days). Channel scope is the same set logNotification
  // used to write to notification_log.
  const { affectedRows: oldMsgLogs } = await rawExecute(
    `DELETE FROM message_log
      WHERE folder = 'sent'
        AND channel IN ('email','sms','whatsapp','push','in_app','internal')
        AND "createdAt" < NOW() - INTERVAL '90 days'`
  ).catch((e) => { logger.error(e, "[cronScheduler] cleanup query failed"); return { affectedRows: 0 }; });
  cleaned += oldMsgLogs;

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
         JOIN users u ON u."employeeId" = ea."employeeId"
         JOIN rbac_user_roles ur ON ur."userId" = u.id AND ur."companyId" = ea."companyId"
         JOIN rbac_roles r ON r.id = ur.role_id
         WHERE ea."companyId"=$1 AND ea.status='active' AND r.role_key='finance_manager'
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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
// monthlyFxRevaluationCompute — أتمتة حساب إعادة تقييم العملات وإدراجها في طابور
// الترحيل (لا ترحيل GL تلقائي — البشر يراجعون ويرحّلون من gl-posting-queue). يحلّ
// آخر فجوة «بشر يتذكّرون» في جدول المواصفة: المسار المباشر/الطابور كان يدويًّا.
//
// السلامة الدفترية:
//   • **لا ترحيل GL** — يكتب fx_revaluation_log/_lines بـjournalEntryId NULL فقط
//     (يحسب + يُدرج الطابور)؛ الترحيل الفعلي يبقى بيد الإنسان عبر الطابور.
//   • idempotent عبر حارسَي الازدواج نفسيهما اللذين يستعملهما المسار اليدوي
//     (compute endpoint): صف fx_revaluations مُرحَّل للفترة → تخطٍّ؛ سجل طابور
//     غير مُرحَّل للفترة → تخطٍّ.
//   • بوابة الفترة + وجود الفترة المالية (FK) + وجود تعرّض عملات أجنبية — وإلا تخطٍّ.
//   • runPeriodEndRevaluation داخل withTransaction (ذرّي).
// ─────────────────────────────────────────────────────────────────────────────
async function monthlyFxRevaluationCompute(): Promise<string> {
  const period = currentPeriod();
  const [y, m] = period.split("-").map(Number);
  const periodEnd = toDateISO(new Date(y, m, 0)); // آخر يوم في الشهر = asOfDate
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE status='active'`);
  const { runPeriodEndRevaluation } = await import("./fx/revaluation.js");
  let computed = 0;
  let skipped = 0;

  for (const c of companies) {
    try {
      // تعرّض عملات أجنبية مفتوح؟ (نفس فحص التذكير) — وإلا لا شيء لإعادة تقييمه.
      const [fxExposure] = await rawQuery<{ n: number }>(
        `SELECT COUNT(*)::int AS n FROM invoices
          WHERE "companyId"=$1 AND currency IS NOT NULL AND currency<>'SAR' AND status NOT IN ('paid','cancelled')`,
        [c.id],
      ).catch(() => [{ n: 0 }]);
      if (!fxExposure || fxExposure.n === 0) { skipped++; continue; }

      // الفترة مفتوحة + معرّفة (runPeriodEndRevaluation يطلب periodId FK).
      const periodCheck = await checkFinancialPeriodOpen(Number(c.id), periodEnd);
      if (!periodCheck.open) { skipped++; continue; }
      const [finPeriod] = await rawQuery<{ id: number }>(
        `SELECT id FROM financial_periods
          WHERE "companyId"=$1 AND "deletedAt" IS NULL
            AND "startDate" <= $2::date AND "endDate" >= $2::date
          ORDER BY id ASC LIMIT 1`,
        [c.id, periodEnd],
      );
      if (!finPeriod) { skipped++; continue; }

      // حارس الازدواج (1): رُحّلت مباشرةً للفترة؟
      const [postedDirect] = await rawQuery<{ id: number }>(
        `SELECT id FROM fx_revaluations WHERE "companyId"=$1 AND period=$2 LIMIT 1`,
        [c.id, period],
      ).catch(() => []);
      if (postedDirect) { skipped++; continue; }
      // حارس الازدواج (2): محسوبة في الطابور سلفًا (سجل غير مُرحَّل)؟
      const [pendingQueue] = await rawQuery<{ id: number }>(
        `SELECT id FROM fx_revaluation_log
          WHERE "companyId"=$1 AND to_char("asOfDate",'YYYY-MM')=$2 AND "journalEntryId" IS NULL LIMIT 1`,
        [c.id, period],
      ).catch(() => []);
      if (pendingQueue) { skipped++; continue; }

      const [sysUser] = await rawQuery<{ id: number }>(
        `SELECT ea.id FROM employee_assignments ea
          WHERE ea."companyId"=$1 AND ea.role IN ('finance_manager','general_manager','owner') AND ea.status='active'
          ORDER BY ea.role='owner' DESC LIMIT 1`,
        [c.id],
      );
      const ranBy = sysUser?.id != null ? Number(sysUser.id) : undefined;

      const result = await runPeriodEndRevaluation({
        companyId: Number(c.id), periodId: Number(finPeriod.id), asOfDate: periodEnd, ranBy,
      });

      await createAuditLog({
        companyId: Number(c.id), userId: ranBy ?? 0,
        action: "fx_revaluation.compute.cron", entity: "fx_revaluation_log", entityId: Number(result.revaluationLogId),
        after: { period, periodEnd, totalGain: result.totalGain, totalLoss: result.totalLoss, source: "cron" },
      }).catch((e) => logger.error(e, "[CRON] FX revaluation compute audit failed"));
      computed++;
    } catch (err) {
      logger.error(err, `[CRON] monthlyFxRevaluationCompute failed for company ${c.id}:`);
    }
  }
  return `FX revaluation auto-compute: ${computed} queued, ${skipped} skipped`;
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
         JOIN users u ON u."employeeId" = ea."employeeId"
         JOIN rbac_user_roles ur ON ur."userId" = u.id AND ur."companyId" = ea."companyId"
         JOIN rbac_roles r ON r.id = ur.role_id
         WHERE ea."companyId"=$1 AND ea.status='active' AND r.role_key='finance_manager'
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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
        body: `يوجد ${fxExposure.n} فاتورة بعملة أجنبية مفتوحة — يرجى ترحيل إعادة التقييم الشهرية من صفحة «إعادة تقييم العملات».`,
        priority: "medium",
        actionUrl: "/finance/fx-revaluation",
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
         JOIN users u ON u."employeeId" = ea."employeeId"
         JOIN rbac_user_roles ur ON ur."userId" = u.id AND ur."companyId" = ea."companyId"
         JOIN rbac_roles r ON r.id = ur.role_id
         WHERE ea."companyId"=$1 AND ea.status='active' AND r.role_key='finance_manager'
           AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
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
          -- Operator-flipped exemption (migration 242). NOT COALESCE
          -- treats NULL as the regular non-exempt path so pre-migration
          -- rows don't accidentally skip the scan.
          AND NOT COALESCE(p."overstayExempt", false)
          AND COALESCE(p."actualStayDays",0) > COALESCE(p."programDuration",0)
          AND COALESCE(p."programDuration",0) > 0
          AND NOT EXISTS (
            SELECT 1 FROM umrah_violations v
             WHERE v."companyId"=$1 AND v."mutamerId"=p.id
               AND v.type='overstay' AND v."deletedAt" IS NULL
          )`,
      [c.id]
    );
    // Penalty settings — 3 keys read in one go so the per-pilgrim loop
    // below doesn't fire 3 queries per row. Backward-compat: when the
    // operator hasn't set the tiered keys, the existing per-day model
    // applies unchanged.
    //
    // Tiered model (the user's "20 days base + every 10 days = +50 ر.س"
    // example): when BOTH tier_days > 0 AND tier_amount > 0, the
    // engine uses ceil(overDays / tier_days) × tier_amount. Example:
    //   overDays=5  → 1 tier × 50 = 50
    //   overDays=15 → 2 tiers × 50 = 100
    //   overDays=20 → 2 tiers × 50 = 100  (NOT 3 — operator's "every 10")
    //
    // Per-day fallback: penalty = overDays × per_day. Keeps the
    // pre-tier behaviour for companies that haven't migrated.
    const penaltySettings = await rawQuery<{ key: string; value: string }>(
      `SELECT key, value FROM system_settings
        WHERE key IN ('umrah.overstay_daily_penalty',
                      'umrah.overstay_tier_days',
                      'umrah.overstay_tier_amount')
          AND ( ("companyId" IS NULL AND "branchId" IS NULL)
                OR ("companyId" = $1 AND "branchId" IS NULL) )
        ORDER BY "companyId" NULLS FIRST`,
      [c.id]
    );
    // company-scoped value wins (NULLS FIRST means it comes last → overwrites).
    const penaltyByKey: Record<string, number> = {};
    for (const row of penaltySettings) {
      penaltyByKey[row.key] = Number(row.value ?? 0);
    }
    const overstayCfg = {
      perDay: penaltyByKey["umrah.overstay_daily_penalty"] ?? 0,
      tierDays: penaltyByKey["umrah.overstay_tier_days"] ?? 0,
      tierAmount: penaltyByKey["umrah.overstay_tier_amount"] ?? 0,
    };
    for (const o of overstayed) {
      // ceil(overDays / tierDays) × tierAmount when tiered, else overDays ×
      // perDay. Shared with the mutamers import (umrahPenaltyMath) so both
      // billing paths compute the IDENTICAL invoiced penalty.
      const penalty = overstayPenaltyAmount(o.overDays, overstayCfg);
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
  const { gccExclusionSqlFragment } = await import("./umrahNationalityRules.js");
  const { resolveSettings } = await import("./settings.js");
  let alerted = 0;
  let notifSent = 0;
  for (const c of companies) {
    // GCC nationals enter KSA visa-free — their `visaExpiry` row (if
    // any) is operator data entry from another jurisdiction; alerting
    // on it is a false positive that nags the GM every morning.
    const expiring = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p."fullName", p."visaNumber", p."visaExpiry", p.phone, g.name AS "groupName",
              (p."visaExpiry"::date - CURRENT_DATE) AS "daysRemaining"
       FROM umrah_pilgrims p
       LEFT JOIN umrah_groups g ON g.id = p."groupId"
       WHERE p."companyId"=$1 AND p."deletedAt" IS NULL
         AND p.status NOT IN ('departed','cancelled')
         AND p."visaExpiry" IS NOT NULL
         AND p."visaExpiry" BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
         AND ${gccExclusionSqlFragment(`p."nationality"`)}`,
      [c.id]
    );
    if (expiring.length === 0) continue;
    // Always notify the GM/manager — that's the historical behaviour.
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
    // In-app pilgrim-specific notifications — OPT-IN per company via
    // `umrah.notify.visa_expiry`. Goes to every branch manager + GM
    // assignment via the platform's notification seam (bell icon),
    // with a deep-link to the pilgrim's detail page.
    const enabledRaw = await resolveSettings("umrah.notify.visa_expiry", c.id);
    const enabled = enabledRaw === true || enabledRaw === "true" || enabledRaw === 1;
    if (!enabled) continue;
    const { notifyInternalVisaExpiring, resolveInternalRecipients } = await import("./umrahInternalNotifications.js");
    // U-17-P4 — digest mode. The U-17-P1 catalog exposes
    // `umrah.notifications.digestMode` with values "per_event"
    // (default — one notification per expiring pilgrim, the legacy
    // behaviour preserved below) or "daily_digest" (one aggregated
    // notification per recipient summarising every expiring pilgrim).
    // Reading the setting once per company keeps the inner loop cheap.
    const digestModeRaw = await resolveSettings("umrah.notifications.digestMode", c.id);
    const digestMode = String(digestModeRaw ?? "per_event");
    if (digestMode === "daily_digest") {
      // Daily digest path — emit a single notification per recipient
      // with a compact summary of every expiring row instead of N
      // per-event dispatches.
      const recipients = await resolveInternalRecipients({
        companyId: c.id,
        branchId: null,
        pilgrimId: 0,
        pilgrimName: null,
        agentId: null,
      });
      if (recipients.length > 0) {
        const lines = expiring
          .slice(0, 50)
          .map(
            (p, i) =>
              `${i + 1}. ${(p.fullName as string) ?? "معتمر #" + p.id} — تنتهي خلال ${p.daysRemaining ?? 0} يوم`,
          )
          .join("\n");
        const overflow = expiring.length > 50 ? `\n…و ${expiring.length - 50} حالة أخرى` : "";
        const title = `🔔 تنبيه يومي مُجمَّع — ${expiring.length} تأشيرة قاربت على الانتهاء`;
        const body = `إجمالي ${expiring.length} معتمر بحاجة لمتابعة:\n${lines}${overflow}\n\nراجع القائمة الكاملة من شاشة المعتمرين.`;
        for (const assignmentId of recipients) {
          try {
            await createNotification({
              companyId: c.id,
              assignmentId,
              type: "umrah",
              title,
              body,
              priority: "high",
              refType: "umrah_pilgrims",
              refId: 0,
              actionUrl: "/umrah/pilgrims?visaExpiring=1",
            });
            notifSent++;
          } catch (e) {
            logger.error(e, "[cronScheduler] umrah visa digest notify failed");
          }
        }
      }
      continue;
    }
    for (const row of expiring) {
      try {
        const recipients = await notifyInternalVisaExpiring(
          {
            companyId: c.id,
            branchId: null,
            pilgrimId: row.id as number,
            pilgrimName: (row.fullName as string) ?? null,
            agentId: null,
          },
          Number(row.daysRemaining ?? 0),
        );
        notifSent += recipients;
      } catch (e) {
        logger.error(e, "[cronScheduler] umrah visa internal notify failed");
      }
    }
  }
  return `تنبيهات انتهاء التأشيرات: ${alerted} تأشيرة عبر ${companies.length} شركة، أُرسل ${notifSent} إشعار داخلي`;
}

// Departure-reminder in-app notification — runs daily at 18:00 and
// finds pilgrims whose `arrivalDate` is tomorrow. Notifies the
// branch manager + GM so they confirm transport. Opt-in via
// `umrah.notify.departure_reminder`.
async function umrahDepartureReminderSms(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE status = 'active'`);
  const { resolveSettings } = await import("./settings.js");
  const { notifyInternalDepartureTomorrow } = await import("./umrahInternalNotifications.js");
  let enabled = 0, sent = 0;
  for (const c of companies) {
    const flagRaw = await resolveSettings("umrah.notify.departure_reminder", c.id);
    const flag = flagRaw === true || flagRaw === "true" || flagRaw === 1;
    if (!flag) continue;
    enabled++;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p."fullName", p."arrivalDate", p."entryFlight"
         FROM umrah_pilgrims p
        WHERE p."companyId"=$1 AND p."deletedAt" IS NULL
          AND p.status = 'pending'
          AND p."arrivalDate" = CURRENT_DATE + INTERVAL '1 day'`,
      [c.id],
    );
    for (const row of rows) {
      try {
        const r = await notifyInternalDepartureTomorrow(
          {
            companyId: c.id,
            branchId: null,
            pilgrimId: row.id as number,
            pilgrimName: (row.fullName as string) ?? null,
            agentId: null,
          },
          {
            tripDate: String(row.arrivalDate),
            flightNumber: (row.entryFlight as string) ?? null,
          },
        );
        sent += r;
      } catch (e) {
        logger.error(e, "[cronScheduler] umrah departure notify failed");
      }
    }
  }
  return `تذكير الرحيل: ${enabled}/${companies.length} شركة مفعّلة، أُرسل ${sent} إشعار`;
}

// Overstay-warning in-app notification — companies with
// `umrah.notify.overstay_warning` enabled get a daily alert per
// overstaying pilgrim. Skips exempt pilgrims (mirrors penalty engine).
async function umrahOverstayWarningSms(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE status = 'active'`);
  const { resolveSettings } = await import("./settings.js");
  const { notifyInternalOverstayWarning } = await import("./umrahInternalNotifications.js");
  let enabled = 0, sent = 0;
  for (const c of companies) {
    const flagRaw = await resolveSettings("umrah.notify.overstay_warning", c.id);
    const flag = flagRaw === true || flagRaw === "true" || flagRaw === 1;
    if (!flag) continue;
    enabled++;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.id, p."fullName",
              (CURRENT_DATE - p."departureDate"::date) AS "daysOverstayed"
         FROM umrah_pilgrims p
        WHERE p."companyId"=$1 AND p."deletedAt" IS NULL
          AND p.status = 'overstayed'
          AND NOT COALESCE(p."overstayExempt", false)
          AND p."departureDate" < CURRENT_DATE`,
      [c.id],
    );
    for (const row of rows) {
      try {
        const r = await notifyInternalOverstayWarning(
          {
            companyId: c.id,
            branchId: null,
            pilgrimId: row.id as number,
            pilgrimName: (row.fullName as string) ?? null,
            agentId: null,
          },
          Number(row.daysOverstayed ?? 0),
        );
        sent += r;
      } catch (e) {
        logger.error(e, "[cronScheduler] umrah overstay notify failed");
      }
    }
  }
  return `تنبيه التجاوز: ${enabled}/${companies.length} شركة مفعّلة، أُرسل ${sent} إشعار`;
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

// Automated overstay-penalty generation (#5 of the maturity gap report).
//
// `umrahDailyStatusAdvance` above transitions pilgrims into `overstayed`
// state, but the penalty engine (financial impact) had remained manual
// — operators had to click "تشغيل المحرك" daily. That was a deliberate
// safety choice (manual supervision of GL postings), but it left a
// long-running operational debt: forgotten clicks let penalties stack
// silently.
//
// The fix makes auto-penalty OPT-IN per company via three settings:
//   `umrah.auto_penalty.enabled`       — boolean, default false
//   `umrah.auto_penalty.overstay_days` — number, default 3
//   `umrah.auto_penalty.daily_rate`    — number, default 500 (SAR/day)
//
// Companies that prefer manual supervision keep the current behavior
// (their flag stays false, the cron returns "skipped"). Companies that
// want automation flip the flag in Settings and the cron creates the
// penalties + GL entries on schedule. Exempt pilgrims (migration 242)
// are honoured by the engine query.
//
// Schedule: 0 7 * * * (7 AM, one hour after the 6 AM violation scan and
// the 5 AM status advance, so all upstream signals are settled).
async function umrahDailyAutoPenaltyGeneration(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE status = 'active'`);
  const { resolveSettings } = await import("./settings.js");
  const { generateOverstayPenalties } = await import("./umrahPenaltyEngine.js");
  let enabled = 0, totalCreated = 0, totalChecked = 0, totalSkippedExempt = 0;
  for (const c of companies) {
    const flagRaw = await resolveSettings("umrah.auto_penalty.enabled", c.id);
    const flag = flagRaw === true || flagRaw === "true" || flagRaw === 1;
    if (!flag) continue;
    enabled++;
    const overstayDaysRaw = await resolveSettings("umrah.auto_penalty.overstay_days", c.id);
    const dailyRateRaw = await resolveSettings("umrah.auto_penalty.daily_rate", c.id);
    const overstayDays = Number(overstayDaysRaw ?? 3);
    const dailyRate = Number(dailyRateRaw ?? 500);
    try {
      const result = await generateOverstayPenalties(
        { companyId: c.id, branchId: null, userId: 0 },
        { overstayDays, dailyRate },
      );
      totalCreated += result.penaltiesCreated;
      totalChecked += result.checked;
      totalSkippedExempt += result.skippedExempt;
      emitEvent({
        companyId: c.id, userId: null,
        action: "umrah.auto_penalty.cron_run", entity: "umrah_penalties", entityId: 0,
        details: JSON.stringify({
          source: "cron",
          checked: result.checked,
          penaltiesCreated: result.penaltiesCreated,
          violationsLinked: result.violationsLinked,
          skippedExempt: result.skippedExempt,
          overstayDays,
          dailyRate,
        }),
      }).catch((e) => logger.error(e, "[cronScheduler] umrah auto penalty event failed"));
    } catch (e) {
      logger.error(e, `[cronScheduler] umrah auto penalty failed for company ${c.id}`);
    }
  }
  return `تشغيل تلقائي لمحرك الغرامات: ${enabled}/${companies.length} شركة مفعلة، فُحص ${totalChecked} معتمر، أُنشئت ${totalCreated} غرامة، تم تجاهل ${totalSkippedExempt} (معفى)`;
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
  return parseEmailList(config.admin.infraAdminEmails.join(","));
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
        `INSERT INTO outbound_queue
           ("companyId", channel, recipient, "recipientName", subject, body,
            status, "refType", "createdAt", "updatedAt")
         VALUES ($1, 'email', $2, 'Infra Admin', $3, $4, 'pending', 'system_health', NOW(), NOW())`,
        [pivotCompanyId, toEmail, title, body]
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

/**
 * #2079 TA-T18-02 — materialise tomorrow's due route patterns for
 * companies that opted into autoMaterialiseEnabled. Runs once a day
 * at 06:30 Riyadh so the dispatcher walks into a day-+1 board already
 * populated with draft bookings (one per pattern whose mask matches
 * tomorrow's Riyadh weekday and whose activeFrom..activeUntil window
 * contains tomorrow).
 *
 * Targets TOMORROW (not today) so an op who reviews the cron output
 * still has business hours to reschedule, override, or cancel before
 * the materialised bookings flip into dispatch the next morning.
 *
 * Idempotency: bookingNumber = `RP-{patternCode}-{YYYYMMDD}` and the
 * (companyId, bookingNumber) UNIQUE constraint (migration 266) is the
 * natural key. ON CONFLICT DO NOTHING. Re-running the cron the same
 * day (manual trigger via /admin/cron/trigger) is a no-op.
 *
 * Boundary: NO JE / GL contact (transport rule). The created
 * bookings are draft + bookingSource='recurring_schedule' just like
 * the manual /materialise endpoint emits, so downstream behaviour is
 * identical to the human-fired path.
 */
export async function materialiseDueRoutePatterns(): Promise<string> {
  // Tomorrow in Riyadh — the cron's whole point. UTC math would fire
  // for the wrong day for any company crossing midnight Asia/Riyadh.
  const tomorrow = new Date(Date.now() + 86400000);
  const tomorrowIso = currentDateInTz("Asia/Riyadh", tomorrow);
  // Day-of-week (0=Sun..6=Sat) computed in Asia/Riyadh — matches the
  // mask convention pinned in transport-route-patterns.ts.
  const tomorrowDow = new Date(`${tomorrowIso}T12:00:00+03:00`).getUTCDay();

  // Only patterns belonging to companies that explicitly opted in.
  // The JOIN against transport_planning_settings is the gate — a
  // company without a settings row OR with FALSE simply does not appear.
  const patterns = await rawQueryShared<{
    id: number;
    companyId: number;
    branchId: number | null;
    patternCode: string;
    daysOfWeekMask: number;
    activeFrom: string | null;
    activeUntil: string | null;
    defaultCustomerId: number | null;
    defaultContractId: number | null;
    fromLocationId: number | null;
    toLocationId: number | null;
    fromLocationText: string | null;
    toLocationText: string | null;
    fromLocationKind: string | null;
    toLocationKind: string | null;
    fromLat: number | null;
    fromLng: number | null;
    toLat: number | null;
    toLng: number | null;
    defaultCargoWeight: number | null;
    defaultCargoUnit: string | null;
  }>(
    `SELECT rp.id, rp."companyId", rp."branchId",
            rp."patternCode", rp."daysOfWeekMask",
            rp."activeFrom", rp."activeUntil",
            rp."defaultCustomerId", rp."defaultContractId",
            rp."fromLocationId", rp."toLocationId",
            rp."fromLocationText", rp."toLocationText",
            rp."fromLocationKind", rp."toLocationKind",
            rp."fromLat", rp."fromLng", rp."toLat", rp."toLng",
            rp."defaultCargoWeight", rp."defaultCargoUnit"
       FROM transport_route_patterns rp
       JOIN transport_planning_settings tps
         ON tps."companyId" = rp."companyId"
        AND tps."autoMaterialiseEnabled" = TRUE
      WHERE rp."deletedAt" IS NULL
        AND rp.status = 'active'
        AND ((rp."daysOfWeekMask" >> $1) & 1) = 1
        AND (rp."activeFrom"  IS NULL OR rp."activeFrom"  <= $2::date)
        AND (rp."activeUntil" IS NULL OR rp."activeUntil" >= $2::date)`,
    [tomorrowDow, tomorrowIso],
  );

  let created = 0;
  let existed = 0;
  let errors = 0;
  const target = tomorrowIso;

  for (const pattern of patterns) {
    const bookingNumber = `RP-${pattern.patternCode}-${target.replace(/-/g, "")}`;
    try {
      const rows = await rawQueryShared<{ id: number; existed: boolean }>(
        `WITH ins AS (
           INSERT INTO transport_bookings
             ("companyId", "branchId", "bookingNumber", "bookingSource", "transportServiceType",
              "routePatternId", "tripFamily",
              "customerId", "contractId",
              "fromLocationId", "toLocationId",
              "fromLocationText", "toLocationText",
              "fromLocationKind", "toLocationKind",
              "fromLat", "fromLng", "toLat", "toLng",
              "requestedPickupDate",
              "cargoWeight", "cargoUnit",
              status, "createdBy")
           VALUES ($1, $2, $3, 'recurring_schedule', 'cargo_load',
                   $4, 'cargo',
                   $5, $6,
                   $7, $8, $9, $10,
                   $11, $12,
                   $13, $14, $15, $16,
                   $17, $18, $19,
                   'draft', NULL)
           ON CONFLICT ("companyId", "bookingNumber") DO NOTHING
           RETURNING id, FALSE AS existed
         )
         SELECT id, existed FROM ins
         UNION ALL
         SELECT id, TRUE AS existed
           FROM transport_bookings
          WHERE "companyId" = $1 AND "bookingNumber" = $3
            AND NOT EXISTS (SELECT 1 FROM ins)
         LIMIT 1`,
        [
          pattern.companyId, pattern.branchId, bookingNumber,
          pattern.id, pattern.defaultCustomerId, pattern.defaultContractId,
          pattern.fromLocationId, pattern.toLocationId,
          pattern.fromLocationText, pattern.toLocationText,
          pattern.fromLocationKind, pattern.toLocationKind,
          pattern.fromLat, pattern.fromLng,
          pattern.toLat, pattern.toLng,
          target, pattern.defaultCargoWeight, pattern.defaultCargoUnit,
        ],
      );
      const row = rows[0];
      if (!row) continue;
      if (row.existed) existed++;
      else created++;
    } catch (err) {
      errors++;
      logger.error({ err, patternId: pattern.id, bookingNumber }, "auto-materialise route pattern failed");
    }
  }

  return `materialise_due_route_patterns: ${patterns.length} patterns scanned for ${tomorrowIso}, ${created} created, ${existed} existed, ${errors} errors`;
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

// Party registry sync — keeps the master-data identity registry (parties /
// party_links) current as new entity rows are created. backfillCompany is
// idempotent and only processes rows not yet linked, so this is cheap after
// the initial backfill. Eventually-consistent (daily) by design; no per-create
// hooks needed across the 9 silo tables. See lib/partyService.ts.
async function partyRegistrySync(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let linked = 0;
  for (const c of companies) {
    try {
      const results = await backfillCompany(c.id);
      linked += results.reduce((a, r) => a + r.linked, 0);
    } catch (e) {
      logger.error(e, `[party_registry_sync] company ${c.id} failed`);
    }
  }
  return `synced ${companies.length} companies · ${linked} new party link(s)`;
}

/** Lot expiry alerts (migration 173): for every active lot whose expiry
 *  falls inside one of the warehouse's expiryAlertDays thresholds, insert one
 *  lot_expiry_alerts row per (lot, threshold) — the UNIQUE constraint is the
 *  idempotency gate — and notify the company manager. */
export async function warehouseLotExpiryAlerts(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let alerted = 0;
  for (const company of companies) {
    const due = await rawQuery<Record<string, any>>(
      `SELECT l.id AS "lotId", l."lotNumber", l."expiryDate", p.name AS "productName",
              t.threshold::int AS "thresholdDays",
              (l."expiryDate" - CURRENT_DATE)::int AS "daysLeft"
       FROM warehouse_stock_lots l
       JOIN warehouse_products p ON p.id = l."productId"
       JOIN warehouses w ON w.id = l."warehouseId" AND w."deletedAt" IS NULL
       CROSS JOIN LATERAL jsonb_array_elements_text(w."expiryAlertDays") AS t(threshold)
       WHERE l."companyId" = $1 AND l."deletedAt" IS NULL AND l.status = 'active'
         AND l."expiryDate" IS NOT NULL
         AND l."expiryDate" <= CURRENT_DATE + (t.threshold || ' days')::interval
         AND l."expiryDate" >= CURRENT_DATE
         AND NOT EXISTS (
           SELECT 1 FROM lot_expiry_alerts a
           WHERE a."lotId" = l.id AND a."thresholdDays" = t.threshold::int
         )`,
      [company.id]
    );
    const [mainBranch] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 AND status='active' ORDER BY id ASC LIMIT 1`,
      [company.id]
    );
    for (const d of due) {
      await rawExecute(
        `INSERT INTO lot_expiry_alerts ("companyId","lotId","thresholdDays","expiryDate")
         VALUES ($1,$2,$3,$4) ON CONFLICT ("lotId","thresholdDays") DO NOTHING`,
        [company.id, d.lotId, d.thresholdDays, d.expiryDate]
      );
      const mgr = mainBranch
        ? await getManagerAssignmentId(company.id, mainBranch.id).catch(() => null)
        : null;
      if (mgr) {
        await createNotification({
          companyId: company.id, assignmentId: mgr,
          type: "warehouse", title: "دفعة تقترب من انتهاء الصلاحية",
          body: `${d.productName} — دفعة ${d.lotNumber}: تنتهي خلال ${d.daysLeft} يوم`,
          priority: Number(d.daysLeft) <= 30 ? "high" : "normal",
          refType: "warehouse_stock_lots", refId: d.lotId,
          actionUrl: "/warehouse/advanced",
        }).catch((e) => logger.error(e, "[cron] lot expiry notification failed"));
      }
      alerted++;
    }
  }
  return `lot expiry: ${alerted} alert(s) fired`;
}

/** Cycle-count plan scan: open a pending cycle count per plan once per
 *  period window (weekly = ISO week, monthly = month, quarterly = quarter).
 *  An existing count for the plan's warehouse inside the current window
 *  means the plan already ran. */
export async function warehouseCycleCountPlanScan(): Promise<string> {
  const plans = await rawQuery<Record<string, any>>(
    `SELECT pl.id, pl."companyId", pl."warehouseId", pl.period, pl."planType"
     FROM warehouse_cycle_count_plans pl
     JOIN warehouses w ON w.id = pl."warehouseId" AND w."deletedAt" IS NULL`,
    []
  );
  let opened = 0;
  for (const plan of plans) {
    const trunc = plan.period === "weekly" ? "week" : plan.period === "quarterly" ? "quarter" : "month";
    const [existing] = await rawQuery<{ n: string }>(
      `SELECT COUNT(*) AS n FROM warehouse_cycle_counts
       WHERE "companyId"=$1 AND "warehouseId"=$2
         AND date_trunc($3, "scheduledDate") = date_trunc($3, CURRENT_DATE)`,
      [plan.companyId, plan.warehouseId, trunc]
    );
    if (Number(existing?.n ?? 0) > 0) continue;
    const { createCycleCountWithSnapshot } = await import("../routes/warehouse-cycle-counts.js");
    const countId = await createCycleCountWithSnapshot(
      plan.companyId, plan.warehouseId, `فُتح تلقائياً من خطة الجرد #${plan.id} (${plan.period})`
    );
    const [mainBranch] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 AND status='active' ORDER BY id ASC LIMIT 1`,
      [plan.companyId]
    );
    const mgr = mainBranch
      ? await getManagerAssignmentId(plan.companyId, mainBranch.id).catch(() => null)
      : null;
    if (mgr) {
      await createNotification({
        companyId: plan.companyId, assignmentId: mgr,
        type: "warehouse", title: "جرد دوري مجدول فُتح",
        body: `فُتح الجرد الدوري #${countId} وفق خطة ${plan.period}`,
        priority: "normal",
        refType: "warehouse_cycle_counts", refId: countId,
        actionUrl: "/warehouse/advanced",
      }).catch((e) => logger.error(e, "[cron] cycle count plan notification failed"));
    }
    opened++;
  }
  return `cycle-count plans: ${opened} count(s) opened from ${plans.length} plan(s)`;
}

/**
 * inbox_task_sla_reminder_scan — nudge the assignee of each open inbox task
 * before its slaDeadline. Per company: load the (per-company-tunable) reminder
 * config, scan pending, not-yet-breached tasks that carry an slaDeadline, and
 * fire the first reminder once the remaining window crosses the lead threshold
 * (stamping slaReminderSentAt for idempotency); optionally fire a second
 * reminder closer to the deadline (stamping slaFinalReminderSentAt). The
 * pre-breach + per-task *SentAt stamps make repeated runs idempotent.
 * Unassigned tasks are skipped. The decision itself lives in the pure
 * shouldFireSlaReminder so it is unit-tested without a DB.
 */
async function inboxTaskSlaReminderScan(): Promise<string> {
  const { resolveSettings } = await import("./settings.js");
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  const now = new Date();
  let first = 0;
  let final = 0;
  for (const company of companies) {
    const stored = await resolveSettings(TASK_SLA_REMINDER_SETTING_KEY, company.id).catch(() => undefined);
    const cfg = resolveTaskSlaReminderConfig(stored);

    const tasks = await rawQuery<{
      id: number;
      assignmentId: number | null;
      title: string;
      createdAt: string | Date;
      slaDeadline: string | Date;
      slaReminderSentAt: string | Date | null;
      slaFinalReminderSentAt: string | Date | null;
    }>(
      `SELECT id,
              COALESCE("assignmentId", "assignedTo") AS "assignmentId",
              title, "createdAt", "slaDeadline",
              "slaReminderSentAt", "slaFinalReminderSentAt"
         FROM tasks
        WHERE "companyId" = $1
          AND status = 'pending'
          AND "deletedAt" IS NULL
          AND "slaDeadline" IS NOT NULL
          AND "slaDeadline" > NOW()
          AND ("slaReminderSentAt" IS NULL OR "slaFinalReminderSentAt" IS NULL)`,
      [company.id]
      // as-any-reason: justified-pragmatic - catch fallback preserves existing empty-result behavior while satisfying route return typing
    ).catch((e) => { logger.error(e, "[cron] inbox SLA reminder scan query failed"); return [] as any[]; });

    for (const t of tasks) {
      if (!t.assignmentId) continue;
      const { firstReminder, finalReminder } = shouldFireSlaReminder({
        now,
        createdAt: new Date(t.createdAt),
        slaDeadline: new Date(t.slaDeadline),
        config: cfg,
        reminderSentAt: t.slaReminderSentAt ? new Date(t.slaReminderSentAt) : null,
        finalReminderSentAt: t.slaFinalReminderSentAt ? new Date(t.slaFinalReminderSentAt) : null,
      });
      const deadlineLabel = new Date(t.slaDeadline).toISOString().slice(0, 16).replace("T", " ");
      // Stamp FIRST as an atomic compare-and-set (WHERE …SentAt IS NULL): the
      // row that wins the stamp owns the send. This prevents a duplicate
      // reminder when two runs overlap or a previous run already stamped — at
      // the cost of dropping a reminder if the notify fails after the stamp
      // (preferring an occasional miss over spamming the assignee).
      if (firstReminder) {
        const won = await rawExecute(
          `UPDATE tasks SET "slaReminderSentAt" = NOW() WHERE id = $1 AND "slaReminderSentAt" IS NULL`,
          [t.id],
        ).then((r) => r.affectedRows === 1).catch((e) => { logger.error(e, "[cron] inbox SLA reminder stamp failed"); return false; });
        if (won) {
          await createNotification({
            companyId: company.id, assignmentId: t.assignmentId,
            type: "task", title: "تذكير: مهمة تقترب من موعد الاستجابة",
            body: `المهمة «${t.title}» يقترب موعد استجابتها (${deadlineLabel}).`,
            priority: "high",
            refType: "tasks", refId: t.id,
            actionUrl: "/inbox/tasks",
          }).catch((e) => logger.error(e, "[cron] inbox SLA reminder notify failed"));
          first++;
        }
      }
      if (finalReminder) {
        const won = await rawExecute(
          `UPDATE tasks SET "slaFinalReminderSentAt" = NOW() WHERE id = $1 AND "slaFinalReminderSentAt" IS NULL`,
          [t.id],
        ).then((r) => r.affectedRows === 1).catch((e) => { logger.error(e, "[cron] inbox SLA final reminder stamp failed"); return false; });
        if (won) {
          await createNotification({
            companyId: company.id, assignmentId: t.assignmentId,
            type: "task", title: "تذكير نهائي: مهمة على وشك تجاوز الموعد",
            body: `المهمة «${t.title}» على وشك تجاوز موعد الاستجابة (${deadlineLabel}).`,
            priority: "urgent",
            refType: "tasks", refId: t.id,
            actionUrl: "/inbox/tasks",
          }).catch((e) => logger.error(e, "[cron] inbox SLA final reminder notify failed"));
          final++;
        }
      }
    }
  }
  return `inbox SLA reminders: ${first} first, ${final} final`;
}

// آلية منع التفاقم: تستنزف تلقائياً تراكم "فشل القيد المالي" غير المحلول لكل
// شركة بإعادة استدعاء الترحيل الأصلي عبر retryPostingFailure (idempotent بمفتاح
// المصدر). أي فشل قابل لإعادة المحاولة (مثل فواتير نسك التي تعطّلت بسبب رمز
// الحساب 5201/2101) يُرحَّل ويُغلق السجل تلقائياً، فلا يتضخّم الرصيد ولا يقفل
// النظام بوابة المنع المالي (postingFailuresGuard). يستثني الأنواع غير القابلة
// لإعادة المحاولة الآلية (تُعالَج يدوياً) ويعمل ضمن دفعات محدودة لكل شركة حتى لا
// يثقل قاعدة البيانات. يعمل بحدود أمان: لا يلمس السجلات المحلولة مسبقاً، ويُغلق
// السجل فقط عند نجاح الترحيل فعلياً (result.ok && result.supported).
async function financialPostingFailureAutoRetry(): Promise<string> {
  const { retryPostingFailure, UNSUPPORTED_RETRY_SOURCE_TYPES } = await import("./postingFailureRetry.js");
  const PER_COMPANY_CAP = 500; // bounded drain per run so the cron stays cheap
  const PAGE = 100;
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let totalResolved = 0, totalStillFailing = 0, totalProcessed = 0;
  let companiesTouched = 0;

  for (const company of companies) {
    let cursor = 0;
    let processedForCompany = 0;
    let resolvedForCompany = 0;
    // Walk the retryable backlog one bounded window at a time (cursor by id so
    // a head of still-failing rows can't stall later resolvable ones), capped
    // at PER_COMPANY_CAP rows per run.
    while (processedForCompany < PER_COMPANY_CAP) {
      const limit = Math.min(PAGE, PER_COMPANY_CAP - processedForCompany);
      const batch = await rawQuery<{ id: number; sourceType: string; sourceId: number | null }>(
        `SELECT id, "sourceType", "sourceId" FROM financial_posting_failures
          WHERE "companyId" = $1 AND resolved = false AND id > $2
            AND "sourceType" <> ALL($3::text[])
            AND "sourceId" IS NOT NULL AND "sourceId" > 0
          ORDER BY id ASC LIMIT $4`,
        [company.id, cursor, UNSUPPORTED_RETRY_SOURCE_TYPES as unknown as string[], limit],
      );
      if (batch.length === 0) break;

      for (const f of batch) {
        cursor = f.id;
        processedForCompany++;
        totalProcessed++;
        // userId 0 = النظام (آلية تلقائية) — مطابق لنمط resolvedBy في المهام الآلية.
        const result = await retryPostingFailure(
          { companyId: company.id, branchId: 0, userId: 0 },
          { sourceType: f.sourceType, sourceId: f.sourceId },
        );
        if (result.ok && result.supported) {
          await rawExecute(
            `UPDATE financial_posting_failures SET resolved = true, "resolvedAt" = NOW(), "resolvedBy" = 0
              WHERE id = $1 AND "companyId" = $2 AND resolved = false`,
            [f.id, company.id],
          );
          resolvedForCompany++;
          totalResolved++;
        } else if (result.supported) {
          totalStillFailing++;
        }
      }
      if (batch.length < limit) break;
    }
    if (resolvedForCompany > 0 || processedForCompany > 0) companiesTouched++;
  }

  return `financial_posting_failure_auto_retry: processed ${totalProcessed} across ${companiesTouched} company(ies) — resolved ${totalResolved}, stillFailing ${totalStillFailing}`;
}

// متابعة النقل بالصور (PR2): ينشئ طلب فحص يومي «pending» لكل مركبة مُسنَدة لسائق
// لم يُنشأ لها طلب اليوم بعد، ويذكّر السائق (عبر تكليف موظفه النشط). يفي السائق
// الطلب من بوابته (POST /fleet/me/inspections/:id/submit + رفع الصور).
export async function generateDailyInspectionRequests(): Promise<string> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let created = 0;
  let notified = 0;
  for (const company of companies) {
    const rows = await rawQuery<{
      vehicleId: number; branchId: number | null; driverId: number;
      plateNumber: string | null; assignmentId: number | null;
    }>(
      `SELECT v.id AS "vehicleId", v."branchId", d.id AS "driverId",
              v."plateNumber", ea.id AS "assignmentId"
         FROM fleet_vehicles v
         JOIN fleet_drivers d ON d.id = v."assignedDriverId" AND d."deletedAt" IS NULL
         LEFT JOIN employee_assignments ea
           ON ea."employeeId" = d."employeeId" AND ea.status = 'active'
        WHERE v."companyId" = $1 AND v."deletedAt" IS NULL
          AND v."assignedDriverId" IS NOT NULL
          AND v.status IN ('available','in_use')
          AND NOT EXISTS (
            SELECT 1 FROM fleet_vehicle_inspections i
             WHERE i."vehicleId" = v.id AND i."inspectionType" = 'daily'
               AND i."dueDate" = CURRENT_DATE AND i."deletedAt" IS NULL
          )`,
      [company.id],
    ).catch((e) => { logger.error(e, "[cronScheduler] daily-inspection query failed"); return [] as any[]; });

    for (const r of rows) {
      const { insertId } = await rawExecute(
        `INSERT INTO fleet_vehicle_inspections
           ("companyId","branchId","vehicleId","driverId","inspectionType","status","dueDate","capturedByRole")
         VALUES ($1,$2,$3,$4,'daily','pending',CURRENT_DATE,'driver')`,
        [company.id, r.branchId ?? null, r.vehicleId, r.driverId],
      ).catch((e) => { logger.error(e, "[cronScheduler] daily-inspection insert failed"); return { insertId: 0 } as any; });
      if (!insertId) continue;
      created++;
      if (r.assignmentId) {
        await createNotification({
          companyId: company.id, assignmentId: r.assignmentId,
          type: "fleet_daily_inspection", priority: "normal",
          title: "تذكير: تصوير عداد المركبة اليومي",
          body: `يرجى تصوير عداد المركبة ${r.plateNumber ?? r.vehicleId} وحالتها لليوم.`,
          refType: "fleet_vehicle_inspections", refId: insertId,
          actionUrl: `/fleet/me/inspections/${insertId}`,
        }).catch((e) => logger.error(e, "[cronScheduler] daily-inspection notify failed"));
        notified++;
      }
    }
  }
  return `fleet_daily_inspection_requests: created ${created} daily request(s); notified ${notified} driver(s)`;
}

// أجر السائق بالساعة (الدفعة 1) — تسوية ليلية: تشتقّ ساعات «أمس» لكل سائق له
// جلسات ملاحة ذلك اليوم. تكمّل خطّاف إنهاء الجلسة (الذي يشتقّ فورًا) فتلتقط أي
// يوم فات. الاشتقاق idempotent: يحدّث الصفوف pending فقط ولا يمسّ المعتمدة.
// فاعل نظام (userId=0) — لا يكتب الدفتر ولا الأجر، تشغيلي بحت.
async function reconcileDriverWorkHours(): Promise<string> {
  const { upsertDerivedDriverHours } = await import("./fleet/driverHours.js");
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let derived = 0;
  for (const company of companies) {
    const pairs = await rawQuery<{ driverId: number; day: string }>(
      `SELECT DISTINCT "driverId", to_char("startedAt", 'YYYY-MM-DD') AS day
         FROM driver_navigation_sessions
        WHERE "companyId" = $1
          AND "startedAt" >= (CURRENT_DATE - INTERVAL '1 day')
          AND "startedAt" <  CURRENT_DATE
          AND status <> 'cancelled'`,
      [company.id],
    );
    for (const p of pairs) {
      try {
        await upsertDerivedDriverHours(
          { companyId: company.id, branchId: null, userId: 0, activeAssignmentId: null },
          p.driverId,
          p.day,
        );
        derived++;
      } catch (e) {
        logger.warn({ err: e, companyId: company.id, driverId: p.driverId }, "[cron] driver-hours derive failed");
      }
    }
  }
  return `fleet_driver_hours_reconcile: derived ${derived} driver-day hour row(s)`;
}

const JOB_DEFINITIONS: CronJobDef[] = [
  { name: "fleet_driver_hours_reconcile", description: "تسوية ليلية لاشتقاق ساعات قيادة/توقف السائق من جلسات الملاحة (أساس الأجر بالساعة، الدفعة 1)", schedule: "30 1 * * *", handler: reconcileDriverWorkHours },
  { name: "fleet_daily_inspection_requests", description: "إنشاء طلب فحص يومي (تصوير عداد + حالة) لكل مركبة مُسنَدة لسائق + تذكير السائق", schedule: "0 6 * * *", handler: generateDailyInspectionRequests },
  { name: "financial_posting_failure_auto_retry", description: "آلية منع التفاقم — إعادة ترحيل تراكم فشل القيد المالي تلقائياً وإغلاق السجلات الناجحة لكل شركة", schedule: "*/15 * * * *", handler: financialPostingFailureAutoRetry },
  { name: "inbox_task_sla_reminder_scan", description: "تذكير المسؤولين بمهام صندوق الوارد قبل تجاوز موعد الاستجابة (SLA)", schedule: "*/15 * * * *", handler: inboxTaskSlaReminderScan },
  { name: "warehouse_lot_expiry_alerts", description: "تنبيهات انتهاء صلاحية دفعات المستودع (عتبات المستودع)", schedule: "10 6 * * *", handler: warehouseLotExpiryAlerts },
  { name: "warehouse_cycle_count_plan_scan", description: "فتح الجرد الدوري المستحق وفق خطط الجرد", schedule: "15 6 * * *", handler: warehouseCycleCountPlanScan },
  { name: "party_registry_sync", description: "مزامنة سجل الأطراف (Party) — ربط الكيانات الجديدة", schedule: "30 3 * * *", handler: partyRegistrySync },
  { name: "gov_expiry_alerts", description: "تنبيهات انتهاء الإقامات والاستمارات (مقيم/تم)", schedule: "0 7 * * *", handler: govExpiryAlerts },
  { name: "document_expiry_alerts", description: "تنبيهات انتهاء وثائق الموظفين", schedule: "0 6 * * *", handler: documentExpiryAlerts },
  { name: "contract_expiry_alerts", description: "تنبيهات انتهاء العقود", schedule: "0 6 * * *", handler: contractExpiryAlerts },
  { name: "fleet_status_check", description: "فحص حالة الأسطول", schedule: "0 6 * * *", handler: fleetStatusCheck },
  // TA-GAP-09 Phase 3 — maps usage threshold alert sweep (kicks at 80%
  // warning and 100% critical of the operator-set cap). Runs every
  // 15 minutes so a sudden burst escalates within a quarter-hour;
  // dedupe is enforced by the unique constraint on the alerts table.
  { name: "maps_usage_threshold_alerts", description: "تنبيهات تجاوز عتبة استهلاك الخرائط (TA-GAP-09 Phase 3)", schedule: "*/15 * * * *", handler: mapsUsageThresholdAlerts },
  { name: "vehicle_maintenance_schedule_scan", description: "فحص جداول الصيانة الوقائية المستحقّة (بالتاريخ أو العداد) وإطلاق التنبيهات/الالتزامات", schedule: "0 6 * * *", handler: scanVehicleMaintenanceSchedules },
  { name: "fleet_telematics_retention", description: "تنظيف بيانات Telematics القديمة (مواقع + سجلات مزامنة + جلسات بث منتهية)", schedule: "0 3 * * *", handler: fleetTelematicsRetention },
  { name: "fleet_telematics_heartbeat", description: "كشف الأجهزة غير المتصلة بناءً على آخر موقع", schedule: "*/2 * * * *", handler: fleetTelematicsHeartbeat },
  { name: "fleet_telematics_poll", description: "Auto-poll للمواقع من CMSV6 لكل تكامل نشط (مع retry + circuit breaker)", schedule: "* * * * *", handler: fleetTelematicsPoll },
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
  { name: "umrah_daily_auto_penalty_generation", description: "توليد تلقائي لغرامات التأخر للشركات المفعّلة (umrah.auto_penalty.enabled)", schedule: "0 7 * * *", handler: umrahDailyAutoPenaltyGeneration },
  { name: "umrah_departure_reminder_notify", description: "إشعار داخلي للمدير: معتمر يصل غدًا (umrah.notify.departure_reminder)", schedule: "0 18 * * *", handler: umrahDepartureReminderSms },
  { name: "umrah_overstay_warning_notify", description: "إشعار داخلي للمدير: معتمر تجاوز مدة الإقامة (umrah.notify.overstay_warning)", schedule: "0 10 * * *", handler: umrahOverstayWarningSms },
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
  // ملف 04 §تنبيهات الأسطول — تنبيه استبدال محتمل (3+ أعطال/شهر).
  // يومي صباحًا 06:30 ليصل اليوم الذي يقع فيه العطل الثالث (idempotent
  // عبر fleet_replacement_alerts: مرّة واحدة لكل مركبة لكل شهر تقويمي).
  { name: "daily_vehicle_replacement_check", description: "تنبيه استبدال محتمل (3+ أعطال/شهر)", schedule: "30 6 * * *", handler: dailyVehicleReplacementCheck },
  // ملف 04 §تنبيهات الأسطول — تنبيه تقييم سائق (سمعة <60، يعادل <3/5).
  // يومي صباحًا 06:45 (بعد replacement check بـ 15د). idempotent عبر
  // fleet_driver_evaluation_alerts: مرّة واحدة لكل سائق لكل شهر تقويمي.
  { name: "daily_driver_evaluation_check", description: "تنبيه تقييم سائق (سمعة <60، اجتماع تقييم)", schedule: "45 6 * * *", handler: dailyDriverEvaluationCheck },
  // ملف 04 §تنبيهات الأسطول — تجاوز السرعة (مقارنة بـ vehicle_speed_limits).
  // يومي 07:00 يفحص قراءات اليوم السابق. idempotent يومي عبر
  // fleet_speed_violation_alerts: مرّة واحدة لكل مركبة لكل يوم تقويمي.
  { name: "daily_speed_violation_check", description: "تنبيه تجاوز السرعة (يومي، حسب vehicle_speed_limits)", schedule: "0 7 * * *", handler: dailySpeedViolationCheck },
  { name: "weekly_crm_report", description: "تقرير CRM الأسبوعي", schedule: "0 8 * * 0", handler: weeklyCrmReport },
  { name: "weekly_cash_flow", description: "فحص التدفق النقدي الأسبوعي", schedule: "0 9 * * 1", handler: weeklyCashFlowCheck },
  { name: "weekly_property_revenue", description: "إيرادات عقارية أسبوعية", schedule: "0 9 * * 1", handler: weeklyPropertyRevenue },
  { name: "weekly_client_classification", description: "تصنيف العملاء الأسبوعي", schedule: "0 2 * * 0", handler: weeklyClientClassification },
  // HR-009 / #1799 priority #10 — scoring cron entries.
  // Weekly runs at 03:00 every Monday (1 day after the weekly client
  // classification, so the week's data has settled). Monthly runs at
  // 04:00 on the 1st so dashboards show the prior month's score on
  // day 1.
  { name: "weekly_employee_scoring", description: "حساب درجات الموظف الأسبوعية + إشاراتها", schedule: "0 3 * * 1", handler: weeklyEmployeeScoring },
  { name: "monthly_employee_scoring", description: "حساب درجات الموظف الشهرية + إشاراتها", schedule: "0 4 1 * *", handler: monthlyEmployeeScoring },
  { name: "monthly_inventory_audit", description: "جرد المخزون الشهري", schedule: "0 6 1 * *", handler: monthlyInventoryAudit },
  { name: "monthly_auto_depreciation", description: "إهلاك الأصول الثابتة التلقائي", schedule: "0 6 2 * *", handler: monthlyAutoDepreciation },
  { name: "monthly_hr_accruals", description: "استحقاقات الموارد البشرية الشهرية التلقائية (إجازات + نهاية الخدمة) — idempotent عبر مرجع الفترة المشترك", schedule: "0 6 3 * *", handler: monthlyHrAccruals },
  { name: "monthly_bad_debt_provision", description: "مخصّص الديون المشكوك فيها الشهري التلقائي (delta-to-target) — يرحّل فرق الهدف بالتقادم، idempotent عبر مرجع الفترة المشترك", schedule: "0 6 4 * *", handler: monthlyBadDebtProvision },
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
  { name: "retirement_age_alert", description: "تنبيه اقتراب سن التقاعد (180/90/30/7/0 يوم)", schedule: "0 7 * * *", handler: retirementAgeAlerts },
  { name: "saudization_monthly_snapshot", description: "لقطة شهرية للسعودة (نطاقات)", schedule: "0 2 1 * *", handler: saudizationMonthlySnapshotCron },
  { name: "abc_monthly_classification", description: "تصنيف ABC الشهري للمنتجات (Pareto)", schedule: "0 3 1 * *", handler: abcMonthlyClassificationCron },
  { name: "sms_queue_worker", description: "معالجة قائمة انتظار الرسائل النصية", schedule: "* * * * *", handler: processSmsQueue },
  { name: "whatsapp_queue_worker", description: "معالجة قائمة انتظار واتساب", schedule: "* * * * *", handler: processWhatsAppQueue },
  // Phase 2.x live sync — polls Microsoft 365 / IMAP mailboxes every
  // 5 minutes for new inbound messages. Frequency was picked to balance
  // freshness against Graph API rate limits (Microsoft caps delta queries
  // at ~10k requests / 10 min per app — 10 mailboxes × 12 polls/hr = 120/hr).
  { name: "mailbox_sync_worker", description: "مزامنة صناديق البريد المتصلة (Microsoft 365 / IMAP)", schedule: "*/5 * * * *", handler: processMailboxSync },
  { name: "weekly_logs_archiving", description: "أرشفة السجلات القديمة أسبوعياً", schedule: "0 3 * * 0", handler: weeklyLogsArchiving },
  { name: "scheduled_reports_runner", description: "إرسال التقارير المجدولة", schedule: "0 * * * *", handler: runScheduledReports },
  { name: "notification_fallback_chains", description: "معالجة سلاسل التصعيد للإشعارات الفاشلة", schedule: "*/2 * * * *", handler: processFallbackChains },
  { name: "weekly_vendor_contract_expiry", description: "تنبيه انتهاء عقود الموردين (90/30 يوم)", schedule: "0 7 * * 1", handler: vendorContractExpiryAlerts },
  { name: "daily_system_health_report", description: "تقرير صحة النظام اليومي للمدير التقني", schedule: "0 6 * * *", handler: dailySystemHealthReport },
  { name: "weekly_data_cleanup", description: "تنظيف البيانات المؤقتة وأرشفة السجلات القديمة", schedule: "0 3 * * 0", handler: weeklyDataCleanup },
  { name: "retry_stuck_official_letters", description: "إعادة محاولة إرسال الخطابات المعتمدة العالقة", schedule: "*/15 * * * *", handler: retryStuckOfficialLetters },
  { name: "daily_recurring_journals", description: "تنفيذ القيود المحاسبية الدورية المستحقة", schedule: "0 1 * * *", handler: processDueRecurringJournals },
  { name: "monthly_prepaid_amortization", description: "إطفاء المصروفات المدفوعة مقدماً المستحقة شهرياً", schedule: "0 2 1 * *", handler: processDueAmortizations },
  { name: "monthly_deferred_revenue_recognition", description: "تحقّق الإيرادات المؤجلة المستحقة شهرياً", schedule: "0 2 1 * *", handler: processDueRecognitions },
  { name: "hourly_obligations_scan", description: "فحص الالتزامات — ترقية المتأخرات وتصعيد المهام", schedule: "15 * * * *", handler: hourlyObligationsScan },
  { name: "daily_dunning_auto_send", description: "إرسال تلقائي لخطابات التحصيل حسب المرحلة", schedule: "0 9 * * *", handler: dailyDunningAutoSend },
  { name: "monthly_bad_debt_reminder", description: "تذكير CFO باحتساب مخصص الديون المشكوك فيها", schedule: "0 9 1 * *", handler: monthlyBadDebtReminder },
  { name: "monthly_fx_revaluation_compute", description: "حساب إعادة تقييم العملات تلقائيًّا وإدراجها في طابور الترحيل (لا ترحيل GL تلقائي — idempotent) قبل تذكير CFO", schedule: "0 8 28 * *", handler: monthlyFxRevaluationCompute },
  { name: "monthly_fx_revaluation_reminder", description: "تذكير CFO بترحيل إعادة تقييم العملات", schedule: "0 9 28 * *", handler: monthlyFxRevaluationReminder },
  { name: "daily_budget_variance_alert", description: "تنبيه تجاوز الميزانية اليومي", schedule: "0 10 * * *", handler: dailyBudgetVarianceAlert },
  { name: "rate_limit_fallback_alert", description: "تنبيه عند انتقال حدود الطلبات إلى الذاكرة المحلية (Redis fallback)", schedule: "*/2 * * * *", handler: rateLimitFallbackAlertCheck },
  { name: "rbac_v2_expired_grants_cleanup", description: "تنظيف منح RBAC v2 منتهية الصلاحية", schedule: "0 3 * * *", handler: rbacV2ExpiredGrantsCleanup },
  { name: "pbx_stt_queue_drain", description: "تفريغ طابور تحويل التسجيلات إلى نصوص + توليد ملخّص AI", schedule: "*/2 * * * *", handler: pbxSttQueueDrain },
  { name: "thread_snooze_wake", description: "تنبيه المستخدم بإعادة فتح المحادثات المؤجَّلة عند موعدها", schedule: "* * * * *", handler: threadSnoozeWake },
  // #2079 TA-T18-02 — closes the misleading "by the daily cron" promise
  // in transport-route-patterns.ts. 06:30 Riyadh = 03:30 UTC.
  { name: "materialise_due_route_patterns", description: "تجسيد قوالب رحلات الحمولة المتكررة المستحقّة للغد (للشركات المفعّل لديها autoMaterialiseEnabled)", schedule: "30 3 * * *", handler: materialiseDueRoutePatterns },
];

/**
 * Drain the PBX transcript queue. Each tick processes up to 5 pending
 * recordings to keep the cron run bounded; the next tick picks up
 * anything left. When a transcript completes, this same handler also
 * generates the AI summary so the operator UI shows both as soon as
 * possible. STT/summarisation cost flows through recordAiUsage so it
 * lands in /admin/observability.
 */
async function pbxSttQueueDrain(): Promise<string> {
  const MAX_PER_TICK = 5;
  let processed = 0;
  let summarised = 0;
  for (let i = 0; i < MAX_PER_TICK; i++) {
    const result = await runPendingTranscription();
    if (!result) break;
    processed++;
    if (result.status !== "completed") continue;

    // Just-completed transcript → auto-summarise. Read the transcript
    // text + companyId, pipe to the existing aiEngine.summarizerSummarize.
    const [row] = await rawQueryShared<{ id: number; transcript: string | null; companyId: number }>(
      `SELECT id, transcript, "companyId" FROM pbx_call_transcripts
        WHERE "callId" = $1 AND status = 'completed' AND summary IS NULL`,
      [result.callId],
    );
    if (!row || !row.transcript) continue;
    try {
      const summary = await aiEngine.summarizerSummarize(
        row.transcript,
        300,
        { companyId: row.companyId, userId: null },
      );
      await rawExecuteShared(
        `UPDATE pbx_call_transcripts
            SET summary = $1, "summarisedAt" = NOW()
          WHERE id = $2`,
        [summary, row.id],
      );
      summarised++;
    } catch {
      // Summarisation failure is non-fatal — the transcript is
      // already saved; an operator can retry from the UI.
    }
  }
  return `processed=${processed} summarised=${summarised}`;
}

/**
 * Wake due thread snoozes. Each tick picks up snoozes whose wakeAt has
 * passed, marks them woken, and (when the snooze owner has an active
 * employee assignment) drops a follow-up task into `tasks` so the
 * operator gets a real reminder — not just an inbox row that silently
 * reappears.
 *
 * Bounded at 200 rows/tick so a backlog can't blow up a single
 * heartbeat; the next minute picks up anything left.
 */
async function threadSnoozeWake(): Promise<string> {
  const due = await rawQuery<{
    id: number; companyId: number; userId: number;
    channel: string; peerAddress: string; reason: string | null;
  }>(
    `SELECT id, "companyId", "userId", channel, "peerAddress", reason
       FROM thread_snoozes
      WHERE "wokenAt" IS NULL AND "cancelledAt" IS NULL AND "wakeAt" <= NOW()
      ORDER BY "wakeAt" ASC
      LIMIT 200`,
  );
  if (due.length === 0) return "no due snoozes";

  let tasksCreated = 0;
  for (const s of due) {
    try {
      // Resolve the user's primary employee + assignment so the task
      // lands in the right tenant scope. A user without an active
      // assignment still gets the snooze woken (no orphan rows), the
      // task just isn't created.
      const [asn] = await rawQuery<{ employeeId: number; assignmentId: number; branchId: number | null }>(
        `SELECT ea."employeeId" AS "employeeId", ea.id AS "assignmentId", ea."branchId"
           FROM users u
           JOIN employee_assignments ea
             ON ea."employeeId" = u."employeeId" AND ea."companyId" = $1 AND ea.status = 'active'
          WHERE u.id = $2
          LIMIT 1`,
        [s.companyId, s.userId],
      );

      if (asn) {
        const title = `متابعة محادثة مع ${s.peerAddress}`;
        const body = s.reason
          ? `تذكير مجدول للمحادثة على قناة ${s.channel} — ${s.reason}`
          : `تذكير مجدول للمحادثة على قناة ${s.channel}`;
        await rawExecute(
          `INSERT INTO tasks
             ("companyId", "branchId", "assignedTo", "assignmentId",
              type, "refType", "refId",
              title, description, priority, status,
              "autoGenerated", "createdBy", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4,
                   'comms_followup', 'thread_snooze', $5,
                   $6, $7, 'normal', 'pending',
                   true, $3, NOW(), NOW())`,
          [
            s.companyId, asn.branchId, asn.employeeId, asn.assignmentId,
            s.id, title, body,
          ],
        );
        tasksCreated++;
      }

      await rawExecute(
        `UPDATE thread_snoozes SET "wokenAt" = NOW() WHERE id = $1`,
        [s.id],
      );
      emitEvent({
        companyId: s.companyId, userId: s.userId,
        action: "comms.thread.snooze_woken",
        entity: "thread_snoozes", entityId: s.id,
        details: JSON.stringify({ channel: s.channel, peerAddress: s.peerAddress }),
      }).catch((e) => logger.warn(e, "[event] thread.snooze_woken"));
    } catch (err) {
      logger.error(err, `[threadSnoozeWake] failed snooze ${s.id}`);
    }
  }
  return `woken=${due.length} tasksCreated=${tasksCreated}`;
}

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
  // #1354 — wire the telematics breaker into cross-replica Redis pub/sub.
  // No-ops when REDIS_URL is unset (single-replica deployments behave
  // exactly as before). When configured, this is the path that closes
  // Known Limitation #1 from the Phase 2 commit.
  void setupBreakerCoordination(telematicsBreaker).catch((err) => {
    logger.warn({ err }, "[CRON] telematics breaker coordination init failed");
  });

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

  const heartbeat = setInterval(() => { void renewCronLock(def.name); }, LOCK_HEARTBEAT_MS);
  heartbeat.unref();

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
    clearInterval(heartbeat);
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
