/**
 * #1812 — driver rest constraint guard.
 *
 * Comment 3 made this an *enforceable* rule, not a suggestion. After
 * a driver completes a dispatch order, they must have
 * `restHoursRequired` hours of off-duty before the next assignment
 * starts. The default is 8h (per the user's spec) — but it's per-
 * driver-overridable on the driver profile.
 *
 * The check is HARD by default; an `overrideReason` flips it into a
 * documented exception that emits an audit event and proceeds. This
 * mirrors the `assertDriverEligibility` / `assertVehicleCapacity`
 * contract so callers have one mental model for all three guards.
 */

import { rawQuery } from "../rawdb.js";
import { emitEvent } from "../businessHelpers.js";
import { ConflictError } from "../errorHandler.js";

interface RestCheckInput {
  companyId: number;
  branchId: number | null;
  userId: number;
  driverId: number;
  /** ISO timestamp the next assignment is supposed to START. */
  nextAssignmentStartAt: string;
  /** When supplied, the violation is recorded as a documented exception. */
  overrideReason?: string | null;
}

export interface RestCheckResult {
  ok: true;
  /** True when this driver has no prior duty record — fresh driver. */
  fresh?: boolean;
  /** True when the assignment was accepted via documented exception. */
  override?: boolean;
  hoursSinceLastDuty?: number;
  hoursRequired?: number;
}

export async function assertDriverRest(input: RestCheckInput): Promise<RestCheckResult> {
  const [driver] = await rawQuery<{
    restHoursRequired: string | null;
    lastDutyEndedAt: string | null;
  }>(
    `SELECT "restHoursRequired", "lastDutyEndedAt"
       FROM fleet_drivers
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [input.driverId, input.companyId],
  );
  if (!driver) {
    // Caller's own driver-lookup will surface the real error; don't shadow.
    return { ok: true };
  }
  if (!driver.lastDutyEndedAt) {
    return { ok: true, fresh: true };
  }
  const hoursRequired = driver.restHoursRequired == null ? 8 : Number(driver.restHoursRequired);
  const hoursSince =
    (new Date(input.nextAssignmentStartAt).getTime() -
      new Date(driver.lastDutyEndedAt).getTime()) / 3_600_000;
  if (hoursSince >= hoursRequired) {
    return { ok: true, hoursSinceLastDuty: hoursSince, hoursRequired };
  }

  if (input.overrideReason) {
    emitEvent({
      companyId: input.companyId,
      branchId: input.branchId ?? undefined,
      userId: input.userId,
      action: "fleet.driver.rest.exception",
      entity: "fleet_drivers",
      entityId: input.driverId,
      details: JSON.stringify({
        hoursSince: +hoursSince.toFixed(2),
        hoursRequired,
        overrideReason: input.overrideReason,
      }),
    }).catch(() => undefined);
    return {
      ok: true,
      override: true,
      hoursSinceLastDuty: hoursSince,
      hoursRequired,
    };
  }

  throw new ConflictError(
    `لم يستوفِ السائق ساعات الراحة المطلوبة (${hoursRequired} ساعة) — أمضى ${hoursSince.toFixed(1)} فقط بعد آخر مهمة. أرسل overrideReason للموافقة على الاستثناء.`,
    {
      field: "driverId",
      fix: "اختر سائقاً آخر، عدّل وقت البداية، أو وثّق سبب كسر الراحة.",
    },
  );
}
