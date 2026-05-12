import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Batch 24 — finance/custodies (CreateCustodyForm + SettleCustodyForm).
 * 38 of ~280 forms now on FormShell + zod.
 *
 * Settle's over-settlement guard moves out of an imperative
 * `if (Number(amount) > remaining) setClientError(...)` into a zod
 * `.max(remaining, ...)` refinement — the submit button can't fire
 * with an invalid value and the error renders inline on the field.
 *
 * §3.4 compliant (both forms are inline Cards toggled by parent
 * state, no modal).
 */
const ROOT = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src/pages");
const SRC = readFileSync(join(ROOT, "finance/custodies.tsx"), "utf8");
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("finance/custodies — Create + Settle forms on FormShell + zod", () => {
  it("imports the FormShell stack with FormDateField + FormSelectField", () => {
    expect(SRC).toContain('from "@/components/form-shell"');
    expect(SRC).toContain("FormShell");
    expect(SRC).toContain("FormNumberField");
    expect(SRC).toContain("FormSelectField");
    expect(SRC).toContain("FormDateField");
  });

  it("custodySchema requires assignmentId + positive amount", () => {
    expect(SRC).toContain("custodySchema = z.object(");
    expect(SRC).toMatch(/^\s*assignmentId:\s*z\.string\(\)\.min\(1/m);
    expect(SRC).toMatch(/^\s*amount:\s*z\.coerce\.number\(\)\.positive/m);
  });

  it("settleSchema parametrises remaining and enforces .max(remaining)", () => {
    // The runtime cap was previously a manual `setClientError(...)`
    // inside handleSubmit; now it's a zod refinement so the submit
    // never fires with an over-cap value.
    expect(SRC).toContain("function settleSchema(remaining: number)");
    expect(SRC).toMatch(/\.max\(remaining,/);
  });

  it("removes the old useState({assignmentId, amount, ...}) shape", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(\{\s*assignmentId:\s*""\s*,\s*amount:\s*""/);
  });

  it("removes the manual settle-form clientError state + useState(amount/description)", () => {
    expect(stripComments(SRC)).not.toMatch(/useState\(String\(custody\.remainingAmount/);
    expect(stripComments(SRC)).not.toMatch(/setClientError\(/);
  });

  it("removes dead Input/Label/Select/DatePicker imports", () => {
    expect(SRC).not.toContain('from "@/components/ui/input"');
    expect(SRC).not.toContain('from "@/components/ui/label"');
    expect(SRC).not.toContain('from "@/components/ui/select"');
    expect(SRC).not.toContain('from "@/components/ui/date-picker"');
  });

  it("typed useApiMutation generics (was useApiMutation<unknown, any>)", () => {
    expect(SRC).toContain("useApiMutation<unknown, Record<string, unknown>>");
    expect(SRC).toContain("useApiMutation<unknown, { custodyRef: string; amount: number; description: string }>");
  });

  it("stays inline Cards — CONTRIBUTING.md §3.4 (no modal)", () => {
    expect(SRC).not.toMatch(/<Dialog\b/);
  });
});
