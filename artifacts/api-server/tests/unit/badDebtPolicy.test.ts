import { describe, it, expect } from "vitest";
import {
  resolveBadDebtRates,
  STANDARD_BAD_DEBT_RATES,
  BAD_DEBT_POLICY_SETTING_KEY,
} from "../../src/lib/badDebtPolicy.js";

// Bad-debt provision policy — controllable per company with a STANDARD default.
// Pure resolver: standard ← company settings ← per-request override. Each rate
// clamped to [0,1]; invalid values fall through to the lower layer.

describe("resolveBadDebtRates — standard default", () => {
  it("returns the STANDARD policy when nothing is configured", () => {
    expect(resolveBadDebtRates(undefined, undefined)).toEqual({ ...STANDARD_BAD_DEBT_RATES });
  });

  it("standard is the documented conservative ladder", () => {
    expect(STANDARD_BAD_DEBT_RATES).toEqual({ current: 0, d30: 0.05, d60: 0.25, d90: 0.5, d90plus: 0.75 });
  });

  it("ignores junk stored/override shapes → standard", () => {
    expect(resolveBadDebtRates("nonsense", null)).toEqual({ ...STANDARD_BAD_DEBT_RATES });
    expect(resolveBadDebtRates([1, 2, 3] as unknown, 42 as unknown as null)).toEqual({ ...STANDARD_BAD_DEBT_RATES });
  });
});

describe("resolveBadDebtRates — per-company settings layer", () => {
  it("company settings override the standard, per bucket", () => {
    const r = resolveBadDebtRates({ d90plus: 1, d60: 0.4 });
    expect(r.d90plus).toBe(1);      // company tightened the 90+ rate to 100%
    expect(r.d60).toBe(0.4);
    expect(r.d30).toBe(0.05);       // untouched buckets keep the standard
    expect(r.current).toBe(0);
  });

  it("invalid company values (>1, <0, NaN) fall back to standard", () => {
    const r = resolveBadDebtRates({ d90plus: 1.5, d60: -0.2, d30: "abc" });
    expect(r.d90plus).toBe(STANDARD_BAD_DEBT_RATES.d90plus);
    expect(r.d60).toBe(STANDARD_BAD_DEBT_RATES.d60);
    expect(r.d30).toBe(STANDARD_BAD_DEBT_RATES.d30);
  });
});

describe("resolveBadDebtRates — per-request override layer (highest)", () => {
  it("request override beats company settings beats standard", () => {
    const stored = { d90: 0.6, d90plus: 0.9 };
    const override = { d90plus: 1 };
    const r = resolveBadDebtRates(stored, override);
    expect(r.d90plus).toBe(1);   // override wins
    expect(r.d90).toBe(0.6);     // company wins where no override
    expect(r.d60).toBe(0.25);    // standard where neither
  });

  it("invalid override falls back to the company value, not standard", () => {
    const r = resolveBadDebtRates({ d90: 0.6 }, { d90: 2 });
    expect(r.d90).toBe(0.6); // override 2 is invalid → company 0.6
  });

  it("boundary rates 0 and 1 are honoured (not treated as missing)", () => {
    const r = resolveBadDebtRates({ current: 0 }, { d90plus: 1 });
    expect(r.current).toBe(0);
    expect(r.d90plus).toBe(1);
  });
});

describe("setting key", () => {
  it("is the stable controllable key", () => {
    expect(BAD_DEBT_POLICY_SETTING_KEY).toBe("finance.bad_debt_policy");
  });
});
