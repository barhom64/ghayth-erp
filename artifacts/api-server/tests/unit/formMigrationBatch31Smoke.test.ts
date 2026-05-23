import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 31 — reports/scheduled-reports CreateForm. 47 of ~280 forms
 * now on FormShell + zod.
 *
 * Introduces the boolean-Switch pattern: schema declares
 * `isActive: z.boolean()`, and an ActiveSwitch subcomponent uses
 * useFormContext + watch/setValue to drive the existing Switch UI.
 * Same shape as the ModulesPicker in admin/roles (#356).
 *
 * The recipients field is a comma-separated email string. The old
 * code did two imperative toasts (empty + non-emails); zod now
 * collapses both into a single `.refine` so the submit button can't
 * fire with an invalid list and the error renders inline.
 *
 * §3.4 compliant (inline Card via showForm toggle, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "reports/scheduled-reports.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("reports/scheduled-reports — CreateForm on FormShell + zod (Switch + email-list)", () => {
  it("imports the FormShell stack + useFormContext", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormTextField");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain('useFormContext } from "react-hook-form"');
  });

  it("scheduleSchema requires title + frequency (enum) + non-empty recipient list", () => {
    expect(SRC).toContain("scheduleSchema = z.object(");
    expect(SRC).toMatch(/^\s*title:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*frequency:\s*z\.enum\(\["daily",\s*"weekly",\s*"monthly"\]\)/m);
    expect(SRC).toMatch(/^\s*recipients:\s*z\.string\(\)\.refine/m);
  });

  it("isActive is a real boolean schema field, not state-level", () => {
    expect(SRC).toMatch(/^\s*isActive:\s*z\.boolean\(\)/m);
  });

  it("ActiveSwitch subcomponent drives Switch via watch/setValue", () => {
    expect(SRC).toContain("function ActiveSwitch()");
    expect(SRC).toContain('useFormContext<ScheduleForm>()');
    expect(SRC).toMatch(/setValue\(\s*"isActive",/);
  });

  it("removes the imperative top-level `if (!form.title || !form.recipients)` toast guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.title \|\| !form\.recipients\)/);
    // The `emails.length === 0` check survives but is now INSIDE the
    // zod .refine() — see scheduleSchema.recipients above. So the
    // submit button refuses to fire instead of opening a toast.
    expect(SRC).toMatch(/recipients:\s*z\.string\(\)\.refine\(/);
  });

  it("removes the old useState({reportType, title, frequency, ...}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*reportType:\s*"trial-balance"/);
  });

  it("typed useApiMutation generic (was useApiMutation(...) untyped)", () => {
    expect(SRC).toContain("useApiMutation<unknown, {");
    expect(SRC).toContain("recipients: string[]");
  });

  it("handleSubmit takes a typed ScheduleForm + splits recipients on submit", () => {
    expect(SRC).toContain("type ScheduleForm = z.infer<typeof scheduleSchema>");
    expect(SRC).toContain("const handleSubmit = async (values: ScheduleForm)");
    expect(SRC).toContain('values.recipients.split(","');
  });

  it("drops dead Input/Select imports + raw Calendar icon import preserved (used elsewhere)", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
    // Calendar icon is still used in the schedule rows below.
    expect(SRC).toMatch(/from "lucide-react"/);
  });

  it("stays inline Card — CONTRIBUTING.md §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
  });
});
