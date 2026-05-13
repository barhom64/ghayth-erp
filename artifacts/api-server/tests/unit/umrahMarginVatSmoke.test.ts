import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the VAT-margin-scheme behaviour of `generateSalesInvoice`. Umrah
 * travel services in KSA fall under the travel-agent margin scheme:
 *
 *   vatBase   = max(0, subtotal − costBasis)
 *   vatAmount = vatBase × vatRate / 100
 *
 * Pre-2026-05-13 the engine charged VAT on the full subtotal, which
 * overcharged the buyer and overstated the company's output-VAT
 * liability. This smoke locks in the corrected math at the source level
 * so a future refactor can't silently regress it.
 */
const ENGINE_PATH = join(import.meta.dirname!, "../../src/lib/umrahInvoicingEngine.ts");
const SRC = readFileSync(ENGINE_PATH, "utf8");

describe("umrahInvoicingEngine — VAT margin scheme (KSA travel agent)", () => {
  it("pulls cost basis from umrah_nusk_invoices joined on the same groups", () => {
    expect(SRC).toMatch(/SUM\("totalAmount"\)[^)]*\)\s+AS\s+cost_basis/);
    expect(SRC).toMatch(/FROM\s+umrah_nusk_invoices/);
    expect(SRC).toMatch(/"groupId"\s*=\s*ANY\(\$2\)/);
    expect(SRC).toMatch(/"deletedAt"\s+IS\s+NULL/);
  });

  it("computes marginBase = max(0, subtotal − costBasis)", () => {
    expect(SRC).toContain("const marginBase = roundTo2(Math.max(0, subtotal - costBasis))");
  });

  it("vatAmount uses marginBase, NOT subtotal", () => {
    expect(SRC).toContain("const vatAmount = roundTo2(marginBase * (vatRate / 100))");
    // Regression guard: the OLD `subtotal * (vatRate / 100)` is gone.
    expect(SRC).not.toMatch(/const\s+vatAmount\s*=\s*roundTo2\(subtotal\s*\*\s*\(vatRate/);
  });

  it("persists costBasis + marginBase on the inserted invoice row", () => {
    expect(SRC).toMatch(/"costBasis","marginBase"/);
    expect(SRC).toContain("costBasis, marginBase, total,");
  });

  it("guards against negative margin (cost > sale) by clamping to 0", () => {
    expect(SRC).toContain("Math.max(0, subtotal - costBasis)");
  });

  it("explains the margin scheme in the source comment for future maintainers", () => {
    expect(SRC).toMatch(/margin scheme/i);
    expect(SRC).toMatch(/overcharge/i);
  });
});

describe("umrahInvoicingEngine — arithmetic invariants (paper test)", () => {
  // Mirror the engine's formula on plain numbers so we have a self-contained
  // proof of correctness independent of the DB layer.
  const roundTo2 = (n: number) => Math.round(n * 100) / 100;

  function margin(subtotal: number, costBasis: number): number {
    return roundTo2(Math.max(0, subtotal - costBasis));
  }
  function vat(subtotal: number, costBasis: number, rate: number): number {
    return roundTo2(margin(subtotal, costBasis) * (rate / 100));
  }

  it("subtotal=1000, cost=600, rate=15 → margin=400, vat=60 (NOT 150)", () => {
    expect(margin(1000, 600)).toBe(400);
    expect(vat(1000, 600, 15)).toBe(60);
  });

  it("subtotal=5000, cost=4200, rate=15 → margin=800, vat=120", () => {
    expect(margin(5000, 4200)).toBe(800);
    expect(vat(5000, 4200, 15)).toBe(120);
  });

  it("cost > subtotal (loss-leader) → margin=0, vat=0 (no output VAT on losses)", () => {
    expect(margin(1000, 1500)).toBe(0);
    expect(vat(1000, 1500, 15)).toBe(0);
  });

  it("zero-rate companies → vat=0 regardless of margin", () => {
    expect(vat(1000, 600, 0)).toBe(0);
  });

  it("exact zero-margin (sale = cost) → vat=0", () => {
    expect(margin(800, 800)).toBe(0);
    expect(vat(800, 800, 15)).toBe(0);
  });

  it("rounding: subtotal=333.33, cost=200, rate=15 → margin=133.33, vat=20", () => {
    expect(margin(333.33, 200)).toBe(133.33);
    expect(vat(333.33, 200, 15)).toBe(20); // 133.33 × 0.15 = 19.9995 → round to 20
  });
});
