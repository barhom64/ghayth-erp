import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 22 — properties/inspections schedule-inspection form.
 * 35 of ~280 forms now on FormShell + zod.
 *
 * §3.4 compliant (inline Card via showForm toggle, no modal).
 * CompleteInspectionDialog (AlertDialog from a prior migration that
 * replaced two consecutive native prompt() calls) preserved — it's
 * a destructive-completion confirm, not create/edit.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "properties/inspections.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("properties/inspections — schedule form on FormShell + zod", () => {
  it("imports the FormShell stack with FormDateField + FormSelectField", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("FormDateField");
    expect(SRC).toContain("FormNumberField");
  });

  it("inspectionSchema requires unitId + type", () => {
    expect(SRC).toContain("inspectionSchema = z.object(");
    expect(SRC).toMatch(/^\s*unitId:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*type:\s*z\.string\(\)\.min\(1/m);
  });

  it("replaces the inline apiFetch+toast pair with typed useApiMutation", () => {
    expect(SRC).toContain("useApiMutation<unknown, Record<string, unknown>>");
    // The completion PATCH still uses apiFetch — that's the other concern.
    expect(SRC).toContain('apiFetch(`/properties/inspections/${id}`');
  });

  it("removes the old useState({unitId, type, scheduledDate, ...}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*unitId:\s*""\s*,\s*type:\s*"routine"/);
  });

  it("removes dead Input/Label/Select/Textarea/UnifiedDateInput imports", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
    expect(SRC).not.toContain('from "@/components/ui/textarea"');
    expect(SRC).not.toContain('from "@/components/ui/unified-date-input"');
  });

  it("removes the dead `if (!form.unitId || !form.type)` guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.unitId \|\| !form\.type\)/);
  });

  it("CompleteInspectionDialog + its zod schema preserved (not regressed)", () => {
    // Migrated previously — must survive.
    expect(SRC).toContain("CompleteInspectionDialog");
    expect(SRC).toContain("completionSchema");
    expect(SRC).toContain("<AlertDialog");
  });

  it("optional conditionRating stays a string in the schema; submit coerces+nulls", () => {
    expect(SRC).toContain("type InspectionForm = z.infer<typeof inspectionSchema>");
    expect(SRC).toContain("const handleSave = async (values: InspectionForm)");
    expect(SRC).toMatch(/conditionRating:\s*values\.conditionRating\s*\?\s*Number\(values\.conditionRating\)\s*:\s*null/);
  });
});
