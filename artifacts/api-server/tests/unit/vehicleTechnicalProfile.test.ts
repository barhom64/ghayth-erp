import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 Blocker #2 — vehicle technical profile + capacity guard.
//
// Three concerns under one test file:
//   1. The schema additions on fleet_vehicles and the new
//      vehicle_capacity_overrides table are present (migration + dump).
//   2. The vehicle create/update zod schemas accept the new fields and
//      the route's INSERT carries them through to the DB.
//   3. assertVehicleCapacity enforces:
//        - unknown → soft-allow + warning event
//        - in-budget → allow
//        - over-budget without reason → ValidationError
//        - over-budget with reason → allow + override row insert

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const repoRoot = join(import.meta.dirname!, "../../../../");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const FLEET_ROUTE = read("routes/fleet.ts");
const CARGO_ROUTE = read("routes/cargo.ts");
const CAPACITY_LIB = read("lib/fleet/vehicleCapacity.ts");

describe("#1733 — migration 262 + schema dump", () => {
  it("migration 262 exists and adds the technical-profile columns", () => {
    const migPath = join(
      apiSrc,
      "migrations",
      "262_fleet_vehicle_technical_profile.sql",
    );
    expect(existsSync(migPath), "migration 262 missing").toBe(true);
    const sql = readFileSync(migPath, "utf8");
    for (const col of [
      "vehicleType",
      "payloadKg",
      "boxLengthCm",
      "boxWidthCm",
      "boxHeightCm",
      "axleCount",
      "tireCount",
      "tireSize",
      "engineDisplacementCc",
      "transmissionType",
      "seatCount",
      "hasAc",
      "screenCount",
      "doorCount",
      "upholsteryType",
      "safetyFeatures",
      "operatingHours",
      "equipmentAttachments",
    ]) {
      expect(sql, `missing column ${col} in migration 262`).toContain(col);
    }
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.vehicle_capacity_overrides");
    expect(sql).toContain("uq_capacity_override_source");
  });

  it("schema dump carries the new fleet_vehicles columns + overrides table", () => {
    const pre = readFileSync(join(repoRoot, "db", "schema_pre.sql"), "utf8");
    const post = readFileSync(join(repoRoot, "db", "schema_post.sql"), "utf8");
    // fleet_vehicles new columns appear in the CREATE TABLE block.
    const fleetVehiclesBlock = pre.match(
      /CREATE TABLE public\.fleet_vehicles[\s\S]+?\)\s*;\s*\n/,
    )?.[0]!;
    expect(fleetVehiclesBlock).toContain("payloadKg");
    expect(fleetVehiclesBlock).toContain("seatCount");
    expect(fleetVehiclesBlock).toContain("safetyFeatures");
    // overrides table + PK + unique constraint in post.
    expect(pre).toContain("CREATE TABLE public.vehicle_capacity_overrides");
    expect(post).toContain("vehicle_capacity_overrides_pkey");
    expect(post).toContain("uq_capacity_override_source");
  });
});

describe("#1733 — vehicle route schemas + INSERT carry the new fields", () => {
  it("fleet.ts defines vehicleTechnicalProfileSchema and merges it into create/update", () => {
    expect(FLEET_ROUTE).toContain("vehicleTechnicalProfileSchema");
    expect(FLEET_ROUTE).toMatch(/createVehicleSchema[\s\S]*?\.merge\(vehicleTechnicalProfileSchema\)/);
    expect(FLEET_ROUTE).toMatch(/updateVehicleSchema[\s\S]*?\.merge\(vehicleTechnicalProfileSchema\)/);
  });

  it("vehicle INSERT writes every new technical-profile column", () => {
    const insertBlock = FLEET_ROUTE.match(
      /INSERT INTO fleet_vehicles[\s\S]{0,2200}?\)\`/,
    )?.[0];
    expect(insertBlock, "could not locate vehicle INSERT").toBeTruthy();
    for (const col of [
      "vehicleType",
      "payloadKg",
      "axleCount",
      "transmissionType",
      "seatCount",
      "safetyFeatures",
      "equipmentAttachments",
    ]) {
      expect(insertBlock!, `INSERT missing ${col}`).toContain(`"${col}"`);
    }
  });

  it("vehicle PATCH trackedFields list includes the technical-profile fields", () => {
    // Anchor on the vehicle trackedFields block (the one that carries
    // payloadKg) — fleet.ts also declares a driver trackedFields earlier,
    // and a bare non-greedy match would land on that one instead.
    const trackedBlock = FLEET_ROUTE.match(
      /const trackedFields = \[[\s\S]*?"payloadKg"[\s\S]*?\] as const;/,
    )?.[0]!;
    expect(trackedBlock).toContain("payloadKg");
    expect(trackedBlock).toContain("safetyFeatures");
    expect(trackedBlock).toContain("equipmentAttachments");
  });
});

describe("#1733 — cargo PATCH calls the capacity guard", () => {
  it("cargo.ts imports assertVehicleCapacity and calls it on confirmed lock-in", () => {
    expect(CARGO_ROUTE).toContain("assertVehicleCapacity");
    // The check must run when moving INTO confirmed, or when the
    // vehicle is switched out — both intercept "I'm committing this
    // load to this vehicle".
    const checkBlock = CARGO_ROUTE.match(
      /assertVehicleCapacity\(\{[\s\S]{0,400}?\}\)/,
    )?.[0]!;
    expect(checkBlock).toContain('kind: "payload_kg"');
    expect(checkBlock).toContain('sourceType: "cargo_manifest"');
    expect(checkBlock).toContain("overrideReason");
  });

  it("cargo.ts excludes overrideReason from the UPDATE SET", () => {
    // overrideReason is a body-only signal for the guard; it must NOT
    // be written to cargo_manifests (no such column exists).
    expect(CARGO_ROUTE).toMatch(/col === "overrideReason"/);
  });
});

describe("#1733 — capacity guard library", () => {
  it("exposes assertVehicleCapacity + handles both kinds (payload / seats)", () => {
    expect(CAPACITY_LIB).toContain("export async function assertVehicleCapacity");
    expect(CAPACITY_LIB).toContain('"payload_kg"');
    expect(CAPACITY_LIB).toContain('"seat_count"');
  });

  it("records every override into vehicle_capacity_overrides with reason + actor", () => {
    expect(CAPACITY_LIB).toContain("INSERT INTO vehicle_capacity_overrides");
    expect(CAPACITY_LIB).toContain("ON CONFLICT");
    expect(CAPACITY_LIB).toContain('"approvedBy"');
    expect(CAPACITY_LIB).toContain("reason");
  });
});

// ────────────────────────────────────────────────────────────────────
// Behavioural tests — mock the DB so the four guard branches are
// reached deterministically.
// ────────────────────────────────────────────────────────────────────

vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(),
  rawExecute: vi.fn(),
}));
vi.mock("../../src/lib/businessHelpers.js", () => ({
  emitEvent: vi.fn().mockResolvedValue(undefined),
}));

describe("#1733 — assertVehicleCapacity behaviour", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("soft-allows when the capacity field is NULL and emits a warning event", async () => {
    const { rawQuery, rawExecute } = (await import("../../src/lib/rawdb.js")) as unknown as {
      rawQuery: ReturnType<typeof vi.fn>;
      rawExecute: ReturnType<typeof vi.fn>;
    };
    const { emitEvent } = (await import("../../src/lib/businessHelpers.js")) as unknown as {
      emitEvent: ReturnType<typeof vi.fn>;
    };
    const { assertVehicleCapacity } = await import("../../src/lib/fleet/vehicleCapacity.js");
    rawQuery.mockReset();
    rawExecute.mockReset();
    emitEvent.mockClear();
    rawQuery.mockResolvedValueOnce([{ payloadKg: null, seatCount: null, vehicleType: null }]);

    const result = await assertVehicleCapacity({
      companyId: 1, branchId: 1, userId: 7,
      vehicleId: 10, kind: "payload_kg", amount: 5000,
      sourceType: "cargo_manifest", sourceId: 100,
    });
    expect(result).toEqual({ ok: true, unknown: true, capacity: null });
    expect(rawExecute).not.toHaveBeenCalled();
    expect(emitEvent).toHaveBeenCalledOnce();
    expect((emitEvent.mock.calls[0]![0] as Record<string, unknown>).action).toBe(
      "fleet.vehicle.capacity.unknown",
    );
  });

  it("allows in-budget load with no override insert", async () => {
    const { rawQuery, rawExecute } = (await import("../../src/lib/rawdb.js")) as unknown as {
      rawQuery: ReturnType<typeof vi.fn>;
      rawExecute: ReturnType<typeof vi.fn>;
    };
    const { assertVehicleCapacity } = await import("../../src/lib/fleet/vehicleCapacity.js");
    rawQuery.mockReset();
    rawExecute.mockReset();
    rawQuery.mockResolvedValueOnce([{ payloadKg: "10000.00", seatCount: null, vehicleType: "truck" }]);

    const result = await assertVehicleCapacity({
      companyId: 1, branchId: 1, userId: 7,
      vehicleId: 10, kind: "payload_kg", amount: 5000,
      sourceType: "cargo_manifest", sourceId: 100,
    });
    expect(result).toEqual({ ok: true, capacity: 10000 });
    expect(rawExecute).not.toHaveBeenCalled();
  });

  it("rejects over-capacity without overrideReason with ValidationError", async () => {
    const { rawQuery } = (await import("../../src/lib/rawdb.js")) as unknown as {
      rawQuery: ReturnType<typeof vi.fn>;
    };
    const { assertVehicleCapacity } = await import("../../src/lib/fleet/vehicleCapacity.js");
    const { ValidationError } = await import("../../src/lib/errorHandler.js");
    rawQuery.mockReset();
    rawQuery.mockResolvedValueOnce([{ payloadKg: "3000.00", seatCount: null, vehicleType: "truck" }]);

    await expect(
      assertVehicleCapacity({
        companyId: 1, branchId: 1, userId: 7,
        vehicleId: 10, kind: "payload_kg", amount: 5000,
        sourceType: "cargo_manifest", sourceId: 100,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts over-capacity WITH overrideReason, records the documented exception", async () => {
    const { rawQuery, rawExecute } = (await import("../../src/lib/rawdb.js")) as unknown as {
      rawQuery: ReturnType<typeof vi.fn>;
      rawExecute: ReturnType<typeof vi.fn>;
    };
    const { emitEvent } = (await import("../../src/lib/businessHelpers.js")) as unknown as {
      emitEvent: ReturnType<typeof vi.fn>;
    };
    const { assertVehicleCapacity } = await import("../../src/lib/fleet/vehicleCapacity.js");
    rawQuery.mockReset();
    rawExecute.mockReset();
    emitEvent.mockClear();
    rawQuery.mockResolvedValueOnce([{ payloadKg: "3000.00", seatCount: null, vehicleType: "truck" }]);
    rawExecute.mockResolvedValueOnce({ affectedRows: 1, insertId: 1 });

    const result = await assertVehicleCapacity({
      companyId: 1, branchId: 1, userId: 7,
      vehicleId: 10, kind: "payload_kg", amount: 5000,
      sourceType: "cargo_manifest", sourceId: 100,
      overrideReason: "حمولة عاجلة وافق عليها المدير",
    });
    expect(result).toEqual({ ok: true, override: true, capacity: 3000 });
    expect(rawExecute).toHaveBeenCalledOnce();
    const [sql, params] = rawExecute.mock.calls[0]!;
    expect(sql).toContain("INSERT INTO vehicle_capacity_overrides");
    expect(sql).toContain("ON CONFLICT");
    expect(params).toContain("حمولة عاجلة وافق عليها المدير");
    expect(emitEvent.mock.calls.at(-1)![0].action).toBe("fleet.vehicle.capacity.exception");
  });
});
