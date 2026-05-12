// ============================================================================
// autoViolationEngine.ts
// محرك الرصد التلقائي للمخالفات — يفحص سجلات الحضور يومياً ويُنشئ
// مخالفات + محاضر استفسار تلقائياً لكل واقعة مكتشفة.
//
// الأنواع المدعومة:
//   1. تأخر (late)              — تسجيل حضور بعد بداية الوردية
//   2. مغادرة مبكرة (early_leave) — تسجيل انصراف قبل نهاية الوردية
//   3. غياب (absence)           — لا يوجد سجل حضور ولا إجازة معتمدة
//   4. خروج GPS (gps_out_of_range) — تسجيل حضور/انصراف خارج النطاق
//
// المحرك idempotent: لا يُكرر المخالفات إذا أُعيد تشغيله على نفس اليوم.
// ============================================================================

import { rawQuery, rawExecute } from "./rawdb.js";
import { ensureInquiryMemoForViolation, type IncidentType } from "./disciplineEngine.js";
import { createNotification, getManagerAssignmentId, emitEvent, todayISO } from "./businessHelpers.js";
import { eventBus } from "./eventBus.js";
import { logger } from "./logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// الأنواع
// ─────────────────────────────────────────────────────────────────────────────

/** نتيجة واقعة واحدة مكتشفة */
interface DetectedIncident {
  assignmentId: number;
  employeeId: number;
  employeeName: string;
  branchId: number | null;
  type: IncidentType;
  description: string;
  durationMinutes?: number;
  severity: "low" | "medium" | "high";
}

/** نتيجة تشغيل المحرك */
export interface AutoDetectionResult {
  date: string;
  companyId: number;
  detected: number;
  violationsCreated: number;
  memosCreated: number;
  skipped: number;
  errors: number;
  details: Array<{
    type: string;
    employeeName: string;
    description: string;
    violationId: number | null;
    memoCreated: boolean;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// إعدادات الرصد التلقائي لكل شركة
// ─────────────────────────────────────────────────────────────────────────────

export interface AutoDetectionSettings {
  enableLateDetection: boolean;
  enableEarlyLeaveDetection: boolean;
  enableAbsenceDetection: boolean;
  enableGpsDetection: boolean;
  lateThresholdMinutes: number;       // الحد الأدنى للتأخر (بالدقائق)
  earlyLeaveThresholdMinutes: number; // الحد الأدنى للمغادرة المبكرة
  gpsRadiusMeters: number;            // نطاق GPS المسموح
  autoCreateMemo: boolean;            // إنشاء محضر استفسار تلقائياً
  notifyEmployee: boolean;            // إشعار الموظف
  notifyManager: boolean;             // إشعار المدير المباشر
}

const DEFAULT_SETTINGS: AutoDetectionSettings = {
  enableLateDetection: true,
  enableEarlyLeaveDetection: true,
  enableAbsenceDetection: true,
  enableGpsDetection: true,
  lateThresholdMinutes: 15,
  earlyLeaveThresholdMinutes: 10,
  gpsRadiusMeters: 500,
  autoCreateMemo: true,
  notifyEmployee: true,
  notifyManager: true,
};

export async function getAutoDetectionSettings(companyId: number): Promise<AutoDetectionSettings> {
  const [row] = await rawQuery<Record<string, unknown>>(
    `SELECT value FROM system_settings
     WHERE "companyId" = $1 AND key = 'auto_violation_detection'`,
    [companyId]
  );
  if (row?.value) {
    try {
      const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (e) {
      logger.warn(e, "failed to parse auto-detection settings JSON");
      return DEFAULT_SETTINGS;
    }
  }
  return DEFAULT_SETTINGS;
}

export async function saveAutoDetectionSettings(
  companyId: number,
  settings: Partial<AutoDetectionSettings>
): Promise<void> {
  const current = await getAutoDetectionSettings(companyId);
  const merged = { ...current, ...settings };
  await rawExecute(
    `INSERT INTO system_settings ("companyId", "branchId", key, value, "updatedAt")
     VALUES ($1, NULL, 'auto_violation_detection', $2::jsonb, NOW())
     ON CONFLICT ("companyId", "branchId", key) DO UPDATE
       SET value = $2::jsonb, "updatedAt" = NOW()`,
    [companyId, JSON.stringify(merged)]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// الأوصاف العربية
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  late: "تأخر",
  early_leave: "مغادرة مبكرة",
  absence: "غياب",
  gps_out_of_range: "خروج عن النطاق الجغرافي",
};

// ─────────────────────────────────────────────────────────────────────────────
// المحرك الرئيسي
// ─────────────────────────────────────────────────────────────────────────────

/**
 * يفحص سجلات الحضور ليوم محدد ويُنشئ مخالفات + محاضر استفسار.
 * @param companyId - الشركة
 * @param targetDate - اليوم المطلوب فحصه (YYYY-MM-DD)، افتراضي = اليوم
 */
export async function runAutoDetection(
  companyId: number,
  targetDate?: string
): Promise<AutoDetectionResult> {
  const date = targetDate ?? todayISO();
  const period = date.slice(0, 7); // YYYY-MM
  const settings = await getAutoDetectionSettings(companyId);

  const result: AutoDetectionResult = {
    date,
    companyId,
    detected: 0,
    violationsCreated: 0,
    memosCreated: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  // ── فحص: هل اليوم عطلة رسمية؟ ──
  const [holiday] = await rawQuery<Record<string, unknown>>(
    `SELECT id FROM public_holidays
     WHERE "companyId" = $1 AND $2::date BETWEEN "startDate"::date AND "endDate"::date
       AND "deletedAt" IS NULL`,
    [companyId, date]
  );
  if (holiday) {
    // لا رصد في العطل الرسمية
    return result;
  }

  const incidents: DetectedIncident[] = [];

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. رصد التأخر
  // ═══════════════════════════════════════════════════════════════════════════
  if (settings.enableLateDetection) {
    const lateRecords = await rawQuery<Record<string, unknown>>(
      `SELECT a."assignmentId", ea."employeeId", ea."branchId", e.name AS "employeeName",
              a."lateMinutes", a."checkIn", a.status
       FROM attendance a
       JOIN employee_assignments ea ON ea.id = a."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ea."companyId" = $1
         AND a.date = $2::date
         AND a."lateMinutes" > $3
         AND a."deletedAt" IS NULL
         AND a.status NOT IN ('present_holiday','present_off_day','remote','on_leave')
         AND NOT EXISTS (
           SELECT 1 FROM employee_violations ev
           WHERE ev."assignmentId" = a."assignmentId"
             AND ev.type IN ('late','late_arrival')
             AND ev.period = $4
             AND ev."deletedAt" IS NULL
             AND ev.description LIKE '%' || $2 || '%'
         )`,
      [companyId, date, settings.lateThresholdMinutes, period]
    );

    for (const rec of lateRecords) {
      incidents.push({
        assignmentId: rec.assignmentId as number,
        employeeId: rec.employeeId as number,
        employeeName: rec.employeeName as string,
        branchId: rec.branchId as number | null,
        type: "late",
        description: `تأخر ${rec.lateMinutes} دقيقة عن موعد بداية الدوام بتاريخ ${date}`,
        durationMinutes: Number(rec.lateMinutes),
        severity: Number(rec.lateMinutes) > 60 ? "high" : Number(rec.lateMinutes) > 30 ? "medium" : "low",
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. رصد المغادرة المبكرة
  // ═══════════════════════════════════════════════════════════════════════════
  if (settings.enableEarlyLeaveDetection) {
    // نحتاج لحساب المغادرة المبكرة من وقت الانصراف مقابل نهاية الوردية
    const checkouts = await rawQuery<Record<string, unknown>>(
      `SELECT a."assignmentId", ea."employeeId", ea."branchId", e.name AS "employeeName",
              a."checkOut", a.status,
              COALESCE(
                (SELECT s."endTime" FROM employee_shift_assignments esa
                 JOIN shifts s ON s.id = esa."shiftId"
                 WHERE esa."assignmentId" = a."assignmentId"
                   AND (esa."endDate" IS NULL OR esa."endDate" >= $2::date)
                   AND s."deletedAt" IS NULL
                 ORDER BY esa.id DESC LIMIT 1),
                (SELECT s."endTime" FROM shifts s
                 WHERE s."companyId" = $1 AND s.status = 'active'
                   AND s."deletedAt" IS NULL
                 ORDER BY s."isDefault" DESC LIMIT 1),
                '17:00'
              ) AS "shiftEndTime"
       FROM attendance a
       JOIN employee_assignments ea ON ea.id = a."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ea."companyId" = $1
         AND a.date = $2::date
         AND a."checkOut" IS NOT NULL
         AND a."deletedAt" IS NULL
         AND a.status NOT IN ('present_holiday','present_off_day','remote','on_leave')
         AND NOT EXISTS (
           SELECT 1 FROM employee_violations ev
           WHERE ev."assignmentId" = a."assignmentId"
             AND ev.type IN ('early_leave','early_departure')
             AND ev.period = $4
             AND ev."deletedAt" IS NULL
             AND ev.description LIKE '%' || $2 || '%'
         )`,
      [companyId, date, settings.earlyLeaveThresholdMinutes, period]
    );

    for (const rec of checkouts) {
      if (!rec.checkOut || !rec.shiftEndTime) continue;
      const checkoutTime = new Date(rec.checkOut as string | Date);
      const [endH, endM] = String(rec.shiftEndTime).split(":").map(Number);
      const shiftEnd = new Date(date + "T00:00:00");
      shiftEnd.setHours(endH, endM, 0, 0);
      const diffMs = shiftEnd.getTime() - checkoutTime.getTime();
      if (diffMs <= 0) continue; // ليس مغادرة مبكرة
      const earlyMinutes = Math.floor(diffMs / 60000);
      if (earlyMinutes < settings.earlyLeaveThresholdMinutes) continue;

      incidents.push({
        assignmentId: rec.assignmentId as number,
        employeeId: rec.employeeId as number,
        employeeName: rec.employeeName as string,
        branchId: rec.branchId as number | null,
        type: "early_leave",
        description: `مغادرة مبكرة بمقدار ${earlyMinutes} دقيقة عن موعد نهاية الدوام بتاريخ ${date}`,
        durationMinutes: earlyMinutes,
        severity: earlyMinutes > 60 ? "high" : earlyMinutes > 30 ? "medium" : "low",
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. رصد الغياب
  // ═══════════════════════════════════════════════════════════════════════════
  if (settings.enableAbsenceDetection) {
    const absentees = await rawQuery<Record<string, unknown>>(
      `SELECT a."assignmentId", ea."employeeId", ea."branchId", e.name AS "employeeName"
       FROM attendance a
       JOIN employee_assignments ea ON ea.id = a."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ea."companyId" = $1
         AND a.date = $2::date
         AND a.status = 'absent'
         AND a."deletedAt" IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM hr_leave_requests lr
           WHERE lr."employeeId" = ea."employeeId" AND lr.status = 'approved'
             AND lr."deletedAt" IS NULL
             AND $2::date BETWEEN lr."startDate" AND lr."endDate"
         )
         AND NOT EXISTS (
           SELECT 1 FROM employee_violations ev
           WHERE ev."assignmentId" = a."assignmentId"
             AND ev.type = 'absence'
             AND ev."deletedAt" IS NULL
             AND ev.description LIKE '%' || $2 || '%'
         )`,
      [companyId, date]
    );

    for (const rec of absentees) {
      incidents.push({
        assignmentId: rec.assignmentId as number,
        employeeId: rec.employeeId as number,
        employeeName: rec.employeeName as string,
        branchId: rec.branchId as number | null,
        type: "absence",
        description: `غياب عن العمل بتاريخ ${date} دون إذن مسبق أو إجازة معتمدة`,
        severity: "high",
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. رصد خروج GPS (مخالفات GPS بدون محاضر)
  // ═══════════════════════════════════════════════════════════════════════════
  if (settings.enableGpsDetection) {
    const gpsViolations = await rawQuery<Record<string, unknown>>(
      `SELECT ev.id, ev."assignmentId", ea."employeeId", ea."branchId", e.name AS "employeeName",
              ev.description
       FROM employee_violations ev
       JOIN employee_assignments ea ON ea.id = ev."assignmentId"
       JOIN employees e ON e.id = ea."employeeId"
       WHERE ev."companyId" = $1
         AND ev.type = 'gps_out_of_range'
         AND ev."deletedAt" IS NULL
         AND ev."createdAt"::date = $2::date
         AND ev."inquiryMemoId" IS NULL`,
      [companyId, date]
    );

    for (const rec of gpsViolations) {
      incidents.push({
        assignmentId: rec.assignmentId as number,
        employeeId: rec.employeeId as number,
        employeeName: rec.employeeName as string,
        branchId: rec.branchId as number | null,
        type: "gps_out_of_range",
        description: (rec.description as string | null) || `خروج عن النطاق الجغرافي المسموح بتاريخ ${date}`,
        severity: "medium",
      });
    }
  }

  result.detected = incidents.length;

  // ═══════════════════════════════════════════════════════════════════════════
  // معالجة الوقائع المكتشفة
  // ═══════════════════════════════════════════════════════════════════════════
  for (const incident of incidents) {
    try {
      // ── إنشاء/استرجاع المخالفة ──
      let violationId: number | null = null;

      // لمخالفات GPS الموجودة مسبقاً
      if (incident.type === "gps_out_of_range") {
        const [existing] = await rawQuery<{ id: number }>(
          `SELECT id FROM employee_violations
           WHERE "companyId" = $1 AND "assignmentId" = $2
             AND type = 'gps_out_of_range' AND "deletedAt" IS NULL
             AND "createdAt"::date = $3::date AND "inquiryMemoId" IS NULL
           LIMIT 1`,
          [companyId, incident.assignmentId, date]
        );
        violationId = existing?.id ?? null;
      }

      // إنشاء مخالفة جديدة (للأنواع غير GPS)
      if (!violationId) {
        const { insertId } = await rawExecute(
          `INSERT INTO employee_violations
             ("companyId","assignmentId",type,description,severity,deduction,period,source)
           VALUES ($1,$2,$3,$4,$5,0,$6,'auto')
           RETURNING id`,
          [companyId, incident.assignmentId, incident.type, incident.description, incident.severity, period]
        );
        violationId = insertId;
        result.violationsCreated++;
      }

      // ── إنشاء محضر استفسار تلقائي ──
      if (settings.autoCreateMemo && violationId) {
        const memoResult = await ensureInquiryMemoForViolation({
          companyId,
          branchId: incident.branchId,
          assignmentId: incident.assignmentId,
          employeeId: incident.employeeId,
          violationId,
          incidentType: incident.type,
          incidentDate: date,
          incidentDurationMinutes: incident.durationMinutes,
          incidentDescription: incident.description,
          source: "auto",
          createdBy: null,
        });

        if (memoResult.created) {
          result.memosCreated++;

          // ── إشعار الموظف ──
          if (settings.notifyEmployee) {
            createNotification({
              companyId,
              assignmentId: incident.assignmentId,
              type: "auto_violation",
              title: `مخالفة تلقائية: ${TYPE_LABELS[incident.type] ?? incident.type}`,
              body: incident.description,
              priority: incident.severity === "high" ? "high" : "normal",
              refType: "hr_inquiry_memo",
              refId: memoResult.memoId,
            }).catch((e) => logger.error(e, "[autoViolationEngine] background task failed"));
          }

          // ── إشعار المدير ──
          if (settings.notifyManager) {
            getManagerAssignmentId(companyId, incident.branchId ?? 0)
              .then((managerId) => {
                if (managerId) {
                  createNotification({
                    companyId,
                    assignmentId: managerId,
                    type: "auto_violation_manager",
                    title: `رصد تلقائي: ${TYPE_LABELS[incident.type] ?? incident.type} — ${incident.employeeName}`,
                    body: incident.description,
                    priority: incident.severity === "high" ? "high" : "normal",
                    refType: "hr_inquiry_memo",
                    refId: memoResult.memoId,
                  }).catch((e) => logger.error(e, "[autoViolationEngine] background task failed"));
                }
              })
              .catch((e) => logger.error(e, "[autoViolationEngine] background task failed"));
          }
        }

        result.details.push({
          type: incident.type,
          employeeName: incident.employeeName,
          description: incident.description,
          violationId,
          memoCreated: memoResult.created,
        });
      } else {
        result.details.push({
          type: incident.type,
          employeeName: incident.employeeName,
          description: incident.description,
          violationId,
          memoCreated: false,
        });
      }
    } catch (err) {
      result.errors++;
      logger.error(err, `[الرصد التلقائي] خطأ في معالجة واقعة ${incident.type} للموظف ${incident.employeeName}:`);
    }
  }

  // ── تسجيل نتيجة التشغيل ──
  await logDetectionRun(result);

  // ── بث حدث ──
  if (result.detected > 0) {
    emitEvent({
      companyId, branchId: 0, userId: null,
      action: "hr.auto_detection.completed", entity: "auto_detection_log", entityId: 0,
      details: JSON.stringify({ date, detected: result.detected, memosCreated: result.memosCreated }),
    }).catch((e) => logger.error(e, "auto violation event emit failed"));
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// تشغيل لجميع الشركات
// ─────────────────────────────────────────────────────────────────────────────

export async function runAutoDetectionAllCompanies(
  targetDate?: string
): Promise<{ totalDetected: number; totalMemos: number; companies: number }> {
  const companies = await rawQuery<{ id: number }>(`SELECT id FROM companies`);
  let totalDetected = 0;
  let totalMemos = 0;

  for (const company of companies) {
    try {
      const result = await runAutoDetection(company.id, targetDate);
      totalDetected += result.detected;
      totalMemos += result.memosCreated;
    } catch (err) {
      logger.error(err, `[الرصد التلقائي] خطأ في الشركة ${company.id}:`);
    }
  }

  return { totalDetected, totalMemos, companies: companies.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// سجل عمليات الرصد
// ─────────────────────────────────────────────────────────────────────────────

async function logDetectionRun(result: AutoDetectionResult): Promise<void> {
  try {
    await rawExecute(
      `INSERT INTO auto_detection_log
         ("companyId", "targetDate", detected, "violationsCreated", "memosCreated",
          skipped, errors, details, "createdAt")
       VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8::jsonb, NOW())`,
      [
        result.companyId,
        result.date,
        result.detected,
        result.violationsCreated,
        result.memosCreated,
        result.skipped,
        result.errors,
        JSON.stringify(result.details),
      ]
    );
  } catch (err) {
    // الجدول قد لا يكون موجوداً — نُنشئه
    try {
      await rawExecute(`
        CREATE TABLE IF NOT EXISTS auto_detection_log (
          id SERIAL PRIMARY KEY,
          "companyId" INTEGER NOT NULL,
          "targetDate" DATE NOT NULL,
          detected INTEGER DEFAULT 0,
          "violationsCreated" INTEGER DEFAULT 0,
          "memosCreated" INTEGER DEFAULT 0,
          skipped INTEGER DEFAULT 0,
          errors INTEGER DEFAULT 0,
          details JSONB DEFAULT '[]',
          "createdAt" TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      await rawExecute(
        `INSERT INTO auto_detection_log
           ("companyId", "targetDate", detected, "violationsCreated", "memosCreated",
            skipped, errors, details, "createdAt")
         VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8::jsonb, NOW())`,
        [
          result.companyId, result.date, result.detected,
          result.violationsCreated, result.memosCreated,
          result.skipped, result.errors, JSON.stringify(result.details),
        ]
      );
    } catch (innerErr) {
      logger.error(innerErr, "[الرصد التلقائي] فشل تسجيل السجل:");
    }
  }
}

/**
 * استرجاع سجل عمليات الرصد التلقائي
 */
export async function getDetectionLog(
  companyId: number,
  options?: { limit?: number; offset?: number; fromDate?: string; toDate?: string }
): Promise<{ data: any[]; total: number }> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;

  let whereExtra = "";
  const params: unknown[] = [companyId];
  let paramIdx = 2;

  if (options?.fromDate) {
    whereExtra += ` AND "targetDate" >= $${paramIdx}::date`;
    params.push(options.fromDate);
    paramIdx++;
  }
  if (options?.toDate) {
    whereExtra += ` AND "targetDate" <= $${paramIdx}::date`;
    params.push(options.toDate);
    paramIdx++;
  }

  try {
    const [countRow] = await rawQuery<{ cnt: string }>(
      `SELECT COUNT(*)::int AS cnt FROM auto_detection_log WHERE "companyId" = $1 ${whereExtra}`,
      params
    );
    const total = Number(countRow?.cnt ?? 0);

    const limitParamIdx = paramIdx++;
    const offsetParamIdx = paramIdx++;
    params.push(limit, offset);

    const data = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM auto_detection_log
       WHERE "companyId" = $1 ${whereExtra}
       ORDER BY "createdAt" DESC
       LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}`,
      params
    );

    return { data, total };
  } catch (e) {
    logger.warn(e, "auto_violations table may not exist");
    return { data: [], total: 0 };
  }
}
