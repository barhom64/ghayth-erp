import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  greedyAssign,
  haversineMeters,
  VRP_INPUT_LIMITS,
} from "../../src/lib/fleet/vrpOptimizer.js";

/**
 * TA-T18-VRP Phase 1 — Fleet Optimizer batch-mode storage + greedy
 * solver (audit doc file 20 §10 "Fleet Optimizer batch-mode
 * VRP/TSP"). Owner brief: "advisory batch mode that produces a
 * one-day plan the dispatcher can approve, reject, or partially
 * apply".
 *
 * Phase 1 ships:
 *   1. Migration 372: `vrp_optimization_runs` table.
 *   2. `lib/fleet/vrpOptimizer.ts`: greedy nearest-neighbour solver +
 *      storage helpers + input caps.
 *
 * Phase 2 (deferred to a follow-up PR) will:
 *   - Swap the heuristic for a real VRP solver (OR-Tools by default).
 *   - Wire the route handler + approval flow that re-validates
 *     through the existing engine.
 *
 * Critical invariants pinned here:
 *   - Storage is a HISTORICAL SNAPSHOT — no FK from JSONB rows.
 *   - The optimizer is ADVISORY, never mutates dispatch orders.
 *   - Greedy solver is DETERMINISTIC (same input → same plan).
 *   - Greedy solver gives each vehicle AT MOST ONE booking per run.
 *   - Each booking goes to its NEAREST AVAILABLE vehicle (the whole
 *     point of the heuristic).
 *   - Input caps prevent runaway runs.
 *   - Phase 1 ships NO route handler (the API surface is deferred).
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const MIG = readFileSync(
  join(repoRoot, "artifacts/api-server/src/migrations/372_vrp_optimization_runs.sql"),
  "utf8",
);
const SVC = readFileSync(
  join(repoRoot, "artifacts/api-server/src/lib/fleet/vrpOptimizer.ts"),
  "utf8",
);

describe("TA-T18-VRP Phase 1 — migration 372 schema", () => {
  it("creates `vrp_optimization_runs` with the lifecycle columns", () => {
    expect(MIG).toMatch(/CREATE TABLE IF NOT EXISTS vrp_optimization_runs/);
    expect(MIG).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\)/);
    expect(MIG).toMatch(/"runDate"\s+DATE NOT NULL/);
    expect(MIG).toMatch(/status\s+TEXT NOT NULL DEFAULT 'pending'/);
  });

  it("status CHECK pins the six allowed values", () => {
    expect(MIG).toMatch(
      /CHECK \(status IN \('pending', 'solved', 'failed', 'approved', 'rejected', 'partially_approved'\)\)/,
    );
  });

  it("input + output use JSONB (snapshot semantics — no FK from the proposed plan)", () => {
    expect(MIG).toMatch(/"inputBookingLineIds" JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    expect(MIG).toMatch(/"inputVehicleIds"\s+JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    expect(MIG).toMatch(/"assignmentsJson"\s+JSONB/);
    expect(MIG).toMatch(/"unassignedJson"\s+JSONB/);
  });

  it("ships dashboard indexes (date-desc + status)", () => {
    expect(MIG).toMatch(/vrp_optimization_runs_company_date_idx[\s\S]+?"runDate" DESC/);
    expect(MIG).toMatch(/vrp_optimization_runs_company_status_idx[\s\S]+?status/);
  });

  it("ships a rollback recipe + design audit trail", () => {
    expect(MIG).toMatch(/@rollback:[\s\S]+?DROP TABLE IF EXISTS vrp_optimization_runs/);
    expect(MIG).toMatch(/HISTORICAL SNAPSHOT|historical snapshot/);
  });
});

describe("TA-T18-VRP Phase 1 — solver: haversine + greedy", () => {
  it("haversineMeters(same point) = 0", () => {
    expect(haversineMeters(24.7136, 46.6753, 24.7136, 46.6753)).toBe(0);
  });

  it("haversineMeters is symmetric (a→b = b→a)", () => {
    const ab = haversineMeters(24.7136, 46.6753, 21.4858, 39.1925);
    const ba = haversineMeters(21.4858, 39.1925, 24.7136, 46.6753);
    expect(ab).toBe(ba);
  });

  it("haversineMeters(Riyadh, Jeddah) ≈ 850km ± 5%", () => {
    // Sanity check the formula against a well-known distance:
    // Riyadh (24.7136, 46.6753) ↔ Jeddah (21.4858, 39.1925)
    // is about 849km great-circle.
    const m = haversineMeters(24.7136, 46.6753, 21.4858, 39.1925);
    expect(m).toBeGreaterThan(800_000);
    expect(m).toBeLessThan(900_000);
  });

  it("greedyAssign is deterministic — same input → same plan", () => {
    const bookings = [
      { id: 1, pickupLat: 24.7,  pickupLng: 46.6 },
      { id: 2, pickupLat: 24.8,  pickupLng: 46.7 },
    ];
    const vehicles = [
      { id: 10, driverId: 100, currentLat: 24.71, currentLng: 46.61 }, // close to booking 1
      { id: 11, driverId: 101, currentLat: 24.79, currentLng: 46.69 }, // close to booking 2
    ];
    const r1 = greedyAssign(bookings, vehicles);
    const r2 = greedyAssign(bookings, vehicles);
    expect(r1).toEqual(r2);
  });

  it("greedyAssign picks the NEAREST available vehicle for each booking", () => {
    const bookings = [
      { id: 1, pickupLat: 24.7, pickupLng: 46.6 },
    ];
    const vehicles = [
      { id: 10, driverId: 100, currentLat: 21.5, currentLng: 39.2 }, // FAR (Jeddah-ish)
      { id: 11, driverId: 101, currentLat: 24.7, currentLng: 46.6 }, // EXACT same as pickup
    ];
    const r = greedyAssign(bookings, vehicles);
    expect(r.assignments).toHaveLength(1);
    expect(r.assignments[0].vehicleId).toBe(11);
    expect(r.assignments[0].distanceMeters).toBe(0);
  });

  it("greedyAssign gives each vehicle AT MOST ONE booking per run", () => {
    const bookings = [
      { id: 1, pickupLat: 24.7,  pickupLng: 46.6 },
      { id: 2, pickupLat: 24.7,  pickupLng: 46.6 }, // identical to booking 1
    ];
    const vehicles = [
      { id: 10, driverId: 100, currentLat: 24.71, currentLng: 46.61 },
    ];
    const r = greedyAssign(bookings, vehicles);
    // First booking gets the only vehicle; second can't be placed.
    expect(r.assignments).toHaveLength(1);
    expect(r.unassigned).toEqual([2]);
  });

  it("greedyAssign reports unassigned booking ids when vehicles run out", () => {
    const bookings = [
      { id: 1, pickupLat: 24.7, pickupLng: 46.6 },
      { id: 2, pickupLat: 24.8, pickupLng: 46.7 },
      { id: 3, pickupLat: 24.9, pickupLng: 46.8 },
    ];
    const vehicles = [
      { id: 10, driverId: 100, currentLat: 24.7, currentLng: 46.6 },
    ];
    const r = greedyAssign(bookings, vehicles);
    expect(r.assignments).toHaveLength(1);
    expect(r.unassigned.sort()).toEqual([2, 3]);
  });

  it("greedyAssign assignments carry sequenceOrder = input index", () => {
    const bookings = [
      { id: 100, pickupLat: 24.7, pickupLng: 46.6 },
      { id: 200, pickupLat: 24.8, pickupLng: 46.7 },
      { id: 300, pickupLat: 24.9, pickupLng: 46.8 },
    ];
    const vehicles = [
      { id: 1, driverId: null, currentLat: 24.7, currentLng: 46.6 },
      { id: 2, driverId: null, currentLat: 24.8, currentLng: 46.7 },
      { id: 3, driverId: null, currentLat: 24.9, currentLng: 46.8 },
    ];
    const r = greedyAssign(bookings, vehicles);
    expect(r.assignments.map((a) => a.sequenceOrder)).toEqual([0, 1, 2]);
  });

  it("greedyAssign carries the Arabic reason 'أقرب مركبة متاحة'", () => {
    const r = greedyAssign(
      [{ id: 1, pickupLat: 24.7, pickupLng: 46.6 }],
      [{ id: 10, driverId: null, currentLat: 24.7, currentLng: 46.6 }],
    );
    expect(r.assignments[0].reason).toBe("أقرب مركبة متاحة");
  });
});

describe("TA-T18-VRP Phase 1 — input caps", () => {
  it("`VRP_INPUT_LIMITS` constants exposed for the route handler (Phase 2)", () => {
    expect(VRP_INPUT_LIMITS.maxBookingLines).toBe(200);
    expect(VRP_INPUT_LIMITS.maxVehicles).toBe(100);
  });

  it("`runOptimization` is documented to enforce the caps", () => {
    // The body of runOptimization throws Error if either cap is
    // exceeded — pinned via static read of the source.
    expect(SVC).toMatch(
      /input\.bookingLineIds\.length > VRP_INPUT_LIMITS\.maxBookingLines[\s\S]{0,200}?throw new Error/,
    );
    expect(SVC).toMatch(
      /input\.vehicleIds\.length > VRP_INPUT_LIMITS\.maxVehicles[\s\S]{0,200}?throw new Error/,
    );
  });
});

describe("TA-T18-VRP Phase 1 — design contract", () => {
  it("`runOptimization` records ONE row in `vrp_optimization_runs` and updates its status", () => {
    // The flow is: INSERT pending → UPDATE on success/failure. The
    // single-row guarantee is important: a failed solve still leaves
    // a row in 'failed' state so the operator can see why.
    expect(SVC).toMatch(/INSERT INTO vrp_optimization_runs[\s\S]+?VALUES[\s\S]+?'pending'/);
    expect(SVC).toMatch(/UPDATE vrp_optimization_runs[\s\S]+?status\s*=\s*'solved'/);
    expect(SVC).toMatch(/UPDATE vrp_optimization_runs[\s\S]+?status\s*=\s*'failed'/);
  });

  it("solver records the algorithm name on the run (forward-compat with Phase 2's OR-Tools swap)", () => {
    // Phase 3b promoted Kuhn-Munkres to the default; the persisted
    // algorithm string updated accordingly. The legacy 'greedy_nearest_neighbor'
    // value still appears in the LIB for the exported helper's reason
    // text — the SQL column write is the source of truth.
    expect(SVC).toMatch(/algorithm\s*=\s*'hungarian_min_distance'/);
  });

  it("optimizer is ADVISORY — never INSERTs/UPDATEs into transport_dispatch_orders", () => {
    // Defence-in-depth pin: Phase 1 is read-only against dispatch
    // orders. The approval flow (Phase 2) is what creates the real
    // dispatch orders — through the existing single-pair create path
    // which already re-validates every hard guard.
    expect(SVC).not.toMatch(/INSERT INTO transport_dispatch_orders/);
    expect(SVC).not.toMatch(/UPDATE transport_dispatch_orders/);
    expect(SVC).not.toMatch(/DELETE FROM transport_dispatch_orders/);
  });

  it("Phase 1 does NOT touch the assignment suggestion engine", () => {
    // The engine integration (Phase 2) is for the APPROVAL path, not
    // the solver. Keeping them decoupled lets Phase 2 swap OR-Tools
    // in without touching the engine.
    expect(SVC).not.toMatch(/assignmentSuggestionEngine|suggestAssignments/);
  });

  it("Phase 1 ships NO route handler — the API surface is deferred to Phase 2", () => {
    // Verifies the package boundary: only the migration + lib are in
    // this PR. The route file should not mention the optimizer yet.
    const fleetRoutes = readFileSync(
      join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"),
      "utf8",
    );
    expect(fleetRoutes).not.toMatch(/vrpOptimizer|runOptimization|\/fleet\/optimizer/);
  });

  it("Phase 1 does NOT touch any finance / GL / journal module", () => {
    // Boundary pin: the optimizer is operational, not financial.
    expect(SVC).not.toMatch(/financialEngine|postingEngine|journalEngine|generalLedger|invoiceLine/);
  });
});
