// أساس أجر السائق بالساعة — الدفعة 1 (تشغيلية بلا دفتر).
//
// الأسطول يملك «ساعات القيادة + التوقف» لكل سائق لكل يوم كواقعة تشغيلية:
//   • مشتقّة تلقائيًا من جلسات الملاحة (derived*).
//   • مُدخَلة يدويًا للتصحيح (manual*).
//   • معتمدة بشريًا (approved*) — لا تُحتسب في الراتب إلا بعد الاعتماد.
//
// **قفل الحدود:** لا معدّل أجر ولا حساب مستحق ولا قيد محاسبي هنا. المعدّل
// والأجر يملكهما مسار الموارد البشرية (الدفعتان 2-3)، ويقرأ الساعات المعتمدة
// عبر `getApprovedDriverHours` (عقد خدمة قراءة فقط يكشفه الأسطول).

import { z } from "zod";
import { rawQuery, rawExecute } from "../rawdb.js";
import { NotFoundError, ValidationError } from "../errorHandler.js";
import { createAuditLog } from "../businessHelpers.js";
import { logger } from "../logger.js";

export interface FleetScope {
  companyId: number;
  branchId?: number | null;
  userId: number;
  activeAssignmentId?: number | null;
}

// إدخال يدوي للساعات (تصحيح/استكمال التتبع). أحد الحقول على الأقل مطلوب.
export const manualHoursSchema = z
  .object({
    manualDrivingHours: z.coerce.number().min(0).max(24).optional(),
    manualStopHours: z.coerce.number().min(0).max(24).optional(),
    notes: z.string().max(2000).optional(),
  })
  .refine(
    (d) => d.manualDrivingHours != null || d.manualStopHours != null || (d.notes != null && d.notes.trim() !== ""),
    { message: "أدخل ساعة قيادة أو توقف أو ملاحظة" },
  );
export type ManualHoursInput = z.infer<typeof manualHoursSchema>;

// اعتماد الساعات — القيمة المعتمدة يقرّرها المعتمِد (قد تساوي التتبع أو اليدوي
// أو قيمة مصحّحة). هذه بوابة «لا ترحيل بلا اعتماد بشري».
export const approveHoursSchema = z.object({
  approvedDrivingHours: z.coerce.number().min(0).max(24),
  approvedStopHours: z.coerce.number().min(0).max(24),
  notes: z.string().max(2000).optional(),
});
export type ApproveHoursInput = z.infer<typeof approveHoursSchema>;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * يشتقّ ساعات القيادة/التوقف ليوم سائق من جلسات الملاحة — قراءة فقط، لا كتابة.
 *   القيادة = (وصول التحميل − الانطلاق) + (وصول التفريغ − التحميل)
 *   التوقف  = (التحميل − وصول التحميل) + (التسليم − وصول التفريغ)
 * تُجمع كل جلسات اليوم؛ GREATEST(0,…) تتجاهل التوقيتات المفقودة/المقلوبة.
 */
export async function deriveDriverHoursForDay(
  companyId: number,
  driverId: number,
  workDate: string,
): Promise<{ drivingHours: number; stopHours: number; sessions: number }> {
  const [row] = await rawQuery<{ driving: string | null; stopping: string | null; n: string }>(
    `SELECT
       COALESCE(SUM(
         GREATEST(0, EXTRACT(EPOCH FROM ("arrivedPickupAt"  - "startedAt")))  +
         GREATEST(0, EXTRACT(EPOCH FROM ("arrivedDropoffAt" - "loadedAt")))
       ), 0) / 3600.0 AS driving,
       COALESCE(SUM(
         GREATEST(0, EXTRACT(EPOCH FROM ("loadedAt"    - "arrivedPickupAt"))) +
         GREATEST(0, EXTRACT(EPOCH FROM ("deliveredAt" - "arrivedDropoffAt")))
       ), 0) / 3600.0 AS stopping,
       COUNT(*) AS n
     FROM driver_navigation_sessions
     WHERE "companyId" = $1 AND "driverId" = $2
       AND "startedAt" >= $3::date AND "startedAt" < ($3::date + INTERVAL '1 day')
       AND status <> 'cancelled'`,
    [companyId, driverId, workDate],
  );
  return {
    drivingHours: round2(Number(row?.driving ?? 0)),
    stopHours: round2(Number(row?.stopping ?? 0)),
    sessions: Number(row?.n ?? 0),
  };
}

/** يحلّ تعيين السائق في HR (يُخزَّن للترحيل لاحقًا). null إن لم يُربط بموظف. */
async function resolveDriverAssignment(
  companyId: number,
  driverId: number,
): Promise<{ id: number; branchId: number | null } | null> {
  const [r] = await rawQuery<{ id: number; branchId: number | null }>(
    `SELECT ea.id, ea."branchId"
       FROM fleet_drivers fd
       JOIN employee_assignments ea
         ON ea."employeeId" = fd."employeeId" AND ea."companyId" = fd."companyId"
      WHERE fd.id = $1 AND fd."companyId" = $2 AND fd."employeeId" IS NOT NULL
        AND ea.status = 'active'
      ORDER BY ea."isPrimary" DESC, ea.id
      LIMIT 1`,
    [driverId, companyId],
  );
  return r ?? null;
}

/**
 * يشتقّ ساعات يومٍ ويُنشئ/يحدّث صفّ الساعات (حالة pending). لا يلمس manual/approved،
 * ولا يحدّث صفًّا معتمدًا (الاعتماد مُجمّد). يُستدعى عند إنهاء جلسة + Cron ليلي.
 * يُعيد معرّف الصفّ وقيم الاشتقاق.
 */
export async function upsertDerivedDriverHours(
  scope: FleetScope,
  driverId: number,
  workDate: string,
): Promise<{ id: number; drivingHours: number; stopHours: number; frozen: boolean }> {
  const [drv] = await rawQuery<{ id: number }>(
    `SELECT id FROM fleet_drivers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [driverId, scope.companyId],
  );
  if (!drv) throw new NotFoundError("السائق غير موجود");

  const derived = await deriveDriverHoursForDay(scope.companyId, driverId, workDate);
  const assignment = await resolveDriverAssignment(scope.companyId, driverId);

  const { insertId } = await rawExecute(
    `INSERT INTO fleet_driver_work_hours
       ("companyId", "branchId", "driverId", "assignmentId", "workDate",
        "derivedDrivingHours", "derivedStopHours", "derivedSource",
        "createdByAssignmentId", "createdBy")
     VALUES ($1,$2,$3,$4,$5, $6,$7,'navigation', $8,$9)
     ON CONFLICT ("driverId", "workDate") WHERE "deletedAt" IS NULL
     DO UPDATE SET
       "derivedDrivingHours" = EXCLUDED."derivedDrivingHours",
       "derivedStopHours"    = EXCLUDED."derivedStopHours",
       "derivedSource"       = 'navigation',
       "assignmentId"        = COALESCE(fleet_driver_work_hours."assignmentId", EXCLUDED."assignmentId"),
       "updatedAt"           = NOW()
     WHERE fleet_driver_work_hours.status = 'pending'`,
    [
      scope.companyId,
      scope.branchId ?? assignment?.branchId ?? null,
      driverId,
      assignment?.id ?? null,
      workDate,
      derived.drivingHours,
      derived.stopHours,
      scope.activeAssignmentId ?? null,
      scope.userId,
    ],
  );

  // insertId=0 ⇒ إمّا تعارض على صفّ معتمد (التحديث مُتخطّى) أو لا RETURNING.
  // استرجع المعرّف الفعلي وميّز إن كان الصفّ مُجمّدًا (معتمدًا).
  let id = insertId;
  let frozen = false;
  if (!id) {
    const [existing] = await rawQuery<{ id: number; status: string }>(
      `SELECT id, status FROM fleet_driver_work_hours
        WHERE "driverId" = $1 AND "workDate" = $2 AND "deletedAt" IS NULL`,
      [driverId, workDate],
    );
    id = existing?.id ?? 0;
    frozen = existing?.status === "approved";
  }

  // التسوية الليلية (cron) تشتقّ بالجملة بفاعل نظام (userId=0) — لا تُدوّن أثرًا
  // لكل صفّ (ضجيج). الأحداث ذات المعنى للتدقيق: الاشتقاق اليدوي والتعديل والاعتماد.
  if (id && !frozen && scope.userId > 0) {
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId ?? undefined,
      userId: scope.userId,
      action: "driver_work_hours_derived",
      entity: "fleet_driver_work_hours",
      entityId: id,
      after: { driverId, workDate, ...derived, source: "navigation" },
    }).catch((e) => logger.error(e, "driver hours derive audit failed"));
  }
  return { id, drivingHours: derived.drivingHours, stopHours: derived.stopHours, frozen };
}

/** يحلّ معرّف السائق من موظفه (لعرض السائق لساعاته). null إن لم يكن سائقًا. */
export async function resolveOwnDriverId(
  scope: FleetScope,
  employeeId: number,
): Promise<number | null> {
  const [drv] = await rawQuery<{ id: number }>(
    `SELECT id FROM fleet_drivers
      WHERE "employeeId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [employeeId, scope.companyId],
  );
  return drv?.id ?? null;
}

export interface DriverHoursFilters {
  driverId?: number;
  from?: string;
  to?: string;
  status?: string;
  limit?: number;
}

/** صفوف ساعات السائق للشاشة (التتبع | اليدوي | المعتمد جنبًا لجنب). */
export async function listDriverWorkHours(scope: FleetScope, f: DriverHoursFilters) {
  const where: string[] = [`wh."companyId" = $1`, `wh."deletedAt" IS NULL`];
  const params: unknown[] = [scope.companyId];
  if (f.driverId != null) {
    params.push(f.driverId);
    where.push(`wh."driverId" = $${params.length}`);
  }
  if (f.from) {
    params.push(f.from);
    where.push(`wh."workDate" >= $${params.length}::date`);
  }
  if (f.to) {
    params.push(f.to);
    where.push(`wh."workDate" <= $${params.length}::date`);
  }
  if (f.status) {
    params.push(f.status);
    where.push(`wh.status = $${params.length}`);
  }
  const limit = Math.min(Math.max(f.limit ?? 200, 1), 500);
  return rawQuery<Record<string, unknown>>(
    `SELECT wh.id, wh."driverId", d.name AS "driverName", wh."assignmentId", wh."workDate",
            wh."derivedDrivingHours", wh."derivedStopHours", wh."derivedSource",
            wh."manualDrivingHours", wh."manualStopHours",
            wh."approvedDrivingHours", wh."approvedStopHours",
            wh.status, wh."approvedByAssignmentId", wh."approvedAt",
            wh."payrollLineId", wh.notes, wh."updatedAt"
       FROM fleet_driver_work_hours wh
       JOIN fleet_drivers d ON d.id = wh."driverId"
      WHERE ${where.join(" AND ")}
      ORDER BY wh."workDate" DESC, d.name
      LIMIT ${limit}`,
    params,
  );
}

/** يضبط الساعات اليدوية (تصحيح/استكمال). مسموح فقط لصفّ غير معتمد. */
export async function setManualDriverHours(
  scope: FleetScope,
  id: number,
  input: ManualHoursInput,
): Promise<void> {
  const [row] = await rawQuery<{ id: number; status: string }>(
    `SELECT id, status FROM fleet_driver_work_hours
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [id, scope.companyId],
  );
  if (!row) throw new NotFoundError("سجلّ الساعات غير موجود");
  if (row.status !== "pending") {
    throw new ValidationError("الصفّ معتمد — لا تُعدَّل ساعاته");
  }

  await rawExecute(
    `UPDATE fleet_driver_work_hours
        SET "manualDrivingHours" = COALESCE($1, "manualDrivingHours"),
            "manualStopHours"    = COALESCE($2, "manualStopHours"),
            notes                = COALESCE($3, notes),
            "updatedAt"          = NOW()
      WHERE id = $4 AND "companyId" = $5`,
    [
      input.manualDrivingHours ?? null,
      input.manualStopHours ?? null,
      input.notes?.trim() ? input.notes.trim() : null,
      id,
      scope.companyId,
    ],
  );
  createAuditLog({
    companyId: scope.companyId,
    branchId: scope.branchId ?? undefined,
    userId: scope.userId,
    action: "driver_work_hours_manual_set",
    entity: "fleet_driver_work_hours",
    entityId: id,
    after: {
      manualDrivingHours: input.manualDrivingHours ?? null,
      manualStopHours: input.manualStopHours ?? null,
    },
  }).catch((e) => logger.error(e, "driver hours manual audit failed"));
}

/**
 * يعتمد الساعات (بوابة «لا ترحيل بلا اعتماد بشري»). يقرّر المعتمِد القيمة
 * المعتمدة (قياديًا/توقفًا). صلاحية الاعتماد منفصلة عن الإدخال (فصل المهام).
 */
export async function approveDriverWorkHours(
  scope: FleetScope,
  id: number,
  input: ApproveHoursInput,
): Promise<void> {
  const [row] = await rawQuery<{ id: number; status: string }>(
    `SELECT id, status FROM fleet_driver_work_hours
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [id, scope.companyId],
  );
  if (!row) throw new NotFoundError("سجلّ الساعات غير موجود");
  if (row.status === "approved") throw new ValidationError("الصفّ معتمد سلفًا");
  if (row.status !== "pending") throw new ValidationError("لا يمكن اعتماد هذا الصفّ");

  const { affectedRows } = await rawExecute(
    `UPDATE fleet_driver_work_hours
        SET status                 = 'approved',
            "approvedDrivingHours" = $1,
            "approvedStopHours"    = $2,
            "approvedByAssignmentId" = $3,
            "approvedAt"           = NOW(),
            notes                  = COALESCE($4, notes),
            "updatedAt"            = NOW()
      WHERE id = $5 AND "companyId" = $6 AND status = 'pending'`,
    [
      input.approvedDrivingHours,
      input.approvedStopHours,
      scope.activeAssignmentId ?? null,
      input.notes?.trim() ? input.notes.trim() : null,
      id,
      scope.companyId,
    ],
  );
  if (!affectedRows) throw new ValidationError("تعذّر الاعتماد — قد يكون الصفّ تغيّر");

  createAuditLog({
    companyId: scope.companyId,
    branchId: scope.branchId ?? undefined,
    userId: scope.userId,
    action: "driver_work_hours_approved",
    entity: "fleet_driver_work_hours",
    entityId: id,
    after: {
      approvedDrivingHours: input.approvedDrivingHours,
      approvedStopHours: input.approvedStopHours,
    },
  }).catch((e) => logger.error(e, "driver hours approve audit failed"));
}

/**
 * عقد خدمة قراءة فقط يكشفه الأسطول للموارد البشرية (الدفعة 3): مجموع الساعات
 * **المعتمدة وغير المُستهلكة** لتعيين في فترة. الأسطول يملك هذا الحساب؛ HR
 * يستهلكه ويضرب بمعدّلاته. لا يكتب أي شيء.
 */
export async function getApprovedDriverHours(
  companyId: number,
  assignmentId: number,
  from: string,
  to: string,
): Promise<{ drivingHours: number; stopHours: number; rowIds: number[] }> {
  const rows = await rawQuery<{ id: number; d: string | null; s: string | null }>(
    `SELECT id,
            COALESCE("approvedDrivingHours", 0) AS d,
            COALESCE("approvedStopHours", 0)    AS s
       FROM fleet_driver_work_hours
      WHERE "companyId" = $1 AND "assignmentId" = $2
        AND status = 'approved' AND "payrollLineId" IS NULL
        AND "deletedAt" IS NULL
        AND "workDate" >= $3::date AND "workDate" <= $4::date`,
    [companyId, assignmentId, from, to],
  );
  let drivingHours = 0;
  let stopHours = 0;
  const rowIds: number[] = [];
  for (const r of rows) {
    drivingHours += Number(r.d ?? 0);
    stopHours += Number(r.s ?? 0);
    rowIds.push(r.id);
  }
  return { drivingHours: round2(drivingHours), stopHours: round2(stopHours), rowIds };
}

export interface PeriodDriverHours {
  assignmentId: number;
  drivingHours: number;
  stopHours: number;
  rowIds: number[];
}

/**
 * عقد دفعة 3 (batch): الساعات المعتمدة غير المُستهلكة لكل تعيين سائق في فترة
 * (YYYY-MM). يستهلكه مسيّر الرواتب مرة واحدة (يتجنّب N+1). نطاق الشهر يُحسب في
 * SQL (لا new Date) فلا انجراف توقيت ولا تاريخ غير صالح. الأسطول يملك الحساب.
 */
export async function getApprovedDriverHoursForPeriod(
  companyId: number,
  period: string,
): Promise<PeriodDriverHours[]> {
  const rows = await rawQuery<{ assignmentId: number; d: string | null; s: string | null; rowIds: number[] }>(
    `SELECT "assignmentId",
            COALESCE(SUM("approvedDrivingHours"), 0) AS d,
            COALESCE(SUM("approvedStopHours"), 0)    AS s,
            array_agg(id) AS "rowIds"
       FROM fleet_driver_work_hours
      WHERE "companyId" = $1 AND status = 'approved' AND "payrollLineId" IS NULL
        AND "deletedAt" IS NULL AND "assignmentId" IS NOT NULL
        AND "workDate" >= ($2 || '-01')::date
        AND "workDate" <  (($2 || '-01')::date + INTERVAL '1 month')
      GROUP BY "assignmentId"`,
    [companyId, period],
  );
  return rows.map((r) => ({
    assignmentId: Number(r.assignmentId),
    drivingHours: round2(Number(r.d ?? 0)),
    stopHours: round2(Number(r.s ?? 0)),
    rowIds: (r.rowIds ?? []).map(Number),
  }));
}

/**
 * يختم صفوف الساعات بـ payrollLineId بعد ترحيلها في المسيّر (منع الازدواج).
 * كتابة جدول الأسطول تعيش هنا (المكتبة)، يستدعيها مسيّر HR داخل معاملته —
 * فلا كتابة عابرة للنطاق من راوت HR. rawExecute ينضمّ للمعاملة الجارية (txStore).
 */
export async function markDriverHoursConsumed(
  companyId: number,
  rowIds: number[],
  payrollLineId: number,
): Promise<void> {
  if (!rowIds.length) return;
  await rawExecute(
    `UPDATE fleet_driver_work_hours
        SET "payrollLineId" = $1, "updatedAt" = NOW()
      WHERE id = ANY($2::int[]) AND "companyId" = $3
        AND status = 'approved' AND "payrollLineId" IS NULL`,
    [payrollLineId, rowIds, companyId],
  );
}
