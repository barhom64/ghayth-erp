/**
 * TA-T18-VRP Phase 1 — Fleet Optimizer batch-mode (audit doc file 20
 * §10 "Fleet Optimizer batch-mode VRP/TSP").
 *
 * Owner brief: "an advisory batch mode that produces a one-day plan
 * the dispatcher can approve, reject, or partially apply". Phase 1
 * (this file + migration 372) ships the storage + a greedy
 * nearest-neighbour heuristic so the operator gets actionable
 * suggestions today. Phase 2 will swap the heuristic for a real
 * VRP solver (OR-Tools by default, swappable) WITHOUT changing the
 * storage / API shape.
 *
 * Design contract:
 *   - The optimizer is ADVISORY. It NEVER mutates dispatch orders
 *     directly — it records a `vrp_optimization_runs` row that the
 *     dispatcher then approves (Phase 2 wires the approval into the
 *     existing dispatch-order create path, which already re-validates
 *     every hard guard via the engine).
 *   - Inputs are CAPPED so a run can't accidentally enumerate the
 *     entire fleet. The dispatcher chooses the subset.
 *   - Snapshotting: the run records exactly which booking lines +
 *     vehicles it considered, so future re-validation can detect
 *     "this vehicle was deleted since the plan was made" cases.
 *   - No FK from the JSONB `assignmentsJson` rows to fleet_vehicles
 *     / fleet_drivers — the run is a HISTORICAL SNAPSHOT.
 */

import { rawExecute, rawQuery } from "../rawdb.js";
import { logger } from "../logger.js";

export interface OptimizationInput {
  companyId: number;
  branchId: number | null;
  /** The day we're optimising for. */
  runDate: string; // 'YYYY-MM-DD'
  /** Booking lines to optimise. Capped at 200 per run. */
  bookingLineIds: number[];
  /** Vehicles to consider. Capped at 100 per run. */
  vehicleIds: number[];
  /** Operator that triggered the run. */
  createdBy: number;
}

export interface OptimizationAssignment {
  bookingLineId: number;
  vehicleId: number;
  driverId: number | null;
  /** Distance from previous stop to this pickup, in meters. */
  distanceMeters: number;
  /** Position in the day's plan (0-based). */
  sequenceOrder: number;
  /** Brief human-readable reason ("أقرب مركبة متاحة"). */
  reason: string;
}

export interface OptimizationResult {
  runId: number;
  status: "solved" | "failed";
  algorithm: string;
  assignments: OptimizationAssignment[];
  unassigned: number[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  solveDurationMs: number;
  errorMessage?: string;
}

/** Standard limits — protect the solver + the storage row size. */
export const VRP_INPUT_LIMITS = {
  maxBookingLines: 200,
  maxVehicles: 100,
} as const;

// ── Distance helper ─────────────────────────────────────────────────

/**
 * Great-circle distance in meters (Haversine). Same shape as
 * MapsService.manualEstimate's distance fallback; staying with the
 * straight-line proxy here keeps Phase 1 zero-cost (no Google calls
 * during optimisation; the dispatcher can re-run with real distances
 * later if the SPA wires that toggle in).
 */
export function haversineMeters(
  lat1: number, lng1: number, lat2: number, lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ── Solver ──────────────────────────────────────────────────────────

interface BookingPoint {
  id: number;
  pickupLat: number;
  pickupLng: number;
}

interface VehiclePoint {
  id: number;
  driverId: number | null;
  currentLat: number;
  currentLng: number;
}

/**
 * Greedy nearest-neighbour solver: for each booking (in input order),
 * pick the closest vehicle that hasn't been assigned yet. Each vehicle
 * carries one booking per run (Phase 1 doesn't model multi-stop
 * routes — that's Phase 2's job).
 *
 * Deterministic: same inputs in the same order produce the same plan.
 */
export function greedyAssign(
  bookings: BookingPoint[],
  vehicles: VehiclePoint[],
): { assignments: OptimizationAssignment[]; unassigned: number[]; totalDistanceMeters: number } {
  const assignments: OptimizationAssignment[] = [];
  const unassigned: number[] = [];
  const usedVehicles = new Set<number>();
  let totalDistanceMeters = 0;

  bookings.forEach((booking, idx) => {
    let bestVehicle: VehiclePoint | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const v of vehicles) {
      if (usedVehicles.has(v.id)) continue;
      const dist = haversineMeters(v.currentLat, v.currentLng, booking.pickupLat, booking.pickupLng);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestVehicle = v;
      }
    }
    if (bestVehicle) {
      usedVehicles.add(bestVehicle.id);
      totalDistanceMeters += bestDistance;
      assignments.push({
        bookingLineId: booking.id,
        vehicleId: bestVehicle.id,
        driverId: bestVehicle.driverId,
        distanceMeters: bestDistance,
        sequenceOrder: idx,
        reason: "أقرب مركبة متاحة",
      });
    } else {
      unassigned.push(booking.id);
    }
  });

  return { assignments, unassigned, totalDistanceMeters };
}

// ── Storage ─────────────────────────────────────────────────────────

/**
 * Records a `vrp_optimization_runs` row. Public entry point used by
 * the route handler (Phase 2). Validates the input caps + runs the
 * Phase 1 greedy solver inline.
 */
export async function runOptimization(input: OptimizationInput): Promise<OptimizationResult> {
  if (input.bookingLineIds.length > VRP_INPUT_LIMITS.maxBookingLines) {
    throw new Error(
      `bookingLineIds count (${input.bookingLineIds.length}) exceeds limit ${VRP_INPUT_LIMITS.maxBookingLines}`,
    );
  }
  if (input.vehicleIds.length > VRP_INPUT_LIMITS.maxVehicles) {
    throw new Error(
      `vehicleIds count (${input.vehicleIds.length}) exceeds limit ${VRP_INPUT_LIMITS.maxVehicles}`,
    );
  }

  // 1. Insert the run row in "pending" state — this gives us the run
  //    id even before the solver runs, so failures still surface to
  //    the operator dashboard.
  const { insertId: runId } = await rawExecute(
    `INSERT INTO vrp_optimization_runs
       ("companyId", "branchId", "runDate", status,
        "inputBookingLineIds", "inputVehicleIds", "createdBy", "createdAt")
     VALUES ($1, $2, $3, 'pending', $4::jsonb, $5::jsonb, $6, NOW())`,
    [
      input.companyId,
      input.branchId,
      input.runDate,
      JSON.stringify(input.bookingLineIds),
      JSON.stringify(input.vehicleIds),
      input.createdBy,
    ],
  );
  if (!runId) {
    throw new Error("failed to insert vrp_optimization_runs row");
  }

  const startedAt = Date.now();
  try {
    // 2. Pull pickup coords for the booking lines.
    const bookings = await rawQuery<BookingPoint>(
      `SELECT bl.id,
              COALESCE(loc."latitude", 0)::float  AS "pickupLat",
              COALESCE(loc."longitude", 0)::float AS "pickupLng"
         FROM transport_booking_lines bl
         LEFT JOIN locations loc ON loc.id = bl."fromLocationId"
        WHERE bl."companyId" = $1
          AND bl.id = ANY($2::int[])`,
      [input.companyId, input.bookingLineIds],
    );

    // 3. Pull current location for each vehicle.
    const vehicles = await rawQuery<VehiclePoint>(
      `SELECT v.id,
              v."assignedDriverId" AS "driverId",
              COALESCE(snap.latitude, 0)::float  AS "currentLat",
              COALESCE(snap.longitude, 0)::float AS "currentLng"
         FROM fleet_vehicles v
         LEFT JOIN LATERAL (
           SELECT latitude, longitude
             FROM vehicle_location_snapshots
            WHERE "vehicleId" = v.id
            ORDER BY "capturedAt" DESC
            LIMIT 1
         ) snap ON true
        WHERE v."companyId" = $1
          AND v.id = ANY($2::int[])
          AND v."deletedAt" IS NULL`,
      [input.companyId, input.vehicleIds],
    );

    // 4. Run the heuristic.
    const { assignments, unassigned, totalDistanceMeters } = greedyAssign(bookings, vehicles);
    const solveDurationMs = Date.now() - startedAt;

    // 5. Persist the result.
    await rawExecute(
      `UPDATE vrp_optimization_runs
          SET status = 'solved',
              algorithm = 'greedy_nearest_neighbor',
              "assignmentsJson"      = $2::jsonb,
              "unassignedJson"       = $3::jsonb,
              "totalDistanceMeters"  = $4,
              "totalDurationSeconds" = $5,
              "solveDurationMs"      = $6
        WHERE id = $1`,
      [
        runId,
        JSON.stringify(assignments),
        JSON.stringify(unassigned),
        totalDistanceMeters,
        // Phase 1 leaves duration as a derived estimate: assume 50 km/h
        // average urban speed (matches MapsService.manualEstimate's
        // default deadhead kmh). Phase 2's solver will report real
        // durations from the routing matrix.
        Math.round((totalDistanceMeters / 1000) * 3600 / 50),
        solveDurationMs,
      ],
    );

    return {
      runId,
      status: "solved",
      algorithm: "greedy_nearest_neighbor",
      assignments,
      unassigned,
      totalDistanceMeters,
      totalDurationSeconds: Math.round((totalDistanceMeters / 1000) * 3600 / 50),
      solveDurationMs,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, runId, companyId: input.companyId }, "[vrpOptimizer] solver failed");
    await rawExecute(
      `UPDATE vrp_optimization_runs
          SET status = 'failed', "errorMessage" = $2, "solveDurationMs" = $3
        WHERE id = $1`,
      [runId, msg, Date.now() - startedAt],
    ).catch(() => undefined);
    return {
      runId,
      status: "failed",
      algorithm: "greedy_nearest_neighbor",
      assignments: [],
      unassigned: input.bookingLineIds,
      totalDistanceMeters: 0,
      totalDurationSeconds: 0,
      solveDurationMs: Date.now() - startedAt,
      errorMessage: msg,
    };
  }
}

export interface OptimizationRun {
  id: number;
  companyId: number;
  branchId: number | null;
  runDate: string;
  status: string;
  inputBookingLineIds: number[];
  inputVehicleIds: number[];
  assignmentsJson: OptimizationAssignment[] | null;
  unassignedJson: number[] | null;
  algorithm: string | null;
  totalDistanceMeters: number | null;
  totalDurationSeconds: number | null;
  solveDurationMs: number | null;
  errorMessage: string | null;
  createdAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
}

export async function loadOptimizationRun(args: {
  companyId: number;
  runId: number;
}): Promise<OptimizationRun | null> {
  const [row] = await rawQuery<OptimizationRun>(
    `SELECT id, "companyId", "branchId",
            "runDate"::text AS "runDate",
            status,
            "inputBookingLineIds",
            "inputVehicleIds",
            "assignmentsJson",
            "unassignedJson",
            algorithm,
            "totalDistanceMeters",
            "totalDurationSeconds",
            "solveDurationMs",
            "errorMessage",
            "createdAt"::text AS "createdAt",
            "approvedAt"::text AS "approvedAt",
            "rejectedAt"::text AS "rejectedAt"
       FROM vrp_optimization_runs
      WHERE id = $1 AND "companyId" = $2`,
    [args.runId, args.companyId],
  );
  return row ?? null;
}
