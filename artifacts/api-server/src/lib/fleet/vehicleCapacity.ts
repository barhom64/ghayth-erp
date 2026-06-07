/**
 * #1733 Blocker #2 — vehicle capacity guard.
 *
 * Implements three of the #1733 acceptance scenarios:
 *
 *   لا يمكن إسناد حمولة أكبر من سعة المركبة إلا باستثناء موثق
 *   لا يمكن إسناد باص غير كافٍ لعدد المعتمرين إلا باستثناء موثق
 *   (الإسناد بدون استثناء يسجَّل تلقائياً في الـ Timeline)
 *
 * The contract is uniform across cargo (kg) and umrah (pax):
 *
 *   1. assertVehicleCapacity({ vehicleId, kind, amount, ... })
 *        - vehicle has the relevant capacity field NULL → soft "unknown",
 *          no block, emit a warning event so the operator knows the
 *          profile needs filling in.
 *        - vehicle capacity ≥ amount → returns { ok: true }.
 *        - vehicle capacity < amount + no overrideReason → throws
 *          ValidationError with the deficit, the field name, and the
 *          fix-it message (Arabic). Caller's transaction rolls back.
 *        - vehicle capacity < amount + overrideReason supplied → records
 *          a vehicle_capacity_overrides row, emits an "exception"
 *          event, returns { ok: true, override: true }.
 *
 * Idempotent against the same (sourceType, sourceId) via the unique
 * constraint — re-issuing the same approval no-ops.
 */

import { rawQuery, rawExecute } from "../rawdb.js";
import { emitEvent } from "../businessHelpers.js";
import { ValidationError } from "../errorHandler.js";

export type CapacityKind = "payload_kg" | "seat_count";
export type CapacitySource = "cargo_manifest" | "umrah_transport";

interface CapacityCheckInput {
  companyId: number;
  branchId: number | null;
  userId: number;
  vehicleId: number;
  kind: CapacityKind;
  amount: number;
  sourceType: CapacitySource;
  sourceId: number;
  overrideReason?: string | null;
}

export interface CapacityCheckResult {
  ok: true;
  /** True when capacity is unknown — caller proceeds but the operator should fill the profile. */
  unknown?: boolean;
  /** True when the assignment exceeded capacity and was accepted via documented exception. */
  override?: boolean;
  /** Available capacity at the moment of the check (NULL when unknown). */
  capacity?: number | null;
}

const FIELD_BY_KIND: Record<CapacityKind, string> = {
  payload_kg: "payloadKg",
  seat_count: "seatCount",
};

const LABEL_BY_KIND: Record<CapacityKind, string> = {
  payload_kg: "الحمولة (كجم)",
  seat_count: "عدد المقاعد",
};

export async function assertVehicleCapacity(
  input: CapacityCheckInput,
): Promise<CapacityCheckResult> {
  const fieldKey = FIELD_BY_KIND[input.kind];
  const [vehicle] = await rawQuery<{
    payloadKg: string | null;
    seatCount: number | null;
    vehicleType: string | null;
  }>(
    `SELECT "payloadKg", "seatCount", "vehicleType"
       FROM fleet_vehicles
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [input.vehicleId, input.companyId],
  );
  if (!vehicle) {
    // Vehicle look-up failure is the caller's existing error path; we
    // don't shadow it here.
    throw new ValidationError("المركبة غير موجودة", {
      field: "vehicleId",
      fix: "اختر مركبة صالحة قبل الإسناد",
    });
  }

  const rawCapacity =
    input.kind === "payload_kg" ? vehicle.payloadKg : vehicle.seatCount;
  const capacity = rawCapacity == null ? null : Number(rawCapacity);

  if (capacity == null) {
    // Soft warning — emit, allow. The operator's vehicle profile needs
    // completing; the system stays usable until then.
    emitEvent({
      companyId: input.companyId,
      branchId: input.branchId ?? undefined,
      userId: input.userId,
      action: "fleet.vehicle.capacity.unknown",
      entity: "fleet_vehicles",
      entityId: input.vehicleId,
      details: JSON.stringify({
        kind: input.kind,
        field: fieldKey,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
      }),
    }).catch(() => undefined);
    return { ok: true, unknown: true, capacity: null };
  }

  if (input.amount <= capacity) {
    return { ok: true, capacity };
  }

  // Over capacity. Reject unless the caller supplied a documented
  // override reason (#1733: "إلا باستثناء موثق").
  const exceededBy = +(input.amount - capacity).toFixed(2);
  if (!input.overrideReason || input.overrideReason.trim().length === 0) {
    throw new ValidationError(
      `${LABEL_BY_KIND[input.kind]} تتجاوز سعة المركبة بمقدار ${exceededBy} — السعة ${capacity}، المطلوب ${input.amount}`,
      {
        field: input.kind === "payload_kg" ? "totalWeight" : "pilgrimCount",
        fix: `اختر مركبة أكبر أو أرسل البند مع "overrideReason" يوضّح سبب التجاوز.`,
      },
    );
  }

  // Documented exception — record it. Idempotent via uq_capacity_override_source.
  await rawExecute(
    `INSERT INTO vehicle_capacity_overrides (
       "companyId", "branchId", "vehicleId",
       "sourceType", "sourceId",
       "capacityType", "vehicleCapacity", "requestedAmount", "exceededBy",
       reason, "approvedBy"
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT ("companyId", "sourceType", "sourceId") DO NOTHING`,
    [
      input.companyId,
      input.branchId,
      input.vehicleId,
      input.sourceType,
      input.sourceId,
      input.kind,
      capacity,
      input.amount,
      exceededBy,
      input.overrideReason.trim(),
      input.userId,
    ],
  );
  emitEvent({
    companyId: input.companyId,
    branchId: input.branchId ?? undefined,
    userId: input.userId,
    action: "fleet.vehicle.capacity.exception",
    entity: "vehicle_capacity_overrides",
    entityId: input.vehicleId,
    details: JSON.stringify({
      kind: input.kind,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      capacity,
      requested: input.amount,
      exceededBy,
      reason: input.overrideReason.trim(),
    }),
  }).catch(() => undefined);

  return { ok: true, override: true, capacity };
}
