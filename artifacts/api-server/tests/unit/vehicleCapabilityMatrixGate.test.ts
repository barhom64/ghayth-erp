import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeVcm,
  effectiveCapacity,
  isEligibleForTripFamily,
  VCM_MIN_COMPLETENESS,
  type VehicleRowForVcm,
} from "../../src/lib/fleet/vehicleCapabilityMatrix.js";

/**
 * #2079 Gate-PE-1 — Vehicle Capability Matrix.
 *
 * The owner's two scenarios on 2026-06-11 drive these tests:
 *   • «طلب عمرة 45 راكب → قد يقترح النظام مركبة لا تستوعب العدد»
 *   • «حمولة 38 طن وحمولة تشغيلية 30 طن»
 *
 * Both must close at the matrix gate (eligibility / completeness)
 * or in the engine's capacity scorer (operational vs. nominal cap).
 *
 * Plus structural pins on the migration, schema, INSERT/PATCH, and
 * the engine wiring so a future agent can't silently dismantle it.
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const ENGINE = readFileSync(join(apiSrc, "lib/fleet/assignmentSuggestionEngine.ts"), "utf8");
const FLEET  = readFileSync(join(apiSrc, "routes/fleet.ts"), "utf8");
const MIG    = readFileSync(join(apiSrc, "migrations/315_vehicle_capability_matrix.sql"), "utf8");

/* ── Test fixtures ───────────────────────────────────────────────── */

const FULLY_PROFILED_TRUCK: VehicleRowForVcm = {
  id: 1,
  vehicleType: "truck",
  fuelType: "diesel",
  payloadKg: "40000",
  operationalPayloadKg: "30000",
  boxLengthCm: 800, boxWidthCm: 240, boxHeightCm: 280,
  axleCount: 3, tireCount: 12, tireSize: "295/80R22.5",
  seatCount: 3, operationalPassengerCapacity: null,
  hasAc: true, screenCount: 0, doorCount: 2,
  upholsteryType: "fabric", safetyFeatures: ["abs", "airbag"],
  operatingHours: null, equipmentAttachments: null,
  validForPassengers: false, validForCargo: true,
  vehicleServiceTypes: ["cargo_load"],
  engineDisplacementCc: 12000, transmissionType: "manual",
};

const FULLY_PROFILED_BUS: VehicleRowForVcm = {
  id: 2,
  vehicleType: "bus",
  fuelType: "diesel",
  payloadKg: null, operationalPayloadKg: null,
  boxLengthCm: null, boxWidthCm: null, boxHeightCm: null,
  axleCount: 2, tireCount: 6, tireSize: "11R22.5",
  seatCount: 50, operationalPassengerCapacity: "45",
  hasAc: true, screenCount: 4, doorCount: 2,
  upholsteryType: "leather", safetyFeatures: ["abs", "seatbelt"],
  operatingHours: null, equipmentAttachments: null,
  validForPassengers: true, validForCargo: false,
  vehicleServiceTypes: ["passenger_umrah", "passenger_general"],
  engineDisplacementCc: 9000, transmissionType: "automatic",
};

const UNPROFILED_LEGACY: VehicleRowForVcm = {
  id: 3,
  vehicleType: null, fuelType: null,
  payloadKg: null, operationalPayloadKg: null,
  boxLengthCm: null, boxWidthCm: null, boxHeightCm: null,
  axleCount: null, tireCount: null, tireSize: null,
  seatCount: null, operationalPassengerCapacity: null,
  hasAc: null, screenCount: null, doorCount: null,
  upholsteryType: null, safetyFeatures: null,
  operatingHours: null, equipmentAttachments: null,
  validForPassengers: null, validForCargo: null,
  vehicleServiceTypes: null,
  engineDisplacementCc: null, transmissionType: null,
};

/* ── computeVcm ─────────────────────────────────────────────────── */

describe("#2079 Gate-PE-1 — computeVcm", () => {
  it("coerces NUMERIC string columns to numbers", () => {
    const vcm = computeVcm(FULLY_PROFILED_TRUCK);
    expect(vcm.family.cargo.nominalPayloadKg).toBe(40000);
    expect(vcm.family.cargo.operationalPayloadKg).toBe(30000);
  });

  it("falls back operational→nominal when operational is null (legacy fleet)", () => {
    const v = { ...FULLY_PROFILED_BUS, operationalPassengerCapacity: null };
    const vcm = computeVcm(v);
    expect(vcm.family.passengers.operationalSeats).toBe(50);
  });

  it("scores completeness by safety-relevant fields only, not cosmetic ones", () => {
    const truck = computeVcm(FULLY_PROFILED_TRUCK);
    expect(truck.completeness).toBeGreaterThanOrEqual(VCM_MIN_COMPLETENESS);
    const legacy = computeVcm(UNPROFILED_LEGACY);
    expect(legacy.completeness).toBe(0);
  });
});

/* ── isEligibleForTripFamily ────────────────────────────────────── */

describe("#2079 Gate-PE-1 — isEligibleForTripFamily (owner's scenarios)", () => {
  it("cargo-only trailer is REJECTED for a passenger_umrah booking", () => {
    const vcm = computeVcm(FULLY_PROFILED_TRUCK);
    const v = isEligibleForTripFamily(vcm, "passenger", "passenger_umrah");
    expect(v.eligible).toBe(false);
    expect(v.reason).toMatch(/غير مخصصة لنقل الركاب/);
  });

  it("passenger-only bus is REJECTED for a cargo_load booking", () => {
    const vcm = computeVcm(FULLY_PROFILED_BUS);
    const v = isEligibleForTripFamily(vcm, "cargo", "cargo_load");
    expect(v.eligible).toBe(false);
    expect(v.reason).toMatch(/غير مخصصة لنقل الحمولة/);
  });

  it("under-profiled vehicle (completeness<70) is REJECTED regardless of family", () => {
    const vcm = computeVcm(UNPROFILED_LEGACY);
    const v = isEligibleForTripFamily(vcm, "passenger", "passenger_general");
    expect(v.eligible).toBe(false);
    expect(v.reason).toMatch(/الملف الفني للمركبة غير مكتمل/);
  });

  it("vehicleServiceTypes allowlist rejects non-listed serviceType", () => {
    const vcm = computeVcm(FULLY_PROFILED_BUS);
    const v = isEligibleForTripFamily(vcm, "passenger", "internal_transfer");
    expect(v.eligible).toBe(false);
    expect(v.reason).toMatch(/غير مدرج في الخدمات المعتمدة/);
  });

  it("fully-profiled bus is ELIGIBLE for passenger_umrah", () => {
    const vcm = computeVcm(FULLY_PROFILED_BUS);
    const v = isEligibleForTripFamily(vcm, "passenger", "passenger_umrah");
    expect(v.eligible).toBe(true);
    expect(v.reason).toBeNull();
  });

  it("fully-profiled truck is ELIGIBLE for cargo_load", () => {
    const vcm = computeVcm(FULLY_PROFILED_TRUCK);
    const v = isEligibleForTripFamily(vcm, "cargo", "cargo_load");
    expect(v.eligible).toBe(true);
  });
});

/* ── effectiveCapacity — owner's «38 طن / 30 طن آمنة» scenario ──── */

describe("#2079 Gate-PE-1 — effectiveCapacity honours operational vs nominal", () => {
  it("truck with payloadKg=40000 + operationalPayloadKg=30000 returns effective=30000, marginal=true", () => {
    const vcm = computeVcm(FULLY_PROFILED_TRUCK);
    const cap = effectiveCapacity(vcm, "cargo");
    expect(cap.effective).toBe(30000);
    expect(cap.nominal).toBe(40000);
    expect(cap.marginal).toBe(true);
  });

  it("bus with seatCount=50 + operationalPassengerCapacity=45 returns effective=45", () => {
    const vcm = computeVcm(FULLY_PROFILED_BUS);
    const cap = effectiveCapacity(vcm, "passenger");
    expect(cap.effective).toBe(45);
    expect(cap.nominal).toBe(50);
    expect(cap.marginal).toBe(true);
  });

  it("absent both nominal+operational returns effective=null (engine treats as unknown)", () => {
    const vcm = computeVcm(UNPROFILED_LEGACY);
    expect(effectiveCapacity(vcm, "cargo").effective).toBeNull();
    expect(effectiveCapacity(vcm, "passenger").effective).toBeNull();
  });
});

/* ── Engine wiring ──────────────────────────────────────────────── */

describe("#2079 Gate-PE-1 — engine wires VCM before scoring", () => {
  it("imports the matrix helpers from the canonical path", () => {
    expect(ENGINE).toMatch(/from "\.\/vehicleCapabilityMatrix\.js"/);
    expect(ENGINE).toMatch(/computeVcm/);
    expect(ENGINE).toMatch(/isEligibleForTripFamily/);
    expect(ENGINE).toMatch(/effectiveCapacity/);
  });

  it("vehicle SELECT hydrates the VCM fields", () => {
    for (const col of [
      "operationalPayloadKg",
      "operationalPassengerCapacity",
      "validForPassengers",
      "validForCargo",
      "vehicleServiceTypes",
      "fuelType",
      "axleCount",
      "transmissionType",
    ]) {
      expect(ENGINE, `column ${col} missing from vehicle SELECT`).toContain(`v."${col}"`);
    }
  });

  it("hard-ejects ineligible vehicles BEFORE the scoring loop", () => {
    expect(ENGINE).toMatch(/const eligibleVehicles: VehicleRow\[\] = \[\];/);
    expect(ENGINE).toMatch(/isEligibleForTripFamily\(vcm, tripFamily, booking\.transportServiceType\)/);
    expect(ENGINE).toMatch(/if \(!verdict\.eligible\) continue;/);
    expect(ENGINE).toMatch(/for \(const v of eligibleVehicles\)/);
  });

  it("capacity scorer uses effectiveCapacity (not raw payloadKg/seatCount)", () => {
    const scorer = ENGINE.slice(ENGINE.indexOf("─ capacity (weight 20)"));
    expect(scorer).toMatch(/effectiveCapacity\(vcm, "cargo"\)/);
    expect(scorer).toMatch(/effectiveCapacity\(vcm, "passenger"\)/);
  });

  it("marginal band (request ≤ nominal but > operational) scores 60 + soft reason, not blocker", () => {
    const scorer = ENGINE.slice(ENGINE.indexOf("─ capacity (weight 20)"));
    expect(scorer).toMatch(/nominal != null && nominal >= cargoKg[\s\S]{0,200}capacityScore = 60/);
    expect(scorer).toMatch(/الحمولة التشغيلية الآمنة/);
    expect(scorer).toMatch(/nominal != null && nominal >= passengers[\s\S]{0,200}capacityScore = 60/);
  });
});

/* ── Schema + INSERT + PATCH wiring ─────────────────────────────── */

describe("#2079 Gate-PE-1 — fleet.ts accepts the new VCM canon columns", () => {
  it("zod schema accepts operationalPassengerCapacity + vehicleServiceTypes", () => {
    expect(FLEET).toMatch(/operationalPassengerCapacity: z\.coerce\.number\(\)\.nonnegative\(\)\.optional\(\)/);
    expect(FLEET).toMatch(/vehicleServiceTypes: z\.array\(z\.enum/);
  });

  it("INSERT column list + bindings cover the two new columns", () => {
    expect(FLEET).toMatch(/"operationalPassengerCapacity","vehicleServiceTypes"/);
    expect(FLEET).toMatch(/b\.operationalPassengerCapacity \?\? null/);
    expect(FLEET).toMatch(/b\.vehicleServiceTypes \?\? null/);
  });

  it("PATCH whitelist + colMap carry the two new columns", () => {
    const start = FLEET.indexOf("const trackedFields");
    const end = FLEET.indexOf("] as const;", start);
    const block = FLEET.slice(start, end);
    expect(block).toMatch(/operationalPassengerCapacity/);
    expect(block).toMatch(/vehicleServiceTypes/);
    expect(FLEET).toMatch(/operationalPassengerCapacity: '"operationalPassengerCapacity"'/);
    expect(FLEET).toMatch(/vehicleServiceTypes: '"vehicleServiceTypes"'/);
  });
});

/* ── Migration 315 ──────────────────────────────────────────────── */

describe("#2079 Gate-PE-1 — migration 315 shape", () => {
  it("adds operationalPassengerCapacity NUMERIC + vehicleServiceTypes TEXT[]", () => {
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS "operationalPassengerCapacity" NUMERIC/);
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS "vehicleServiceTypes"\s+TEXT\[\]/);
  });

  it("constrains vehicleServiceTypes against the same enum as booking serviceType", () => {
    expect(MIG).toMatch(/fleet_vehicles_service_types_check/);
    for (const t of [
      "cargo_load","passenger_umrah","passenger_general",
      "equipment_rental","internal_transfer","other",
    ]) {
      expect(MIG, `service type ${t} missing from CHECK`).toContain(`'${t}'`);
    }
  });

  it("CHECKs operationalPassengerCapacity ≤ seatCount to refuse data-entry mistakes", () => {
    expect(MIG).toMatch(/fleet_vehicles_op_pax_within_seats_check/);
    expect(MIG).toMatch(/"operationalPassengerCapacity" <= "seatCount"/);
  });

  it("declares a rollback block (project rule)", () => {
    expect(MIG).toMatch(/@rollback:/);
    expect(MIG).toMatch(/DROP COLUMN IF EXISTS "operationalPassengerCapacity"/);
    expect(MIG).toMatch(/DROP COLUMN IF EXISTS "vehicleServiceTypes"/);
  });
});
