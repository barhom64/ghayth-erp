import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 19 — properties/deposits create-deposit form.
 * 32 of ~280 forms now on FormShell + zod.
 *
 * §3.4 compliant (inline Card via showForm toggle, no modal).
 * Refund AlertDialog (with its own FormShell) preserved — that
 * is a destructive-confirm pattern, not a create/edit modal.
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "properties/deposits.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("properties/deposits — create-deposit form on FormShell + zod", () => {
  it("imports the FormShell stack with FormSelectField + FormDateField", () => {
    expect(
      SRC.includes('from "@/components/form-shell"') ||
        SRC.includes('from "@workspace/ui-core"'),
    ).toBe(true);
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("FormDateField");
    expect(SRC).toContain("FormNumberField");
  });

  it("depositSchema requires contractId + amount + receivedDate", () => {
    expect(SRC).toContain("depositSchema = z.object(");
    expect(SRC).toMatch(/^\s*contractId:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*amount:\s*z\.coerce\.number\(\)\.positive/m);
    expect(SRC).toMatch(/^\s*receivedDate:\s*z\.string\(\)\.min\(1/m);
  });

  it("replaces inline apiFetch+toast with useApiMutation (typed)", () => {
    expect(SRC).toContain("useApiMutation<unknown, { contractId: number; amount: number; receivedDate: string; notes: string }>");
  });

  it("removes the old useState({contractId, amount, receivedDate, notes}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*contractId:\s*""\s*,\s*amount:\s*""/);
  });

  it("removes dead Input/Label/Select/UnifiedDateInput imports", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
    expect(SRC).not.toContain('from "@/components/ui/unified-date-input"');
  });

  it("removes the dead `if (!form.contractId || !form.amount) toast(...) return` guard", () => {
    expect(stripComments(SRC)).not.toMatch(/if \(!form\.contractId \|\| !form\.amount\)/);
  });

  it("refund AlertDialog + its FormShell are preserved (not regressed)", () => {
    // RefundDepositDialog was migrated previously — must survive.
    expect(SRC).toContain("RefundDepositDialog");
    expect(SRC).toContain("refundSchema");
    expect(SRC).toContain("<AlertDialog");
  });

  it("submit handler types values via z.infer", () => {
    expect(SRC).toContain("type DepositForm = z.infer<typeof depositSchema>");
    expect(SRC).toContain("const handleSave = async (values: DepositForm)");
  });
});
