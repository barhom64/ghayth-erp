import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #1812 Wave 0.3 — Vehicle Master + assignment-decision fields.
//
// User's mandate: "Vehicle Master كامل للإسناد" (P0). Schema columns
// from migration 262 (technical profile) + migration 284
// (operationalPayloadKg / validForPassengers / validForCargo) MUST
// reach the API so the assignment engine can filter on them.
// This test pins that the Zod schema, the INSERT statement, and the
// PATCH whitelist all carry the three new assignment-decision fields.

const apiSrc = join(import.meta.dirname!, "../../src");
const FLEET = readFileSync(join(apiSrc, "routes/fleet.ts"), "utf8");

describe("#1812 Wave 0.3 — fleet.ts schema accepts assignment-decision fields", () => {
  it("vehicleTechnicalProfileSchema accepts operationalPayloadKg", () => {
    expect(FLEET).toMatch(/operationalPayloadKg: z\.coerce\.number\(\)\.nonnegative\(\)\.optional\(\)/);
  });
  it("vehicleTechnicalProfileSchema accepts validForPassengers", () => {
    expect(FLEET).toMatch(/validForPassengers: z\.boolean\(\)\.optional\(\)/);
  });
  it("vehicleTechnicalProfileSchema accepts validForCargo", () => {
    expect(FLEET).toMatch(/validForCargo: z\.boolean\(\)\.optional\(\)/);
  });
});

describe("#1812 Wave 0.3 — INSERT statement carries the new columns", () => {
  it("vehicle INSERT column list includes operationalPayloadKg/validForPassengers/validForCargo", () => {
    expect(FLEET).toMatch(/"operationalPayloadKg","validForPassengers","validForCargo"/);
  });
  it("vehicle INSERT params bind the new columns", () => {
    expect(FLEET).toMatch(/b\.operationalPayloadKg \?\? null/);
    expect(FLEET).toMatch(/b\.validForPassengers \?\? null/);
    expect(FLEET).toMatch(/b\.validForCargo \?\? null/);
  });
});

describe("#1812 Wave 0.3 — PATCH whitelist + colMap accept the new columns", () => {
  it("trackedFields whitelist contains the three new fields", () => {
    const start = FLEET.indexOf("const trackedFields");
    const end = FLEET.indexOf("] as const;", start);
    const block = FLEET.slice(start, end);
    expect(block).toMatch(/operationalPayloadKg/);
    expect(block).toMatch(/validForPassengers/);
    expect(block).toMatch(/validForCargo/);
  });
  it("colMap quotes the three new column identifiers", () => {
    expect(FLEET).toMatch(/operationalPayloadKg: '"operationalPayloadKg"'/);
    expect(FLEET).toMatch(/validForPassengers: '"validForPassengers"'/);
    expect(FLEET).toMatch(/validForCargo: '"validForCargo"'/);
  });
});
