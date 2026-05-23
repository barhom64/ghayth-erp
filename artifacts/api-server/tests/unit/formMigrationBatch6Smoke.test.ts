import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 6 of the forms migration. After this PR: 15 of ~280 useState
 * forms now on FormShell + zod.
 *
 * Migrations (4 forms across 2 pages):
 *   store.tsx                products + orders (two forms in one page)
 *   documents-page.tsx       folders + templates (two forms in one page)
 *
 * Each page hosts two related forms — same shape pattern applied
 * twice. The bulk-mode handler signature is identical so a future
 * sweep can lift more dual-form pages with the same template.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("store.tsx — products + orders forms on FormShell + zod", () => {
  const SRC = read("store.tsx");

  it("imports the FormShell stack", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormNumberField");
  });

  it("productSchema coerces price/costPrice/quantity to numbers", () => {
    expect(SRC).toContain("productSchema = z.object(");
    expect(SRC).toMatch(/^\s*price:\s*z\.coerce\.number\(\)/m);
    expect(SRC).toMatch(/^\s*costPrice:\s*z\.coerce\.number\(\)/m);
    expect(SRC).toMatch(/^\s*quantity:\s*z\.coerce\.number\(\)\.int\(\)/m);
  });

  it("orderSchema coerces totalAmount; requires customerName", () => {
    expect(SRC).toContain("orderSchema = z.object(");
    expect(SRC).toMatch(/^\s*customerName:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*totalAmount:\s*z\.coerce\.number\(\)/m);
  });

  it("both createMut handlers are typed (no `Record<string, string | number>`)", () => {
    expect(SRC).toContain("useApiMutation<unknown, ProductForm>");
    expect(SRC).toContain("useApiMutation<unknown, OrderForm>");
    expect(stripComments(SRC)).not.toMatch(/useApiMutation<unknown, Record<string, string \| number>>/);
  });

  it("old { ...form, price: Number(form.price) } cast pattern is gone", () => {
    expect(stripComments(SRC)).not.toMatch(/price:\s*Number\(form\.price\)/);
    expect(stripComments(SRC)).not.toMatch(/totalAmount:\s*Number\(form\.totalAmount\)/);
  });

  it("Input/Label imports removed (only used in the migrated forms)", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
  });
});

describe("documents-page.tsx — folders + templates forms on FormShell + zod", () => {
  const SRC = read("documents-page.tsx");

  it("imports the FormShell stack", () => {
    // Accept either the legacy `@/components/form-shell` path or the
    // canonical `@workspace/ui-core` re-export. Either resolves to the
    // same FormShell module via the kit shim (UNIFICATION_PLAN §P8).
    const hasFormShellImport =
      SRC.includes('from "@/components/form-shell"') ||
      SRC.includes('from "@workspace/ui-core"');
    expect(hasFormShellImport).toBe(true);
    expect(SRC).toContain("FormShell");
  });

  it("defines both folderSchema and templateSchema with required name", () => {
    expect(SRC).toContain("folderSchema = z.object(");
    expect(SRC).toContain("templateSchema = z.object(");
    // Both share the same required-name pattern.
    const trimMatches = SRC.match(/^\s*name:\s*z\.string\(\)\.trim\(\)\.min\(1/gm) ?? [];
    expect(trimMatches.length).toBeGreaterThanOrEqual(2);
  });

  it("createMut handlers are typed FolderForm / TemplateForm", () => {
    expect(SRC).toContain("useApiMutation<any, FolderForm>");
    expect(SRC).toContain("useApiMutation<any, TemplateForm>");
  });

  it("removes both manual disabled={!form.name} guards", () => {
    expect(stripComments(SRC)).not.toMatch(/disabled=\{!form\.name/);
  });

  it("removes the per-page useState({ name, color }) and useState({ name, description, category })", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*name:\s*""\s*,\s*color:\s*""/);
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*name:\s*""\s*,\s*description:\s*""\s*,\s*category:\s*""/);
  });
});
