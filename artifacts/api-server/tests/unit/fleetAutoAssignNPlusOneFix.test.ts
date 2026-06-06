/**
 * Fleet auto-assign endpoint — N+1 fix static guard.
 *
 * POST /api/fleet/trips/auto-assign carried two N+1 patterns in its
 * candidate-selection queries:
 *
 *   1. Vehicle picker had TWO scalar subqueries (fleet_trips count +
 *      fleet_insurance max endDate) — 20 vehicles × 2 = ~41 lookups.
 *   2. Driver picker had TWO scalar subqueries on fleet_trips (one
 *      for status='completed', one for status='in_progress') —
 *      20 drivers × 2 = ~41 lookups.
 *
 * Total per auto-assign call: ~82 round-trips, every single trip
 * creation. The endpoint runs frequently (every new dispatch).
 *
 * The fix:
 *   - v_trip_counts + v_insurance_max CTEs for the vehicle picker.
 *   - Single d_trip_counts CTE using COUNT(*) FILTER (WHERE ...) so
 *     completed + in_progress are aggregated in one pass.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/fleet.ts"),
  "utf8",
);

describe("POST /fleet/trips/auto-assign — vehicle picker N+1 fix", () => {
  it("no longer carries a correlated COUNT(*) on fleet_trips inside the vehicle SELECT", () => {
    // The vehicle picker block sits between the vehicleId-null
    // guard and the candidate-loop. Slice that block and check.
    const block = SRC.slice(
      SRC.indexOf("if (!selectedVehicleId) {"),
      SRC.indexOf("if (!selectedDriverId) {"),
    );
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+fleet_trips\s+WHERE\s+"vehicleId"/,
    );
    expect(block).not.toMatch(
      /\(SELECT\s+MAX\([^)]+\)\s+FROM\s+fleet_insurance\s+WHERE\s+"vehicleId"/,
    );
  });

  it("uses v_trip_counts CTE to pre-aggregate vehicle trip counts once", () => {
    expect(SRC).toContain("WITH v_trip_counts AS");
    expect(SRC).toContain('SELECT "vehicleId", COUNT(*) AS "tripCount"');
    expect(SRC).toContain('GROUP BY "vehicleId"');
  });

  it("uses v_insurance_max CTE to pre-aggregate insurance max endDates", () => {
    expect(SRC).toContain("v_insurance_max AS");
    expect(SRC).toContain('SELECT "vehicleId", MAX("endDate") AS "insuranceEnd"');
  });

  it("LEFT JOINs both CTEs back to fleet_vehicles", () => {
    expect(SRC).toMatch(/LEFT JOIN v_trip_counts vtc ON vtc\."vehicleId" = v\.id/);
    expect(SRC).toMatch(/LEFT JOIN v_insurance_max vim ON vim\."vehicleId" = v\.id/);
  });
});

describe("POST /fleet/trips/auto-assign — driver picker N+1 fix", () => {
  it("no longer carries two correlated COUNT(*) subqueries on fleet_trips for driverId", () => {
    const block = SRC.slice(
      SRC.indexOf("if (!selectedDriverId) {"),
      SRC.indexOf("if (!selectedDriverId) {") + 3000,
    );
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+fleet_trips\s+WHERE\s+"driverId"=d\.id\s+AND\s+status='completed'/,
    );
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+fleet_trips\s+WHERE\s+"driverId"=d\.id\s+AND\s+status='in_progress'/,
    );
  });

  it("uses a single d_trip_counts CTE with COUNT(*) FILTER for both statuses", () => {
    expect(SRC).toContain("WITH d_trip_counts AS");
    // FILTER (WHERE status='completed') + FILTER (WHERE status='in_progress')
    // collapses two would-be queries into one scan.
    expect(SRC).toContain(`COUNT(*) FILTER (WHERE status='completed') AS "tripCount"`);
    expect(SRC).toContain(`COUNT(*) FILTER (WHERE status='in_progress') AS "activeTrips"`);
    expect(SRC).toContain('GROUP BY "driverId"');
  });

  it("LEFT JOINs d_trip_counts back to fleet_drivers", () => {
    expect(SRC).toMatch(/LEFT JOIN d_trip_counts dtc ON dtc\."driverId" = d\.id/);
  });

  it("COALESCEs both counters so drivers with no trips return 0", () => {
    expect(SRC).toContain('COALESCE(dtc."tripCount", 0)::int');
    expect(SRC).toContain('COALESCE(dtc."activeTrips", 0)::int');
  });
});
