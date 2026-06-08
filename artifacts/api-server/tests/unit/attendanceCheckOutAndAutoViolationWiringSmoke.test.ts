/**
 * check-out × autoViolationEngine × per-category policy wiring smoke
 * (#1799 priority #6 — second wiring batch after check-in HR-003).
 *
 * Two callsites covered:
 *
 *  1. `POST /hr/check-out` in `routes/hr.ts` — same pattern as
 *     check-in: resolve policy, overlay gpsRadius, gate early-
 *     departure violation + deduction by `autoDeductionEnabled`.
 *
 *  2. `runAutoDetection` in `lib/autoViolationEngine.ts` — uses
 *     `resolveBatch` to drop incidents for assignments whose
 *     category exempts them BEFORE the discipline-memo / violation
 *     INSERTs fire. Failure of the engine falls back to legacy
 *     behavior (process all) with an error log.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HR_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
  "utf8",
);
const ENGINE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/autoViolationEngine.ts"),
  "utf8",
);

describe("check-out × attendancePolicyEngine wiring (HR-004)", () => {
  // Locate the check-out handler block. The check-out logic starts
  // after the check-in block ends. We look for the gpsRadius load
  // that lives in the check-out handler specifically.
  const checkOutBlockStart = HR_SRC.indexOf(
    `\`SELECT "gpsRadiusMeters" FROM attendance_policies WHERE "companyId" = $1\``,
  );

  it("the check-out handler is locatable", () => {
    expect(checkOutBlockStart).toBeGreaterThan(0);
  });

  it("check-out resolves per-category policy via resolveAttendancePolicy", () => {
    const block = HR_SRC.slice(checkOutBlockStart, checkOutBlockStart + 3500);
    expect(block).toMatch(/resolvedCheckoutPolicy[\s\S]*?resolveAttendancePolicy\(\{[\s\S]*?companyId:\s*scope\.companyId[\s\S]*?assignmentId:\s*scope\.activeAssignmentId/);
  });

  it("check-out falls back to legacy company-default on engine error", () => {
    const block = HR_SRC.slice(checkOutBlockStart, checkOutBlockStart + 3500);
    expect(block).toMatch(/resolveAttendancePolicy[\s\S]*?\.catch\([\s\S]*?return\s+null/);
  });

  it("check-out overlay: gpsRadius from resolvedCheckoutPolicy first, then legacy", () => {
    const block = HR_SRC.slice(checkOutBlockStart, checkOutBlockStart + 3500);
    expect(block).toMatch(
      /gpsRadius\s*=\s*resolvedCheckoutPolicy\s*\?\s*resolvedCheckoutPolicy\.gpsRadiusMeters\s*:\s*Number\(policy\?\.gpsRadiusMeters/,
    );
  });

  it("check-out derives autoDeductionEnabledCheckout from the resolved policy", () => {
    const block = HR_SRC.slice(checkOutBlockStart, checkOutBlockStart + 3500);
    expect(block).toMatch(
      /autoDeductionEnabledCheckout\s*=\s*resolvedCheckoutPolicy\s*\?\s*resolvedCheckoutPolicy\.autoDeductionEnabled\s*:\s*true/,
    );
  });

  it("check-out gates early-departure violation INSERT by autoDeductionEnabledCheckout", () => {
    // The early-departure if-block must include the new flag.
    expect(HR_SRC).toMatch(
      /if\s*\(earlyDepartureMinutes\s*>\s*0\s+&&\s+!excusedEarlyLeave\s+&&\s+autoDeductionEnabledCheckout\)/,
    );
  });
});

describe("autoViolationEngine × per-category exempt filter (HR-004)", () => {
  it("imports resolveBatch (renamed to avoid collision)", () => {
    expect(ENGINE_SRC).toMatch(
      /import\s*\{\s*resolveBatch as resolveAttendancePoliciesBatch\s*\}\s*from\s*["']\.\/attendancePolicyEngine\.js["']/,
    );
  });

  it("filters incidents before the processing loop using the engine", () => {
    expect(ENGINE_SRC).toMatch(/result\.detected = incidents\.length;[\s\S]*?resolveAttendancePoliciesBatch\(/);
    // The filter MUST happen BEFORE the for-of processing loop.
    const detectedIdx = ENGINE_SRC.indexOf("result.detected = incidents.length;");
    const filterIdx = ENGINE_SRC.indexOf("resolveAttendancePoliciesBatch(");
    const loopIdx = ENGINE_SRC.indexOf("for (const incident of incidents)");
    expect(filterIdx).toBeGreaterThan(detectedIdx);
    expect(loopIdx).toBeGreaterThan(filterIdx);
  });

  it("uses the autoDeductionEnabled flag from each policy to filter", () => {
    expect(ENGINE_SRC).toMatch(
      /policy\?\.autoDeductionEnabled\s*!==\s*false/,
    );
  });

  it("logs how many incidents were skipped (so HR can audit who was protected)", () => {
    expect(ENGINE_SRC).toMatch(
      /logger\.info\([\s\S]*?skipped[\s\S]*?dropped incidents for exempt categories/,
    );
  });

  it("falls back to legacy behavior (process all) on engine error with error log", () => {
    expect(ENGINE_SRC).toMatch(
      /logger\.error\([\s\S]*?policy resolution failed; processing all incidents/,
    );
  });

  it("result.detected reflects RAW detection — not post-filter (auditable)", () => {
    // Comment promise + the actual assignment must happen BEFORE the filter mutates `incidents`.
    const detectedIdx = ENGINE_SRC.indexOf("result.detected = incidents.length;");
    const filterIdx = ENGINE_SRC.indexOf("incidents.length = 0;");
    expect(detectedIdx).toBeGreaterThan(0);
    expect(filterIdx).toBeGreaterThan(detectedIdx);
  });
});
