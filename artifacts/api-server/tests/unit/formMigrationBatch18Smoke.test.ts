import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 18 — finance/salary-advances CreateAdvanceForm.
 * 31 of ~280 forms now on FormShell + zod.
 *
 * §3.4 compliant (inline Card via showForm toggle, no modal).
 * Schema now coerces amount + deductMonths to numbers at the boundary
 * so the server stops receiving "5" strings when it expected 5.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "finance/salary-advances.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("finance/salary-advances — CreateAdvanceForm on FormShell + zod", () => {
  it("imports the FormShell stack with FormNumberField + FormSelectField", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("FormGrid");
  });

  it("advanceSchema coerces amount + deductMonths to numbers (was string→Number at submit)", () => {
    expect(SRC).toContain("advanceSchema = z.object(");
    expect(SRC).toMatch(/^\s*employeeName:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*amount:\s*z\.coerce\.number\(\)\.positive/m);
    expect(SRC).toMatch(/^\s*deductMonths:\s*z\.coerce\.number\(\)\.int\(\)\.positive/m);
  });

  it("useApiMutation generic narrowed (was useApiMutation<unknown, any>)", () => {
    expect(SRC).toContain("useApiMutation<unknown, AdvanceForm>");
  });

  it("removes the old useState({employeeName, amount, ...}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*employeeName:\s*""/);
  });

  it("removes the dead Input/Label/Select imports (FormShell renders them)", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
  });

  it("stays inline Card — CONTRIBUTING.md §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
  });

  it("submit handler types values via z.infer — was implicit any", () => {
    expect(SRC).toContain("type AdvanceForm = z.infer<typeof advanceSchema>");
  });

  it("secondary 'إلغاء' button preserved (toggle off without submit)", () => {
    // The list page uses a top-level toggle button — the form's own
    // cancel inside FormShell is the secondaryActions slot.
    expect(SRC).toContain("secondaryActions=");
    expect(SRC).toMatch(/onClick=\{onDone\}/);
  });
});
