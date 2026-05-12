import { describe, it, expect } from "vitest";
import {
  aggregateCycleCount,
  buildCycleCountEntryInput,
  type CycleCountAccounts,
  type CycleCountLineForJournal,
} from "../../src/lib/inventory/post-cycle-count-journal.js";
import { buildEntry } from "../../src/lib/gl/journal-poster.js";

const ACCOUNTS: CycleCountAccounts = {
  inventory: { accountId: 1400, accountCode: "1400", source: "fallback" },
  gain:      { accountId: 4620, accountCode: "4620", source: "fallback" },
  loss:      { accountId: 5620, accountCode: "5620", source: "fallback" },
};

describe("aggregateCycleCount", () => {
  it("splits positive vs negative variance into gain + loss totals", () => {
    const lines: CycleCountLineForJournal[] = [
      { productId: 1, variance: 2,  varianceValue:  10 }, // overage
      { productId: 2, variance: -3, varianceValue: -15 }, // shrinkage
      { productId: 3, variance: 5,  varianceValue:  25 }, // overage
    ];
    const t = aggregateCycleCount(lines);
    expect(t.totalGainValue).toBe(35);
    expect(t.totalLossValue).toBe(15);
  });

  it("ignores zero-variance lines", () => {
    const t = aggregateCycleCount([
      { productId: 1, variance: 0, varianceValue: 0 },
    ]);
    expect(t).toEqual({ totalGainValue: 0, totalLossValue: 0 });
  });

  it("returns zero on empty input", () => {
    expect(aggregateCycleCount([])).toEqual({
      totalGainValue: 0,
      totalLossValue: 0,
    });
  });

  it("rounds totals to 2dp", () => {
    const lines: CycleCountLineForJournal[] = [
      { productId: 1, variance: 0.1, varianceValue: 0.333 },
      { productId: 2, variance: 0.1, varianceValue: 0.333 },
      { productId: 3, variance: 0.1, varianceValue: 0.334 },
    ];
    const t = aggregateCycleCount(lines);
    expect(t.totalGainValue).toBe(1); // 0.333+0.333+0.334 = 1.000
  });
});

describe("buildCycleCountEntryInput — both branches", () => {
  it("overage only → DR inventory / CR gain", () => {
    const input = buildCycleCountEntryInput({
      description: "overage",
      totals: { totalGainValue: 30, totalLossValue: 0 },
      accounts: ACCOUNTS,
      cycleCountId: 7,
    });
    expect(input.lines).toHaveLength(2);
    expect(input.lines[0]).toMatchObject({ accountId: 1400, amount: 30 });
    expect(input.lines[1]).toMatchObject({ accountId: 4620, amount: -30 });

    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
    expect(entry.totalDebit).toBe(30);
  });

  it("shrinkage only → DR loss / CR inventory", () => {
    const input = buildCycleCountEntryInput({
      description: "shrinkage",
      totals: { totalGainValue: 0, totalLossValue: 50 },
      accounts: ACCOUNTS,
      cycleCountId: 7,
    });
    expect(input.lines[0]).toMatchObject({ accountId: 5620, amount: 50 });
    expect(input.lines[1]).toMatchObject({ accountId: 1400, amount: -50 });
    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
  });

  it("mixed gain + loss → 4 lines, both branches balanced", () => {
    const input = buildCycleCountEntryInput({
      description: "mixed",
      totals: { totalGainValue: 30, totalLossValue: 50 },
      accounts: ACCOUNTS,
      cycleCountId: 7,
    });
    expect(input.lines).toHaveLength(4);
    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
    // Total debits = 30 (inventory for overage) + 50 (loss) = 80
    // Total credits = 30 (gain) + 50 (inventory for shrinkage) = 80
    expect(entry.totalDebit).toBe(80);
    expect(entry.totalCredit).toBe(80);
  });

  it("zero totals → empty line array", () => {
    const input = buildCycleCountEntryInput({
      description: "x",
      totals: { totalGainValue: 0, totalLossValue: 0 },
      accounts: ACCOUNTS,
      cycleCountId: 1,
    });
    expect(input.lines).toEqual([]);
  });

  it("propagates cycleCountId on every line for drilldown", () => {
    const input = buildCycleCountEntryInput({
      description: "x",
      totals: { totalGainValue: 30, totalLossValue: 50 },
      accounts: ACCOUNTS,
      cycleCountId: 42,
    });
    for (const line of input.lines) {
      expect(line.referenceType).toBe("warehouse_cycle_counts");
      expect(line.referenceId).toBe(42);
    }
  });

  it("uses inventory_asset (1400), variance gain (4620), and variance loss (5620)", () => {
    // Guard against the accidental wiring bug — variance accounts
    // are 4620/5620, distinct from the FX revaluation (4900/5900)
    // and realised (4910/5910) pairs.
    const mixed = buildCycleCountEntryInput({
      description: "x",
      totals: { totalGainValue: 30, totalLossValue: 50 },
      accounts: ACCOUNTS,
      cycleCountId: 1,
    });
    const ids = mixed.lines.map((l) => l.accountId).sort();
    expect(ids).toEqual([1400, 1400, 4620, 5620]); // sorted: two inventory, then gain, then loss
    // No FX account leaks into the entry
    expect(mixed.lines.some((l) => l.accountId === 4900)).toBe(false);
    expect(mixed.lines.some((l) => l.accountId === 5900)).toBe(false);
    expect(mixed.lines.some((l) => l.accountId === 4910)).toBe(false);
    expect(mixed.lines.some((l) => l.accountId === 5910)).toBe(false);
  });
});
