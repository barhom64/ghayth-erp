import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 Vehicle profile deep extension (Issue Comment 7). Locks in:
//   1. Migration 267 + schema dump carry the three new tables +
//      fleet_tires column extensions.
//   2. Routes file exposes the three sub-resources hung off
//      /fleet/vehicles/:vehicleId.
//   3. Vehicle-driver-assignments enforces the "one active primary per
//      vehicle" rule via partial unique index AND ends the previous
//      primary before inserting a new one.
//   4. vehicle_components has the right type alphabet (22 entries from
//      Comment 7's catalogue).
//   5. vehicle_maintenance_schedules carries the three interval types
//      (mileage / hours / days).

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const repoRoot = join(import.meta.dirname!, "../../../../");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const PROFILE_ROUTE = read("routes/vehicle-profile.ts");
const ROUTES_INDEX = read("routes/index.ts");

const COMPONENT_TYPES = [
  "engine", "transmission", "axle", "battery",
  "ac_unit", "cooling_unit", "hydraulic_system", "lift_gate", "crane",
  "box_or_bed", "trailer", "doors", "seats", "upholstery", "screens",
  "brakes", "suspension", "steering", "safety_system",
  "fuel_system", "electrical_system", "other",
] as const;

const TIRE_NEW_COLUMNS = [
  "axleNumber", "side", "serialNumber",
  "currentMileageKm", "expectedLifeKm", "removalReason",
];

describe("#1733 Vehicle profile — migration 267 + schema dump", () => {
  it("migration 267 declares the three tables + extends fleet_tires", () => {
    const migPath = join(apiSrc, "migrations", "267_vehicle_components_assignments.sql");
    expect(existsSync(migPath), "migration 267 missing").toBe(true);
    const sql = readFileSync(migPath, "utf8");

    // The three new tables.
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.vehicle_components");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.vehicle_driver_assignments");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.vehicle_maintenance_schedules");

    // fleet_tires extensions — `side` is an unquoted SQL identifier, the
    // rest are camelCase so they need the quoted form.
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "axleNumber"/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS side/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "serialNumber"/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "currentMileageKm"/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "expectedLifeKm"/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS "removalReason"/);

    // Component type alphabet (sampled).
    for (const t of ["engine", "transmission", "ac_unit", "hydraulic_system", "lift_gate", "crane"]) {
      expect(sql, `component type ${t} missing`).toContain(`'${t}'`);
    }

    // Interval types.
    for (const i of ["mileage", "hours", "days"]) {
      expect(sql, `interval ${i} missing`).toContain(`'${i}'`);
    }

    // Partial unique on active primary.
    expect(sql).toContain("uq_vehicle_active_primary");
    expect(sql).toMatch(/WHERE status = 'active' AND "assignmentType" = 'primary'/);
  });

  it("schema dump carries the three tables + tire extensions + PKs + indexes", () => {
    const pre = readFileSync(join(repoRoot, "db", "schema_pre.sql"), "utf8");
    const post = readFileSync(join(repoRoot, "db", "schema_post.sql"), "utf8");

    // tire extensions appear inline in CREATE TABLE.
    const tireBlock = pre.match(/CREATE TABLE public\.fleet_tires[\s\S]+?\)\s*;\s*\n/)?.[0]!;
    expect(tireBlock).toMatch(/"axleNumber"\s+integer/);
    expect(tireBlock).toMatch(/\bside\s+text/);
    expect(tireBlock).toContain('"serialNumber"');
    expect(tireBlock).toContain('"currentMileageKm"');
    expect(tireBlock).toContain('"expectedLifeKm"');
    expect(tireBlock).toContain('"removalReason"');
    // new tables.
    expect(pre).toContain("CREATE TABLE public.vehicle_components");
    expect(pre).toContain("CREATE TABLE public.vehicle_driver_assignments");
    expect(pre).toContain("CREATE TABLE public.vehicle_maintenance_schedules");

    // post: PKs + unique + indexes.
    expect(post).toContain("vehicle_components_pkey");
    expect(post).toContain("vehicle_driver_assignments_pkey");
    expect(post).toContain("vehicle_maintenance_schedules_pkey");
    expect(post).toContain("uq_vehicle_active_primary");
    expect(post).toContain("idx_vehicle_components_next_service");
    expect(post).toContain("idx_maintenance_schedules_due");
    expect(post).toContain("idx_fleet_tires_axle");
  });
});

describe("#1733 Vehicle profile — route surface", () => {
  it("vehicle-profile.ts exposes the three sub-resources for both list and mutate", () => {
    expect(PROFILE_ROUTE).toMatch(/\.get\(\s*["']\/fleet\/vehicles\/:vehicleId\/components["']/);
    expect(PROFILE_ROUTE).toMatch(/\.post\(\s*["']\/fleet\/vehicles\/:vehicleId\/components["']/);
    expect(PROFILE_ROUTE).toMatch(/\.patch\(\s*["']\/fleet\/vehicles\/:vehicleId\/components\/:id["']/);

    expect(PROFILE_ROUTE).toMatch(/\.get\(\s*["']\/fleet\/vehicles\/:vehicleId\/driver-assignments["']/);
    expect(PROFILE_ROUTE).toMatch(/\.post\(\s*["']\/fleet\/vehicles\/:vehicleId\/driver-assignments["']/);
    expect(PROFILE_ROUTE).toMatch(/\.patch\(\s*["']\/fleet\/vehicles\/:vehicleId\/driver-assignments\/:id["']/);

    expect(PROFILE_ROUTE).toMatch(/\.get\(\s*["']\/fleet\/vehicles\/:vehicleId\/maintenance-schedules["']/);
    expect(PROFILE_ROUTE).toMatch(/\.post\(\s*["']\/fleet\/vehicles\/:vehicleId\/maintenance-schedules["']/);
    expect(PROFILE_ROUTE).toMatch(/\.patch\(\s*["']\/fleet\/vehicles\/:vehicleId\/maintenance-schedules\/:id["']/);
  });

  it("creating a primary assignment ends the existing active primary before inserting", () => {
    // The route MUST run the UPDATE … SET status='ended' BEFORE the
    // INSERT — otherwise the partial unique fires as a 409 and the
    // operator's intent (replace primary driver) silently fails.
    const block = PROFILE_ROUTE.match(
      /assignmentType === "primary"[\s\S]{0,1500}?INSERT INTO vehicle_driver_assignments/,
    )?.[0];
    expect(block, "primary handoff missing").toBeTruthy();
    expect(block!).toContain("UPDATE vehicle_driver_assignments");
    expect(block!).toContain("status = 'ended'");
  });

  it("component CRUD uses the full COMPONENT_TYPES alphabet from Comment 7", () => {
    expect(PROFILE_ROUTE).toContain("COMPONENT_TYPES");
    for (const t of COMPONENT_TYPES) {
      expect(PROFILE_ROUTE, `component type ${t} missing from route`).toContain(`"${t}"`);
    }
  });

  it("router is mounted with module + financial guards", () => {
    expect(ROUTES_INDEX).toContain("vehicleProfileRouter");
    // #1959: gated by the path-conditional fleet+financial transportPathGate.
    expect(ROUTES_INDEX).toContain('const fleetModuleGate = requireModule("fleet")');
    expect(ROUTES_INDEX).toContain('const transportFinancialGate = requireGuards("financial")');
    expect(ROUTES_INDEX).toMatch(/router\.use\(transportPathGate\)/);
  });
});
