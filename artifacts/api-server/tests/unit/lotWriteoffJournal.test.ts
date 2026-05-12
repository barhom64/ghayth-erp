import { describe, it, expect } from "vitest";
import {
  buildLotWriteoffEntryInput,
  type LotWriteoffAccounts,
} from "../../src/lib/inventory/post-lot-writeoff-journal.js";
import { buildEntry } from "../../src/lib/gl/journal-poster.js";

const ACCOUNTS: LotWriteoffAccounts = {
  inventory: { accountId: 1400, accountCode: "1400", source: "fallback" },
  loss:      { accountId: 5610, accountCode: "5610", source: "fallback" },
};

describe("buildLotWriteoffEntryInput — covers all 3 status branches", () => {
  it("recalled → DR loss / CR inventory", () => {
    const input = buildLotWriteoffEntryInput({
      description: "recall",
      writeoffValue: 250,
      status: "recalled",
      accounts: ACCOUNTS,
      lotId: 7,
    });
    expect(input.lines).toHaveLength(2);
    expect(input.lines[0]).toMatchObject({ accountId: 5610, amount: 250 });
    expect(input.lines[1]).toMatchObject({ accountId: 1400, amount: -250 });

    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
    expect(entry.totalDebit).toBe(250);
    expect(entry.totalCredit).toBe(250);
  });

  it("expired → DR loss / CR inventory", () => {
    const input = buildLotWriteoffEntryInput({
      description: "expiry",
      writeoffValue: 80,
      status: "expired",
      accounts: ACCOUNTS,
      lotId: 7,
    });
    expect(input.lines[0]).toMatchObject({ accountId: 5610, amount: 80 });
    expect(input.lines[1]).toMatchObject({ accountId: 1400, amount: -80 });

    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
  });

  it("disposed → DR loss / CR inventory", () => {
    const input = buildLotWriteoffEntryInput({
      description: "disposal",
      writeoffValue: 12.5,
      status: "disposed",
      accounts: ACCOUNTS,
      lotId: 7,
    });
    expect(input.lines[0]).toMatchObject({ accountId: 5610, amount: 12.5 });
    expect(input.lines[1]).toMatchObject({ accountId: 1400, amount: -12.5 });
    const entry = buildEntry(input);
    expect(entry.balanced).toBe(true);
  });

  it("zero value → empty lines (caller handles via 'noop')", () => {
    const input = buildLotWriteoffEntryInput({
      description: "zero",
      writeoffValue: 0,
      status: "expired",
      accounts: ACCOUNTS,
      lotId: 1,
    });
    expect(input.lines).toEqual([]);
  });

  it("negative value → empty lines (defensive; lots should never owe back inventory)", () => {
    const input = buildLotWriteoffEntryInput({
      description: "neg",
      writeoffValue: -10,
      status: "disposed",
      accounts: ACCOUNTS,
      lotId: 1,
    });
    expect(input.lines).toEqual([]);
  });

  it("rounds writeoff value to 2dp before posting", () => {
    const input = buildLotWriteoffEntryInput({
      description: "round",
      writeoffValue: 12.499,
      status: "expired",
      accounts: ACCOUNTS,
      lotId: 1,
    });
    expect(input.lines[0]).toMatchObject({ accountId: 5610, amount: 12.5 });
    expect(input.lines[1]).toMatchObject({ accountId: 1400, amount: -12.5 });
  });

  it("propagates lotId on every line for drilldown", () => {
    const input = buildLotWriteoffEntryInput({
      description: "x",
      writeoffValue: 30,
      status: "recalled",
      accounts: ACCOUNTS,
      lotId: 99,
    });
    for (const line of input.lines) {
      expect(line.referenceType).toBe("warehouse_stock_lots");
      expect(line.referenceId).toBe(99);
    }
  });

  it("uses inventory_asset (1400) and inventory_writeoff_loss (5610), not FX or cycle-count accounts", () => {
    // Guard against the accidental wiring bug — write-offs go to 5610,
    // distinct from FX revaluation loss (5900), realised FX loss (5910),
    // and cycle-count variance loss (5620). Same for the credit side:
    // 1400 inventory, not the 4900-series gain accounts.
    const input = buildLotWriteoffEntryInput({
      description: "x",
      writeoffValue: 100,
      status: "expired",
      accounts: ACCOUNTS,
      lotId: 1,
    });
    const ids = input.lines.map((l) => l.accountId).sort();
    expect(ids).toEqual([1400, 5610]);
    expect(input.lines.some((l) => l.accountId === 5900)).toBe(false);
    expect(input.lines.some((l) => l.accountId === 5910)).toBe(false);
    expect(input.lines.some((l) => l.accountId === 5620)).toBe(false);
    expect(input.lines.some((l) => l.accountId === 4620)).toBe(false);
  });

  it("description text reflects the lot status (recall vs expiry vs disposal)", () => {
    const recalled = buildLotWriteoffEntryInput({
      description: "x", writeoffValue: 10, status: "recalled", accounts: ACCOUNTS, lotId: 1,
    });
    const expired = buildLotWriteoffEntryInput({
      description: "x", writeoffValue: 10, status: "expired", accounts: ACCOUNTS, lotId: 1,
    });
    const disposed = buildLotWriteoffEntryInput({
      description: "x", writeoffValue: 10, status: "disposed", accounts: ACCOUNTS, lotId: 1,
    });
    expect(recalled.lines[0].description).toMatch(/recall/i);
    expect(expired.lines[0].description).toMatch(/expiry/i);
    expect(disposed.lines[0].description).toMatch(/disposal/i);
  });
});
