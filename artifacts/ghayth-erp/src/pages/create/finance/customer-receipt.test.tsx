/**
 * Ledger-line invariants for the customer-receipt create page after the
 * 2026-06 table→DataTable conversion. Only the read-only «معاينة القيد» JE
 * preview (a computed legs list) moved from a raw <table> into <DataTable>;
 * the leg-building and the applications payload were NOT touched. Static
 * source-reading smoke (mirrors finance-cycle-closure.test.tsx) — asserts the
 * posted plumbing is intact:
 *   • the JE legs are cash-debit + an AR credit per applied invoice + an
 *     advance-liability leg for any unapplied leftover;
 *   • submit posts the applications mapped from the selected rows.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/create/finance/customer-receipt.tsx"),
  "utf8",
);

describe("customer-receipt — ledger-line invariants survive the JE-preview DataTable conversion", () => {
  it("builds the JE legs (cash debit, AR credit per applied invoice, advance for leftover)", () => {
    expect(SRC).toContain("const previewLegs = () => {");
    expect(SRC).toContain("debit: totalAmount,");
    expect(SRC).toMatch(/label: "ذمم العملاء"[\s\S]*credit: r\.applyAmount/);
    expect(SRC).toContain('label: "التزام دفعة مقدمة"');
  });

  it("submit posts applications mapped from the selected rows", () => {
    expect(SRC).toMatch(/invoiceId: r\.invoiceId, amount: r\.applyAmount/);
  });

  it("renders the JE preview through the shared DataTable, not a raw table", () => {
    expect(SRC).toContain("<DataTable<{ label: string; description: string; debit: number; credit: number }>");
    expect(SRC).not.toMatch(/<table\b/);
  });
});
