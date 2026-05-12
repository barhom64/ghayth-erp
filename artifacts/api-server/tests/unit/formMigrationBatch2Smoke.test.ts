import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Two more form migrations under the audit's "280+ useState forms"
 * P2 finding. Both pages had inline `useState({...})` create-forms
 * with manual `disabled={!form.x}` guards and (in the integrations
 * case) a try/catch JSON.parse that fired AFTER submit.
 *
 * After this PR they're both on the FormShell + zod stack established
 * in #281 (support kb) — same shape-locking smoke pattern.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("hr/salary-components — create form on FormShell + zod", () => {
  const SRC = read("hr/salary-components.tsx");

  it("imports the FormShell stack", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormTextField");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain("FormSelectField");
  });

  it("defines a salaryComponentSchema with closed enums + coerced number", () => {
    expect(SRC).toContain("const salaryComponentSchema = z.object(");
    expect(SRC).toContain('z.enum(["fixed", "percentage", "formula"])');
    expect(SRC).toContain('z.enum(["earning", "deduction", "benefit"])');
    expect(SRC).toContain("z.coerce");
  });

  it("removes the old useState(form) + setForm({ ... }) pair", () => {
    // The original form held value as a *string* and coerced via
    // Number(form.value) at submit. Migration kills both.
    expect(SRC).not.toMatch(/useState\(\{\s*name:\s*""\s*,\s*calculationType:/);
    expect(SRC).not.toMatch(/setForm\(\{\s*name:\s*""\s*,/);
  });

  it("submits via FormShell.onSubmit + mutateAsync + ctx.reset", () => {
    expect(SRC).toContain("await createMut.mutateAsync(values)");
    expect(SRC).toContain("ctx.reset()");
  });

  it("preserves the cancel UX via secondaryActions", () => {
    expect(SRC).toContain("secondaryActions=");
  });
});

describe("admin-integrations — create form on FormShell + zod with refine() JSON validation", () => {
  const SRC = read("admin-integrations.tsx");

  it("imports the FormShell stack", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormTextareaField");
    expect(SRC).toContain("FormSelectField");
  });

  it("validates JSON config inline via z.string().refine() — not after submit", () => {
    // The old flow: try { JSON.parse(form.config) } catch { toast(...); return; }
    // The new flow surfaces the error next to the field, before submit.
    expect(SRC).toContain("z.string()");
    expect(SRC).toMatch(/\.refine\(\(s\) => \{[\s\S]+JSON\.parse\(s\)/);
    expect(SRC).toContain("صيغة JSON غير صالحة");
  });

  it("removes the old try/catch on form.config inside handleCreate", () => {
    // Schema enforces validity. Submit handler can JSON.parse safely
    // — no try/catch around it (the dead error-toast path is gone).
    expect(SRC).not.toMatch(/try \{ parsedConfig = JSON\.parse\(form\.config\)/);
    expect(SRC).not.toContain("خطأ في صيغة الإعدادات");
  });

  it("kills the manual `disabled={!form.name || createMut.isPending}` guard", () => {
    // FormShell handles isSubmitting + zod handles the required-field
    // disable. Anything that re-introduces the manual guard regresses.
    expect(SRC).not.toMatch(/disabled=\{!form\.name/);
  });

  it("removes unused Input/Label/Select/Textarea imports (now via FormShell)", () => {
    // These were only used inside the migrated form. Leaving them
    // imported is a soft regression (lint will flag it), so assert
    // they're truly gone.
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
    expect(SRC).not.toContain('from "@/components/ui/textarea"');
  });

  it("submit handler safe-parses JSON because the schema already validated it", () => {
    expect(SRC).toContain("// Schema already guaranteed config is valid JSON");
    expect(SRC).toMatch(/const parsedConfig = JSON\.parse\(values\.config\);/);
  });
});
