import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 37 — admin/rbac-v2-sod-tab (Separation-of-Duties rule
 * builder). 53 of ~280 forms now on FormShell + zod.
 *
 * Two new patterns vs. earlier batches:
 *
 * 1. **Dialog → inline Card**: the old `AddSodRuleDialog` used the
 *    shadcn `<Dialog>` modal — CONTRIBUTING.md §3.4 forbids modals
 *    for create/edit, so the form is now a toggleable inline Card
 *    above the rules table.
 *
 * 2. **Dependent dropdown**: `actionA` / `actionB` options depend on
 *    the selected `featureA` / `featureB`. ActionPicker watches the
 *    parent feature and uses `key={selectedFeature}` to remount the
 *    action FormSelectField — so stale action values are cleared
 *    automatically when the feature changes.
 *
 * ruleKey regex (^[a-z_]+$) lives in the schema; the imperative
 * `!form.ruleKey || ...` button-disabled list is replaced by zod
 * validation that gates the submit.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "admin/rbac-v2-sod-tab.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("admin/rbac-v2-sod-tab — Dialog → inline Card + dependent dropdowns", () => {
  it("imports the FormShell stack + useFormContext + useWatch", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("useFormContext, useWatch");
  });

  it("sodRuleSchema regex-locks ruleKey + uses zod enum for severity", () => {
    expect(SRC).toContain("sodRuleSchema = z.object(");
    expect(SRC).toMatch(/^\s*ruleKey:\s*z\.string\(\)\s*\n\s*\.min\(1/m);
    expect(SRC).toMatch(/\.regex\(\/\^\[a-z_\]\+\$\//);
    expect(SRC).toMatch(/^\s*severity:\s*z\.enum\(\["critical",\s*"high",\s*"medium",\s*"low"\]\)/m);
  });

  it("REMOVES the Dialog wrapper — converted to inline Card per §3.4", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
    expect(SRC).not.toContain('from "@/components/ui/dialog"');
    expect(stripComments(SRC)).not.toMatch(/function AddSodRuleDialog\(/);
    // Replaced by:
    expect(SRC).toContain("function AddSodRuleForm(");
    expect(SRC).toContain('Card className="border-2 border-primary/20"');
  });

  it("dependent dropdown via ActionPicker — key={selectedFeature} for stale-clear", () => {
    expect(SRC).toContain("function ActionPicker(");
    expect(SRC).toMatch(/useWatch<SodRuleForm>\(\{\s*name:\s*featureName\s*\}\)/);
    expect(SRC).toContain("key={selectedFeature}");
    expect(SRC).toMatch(/\.available_actions\s*\?\?\s*\[\]/);
  });

  it("removes the AddSodRuleDialog useState({ruleKey, labelAr, ...}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*ruleKey:\s*""\s*,\s*labelAr:\s*""/);
  });

  it("removes the imperative button-disabled boolean list", () => {
    expect(stripComments(SRC)).not.toMatch(/disabled=\{!form\.ruleKey \|\| !form\.labelAr/);
  });

  it("drops dead Input/Select imports — FormShell renders them", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
  });

  it("submit takes a typed SodRuleForm + uses FormShell's submit pipeline", () => {
    expect(SRC).toContain("type SodRuleForm = z.infer<typeof sodRuleSchema>");
    expect(SRC).toContain("const submit = async (values: SodRuleForm)");
    expect(SRC).toContain('apiFetch("/rbac/v2/sod"');
  });

  it("inline Card is toggled by showAdd state from the parent — no orphan dialog", () => {
    expect(SRC).toMatch(/onClick=\{\(\) => setShowAdd\(!showAdd\)\}/);
    expect(SRC).toMatch(/\{showAdd && \(\s*<Card/);
  });

  it("ConfirmDeleteDialog is preserved — destructive confirm, not create/edit", () => {
    // §3.4 only forbids modals for create/edit; destructive confirms
    // (AlertDialog/ConfirmDeleteDialog) are still allowed.
    expect(SRC).toContain("ConfirmDeleteDialog");
  });
});
