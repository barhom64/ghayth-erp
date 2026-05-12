import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 17 — warehouse/inventory-count create-session form.
 * 30 of ~280 forms now on FormShell + zod.
 *
 * §3.4 compliant (inline Card, no modal). Page also had its approve
 * action migrated to AlertDialog in #290 — that work is preserved.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "warehouse/inventory-count.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("warehouse/inventory-count — create-session form on FormShell + zod", () => {
  it("imports the FormShell stack with FormDateField", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormDateField");
  });

  it("createCountSchema requires countDate (was no validation at all)", () => {
    expect(SRC).toContain("createCountSchema = z.object(");
    expect(SRC).toMatch(/^\s*countDate:\s*z\.string\(\)\.min\(1/m);
  });

  it("removes the old useState({countDate, notes, warehouseLocation})", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*countDate:\s*new Date/);
  });

  it("UnifiedDateInput import dropped (FormDateField wraps it)", () => {
    expect(SRC).not.toContain('from "@/components/ui/unified-date-input"');
  });

  it("Label import dropped (FormShell renders labels via FieldWrapper)", () => {
    expect(SRC).not.toContain('from "@/components/ui/label"');
  });

  it("Input import PRESERVED — used by per-item edit inside the table", () => {
    // The DataTable's row-expansion has per-product Input fields for
    // physicalCount entry; those are not part of this migration.
    expect(SRC).toContain('from "@/components/ui/input"');
  });

  it("approve AlertDialog from #290 preserved (not regressed)", () => {
    // The previous migration in #290 swapped window.confirm() for an
    // AlertDialog. Verify we didn't accidentally remove it.
    expect(SRC).toContain("approveTargetId");
    expect(SRC).toContain("<AlertDialog");
  });

  it("submit handler types values via z.infer — was implicit untyped", () => {
    expect(SRC).toContain("const handleCreate = async (values: CreateCountForm)");
  });
});
