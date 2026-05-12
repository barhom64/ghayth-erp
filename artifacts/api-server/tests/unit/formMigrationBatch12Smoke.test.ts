import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 12 of the forms migration. First batch under the new
 * CONTRIBUTING.md (CONTRIBUTING.md §3.4) rules:
 *
 *   - no useState for form state when FormShell is available
 *   - no modal for create/edit — inline full-page card
 *   - FormShell + Zod with closed enums for status fields
 *   - RTL preserved
 *   - Arabic formatters / labels untouched
 *   - single objective per PR (this PR: 1 form, ~110 lines diff)
 *
 * After this PR: 25 of ~280 useState forms now on FormShell + zod.
 *
 * Migration: hr/transfers.tsx (employee transfer request)
 *   - Already inline (no modal) — preserved as inline Card.
 *   - DatePicker → FormDateField (UnifiedDateInput under the hood,
 *     same dual Hijri/Gregorian calendar UX).
 *   - employeeId + toBranchId both required in schema (was a single
 *     toast guard on submit).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("hr/transfers — transfer-request form on FormShell + zod (CONTRIBUTING.md §3.4 compliant)", () => {
  const SRC = read("hr/transfers.tsx");

  it("imports the FormShell stack with FormDateField", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormDateField");
    expect(SRC).toContain("FormSelectField");
  });

  it("schema requires BOTH employeeId and toBranchId (was a single toast guard)", () => {
    expect(SRC).toContain("transferSchema = z.object(");
    expect(SRC).toMatch(/^\s*employeeId:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*toBranchId:\s*z\.string\(\)\.min\(1/m);
  });

  it("stays as INLINE card — CONTRIBUTING.md §3.4 forbids modal for create/edit", () => {
    // The original was inline (good); the migration must NOT regress to
    // a Dialog / modal wrapper.
    expect(SRC).not.toMatch(/<Dialog\b/);
    expect(SRC).toContain("<Card");
    // Confirm CONTRIBUTING reference is in the doc-comment so future
    // edits see the constraint inline.
    expect(SRC).toContain("CONTRIBUTING.md §3.4");
  });

  it("removes the bare `if (!form.employeeId || !form.toBranchId)` toast guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.employeeId \|\| !form\.toBranchId\)/);
  });

  it("removes the dead Input / Label / Select / DatePicker imports", () => {
    // These were only used inside the migrated form. After migration
    // FormShell renders them, so the imports are dead weight.
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
    expect(SRC).not.toContain('from "@/components/ui/date-picker"');
  });

  it("removes the manual `disabled={createTransferMut.isPending}` + label-swap pattern", () => {
    expect(stripComments(SRC)).not.toMatch(/disabled=\{createTransferMut\.isPending\}/);
  });

  it("submit handler propagates errors cleanly (no toast import needed for the form)", () => {
    // The schema's `min(1)` errors render inline by FormShell. The
    // useApiMutation's default error toast handles the API rejection.
    // The migrated handler should be a clean awaited mutateAsync.
    expect(SRC).toContain("await createTransferMut.mutateAsync(values)");
  });
});
