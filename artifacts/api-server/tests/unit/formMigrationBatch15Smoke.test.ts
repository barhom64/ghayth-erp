import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 15 of the forms migration. CONTRIBUTING.md §3.4 compliant.
 *
 * After this PR: 28 of ~280 useState forms now on FormShell + zod.
 *
 * Migration: hr/shifts-management.tsx — assign-shift form.
 *
 * Fixes a PRE-EXISTING BUG: the form had `assignmentId` in state but
 * NO UI input for it. Every submit sent `Number("") = 0` as
 * assignmentId and the server FK-rejected. The migration adds the
 * employee/assignment picker that was always supposed to be there.
 *
 * §3.4 compliant: inline Card (no modal). §2.1 single objective
 * (migration + the obvious missing field — same form, no scope creep).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("hr/shifts-management — assign-shift form on FormShell + zod (fixes hidden FK bug)", () => {
  const SRC = read("hr/shifts-management.tsx");

  it("imports the FormShell stack with FormDateField + FormSelectField", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormDateField");
    expect(SRC).toContain("FormSelectField");
  });

  it("schema requires assignmentId — fixes the missing-input bug", () => {
    // Without this, every submit used to send `assignmentId: 0` and
    // fail at the server's FK check. The new schema mandates it.
    expect(SRC).toContain("shiftAssignSchema = z.object(");
    expect(SRC).toMatch(/^\s*assignmentId:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*shiftId:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*startDate:\s*z\.string\(\)\.min\(1/m);
  });

  it("renders an employee/assignment picker — was MISSING from the original UI", () => {
    // The picker is the actual fix. Verify it's there and reads from
    // the existing `employees` list (already loaded above).
    expect(SRC).toContain('name="assignmentId"');
    expect(SRC).toContain('label="الموظف"');
    expect(SRC).toMatch(/value:\s*String\(e\.activeAssignmentId \?\? e\.assignmentId \?\? e\.id\)/);
  });

  it("removes the dead Label/Select/DatePicker imports (FormShell renders them)", () => {
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
    expect(SRC).not.toContain('from "@/components/ui/date-picker"');
  });

  it("useApiMutation generic narrowed (was implicit any)", () => {
    expect(SRC).toContain("useApiMutation<unknown, { assignmentId: number; shiftId: number; startDate: string }>");
  });

  it("stays inline Card — CONTRIBUTING.md §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
    // The Card wraps the inline form section.
    expect(SRC).toContain('Card className="mb-4 border-status-info-surface"');
  });

  it("removes the old useState({assignmentId, shiftId, startDate}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*assignmentId:\s*""\s*,\s*shiftId:\s*""\s*,\s*startDate:\s*""\s*\}\)/);
  });
});
