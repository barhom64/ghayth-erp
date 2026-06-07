import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 Phase 2 — driver license-class eligibility.
//
// Mirror of the #1733 Blocker #2 capacity tests. Locks in:
//   1. The KSA-aligned license-class hierarchy (heavy ⊇ medium ⊇
//      light_trans ⊇ private; public_trans / motorcycle / equipment
//      are separate branches).
//   2. assertDriverEligibility — unknown / covers / missing+no-reason
//      reject / missing+with-reason accept.
//   3. The migration + schema dump carry the columns + override table.
//   4. The cargo PATCH wires the guard at the same hookpoint as the
//      capacity guard (confirmed lock-in OR driver/vehicle swap).

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const repoRoot = join(import.meta.dirname!, "../../../../");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const FLEET_ROUTE = read("routes/fleet.ts");
const CARGO_ROUTE = read("routes/cargo.ts");
const ELIG_LIB = read("lib/fleet/driverEligibility.ts");

describe("#1733 Phase 2 — driverCoversVehicle hierarchy", () => {
  it("heavy covers medium / light_trans / private + itself; not bus", async () => {
    const { driverCoversVehicle } = await import(
      "../../src/lib/fleet/driverEligibility.js"
    );
    expect(driverCoversVehicle("heavy", "heavy")).toBe("covers");
    expect(driverCoversVehicle("heavy", "medium")).toBe("covers");
    expect(driverCoversVehicle("heavy", "light_trans")).toBe("covers");
    expect(driverCoversVehicle("heavy", "private")).toBe("covers");
    expect(driverCoversVehicle("heavy", "public_trans")).toBe("missing");
    expect(driverCoversVehicle("heavy", "motorcycle")).toBe("missing");
  });

  it("a public_trans driver isn't qualified for a heavy truck and vice versa", async () => {
    const { driverCoversVehicle } = await import(
      "../../src/lib/fleet/driverEligibility.js"
    );
    // Bus driver can drive a bus but not a truck.
    expect(driverCoversVehicle("public_trans", "public_trans")).toBe("covers");
    expect(driverCoversVehicle("public_trans", "heavy")).toBe("missing");
    expect(driverCoversVehicle("public_trans", "private")).toBe("missing");
    // Truck driver can't drive a bus.
    expect(driverCoversVehicle("heavy", "public_trans")).toBe("missing");
  });

  it("either side NULL → unknown (soft path)", async () => {
    const { driverCoversVehicle } = await import(
      "../../src/lib/fleet/driverEligibility.js"
    );
    expect(driverCoversVehicle(null, "heavy")).toBe("unknown");
    expect(driverCoversVehicle("heavy", null)).toBe("unknown");
    expect(driverCoversVehicle(null, null)).toBe("unknown");
  });

  it("private licence does NOT cover anything above private", async () => {
    const { driverCoversVehicle } = await import(
      "../../src/lib/fleet/driverEligibility.js"
    );
    expect(driverCoversVehicle("private", "light_trans")).toBe("missing");
    expect(driverCoversVehicle("private", "medium")).toBe("missing");
    expect(driverCoversVehicle("private", "heavy")).toBe("missing");
    expect(driverCoversVehicle("private", "private")).toBe("covers");
  });
});

describe("#1733 Phase 2 — assertDriverEligibility behaviour", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("soft-allows when either side's licenseClass is NULL", async () => {
    vi.doMock("../../src/lib/rawdb.js", () => ({
      rawQuery: vi.fn().mockResolvedValue([{ driverClass: null, vehicleRequired: "heavy" }]),
      rawExecute: vi.fn(),
    }));
    vi.doMock("../../src/lib/businessHelpers.js", () => ({
      emitEvent: vi.fn().mockResolvedValue(undefined),
    }));
    const { assertDriverEligibility } = await import(
      "../../src/lib/fleet/driverEligibility.js"
    );
    const { rawExecute } = await import("../../src/lib/rawdb.js");
    const result = await assertDriverEligibility({
      companyId: 1, branchId: 1, userId: 7,
      driverId: 10, vehicleId: 20,
      sourceType: "cargo_manifest", sourceId: 100,
    });
    expect(result.ok).toBe(true);
    expect(result.unknown).toBe(true);
    expect((rawExecute as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("allows when driver's class covers the vehicle's requirement", async () => {
    vi.doMock("../../src/lib/rawdb.js", () => ({
      rawQuery: vi.fn().mockResolvedValue([{ driverClass: "heavy", vehicleRequired: "medium" }]),
      rawExecute: vi.fn(),
    }));
    vi.doMock("../../src/lib/businessHelpers.js", () => ({
      emitEvent: vi.fn().mockResolvedValue(undefined),
    }));
    const { assertDriverEligibility } = await import(
      "../../src/lib/fleet/driverEligibility.js"
    );
    const { rawExecute } = await import("../../src/lib/rawdb.js");
    const result = await assertDriverEligibility({
      companyId: 1, branchId: 1, userId: 7,
      driverId: 10, vehicleId: 20,
      sourceType: "cargo_manifest", sourceId: 100,
    });
    expect(result).toEqual({ ok: true, driverClass: "heavy", vehicleRequired: "medium" });
    expect((rawExecute as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it("rejects when driver's class is insufficient and NO overrideReason", async () => {
    vi.doMock("../../src/lib/rawdb.js", () => ({
      rawQuery: vi.fn().mockResolvedValue([{ driverClass: "private", vehicleRequired: "heavy" }]),
      rawExecute: vi.fn(),
    }));
    vi.doMock("../../src/lib/businessHelpers.js", () => ({
      emitEvent: vi.fn().mockResolvedValue(undefined),
    }));
    const { assertDriverEligibility } = await import(
      "../../src/lib/fleet/driverEligibility.js"
    );
    const { ValidationError } = await import("../../src/lib/errorHandler.js");
    await expect(
      assertDriverEligibility({
        companyId: 1, branchId: 1, userId: 7,
        driverId: 10, vehicleId: 20,
        sourceType: "cargo_manifest", sourceId: 100,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("records a documented exception when overrideReason is supplied", async () => {
    const rawExecute = vi.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 });
    const emitEvent = vi.fn().mockResolvedValue(undefined);
    vi.doMock("../../src/lib/rawdb.js", () => ({
      rawQuery: vi.fn().mockResolvedValue([{ driverClass: "private", vehicleRequired: "heavy" }]),
      rawExecute,
    }));
    vi.doMock("../../src/lib/businessHelpers.js", () => ({ emitEvent }));
    const { assertDriverEligibility } = await import(
      "../../src/lib/fleet/driverEligibility.js"
    );
    const result = await assertDriverEligibility({
      companyId: 1, branchId: 1, userId: 7,
      driverId: 10, vehicleId: 20,
      sourceType: "cargo_manifest", sourceId: 100,
      overrideReason: "حالة طارئة وافق عليها مدير الأسطول",
    });
    expect(result).toMatchObject({ ok: true, override: true });
    expect(rawExecute).toHaveBeenCalledOnce();
    const [sql, params] = rawExecute.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO driver_eligibility_overrides");
    expect(sql).toContain("ON CONFLICT");
    expect(params).toContain("حالة طارئة وافق عليها مدير الأسطول");
    expect(emitEvent.mock.calls.at(-1)![0].action).toBe(
      "fleet.driver.eligibility.exception",
    );
  });
});

describe("#1733 Phase 2 — migration 264 + schema dump", () => {
  it("migration 264 adds the columns + override table", () => {
    const migPath = join(
      apiSrc,
      "migrations",
      "264_fleet_driver_license_eligibility.sql",
    );
    expect(existsSync(migPath), "migration 264 missing").toBe(true);
    const sql = readFileSync(migPath, "utf8");
    expect(sql).toMatch(/ALTER TABLE public\.fleet_drivers\s+ADD COLUMN IF NOT EXISTS "licenseClass"/);
    expect(sql).toMatch(/ALTER TABLE public\.fleet_vehicles\s+ADD COLUMN IF NOT EXISTS "requiredLicenseClass"/);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.driver_eligibility_overrides");
    expect(sql).toContain("uq_eligibility_override_source");
  });

  it("schema dump carries the columns + table + PK + indexes", () => {
    const pre = readFileSync(join(repoRoot, "db", "schema_pre.sql"), "utf8");
    const post = readFileSync(join(repoRoot, "db", "schema_post.sql"), "utf8");
    const driversBlock = pre.match(
      /CREATE TABLE public\.fleet_drivers[\s\S]+?\)\s*;\s*\n/,
    )?.[0]!;
    expect(driversBlock).toContain("licenseClass");
    const vehiclesBlock = pre.match(
      /CREATE TABLE public\.fleet_vehicles[\s\S]+?\)\s*;\s*\n/,
    )?.[0]!;
    expect(vehiclesBlock).toContain("requiredLicenseClass");
    expect(pre).toContain("CREATE TABLE public.driver_eligibility_overrides");
    expect(post).toContain("driver_eligibility_overrides_pkey");
    expect(post).toContain("uq_eligibility_override_source");
  });
});

describe("#1733 Phase 2 — cargo PATCH calls the eligibility guard", () => {
  it("cargo.ts imports assertDriverEligibility and calls it at confirmed lock-in or driver/vehicle swap", () => {
    expect(CARGO_ROUTE).toContain("assertDriverEligibility");
    const block = CARGO_ROUTE.match(
      /assertDriverEligibility\(\{[\s\S]{0,500}?\}\)/,
    )?.[0]!;
    expect(block).toContain('sourceType: "cargo_manifest"');
    expect(block).toContain("overrideReason");
  });

  it("fleet.ts driver schemas accept licenseClass and vehicle schemas accept requiredLicenseClass", () => {
    expect(FLEET_ROUTE).toContain("LICENSE_CLASS_VALUES");
    expect(FLEET_ROUTE).toMatch(/createDriverSchema[\s\S]{0,800}?licenseClass:\s*z\.enum\(LICENSE_CLASS_VALUES\)/);
    expect(FLEET_ROUTE).toMatch(/updateDriverSchema[\s\S]{0,800}?licenseClass:\s*z\.enum\(LICENSE_CLASS_VALUES\)/);
    expect(FLEET_ROUTE).toMatch(/createVehicleSchema[\s\S]{0,2200}?requiredLicenseClass:\s*z\.enum\(LICENSE_CLASS_VALUES\)/);
    expect(FLEET_ROUTE).toMatch(/updateVehicleSchema[\s\S]{0,2200}?requiredLicenseClass:\s*z\.enum\(LICENSE_CLASS_VALUES\)/);
  });

  it("driver INSERT writes licenseClass; vehicle INSERT writes requiredLicenseClass", () => {
    const driverInsert = FLEET_ROUTE.match(
      /INSERT INTO fleet_drivers[\s\S]{0,400}?\)\`/,
    )?.[0]!;
    expect(driverInsert).toContain('"licenseClass"');
    const vehicleInsert = FLEET_ROUTE.match(
      /INSERT INTO fleet_vehicles[\s\S]{0,2200}?\)\`/,
    )?.[0]!;
    expect(vehicleInsert).toContain('"requiredLicenseClass"');
  });

  it("library exports the LICENSE_COVERS map so other surfaces can query it", () => {
    expect(ELIG_LIB).toMatch(/export const LICENSE_COVERS/);
  });
});
