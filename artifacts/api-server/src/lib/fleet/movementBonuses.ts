// مكافآت حركات النقل — الدفعة أ (تشغيلية بلا دفتر).
//
// المشرف يمنح مكافأة مقطوعة لسائق على حركة (أمر توزيع)، باعتماد بشري قبل أي
// ترحيل. المبلغ مُدخَل أو من إعداد الشركة. الأسطول يملك الواقعة فقط — لا قيد
// ولا كتابة في جداول الرواتب (قفل الحدود). الموارد البشرية تستهلك المعتمد عبر
// `getApprovedMovementBonuses` في الدفعة ب.

import { z } from "zod";
import { rawQuery, rawExecute, assertInsert } from "../rawdb.js";
import { NotFoundError, ValidationError } from "../errorHandler.js";
import { createAuditLog } from "../businessHelpers.js";
import { logger } from "../logger.js";
import { resolveSettings } from "../settings.js";

export interface FleetScope {
  companyId: number;
  branchId?: number | null;
  userId: number;
  activeAssignmentId?: number | null;
}

export const awardBonusSchema = z.object({
  dispatchOrderId: z.coerce.number().int().positive(),
  // اختياري — يُؤخذ من إعداد fleet.bonus.movementDefault إن غاب.
  amount: z.coerce.number().positive().optional(),
  reason: z.string().min(1).max(2000),
});
export type AwardBonusInput = z.infer<typeof awardBonusSchema>;

export const approveBonusSchema = z.object({
  // اختياري — يسمح للمعتمِد بتعديل المبلغ عند الاعتماد.
  amount: z.coerce.number().positive().optional(),
  notes: z.string().max(2000).optional(),
});
export type ApproveBonusInput = z.infer<typeof approveBonusSchema>;

function positiveNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** المبلغ الافتراضي للمكافأة (إعداد شركة/فرع). null إن لم يُعدّ. */
export async function resolveDefaultBonusAmount(
  companyId: number,
  branchId?: number | null,
): Promise<number | null> {
  const v = await resolveSettings("fleet.bonus.movementDefault", companyId, branchId ?? undefined);
  return positiveNum(v);
}

/** يحلّ تعيين السائق في HR (للترحيل لاحقًا). null إن لم يُربط بموظف. */
async function resolveDriverAssignment(
  companyId: number,
  driverId: number,
): Promise<number | null> {
  const [r] = await rawQuery<{ id: number }>(
    `SELECT ea.id
       FROM fleet_drivers fd
       JOIN employee_assignments ea
         ON ea."employeeId" = fd."employeeId" AND ea."companyId" = fd."companyId"
      WHERE fd.id = $1 AND fd."companyId" = $2 AND fd."employeeId" IS NOT NULL
        AND ea.status = 'active'
      ORDER BY ea."isPrimary" DESC, ea.id
      LIMIT 1`,
    [driverId, companyId],
  );
  return r?.id ?? null;
}

/**
 * يمنح مكافأة على حركة (حالة pending). المبلغ: المُدخَل، وإلا الإعداد الافتراضي.
 * يفترض أن المستدعي تحقّق من الصلاحية. لا قيد هنا.
 */
export async function awardMovementBonus(
  scope: FleetScope,
  input: AwardBonusInput,
): Promise<{ insertId: number; amount: number }> {
  const [order] = await rawQuery<{ id: number; bookingId: number | null; driverId: number | null }>(
    `SELECT id, "bookingId", "driverId" FROM transport_dispatch_orders
      WHERE id = $1 AND "companyId" = $2`,
    [input.dispatchOrderId, scope.companyId],
  );
  if (!order) throw new NotFoundError("أمر التوزيع غير موجود");

  let amount = input.amount ?? null;
  if (amount == null) {
    amount = await resolveDefaultBonusAmount(scope.companyId, scope.branchId);
    if (amount == null) {
      throw new ValidationError("لا مبلغ مكافأة مُعدّ — أدخل المبلغ يدويًا", { field: "amount" });
    }
  }
  if (!(amount > 0)) throw new ValidationError("مبلغ المكافأة يجب أن يكون موجبًا", { field: "amount" });

  const assignmentId = order.driverId != null
    ? await resolveDriverAssignment(scope.companyId, order.driverId)
    : null;

  const { insertId } = await rawExecute(
    `INSERT INTO transport_movement_bonuses
       ("companyId", "branchId", "dispatchOrderId", "bookingId", "driverId",
        "assignmentId", amount, reason, "createdByAssignmentId", "createdBy")
     VALUES ($1,$2,$3,$4,$5, $6,$7,$8, $9,$10)`,
    [
      scope.companyId, scope.branchId ?? null, order.id, order.bookingId ?? null, order.driverId ?? null,
      assignmentId, amount, input.reason, scope.activeAssignmentId ?? null, scope.userId,
    ],
  );
  assertInsert(insertId, "transport_movement_bonuses");
  createAuditLog({
    companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
    action: "movement_bonus_awarded", entity: "transport_dispatch_orders", entityId: order.id,
    after: { movementBonusId: insertId, amount },
  }).catch((e) => logger.error(e, "movement bonus audit failed"));
  return { insertId, amount };
}

/** يعتمد المكافأة (بوابة بشرية، صلاحية منفصلة عن المنح). يسمح بتعديل المبلغ. */
export async function approveMovementBonus(
  scope: FleetScope,
  id: number,
  input: ApproveBonusInput,
): Promise<void> {
  const [row] = await rawQuery<{ id: number; status: string }>(
    `SELECT id, status FROM transport_movement_bonuses
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [id, scope.companyId],
  );
  if (!row) throw new NotFoundError("المكافأة غير موجودة");
  if (row.status === "approved") throw new ValidationError("المكافأة معتمدة سلفًا");
  if (row.status !== "pending") throw new ValidationError("لا يمكن اعتماد هذه المكافأة");
  if (input.amount != null && !(input.amount > 0)) {
    throw new ValidationError("مبلغ المكافأة يجب أن يكون موجبًا", { field: "amount" });
  }

  const { affectedRows } = await rawExecute(
    `UPDATE transport_movement_bonuses
        SET status = 'approved',
            amount = COALESCE($1, amount),
            "approvedByAssignmentId" = $2,
            "approvedAt" = NOW(),
            "updatedAt" = NOW()
      WHERE id = $3 AND "companyId" = $4 AND status = 'pending'`,
    [input.amount ?? null, scope.activeAssignmentId ?? null, id, scope.companyId],
  );
  if (!affectedRows) throw new ValidationError("تعذّر الاعتماد — قد تكون المكافأة تغيّرت");

  createAuditLog({
    companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
    action: "movement_bonus_approved", entity: "transport_movement_bonuses", entityId: id,
    after: { amount: input.amount ?? null },
  }).catch((e) => logger.error(e, "movement bonus approve audit failed"));
}

export interface MovementFilters {
  driverId?: number;
  search?: string;
  limit?: number;
}

/**
 * قائمة الحركات (أوامر التوزيع) المؤهَّلة للمكافأة — قراءة فقط لمنتقي الشاشة.
 * المؤهَّل: عمل فعلي (executing/completed/closed) فقط، أحدثًا أولًا، بسياق
 * السائق والمركبة والحجز والمسار، وعلامة `hasBonus` (مكافأة غير ملغاة قائمة).
 * يستبدل إدخال رقم أمر التوزيع يدويًا. لا قيد ولا كتابة.
 */
export async function listEligibleMovements(scope: FleetScope, f: MovementFilters) {
  const where: string[] = [
    `d."companyId" = $1`,
    `d.status IN ('executing','completed','closed')`,
  ];
  const params: unknown[] = [scope.companyId];
  if (f.driverId != null) {
    params.push(f.driverId);
    where.push(`d."driverId" = $${params.length}`);
  }
  const s = f.search?.trim();
  if (s) {
    params.push(`%${s}%`);
    const i = params.length;
    where.push(
      `(dr.name ILIKE $${i} OR b."bookingNumber" ILIKE $${i}` +
        ` OR b."fromLocationText" ILIKE $${i} OR b."toLocationText" ILIKE $${i})`,
    );
  }
  const limit = Math.min(Math.max(f.limit ?? 100, 1), 200);
  return rawQuery<Record<string, unknown>>(
    `SELECT d.id, d.status, d."scheduledStartAt", d."completedAt",
            d."driverId", dr.name AS "driverName",
            d."vehicleId", v."plateNumber" AS "vehiclePlate",
            b.id AS "bookingId", b."bookingNumber", b."transportServiceType",
            b."fromLocationText", b."toLocationText",
            EXISTS (
              SELECT 1 FROM transport_movement_bonuses mb
               WHERE mb."dispatchOrderId" = d.id AND mb."companyId" = d."companyId"
                 AND mb.status <> 'void' AND mb."deletedAt" IS NULL
            ) AS "hasBonus"
       FROM transport_dispatch_orders d
            JOIN transport_booking_lines l ON l.id = d."bookingLineId" AND l."deletedAt" IS NULL
            JOIN transport_bookings b      ON b.id = l."bookingId" AND b."deletedAt" IS NULL
            LEFT JOIN fleet_vehicles v ON v.id = d."vehicleId" AND v."deletedAt" IS NULL
            LEFT JOIN fleet_drivers dr ON dr.id = d."driverId" AND dr."deletedAt" IS NULL
      WHERE ${where.join(" AND ")}
      ORDER BY d."scheduledStartAt" DESC NULLS LAST
      LIMIT ${limit}`,
    params,
  );
}

export interface BonusFilters {
  status?: string;
  driverId?: number;
  dispatchOrderId?: number;
  limit?: number;
}

/** قائمة المكافآت (شاشة المشرف) مع اسم السائق وسياق الحركة. */
export async function listMovementBonuses(scope: FleetScope, f: BonusFilters) {
  const where: string[] = [`b."companyId" = $1`, `b."deletedAt" IS NULL`];
  const params: unknown[] = [scope.companyId];
  if (f.status) { params.push(f.status); where.push(`b.status = $${params.length}`); }
  if (f.driverId != null) { params.push(f.driverId); where.push(`b."driverId" = $${params.length}`); }
  if (f.dispatchOrderId != null) { params.push(f.dispatchOrderId); where.push(`b."dispatchOrderId" = $${params.length}`); }
  const limit = Math.min(Math.max(f.limit ?? 200, 1), 500);
  return rawQuery<Record<string, unknown>>(
    `SELECT b.id, b."dispatchOrderId", b."bookingId", b."driverId", d.name AS "driverName",
            b."assignmentId", b.amount, b.reason, b.status, b."approvedAt",
            b."payrollLineId", b."createdAt"
       FROM transport_movement_bonuses b
       LEFT JOIN fleet_drivers d ON d.id = b."driverId"
      WHERE ${where.join(" AND ")}
      ORDER BY b."createdAt" DESC
      LIMIT ${limit}`,
    params,
  );
}

/**
 * عقد قراءة فقط (الدفعة ب): المكافآت المعتمدة وغير المُستهلكة لتعيين سائق.
 * تُستهلك كلها في المسيّر التالي (الختم بـ payrollLineId يمنع الازدواج). HR
 * يضربها بلا معدّل (مبلغ مقطوع). لا يكتب شيئًا.
 */
export async function getApprovedMovementBonuses(
  companyId: number,
  assignmentId: number,
): Promise<{ total: number; rowIds: number[] }> {
  const rows = await rawQuery<{ id: number; amount: string | null }>(
    `SELECT id, amount FROM transport_movement_bonuses
      WHERE "companyId" = $1 AND "assignmentId" = $2
        AND status = 'approved' AND "payrollLineId" IS NULL AND "deletedAt" IS NULL`,
    [companyId, assignmentId],
  );
  let total = 0;
  const rowIds: number[] = [];
  for (const r of rows) {
    total += Number(r.amount ?? 0);
    rowIds.push(r.id);
  }
  return { total: Math.round(total * 100) / 100, rowIds };
}

export interface CompanyBonus {
  assignmentId: number;
  total: number;
  rowIds: number[];
}

/**
 * عقد قراءة (batch، الدفعة ب): كل المكافآت المعتمدة غير المُستهلكة لكل تعيين
 * في الشركة (استعلام واحد، يتجنّب N+1 في المسيّر). الأسطول يملك الحساب.
 */
export async function getApprovedMovementBonusesForCompany(
  companyId: number,
): Promise<CompanyBonus[]> {
  const rows = await rawQuery<{ assignmentId: number; total: string | null; rowIds: number[] }>(
    `SELECT "assignmentId", SUM(amount) AS total, array_agg(id) AS "rowIds"
       FROM transport_movement_bonuses
      WHERE "companyId" = $1 AND status = 'approved' AND "payrollLineId" IS NULL
        AND "deletedAt" IS NULL AND "assignmentId" IS NOT NULL
      GROUP BY "assignmentId"`,
    [companyId],
  );
  return rows.map((r) => ({
    assignmentId: Number(r.assignmentId),
    total: Math.round(Number(r.total ?? 0) * 100) / 100,
    rowIds: (r.rowIds ?? []).map(Number),
  }));
}

/**
 * يختم المكافآت المُستهلكة بـ payrollLineId بعد ترحيلها في المسيّر (منع الازدواج).
 * كتابة جدول الأسطول تعيش هنا (المكتبة)، يستدعيها مسيّر HR داخل معاملته —
 * فلا كتابة عابرة للنطاق من راوت HR. rawExecute ينضمّ للمعاملة الجارية (txStore).
 */
export async function markMovementBonusesConsumed(
  companyId: number,
  rowIds: number[],
  payrollLineId: number,
): Promise<void> {
  if (!rowIds.length) return;
  await rawExecute(
    `UPDATE transport_movement_bonuses
        SET "payrollLineId" = $1, "updatedAt" = NOW()
      WHERE id = ANY($2::int[]) AND "companyId" = $3
        AND status = 'approved' AND "payrollLineId" IS NULL`,
    [payrollLineId, rowIds, companyId],
  );
}
