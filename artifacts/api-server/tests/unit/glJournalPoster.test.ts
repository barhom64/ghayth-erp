import { describe, it, expect } from "vitest";
import {
  buildEntry,
  buildSimpleEntry,
  type JournalEntryPayload,
} from "../../src/lib/gl/journal-poster.js";

describe("buildSimpleEntry — 2-line balanced shape", () => {
  it("splits an amount into a balanced debit + credit pair", () => {
    const entry = buildSimpleEntry({
      description: "FX revaluation gain",
      amount: 30,
      debitAccountId: 100,
      creditAccountId: 490,
    });
    expect(entry.lines).toHaveLength(2);
    expect(entry.lines[0]).toMatchObject({ accountId: 100, debit: 30, credit: 0 });
    expect(entry.lines[1]).toMatchObject({ accountId: 490, debit: 0, credit: 30 });
    expect(entry.totalDebit).toBe(30);
    expect(entry.totalCredit).toBe(30);
    expect(entry.balanced).toBe(true);
  });

  it("treats negative amounts the same way as positive (always positive sides)", () => {
    const entry = buildSimpleEntry({
      description: "FX revaluation loss",
      amount: -30,
      debitAccountId: 590,
      creditAccountId: 130,
    });
    // Math.abs flips the sign — the debit/credit ASSIGNMENT comes
    // from the `debitAccountId`/`creditAccountId` parameters.
    expect(entry.lines[0]).toMatchObject({ accountId: 590, debit: 30, credit: 0 });
    expect(entry.lines[1]).toMatchObject({ accountId: 130, debit: 0, credit: 30 });
  });

  it("propagates referenceType + referenceId onto both lines", () => {
    const entry = buildSimpleEntry({
      description: "x",
      amount: 50,
      debitAccountId: 1,
      creditAccountId: 2,
      referenceType: "fx_revaluation_log",
      referenceId: 999,
    });
    expect(entry.lines[0].referenceType).toBe("fx_revaluation_log");
    expect(entry.lines[0].referenceId).toBe(999);
    expect(entry.lines[1].referenceType).toBe("fx_revaluation_log");
    expect(entry.lines[1].referenceId).toBe(999);
  });
});

describe("buildEntry — multi-line balanced shape", () => {
  it("balances 3 debits against 1 credit", () => {
    const entry = buildEntry({
      description: "Salary run",
      lines: [
        { accountId: 5100, amount: 8000, description: "Base" },
        { accountId: 5110, amount: 1500, description: "Allowances" },
        { accountId: 5120, amount: 500, description: "Bonus" },
        { accountId: 1110, amount: -10000, description: "Cash" },
      ],
    });
    expect(entry.totalDebit).toBe(10000);
    expect(entry.totalCredit).toBe(10000);
    expect(entry.lines).toHaveLength(4);
  });

  it("throws when debits and credits don't match to 2dp", () => {
    expect(() =>
      buildEntry({
        description: "Bad",
        lines: [
          { accountId: 1, amount: 100, description: "D" },
          { accountId: 2, amount: -99.5, description: "C" },
        ],
      }),
    ).toThrow(/not balanced/);
  });

  it("tolerates float drift up to 1 cent (rounding boundary)", () => {
    // 100 - 99.999... should round to balanced when both sides
    // round to 100.00 / 100.00.
    const entry = buildEntry({
      description: "Penny rounding",
      lines: [
        { accountId: 1, amount: 100.001, description: "D" },
        { accountId: 2, amount: -100.001, description: "C" },
      ],
    });
    expect(entry.balanced).toBe(true);
    expect(entry.totalDebit).toBe(100);
  });

  it("skips zero-amount lines silently", () => {
    const entry = buildEntry({
      description: "Mixed",
      lines: [
        { accountId: 1, amount: 50, description: "D" },
        { accountId: 99, amount: 0, description: "Placeholder" },
        { accountId: 2, amount: -50, description: "C" },
      ],
    });
    expect(entry.lines).toHaveLength(2);
  });

  it("throws when EVERY line is zero (no postable rows)", () => {
    expect(() =>
      buildEntry({
        description: "Empty",
        lines: [
          { accountId: 1, amount: 0, description: "x" },
          { accountId: 2, amount: 0, description: "y" },
        ],
      }),
    ).toThrow(/no postable lines/);
  });

  it("rejects non-finite amounts (catch propagated NaNs at the leaf)", () => {
    expect(() =>
      buildEntry({
        description: "Bad",
        lines: [
          { accountId: 1, amount: Number.NaN, description: "D" },
          { accountId: 2, amount: -50, description: "C" },
        ],
      }),
    ).toThrow(/finite/);
    expect(() =>
      buildEntry({
        description: "Bad",
        lines: [
          { accountId: 1, amount: Number.POSITIVE_INFINITY, description: "D" },
          { accountId: 2, amount: -50, description: "C" },
        ],
      }),
    ).toThrow(/finite/);
  });

  it("a line never has both debit > 0 AND credit > 0 simultaneously", () => {
    // This is the fundamental shape invariant we promise to the
    // journal_lines insert helper. Any builder bug that violates
    // it would post an entry with a "debit AND credit on the same
    // row" anomaly.
    const entry = buildEntry({
      description: "Mixed",
      lines: [
        { accountId: 1, amount: 75, description: "D1" },
        { accountId: 2, amount: 25, description: "D2" },
        { accountId: 3, amount: -100, description: "C" },
      ],
    });
    for (const line of entry.lines) {
      expect(line.debit === 0 || line.credit === 0).toBe(true);
    }
  });
});

describe("buildEntry — invariants", () => {
  function lineSum(entry: JournalEntryPayload): { debit: number; credit: number } {
    return entry.lines.reduce(
      (acc, l) => ({ debit: acc.debit + l.debit, credit: acc.credit + l.credit }),
      { debit: 0, credit: 0 },
    );
  }

  it("the entry's totalDebit/totalCredit always match the sum of line amounts", () => {
    const entry = buildEntry({
      description: "Inventory writeoff",
      lines: [
        { accountId: 5100, amount: 1234.56, description: "Loss" },
        { accountId: 1400, amount: -1234.56, description: "Inventory" },
      ],
    });
    const sums = lineSum(entry);
    expect(sums.debit).toBe(entry.totalDebit);
    expect(sums.credit).toBe(entry.totalCredit);
  });
});
