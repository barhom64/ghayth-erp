import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 30 — create/properties/owners-edit (full-page edit form).
 * 46 of ~280 forms now on FormShell + zod.
 *
 * Demonstrates the conditional-field pattern: the `crNumber` field
 * is rendered only when `ownerType === "company"`. We pull that out
 * into a `OwnerFormBody` subcomponent that uses `useFormContext` +
 * `watch("ownerType")`. The schema still declares `crNumber` so the
 * payload always carries it (server treats blank as "no CR number").
 *
 * The previous useFieldErrors + manual regex validators for phone
 * (≥ 9 digits) and email are now zod refinements; the error renders
 * inline on the field instead of as a top-of-form toast.
 *
 * Server-state hydration uses key={owner.id} — no more useEffect →
 * setForm round-trip after the query resolves.
 *
 * §3.4 compliant (full-page CreatePageLayout, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "create/properties/owners-edit.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("create/properties/owners-edit — full-page edit form on FormShell + zod", () => {
  it("imports the FormShell stack + useFormContext", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormEmailField");
    expect(SRC).toContain("FormPhoneField");
    expect(SRC).toContain("FormDateField");
    expect(SRC).toContain('useFormContext } from "react-hook-form"');
  });

  it("ownerSchema enforces name, ownerType enum, and phone/email refinements", () => {
    expect(SRC).toContain("ownerSchema = z.object(");
    expect(SRC).toMatch(/^\s*ownerType:\s*z\.enum\(\["individual",\s*"company"\]\)/m);
    expect(SRC).toMatch(/^\s*name:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*phone:\s*z\.string\(\)\.trim\(\)\.refine/m);
    expect(SRC).toMatch(/^\s*email:\s*z\.string\(\)\.trim\(\)\.refine/m);
  });

  it("conditional crNumber field driven by OwnerFormBody + watch('ownerType')", () => {
    expect(SRC).toContain("function OwnerFormBody()");
    expect(SRC).toContain('watch } = useFormContext<OwnerForm>()');
    expect(SRC).toContain('ownerType = watch("ownerType")');
    expect(SRC).toMatch(/ownerType === "company"\s*&&[\s\S]{0,80}name="crNumber"/);
  });

  it("server-state hydration via key={owner.id} — no useEffect→setForm round-trip", () => {
    expect(SRC).toContain("key={owner.id}");
    expect(stripComments(SRC)).not.toMatch(/useEffect\(\(\) => \{\s*if \(owner && owner\.id\) \{\s*setForm/);
  });

  it("removes the old useState({ownerType, name, ...}) + useFieldErrors", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*ownerType:\s*"individual"/);
    expect(SRC).not.toContain("useFieldErrors");
  });

  it("removes the imperative regex+toast guards (phone/email)", () => {
    expect(stripComments(SRC)).not.toMatch(/replace\(\/\\D\/g,\s*""\)\.length < 9/);
    expect(stripComments(SRC)).not.toMatch(/\/\^\[\^\\s@\]\+@\[\^\\s@\]\+\\\.\[\^\\s@\]\+\$\/\.test\(form\.email\)/);
  });

  it("handleSave takes a typed OwnerForm", () => {
    expect(SRC).toContain("type OwnerForm = z.infer<typeof ownerSchema>");
    expect(SRC).toContain("const handleSave = async (values: OwnerForm)");
    expect(SRC).toContain("apiPatch(`/properties/owners/${params?.id}`, payload)");
  });

  it("drops the legacy form-field-wrapper + DatePicker + Select imports", () => {
    expect(SRC).not.toContain('from "@/components/shared/form-field-wrapper"');
    expect(SRC).not.toContain('from "@/components/ui/date-picker"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
  });

  it("stays a full-page route (CreatePageLayout) — §3.4 (no modal)", () => {
    expect(SRC).toContain("<CreatePageLayout");
    expect(SRC).not.toMatch(/<Dialog\b/);
    expect(SRC).not.toMatch(/fixed inset-0 bg-black/);
  });
});
