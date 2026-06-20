/**
 * HR-REV fix — department absence gate cross-tenant correctness.
 *
 * The deptAbsent query was joining hr_leave_requests → employee_assignments
 * on departmentId alone (no companyId), so a same-numbered department in
 * another tenant inflated the absent count and could wrongly block leaves.
 * Fix: add ea."companyId" = $1 to the JOIN and pass scope.companyId as $1.
 *
 * Source-only; no database.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
  "utf8",
);

// Extract the deptAbsent block (between "Validation 8" comment and deptAbsent variable assignment)
const BLOCK = SRC.match(
  /Validation 8[\s\S]*?deptAbsent\s*\]\s*=[\s\S]*?\);/m,
)?.[0] ?? "";

describe("HR leave-request: department absent gate is tenant-scoped", () => {
  it("the deptAbsent block was extracted", () => {
    expect(BLOCK).not.toBe("");
  });

  it("joins employee_assignments on companyId AND departmentId", () => {
    expect(BLOCK).toMatch(/ea\."companyId"\s*=\s*\$1/);
    expect(BLOCK).toMatch(/ea\."departmentId"\s*=\s*\$2/);
  });

  it("passes scope.companyId as the first parameter", () => {
    expect(BLOCK).toMatch(/scope\.companyId,\s*assignment\.departmentId/);
  });
});
