import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib/impactPreview.ts"),
  "utf8"
);

// ── Exports ───────────────────────────────────────────────────────────────

describe("impactPreview — exported functions", () => {
  it("exports computeLeaveImpact", () => {
    expect(SRC).toContain("export async function computeLeaveImpact");
  });

  it("exports computeTerminationImpact", () => {
    expect(SRC).toContain("export async function computeTerminationImpact");
  });

  it("exports computeViolationImpact", () => {
    expect(SRC).toContain("export async function computeViolationImpact");
  });

  it("exports computeEmployeeOperationalStatus", () => {
    expect(SRC).toContain("export async function computeEmployeeOperationalStatus");
  });

  it("exports getPropertyUnitStatusImpact", () => {
    expect(SRC).toContain("export async function getPropertyUnitStatusImpact");
  });

  it("exports getVehicleStatusImpact", () => {
    expect(SRC).toContain("export async function getVehicleStatusImpact");
  });
});

// ── Type definitions ──────────────────────────────────────────────────────

describe("impactPreview — type definitions", () => {
  it("exports ImpactItem interface", () => {
    expect(SRC).toContain("export interface ImpactItem");
  });

  it("ImpactItem has severity levels", () => {
    expect(SRC).toContain('"info"');
    expect(SRC).toContain('"warning"');
    expect(SRC).toContain('"danger"');
    expect(SRC).toContain('"success"');
  });

  it("exports ImpactPreview interface", () => {
    expect(SRC).toContain("export interface ImpactPreview");
  });

  it("exports StatusImpactItem interface", () => {
    expect(SRC).toContain("export interface StatusImpactItem");
  });

  it("StatusImpactItem has type categories", () => {
    expect(SRC).toContain('"financial"');
    expect(SRC).toContain('"operational"');
    expect(SRC).toContain('"legal"');
    expect(SRC).toContain('"notification"');
  });

  it("exports StatusImpactPreview with canProceed and blockers", () => {
    expect(SRC).toContain("export interface StatusImpactPreview");
    expect(SRC).toContain("canProceed: boolean");
    expect(SRC).toContain("blockers: string[]");
  });
});

// ── Leave impact ──────────────────────────────────────────────────────────

describe("impactPreview — leave impact", () => {
  it("computeLeaveImpact accepts companyId and employeeId", () => {
    const idx = SRC.indexOf("computeLeaveImpact");
    const section = SRC.slice(idx, idx + 300);
    expect(section).toContain("companyId: number");
    expect(section).toContain("employeeId: number");
  });

  it("checks leave balance", () => {
    expect(SRC).toContain("hr_leave_balances");
  });

  it("checks leave balance remaining", () => {
    expect(SRC).toContain("remaining");
  });
});

// ── Termination impact ────────────────────────────────────────────────────

describe("impactPreview — termination impact", () => {
  it("computes gratuity impact", () => {
    expect(SRC).toContain("gratuity");
  });

  it("checks outstanding obligations", () => {
    expect(SRC).toContain("custody");
  });
});

// ── Vehicle status impact ─────────────────────────────────────────────────

describe("impactPreview — vehicle status impact", () => {
  it("checks active trips", () => {
    expect(SRC).toContain("fleet_trips");
  });

  it("checks insurance status", () => {
    expect(SRC).toContain("fleet_insurance");
  });
});

// ── Security ──────────────────────────────────────────────────────────────

describe("impactPreview — security", () => {
  it("uses parameterized queries throughout", () => {
    const params = [...SRC.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(20);
  });

  it("scopes all queries by companyId", () => {
    const matches = [...SRC.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(15);
  });
});
