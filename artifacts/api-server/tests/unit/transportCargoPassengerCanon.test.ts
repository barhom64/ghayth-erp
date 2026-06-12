import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 Comment 4663005810 — canonical cargo/passenger model split.
//
// User's mandate:
//   "الفصل النهائي للمسارات: رحلة ركاب / نقل حمولة
//    وإلغاء تضخم الأنواع المتكررة.
//
//    النموذج الرسمي:
//      Booking / Template → Legs / Route Pattern → Dispatch Order
//        → Driver Execution → Operational Close → Accounting Candidate"
//
// This test pins:
//   1. Migration 284 — tripFamily on bookings + route_patterns table
//      + vehicle technical-profile expansion
//   2. Backend: deriveTripFamily + tripFamily persisted on INSERT
//   3. Route-patterns CRUD + materialise endpoint
//   4. Operating-model doc §0-§K reflects the new canon

const apiSrc = join(import.meta.dirname!, "../../src");
const repoRoot = join(import.meta.dirname!, "../../../..");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readDoc = (rel: string) => readFileSync(join(repoRoot, rel), "utf8");

const MIGRATION = readApi("migrations/295_transport_cargo_passenger_canon.sql");
const ROUTER    = readApi("routes/transport-bookings.ts");
const PATTERNS  = readApi("routes/transport-route-patterns.ts");
const INDEX     = readApi("routes/index.ts");
const DOC       = readDoc("docs/TRANSPORT_OPERATING_MODEL.md");

describe("#1812 §K1-K6 — migration 284: cargo/passenger canon", () => {
  it("migration file has @rollback header", () => {
    expect(MIGRATION).toContain("@rollback");
  });

  it("adds tripFamily column + index", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "tripFamily" TEXT/);
    expect(MIGRATION).toMatch(/idx_transport_bookings_family/);
  });

  it("creates transport_route_patterns with the canonical schedule fields", () => {
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS transport_route_patterns");
    for (const col of [
      "patternCode", "daysOfWeekMask", "departureTime",
      "activeFrom", "activeUntil",
      "defaultVehicleClass", "defaultLicenseClass",
      "defaultCustomerId", "defaultContractId",
      "defaultCargoWeight", "operationalWaypoints",
    ]) {
      expect(MIGRATION, `route_patterns column ${col} missing`).toContain(`"${col}"`);
    }
    expect(MIGRATION).toContain("uq_route_pattern_code");
  });

  it("adds routePatternId back-link to bookings", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "routePatternId" INTEGER/);
    expect(MIGRATION).toMatch(/idx_transport_bookings_route_pattern/);
  });

  it("adds cargoOperationalMetadata jsonb", () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS "cargoOperationalMetadata" JSONB/);
  });

  it("expands fleet_vehicles with the user's 8 technical fields", () => {
    for (const col of [
      "operationalPayloadKg",
      "boxLengthCm", "boxWidthCm", "boxHeightCm",
      "axleCount", "tireCount",
      "validForPassengers", "validForCargo",
    ]) {
      expect(MIGRATION, `vehicle column ${col} missing`).toContain(`"${col}"`);
    }
  });

  it("adds family-filter partial indexes for the assignment engine", () => {
    expect(MIGRATION).toMatch(/idx_fleet_vehicles_valid_cargo/);
    expect(MIGRATION).toMatch(/idx_fleet_vehicles_valid_passengers/);
  });
});

describe("#1812 §K3-K4 — backend deriveTripFamily + persistence", () => {
  it("declares the family discriminator + helper", () => {
    expect(ROUTER).toContain("TRIP_FAMILIES");
    expect(ROUTER).toContain("function deriveTripFamily");
  });

  it("cargo_load → cargo (unambiguous)", () => {
    expect(ROUTER).toMatch(/if \(serviceType === "cargo_load"\) return "cargo"/);
  });

  it("passenger_umrah + passenger_general → passenger (unambiguous)", () => {
    expect(ROUTER).toMatch(/serviceType === "passenger_umrah"[\s\S]{0,80}return "passenger"/);
  });

  it("hybrid cases tilt by data (passengerCount > 0 → passenger, cargoWeight > 0 → cargo)", () => {
    expect(ROUTER).toMatch(/if \(\(passengerCount \?\? 0\) > 0\) return "passenger"/);
    expect(ROUTER).toMatch(/if \(\(cargoWeight \?\? 0\) > 0\) return "cargo"/);
  });

  it("INSERT writes the tripFamily column derived from request", () => {
    expect(ROUTER).toMatch(/"tripFamily"\)/);
    expect(ROUTER).toMatch(/deriveTripFamily\(b\.transportServiceType, b\.passengerCount, b\.cargoWeight\)/);
  });
});

describe("#1812 §K4 — route-patterns CRUD + materialise", () => {
  it("file exists at the canonical route path", () => {
    expect(existsSync(join(apiSrc, "routes/transport-route-patterns.ts"))).toBe(true);
  });

  it("exposes the 6 expected endpoints", () => {
    expect(PATTERNS).toMatch(/\.get\(\s*"\/transport\/route-patterns"/);
    expect(PATTERNS).toMatch(/\.post\(\s*"\/transport\/route-patterns"/);
    expect(PATTERNS).toMatch(/\.get\(\s*"\/transport\/route-patterns\/:id"/);
    expect(PATTERNS).toMatch(/\.patch\(\s*"\/transport\/route-patterns\/:id"/);
    expect(PATTERNS).toMatch(/\.delete\(\s*"\/transport\/route-patterns\/:id"/);
    expect(PATTERNS).toMatch(/\.post\(\s*"\/transport\/route-patterns\/:id\/materialise"/);
  });

  it("materialise creates a booking with bookingSource = recurring_schedule + tripFamily = cargo", () => {
    expect(PATTERNS).toMatch(/'recurring_schedule'[\s\S]{0,40}'cargo_load'/);
    expect(PATTERNS).toMatch(/'cargo'/);
    expect(PATTERNS).toMatch(/routePatternId/);
  });

  it("exports the dayMaskIncludes helper (cron uses it to filter active patterns by today's weekday)", () => {
    expect(PATTERNS).toContain("export function dayMaskIncludes");
    expect(PATTERNS).toMatch(/\(mask & \(1 << dayOfWeek\)\) !== 0/);
  });

  it("router mounted in index.ts with fleet+financial guards", () => {
    expect(INDEX).toContain("transportRoutePatternsRouter");
    // #1959: gated by the path-conditional fleet+financial transportPathGate.
    expect(INDEX).toContain('const fleetModuleGate = requireModule("fleet")');
    expect(INDEX).toContain('const transportFinancialGate = requireGuards("financial")');
    expect(INDEX).toMatch(/router\.use\(transportPathGate\)/);
  });
});

describe("#1812 — Operating Model doc reflects the canon", () => {
  it("declares §0 — two families, one canonical flow", () => {
    expect(DOC).toContain("§0 — Two trip families. One canonical flow.");
    expect(DOC).toContain("Booking / Template");
    expect(DOC).toContain("Legs / Route Pattern");
    expect(DOC).toContain("Dispatch Order");
    expect(DOC).toContain("Driver Execution");
    expect(DOC).toContain("Operational Close");
    expect(DOC).toContain("Accounting Candidate");
  });

  it("declares tripFamily semantics + recurring_schedule bookingSource", () => {
    expect(DOC).toContain("tripFamily");
    expect(DOC).toContain("`passenger`");
    expect(DOC).toContain("`cargo`");
    expect(DOC).toContain("recurring_schedule");
  });

  it("§C passenger contract + §D cargo contract present", () => {
    expect(DOC).toContain("§C — Passenger family contract");
    expect(DOC).toContain("§D — Cargo family contract");
    expect(DOC).toContain("cargoOperationalMetadata");
    expect(DOC).toContain("loadingPoints");
    expect(DOC).toContain("scale");
    expect(DOC).toContain("inspection");
    expect(DOC).toContain("restStops");
    expect(DOC).toContain("fuelStops");
    expect(DOC).toContain("unloading");
  });

  it("§E vehicle technical profile lists the user's 8 fields", () => {
    expect(DOC).toContain("§E — Vehicle technical profile");
    expect(DOC).toContain("operationalPayloadKg");
    expect(DOC).toContain("boxLengthCm");
    expect(DOC).toContain("axleCount");
    expect(DOC).toContain("tireCount");
    expect(DOC).toContain("validForPassengers");
    expect(DOC).toContain("validForCargo");
  });

  it("§K acceptance journey lists the 6 user-mandated scenarios", () => {
    expect(DOC).toContain("### 1. رحلة ركاب من العمرة");
    expect(DOC).toContain("### 2. رحلة ركاب للسائق");
    expect(DOC).toContain("### 3. حمولة مرة واحدة");
    expect(DOC).toContain("### 4. حمولة متكررة");
    expect(DOC).toContain("### 5. تجربة السائق");
    expect(DOC).toContain("### 6. تجربة الإداري");
  });
});
