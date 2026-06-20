import type { PoolClient } from "pg";

/**
 * Cascade a transport dispatch-order status change down to its booking line
 * and (when warranted) up to the parent booking.
 *
 * #1812 operational review — "الحالة لا تتحدث تلقائيًا من أفعال السائق". When a
 * dispatch lifecycle event fires, the new state must cascade up the chain
 * booking_line → booking, or the operator has to manually flip both states
 * from the booking-detail dropdown, defeating the integration.
 *
 * Extracted from the dispatch-action route handler so the exact same rules
 * apply whether the transition is driven manually from the dispatch board
 * (POST /transport/dispatch-orders/:id/action) or derived automatically when
 * the linked fleet trip completes (#12 auto-status, fleet.ts trip completion).
 * One implementation keeps the two paths from drifting on the aggregate rule
 * "a booking only completes/cancels once ALL its lines are terminal".
 *
 * The caller owns the dispatch-order row update itself; this only propagates
 * the derived line/booking statuses, and runs on the caller's transaction
 * client so it stays atomic with that update.
 *
 * Mapping (dispatch target → derived line status):
 *   accepted   → dispatched     executing → in_progress
 *   completed  → completed      cancelled → cancelled
 *   declined   → pending (operator picks a new driver)
 *   notified / closed → no line change
 */
export async function cascadeDispatchToBooking(
  client: PoolClient,
  args: { bookingLineId: number; target: string; companyId: number },
): Promise<void> {
  const { bookingLineId, target, companyId } = args;

  const lineStatusMap: Record<string, string | null> = {
    accepted:   "dispatched",
    executing:  "in_progress",
    completed:  "completed",
    cancelled:  "cancelled",
    // Refused → the line returns to awaiting-dispatch. 'open' is the valid
    // pre-dispatch booking-line state; 'pending' is a dispatch-ORDER status and
    // is NOT in the transport_booking_lines CHECK (writing it 500s the decline).
    declined:   "open",
    notified:   null,   // intermediate driver-side state — no line change
    closed:     null,   // operational close is a finance handoff; line stays completed
  };
  const newLineStatus = lineStatusMap[target];
  if (newLineStatus) {
    await client.query(
      `UPDATE transport_booking_lines
          SET status = $1, "updatedAt" = NOW()
        WHERE id = $2 AND "companyId" = $3`,
      [newLineStatus, bookingLineId, companyId],
    );
  }

  // Booking-level cascade: only flip when the change is meaningful.
  if (target === "accepted" || target === "executing" || target === "completed" || target === "cancelled") {
    // Need the booking_id; load it via the line.
    const lineLookup = await client.query<{ bookingId: number; bookingStatus: string }>(
      `SELECT l."bookingId", b.status AS "bookingStatus"
         FROM transport_booking_lines l
              JOIN transport_bookings b ON b.id = l."bookingId"
        WHERE l.id = $1 AND l."companyId" = $2
        LIMIT 1`,
      [bookingLineId, companyId],
    );
    const lineRow = lineLookup.rows[0];
    if (lineRow) {
      let nextBookingStatus: string | null = null;
      // accepted (driver took the order) advances a still-scheduled booking to
      // "dispatched". Guarded to "scheduled" so it never drags a booking
      // already past dispatch backwards.
      if (target === "accepted" && lineRow.bookingStatus === "scheduled") {
        nextBookingStatus = "dispatched";
      }
      if (target === "executing" && lineRow.bookingStatus !== "in_progress") {
        nextBookingStatus = "in_progress";
      }
      if (target === "completed" || target === "cancelled") {
        // Aggregate state across all lines — only flip the booking when ALL
        // lines are in the terminal state (avoids prematurely marking a 3-leg
        // umrah trip "completed" after leg 1).
        const linesAgg = await client.query<{ total: string; matching: string }>(
          `SELECT COUNT(*)::text AS total,
                  COUNT(*) FILTER (WHERE status = $1)::text AS matching
             FROM transport_booking_lines
            WHERE "bookingId" = $2 AND "companyId" = $3
              AND "deletedAt" IS NULL`,
          [target === "completed" ? "completed" : "cancelled", lineRow.bookingId, companyId],
        );
        const total = Number(linesAgg.rows[0]?.total ?? 0);
        const matching = Number(linesAgg.rows[0]?.matching ?? 0);
        if (total > 0 && total === matching) {
          nextBookingStatus = target === "completed" ? "completed" : "cancelled";
        }
      }
      if (nextBookingStatus && nextBookingStatus !== lineRow.bookingStatus) {
        await client.query(
          `UPDATE transport_bookings
              SET status = $1, "updatedAt" = NOW()
            WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
          [nextBookingStatus, lineRow.bookingId, companyId],
        );
      }
    }
  }
}

/**
 * Top-down cancel — cancelling a dispatch order (or its parent booking) must
 * also cancel the fleet trip it spawned and release the held vehicle/driver,
 * or the trip is orphaned and the resources stay locked forever. A
 * dispatch-spawned trip carries the sourceKey "dispatch:<orderId>:<token>";
 * the status guard bounds the update to non-terminal trips so a finished trip
 * is never reopened and the call is idempotent.
 *
 * Extracted from the dispatch-action route handler so the IDENTICAL release
 * runs whether the cancel originates at the dispatch board
 * (POST /transport/dispatch-orders/:id/action) or cascades down from a booking
 * cancel (PATCH /transport/bookings/:id, status → cancelled under the "cascade"
 * policy). One copy keeps the two entry points from drifting on the
 * resource-release rule — the same reason `cascadeDispatchToBooking` is shared.
 *
 * Runs on the caller's transaction client so it stays atomic with the
 * order/booking status change that triggered it.
 */
export async function cancelTripsForDispatchOrder(
  client: PoolClient,
  args: { dispatchOrderId: number; companyId: number; reason: string },
): Promise<void> {
  const { dispatchOrderId, companyId, reason } = args;
  const cancelledTrips = await client.query<{
    vehicleId: number | null; driverId: number | null;
  }>(
    `UPDATE fleet_trips
        SET status = 'cancelled', "cancelledAt" = NOW(),
            "cancellationReason" = $3, "updatedAt" = NOW()
      WHERE "companyId" = $1 AND "sourceKey" LIKE $2
        AND status IN ('scheduled', 'planned', 'in_progress')
      RETURNING "vehicleId", "driverId"`,
    [companyId, `dispatch:${dispatchOrderId}:%`, reason],
  );
  for (const trip of cancelledTrips.rows) {
    if (trip.vehicleId) {
      await client.query(
        `UPDATE fleet_vehicles SET status='available', "updatedAt"=NOW()
          WHERE id=$1 AND "companyId"=$2 AND status='in_use' AND "deletedAt" IS NULL`,
        [trip.vehicleId, companyId],
      );
    }
    if (trip.driverId) {
      await client.query(
        `UPDATE fleet_drivers SET status='available'
          WHERE id=$1 AND "companyId"=$2 AND status='on_trip' AND "deletedAt" IS NULL`,
        [trip.driverId, companyId],
      );
    }
  }
}
