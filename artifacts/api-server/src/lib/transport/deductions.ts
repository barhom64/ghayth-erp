// شريحة 4 — مرشّح خصم النقص/التأخير: المنطق المشترك.
//
// يُستعمل من سطحين: المشغّل (/transport/bookings/:id/deductions) والسائق
// (/transport/dispatch-orders/:id/deduction). المبلغ: المُدخَل، وإلا يُحسب من
// معدّل مُعدّ (قياس × معدّل) — فيُبلّغ السائق بالنقص بالكيلو والنظام يحسب الريال.
//
// تشغيلي بحت — لا قيد هنا. المالية تُصدر إشعار الدائن من المرشّح (قفل الحدود).

import { z } from "zod";
import { rawQuery, rawExecute, assertInsert } from "../rawdb.js";
import { NotFoundError, ValidationError } from "../errorHandler.js";
import { createAuditLog } from "../businessHelpers.js";
import { logger } from "../logger.js";
import { resolveSettings } from "../settings.js";

export const deductionCandidateSchema = z.object({
  basis: z.enum(["weight_shortage", "delay"]),
  shortageKg: z.coerce.number().min(0).optional(),
  delayHours: z.coerce.number().min(0).optional(),
  // اختياري — يُحسب من المعدّل المُعدّ إن غاب.
  amount: z.coerce.number().positive().optional(),
  reason: z.string().min(1).max(2000),
  invoiceId: z.coerce.number().int().positive().optional(),
});
export type DeductionCandidateInput = z.infer<typeof deductionCandidateSchema>;

export interface DeductionScope {
  companyId: number;
  branchId?: number | null;
  userId: number;
  activeAssignmentId?: number | null;
}

function positiveNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** معدّلات الخصم (إعداد شركة/فرع): ريال/كغم نقص، وريال/ساعة تأخّر. */
export async function resolveDeductionRates(companyId: number, branchId?: number | null) {
  const [perKg, perHour] = await Promise.all([
    resolveSettings("fleet.deduction.shortageRatePerKg", companyId, branchId ?? undefined),
    resolveSettings("fleet.deduction.delayRatePerHour", companyId, branchId ?? undefined),
  ]);
  return { shortagePerKg: positiveNum(perKg), delayPerHour: positiveNum(perHour) };
}

/**
 * يُنشئ مرشّح خصم. يفترض أنّ المستدعي تحقّق من الصلاحية/الملكية. المبلغ:
 * المُدخَل، وإلا (قياس × المعدّل المُعدّ)؛ وإن لا معدّل ولا مبلغ → خطأ.
 */
export async function createDeductionCandidate(
  scope: DeductionScope,
  bookingId: number,
  input: DeductionCandidateInput,
): Promise<{ insertId: number; amount: number }> {
  const [booking] = await rawQuery<Record<string, unknown>>(
    `SELECT id FROM transport_bookings WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [bookingId, scope.companyId],
  );
  if (!booking) throw new NotFoundError("الحجز غير موجود");

  const measure = input.basis === "weight_shortage" ? input.shortageKg : input.delayHours;
  if (measure == null) {
    throw new ValidationError(
      input.basis === "weight_shortage" ? "نقص الوزن (كغم) مطلوب" : "ساعات التأخّر مطلوبة",
      { field: input.basis === "weight_shortage" ? "shortageKg" : "delayHours" },
    );
  }

  // المبلغ: المُدخَل، وإلا قياس × المعدّل المُعدّ. وإلا يلزم إدخاله.
  let amount = input.amount ?? null;
  if (amount == null) {
    const rates = await resolveDeductionRates(scope.companyId, scope.branchId);
    const rate = input.basis === "weight_shortage" ? rates.shortagePerKg : rates.delayPerHour;
    if (rate == null) {
      throw new ValidationError("لا معدّل خصم مُعدّ — أدخل المبلغ يدويًا", { field: "amount" });
    }
    amount = Math.round(measure * rate * 100) / 100;
  }
  if (!(amount > 0)) {
    throw new ValidationError("مبلغ الخصم يجب أن يكون موجبًا", { field: "amount" });
  }

  // الفاتورة (إن رُبطت) يجب أن تخصّ الشركة — يُقرأ فقط، لا يكتب الدفتر.
  if (input.invoiceId != null) {
    const [inv] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [input.invoiceId, scope.companyId],
    );
    if (!inv) throw new ValidationError("الفاتورة غير موجودة", { field: "invoiceId" });
  }

  const { insertId } = await rawExecute(
    `INSERT INTO transport_deduction_candidates
       ("companyId", "branchId", "bookingId", "invoiceId", basis,
        "shortageKg", "delayHours", amount, reason,
        "recordedByAssignmentId", "createdBy")
     VALUES ($1,$2,$3,$4,$5, $6,$7,$8,$9, $10,$11)`,
    [
      scope.companyId, scope.branchId ?? null, bookingId, input.invoiceId ?? null, input.basis,
      input.shortageKg ?? null, input.delayHours ?? null, amount, input.reason,
      scope.activeAssignmentId ?? null, scope.userId,
    ],
  );
  assertInsert(insertId, "transport_deduction_candidates");
  createAuditLog({
    companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
    action: "deduction_candidate_created", entity: "transport_bookings", entityId: bookingId,
    after: { deductionCandidateId: insertId, basis: input.basis, amount },
  }).catch((e) => logger.error(e, "deduction candidate audit failed"));
  return { insertId, amount };
}
