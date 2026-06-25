/**
 * formatters — pure-function tests. Batch 8 of the FE behavioral-coverage
 * effort (ghayth-review documented gap).
 *
 * These helpers render every number, money value, date and time in the UI, so
 * a regression here is felt on every page. They are pure, so the assertions
 * target locale-independent invariants: the «-» guards for missing/invalid
 * input, Arabic-Indic digit conversion, the money round-trip, and the
 * todayLocal shape — never a hard-coded localized string.
 */
import { describe, it, expect } from "vitest";
import {
  formatNumber,
  formatCurrency,
  formatDateAr,
  formatTimeAr,
  roundMoney,
  todayLocal,
} from "./formatters";

describe("roundMoney — accounting-safe rounding", () => {
  it("rounds to the given decimals (default 2)", () => {
    expect(roundMoney(1.236)).toBe(1.24);
    expect(roundMoney(1.234)).toBe(1.23);
    expect(roundMoney(5)).toBe(5);
    expect(roundMoney(2.5, 0)).toBe(3);
  });

  it("coerces numeric strings", () => {
    expect(roundMoney("3.14159", 2)).toBe(3.14);
  });

  it("returns 0 for null / undefined / NaN / non-numeric — never pollutes totals", () => {
    expect(roundMoney(null)).toBe(0);
    expect(roundMoney(undefined)).toBe(0);
    expect(roundMoney(NaN)).toBe(0);
    expect(roundMoney("abc")).toBe(0);
  });
});

describe("formatNumber", () => {
  it("returns «-» for missing or non-finite input", () => {
    expect(formatNumber(null)).toBe("-");
    expect(formatNumber(undefined)).toBe("-");
    expect(formatNumber(NaN)).toBe("-");
    expect(formatNumber(Infinity)).toBe("-");
  });

  it("renders Arabic-Indic digits (not Western)", () => {
    const out = formatNumber(1234);
    expect(out).not.toBe("-");
    expect(out).toMatch(/[٠-٩]/); // contains Arabic-Indic digits
    expect(out).not.toMatch(/[0-9]/); // no Western digits leaked
  });
});

describe("formatCurrency", () => {
  it("returns «-» for missing or non-finite input", () => {
    expect(formatCurrency(null)).toBe("-");
    expect(formatCurrency(NaN)).toBe("-");
  });

  it("is the formatted number followed by the currency label", () => {
    // formatCurrency = `${formatNumber(n)} ${label}` — relate the two without
    // hard-coding the (settings-driven) label.
    const n = 100;
    expect(formatCurrency(n).startsWith(formatNumber(n) + " ")).toBe(true);
    expect(formatCurrency(n).length).toBeGreaterThan(formatNumber(n).length);
  });
});

describe("formatDateAr / formatTimeAr — invalid-input guards", () => {
  it("return «-» for null, undefined and unparseable dates", () => {
    expect(formatDateAr(null)).toBe("-");
    expect(formatDateAr(undefined)).toBe("-");
    expect(formatDateAr("not-a-date")).toBe("-");
    expect(formatTimeAr(null)).toBe("-");
    expect(formatTimeAr("not-a-date")).toBe("-");
  });
});

describe("todayLocal", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(todayLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
