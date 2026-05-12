import { describe, it, expect } from "vitest";
import {
  convertWithRate,
  invertRate,
} from "../../src/lib/fx/convert.js";
import {
  isKnownCurrency,
  assertCurrency,
  decimalsFor,
  listSupportedCurrencies,
} from "../../src/lib/fx/currencies.js";

describe("FX currencies — ISO 4217 validation", () => {
  it("accepts curated currency codes", () => {
    expect(isKnownCurrency("SAR")).toBe(true);
    expect(isKnownCurrency("USD")).toBe(true);
    expect(isKnownCurrency("EUR")).toBe(true);
    expect(isKnownCurrency("AED")).toBe(true);
    expect(isKnownCurrency("KWD")).toBe(true);
  });

  it("rejects malformed and unknown codes", () => {
    expect(isKnownCurrency("XYZ")).toBe(false);   // 3 letters but not on list
    expect(isKnownCurrency("sar")).toBe(false);   // lowercase
    expect(isKnownCurrency("US")).toBe(false);    // wrong length
    expect(isKnownCurrency("")).toBe(false);
    expect(isKnownCurrency(null)).toBe(false);
    expect(isKnownCurrency(undefined)).toBe(false);
  });

  it("assertCurrency passes any 3-letter uppercase, throws on rest", () => {
    expect(() => assertCurrency("USD")).not.toThrow();
    // assertCurrency intentionally accepts any ^[A-Z]{3}$ — the
    // curated list is checked separately by isKnownCurrency for soft
    // warnings.
    expect(() => assertCurrency("XYZ")).not.toThrow();
    expect(() => assertCurrency("us")).toThrow(/ISO 4217/);
    expect(() => assertCurrency("USDT")).toThrow();
    expect(() => assertCurrency("")).toThrow();
  });

  it("decimalsFor returns the right minor-unit count per currency", () => {
    expect(decimalsFor("SAR")).toBe(2);
    expect(decimalsFor("USD")).toBe(2);
    expect(decimalsFor("EUR")).toBe(2);
    expect(decimalsFor("JPY")).toBe(0);
    expect(decimalsFor("KRW")).toBe(0);
    expect(decimalsFor("KWD")).toBe(3);
    expect(decimalsFor("BHD")).toBe(3);
    expect(decimalsFor("OMR")).toBe(3);
    expect(decimalsFor("XYZ")).toBe(2); // sensible default
  });

  it("listSupportedCurrencies returns a sorted array", () => {
    const list = listSupportedCurrencies();
    expect(list.length).toBeGreaterThan(20);
    expect(list).toEqual([...list].sort());
  });
});

describe("FX convert — conversion math", () => {
  it("converts amount * rate, rounded to 2dp by default", () => {
    const r = convertWithRate({
      amount: 100,
      from: "USD",
      to: "SAR",
      rate: 3.75,
      rateDate: "2026-05-09",
    });
    expect(r.amount).toBe(375);
    expect(r.rateUsed).toBe(3.75);
    expect(r.fromCurrency).toBe("USD");
    expect(r.toCurrency).toBe("SAR");
    expect(r.trivial).toBe(false);
  });

  it("returns trivial=true and amount unchanged when from === to", () => {
    const r = convertWithRate({
      amount: 100,
      from: "SAR",
      to: "SAR",
      rate: 999, // ignored
      rateDate: "2026-05-09",
    });
    expect(r.amount).toBe(100);
    expect(r.rateUsed).toBe(1);
    expect(r.trivial).toBe(true);
  });

  it("rounds half-up at 0dp boundaries (where IEEE-754 is exact)", () => {
    // 0.5 → 1, 1.5 → 2, 2.5 → 3 — half-up, NOT banker's rounding
    // (which would give 0, 2, 2). These integers + .5 values have
    // exact IEEE-754 representations so no float tomfoolery.
    expect(
      convertWithRate({ amount: 0.5, from: "USD", to: "JPY", rate: 1, rateDate: "2026-05-09", decimals: 0 }).amount,
    ).toBe(1);
    expect(
      convertWithRate({ amount: 1.5, from: "USD", to: "JPY", rate: 1, rateDate: "2026-05-09", decimals: 0 }).amount,
    ).toBe(2);
    expect(
      convertWithRate({ amount: 2.5, from: "USD", to: "JPY", rate: 1, rateDate: "2026-05-09", decimals: 0 }).amount,
    ).toBe(3);
  });

  it("preserves already-precise amounts (no truncation)", () => {
    const r = convertWithRate({
      amount: 1.25,
      from: "USD",
      to: "SAR",
      rate: 1,
      rateDate: "2026-05-09",
    });
    expect(r.amount).toBe(1.25);
  });

  it("respects a custom decimals parameter for KWD-style 3dp currencies", () => {
    const r = convertWithRate({
      amount: 100,
      from: "USD",
      to: "KWD",
      rate: 0.30567,
      rateDate: "2026-05-09",
      decimals: 3,
    });
    expect(r.amount).toBe(30.567);
  });

  it("rounds JPY-style 0dp currencies to whole units", () => {
    const r = convertWithRate({
      amount: 100,
      from: "USD",
      to: "JPY",
      rate: 156.789,
      rateDate: "2026-05-09",
      decimals: 0,
    });
    expect(r.amount).toBe(15679);
  });

  it("preserves negative amounts (refunds, debit notes)", () => {
    const r = convertWithRate({
      amount: -50,
      from: "USD",
      to: "SAR",
      rate: 3.75,
      rateDate: "2026-05-09",
    });
    expect(r.amount).toBe(-187.5);
  });

  it("propagates rateIsStale through to the result", () => {
    const r = convertWithRate({
      amount: 100,
      from: "USD",
      to: "SAR",
      rate: 3.75,
      rateDate: "2026-05-01",
      rateIsStale: true,
    });
    expect(r.rateIsStale).toBe(true);
    expect(r.rateDate).toBe("2026-05-01");
  });

  it("throws on non-positive or non-finite rates", () => {
    const base = {
      amount: 100,
      from: "USD",
      to: "SAR",
      rateDate: "2026-05-09",
    };
    expect(() => convertWithRate({ ...base, rate: 0 })).toThrow(/positive/);
    expect(() => convertWithRate({ ...base, rate: -1 })).toThrow(/positive/);
    expect(() => convertWithRate({ ...base, rate: Number.NaN })).toThrow(/finite/);
    expect(() => convertWithRate({ ...base, rate: Number.POSITIVE_INFINITY })).toThrow();
  });

  it("rejects malformed currency codes through assertCurrency", () => {
    expect(() =>
      convertWithRate({
        amount: 100,
        from: "us",
        to: "SAR",
        rate: 3.75,
        rateDate: "2026-05-09",
      }),
    ).toThrow();
  });
});

describe("FX convert — invertRate", () => {
  it("inverts a positive rate", () => {
    expect(invertRate(4)).toBe(0.25);
    expect(invertRate(0.5)).toBe(2);
  });

  it("throws on non-positive or non-finite inputs", () => {
    expect(() => invertRate(0)).toThrow();
    expect(() => invertRate(-1)).toThrow();
    expect(() => invertRate(Number.NaN)).toThrow();
  });

  it("round-trips: invert then invert again ≈ identity", () => {
    const original = 3.75;
    const there = invertRate(original);
    const back = invertRate(there);
    expect(back).toBeCloseTo(original, 10);
  });
});
