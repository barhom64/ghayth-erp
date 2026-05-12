import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 10 of the forms migration. After this PR: 23 of ~280 useState
 * forms now on FormShell + zod.
 *
 * Migration:
 *   fleet/traffic-violations.tsx     traffic-violation create
 *
 * 8-field form with two foreign-key dropdowns (vehicle + driver),
 * one closed-enum dropdown (violation type), one date, three text
 * fields and one money field. The driver dropdown uses a "none"
 * sentinel which the submit handler converts to null — preserved
 * verbatim since the API contract expects it.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("fleet/traffic-violations — violation-create on FormShell + zod", () => {
  const SRC = read("fleet/traffic-violations.tsx");

  it("imports the FormShell stack with FormDateField + FormNumberField", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormDateField");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain("FormSelectField");
  });

  it("schema requires vehicleId + uses closed enum for violationType", () => {
    expect(SRC).toContain("violationSchema = z.object(");
    expect(SRC).toMatch(/^\s*vehicleId:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toContain('z.enum(["speeding", "red_light", "no_seatbelt", "wrong_parking", "phone", "other"])');
  });

  it("removes the manual `if (!form.vehicleId || !form.violationType)` toast guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.vehicleId \|\| !form\.violationType\)/);
  });

  it("preserves the 'none' sentinel → null mapping on driverId (API contract)", () => {
    // The fleet endpoint expects `driverId: null` for "no driver". The
    // sentinel string "none" survives unchanged in the form because
    // SelectItems with empty-string value disable the placeholder.
    expect(SRC).toContain('values.driverId !== "none" ? Number(values.driverId) : null');
  });

  it("removes the inline <UnifiedDateInput> + <Input>/<Label>/<Select> imports", () => {
    expect(SRC).not.toContain('from "@/components/ui/unified-date-input"');
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
  });

  it("violationType defaultValue uses `as const` so TS narrows to the enum literal", () => {
    expect(SRC).toContain('violationType: "speeding" as const');
  });

  it("removes the old useState({vehicleId, driverId, ...}) initial value", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*vehicleId:\s*""\s*,\s*driverId:\s*""\s*,\s*violationType:\s*"speeding"/);
  });
});
