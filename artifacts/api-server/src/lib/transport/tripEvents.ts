// شريحة وقائع الرحلة — المنطق المشترك (الكيان يقود التجربة / تسجيل واقعة).
//
// يُستعمل من سطحين بصلاحيتين مختلفتين على نفس السجل (fleet_trip_events):
//   • المشغّل: POST /transport/bookings/:id/events            (fleet.bookings:update)
//   • السائق:  POST /transport/dispatch-orders/:id/trip-event (fleet.dispatch:update)
// كلاهما يستدعي recordBookingTripEvent — لا منطق مزدوج، لا سجل مواز.
//
// تشغيلي بحت — لا مساس بالدفتر. الإغلاق المالي يبقى منفصلًا (candidate→المالية).

import { z } from "zod";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../rawdb.js";
import { NotFoundError, ValidationError } from "../errorHandler.js";
import { createAuditLog } from "../businessHelpers.js";
import { logger } from "../logger.js";

export const TRIP_EVENT_TYPES = [
  "load", "depart", "arrive", "inspect", "unload", "handover", "deliver",
] as const;

// وقائع الإغلاق التشغيلي — تتطلب إثبات POD وتنقل الحجز إلى «مكتمل».
const TRIP_EVENT_CLOSING_TYPES = new Set<string>(["unload", "deliver"]);
// الحالات التي يجوز فيها تسجيل واقعة (تنفيذ قائم أو ممكن).
const TRIP_EVENT_EXECUTABLE_STATUSES = new Set<string>([
  "approved", "scheduled", "dispatched", "in_progress",
]);
// حالات «ما قبل التنفيذ» — أول واقعة تنفيذ تنقلها إلى in_progress.
const TRIP_EVENT_PRE_EXECUTION_STATUSES = new Set<string>([
  "approved", "scheduled", "dispatched",
]);

export const recordTripEventSchema = z.object({
  eventType: z.enum(TRIP_EVENT_TYPES),
  dispatchOrderId: z.coerce.number().int().positive().optional(),
  occurredAt: z.string().datetime({ offset: true }).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  // شريحة 2 — تصنيف قراءة الوزن (فارغ/محمّل/محور/أخرى) ليُشتقّ الصافي.
  weightKind: z.enum(["tare", "gross", "axle", "other"]).optional(),
  weightKg: z.coerce.number().min(0).optional(),
  proofObjectPaths: z.array(z.string().min(1).max(512)).max(20).optional(),
  notes: z.string().max(2000).optional(),
});

export type RecordTripEventInput = z.infer<typeof recordTripEventSchema> & {
  // شريحة 3 — يُضبط داخليًا في endpoint العهدة فقط (ليس من المخطّط العام):
  // مرجع السائق المستلِم في واقعة handover.
  handoverToDriverId?: number | null;
};

export interface TripEventScope {
  companyId: number;
  branchId?: number | null;
  userId: number;
  activeAssignmentId?: number | null;
}

/**
 * يسجّل واقعة رحلة على حجز ويشتقّ حالته (للأمام فقط). يفترض أنّ المستدعي قد
 * تحقّق من الصلاحية وملكية الحجز/المهمة. ذرّي: الواقعة + الحالة المشتقّة
 * (+ إعادة إسناد أمر التوزيع عند العهدة) تُكتب معًا أو لا شيء. يرمي
 * NotFoundError/ValidationError عند الخلل.
 *
 * opts.reassignDispatchDriverId (شريحة 3): عند العهدة، يُعاد إسناد
 * `transport_dispatch_orders.driverId` للسائق المستلِم ذرّيًا مع الواقعة.
 */
export async function recordBookingTripEvent(
  scope: TripEventScope,
  bookingId: number,
  input: RecordTripEventInput,
  opts: { reassignDispatchDriverId?: number } = {},
): Promise<{ insertId: number; derivedStatus: string | null }> {
  const [booking] = await rawQuery<Record<string, unknown>>(
    `SELECT id, status FROM transport_bookings
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [bookingId, scope.companyId],
  );
  if (!booking) throw new NotFoundError("الحجز غير موجود");
  const status = String(booking.status);
  if (!TRIP_EVENT_EXECUTABLE_STATUSES.has(status)) {
    throw new ValidationError(
      "لا يمكن تسجيل واقعة على حجز في هذه الحالة",
      { field: "status" },
    );
  }
  // واقعة الإغلاق التشغيلي تتطلب إثبات POD (صورة تفريغ/تسليم).
  if (
    TRIP_EVENT_CLOSING_TYPES.has(input.eventType) &&
    (!input.proofObjectPaths || input.proofObjectPaths.length === 0)
  ) {
    throw new ValidationError(
      "واقعة الإغلاق تتطلب صورة إثبات (POD)",
      { field: "proofObjectPaths" },
    );
  }
  // أمر التوزيع (إن مُرّر) يجب أن يخصّ هذا الحجز ونفس الشركة.
  if (input.dispatchOrderId != null) {
    const [d] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM transport_dispatch_orders
        WHERE id = $1 AND "bookingId" = $2 AND "companyId" = $3`,
      [input.dispatchOrderId, bookingId, scope.companyId],
    );
    if (!d) {
      throw new ValidationError(
        "أمر التوزيع غير مرتبط بهذا الحجز",
        { field: "dispatchOrderId" },
      );
    }
  }
  // شريحة 2 — نوع الوزن بلا قيمة وزن لا معنى له (الصافي يُشتقّ من القيم).
  if (input.weightKind != null && input.weightKg == null) {
    throw new ValidationError(
      "حدّد قيمة الوزن (كغم) عند اختيار نوع الوزن",
      { field: "weightKg" },
    );
  }

  // اشتقاق حالة الحجز (تشغيلي، للأمام فقط — لا رجوع، لا مساس بالدفتر).
  let derivedStatus: string | null = null;
  if (TRIP_EVENT_CLOSING_TYPES.has(input.eventType)) {
    derivedStatus = "completed";
  } else if (TRIP_EVENT_PRE_EXECUTION_STATUSES.has(status)) {
    derivedStatus = "in_progress";
  }
  // الواقعة + الحالة المشتقّة تُكتبان ذرّيًا: rawExecute داخل withTransaction
  // ينضمّ لـtxStore فيبقى الكل ذرّيًا.
  const insertId = await withTransaction(async () => {
    const ins = await rawExecute(
      `INSERT INTO fleet_trip_events
         ("companyId", "branchId", "bookingId", "dispatchOrderId", "eventType",
          "occurredAt", "lat", "lng", "weightKg", "weightKind", "proofObjectPaths", "notes",
          "recordedByAssignmentId", "createdBy", "handoverToDriverId")
       VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, NOW()), $7,$8,$9,$10,$11,$12, $13,$14,$15)`,
      [
        scope.companyId, scope.branchId ?? null, bookingId, input.dispatchOrderId ?? null, input.eventType,
        input.occurredAt ?? null, input.lat ?? null, input.lng ?? null, input.weightKg ?? null, input.weightKind ?? null,
        input.proofObjectPaths ?? null, input.notes ?? null,
        scope.activeAssignmentId ?? null, scope.userId, input.handoverToDriverId ?? null,
      ],
    );
    assertInsert(ins.insertId, "fleet_trip_events");
    if (derivedStatus && derivedStatus !== status) {
      await rawExecute(
        `UPDATE transport_bookings SET status = $1, "updatedAt" = NOW()
          WHERE id = $2 AND "companyId" = $3`,
        [derivedStatus, bookingId, scope.companyId],
      );
    }
    // شريحة 3 — عند العهدة: إعادة إسناد أمر التوزيع للسائق المستلِم ذرّيًا.
    if (opts.reassignDispatchDriverId != null && input.dispatchOrderId != null) {
      await rawExecute(
        `UPDATE transport_dispatch_orders SET "driverId" = $1, "updatedAt" = NOW()
          WHERE id = $2 AND "companyId" = $3`,
        [opts.reassignDispatchDriverId, input.dispatchOrderId, scope.companyId],
      );
    }
    return ins.insertId;
  });

  createAuditLog({
    companyId: scope.companyId, branchId: scope.branchId ?? undefined, userId: scope.userId,
    action: "trip_event_recorded", entity: "transport_bookings", entityId: bookingId,
    after: { tripEventId: insertId, eventType: input.eventType, derivedStatus },
  }).catch((e) => logger.error(e, "trip event audit failed"));

  return { insertId, derivedStatus };
}
