import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 34 — settings/system-controls-tab (system-wide approval +
 * notification toggles). 50 of ~280 forms now on FormShell + zod.
 *
 * Introduces the dotted-key pattern: the server stores controls
 * under keys like "approval.require_notes_on_reject", but
 * react-hook-form treats dots as nested paths. We map dots →
 * underscores for the form fields (via a KEY_MAP table) and convert
 * back on submit. Schema then declares plain boolean / non-negative
 * integer fields per control.
 *
 * Toggle and number inputs are bound via ToggleControl / NumberControl
 * subcomponents that use useFormContext + useWatch — the per-row
 * flex layout doesn't fit the standard FormGrid → FormNumberField
 * primitives.
 *
 * §3.4 compliant (inline Cards, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "settings/system-controls-tab.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("settings/system-controls-tab — on FormShell + zod (dotted-keys pattern)", () => {
  it("imports FormShell + react-hook-form's useFormContext + useWatch", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain('useFormContext, useWatch } from "react-hook-form"');
  });

  it("schema enforces boolean toggles + non-negative integer numerics", () => {
    expect(SRC).toContain("systemControlsSchema = z.object(");
    expect(SRC).toMatch(/^\s*approval_require_notes_on_reject:\s*z\.boolean\(\)/m);
    expect(SRC).toMatch(/^\s*approval_max_return_count:\s*z\.coerce\.number\(\)\.int\(\)\.nonnegative\(\)/m);
    expect(SRC).toMatch(/^\s*system_attachment_max_count:\s*z\.coerce\.number\(\)\.int\(\)\.nonnegative\(\)/m);
  });

  it("KEY_MAP maps underscored form keys back to dotted server keys", () => {
    expect(SRC).toMatch(/const KEY_MAP:\s*Record<keyof SystemControlsForm,\s*string>/);
    expect(SRC).toContain('approval_require_notes_on_reject: "approval.require_notes_on_reject"');
    expect(SRC).toContain('system_attachment_max_size_mb: "system.attachment_max_size_mb"');
  });

  it("handleSave rebuilds the dotted-key payload before PUT", () => {
    expect(SRC).toContain("const handleSave = async (values: SystemControlsForm)");
    expect(SRC).toMatch(/payload\[KEY_MAP\[formKey as keyof SystemControlsForm\]\] = value/);
  });

  it("ToggleControl + NumberControl subcomponents drive the per-row inputs via context", () => {
    expect(SRC).toContain("function ToggleControl(");
    expect(SRC).toContain("function NumberControl(");
    expect(SRC).toContain('useFormContext<SystemControlsForm>()');
    expect(SRC).toMatch(/useWatch<SystemControlsForm>\(\{\s*name\s*\}\)/);
  });

  it("removes the useEffect → setForm hydration round-trip", () => {
    expect(stripComments(SRC)).not.toMatch(/useEffect\(\(\) => \{\s*if \(data\?\.data\)/);
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*"approval\.require_notes_on_reject"/);
  });

  it("removes the imperative `setForm({ ...form, [item.key]: ... })` mutation calls", () => {
    expect(stripComments(SRC)).not.toMatch(/setForm\(\{\s*\.\.\.form,\s*\[item\.key\]/);
  });

  it("remountKey re-seeds defaults when server returns fresh data", () => {
    expect(SRC).toContain("const remountKey = JSON.stringify(defaults)");
    expect(SRC).toContain("key={remountKey}");
  });

  it("stays inline Cards — §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
  });
});
