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
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
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

describe("admin-integrations — create form on FormShell + zod with superRefine per-type validation", () => {
  const SRC = read("admin-integrations.tsx");

  it("imports the FormShell stack", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormTextareaField");
    expect(SRC).toContain("FormSelectField");
  });

  it("validates config at schema time via superRefine — JSON for non-github, token for github", () => {
    // The old flow: try { JSON.parse(form.config) } catch { toast(...); return; }
    // Now validation runs at schema time per type: non-github → valid JSON,
    // github → token present (it uses the simple token field, not raw JSON).
    expect(SRC).toContain("z.string()");
    expect(SRC).toContain("superRefine");
    expect(SRC).toMatch(/JSON\.parse\(val\.config/);
    expect(SRC).toContain("صيغة JSON غير صالحة");
    expect(SRC).toContain("التوكن مطلوب");
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

  it("submit builds config by type — JSON.parse for non-github, {token,repo} for github", () => {
    // The schema already validated per type, so the handler parses the JSON
    // config for non-github and assembles {token, repo} for github.
    expect(SRC).toMatch(/JSON\.parse\(values\.config/);
    expect(SRC).toContain("token:");
    expect(SRC).toContain("repo:");
  });

  it("github type shows a single masked token field + prefilled repo (no raw JSON)", () => {
    // §5/3 — a non-technical operator pastes only the token; repo is prefilled.
    expect(SRC).toContain("useWatch");
    expect(SRC).toContain("githubToken");
    expect(SRC).toContain("رمز الوصول");
    expect(SRC).toMatch(/type="password"/);
  });
});
