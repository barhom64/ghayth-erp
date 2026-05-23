import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 21 — finance/fixed-assets create-asset form.
 * 34 of ~280 forms now on FormShell + zod.
 *
 * Was a custom `fixed inset-0 bg-black/50 z-50` modal overlay —
 * converted to inline Card per CONTRIBUTING.md §3.4 (no modal for
 * create/edit).
 *
 * The `<Input type="month">` period selector and `<Label>` inside
 * the depreciate panel are NOT part of this migration; those imports
 * stay.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "finance/fixed-assets.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("finance/fixed-assets — create form on FormShell + zod (§3.4)", () => {
  it("imports the FormShell stack with FormDateField + FormSelectField", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("FormDateField");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain("FormTextareaField");
  });

  it("assetSchema enforces required name + purchaseDate + positive purchaseCost", () => {
    expect(SRC).toContain("assetSchema = z.object(");
    expect(SRC).toMatch(/^\s*name:\s*z\.string\(\)\.trim\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*purchaseDate:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*purchaseCost:\s*z\.coerce\.number\(\)\.positive/m);
    expect(SRC).toMatch(/^\s*depreciationMethod:\s*z\.enum/m);
  });

  it("useApiMutation generic narrowed (was implicit any)", () => {
    expect(SRC).toContain("useApiMutation<unknown, AssetForm>");
  });

  it("removes the custom modal overlay (CONTRIBUTING.md §3.4)", () => {
    // The old form was wrapped in a fixed/black-overlay div — that
    // was effectively a modal. After migration only the depreciate
    // panel may use it (out-of-scope for this batch).
    const createBlock = SRC.split("إضافة أصل ثابت")[1] ?? "";
    expect(createBlock.slice(0, 500)).not.toMatch(/fixed inset-0 bg-black/);
  });

  it("removes the old useState({name, code, category, ...}) form shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*name:\s*""\s*,\s*code:\s*""\s*,\s*category/);
  });

  it("drops the dead Select import (FormSelectField replaces it)", () => {
    expect(SRC).not.toContain('from "@/components/ui/select"');
    expect(SRC).not.toContain('from "@/components/ui/unified-date-input"');
  });

  it("submit handler types values via z.infer", () => {
    expect(SRC).toContain("type AssetForm = z.infer<typeof assetSchema>");
    expect(SRC).toContain("async function handleCreate(values: AssetForm)");
  });

  it("default depreciationMethod is widened with 'as const' for zod enum", () => {
    // Without `as const` TypeScript infers `string` and the
    // FormShell generic refuses the literal-union schema. Documented
    // here so a future refactor doesn't drop it.
    expect(SRC).toContain('depreciationMethod: "straight_line" as const');
  });
});
