import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 35 — settings/zatca-settings-tab. 51 of ~280 forms now on
 * FormShell + zod.
 *
 * Combines several patterns from previous batches:
 * - Multi-card edit form (3 stacked Cards wrapped by a single
 *   FormShell so they share form context).
 * - Custom toggle in CardTitle → EnabledToggle subcomponent.
 * - Conditional warning panel → ProductionWarning subcomponent.
 * - key={JSON.stringify(defaults)} remount on server refresh.
 *
 * Server stores `enabled` as a string ("true"/"false"); we coerce on
 * load and stringify back on save — schema sees a real `z.boolean()`.
 *
 * §3.4 compliant (inline Cards, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "settings/zatca-settings-tab.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("settings/zatca-settings-tab — multi-card edit on FormShell + zod", () => {
  it("imports the FormShell stack + useFormContext + useWatch", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormTextField");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("useFormContext, useWatch");
  });

  it("zatcaSchema enforces boolean+enum environment + trimmed string fields", () => {
    expect(SRC).toContain("zatcaSchema = z.object(");
    expect(SRC).toMatch(/^\s*enabled:\s*z\.boolean\(\)/m);
    expect(SRC).toMatch(/^\s*environment:\s*z\.enum\(\["sandbox",\s*"production"\]\)/m);
    expect(SRC).toMatch(/^\s*countryCode:\s*z\.string\(\)\.trim\(\)\.max\(2\)/m);
  });

  it("EnabledToggle subcomponent drives the custom switch via useFormContext", () => {
    expect(SRC).toContain("function EnabledToggle()");
    expect(SRC).toContain('useFormContext<ZatcaForm>()');
    expect(SRC).toMatch(/setValue\(\s*"enabled",/);
  });

  it("ProductionWarning shows/hides via useWatch on environment", () => {
    expect(SRC).toContain("function ProductionWarning()");
    expect(SRC).toMatch(/useWatch<ZatcaForm,\s*"environment">/);
    expect(SRC).toContain('environment !== "production"');
  });

  it("server-state hydration uses remountKey — no useEffect → setForm", () => {
    expect(SRC).toContain("const remountKey = JSON.stringify(defaults)");
    expect(SRC).toContain("key={remountKey}");
    expect(stripComments(SRC)).not.toMatch(/useEffect\(\(\) => \{\s*if \(settings\)/);
  });

  it("removes the useState({enabled, environment, ...}) form shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*enabled:\s*false\s*,\s*environment:\s*"sandbox"/);
  });

  it("handleSave takes typed ZatcaForm and stringifies `enabled` back for the server", () => {
    expect(SRC).toContain("type ZatcaForm = z.infer<typeof zatcaSchema>");
    expect(SRC).toContain("const handleSave = async (values: ZatcaForm)");
    expect(SRC).toMatch(/enabled:\s*values\.enabled\s*\?\s*"true"\s*:\s*"false"/);
  });

  it("handleTestConnection preserved — unrelated POST action, not part of save", () => {
    expect(SRC).toContain("const handleTestConnection = async ()");
    expect(SRC).toContain('/finance/zatca/test-connection');
  });

  it("drops Input + Label imports (replaced by FormShell primitives)", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
  });

  it("stays inline Cards — §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
  });
});
