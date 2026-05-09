import { describe, it, expect } from "vitest";
import {
  computeRevaluationLines,
  type MonetaryItem,
} from "../../src/lib/fx/revaluation.js";
import { computeRealizedFx } from "../../src/lib/fx/realized.js";

const RATE_USD_TO_SAR_BOOKED = 3.75;
const RATE_USD_TO_SAR_CLOSING = 3.78;
const RATE_USD_TO_SAR_WEAKENING = 3.72;

describe("computeRevaluationLines — IAS 21 monetary-item walk", () => {
  it("returns gain on a foreign-currency receivable when the foreign currency strengthens", () => {
    const items: MonetaryItem[] = [
      {
        entityType: "invoice",
        entityId: 1,
        currency: "USD",
        originalAmount: 1000,
        bookedRate: RATE_USD_TO_SAR_BOOKED,
        side: "asset",
      },
    ];
    const out = computeRevaluationLines(items, () => RATE_USD_TO_SAR_CLOSING, "SAR");

    // 1000 × (3.78 - 3.75) = 30 SAR gain
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].gainLoss).toBe(30);
    expect(out.totalGain).toBe(30);
    expect(out.totalLoss).toBe(0);
  });

  it("returns loss on a foreign-currency receivable when the foreign currency weakens", () => {
    const items: MonetaryItem[] = [
      {
        entityType: "invoice",
        entityId: 1,
        currency: "USD",
        originalAmount: 1000,
        bookedRate: RATE_USD_TO_SAR_BOOKED,
        side: "asset",
      },
    ];
    const out = computeRevaluationLines(items, () => RATE_USD_TO_SAR_WEAKENING, "SAR");

    // 1000 × (3.72 - 3.75) = -30 SAR loss
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].gainLoss).toBe(-30);
    expect(out.totalGain).toBe(0);
    expect(out.totalLoss).toBe(30);
  });

  it("flips the sign for liabilities (AP) — strengthening foreign currency → loss", () => {
    const items: MonetaryItem[] = [
      {
        entityType: "purchase_order",
        entityId: 7,
        currency: "USD",
        originalAmount: 1000,
        bookedRate: RATE_USD_TO_SAR_BOOKED,
        side: "liability",
      },
    ];
    const out = computeRevaluationLines(items, () => RATE_USD_TO_SAR_CLOSING, "SAR");

    // For a payable, paying 1000 USD now costs 30 SAR more than it
    // did when booked → recognised as a LOSS, not a gain.
    expect(out.lines[0].gainLoss).toBe(-30);
    expect(out.totalLoss).toBe(30);
  });

  it("skips items in the functional currency (no FX exposure)", () => {
    const items: MonetaryItem[] = [
      {
        entityType: "invoice",
        entityId: 1,
        currency: "SAR",
        originalAmount: 1000,
        bookedRate: 1,
        side: "asset",
      },
      {
        entityType: "invoice",
        entityId: 2,
        currency: "USD",
        originalAmount: 100,
        bookedRate: RATE_USD_TO_SAR_BOOKED,
        side: "asset",
      },
    ];
    const out = computeRevaluationLines(items, () => RATE_USD_TO_SAR_CLOSING, "SAR");

    expect(out.lines).toHaveLength(1);
    expect(out.lines[0].entityId).toBe(2);
  });

  it("skips items whose closing rate is unavailable, surfacing them in 'skipped'", () => {
    const items: MonetaryItem[] = [
      {
        entityType: "invoice",
        entityId: 1,
        currency: "USD",
        originalAmount: 1000,
        bookedRate: RATE_USD_TO_SAR_BOOKED,
        side: "asset",
      },
      {
        entityType: "invoice",
        entityId: 2,
        currency: "XYZ",
        originalAmount: 1000,
        bookedRate: 1.5,
        side: "asset",
      },
    ];
    const out = computeRevaluationLines(
      items,
      (ccy) => (ccy === "USD" ? RATE_USD_TO_SAR_CLOSING : null),
      "SAR",
    );

    expect(out.lines).toHaveLength(1);
    expect(out.skipped).toEqual([
      { entityType: "invoice", entityId: 2, reason: "no closing rate for XYZ" },
    ]);
  });

  it("excludes items with exact-match rates (zero gain/loss)", () => {
    const items: MonetaryItem[] = [
      {
        entityType: "invoice",
        entityId: 1,
        currency: "USD",
        originalAmount: 1000,
        bookedRate: RATE_USD_TO_SAR_BOOKED,
        side: "asset",
      },
    ];
    const out = computeRevaluationLines(items, () => RATE_USD_TO_SAR_BOOKED, "SAR");
    expect(out.lines).toHaveLength(0);
    expect(out.totalGain).toBe(0);
    expect(out.totalLoss).toBe(0);
  });

  it("aggregates totals across mixed asset + liability items", () => {
    const items: MonetaryItem[] = [
      // AR USD: 1000 × (3.78 - 3.75) = +30 (gain)
      {
        entityType: "invoice",
        entityId: 1,
        currency: "USD",
        originalAmount: 1000,
        bookedRate: 3.75,
        side: "asset",
      },
      // AR EUR: 500 × (4.10 - 4.05) = +25 (gain)
      {
        entityType: "invoice",
        entityId: 2,
        currency: "EUR",
        originalAmount: 500,
        bookedRate: 4.05,
        side: "asset",
      },
      // AP USD: 800 × (3.78 - 3.75) = +24 raw, ×(-1 liability) = -24 (loss)
      {
        entityType: "purchase_order",
        entityId: 9,
        currency: "USD",
        originalAmount: 800,
        bookedRate: 3.75,
        side: "liability",
      },
    ];
    const out = computeRevaluationLines(
      items,
      (ccy) => (ccy === "USD" ? 3.78 : ccy === "EUR" ? 4.1 : null),
      "SAR",
    );

    expect(out.lines).toHaveLength(3);
    expect(out.totalGain).toBe(55);
    expect(out.totalLoss).toBe(24);
  });
});

describe("computeRealizedFx — IAS 21.28 settlement-time recognition", () => {
  it("realises a gain when an AR invoice settles at a higher rate than it was booked at", () => {
    const r = computeRealizedFx({
      originalAmount: 1000,
      bookedRate: 3.75,
      settlementRate: 3.78,
      side: "asset",
    });
    expect(r.gainLoss).toBe(30);
    expect(r.isGain).toBe(true);
  });

  it("realises a loss when an AR invoice settles at a lower rate", () => {
    const r = computeRealizedFx({
      originalAmount: 1000,
      bookedRate: 3.75,
      settlementRate: 3.72,
      side: "asset",
    });
    expect(r.gainLoss).toBe(-30);
    expect(r.isGain).toBe(false);
  });

  it("flips the sign for AP (paying more than booked → loss)", () => {
    const r = computeRealizedFx({
      originalAmount: 1000,
      bookedRate: 3.75,
      settlementRate: 3.78,
      side: "liability",
    });
    expect(r.gainLoss).toBe(-30);
    expect(r.isGain).toBe(false);
  });

  it("returns zero gain/loss when rates match exactly", () => {
    const r = computeRealizedFx({
      originalAmount: 1000,
      bookedRate: 3.75,
      settlementRate: 3.75,
      side: "asset",
    });
    expect(r.gainLoss).toBe(0);
  });

  it.each([
    ["originalAmount", { originalAmount: 0 }],
    ["originalAmount", { originalAmount: -1 }],
    ["bookedRate", { bookedRate: 0 }],
    ["settlementRate", { settlementRate: -1 }],
    ["bookedRate", { bookedRate: Number.NaN }],
  ])("rejects non-positive / non-finite %s", (_label, override) => {
    expect(() =>
      computeRealizedFx({
        originalAmount: 1000,
        bookedRate: 3.75,
        settlementRate: 3.78,
        side: "asset",
        ...(override as object),
      }),
    ).toThrow();
  });
});
