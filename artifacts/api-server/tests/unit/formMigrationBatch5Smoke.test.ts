import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 5 of the forms migration. After this PR: 11 of ~280 useState
 * forms now on FormShell + zod.
 *
 * Migrations:
 *   settings/companies-tab.tsx   create + edit company
 *   settings/branches-tab.tsx    create + edit branch (with companies dropdown)
 *
 * Both pages are dual-mode (create OR edit). Migration uses the
 * `key={editingId ?? "new"}` trick to remount the FormShell when the
 * edit target changes — cleanest way to swap defaultValues without
 * fighting react-hook-form's "form values are kept across renders"
 * behaviour.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("settings/companies-tab — dual-mode form on FormShell + zod", () => {
  const SRC = read("settings/companies-tab.tsx");

  it("imports the FormShell stack", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormTextField");
  });

  it("schema enforces trim + min(1) on the Arabic name", () => {
    expect(SRC).toContain("companyFormSchema = z.object(");
    expect(SRC).toMatch(/^\s*name:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
  });

  it("FormShell uses key={editingId ?? \"new\"} to remount on edit-target change", () => {
    // This is the supported react-hook-form pattern for switching
    // defaultValues. Without the key the form would keep stale values
    // when the user clicks "تعديل" on different rows.
    expect(SRC).toMatch(/key=\{editingId \?\? "new"\}/);
  });

  it("removes the local `creating` state — FormShell tracks isSubmitting", () => {
    expect(stripComments(SRC)).not.toMatch(/const \[creating, setCreating\] = useState/);
  });

  it("removes the bare `if (!form.name.trim())` toast guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.name\.trim\(\)\)/);
  });

  it("renames `form` state to `formInitial` to clarify it's only the seed", () => {
    expect(SRC).toContain("setFormInitial");
    // The old `setForm({ ... })` calls are gone in favour of the
    // single `setFormInitial({ ... })` seed setter.
    expect(stripComments(SRC)).not.toMatch(/setForm\(\{/);
  });
});

describe("settings/branches-tab — dual-mode form with required companies dropdown", () => {
  const SRC = read("settings/branches-tab.tsx");

  it("imports the FormShell stack with FormSelectField", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormSelectField");
  });

  it("schema requires a non-empty companyId — was a missing guard before", () => {
    // Old form let the user submit with empty companyId — server
    // would reject. Schema catches it client-side.
    expect(SRC).toMatch(/^\s*companyId:\s*z\.string\(\)\.min\(1/m);
  });

  it("memoises companyOptions to avoid spurious re-mounts", () => {
    // The select options array gets mapped from `companies` on every
    // render; without useMemo, FormSelectField would see a new ref
    // and re-render its dropdown unnecessarily.
    expect(SRC).toContain("useMemo");
    expect(SRC).toContain("const companyOptions = useMemo");
  });

  it("FormShell uses key={editingId ?? \"new\"} for remount on edit", () => {
    expect(SRC).toMatch(/key=\{editingId \?\? "new"\}/);
  });

  it("removes the bare `if (!form.name.trim())` toast guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.name\.trim\(\)\)/);
  });

  it("renames `form` state to `formInitial`", () => {
    expect(SRC).toContain("setFormInitial");
    expect(stripComments(SRC)).not.toMatch(/setForm\(\{/);
    // useEffect that defaults companyId now updates `formInitial`.
    expect(SRC).toMatch(/setFormInitial\(\(f\) => \(\{/);
  });
});
