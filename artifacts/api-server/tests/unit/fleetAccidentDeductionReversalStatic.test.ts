import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Accident re-assessment → driver payroll-deduction settlement (review
 * follow-up, closes the last documented residual risk of C2).
 *
 * When an accident is re-assessed, the driver recovery deduction must follow:
 *   • moved AWAY from driver → cancel the prior UNAPPLIED deduction.
 *   • moved TO driver / amount change → request a fresh deduction.
 * All via the HR event contract (no cross-domain write). Static, no DB —
 * payroll_deductions status is not a ledger line, so wiring assertions suffice.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const FLEET_ROUTE = readFileSync(join(repoRoot, "artifacts/api-server/src/routes/fleet.ts"), "utf8");
const FLEET_ENGINE = readFileSync(join(repoRoot, "artifacts/api-server/src/lib/engines/fleetEngine.ts"), "utf8");
const HR = readFileSync(join(repoRoot, "artifacts/api-server/src/lib/engines/hrEngine.ts"), "utf8");
const MIG = readFileSync(join(repoRoot, "artifacts/api-server/src/migrations/399_payroll_deductions_source_link.sql"), "utf8");

describe("migration 399 — payroll_deductions source link", () => {
  it("adds sourceType/sourceId additively + a lookup index", () => {
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS "sourceType"/);
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS "sourceId"/);
    expect(MIG).toMatch(/idx_payroll_deductions_source/);
  });
});

describe("hrEngine — deduction source + targeted cancel", () => {
  it("createPayrollDeduction now persists sourceType/sourceId + pending status", () => {
    const m = HR.match(/INSERT INTO payroll_deductions[\s\S]+?\);/);
    expect(m![0]).toMatch(/"sourceType","sourceId"/);
    expect(m![0]).toMatch(/'pending'/);
  });
  it("cancelPayrollDeductionBySource voids ONLY unapplied rows (payrollLineId IS NULL)", () => {
    expect(HR).toMatch(/async cancelPayrollDeductionBySource/);
    const sql = HR.match(/UPDATE payroll_deductions[\s\S]+?payrollLineId" IS NULL[\s\S]+?cancelled'`/);
    expect(sql, "guarded cancel UPDATE not found").toBeTruthy();
    expect(sql![0]).toMatch(/SET status = 'cancelled'/);
  });
  it("declares the reversal consumer for fleet.accident.deduction_reversed", () => {
    expect(HR).toMatch(/registerCrossDomainHandler\("fleet\.accident\.deduction_reversed"/);
    expect(HR).toMatch(/cancelPayrollDeductionBySource/);
  });
});

describe("fleetEngine — reversal emitter", () => {
  it("requestAccidentDeductionReversal emits the boundary event", () => {
    const m = FLEET_ENGINE.match(/async requestAccidentDeductionReversal[\s\S]+?\n  \}/);
    expect(m, "requestAccidentDeductionReversal not found").toBeTruthy();
    expect(m![0]).toMatch(/eventBus\.emit\("fleet\.accident\.deduction_reversed"/);
  });
});

describe("assess endpoint — deduction settlement on re-assessment", () => {
  const block = (() => {
    const m = FLEET_ROUTE.match(/router\.patch\("\/accidents\/:id\/assess"[\s\S]+?\n\}\);/);
    expect(m, "assess handler not found").toBeTruthy();
    return m![0];
  })();
  it("reads the prior costBearer to detect a transition", () => {
    expect(block).toMatch(/"costBearer" FROM fleet_accidents/);
  });
  it("cancels the old deduction when re-assessing away from a driver bearer", () => {
    expect(block).toMatch(/isReassessment && acc\.costBearer === "driver"[\s\S]+?requestAccidentDeductionReversal/);
  });
  it("requests a fresh deduction whenever the (new) bearer is driver with cost", () => {
    expect(block).toMatch(/b\.estimatedCost > 0 && b\.costBearer === "driver"[\s\S]+?requestAccidentDeduction\(/);
  });
});
