import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the rawdb + businessHelpers layer so we exercise the engine's
// guard logic without a real DB. We assert on what the engine THROWS
// or what it forwards downstream — never on SQL strings — which lets
// these tests live alongside the existing unit suite (no DB harness).
//
// `vi.hoisted` is required because vi.mock factory calls are hoisted
// above local `const` declarations — without hoisted(), the mock fns
// would be undefined at mock-evaluation time.

const mocks = vi.hoisted(() => ({
  rawQuery: vi.fn(),
  rawExecute: vi.fn(),
  createJournalEntry: vi.fn(),
  createGuardedJournalEntry: vi.fn(),
  checkFinancialPeriodOpen: vi.fn(),
  getAccountCodeFromMapping: vi.fn(),
  validateBudget: vi.fn(),
  updateBudgetUsed: vi.fn(),
}));

vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: mocks.rawQuery,
  rawExecute: mocks.rawExecute,
  withTransaction: vi.fn(async (fn: () => Promise<any>) => fn()),
  pool: { query: vi.fn(), connect: vi.fn() },
}));

vi.mock("../../src/lib/businessHelpers.js", () => ({
  createJournalEntry: mocks.createJournalEntry,
  createGuardedJournalEntry: mocks.createGuardedJournalEntry,
  checkFinancialPeriodOpen: mocks.checkFinancialPeriodOpen,
  getAccountCodeFromMapping: mocks.getAccountCodeFromMapping,
  validateBudget: mocks.validateBudget,
  updateBudgetUsed: mocks.updateBudgetUsed,
  todayISO: () => "2026-05-13",
}));

vi.mock("../../src/lib/eventBus.js", () => ({
  eventBus: { emit: vi.fn() },
}));

vi.mock("../../src/lib/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { financialEngine } from "../../src/lib/engines/financialEngine.js";

const rawQueryMock = mocks.rawQuery;
const rawExecuteMock = mocks.rawExecute;
const createJournalEntryMock = mocks.createJournalEntry;
const checkFinancialPeriodOpenMock = mocks.checkFinancialPeriodOpen;

beforeEach(() => {
  rawQueryMock.mockReset();
  rawExecuteMock.mockReset();
  createJournalEntryMock.mockReset();
  mocks.createGuardedJournalEntry.mockReset();
  checkFinancialPeriodOpenMock.mockReset();
  mocks.getAccountCodeFromMapping.mockReset();
});

function baseRequest(overrides: Partial<Parameters<typeof financialEngine.postJournalEntry>[0]> = {}) {
  return {
    companyId: 1,
    branchId: 1,
    createdBy: 1,
    ref: "TEST-001",
    description: "test",
    sourceType: "test",
    sourceId: 100,
    sourceKey: "finance:test:100",
    lines: [
      { accountCode: "1100", debit: 10, credit: 0 },
      { accountCode: "2100", debit: 0, credit: 10 },
    ],
    ...overrides,
  };
}

describe("financialEngine.postJournalEntry — sourceKey guards", () => {
  it("rejects missing sourceKey", async () => {
    await expect(
      financialEngine.postJournalEntry(baseRequest({ sourceKey: "" }))
    ).rejects.toThrow(/sourceKey is required/);
  });

  it("rejects a sourceKey containing a 13-digit Date.now timestamp", async () => {
    // 1762000000000 = a millisecond value in 2025 — exact shape of Date.now()
    await expect(
      financialEngine.postJournalEntry(
        baseRequest({ sourceKey: "finance:expense:1762000000000" })
      )
    ).rejects.toThrow(/looks volatile/);
  });

  it("rejects a sourceKey ending in a 13-digit timestamp after a hyphen", async () => {
    await expect(
      financialEngine.postJournalEntry(
        baseRequest({ sourceKey: "finance:custody:CUSTODY-1762000000000" })
      )
    ).rejects.toThrow(/looks volatile/);
  });

  it("accepts a UUID-shaped sourceKey", async () => {
    rawQueryMock.mockResolvedValueOnce([]); // no existing journal
    checkFinancialPeriodOpenMock.mockResolvedValueOnce({ open: true, periodName: "May 2026" });
    createJournalEntryMock.mockResolvedValueOnce(42);

    const result = await financialEngine.postJournalEntry(
      baseRequest({ sourceKey: "finance:expense:550e8400-e29b-41d4-a716-446655440000" })
    );
    expect(result.journalId).toBe(42);
    expect(result.alreadyExists).toBe(false);
  });

  it("accepts a sourceKey containing a short id (not a timestamp)", async () => {
    rawQueryMock.mockResolvedValueOnce([]);
    checkFinancialPeriodOpenMock.mockResolvedValueOnce({ open: true });
    createJournalEntryMock.mockResolvedValueOnce(7);

    const result = await financialEngine.postJournalEntry(
      baseRequest({ sourceKey: "finance:grn:12345" })
    );
    expect(result.journalId).toBe(7);
  });
});

describe("financialEngine.postJournalEntry — idempotency replay", () => {
  it("returns alreadyExists=true and skips period check when the sourceKey hits", async () => {
    rawQueryMock.mockResolvedValueOnce([{ id: 99 }]); // existing journal

    const result = await financialEngine.postJournalEntry(baseRequest());

    expect(result).toEqual({
      journalId: 99,
      sourceKey: "finance:test:100",
      alreadyExists: true,
    });
    // Period check is bypassed on replay — only the existence lookup runs.
    expect(checkFinancialPeriodOpenMock).not.toHaveBeenCalled();
    expect(createJournalEntryMock).not.toHaveBeenCalled();
  });

  it("returns alreadyExists=false on a fresh post", async () => {
    rawQueryMock.mockResolvedValueOnce([]); // no existing
    checkFinancialPeriodOpenMock.mockResolvedValueOnce({ open: true });
    createJournalEntryMock.mockResolvedValueOnce(123);

    const result = await financialEngine.postJournalEntry(baseRequest());

    expect(result.alreadyExists).toBe(false);
    expect(result.journalId).toBe(123);
  });
});

describe("financialEngine.postJournalEntry — period check uses postingDate", () => {
  it("passes postingDate to checkFinancialPeriodOpen when supplied", async () => {
    rawQueryMock.mockResolvedValueOnce([]);
    checkFinancialPeriodOpenMock.mockResolvedValueOnce({ open: true });
    createJournalEntryMock.mockResolvedValueOnce(1);

    await financialEngine.postJournalEntry(
      baseRequest({ postingDate: "2026-01-15" })
    );

    expect(checkFinancialPeriodOpenMock).toHaveBeenCalledWith(1, "2026-01-15");
  });

  it("falls back to today when postingDate is omitted", async () => {
    rawQueryMock.mockResolvedValueOnce([]);
    checkFinancialPeriodOpenMock.mockResolvedValueOnce({ open: true });
    createJournalEntryMock.mockResolvedValueOnce(1);

    await financialEngine.postJournalEntry(baseRequest());

    expect(checkFinancialPeriodOpenMock).toHaveBeenCalledWith(1, "2026-05-13");
  });

  it("rejects a posting when the resolved period is closed", async () => {
    rawQueryMock.mockResolvedValueOnce([]);
    checkFinancialPeriodOpenMock.mockResolvedValueOnce({ open: false, periodName: "Q1 2025" });

    await expect(financialEngine.postJournalEntry(baseRequest())).rejects.toThrow(
      /Q1 2025/
    );
    expect(createJournalEntryMock).not.toHaveBeenCalled();
  });
});

describe("financialEngine.postJournalEntry — headerMeta + status follow-up UPDATE", () => {
  it("issues a follow-up UPDATE when headerMeta is supplied", async () => {
    rawQueryMock.mockResolvedValueOnce([]);
    checkFinancialPeriodOpenMock.mockResolvedValueOnce({ open: true });
    createJournalEntryMock.mockResolvedValueOnce(55);
    rawExecuteMock.mockResolvedValueOnce({ affectedRows: 1 });

    await financialEngine.postJournalEntry(
      baseRequest({
        status: "posted",
        headerMeta: { costCenter: "RYD-001", isManual: true },
      })
    );

    expect(rawExecuteMock).toHaveBeenCalledTimes(1);
    const [sql, params] = rawExecuteMock.mock.calls[0];
    expect(sql).toMatch(/UPDATE journal_entries SET/);
    expect(sql).toContain('status = $1');
    expect(sql).toContain('"costCenter"');
    expect(sql).toContain('"isManual"');
    expect(params).toContain("posted");
    expect(params).toContain("RYD-001");
    expect(params).toContain(true);
  });

  it("skips the follow-up UPDATE when there are no overrides to apply", async () => {
    rawQueryMock.mockResolvedValueOnce([]);
    checkFinancialPeriodOpenMock.mockResolvedValueOnce({ open: true });
    createJournalEntryMock.mockResolvedValueOnce(55);

    await financialEngine.postJournalEntry(baseRequest());

    expect(rawExecuteMock).not.toHaveBeenCalled();
  });

  it("treats 'draft' status as a no-op (DB default already wins)", async () => {
    rawQueryMock.mockResolvedValueOnce([]);
    checkFinancialPeriodOpenMock.mockResolvedValueOnce({ open: true });
    createJournalEntryMock.mockResolvedValueOnce(55);

    await financialEngine.postJournalEntry(baseRequest({ status: "draft" }));

    expect(rawExecuteMock).not.toHaveBeenCalled();
  });
});

describe("financialEngine.appendRoundingAdjustment", () => {
  it("rejects a zero rounding amount", async () => {
    await expect(
      financialEngine.appendRoundingAdjustment({
        companyId: 1,
        journalEntryId: 10,
        amount: 0,
      })
    ).rejects.toThrow(/مختلفاً عن الصفر/);
  });

  it("rejects a rounding amount > 0.05", async () => {
    await expect(
      financialEngine.appendRoundingAdjustment({
        companyId: 1,
        journalEntryId: 10,
        amount: 0.06,
      })
    ).rejects.toThrow(/يتجاوز الحد المسموح/);
  });

  it("rejects when the rounding account 9999 is missing", async () => {
    rawQueryMock.mockResolvedValueOnce([]); // no 9999 row
    await expect(
      financialEngine.appendRoundingAdjustment({
        companyId: 1,
        journalEntryId: 10,
        amount: 0.03,
      })
    ).rejects.toThrow(/فروقات التقريب/);
  });

  it("rejects when the journal entry is in a different company", async () => {
    rawQueryMock.mockResolvedValueOnce([{ code: "9999" }]); // rounding acct found
    rawQueryMock.mockResolvedValueOnce([]); // JE not found in this company

    await expect(
      financialEngine.appendRoundingAdjustment({
        companyId: 1,
        journalEntryId: 10,
        amount: 0.03,
      })
    ).rejects.toThrow(/القيد اليومي غير موجود/);
  });

  it("inserts a debit line when the diff is positive", async () => {
    rawQueryMock.mockResolvedValueOnce([{ code: "9999" }]);
    rawQueryMock.mockResolvedValueOnce([{ id: 10 }]);
    rawExecuteMock.mockResolvedValueOnce({ affectedRows: 1 });

    const result = await financialEngine.appendRoundingAdjustment({
      companyId: 1,
      journalEntryId: 10,
      amount: 0.03,
    });

    expect(result).toEqual({ applied: 0.03 });
    const [sql, params] = rawExecuteMock.mock.calls[0];
    expect(sql).toContain("INSERT INTO journal_lines");
    expect(params).toEqual([10, 0.03, 0, "فرق تقريب تلقائي"]);
  });

  it("inserts a credit line when the diff is negative", async () => {
    rawQueryMock.mockResolvedValueOnce([{ code: "9999" }]);
    rawQueryMock.mockResolvedValueOnce([{ id: 10 }]);
    rawExecuteMock.mockResolvedValueOnce({ affectedRows: 1 });

    const result = await financialEngine.appendRoundingAdjustment({
      companyId: 1,
      journalEntryId: 10,
      amount: -0.02,
    });

    expect(result).toEqual({ applied: -0.02 });
    const params = rawExecuteMock.mock.calls[0][1];
    expect(params).toEqual([10, 0, 0.02, "فرق تقريب تلقائي"]);
  });

  it("uses the caller-supplied description when provided", async () => {
    rawQueryMock.mockResolvedValueOnce([{ code: "9999" }]);
    rawQueryMock.mockResolvedValueOnce([{ id: 10 }]);
    rawExecuteMock.mockResolvedValueOnce({ affectedRows: 1 });

    await financialEngine.appendRoundingAdjustment({
      companyId: 1,
      journalEntryId: 10,
      amount: 0.01,
      description: "rounding from invoice #7",
    });

    expect(rawExecuteMock.mock.calls[0][1][3]).toBe("rounding from invoice #7");
  });
});
