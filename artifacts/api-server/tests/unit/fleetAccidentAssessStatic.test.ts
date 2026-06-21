import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Accident assessment → GL (الدفعة C2) — structural guards (static, no DB).
 * The balanced-lines / per-costBearer routing is proven by the dynamic suite
 * fleetAccidentGlPosting.dynamic.test.ts; here we lock the wiring:
 *   1. PATCH /accidents/:id/assess is gated by fleet.vehicles update.
 *   2. costBearer=driver routes recovery through the HR EVENT contract
 *      (requestAccidentDeduction), never a direct write to payroll_deductions.
 *   3. fleetEngine.postAccidentGL uses the vehicle's OWN subsidiary account
 *      (resolveVehicleAccountCode) and posts an idempotent guarded entry.
 *   4. hrEngine declares the cross-domain consumer for the accident event.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const FLEET = readFileSync(join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"), "utf8");
const ENGINE = readFileSync(join(repoRoot, "artifacts/api-server/src/lib/engines/fleetEngine.ts"), "utf8");
const HR = readFileSync(join(repoRoot, "artifacts/api-server/src/lib/engines/hrEngine.ts"), "utf8");

function handlerBlock(method: string, path: string): string {
  const re = new RegExp(`router\\.${method}\\("${path.replace(/\//g, "\\/")}"[\\s\\S]+?\\n\\}\\);`);
  const m = FLEET.match(re);
  expect(m, `${method.toUpperCase()} ${path} handler not found`).toBeTruthy();
  return m![0];
}

describe("accident assess endpoint — PATCH /accidents/:id/assess", () => {
  const block = () => handlerBlock("patch", "/accidents/:id/assess");
  it("is gated by fleet.vehicles update", () => {
    expect(block()).toMatch(/authorize\(\{\s*feature:\s*"fleet\.vehicles",\s*action:\s*"update"\s*\}\)/);
  });
  it("posts via fleetEngine.postAccidentGL and tracks reversal on re-assessment", () => {
    const b = block();
    expect(b).toMatch(/postAccidentGL/);
    expect(b).toMatch(/reversedJournalId/);
    // driver deduction is still gated on a positive cost
    expect(b).toMatch(/estimatedCost > 0/);
  });
  it("driver cost recovery goes through the HR event contract, not a direct write", () => {
    const b = block();
    expect(b).toMatch(/costBearer === "driver"/);
    expect(b).toMatch(/requestAccidentDeduction/);
    expect(b).not.toMatch(/INSERT INTO payroll_deductions/);
  });
});

describe("fleetEngine.postAccidentGL", () => {
  it("uses the vehicle's own subsidiary account (dedicated-account principle)", () => {
    const m = ENGINE.match(/async postAccidentGL\([\s\S]+?\n  \}/);
    expect(m, "postAccidentGL not found").toBeTruthy();
    expect(m![0]).toMatch(/resolveVehicleAccountCode\(ctx\.companyId, accident\.vehicleId/);
    expect(m![0]).toMatch(/sourceKey: `fleet:accident:\$\{accident\.id\}`/);
    expect(m![0]).toMatch(/guardTable: "fleet_accidents"/);
  });
  it("reverses a prior posted entry before re-posting (no ledger freeze on re-assessment)", () => {
    const m = ENGINE.match(/async postAccidentGL\([\s\S]+?\n  \}/);
    expect(m![0]).toMatch(/softDeleteJournalEntry/);
    expect(m![0]).toMatch(/reversedJournalId/);
  });
  it("emits the accident deduction event (no direct HR write)", () => {
    const m = ENGINE.match(/async requestAccidentDeduction\([\s\S]+?\n  \}/);
    expect(m, "requestAccidentDeduction not found").toBeTruthy();
    expect(m![0]).toMatch(/eventBus\.emit\("fleet\.accident\.deduction_requested"/);
  });
});

describe("hrEngine cross-domain consumer", () => {
  it("declares a handler for fleet.accident.deduction_requested → accident_recovery deduction", () => {
    expect(HR).toMatch(/registerCrossDomainHandler\("fleet\.accident\.deduction_requested"/);
    expect(HR).toMatch(/type: "accident_recovery"/);
    expect(HR).toMatch(/sourceType: "fleet_accidents"/);
  });
});
