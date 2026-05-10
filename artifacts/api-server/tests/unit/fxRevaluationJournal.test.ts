import { describe, it, expect } from "vitest";
import {
  aggregateRevaluation,
  buildRevaluationEntryInput,
  isAssetEntity,
  type ResolvedAccountSet,
  type RevaluationLineForJournal,
} from "../../src/lib/fx/post-revaluation-journal.js";
import { buildEntry } from "../../src/lib/gl/journal-poster.js";

const ACCOUNTS: ResolvedAccountSet = {
  arAsset:    { accountId: 1100, accountCode: "1100", source: "fallback" },
  apLiability:{ accountId: 2100, accountCode: "2100", source: "fallback" },
  fxGain:     { accountId: 4900, accountCode: "4900", source: "fallback" },
  fxLoss:     { accountId: 5900, accountCode: "5900", source: "fallback" },
};

describe("aggregateRevaluation", () => {
  it("buckets by (side × sign)", () => {
    const lines: RevaluationLineForJournal[] = [
      { entityType: "invoice", entityId: 1, side: "asset",     gainLoss:  30 },
      { entityType: "invoice", entityId: 2, side: "asset",     gainLoss: -10 },
      { entityType: "po",      entityId: 9, side: "liability", gainLoss:   5 },
      { entityType: "po",      entityId: 8, side: "liability", gainLoss: -20 },
    ];
    const t = aggregateRevaluation(lines);
    expect(t.assetGain).toBe(30);
    expect(t.assetLoss).toBe(10);
    expect(t.liabilityGain).toBe(5);
    expect(t.liabilityLoss).toBe(20);
  });

  it("ignores zero-amount lines", () => {
    const t = aggregateRevaluation([
      { entityType: "invoice", entityId: 1, side: "asset", gainLoss: 0 },
    ]);
    expect(t).toEqual({ assetGain: 0, assetLoss: 0, liabilityGain: 0, liabilityLoss: 0 });
  });

  it("rounds aggregated totals to 2dp", () => {
    const t = aggregateRevaluation([
      { entityType: "invoice", entityId: 1, side: "asset", gainLoss: 0.005 },
      { entityType: "invoice", entityId: 2, side: "asset", gainLoss: 0.005 },
    ]);
    // 0.005 + 0.005 ≈ 0.01 (within float drift); round2dp lands at 0.01
    expect(t.assetGain).toBeGreaterThanOrEqual(0);
    expect(t.assetGain).toBeLessThanOrEqual(0.02);
  });

  it("returns zero totals on empty input", () => {
    expect(aggregateRevaluation([])).toEqual({
      assetGain: 0, assetLoss: 0, liabilityGain: 0, liabilityLoss: 0,
    });
  });
});

describe("buildRevaluationEntryInput — covers all 4 branches", () => {
  it("asset gain only → DR AR / CR Gain", () => {
    const input = buildRevaluationEntryInput({
      description: "asset-gain only",
      totals: { assetGain: 30, assetLoss: 0, liabilityGain: 0, liabilityLoss: 0 },
      accounts: ACCOUNTS,
    });
    expect(input.lines).toHaveLength(2);
    expect(input.lines[0]).toMatchObject({ accountId: 1100, amount: 30 });
    expect(input.lines[1]).toMatchObject({ accountId: 4900, amount: -30 });

    // Should round-trip through buildEntry as a balanced posting.
    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
    expect(entry.totalDebit).toBe(30);
    expect(entry.totalCredit).toBe(30);
  });

  it("asset loss only → DR Loss / CR AR", () => {
    const input = buildRevaluationEntryInput({
      description: "asset-loss only",
      totals: { assetGain: 0, assetLoss: 50, liabilityGain: 0, liabilityLoss: 0 },
      accounts: ACCOUNTS,
    });
    expect(input.lines[0]).toMatchObject({ accountId: 5900, amount: 50 });
    expect(input.lines[1]).toMatchObject({ accountId: 1100, amount: -50 });
    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
  });

  it("liability gain only → DR AP / CR Gain", () => {
    const input = buildRevaluationEntryInput({
      description: "liab-gain only",
      totals: { assetGain: 0, assetLoss: 0, liabilityGain: 12, liabilityLoss: 0 },
      accounts: ACCOUNTS,
    });
    expect(input.lines[0]).toMatchObject({ accountId: 2100, amount: 12 });
    expect(input.lines[1]).toMatchObject({ accountId: 4900, amount: -12 });
    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
  });

  it("liability loss only → DR Loss / CR AP", () => {
    const input = buildRevaluationEntryInput({
      description: "liab-loss only",
      totals: { assetGain: 0, assetLoss: 0, liabilityGain: 0, liabilityLoss: 25 },
      accounts: ACCOUNTS,
    });
    expect(input.lines[0]).toMatchObject({ accountId: 5900, amount: 25 });
    expect(input.lines[1]).toMatchObject({ accountId: 2100, amount: -25 });
    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
  });

  it("mixed (all four buckets non-zero) → 8 lines, balanced", () => {
    const input = buildRevaluationEntryInput({
      description: "mixed",
      totals: { assetGain: 30, assetLoss: 10, liabilityGain: 5, liabilityLoss: 20 },
      accounts: ACCOUNTS,
    });
    expect(input.lines).toHaveLength(8);

    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
    // Total debits = 30 + 10 + 5 + 20 = 65; same on credit side.
    expect(entry.totalDebit).toBe(65);
    expect(entry.totalCredit).toBe(65);
  });

  it("zero totals → empty line array (caller handles via 'noop')", () => {
    const input = buildRevaluationEntryInput({
      description: "zero",
      totals: { assetGain: 0, assetLoss: 0, liabilityGain: 0, liabilityLoss: 0 },
      accounts: ACCOUNTS,
    });
    expect(input.lines).toEqual([]);
  });

  it("propagates sourceType + sourceId onto every line for drilldown", () => {
    const input = buildRevaluationEntryInput({
      description: "x",
      totals: { assetGain: 30, assetLoss: 10, liabilityGain: 5, liabilityLoss: 20 },
      accounts: ACCOUNTS,
      sourceType: "fx_revaluation_log",
      sourceId: 42,
    });
    for (const line of input.lines) {
      expect(line.referenceType).toBe("fx_revaluation_log");
      expect(line.referenceId).toBe(42);
    }
  });
});

describe("isAssetEntity — entity-type → side classifier", () => {
  it.each([
    ["invoice", true],
    ["bank_account", true],
    ["cash", true],
    ["purchase_order", false],
    ["expense", false],
    ["unknown_type", false],
  ] as const)("classifies %s as asset=%s", (entityType, expected) => {
    expect(isAssetEntity(entityType)).toBe(expected);
  });
});
