// Benchmarks for the pure FX → journal builders. Both `aggregate`
// and `buildRevaluationEntryInput` are pure shape transformers
// called from the period-end posting flow (`postFxRevaluationJournal`).
//
import { bench, describe } from "vitest";
import {
  aggregateRevaluation,
  buildRevaluationEntryInput,
  type RevaluationLineForJournal,
  type ResolvedAccountSet,
} from "../../src/lib/fx/post-revaluation-journal.js";
import {
  buildRealizedFxEntryInput,
  type RealizedAccounts,
} from "../../src/lib/fx/post-realized-journal.js";
import type { AccountResolution } from "../../src/lib/gl/account-purposes.js";

function makeLines(count: number): RevaluationLineForJournal[] {
  return Array.from({ length: count }, (_, i) => ({
    entityType: i % 2 === 0 ? "invoice" : "purchase_order",
    entityId: i + 1,
    gainLoss: ((i % 7) - 3) * 12.34, // mixes positive / negative / zero
    side: i % 2 === 0 ? "asset" : "liability",
  }));
}

const tenLines = makeLines(10);
const fiveHundredLines = makeLines(500);

function acct(id: number, code: string): AccountResolution {
  return { accountId: id, accountCode: code, source: "configured" };
}

const revalAccounts: ResolvedAccountSet = {
  arAsset: acct(1100, "1100"),
  apLiability: acct(2100, "2100"),
  fxGain: acct(4900, "4900"),
  fxLoss: acct(5900, "5900"),
};

const realizedAccounts: RealizedAccounts = {
  arAsset: acct(1100, "1100"),
  apLiability: acct(2100, "2100"),
  realizedGain: acct(4910, "4910"),
  realizedLoss: acct(5910, "5910"),
};

describe("aggregateRevaluation", () => {
  bench("10 lines", () => {
    aggregateRevaluation(tenLines);
  });

  bench("500 lines (typical month-end)", () => {
    aggregateRevaluation(fiveHundredLines);
  });
});

describe("buildRevaluationEntryInput", () => {
  bench("all four buckets non-zero", () => {
    buildRevaluationEntryInput({
      description: "Period-end FX revaluation 2026-05",
      totals: {
        assetGain: 1234.56,
        assetLoss: 543.21,
        liabilityGain: 987.65,
        liabilityLoss: 432.1,
      },
      accounts: revalAccounts,
      sourceType: "fx_revaluation_log",
      sourceId: 42,
    });
  });

  bench("single bucket (asset gain only — common case)", () => {
    buildRevaluationEntryInput({
      description: "Period-end FX revaluation 2026-05",
      totals: {
        assetGain: 1234.56,
        assetLoss: 0,
        liabilityGain: 0,
        liabilityLoss: 0,
      },
      accounts: revalAccounts,
    });
  });

  bench("all zero (noop entry — must early-out)", () => {
    buildRevaluationEntryInput({
      description: "noop",
      totals: { assetGain: 0, assetLoss: 0, liabilityGain: 0, liabilityLoss: 0 },
      accounts: revalAccounts,
    });
  });
});

describe("buildRealizedFxEntryInput", () => {
  bench("AR gain", () => {
    buildRealizedFxEntryInput({
      description: "Realised FX on INV-2026-000042",
      side: "asset",
      gainLoss: 12.34,
      accounts: realizedAccounts,
      invoiceId: 42,
    });
  });

  bench("AP loss", () => {
    buildRealizedFxEntryInput({
      description: "Realised FX on PO-2026-000017",
      side: "liability",
      gainLoss: -98.76,
      accounts: realizedAccounts,
      invoiceId: 17,
    });
  });

  bench("zero (noop — must early-out)", () => {
    buildRealizedFxEntryInput({
      description: "noop",
      side: "asset",
      gainLoss: 0,
      accounts: realizedAccounts,
      invoiceId: 1,
    });
  });
});
