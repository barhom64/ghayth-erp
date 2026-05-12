import { describe, it, expect } from "vitest";
import {
  buildRealizedFxEntryInput,
  type RealizedAccounts,
} from "../../src/lib/fx/post-realized-journal.js";
import { buildEntry } from "../../src/lib/gl/journal-poster.js";

const ACCOUNTS: RealizedAccounts = {
  arAsset:       { accountId: 1100, accountCode: "1100", source: "fallback" },
  apLiability:   { accountId: 2100, accountCode: "2100", source: "fallback" },
  realizedGain:  { accountId: 4910, accountCode: "4910", source: "fallback" },
  realizedLoss:  { accountId: 5910, accountCode: "5910", source: "fallback" },
};

describe("buildRealizedFxEntryInput — four branches", () => {
  it("asset gain: DR AR / CR realized_gain", () => {
    const input = buildRealizedFxEntryInput({
      description: "AR gain",
      side: "asset",
      gainLoss: 30,
      accounts: ACCOUNTS,
      invoiceId: 7,
    });
    expect(input.lines).toHaveLength(2);
    expect(input.lines[0]).toMatchObject({ accountId: 1100, amount: 30 });
    expect(input.lines[1]).toMatchObject({ accountId: 4910, amount: -30 });

    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
    expect(entry.totalDebit).toBe(30);
  });

  it("asset loss: DR realized_loss / CR AR", () => {
    const input = buildRealizedFxEntryInput({
      description: "AR loss",
      side: "asset",
      gainLoss: -45,
      accounts: ACCOUNTS,
      invoiceId: 7,
    });
    expect(input.lines[0]).toMatchObject({ accountId: 5910, amount: 45 });
    expect(input.lines[1]).toMatchObject({ accountId: 1100, amount: -45 });
    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
  });

  it("liability gain: DR AP / CR realized_gain", () => {
    const input = buildRealizedFxEntryInput({
      description: "AP gain",
      side: "liability",
      gainLoss: 15,
      accounts: ACCOUNTS,
      invoiceId: 9,
    });
    expect(input.lines[0]).toMatchObject({ accountId: 2100, amount: 15 });
    expect(input.lines[1]).toMatchObject({ accountId: 4910, amount: -15 });
    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
  });

  it("liability loss: DR realized_loss / CR AP", () => {
    const input = buildRealizedFxEntryInput({
      description: "AP loss",
      side: "liability",
      gainLoss: -25,
      accounts: ACCOUNTS,
      invoiceId: 9,
    });
    expect(input.lines[0]).toMatchObject({ accountId: 5910, amount: 25 });
    expect(input.lines[1]).toMatchObject({ accountId: 2100, amount: -25 });
    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
  });

  it("zero gainLoss → empty line array (caller short-circuits to noop)", () => {
    const input = buildRealizedFxEntryInput({
      description: "x",
      side: "asset",
      gainLoss: 0,
      accounts: ACCOUNTS,
      invoiceId: 1,
    });
    expect(input.lines).toEqual([]);
  });

  it("rounds sub-cent gain/loss to zero (no spurious entries)", () => {
    const input = buildRealizedFxEntryInput({
      description: "rounding",
      side: "asset",
      gainLoss: 0.004,
      accounts: ACCOUNTS,
      invoiceId: 1,
    });
    expect(input.lines).toEqual([]);
  });

  it("propagates invoiceId on every line for drilldown", () => {
    const input = buildRealizedFxEntryInput({
      description: "x",
      side: "asset",
      gainLoss: 100,
      accounts: ACCOUNTS,
      invoiceId: 42,
    });
    for (const line of input.lines) {
      expect(line.referenceType).toBe("invoice");
      expect(line.referenceId).toBe(42);
    }
  });

  it("uses the realized accounts (4910/5910), NOT the revaluation accounts (4900/5900)", () => {
    // Sanity check: the realized helper consults its own accounts,
    // distinct from the unrealised revaluation pair.
    const gain = buildRealizedFxEntryInput({
      description: "x",
      side: "asset",
      gainLoss: 10,
      accounts: ACCOUNTS,
      invoiceId: 1,
    });
    expect(gain.lines.some((l) => l.accountId === 4910)).toBe(true);
    expect(gain.lines.some((l) => l.accountId === 4900)).toBe(false);

    const loss = buildRealizedFxEntryInput({
      description: "x",
      side: "asset",
      gainLoss: -10,
      accounts: ACCOUNTS,
      invoiceId: 1,
    });
    expect(loss.lines.some((l) => l.accountId === 5910)).toBe(true);
    expect(loss.lines.some((l) => l.accountId === 5900)).toBe(false);
  });
});
