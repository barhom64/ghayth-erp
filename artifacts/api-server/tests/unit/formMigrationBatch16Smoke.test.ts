import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 16 — gratuity calculator (READ-ONLY GET, no POST). 29 of ~280.
 * CONTRIBUTING.md §3.4 compliant (inline Card, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "hr/gratuity.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("hr/gratuity — end-of-service calculator on FormShell + zod", () => {
  it("imports the FormShell stack with FormDateField", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormDateField");
  });

  it("schema requires employeeId — was `if (!form.employeeId) return` silent guard", () => {
    expect(SRC).toContain("gratuitySchema = z.object(");
    expect(SRC).toMatch(/^\s*employeeId:\s*z\.string\(\)\.min\(1/m);
  });

  it("submit handler builds query URL (no POST — this is a read-only calculator)", () => {
    // The handleCalc just assembles a GET URL that the gratuity
    // endpoint reads — no mutation, no audit-log entry.
    expect(SRC).toMatch(/setCalcUrl\(`\/hr\/gratuity\/\$\{values\.employeeId\}/);
  });

  it("removes dead Input/Label/Select/DatePicker imports (now via FormShell)", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
    expect(SRC).not.toContain('from "@/components/ui/date-picker"');
  });

  it("removes the old `if (!form.employeeId) return` silent guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.employeeId\) return;/);
  });

  it("stays inline Card — CONTRIBUTING.md §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
  });

  it("result/error rendering blocks preserved (the calculator's actual value)", () => {
    // The post-calculation breakdown (years of service, monthly
    // salary, reduction factor, KSA labor-law notes) must survive
    // the migration intact.
    expect(SRC).toContain("نتيجة الحساب");
    expect(SRC).toContain("ملاحظات نظام العمل السعودي");
    expect(SRC).toContain("yearsOfService");
    expect(SRC).toContain("reductionFactor");
  });
});
