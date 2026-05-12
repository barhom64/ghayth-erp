import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 33 — settings/letterhead-tab (branch-letterhead edit form
 * with a live preview pane). 49 of ~280 forms now on FormShell + zod.
 *
 * Introduces the live-preview pattern: a sibling component inside
 * FormShell calls `useWatch` to subscribe to form values, then feeds
 * them into LetterheadHeader without an intermediate parent state
 * mirror. The CardHeader title (`بيانات الكليشة - {form.name}`) is
 * also wired through useWatch via the BranchTitle subcomponent so it
 * reflects the in-flight name, not the (stale) selected row.
 *
 * Branch switching uses key={selectedBranch.id} to remount FormShell
 * with fresh defaults — drops the useEffect → setForm round-trip in
 * selectBranch(). The autoselect-first-branch effect is replaced by
 * a fall-through `branches[0]` default.
 *
 * §3.4 compliant (inline Cards, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "settings/letterhead-tab.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("settings/letterhead-tab — branch letterhead form with live preview", () => {
  it("imports the FormShell stack + react-hook-form's useWatch + useFormContext", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormEmailField");
    expect(SRC).toContain("FormPhoneField");
    expect(SRC).toContain("useFormContext, useWatch");
  });

  it("letterheadSchema requires name + validates email via refine", () => {
    expect(SRC).toContain("letterheadSchema = z.object(");
    expect(SRC).toMatch(/^\s*name:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*email:\s*z\.string\(\)\.trim\(\)\.refine/m);
  });

  it("LivePreview subcomponent uses useWatch — no parent state mirror", () => {
    expect(SRC).toContain("function LivePreview()");
    expect(SRC).toContain('useFormContext<LetterheadForm>()');
    expect(SRC).toContain("useWatch({ control })");
  });

  it("BranchTitle uses useWatch so the card title reflects in-flight `name`", () => {
    expect(SRC).toContain("function BranchTitle()");
    expect(SRC).toMatch(/useWatch<LetterheadForm,\s*"name">/);
  });

  it("branch switching re-seeds via key={selectedBranch.id} — no useEffect round-trip", () => {
    expect(SRC).toContain("key={selectedBranch.id}");
    expect(stripComments(SRC)).not.toMatch(/useEffect\(\(\) => \{\s*if \(branches\.length > 0 && !selectedBranchId\)/);
    expect(stripComments(SRC)).not.toMatch(/const selectBranch = \(branch: any\)/);
  });

  it("removes the LetterheadSettings useState({name, nameEn, ...}) form shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*name:\s*""\s*,\s*nameEn:\s*""/);
  });

  it("handleSave takes a typed LetterheadForm", () => {
    expect(SRC).toContain("type LetterheadForm = z.infer<typeof letterheadSchema>");
    expect(SRC).toContain("const handleSave = async (values: LetterheadForm)");
    expect(SRC).toContain("body: JSON.stringify(values)");
  });

  it("drops dead Input/Label/Save imports", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toMatch(/import \{[^}]*\bSave\b/);
  });

  it("stays inline Card — §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
  });
});
