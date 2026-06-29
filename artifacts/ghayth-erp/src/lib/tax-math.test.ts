/**
 * tax-math — amountTaxSplit / lineTaxSplit tests. Batch 13 of the FE
 * behavioral-coverage effort (ghayth-review documented gap).
 *
 * The pure VAT splitter behind every invoice/voucher/PO line. Financially
 * load-bearing, so the subtle, easy-to-break rules each get a test:
 *
 *  - exclusive: vat is added on top    → net = amount, gross = net + vat
 *  - inclusive: vat is carved out      → gross = amount, net = amount / (1+r)
 *    and crucially vat = gross − net (derived by subtraction, NOT rounded
 *    independently), so net + vat === gross holds EXACTLY even when net was
 *    rounded — no penny drift on the invoice total.
 *  - the `!amount || !rate` guard returns the amount untouched (0 vat), and
 *    in that path the `inclusive` flag is irrelevant.
 *  - lineTaxSplit rounds qty*unitPrice FIRST, so float error
 *    (3 * 0.1 = 0.30000000000000004) can't leak into the tax base.
 *
 * Cases use the canonical Saudi 15% VAT. All expected values were confirmed
 * against the live functions before locking them in. Test-only — zero
 * production code.
 */
import { describe, it, expect } from "vitest";
import { amountTaxSplit, lineTaxSplit, resolveDefaultTaxCode } from "./tax-math";

describe("amountTaxSplit", () => {
  it("exclusive: adds VAT on top (net stays the amount)", () => {
    expect(amountTaxSplit(100, 15, false)).toEqual({ net: 100, vat: 15, gross: 115 });
  });

  it("inclusive: carves VAT out (gross stays the amount)", () => {
    expect(amountTaxSplit(115, 15, true)).toEqual({ net: 100, vat: 15, gross: 115 });
  });

  it("inclusive: derives vat as gross − net so net + vat === gross EXACTLY despite rounding", () => {
    const s = amountTaxSplit(100, 15, true); // 100/1.15 = 86.9565… → net 86.96
    expect(s).toEqual({ net: 86.96, vat: 13.04, gross: 100 });
    expect(s.net + s.vat).toBe(s.gross); // no penny drift
  });

  it("rounds VAT and gross to 2 decimals (half rounds up)", () => {
    // 33.33 * 0.15 = 4.9995 → 5.00 ; gross 38.33
    expect(amountTaxSplit(33.33, 15, false)).toEqual({ net: 33.33, vat: 5, gross: 38.33 });
  });

  it("guard: a zero rate returns the amount with no VAT", () => {
    expect(amountTaxSplit(250, 0, false)).toEqual({ net: 250, vat: 0, gross: 250 });
  });

  it("guard: a zero amount yields an all-zero split (inclusive flag is irrelevant)", () => {
    expect(amountTaxSplit(0, 15, false)).toEqual({ net: 0, vat: 0, gross: 0 });
    expect(amountTaxSplit(0, 15, true)).toEqual({ net: 0, vat: 0, gross: 0 });
  });

  it("handles a negative amount (credit note) keeping net + vat === gross", () => {
    const s = amountTaxSplit(-100, 15, false);
    expect(s).toEqual({ net: -100, vat: -15, gross: -115 });
    expect(s.net + s.vat).toBe(s.gross);
  });
});

describe("lineTaxSplit", () => {
  it("multiplies qty by unit price then splits (exclusive)", () => {
    expect(lineTaxSplit(2, 50, 15, false)).toEqual({ net: 100, vat: 15, gross: 115 });
  });

  it("multiplies qty by unit price then splits (inclusive)", () => {
    expect(lineTaxSplit(2, 57.5, 15, true)).toEqual({ net: 100, vat: 15, gross: 115 });
  });

  it("rounds qty*unitPrice FIRST so float error never enters the tax base", () => {
    // 3 * 0.1 = 0.30000000000000004 in IEEE-754; must be treated as 0.30
    expect(lineTaxSplit(3, 0.1, 0, false)).toEqual({ net: 0.3, vat: 0, gross: 0.3 });
  });
});

/**
 * resolveDefaultTaxCode — B3 (توجيه إبراهيم): «ليش تقول بدون وهي موجودة استاندر؟».
 * الافتراضي يجب أن يحسم على الكود القياسي المفعّل لا «بدون». الثابت المزروع
 * "VAT15" في الشاشة كان يسقط بصمت إلى «— بدون —» متى زُرع الكود القياسي برمز
 * مختلف لدى الشركة؛ هذا المُساعد يصلح ذلك بحسم الافتراضي من البيانات الحقيقية.
 */
describe("resolveDefaultTaxCode (B3)", () => {
  const STD = { code: "VAT15", taxType: "standard", isActive: true };
  const ZERO = { code: "VAT0", taxType: "zero", isActive: true };
  const EXEMPT = { code: "EXEMPT", taxType: "exempt", isActive: true };

  it("picks the standard code when no current value is set (the core fix)", () => {
    // order deliberately puts non-standard first to prove it scans by taxType
    expect(resolveDefaultTaxCode([ZERO, EXEMPT, STD])).toBe("VAT15");
  });

  it("picks the standard code even when the company seeded it under a custom code", () => {
    const custom = { code: "S-KSA", taxType: "standard", isActive: true };
    expect(resolveDefaultTaxCode([ZERO, custom])).toBe("S-KSA");
  });

  it("keeps a valid current selection (respects the user / a copied invoice)", () => {
    expect(resolveDefaultTaxCode([STD, ZERO], "VAT0")).toBe("VAT0");
  });

  it("replaces a stale current code that is no longer among the active codes", () => {
    // "VAT15" is the classic stale hardcoded default → falls back to standard
    expect(resolveDefaultTaxCode([ZERO, EXEMPT, STD], "GONE")).toBe("VAT15");
  });

  it("falls back to the first active code when none is marked standard", () => {
    expect(resolveDefaultTaxCode([ZERO, EXEMPT])).toBe("VAT0");
  });

  it("ignores inactive codes (an inactive standard is not chosen)", () => {
    const inactiveStd = { code: "OLD", taxType: "standard", isActive: false };
    expect(resolveDefaultTaxCode([inactiveStd, ZERO])).toBe("VAT0");
  });

  it("ignores blank codes and returns undefined when nothing usable remains", () => {
    expect(resolveDefaultTaxCode([{ code: "", taxType: "standard", isActive: true }])).toBeUndefined();
    expect(resolveDefaultTaxCode([])).toBeUndefined();
  });

  it("treats a missing isActive flag as active (defensive on partial rows)", () => {
    expect(resolveDefaultTaxCode([{ code: "VAT15", taxType: "standard" }])).toBe("VAT15");
  });
});
