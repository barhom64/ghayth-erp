import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the VAT-margin-scheme behaviour of `generateSalesInvoice`. Umrah
 * travel services in KSA fall under the travel-agent margin scheme:
 *
 *   vatBase = marginBase = max(0, subtotal − costBasis)
 *
 *   inclusive (default per §6 of #1870):  vatAmount = marginBase × rate/(100+rate)
 *   exclusive (legacy fallback)         :  vatAmount = marginBase × rate/100
 *
 * Pre-2026-05-13 the engine charged VAT on the full subtotal, which
 * overcharged the buyer and overstated the company's output-VAT
 * liability. The margin base lives in either direction; the direction
 * is operator-configurable via system_settings.umrah_vat_mode. This
 * smoke locks in both formulas + the margin base at the source level
 * so a future refactor can't silently regress either path.
 */
const ENGINE_PATH = join(import.meta.dirname!, "../../src/lib/umrahInvoicingEngine.ts");
const SRC = readFileSync(ENGINE_PATH, "utf8");

describe("umrahInvoicingEngine — VAT margin scheme (KSA travel agent)", () => {
  it("pulls cost basis from umrah_nusk_invoices joined on the same groups", () => {
    // The cost-basis aggregation lives somewhere in this file and
    // pulls from umrah_nusk_invoices scoped by group + tenant. Tight
    // SUM-shape pinning lives in umrahInvoicingMarginVatSmoke now
    // (PR #1458 added refund-net + cancelled-exclude); this test
    // just asserts the source-table + scope contract stays intact.
    expect(SRC).toMatch(/SUM\(.+\)[^)]*\)\s+AS\s+cost_basis/);
    expect(SRC).toMatch(/FROM\s+umrah_nusk_invoices/);
    expect(SRC).toMatch(/"groupId"\s*=\s*ANY\(\$2\)/);
    expect(SRC).toMatch(/"deletedAt"\s+IS\s+NULL/);
  });

  it("computes marginBase = max(0, subtotal − costBasis)", () => {
    expect(SRC).toContain("const marginBase = roundTo2(Math.max(0, subtotal - costBasis))");
  });

  it("vatAmount uses marginBase, NOT subtotal — BOTH inclusive + exclusive formulas present", () => {
    // §6 of #1870: VAT direction is operator-configurable via
    // system_settings.umrah_vat_mode. Both formulas must live in the
    // engine so the toggle works at runtime without a code change.
    expect(SRC).toMatch(/roundTo2\(marginBase \* vatRate \/ \(100 \+ vatRate\)\)/); // inclusive (default)
    expect(SRC).toContain("roundTo2(marginBase * (vatRate / 100))");                  // exclusive (legacy)
    // Regression guard: the OLD `subtotal * (vatRate / 100)` is gone in
    // EITHER direction (this was the pre-margin-scheme bug).
    expect(SRC).not.toMatch(/const\s+vatAmount\s*=\s*roundTo2\(subtotal\s*\*\s*\(vatRate/);
    expect(SRC).not.toMatch(/roundTo2\(subtotal\s*\*\s*vatRate\s*\/\s*\(100\s*\+\s*vatRate\)\)/);
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
  function vatExclusive(subtotal: number, costBasis: number, rate: number): number {
    return roundTo2(margin(subtotal, costBasis) * (rate / 100));
  }
  function vatInclusive(subtotal: number, costBasis: number, rate: number): number {
    // §6 of #1870 — extracted from the margin-inclusive price.
    return roundTo2(margin(subtotal, costBasis) * rate / (100 + rate));
  }

  // Exclusive (legacy add-on-top) ─────────────────────────────────────────
  it("EXCLUSIVE: subtotal=1000, cost=600, rate=15 → margin=400, vat=60 (NOT 150)", () => {
    expect(margin(1000, 600)).toBe(400);
    expect(vatExclusive(1000, 600, 15)).toBe(60);
  });

  it("EXCLUSIVE: subtotal=5000, cost=4200, rate=15 → margin=800, vat=120", () => {
    expect(margin(5000, 4200)).toBe(800);
    expect(vatExclusive(5000, 4200, 15)).toBe(120);
  });

  it("cost > subtotal (loss-leader) → margin=0, vat=0 in BOTH modes", () => {
    expect(margin(1000, 1500)).toBe(0);
    expect(vatExclusive(1000, 1500, 15)).toBe(0);
    expect(vatInclusive(1000, 1500, 15)).toBe(0);
  });

  it("zero-rate companies → vat=0 regardless of margin in BOTH modes", () => {
    expect(vatExclusive(1000, 600, 0)).toBe(0);
    expect(vatInclusive(1000, 600, 0)).toBe(0);
  });

  it("exact zero-margin (sale = cost) → vat=0 in BOTH modes", () => {
    expect(margin(800, 800)).toBe(0);
    expect(vatExclusive(800, 800, 15)).toBe(0);
    expect(vatInclusive(800, 800, 15)).toBe(0);
  });

  it("EXCLUSIVE rounding: subtotal=333.33, cost=200, rate=15 → margin=133.33, vat=20", () => {
    expect(margin(333.33, 200)).toBe(133.33);
    expect(vatExclusive(333.33, 200, 15)).toBe(20); // 133.33 × 0.15 = 19.9995 → round to 20
  });

  // Inclusive (default per operator §6) ──────────────────────────────────
  it("INCLUSIVE: subtotal=1000, cost=550, rate=15 → margin=450, vat=58.70 (× 15/115)", () => {
    expect(margin(1000, 550)).toBe(450);
    expect(vatInclusive(1000, 550, 15)).toBe(58.70);
  });

  it("INCLUSIVE: subtotal=750, cost=300, rate=15 → margin=450, vat=58.70 (operator's worked example)", () => {
    // Operator-confirmed reference: 750 = 300 (visa) + 391.30 (service) + 58.70 (VAT)
    expect(margin(750, 300)).toBe(450);
    expect(vatInclusive(750, 300, 15)).toBe(58.70);
  });

  it("INCLUSIVE: subtotal=1067.50, cost=617.50, rate=15 → margin=450, vat=58.70 (idempotent extraction)", () => {
    // Sanity: even if the operator entered prices that LOOK additive,
    // the inclusive math still extracts (and customer-facing total stays
    // = subtotal). Engine-level safety.
    expect(margin(1067.50, 617.50)).toBe(450);
    expect(vatInclusive(1067.50, 617.50, 15)).toBe(58.70);
  });
});
