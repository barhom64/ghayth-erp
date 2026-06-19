import { describe, it, expect } from "vitest";
import { assertDimensionContract } from "../../src/lib/financePostingPolicy.js";

/**
 * FIN-INTEGRITY-CONTRACT (#2233) — dimension contract enforcement test.
 *
 * Asserts the journal_lines dimension invariant at the posting door:
 *  • the WHOLE vehicle class (55xx + 5710) is HARD-enforced (rejects when vehicleId null) — B1.
 *  • property / project / vendor / client classes are WARN (recorded, not rejected) — staged ratchet.
 *  • non-dimensioned accounts pass untouched.
 * Pure function, no DB.
 */
describe("#2233 assertDimensionContract — staged dimension enforcement", () => {
  it("ENFORCE: vehicle fuel (5510) line without vehicleId is rejected", () => {
    expect(() =>
      assertDimensionContract({ lines: [{ accountCode: "5510", vehicleId: null }] }),
    ).toThrow(/التوجيه المحاسبي غير مكتمل|مركبة/);
  });

  it("ENFORCE: vehicle fuel subsidiary leaf (5510-0001) without vehicleId is rejected", () => {
    expect(() =>
      assertDimensionContract({ lines: [{ accountCode: "5510-0001", vehicleId: null }] }),
    ).toThrow();
  });

  it("PASS: vehicle fuel line WITH vehicleId posts (fleet engine / linked expense)", () => {
    const r = assertDimensionContract({ lines: [{ accountCode: "5510", vehicleId: 12 }] });
    expect(r.warnings).toHaveLength(0);
  });

  it("PASS: the cash counter-leg (1111) of a fuel entry is not dimensioned → no requirement", () => {
    const r = assertDimensionContract({
      lines: [
        { accountCode: "5510", vehicleId: 12 },
        { accountCode: "1111" },
      ],
    });
    expect(r.warnings).toHaveLength(0);
  });

  it("WARN (not reject): vendor AP line (2111) without vendorId records a warning, does not throw", () => {
    const r = assertDimensionContract({ lines: [{ accountCode: "2111", vendorId: null }] });
    expect(r.warnings.length).toBe(1);
    expect(r.warnings[0]).toContain("مورد");
  });

  it("ENFORCE (B1): vehicle maintenance (5520) without vehicleId is now rejected", () => {
    expect(() =>
      assertDimensionContract({ lines: [{ accountCode: "5520", vehicleId: null }] }),
    ).toThrow(/التوجيه المحاسبي غير مكتمل|مركبة/);
  });

  it("ENFORCE (B1): vehicle depreciation (5710) without vehicleId is now rejected", () => {
    expect(() =>
      assertDimensionContract({ lines: [{ accountCode: "5710", vehicleId: null }] }),
    ).toThrow();
  });

  it("PASS (B1): vehicle maintenance (5520) WITH vehicleId posts cleanly", () => {
    const r = assertDimensionContract({ lines: [{ accountCode: "5520", vehicleId: 7 }] });
    expect(r.warnings).toHaveLength(0);
  });

  it("WARN: property (5610) / project (5130) / client (1131) missing dims warn, never throw", () => {
    const r = assertDimensionContract({
      lines: [
        { accountCode: "5610", propertyId: null },
        { accountCode: "5130", projectId: null },
        { accountCode: "1131", clientId: null },
      ],
    });
    expect(r.warnings.length).toBe(3);
  });

  it("PASS: non-dimensioned accounts (cash/VAT/equity) are ignored", () => {
    const r = assertDimensionContract({
      lines: [{ accountCode: "1111" }, { accountCode: "2131" }, { accountCode: "3100" }, { accountCode: "" }],
    });
    expect(r.warnings).toHaveLength(0);
  });

  it("mixed batch: throws on the enforced fuel violation even if other lines only warn", () => {
    expect(() =>
      assertDimensionContract({
        lines: [
          { accountCode: "2111", vendorId: null }, // warn
          { accountCode: "5510", vehicleId: null }, // enforce → throw
        ],
      }),
    ).toThrow();
  });
});
