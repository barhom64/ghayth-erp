import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 32 — settings.tsx GeneralSettings (11-field general
 * settings panel). 48 of ~280 forms now on FormShell + zod.
 *
 * The CrudSection generic table form has since been migrated as
 * well — it now builds a runtime z.object() from its declarative
 * `fields` prop and renders the inputs via FormTextField. The
 * legacy <Input>/<Label> imports are gone from this file.
 *
 * The server stores values as a flat {key, value}[] list; we keep
 * the existing reducer that flattens them into a typed defaults
 * record, then pass that to FormShell with a stable
 * `key={JSON.stringify(defaults)}` so the form re-seeds on each
 * server refresh without an imperative useEffect → setForm.
 *
 * §3.4 compliant (inline Card, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "settings.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("settings.tsx GeneralSettings — on FormShell + zod", () => {
  it("imports the FormShell stack", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormEmailField");
    expect(SRC).toContain("FormPhoneField");
    expect(SRC).toContain("FormSelectField");
  });

  it("generalSettingsSchema uses zod enums for currency/timezone/calendarMode", () => {
    expect(SRC).toContain("generalSettingsSchema = z.object(");
    expect(SRC).toMatch(/^\s*currency:\s*z\.enum\(\["SAR",\s*"USD",\s*"AED"\]\)/m);
    expect(SRC).toMatch(/^\s*timezone:\s*z\.enum\(\["Asia\/Riyadh",\s*"Asia\/Dubai"\]\)/m);
    expect(SRC).toMatch(/^\s*calendarMode:\s*z\.enum\(\["hijri",\s*"gregorian",\s*"both"\]\)/m);
  });

  it("email is validated via zod refine (was a raw <Input>)", () => {
    expect(SRC).toMatch(/^\s*email:\s*z\.string\(\)\.trim\(\)\.refine/m);
  });

  it("removes the useEffect → setForm hydration round-trip", () => {
    // The hydration is now a one-shot map lookup feeding defaults,
    // and FormShell key={JSON.stringify(defaults)} forces a remount
    // when the server returns fresh values.
    expect(stripComments(SRC)).not.toMatch(/useEffect\(\(\) => \{\s*if \(settingsData\?\.data\)/);
    expect(SRC).toContain("const remountKey = JSON.stringify(defaults)");
    expect(SRC).toContain("key={remountKey}");
  });

  it("removes the GeneralSettings useState({companyName, companyNameEn, ...}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*companyName:\s*""\s*,\s*companyNameEn/);
  });

  it("saveMut is typed via the GeneralSettingsForm — handleSave takes values", () => {
    expect(SRC).toContain("type GeneralSettingsForm = z.infer<typeof generalSettingsSchema>");
    expect(SRC).toContain("useApiMutation<any, GeneralSettingsForm>");
  });

  it("CrudSection now builds a runtime zod schema and uses FormShell", () => {
    // The dynamic-field renderer was the last manual-form section in
    // this file; it now constructs z.object(schemaShape) from its
    // `fields` prop and renders FormTextField per field inside the
    // shared FormShell stack.
    expect(SRC).toContain("function CrudSection(");
    expect(SRC).toContain("const crudSchema = z.object(schemaShape)");
    expect(SRC).toMatch(/<FormShell[\s\S]+schema=\{crudSchema/);
    expect(SRC).toMatch(/<FormTextField\s+key=\{f\.name\}/);
    // Legacy raw <Input>/<Label> for this section is gone.
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
  });

  it("stays inline Card — §3.4 (no modal for create/edit)", () => {
    // The settings page wraps GeneralSettings in a Card; verify
    // nothing has crept in.
    const block = SRC.split("function GeneralSettings()")[1] ?? "";
    expect(block.split("function CrudSection")[0]).not.toMatch(/<Dialog\b/);
  });
});
