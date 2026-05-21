import { describe, it, expect, vi } from "vitest";

// Hoisted: stub the rawdb layer so postJournalEntry runs entirely
// in-memory. We assert against the *payload* shape the function
// hands to rawQuery / rawExecute. A separate integration test
// will cover the real SQL once the DB harness exists.

vi.mock("../../src/lib/rawdb.js", () => {
  const rawQuery = vi.fn();
  const rawExecute = vi.fn();
  const withTransaction = vi.fn(async (fn: () => Promise<any>) => fn());
  return { rawQuery, rawExecute, withTransaction };
});

import { postJournalEntry } from "../../src/lib/gl/posting.js";
import { buildSimpleEntry, buildEntry } from "../../src/lib/gl/journal-poster.js";
import { rawQuery, rawExecute } from "../../src/lib/rawdb.js";

const mockRawQuery = rawQuery as unknown as ReturnType<typeof vi.fn>;
const mockRawExecute = rawExecute as unknown as ReturnType<typeof vi.fn>;

// A `posted` entry runs a financial-period-close check (one rawQuery to
// financial_periods) BEFORE the account lookup. `periodOpen` controls that
// first mocked call ([] = no closed period). `skipPeriodCheck` is for draft
// entries, which are exempt from the gate and never issue that query.
function setupAccountResolve(
  accounts: Array<{ id: number; code: string }>,
  insertedId = 999,
  opts: { periodOpen?: boolean; skipPeriodCheck?: boolean } = {},
) {
  const { periodOpen = true, skipPeriodCheck = false } = opts;
  mockRawQuery.mockReset();
  mockRawExecute.mockReset();
  if (!skipPeriodCheck) {
    // checkFinancialPeriodOpen — [] means no closed period covers the date.
    mockRawQuery.mockResolvedValueOnce(periodOpen ? [] : [{ name: "2026-Q1" }]);
  }
  mockRawQuery
    // account lookup
    .mockResolvedValueOnce(accounts)
    // INSERT into journal_entries RETURNING id
    .mockResolvedValueOnce([{ id: insertedId }]);
  mockRawExecute.mockResolvedValue({ affectedRows: 1 });
}

describe("postJournalEntry — payload validation", () => {
  it("rejects an unbalanced payload (defence in depth past the builder)", async () => {
    // Build a deliberately bad payload directly (skipping buildEntry's
    // own balance check)
    const badPayload = {
      description: "bad",
      lines: [
        { accountId: 1, debit: 100, credit: 0, description: "D" },
        { accountId: 2, debit: 0, credit: 50, description: "C" },
      ],
      totalDebit: 100,
      totalCredit: 50,
      balanced: true,
    } as any;
    await expect(
      postJournalEntry(badPayload, { companyId: 1 }),
    ).rejects.toThrow(/unbalanced/);
  });

  it("rejects a payload with no lines", async () => {
    const empty = {
      description: "empty",
      lines: [],
      totalDebit: 0,
      totalCredit: 0,
      balanced: true,
    } as any;
    await expect(
      postJournalEntry(empty, { companyId: 1 }),
    ).rejects.toThrow(/no lines/);
  });
});

describe("postJournalEntry — account resolution", () => {
  it("throws when one of the line accounts isn't postable in the company chart", async () => {
    // Account 1 valid, account 2 missing.
    setupAccountResolve([{ id: 1, code: "1100" }]);
    const payload = buildEntry({
      description: "test",
      lines: [
        { accountId: 1, amount: 50, description: "D" },
        { accountId: 2, amount: -50, description: "C" },
      ],
    });
    await expect(
      postJournalEntry(payload, { companyId: 1 }),
    ).rejects.toThrow(/not postable.*2/);
  });

  it("looks up accounts ONCE per call (single SELECT for all distinct ids)", async () => {
    setupAccountResolve([
      { id: 1, code: "1100" },
      { id: 2, code: "4900" },
    ]);
    const payload = buildEntry({
      description: "test",
      lines: [
        { accountId: 1, amount: 50, description: "D1" },
        { accountId: 1, amount: 25, description: "D2" },  // same account twice
        { accountId: 2, amount: -75, description: "C" },
      ],
    });
    await postJournalEntry(payload, { companyId: 1 });

    // The first SELECT is the account-validation query — confirm it
    // received DISTINCT ids only (length 2, not 3).
    const accountLookupCall = mockRawQuery.mock.calls.find((c) =>
      String(c[0]).includes("FROM chart_of_accounts"),
    );
    expect(accountLookupCall).toBeDefined();
    const ids = accountLookupCall?.[1]?.[0] as number[];
    expect(ids.sort()).toEqual([1, 2]);
  });
});

describe("postJournalEntry — INSERT shape", () => {
  it("writes header + one row per line, with accountCode resolved from the chart", async () => {
    setupAccountResolve(
      [
        { id: 100, code: "1100" },
        { id: 490, code: "4900" },
      ],
      4242,
    );
    const payload = buildSimpleEntry({
      description: "FX gain Q1",
      amount: 30,
      debitAccountId: 100,
      creditAccountId: 490,
      referenceType: "fx_revaluation_log",
      referenceId: 7,
    });

    const result = await postJournalEntry(payload, {
      companyId: 5,
      branchId: 2,
      ref: "FX-REV-Q1",
      type: "fx_revaluation",
      sourceType: "fx_revaluation_log",
      sourceId: 7,
      createdBy: 99,
    });

    expect(result.journalEntryId).toBe(4242);
    expect(result.status).toBe("posted");

    // rawExecute shape: one INSERT INTO journal_lines per line (×2), then
    // one currentBalance UPDATE per account (×2) — RCA PD-1 fix.
    expect(mockRawExecute).toHaveBeenCalledTimes(4);
    const firstLineCall = mockRawExecute.mock.calls[0];
    expect(String(firstLineCall[0])).toContain("INSERT INTO journal_lines");
    expect(firstLineCall[1]).toEqual([
      4242, 100, "1100", 30, 0, "FX gain Q1",
    ]);
    const secondLineCall = mockRawExecute.mock.calls[1];
    expect(secondLineCall[1]).toEqual([
      4242, 490, "4900", 0, 30, "FX gain Q1",
    ]);
    // currentBalance moves by debit−credit per account: +30 on the debit
    // account (1100), −30 on the credit account (4900).
    const firstBalanceCall = mockRawExecute.mock.calls[2];
    expect(String(firstBalanceCall[0])).toContain('UPDATE chart_of_accounts SET "currentBalance"');
    expect(firstBalanceCall[1]).toEqual([30, 5, "1100"]);
    const secondBalanceCall = mockRawExecute.mock.calls[3];
    expect(secondBalanceCall[1]).toEqual([-30, 5, "4900"]);
  });

  it("defaults status to 'posted' and stamps postedAt", async () => {
    setupAccountResolve(
      [
        { id: 100, code: "1100" },
        { id: 490, code: "4900" },
      ],
      1,
    );
    const payload = buildSimpleEntry({
      description: "X",
      amount: 50,
      debitAccountId: 100,
      creditAccountId: 490,
    });
    const r = await postJournalEntry(payload, { companyId: 5 });
    expect(r.status).toBe("posted");

    // INSERT INTO journal_entries — find the call.
    const headerCall = mockRawQuery.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO journal_entries"),
    );
    expect(headerCall).toBeDefined();
    const params = headerCall?.[1] as any[];
    // params[7] is `status` (the 8th positional param)
    expect(params[7]).toBe("posted");
  });

  it("respects an explicit status='draft' (don't stamp postedAt yet)", async () => {
    setupAccountResolve(
      [
        { id: 100, code: "1100" },
        { id: 490, code: "4900" },
      ],
      2,
      { skipPeriodCheck: true },
    );
    const payload = buildSimpleEntry({
      description: "X",
      amount: 50,
      debitAccountId: 100,
      creditAccountId: 490,
    });
    const r = await postJournalEntry(payload, { companyId: 5, status: "draft" });
    expect(r.status).toBe("draft");

    const headerCall = mockRawQuery.mock.calls.find((c) =>
      String(c[0]).includes("INSERT INTO journal_entries"),
    );
    const params = headerCall?.[1] as any[];
    expect(params[7]).toBe("draft");
  });
});

describe("postJournalEntry — financial period close (H1)", () => {
  it("blocks a posted entry whose effective date lands in a closed period", async () => {
    setupAccountResolve(
      [
        { id: 100, code: "1100" },
        { id: 490, code: "4900" },
      ],
      1,
      { periodOpen: false },
    );
    const payload = buildSimpleEntry({
      description: "X",
      amount: 50,
      debitAccountId: 100,
      creditAccountId: 490,
    });
    await expect(
      postJournalEntry(payload, { companyId: 5, date: "2026-01-15" }),
    ).rejects.toThrow(/مغلقة/);
  });

  it("posts a posted entry when the period covering its date is open", async () => {
    setupAccountResolve(
      [
        { id: 100, code: "1100" },
        { id: 490, code: "4900" },
      ],
      8,
    );
    const payload = buildSimpleEntry({
      description: "X",
      amount: 50,
      debitAccountId: 100,
      creditAccountId: 490,
    });
    const r = await postJournalEntry(payload, { companyId: 5, date: "2026-06-01" });
    expect(r.status).toBe("posted");
    expect(r.journalEntryId).toBe(8);
  });

  it("exempts a draft entry from the period-close gate", async () => {
    // status:'draft' issues no period query — a draft is allowed even for a
    // date inside a closed period; the gate fires when the draft is posted.
    setupAccountResolve(
      [
        { id: 100, code: "1100" },
        { id: 490, code: "4900" },
      ],
      9,
      { skipPeriodCheck: true },
    );
    const payload = buildSimpleEntry({
      description: "X",
      amount: 50,
      debitAccountId: 100,
      creditAccountId: 490,
    });
    const r = await postJournalEntry(payload, {
      companyId: 5,
      date: "2026-01-15",
      status: "draft",
    });
    expect(r.status).toBe("draft");
  });
});
