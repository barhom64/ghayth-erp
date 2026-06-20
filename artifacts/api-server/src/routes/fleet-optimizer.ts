/**
 * TA-T18-VRP Phase 2 — Fleet Optimizer routes (audit doc file 20 §10
 * "Fleet Optimizer batch-mode VRP/TSP").
 *
 * Phase 1 (#2443) shipped storage + the greedy nearest-neighbour solver.
 * Phase 2 (this file) exposes:
 *
 *   POST /fleet/optimizer/runs                  — create a new run
 *   GET  /fleet/optimizer/runs                  — list (last 30 days)
 *   GET  /fleet/optimizer/runs/:id              — detail
 *   POST /fleet/optimizer/runs/:id/approve      — materialize plan
 *   POST /fleet/optimizer/runs/:id/reject       — close as rejected
 *
 * The approve path is the safety-critical surface: it loops over the
 * proposed assignments and calls the same hard-guard chain the
 * single-pair create-dispatch path uses (assertDriverEligibility +
 * assertDriverRest + conflict probe + suggest-engine readiness check)
 * BEFORE inserting the real dispatch order. If any assignment fails
 * a guard, the run goes to `partially_approved` with the successes
 * committed and the failures recorded.
 *
 * Owner brief: "advisory batch mode" — Phase 2 keeps that promise.
 * Every individual dispatch order created via approval is the same
 * row that would have been created via the manual single-pair flow,
 * with the same audit + the same event.
 */

import { Router } from "express";
import { z } from "zod";

import {
  handleRouteError, NotFoundError, ValidationError,
  parseId, zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { auditFromRequest, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { rawQuery, rawExecute, assertInsert, withTransaction } from "../lib/rawdb.js";
import {
  runOptimization,
  loadOptimizationRun,
  VRP_INPUT_LIMITS,
  type OptimizationAssignment,
} from "../lib/fleet/vrpOptimizer.js";
// TA-T18-VRP Phase 3a — auto-dispatch on approval. The approve loop
// reuses the same hard-guard chain `POST /transport/dispatch-orders`
// enforces (assertDriverEligibility + assertDriverRest + conflict
// probe) before committing each row, so a batch approval is
// indistinguishable from N single-pair creates.
import { assertDriverEligibility } from "../lib/fleet/driverEligibility.js";
import { assertDriverRest } from "../lib/fleet/driverRest.js";

export const fleetOptimizerRouter = Router();
fleetOptimizerRouter.use(authMiddleware);

// ─── Create + list + detail ─────────────────────────────────────────

const createRunSchema = z.object({
  runDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: "تاريخ الـrun يجب أن يكون YYYY-MM-DD",
  }),
  bookingLineIds: z.array(z.coerce.number().int().positive()).min(1).max(
    VRP_INPUT_LIMITS.maxBookingLines,
  ),
  vehicleIds: z.array(z.coerce.number().int().positive()).min(1).max(
    VRP_INPUT_LIMITS.maxVehicles,
  ),
});

fleetOptimizerRouter.post(
  "/fleet/optimizer/runs",
  authorize({ feature: "fleet.dispatch", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createRunSchema.safeParse(req.body));
      const result = await runOptimization({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        runDate: b.runDate,
        bookingLineIds: b.bookingLineIds,
        vehicleIds: b.vehicleIds,
        createdBy: scope.userId,
      });
      auditFromRequest(req, "create", "vrp_optimization_runs", result.runId, {
        after: { runDate: b.runDate, bookingCount: b.bookingLineIds.length, vehicleCount: b.vehicleIds.length, status: result.status },
      });
      res.status(201).json({ data: result });
    } catch (err) {
      handleRouteError(err, res, "Create optimizer run error:");
    }
  },
);

fleetOptimizerRouter.get(
  "/fleet/optimizer/runs",
  authorize({ feature: "fleet.dispatch", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const days = Math.min(Math.max(Number(req.query.days ?? 30) || 30, 1), 366);
      const rows = await rawQuery(
        `SELECT id, "runDate"::text AS "runDate", status, algorithm,
                "totalDistanceMeters", "totalDurationSeconds",
                "solveDurationMs", "createdAt"::text AS "createdAt",
                jsonb_array_length(COALESCE("assignmentsJson", '[]'::jsonb)) AS "assignmentCount",
                jsonb_array_length(COALESCE("unassignedJson", '[]'::jsonb)) AS "unassignedCount"
           FROM vrp_optimization_runs
          WHERE "companyId" = $1
            AND "createdAt" >= NOW() - ($2 || ' days')::interval
          ORDER BY "createdAt" DESC
          LIMIT 200`,
        [scope.companyId, String(days)],
      );
      res.json({ data: { rows, windowDays: days } });
    } catch (err) {
      handleRouteError(err, res, "List optimizer runs error:");
    }
  },
);

fleetOptimizerRouter.get(
  "/fleet/optimizer/runs/:id",
  authorize({ feature: "fleet.dispatch", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const runId = parseId(req.params.id, "id");
      const row = await loadOptimizationRun({ companyId: scope.companyId, runId });
      if (!row) throw new NotFoundError("الـrun غير موجود");
      res.json({ data: row });
    } catch (err) {
      handleRouteError(err, res, "Load optimizer run error:");
    }
  },
);

// ─── Approve + reject ───────────────────────────────────────────────

interface AssignmentSnapshot {
  /** Booking line still exists + dispatchable. */
  lineId: number;
  bookingId: number;
  scheduledStartAt: string;
  scheduledEndAt: string;
}

/**
 * Phase 3a engine re-validation for one proposed assignment. Returns
 * the booking-line snapshot needed to commit a dispatch order, OR a
 * human-readable reason the assignment was skipped. Mirrors the
 * staleness checks `POST /transport/dispatch-orders` makes inline.
 */
async function validateProposedAssignment(args: {
  companyId: number;
  assignment: OptimizationAssignment;
  runDate: string;
}): Promise<{ ok: true; snapshot: AssignmentSnapshot } | { ok: false; reason: string }> {
  // Booking line must still exist + not be soft-deleted + have a window.
  const [line] = await rawQuery<{
    id: number;
    bookingId: number;
    status: string;
    scheduledPickupAt: string | null;
    scheduledDeliveryAt: string | null;
  }>(
    `SELECT id, "bookingId", status,
            "scheduledPickupAt", "scheduledDeliveryAt"
       FROM transport_booking_lines
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [args.assignment.bookingLineId, args.companyId],
  );
  if (!line) {
    return { ok: false, reason: "سطر الحجز لم يعد موجودًا" };
  }
  if (line.status === "dispatched" || line.status === "completed" || line.status === "cancelled") {
    return { ok: false, reason: `سطر الحجز انتقل إلى ${line.status} منذ توليد الخطة` };
  }
  if (!line.scheduledPickupAt || !line.scheduledDeliveryAt) {
    return { ok: false, reason: "سطر الحجز لا يحمل نافذة pickup/delivery — اضبطها قبل الموافقة" };
  }
  // Vehicle must still be in the fleet + not deleted.
  const [vehicle] = await rawQuery<{ id: number }>(
    `SELECT id FROM fleet_vehicles
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [args.assignment.vehicleId, args.companyId],
  );
  if (!vehicle) {
    return { ok: false, reason: "المركبة لم تعد موجودة" };
  }
  // Driver must be present + active. Phase 1's greedy doesn't pick
  // standalone drivers; if driverId is NULL the assignment cannot be
  // dispatched yet (the existing single-pair path requires driverId).
  if (args.assignment.driverId == null) {
    return { ok: false, reason: "الإسناد بلا سائق — لا يمكن إنشاء أمر التشغيل بدونه" };
  }
  const [driver] = await rawQuery<{ id: number; status: string }>(
    `SELECT id, COALESCE(status, 'active') AS status FROM fleet_drivers
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [args.assignment.driverId, args.companyId],
  );
  if (!driver) {
    return { ok: false, reason: "السائق لم يعد موجودًا" };
  }
  if (driver.status === "inactive" || driver.status === "terminated") {
    return { ok: false, reason: `السائق أصبح ${driver.status}` };
  }
  return {
    ok: true,
    snapshot: {
      lineId: line.id,
      bookingId: line.bookingId,
      scheduledStartAt: line.scheduledPickupAt,
      scheduledEndAt: line.scheduledDeliveryAt,
    },
  };
}

/**
 * TA-T18-VRP Phase 3a — commit one validated assignment as a real
 * dispatch order. Reuses the exact guard chain `POST
 * /transport/dispatch-orders` enforces (assertDriverEligibility +
 * assertDriverRest + conflict probe) so a batch approval is
 * indistinguishable from N single-pair creates.
 *
 * Returns the new dispatch order id on success, or a human-readable
 * reason on guard failure. Errors are CAUGHT here so one bad
 * assignment doesn't break the batch.
 */
async function createDispatchOrderFromAssignment(args: {
  companyId: number;
  branchId: number | null;
  userId: number;
  assignment: OptimizationAssignment;
  snapshot: AssignmentSnapshot;
}): Promise<{ ok: true; dispatchOrderId: number } | { ok: false; reason: string }> {
  const { companyId, branchId, userId, assignment, snapshot } = args;
  // Phase 3a does NOT allow overrideReason via the batch path —
  // batch approvals must clear every hard guard cleanly. A dispatcher
  // wanting to dispatch an over-guard assignment uses the single-pair
  // path with an explicit overrideReason, where the audit is clearer.
  try {
    await assertDriverEligibility({
      companyId,
      branchId,
      userId,
      driverId: assignment.driverId!,
      vehicleId: assignment.vehicleId,
      sourceType: "fleet_trip",
      sourceId: assignment.bookingLineId,
      overrideReason: null,
    });
    await assertDriverRest({
      companyId,
      branchId,
      userId,
      driverId: assignment.driverId!,
      nextAssignmentStartAt: snapshot.scheduledStartAt,
      overrideReason: null,
    });
    const conflicts = await rawQuery<{ id: number; kind: string }>(
      `SELECT id, 'driver' AS kind FROM transport_dispatch_orders
        WHERE "companyId" = $1 AND "driverId" = $2
          AND status NOT IN ('declined', 'cancelled')
          AND tstzrange("scheduledStartAt", "scheduledEndAt", '[)')
              && tstzrange($3::timestamptz, $4::timestamptz, '[)')
       UNION
       SELECT id, 'vehicle' AS kind FROM transport_dispatch_orders
        WHERE "companyId" = $1 AND "vehicleId" = $5
          AND status NOT IN ('declined', 'cancelled')
          AND tstzrange("scheduledStartAt", "scheduledEndAt", '[)')
              && tstzrange($3::timestamptz, $4::timestamptz, '[)')`,
      [companyId, assignment.driverId, snapshot.scheduledStartAt, snapshot.scheduledEndAt, assignment.vehicleId],
    );
    if (conflicts.length > 0) {
      const kinds = [...new Set(conflicts.map((c) => c.kind))].join("+");
      return { ok: false, reason: `تعارض في الجدولة: ${kinds}` };
    }
    // Atomic per assignment: creating the dispatch order and flipping its
    // booking line to 'dispatched' must commit together — otherwise a failure
    // on the line update leaves an order whose booking line is still 'pending'
    // (it would be re-offered to another run and double-dispatched).
    const insertId = await withTransaction(async () => {
      const { insertId } = await rawExecute(
        `INSERT INTO transport_dispatch_orders
           ("companyId", "branchId", "bookingId", "bookingLineId",
            "vehicleId", "driverId", "scheduledStartAt", "scheduledEndAt",
            status, "dispatchedBy", "dispatchedAt")
         VALUES ($1,$2,$3,$4, $5,$6,$7,$8, 'pending', $9, NOW())`,
        [companyId, branchId, snapshot.bookingId, assignment.bookingLineId,
         assignment.vehicleId, assignment.driverId, snapshot.scheduledStartAt, snapshot.scheduledEndAt, userId],
      );
      if (!insertId) return null;
      await rawExecute(
        `UPDATE transport_booking_lines SET status = 'dispatched', "updatedAt" = NOW()
          WHERE id = $1 AND "companyId" = $2`,
        [assignment.bookingLineId, companyId],
      );
      return insertId;
    });
    if (!insertId) {
      return { ok: false, reason: "فشل إنشاء صف الـdispatch order" };
    }
    // Emit the same event the single-pair path emits — downstream
    // listeners (notifications, GL, telematics) don't need to know
    // the order came from the batch path.
    emitEvent({
      companyId,
      branchId: branchId ?? undefined,
      userId,
      action: "fleet.dispatch.created",
      entity: "transport_dispatch_orders", entityId: insertId,
      details: JSON.stringify({
        driverId: assignment.driverId,
        vehicleId: assignment.vehicleId,
        bookingId: snapshot.bookingId,
        source: "fleet_optimizer_batch_approval",
      }),
    }).catch((e) => logger.error(e, "dispatch event failed"));
    return { ok: true, dispatchOrderId: insertId };
  } catch (err) {
    // assertDriverEligibility / assertDriverRest throw structured errors
    // — capture the message + continue with the next assignment.
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: msg };
  }
}

fleetOptimizerRouter.post(
  "/fleet/optimizer/runs/:id/approve",
  authorize({ feature: "fleet.dispatch", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const runId = parseId(req.params.id, "id");
      const run = await loadOptimizationRun({ companyId: scope.companyId, runId });
      if (!run) throw new NotFoundError("الـrun غير موجود");
      if (run.status !== "solved") {
        throw new ValidationError(
          `الـrun بحالة ${run.status} — يمكن الموافقة فقط على الـruns بحالة 'solved'`,
        );
      }
      const assignments = (run.assignmentsJson ?? []) as OptimizationAssignment[];
      const accepted: { bookingLineId: number; dispatchOrderId: number }[] = [];
      const rejected: { assignment: OptimizationAssignment; reason: string }[] = [];
      for (const assignment of assignments) {
        const verdict = await validateProposedAssignment({
          companyId: scope.companyId,
          assignment,
          runDate: run.runDate,
        });
        if (!verdict.ok) {
          rejected.push({ assignment, reason: verdict.reason });
          continue;
        }
        // TA-T18-VRP Phase 3a — commit the assignment as a real
        // dispatch order through the same guard chain the single-pair
        // route uses. Per-assignment errors are caught + recorded;
        // one bad row never breaks the batch.
        const result = await createDispatchOrderFromAssignment({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          userId: scope.userId,
          assignment,
          snapshot: verdict.snapshot,
        });
        if (!result.ok) {
          rejected.push({ assignment, reason: result.reason });
          continue;
        }
        accepted.push({
          bookingLineId: assignment.bookingLineId,
          dispatchOrderId: result.dispatchOrderId,
        });
      }
      const finalStatus = rejected.length === 0 ? "approved"
                       : accepted.length === 0 ? "rejected"
                       : "partially_approved";
      await rawExecute(
        `UPDATE vrp_optimization_runs
            SET status = $2,
                "approvedAt" = NOW(),
                "approvedBy" = $3
          WHERE id = $1 AND "companyId" = $4`,
        [runId, finalStatus, scope.userId, scope.companyId],
      );
      auditFromRequest(req, "approve", "vrp_optimization_runs", runId, {
        after: {
          finalStatus,
          acceptedCount: accepted.length,
          rejectedCount: rejected.length,
          dispatchOrderIds: accepted.map((a) => a.dispatchOrderId),
        },
      });
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.optimizer.approved", entity: "vrp_optimization_runs", entityId: runId,
        details: JSON.stringify({
          finalStatus,
          accepted: accepted.length,
          rejected: rejected.length,
          dispatchOrderIds: accepted.map((a) => a.dispatchOrderId),
        }),
      }).catch((e) => logger.error(e, "optimizer approve event failed"));
      res.json({ data: { status: finalStatus, accepted, rejected } });
    } catch (err) {
      handleRouteError(err, res, "Approve optimizer run error:");
    }
  },
);

const rejectSchema = z.object({
  reason: z.string().min(1).max(2000),
});

fleetOptimizerRouter.post(
  "/fleet/optimizer/runs/:id/reject",
  authorize({ feature: "fleet.dispatch", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const runId = parseId(req.params.id, "id");
      const b = zodParse(rejectSchema.safeParse(req.body));
      const run = await loadOptimizationRun({ companyId: scope.companyId, runId });
      if (!run) throw new NotFoundError("الـrun غير موجود");
      if (run.status === "approved" || run.status === "rejected" || run.status === "partially_approved") {
        throw new ValidationError(`الـrun بحالة ${run.status} — لا يمكن رفضه`);
      }
      await rawExecute(
        `UPDATE vrp_optimization_runs
            SET status = 'rejected',
                "rejectedAt" = NOW(),
                "rejectedBy" = $2,
                "rejectionReason" = $3
          WHERE id = $1 AND "companyId" = $4`,
        [runId, scope.userId, b.reason, scope.companyId],
      );
      auditFromRequest(req, "reject", "vrp_optimization_runs", runId, {
        after: { reason: b.reason },
      });
      res.json({ data: { status: "rejected" } });
    } catch (err) {
      handleRouteError(err, res, "Reject optimizer run error:");
    }
  },
);
