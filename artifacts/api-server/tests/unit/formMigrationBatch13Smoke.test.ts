import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 13 of the forms migration. CONTRIBUTING.md §3.4 compliant
 * (inline card, no modal, FormShell + zod + RTL preserved).
 *
 * After this PR: 26 of ~280 useState forms now on FormShell + zod.
 *
 * Migration: hr/public-holidays.tsx (public holiday create + edit)
 *   - dual-mode form (create + edit) using `key={editingId ?? "new"}`
 *     trick to remount on edit-target change
 *   - DatePicker → FormDateField (UnifiedDateInput, dual Hijri/Gregorian)
 *   - `setForm` (live edit buffer) renamed to `setFormInitial` (the
 *     seed passed to FormShell.defaultValues) — clarifies the live
 *     values now live inside react-hook-form, not in React state
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("hr/public-holidays — dual-mode holiday form on FormShell + zod (CONTRIBUTING.md §3.4)", () => {
  const SRC = read("hr/public-holidays.tsx");

  it("imports the FormShell stack with FormDateField", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormDateField");
    expect(SRC).toContain("FormSelectField");
  });

  it("schema requires name + startDate (was `if (!form.name || !form.startDate)` toast)", () => {
    expect(SRC).toContain("holidaySchema = z.object(");
    expect(SRC).toMatch(/^\s*name:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*startDate:\s*z\.string\(\)\.min\(1/m);
  });

  it("FormShell uses key={editingId ?? 'new'} for dual-mode remount", () => {
    // Same pattern as #304 (companies-tab + branches-tab) — the only
    // supported way to swap defaultValues mid-render without fighting
    // react-hook-form's "values kept across renders" behaviour.
    expect(SRC).toMatch(/key=\{editingId \?\? "new"\}/);
  });

  it("renames `form` (live edit buffer) to `formInitial` (seed for FormShell)", () => {
    // Per the pattern established in #304 — clarifies that the live
    // values are inside react-hook-form, not in React state.
    expect(SRC).toContain("setFormInitial");
    // The old `setForm({ ... })` call inside handleEdit etc. should
    // be gone — they all use setFormInitial now.
    expect(stripComments(SRC)).not.toMatch(/setForm\(\{\s*name:/);
  });

  it("removes the bare `if (!form.name || !form.startDate)` toast guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.name \|\| !form\.startDate\)/);
  });

  it("removes dead Input/Label/DatePicker/toast imports", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/date-picker"');
    expect(SRC).not.toContain('from "@/hooks/use-toast"');
  });

  it("stays inline card — CONTRIBUTING.md §3.4 forbids modal for create/edit", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
    expect(SRC).toContain("<Card");
  });

  it("submitLabel switches between إضافة and تحديث per editingId", () => {
    expect(SRC).toMatch(/submitLabel=\{editingId \? "تحديث العطلة" : "إضافة العطلة"\}/);
  });
});
