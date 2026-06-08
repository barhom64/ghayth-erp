/**
 * Check-in route × per-category attendance policy wiring smoke
 * (#1799 priority #6 wiring step).
 *
 * The previous PR (#1809) added the engine. This test pins the
 * actual wiring inside `POST /hr/check-in`:
 *
 *  1. The engine is imported.
 *  2. The route resolves the per-employee policy via
 *     `resolveAttendancePolicy({ companyId, assignmentId })`.
 *  3. The resolved policy's `lateThresholdMinutes` overrides the
 *     legacy company-default value when present.
 *  4. The resolved policy's `gpsRadiusMeters` overrides similarly.
 *  5. The resolved policy's `autoDeductionEnabled` gates whether
 *     `exceedsThreshold` ever turns true — guaranteeing managers/
 *     executives never get an automatic deduction or violation.
 *  6. Backward compat: legacy fallback path is still wired for the
 *     case where the engine fails (catch → company default).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
  "utf8",
);

describe("check-in × attendancePolicyEngine wiring", () => {
  it("imports resolveAttendancePolicy from the engine module", () => {
    expect(SRC).toMatch(
      /import\s*\{\s*resolveAttendancePolicy\s*\}\s*from\s*["']\.\.\/lib\/attendancePolicyEngine\.js["']/,
    );
  });

  it("calls resolveAttendancePolicy with { companyId, assignmentId } before late-threshold use", () => {
    expect(SRC).toMatch(
      /await\s+resolveAttendancePolicy\(\{[\s\S]*?companyId:\s*scope\.companyId[\s\S]*?assignmentId:\s*scope\.activeAssignmentId/,
    );
  });

  it("falls back to legacy company-default on engine error (catch returns null)", () => {
    expect(SRC).toMatch(
      /resolveAttendancePolicy[\s\S]*?\.catch\(\([\s\S]*?\)\s*=>\s*\{[\s\S]*?return\s+null/,
    );
  });

  it("uses resolvedPolicy.lateThresholdMinutes when present (legacy fallback otherwise)", () => {
    expect(SRC).toMatch(
      /lateThreshold\s*=\s*resolvedPolicy\s*\?\s*resolvedPolicy\.lateThresholdMinutes\s*:\s*Number\(policy\?\.lateThresholdMinutes/,
    );
  });

  it("uses resolvedPolicy.gpsRadiusMeters when present (legacy fallback otherwise)", () => {
    expect(SRC).toMatch(
      /gpsRadius\s*=\s*resolvedPolicy\s*\?\s*resolvedPolicy\.gpsRadiusMeters\s*:\s*Number\(policy\?\.gpsRadiusMeters/,
    );
  });

  it("derives autoDeductionEnabled from the resolved policy (default TRUE for legacy fallback)", () => {
    expect(SRC).toMatch(
      /autoDeductionEnabled\s*=\s*resolvedPolicy\s*\?\s*resolvedPolicy\.autoDeductionEnabled\s*:\s*true/,
    );
  });

  it("gates exceedsThreshold by autoDeductionEnabled (manager/executive can never trip)", () => {
    expect(SRC).toMatch(
      /exceedsThreshold\s*=\s*isLate\s+&&\s+lateMinutes\s*>\s*lateThreshold\s+&&\s+!publicHoliday\s+&&\s+isWorkDay\s+&&\s+autoDeductionEnabled/,
    );
  });

  it("deduction INSERT runs only inside an exceedsThreshold branch (so exempt categories skip it)", () => {
    // The original code is `if (exceedsThreshold) { … INSERT INTO attendance_deductions … }`.
    // We don't try to lex JS here — we just assert the deduction
    // insert lives after the same exceedsThreshold gate.
    const block = SRC.slice(SRC.indexOf("const exceedsThreshold"));
    expect(block).toMatch(/if\s*\(\s*exceedsThreshold\s*\)\s*\{/);
    const deductionInsertIdx = block.indexOf("INSERT INTO attendance_deductions");
    const exceedsBranchIdx = block.indexOf("if (exceedsThreshold)");
    expect(deductionInsertIdx).toBeGreaterThan(exceedsBranchIdx);
  });
});
