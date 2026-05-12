import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 20 — fleet/preventive-plans create-plan form.
 * 33 of ~280 forms now on FormShell + zod.
 *
 * §3.4 compliant (inline Card via showForm toggle, no modal).
 * Optional numeric fields stay as strings in the schema and are
 * coerced+nulled in the submit handler — the API accepts null for
 * "no interval" but rejects NaN.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "fleet/preventive-plans.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("fleet/preventive-plans — create form on FormShell + zod", () => {
  it("imports the FormShell stack with FormDateField + FormSelectField", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("FormDateField");
    expect(SRC).toContain("FormNumberField");
  });

  it("planSchema requires vehicleId + serviceType", () => {
    expect(SRC).toContain("planSchema = z.object(");
    expect(SRC).toMatch(/^\s*vehicleId:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*serviceType:\s*z\.string\(\)\.min\(1/m);
  });

  it("replaces inline apiFetch+toast with useApiMutation", () => {
    expect(SRC).toContain("useApiMutation");
    expect(SRC).not.toMatch(/await apiFetch\(.{0,80}\/fleet\/preventive-plans/);
  });

  it("removes the dead `if (!form.vehicleId || !form.serviceType)` guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.vehicleId \|\| !form\.serviceType\)/);
  });

  it("removes the old useState({vehicleId, serviceType, ...}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*vehicleId:\s*""\s*,\s*serviceType:\s*"oil_change"/);
  });

  it("removes dead Input/Label/Select/UnifiedDateInput imports", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
    expect(SRC).not.toContain('from "@/components/ui/unified-date-input"');
  });

  it("stays inline Card — CONTRIBUTING.md §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
  });

  it("submit handler types values via z.infer and coerces nullable numerics", () => {
    expect(SRC).toContain("type PlanForm = z.infer<typeof planSchema>");
    expect(SRC).toContain("const handleSave = async (values: PlanForm)");
    // Empty optional numerics → null (was the original pattern, preserved):
    expect(SRC).toMatch(/intervalKm:\s*values\.intervalKm\s*\?\s*Number\(values\.intervalKm\)\s*:\s*null/);
  });
});
