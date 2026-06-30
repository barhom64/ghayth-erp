// معدّلات أجر السائق بالساعة — تملكها الموارد البشرية (الدفعة 2، بلا دفتر).
//
// صفّ افتراضي للشركة (assignmentId NULL) يُتجاوَز لكل تعيين سائق. الأقرب يفوز:
// تجاوز التعيين ← افتراضي الشركة. تُستهلك عبر `resolveDriverPayRate` في الدفعة 3
// لتحويل الساعات المعتمدة (التي يوفّرها الأسطول) إلى بند راتب.
//
// قفل الحدود: HR قائد في سياسة الأجر — لا قراءة لجداول الأسطول هنا، ولا قيد.

import { z } from "zod";
import { rawQuery, rawExecute, assertInsert } from "../rawdb.js";
import { NotFoundError, ValidationError } from "../errorHandler.js";
import { createAuditLog } from "../businessHelpers.js";
import { logger } from "../logger.js";

export interface HrScope {
  companyId: number;
  branchId?: number | null;
  userId: number;
  activeAssignmentId?: number | null;
}

export const driverPayRateSchema = z
  .object({
    // null/غائب = افتراضي الشركة؛ قيمة = تجاوز لتعيين سائق.
    assignmentId: z.coerce.number().int().positive().nullish(),
    payType: z.enum(["monthly", "hourly"]),
    drivingHourlyRate: z.coerce.number().min(0).max(10000).nullish(),
    stopHourlyRate: z.coerce.number().min(0).max(10000).nullish(),
    effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "تاريخ غير صالح").optional(),
  })
  .refine(
    (d) => d.payType === "monthly" || d.drivingHourlyRate != null || d.stopHourlyRate != null,
    { message: "حدّد معدّل القيادة أو التوقف للنوع بالساعة", path: ["drivingHourlyRate"] },
  );
export type DriverPayRateInput = z.infer<typeof driverPayRateSchema>;

function n(v: unknown): number | null {
  if (v == null || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/** يُحلّ المعدّل الفعّال لتعيين: تجاوز التعيين ← افتراضي الشركة. عقد للدفعة 3. */
export async function resolveDriverPayRate(
  companyId: number,
  assignmentId: number,
): Promise<{ payType: string; drivingHourlyRate: number | null; stopHourlyRate: number | null } | null> {
  const [row] = await rawQuery<{ payType: string; drivingHourlyRate: string | null; stopHourlyRate: string | null }>(
    `SELECT "payType", "drivingHourlyRate", "stopHourlyRate"
       FROM hr_driver_pay_rates
      WHERE "companyId" = $1 AND "isActive" = true AND "deletedAt" IS NULL
        AND ("assignmentId" = $2 OR "assignmentId" IS NULL)
      ORDER BY "assignmentId" NULLS LAST
      LIMIT 1`,
    [companyId, assignmentId],
  );
  if (!row) return null;
  return {
    payType: row.payType,
    drivingHourlyRate: n(row.drivingHourlyRate),
    stopHourlyRate: n(row.stopHourlyRate),
  };
}

export interface ResolvedRate {
  payType: string;
  drivingHourlyRate: number | null;
  stopHourlyRate: number | null;
}

/**
 * يبني محلِّل معدّلات للشركة باستعلام واحد (يتجنّب N+1 في مسيّر الرواتب).
 * يُعيد دالة: تعيين → معدّل فعّال (تجاوز التعيين ← افتراضي الشركة).
 */
export async function buildDriverRateResolver(
  companyId: number,
): Promise<(assignmentId: number) => ResolvedRate | null> {
  const rows = await rawQuery<{
    assignmentId: number | null;
    payType: string;
    drivingHourlyRate: string | null;
    stopHourlyRate: string | null;
  }>(
    `SELECT "assignmentId", "payType", "drivingHourlyRate", "stopHourlyRate"
       FROM hr_driver_pay_rates
      WHERE "companyId" = $1 AND "isActive" = true AND "deletedAt" IS NULL`,
    [companyId],
  );
  let companyDefault: ResolvedRate | null = null;
  const byAssignment = new Map<number, ResolvedRate>();
  for (const r of rows) {
    const v: ResolvedRate = {
      payType: r.payType,
      drivingHourlyRate: n(r.drivingHourlyRate),
      stopHourlyRate: n(r.stopHourlyRate),
    };
    if (r.assignmentId == null) companyDefault = v;
    else byAssignment.set(Number(r.assignmentId), v);
  }
  return (assignmentId: number) => byAssignment.get(assignmentId) ?? companyDefault;
}

/** قائمة المعدّلات: الافتراضي أولًا ثم التجاوزات (مع اسم الموظف). */
export async function listDriverPayRates(scope: HrScope) {
  return rawQuery<Record<string, unknown>>(
    `SELECT r.id, r."assignmentId", r."payType",
            r."drivingHourlyRate", r."stopHourlyRate",
            r."effectiveDate", r."isActive", r."updatedAt",
            e.name AS "employeeName", e.id AS "employeeId"
       FROM hr_driver_pay_rates r
       LEFT JOIN employee_assignments ea ON ea.id = r."assignmentId"
       LEFT JOIN employees e ON e.id = ea."employeeId"
      WHERE r."companyId" = $1 AND r."deletedAt" IS NULL
      ORDER BY r."assignmentId" NULLS FIRST, e.name`,
    [scope.companyId],
  );
}

/**
 * يضبط معدّلًا (upsert): افتراضي الشركة (assignmentId NULL) أو تجاوز تعيين.
 * يتحقّق أن التعيين يخصّ الشركة. لا يلمس الدفتر.
 */
export async function upsertDriverPayRate(
  scope: HrScope,
  input: DriverPayRateInput,
): Promise<{ id: number }> {
  const assignmentId = input.assignmentId ?? null;

  if (assignmentId != null) {
    // التعيين يجب أن يخصّ الشركة (عزل إيجاري).
    const [ea] = await rawQuery<{ id: number }>(
      `SELECT id FROM employee_assignments WHERE id = $1 AND "companyId" = $2`,
      [assignmentId, scope.companyId],
    );
    if (!ea) throw new ValidationError("التعيين غير موجود في الشركة", { field: "assignmentId" });
  }

  const params = [
    scope.companyId,
    scope.branchId ?? null,
    assignmentId,
    input.payType,
    input.drivingHourlyRate ?? null,
    input.stopHourlyRate ?? null,
    input.effectiveDate ?? null,
    scope.activeAssignmentId ?? null,
    scope.userId,
  ];

  // فرعان: الافتراضي (assignmentId NULL) يستنتج فهرس company_default؛ التجاوز
  // يستنتج فهرس assignment. التاريخ الافتراضي CURRENT_DATE عند الغياب.
  const conflict =
    assignmentId == null
      ? `("companyId") WHERE "assignmentId" IS NULL AND "deletedAt" IS NULL`
      : `("companyId", "assignmentId") WHERE "assignmentId" IS NOT NULL AND "deletedAt" IS NULL`;

  const { insertId } = await rawExecute(
    `INSERT INTO hr_driver_pay_rates
       ("companyId", "branchId", "assignmentId", "payType",
        "drivingHourlyRate", "stopHourlyRate", "effectiveDate",
        "createdByAssignmentId", "createdBy")
     VALUES ($1,$2,$3,$4, $5,$6, COALESCE($7::date, CURRENT_DATE), $8,$9)
     ON CONFLICT ${conflict}
     DO UPDATE SET
       "payType"           = EXCLUDED."payType",
       "drivingHourlyRate" = EXCLUDED."drivingHourlyRate",
       "stopHourlyRate"    = EXCLUDED."stopHourlyRate",
       "effectiveDate"     = EXCLUDED."effectiveDate",
       "isActive"          = true,
       "updatedAt"         = NOW()
     RETURNING id`,
    params,
  );
  assertInsert(insertId, "hr_driver_pay_rates");

  createAuditLog({
    companyId: scope.companyId,
    branchId: scope.branchId ?? undefined,
    userId: scope.userId,
    action: "driver_pay_rate_set",
    entity: "hr_driver_pay_rates",
    entityId: insertId,
    after: {
      assignmentId,
      payType: input.payType,
      drivingHourlyRate: input.drivingHourlyRate ?? null,
      stopHourlyRate: input.stopHourlyRate ?? null,
    },
  }).catch((e) => logger.error(e, "driver pay rate audit failed"));

  return { id: insertId };
}

/** يحذف معدّلًا منطقيًا (تجاوز تعيين عادةً؛ لا يُمنع حذف الافتراضي). */
export async function removeDriverPayRate(scope: HrScope, id: number): Promise<void> {
  const { affectedRows } = await rawExecute(
    `UPDATE hr_driver_pay_rates SET "deletedAt" = NOW(), "updatedAt" = NOW()
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [id, scope.companyId],
  );
  if (!affectedRows) throw new NotFoundError("المعدّل غير موجود");
  createAuditLog({
    companyId: scope.companyId,
    branchId: scope.branchId ?? undefined,
    userId: scope.userId,
    action: "driver_pay_rate_removed",
    entity: "hr_driver_pay_rates",
    entityId: id,
  }).catch((e) => logger.error(e, "driver pay rate remove audit failed"));
}
