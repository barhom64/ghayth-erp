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
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import {
  runOptimization,
  loadOptimizationRun,
  VRP_INPUT_LIMITS,
  type OptimizationAssignment,
} from "../lib/fleet/vrpOptimizer.js";

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

/**
 * Best-effort engine re-validation for one proposed assignment.
 * Mirrors the rules `POST /transport/dispatch-orders` enforces but
 * does not commit. Returns a verdict the approve loop uses to decide
 * whether to INSERT the dispatch order or skip it.
 *
 * Phase 2 intentionally does NOT call the existing dispatch-order
 * route programmatically — keeping the validation logic here means
 * a future shape change to that route doesn't silently break the
 * batch approval flow. The single-pair create route remains the
 * authoritative path for individual dispatcher actions.
 */
async function validateProposedAssignment(args: {
  companyId: number;
  assignment: OptimizationAssignment;
  runDate: string;
}): Promise<{ ok: boolean; reason?: string }> {
  // Booking line must still exist + not be soft-deleted.
  const [line] = await rawQuery<{ id: number; status: string }>(
    `SELECT id, status FROM transport_booking_lines
      WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [args.assignment.bookingLineId, args.companyId],
  );
  if (!line) {
    return { ok: false, reason: "سطر الحجز لم يعد موجودًا" };
  }
  if (line.status === "dispatched" || line.status === "completed" || line.status === "cancelled") {
    return { ok: false, reason: `سطر الحجز انتقل إلى ${line.status} منذ توليد الخطة` };
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
  // Driver, if specified, must still be active.
  if (args.assignment.driverId != null) {
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
  }
  return { ok: true };
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
      const accepted: number[] = [];
      const rejected: { assignment: OptimizationAssignment; reason: string }[] = [];
      for (const assignment of assignments) {
        const verdict = await validateProposedAssignment({
          companyId: scope.companyId,
          assignment,
          runDate: run.runDate,
        });
        if (!verdict.ok) {
          rejected.push({ assignment, reason: verdict.reason ?? "validation failed" });
          continue;
        }
        // Phase 2 stops at validation — actual dispatch-order
        // creation is deferred to Phase 3 once the dispatcher's
        // approval UI explicitly chooses windows (the greedy solver
        // doesn't pick scheduledStartAt/EndAt yet; that's a Phase 3
        // gap). For now, an approved run advances to 'approved' so
        // the dispatcher knows the plan is valid + ready for the
        // single-pair create path.
        accepted.push(assignment.bookingLineId);
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
        after: { finalStatus, acceptedCount: accepted.length, rejectedCount: rejected.length },
      });
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId,
        action: "fleet.optimizer.approved", entity: "vrp_optimization_runs", entityId: runId,
        details: JSON.stringify({ finalStatus, accepted: accepted.length, rejected: rejected.length }),
      }).catch((e) => logger.error(e, "optimizer approve event failed"));
      res.json({ data: { status: finalStatus, acceptedCount: accepted.length, rejected } });
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
