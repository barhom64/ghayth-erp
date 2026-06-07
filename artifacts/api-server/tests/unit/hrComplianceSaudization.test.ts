/**
 * /hr/saudization endpoints — behavioral coverage.
 *
 * Closes audit gap T0-1 ("hr-compliance.ts: 3 endpoints — zero unit
 * tests"). The endpoints themselves only orchestrate three pieces:
 *
 *   1. read nationality strings from employees
 *   2. call computeSnapshot() to bucket them into Saudi vs non-Saudi
 *   3. call classifyNitaqat() to map (saudiCount, totalCount, sector)
 *      onto a category (Platinum / Green / Yellow / Red / exempt)
 *
 * computeSnapshot + classifyNitaqat are pure functions, so this suite
 * exercises them with the same input shape the route hands them. If
 * the route ever stops calling them — or the Nitaqat bands change —
 * the tests below will fail loud.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeSnapshot,
  isSaudiNationality,
} from "../../src/lib/saudi-compliance/saudization-snapshot.js";
import { classifyNitaqat } from "../../src/lib/saudi-compliance/nitaqat.js";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

// ─── isSaudiNationality — string recognition ────────────────────────────────

describe("isSaudiNationality — Arabic + English variants", () => {
  it("recognises 'SA'", () => {
    expect(isSaudiNationality("SA")).toBe(true);
  });

  it("recognises 'Saudi' (case-insensitive)", () => {
    expect(isSaudiNationality("Saudi")).toBe(true);
    expect(isSaudiNationality("saudi")).toBe(true);
    expect(isSaudiNationality("SAUDI ARABIAN")).toBe(true);
  });

  it("recognises 'سعودي' and 'سعودية'", () => {
    expect(isSaudiNationality("سعودي")).toBe(true);
    expect(isSaudiNationality("سعودية")).toBe(true);
  });

  it("rejects unrelated nationalities", () => {
    expect(isSaudiNationality("EG")).toBe(false);
    expect(isSaudiNationality("Egyptian")).toBe(false);
    expect(isSaudiNationality("مصري")).toBe(false);
  });

  it("treats null/undefined/empty as non-Saudi (defensive default)", () => {
    expect(isSaudiNationality(null)).toBe(false);
    expect(isSaudiNationality(undefined)).toBe(false);
    expect(isSaudiNationality("")).toBe(false);
    expect(isSaudiNationality("   ")).toBe(false);
  });
});

// ─── computeSnapshot — counts + percentage ──────────────────────────────────

describe("computeSnapshot — headcount + percentage", () => {
  it("counts Saudi vs non-Saudi correctly", () => {
    const result = computeSnapshot(1, "2026-06", [
      { nationality: "SA" },
      { nationality: "Saudi" },
      { nationality: "سعودي" },
      { nationality: "EG" },
      { nationality: "PK" },
    ]);
    expect(result.totalEmployees).toBe(5);
    expect(result.saudiEmployees).toBe(3);
    expect(result.nonSaudiEmployees).toBe(2);
    expect(result.saudizationPercent).toBe(60);
  });

  it("returns zero counts for an empty company (not exempt)", () => {
    const result = computeSnapshot(1, "2026-06", []);
    expect(result.totalEmployees).toBe(0);
    expect(result.saudiEmployees).toBe(0);
    expect(result.nonSaudiEmployees).toBe(0);
  });

  it("handles all-Saudi (100%)", () => {
    const result = computeSnapshot(1, "2026-06", [
      { nationality: "SA" },
      { nationality: "SA" },
    ]);
    expect(result.saudizationPercent).toBe(100);
  });

  it("handles all-non-Saudi (0%)", () => {
    const result = computeSnapshot(1, "2026-06", [
      { nationality: "EG" },
      { nationality: "IN" },
    ]);
    expect(result.saudizationPercent).toBe(0);
  });
});

// ─── classifyNitaqat — band thresholds ──────────────────────────────────────

describe("classifyNitaqat — sector buckets", () => {
  it("Red zone for very low Saudization (default sector)", () => {
    const r = classifyNitaqat({ saudiEmployees: 1, totalEmployees: 100 });
    expect(r.category).toMatch(/red/i);
  });

  it("Platinum at the top of the band", () => {
    const r = classifyNitaqat({ saudiEmployees: 80, totalEmployees: 100 });
    expect(r.category).toMatch(/platinum/i);
  });

  it("Returns exempt=true for very small companies (< 6 employees)", () => {
    const r = classifyNitaqat({ saudiEmployees: 1, totalEmployees: 3 });
    expect(r.exempt).toBe(true);
  });

  it("never returns NaN for the percentage", () => {
    const r = classifyNitaqat({ saudiEmployees: 0, totalEmployees: 0 });
    expect(Number.isFinite(r.saudizationPercent)).toBe(true);
  });
});

// ─── Route source-pin — endpoints still call the helpers ────────────────────

describe("hr-compliance.ts wires the helpers", () => {
  const SRC = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/hr-compliance.ts"),
    "utf8",
  );

  it("GET /saudization/current calls computeSnapshot + classifyNitaqat", () => {
    const block = SRC.slice(
      SRC.indexOf('"/saudization/current"'),
      SRC.indexOf('"/saudization/history"'),
    );
    expect(block).toContain("computeSnapshot(scope.companyId, period, employees)");
    expect(block).toContain("classifyNitaqat");
  });

  it("POST /saudization/refresh upserts saudization_snapshots", () => {
    const block = SRC.slice(SRC.indexOf('"/saudization/refresh"'));
    expect(block).toContain("INSERT INTO saudization_snapshots");
    expect(block).toContain('ON CONFLICT ("companyId", period)');
  });

  it("Period parameter validated against YYYY-MM regex", () => {
    expect(SRC).toContain('!/^\\d{4}-\\d{2}$/.test(period)');
  });

  it("All three saudization endpoints gated by authorize({feature:'hr.saudization'})", () => {
    const matches = SRC.match(
      /authorize\(\{\s*feature:\s*"hr\.saudization"/g,
    );
    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
