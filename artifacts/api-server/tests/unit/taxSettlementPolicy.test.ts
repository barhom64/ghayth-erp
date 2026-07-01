import { describe, it, expect } from "vitest";
import {
  resolveTaxSettlementPolicyFrom,
  STANDARD_TAX_SETTLEMENT_POLICY,
  TAX_SETTLEMENT_POLICY_SETTING_KEY,
} from "../../src/lib/taxSettlementPolicy.js";

// VAT settlement policy — controllable per company with a STANDARD default.
// Narrow scope: filing frequency + due-days cadence (rate/accounts/preview keep
// their existing authorities). Pure resolver: standard ← company ← override.

describe("resolveTaxSettlementPolicyFrom — standard default", () => {
  it("returns the STANDARD policy when nothing is configured", () => {
    expect(resolveTaxSettlementPolicyFrom(undefined, undefined)).toEqual({ ...STANDARD_TAX_SETTLEMENT_POLICY });
  });

  it("standard is Saudi monthly filing, 30-day due, settlement on postable 2131", () => {
    expect(STANDARD_TAX_SETTLEMENT_POLICY).toEqual({
      frequency: "monthly", filingDueDays: 30, settlementAccountCode: "2131",
    });
  });

  it("ignores junk stored/override shapes → standard", () => {
    expect(resolveTaxSettlementPolicyFrom("nonsense", null)).toEqual({ ...STANDARD_TAX_SETTLEMENT_POLICY });
    expect(resolveTaxSettlementPolicyFrom([1, 2, 3] as unknown, 42 as unknown as null)).toEqual({ ...STANDARD_TAX_SETTLEMENT_POLICY });
  });
});

describe("resolveTaxSettlementPolicyFrom — per-company settings layer", () => {
  it("company settings override the standard, per field", () => {
    const p = resolveTaxSettlementPolicyFrom({ frequency: "quarterly", filingDueDays: 60, settlementAccountCode: "2133" });
    expect(p.frequency).toBe("quarterly");
    expect(p.filingDueDays).toBe(60);
    expect(p.settlementAccountCode).toBe("2133");
  });

  it("a partial company override leaves the other fields on standard", () => {
    const p = resolveTaxSettlementPolicyFrom({ frequency: "quarterly" });
    expect(p.frequency).toBe("quarterly");
    expect(p.filingDueDays).toBe(30);            // untouched → standard
    expect(p.settlementAccountCode).toBe("2131"); // untouched → standard
  });

  it("invalid company values fall back to standard", () => {
    const p = resolveTaxSettlementPolicyFrom({ frequency: "yearly", filingDueDays: 999, settlementAccountCode: "   " });
    expect(p.frequency).toBe(STANDARD_TAX_SETTLEMENT_POLICY.frequency);   // bad enum
    expect(p.filingDueDays).toBe(STANDARD_TAX_SETTLEMENT_POLICY.filingDueDays); // out of [1,120]
    expect(p.settlementAccountCode).toBe(STANDARD_TAX_SETTLEMENT_POLICY.settlementAccountCode); // blank
  });

  it("trims a custom settlement account code", () => {
    expect(resolveTaxSettlementPolicyFrom({ settlementAccountCode: "  2199  " }).settlementAccountCode).toBe("2199");
  });

  it("rejects a non-integer due-days → standard", () => {
    const p = resolveTaxSettlementPolicyFrom({ filingDueDays: 15.5 });
    expect(p.filingDueDays).toBe(STANDARD_TAX_SETTLEMENT_POLICY.filingDueDays);
  });
});

describe("resolveTaxSettlementPolicyFrom — per-request override layer (highest)", () => {
  it("request override beats company settings beats standard", () => {
    const stored = { frequency: "quarterly" as const, filingDueDays: 60 };
    const override = { filingDueDays: 45 };
    const p = resolveTaxSettlementPolicyFrom(stored, override);
    expect(p.filingDueDays).toBe(45);      // override wins
    expect(p.frequency).toBe("quarterly"); // company wins where no override
  });

  it("invalid override falls back to the company value, not standard", () => {
    const p = resolveTaxSettlementPolicyFrom({ filingDueDays: 60 }, { filingDueDays: 500 });
    expect(p.filingDueDays).toBe(60); // override 500 invalid → company 60
  });
});

describe("setting key", () => {
  it("is the stable controllable key", () => {
    expect(TAX_SETTLEMENT_POLICY_SETTING_KEY).toBe("finance.tax_settlement_policy");
  });
});
