import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { assertLedgerTruth } from "../../src/lib/financePostingPolicy.js";

/**
 * FIN-INTEGRITY-CONTRACT (#2246 SLICE 1) — ledger-truth orchestrator test.
 *
 * `assertLedgerTruth` composes the existing checks (no new logic). Net
 * enforcement is IDENTICAL to today (only fuel 5510 enforces its dimension)
 * EXCEPT one proven-safe addition: the vendor-invoice scenario enforces
 * vendorId. Every other operational class stays WARN — test #8 is the
 * mandatory regression guard against over-enforcement. Pure function, no DB.
 */
describe("#2246 assertLedgerTruth — central ledger-truth contract (orchestrator)", () => {
  // 1.
  it("ENFORCE: 5510 line WITHOUT vehicleId throws (fuel dimension enforced)", () => {
    expect(() =>
      assertLedgerTruth({ lines: [{ accountCode: "5510", vehicleId: null }] }),
    ).toThrow(/التوجيه المحاسبي غير مكتمل|مركبة/);
  });

  // 2.
  it("ENFORCE: vendor_invoice scenario, 2111 line WITHOUT vendorId throws", () => {
    expect(() =>
      assertLedgerTruth({
        lines: [{ accountCode: "2111", vendorId: null }],
        header: { sourceType: "vendor_invoice" },
      }),
    ).toThrow(/فاتورة المورد بلا مورد|vendorId/);
  });

  // 3.
  it("ENFORCE: isManual + line carries vehicleId (operationally linked) with no reason throws", () => {
    expect(() =>
      assertLedgerTruth({
        lines: [{ accountCode: "1111", vehicleId: 12 }],
        header: { isManual: true, description: null, reason: null },
      }),
    ).toThrow(/سبب القيد اليدوي/);
  });

  // 5.
  it("PASS: manual pure-GL (no operational dimension) WITH a reason passes", () => {
    const r = assertLedgerTruth({
      lines: [{ accountCode: "1111" }, { accountCode: "3100" }],
      header: { isManual: true, reason: "تسوية رصيد افتتاحي" },
    });
    expect(r.warnings).toHaveLength(0);
    expect(r.violations).toHaveLength(0);
  });

  // 6.
  it("PASS: balanced 5510 + vehicleId passes", () => {
    const r = assertLedgerTruth({
      lines: [
        { accountCode: "5510", vehicleId: 7 },
        { accountCode: "1111" },
      ],
    });
    expect(r.warnings).toHaveLength(0);
    expect(r.violations).toHaveLength(0);
  });

  // 8a. B1 PROMOTION — the whole vehicle class (55xx + 5710) is now enforced.
  it("ENFORCE (B1): 5520 vehicle maintenance WITHOUT vehicleId now throws", () => {
    expect(() =>
      assertLedgerTruth({ lines: [{ accountCode: "5520", vehicleId: null }] }),
    ).toThrow(/التوجيه المحاسبي غير مكتمل|مركبة/);
  });

  // 8b. MANDATORY REGRESSION — must NOT over-enforce beyond promoted classes.
  // Pointed at a STILL-warn class (property 5610) so the anti-over-enforcement
  // guard stays alive as the ratchet advances class by class.
  it("REGRESSION (#8): property 5610 WITHOUT propertyId does NOT throw (still warn)", () => {
    let result: ReturnType<typeof assertLedgerTruth> | undefined;
    expect(() => {
      result = assertLedgerTruth({ lines: [{ accountCode: "5610", propertyId: null }] });
    }).not.toThrow();
    expect(result!.warnings.length).toBe(1);
    expect(result!.violations.some((v) => v.class === "dimension")).toBe(true);
  });

  it("REGRESSION: vendor 2111 WITHOUT vendorId outside vendor_invoice scenario warns only (does NOT throw)", () => {
    const r = assertLedgerTruth({ lines: [{ accountCode: "2111", vendorId: null }] });
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toContain("مورد");
  });
});

describe("#2246 ledger-truth contract — wired at BOTH posting doors", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const srcLib = resolve(here, "../../src/lib");

  it("businessHelpers.ts references assertLedgerTruth", () => {
    const src = readFileSync(resolve(srcLib, "businessHelpers.ts"), "utf8");
    expect(src).toContain("assertLedgerTruth");
  });

  it("gl/posting.ts references assertLedgerTruth", () => {
    const src = readFileSync(resolve(srcLib, "gl/posting.ts"), "utf8");
    expect(src).toContain("assertLedgerTruth");
  });
});
