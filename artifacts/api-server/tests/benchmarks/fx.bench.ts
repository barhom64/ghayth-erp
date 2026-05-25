// Benchmarks for the pure FX layer:
//   - convertWithRate / invertRate (called from every multi-currency
//     invoice line + payment recording)
//   - computeRealizedFx (per-payment, on every foreign-currency
//     settlement)
//   - computeRevaluationLines (period-end revaluation — walks the
//     full open AR/AP set, so size matters)
//
import { bench, describe } from "vitest";
import { convertWithRate, invertRate } from "../../src/lib/fx/convert.js";
import { computeRealizedFx } from "../../src/lib/fx/realized.js";
import {
  computeRevaluationLines,
  type MonetaryItem,
} from "../../src/lib/fx/revaluation.js";

const CURRENCIES = ["USD", "EUR", "GBP", "AED", "KWD", "BHD"] as const;

function makeMonetaryItems(count: number): MonetaryItem[] {
  return Array.from({ length: count }, (_, i) => ({
    entityType: i % 2 === 0 ? "invoice" : "purchase_order",
    entityId: i + 1,
    currency: CURRENCIES[i % CURRENCIES.length],
    originalAmount: 100 + (i % 10000),
    bookedRate: 3.7 + ((i % 7) * 0.01),
    side: i % 2 === 0 ? "asset" : "liability",
  }));
}

const tenItems = makeMonetaryItems(10);
const fiveHundredItems = makeMonetaryItems(500);
const fiveThousandItems = makeMonetaryItems(5000);

const closingRates: Record<string, number> = {
  USD: 3.78,
  EUR: 4.12,
  GBP: 4.79,
  AED: 1.02,
  KWD: 12.31,
  BHD: 9.94,
};
const lookup = (c: string) => closingRates[c] ?? null;

describe("convertWithRate", () => {
  bench("USD → SAR (typical invoice line)", () => {
    convertWithRate({
      amount: 1250.75,
      from: "USD",
      to: "SAR",
      rate: 3.78,
      rateDate: "2026-05-25",
    });
  });

  bench("USD → USD (trivial, same currency)", () => {
    convertWithRate({
      amount: 1250.75,
      from: "USD",
      to: "USD",
      rate: 1,
      rateDate: "2026-05-25",
    });
  });

  bench("KWD → SAR with 3-decimal precision", () => {
    convertWithRate({
      amount: 1250.123,
      from: "KWD",
      to: "SAR",
      rate: 12.31,
      rateDate: "2026-05-25",
      decimals: 3,
    });
  });

  bench("stale-flagged conversion", () => {
    convertWithRate({
      amount: 999.99,
      from: "EUR",
      to: "SAR",
      rate: 4.12,
      rateDate: "2026-05-01",
      rateIsStale: true,
    });
  });
});

describe("invertRate", () => {
  bench("invert 3.78", () => {
    invertRate(3.78);
  });
});

describe("computeRealizedFx", () => {
  bench("AR settlement, small gain", () => {
    computeRealizedFx({
      originalAmount: 100,
      bookedRate: 3.75,
      settlementRate: 3.78,
      side: "asset",
    });
  });

  bench("AP settlement, small loss", () => {
    computeRealizedFx({
      originalAmount: 5000,
      bookedRate: 3.75,
      settlementRate: 3.80,
      side: "liability",
    });
  });
});

describe("computeRevaluationLines", () => {
  bench("10 items", () => {
    computeRevaluationLines(tenItems, lookup, "SAR");
  });

  bench("500 items (typical month-end for an active tenant)", () => {
    computeRevaluationLines(fiveHundredItems, lookup, "SAR");
  });

  bench("5000 items (year-end, large tenant)", () => {
    computeRevaluationLines(fiveThousandItems, lookup, "SAR");
  });

  bench("500 items, one currency missing closing rate", () => {
    const partial: Record<string, number> = { ...closingRates };
    delete partial.GBP;
    const partialLookup = (c: string) => partial[c] ?? null;
    computeRevaluationLines(fiveHundredItems, partialLookup, "SAR");
  });
});
