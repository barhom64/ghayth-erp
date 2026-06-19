import { describe, it, expect, vi, beforeEach } from "vitest";

// HR-002 — payroll posting atomicity. postPayrollRunWithGL must flip the run to
// 'posted' AND post the payment JE (DR salary_payable 2120 / CR bank 1124) in
// ONE transaction: on a GL failure the whole unit rolls back so a run can never
// be left 'posted' without its settlement entry. Asserts the REAL journal lines
// the payment leg produces + the rollback-on-failure contract.

interface Line { accountCode: string; debit?: number; credit?: number; }
interface Payload {
  lines: Line[]; sourceKey: string; sourceType: string;
  guardTable?: string; guardId?: number; ref?: string;
}

const captured: { payload: Payload | null } = { payload: null };
const dbState: { updateReturns: Array<Record<string, unknown>>; postThrows: boolean } = {
  updateReturns: [],
  postThrows: false,
};
// Emulated transaction outcome so the atomicity assertion is real.
const tx = { committed: false, rolledBack: false };

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    // Return the fallback (4th arg) so codes are deterministic:
    // salary_payable→2120, payroll_bank_payout→1124.
    resolveAccountCode: vi.fn(
      async (_companyId: number, _op: string, _side: string, fallback: string) => fallback,
    ),
    postJournalEntry: vi.fn(async (payload: Payload) => {
      // Simulate a downstream failure (e.g. a closed financial period) AFTER
      // the status flip already happened inside the same transaction.
      if (dbState.postThrows) {
        throw new Error('الفترة المالية "2026-06" مغلقة — لا يمكن ترحيل قيد محاسبي');
      }
      captured.payload = payload;
      return { journalId: 9001, sourceKey: payload.sourceKey, alreadyExists: false };
    }),
  },
}));
vi.mock("../../src/lib/eventBus.js", () => ({ registerCrossDomainHandler: vi.fn() }));
vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(async (sql: string) => {
    if (sql.includes("UPDATE payroll_runs")) return dbState.updateReturns;
    return [];
  }),
  rawExecute: vi.fn(async () => ({ insertId: 0, affectedRows: 0 })),
  // Emulate commit/rollback: if the callback throws, the "transaction" is rolled
  // back (the status flip the callback issued never persists). This is what the
  // real reentrant withTransaction guarantees via BEGIN/COMMIT/ROLLBACK.
  withTransaction: vi.fn(async (fn: (c: unknown) => Promise<unknown>) => {
    try {
      const r = await fn({});
      tx.committed = true;
      return r;
    } catch (e) {
      tx.rolledBack = true;
      throw e;
    }
  }),
}));

import { hrEngine } from "../../src/lib/engines/hrEngine.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { companyId: 1, branchId: 1, createdBy: 1 } as any;
const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));

beforeEach(() => {
  captured.payload = null;
  dbState.updateReturns = [];
  dbState.postThrows = false;
  tx.committed = false;
  tx.rolledBack = false;
});

describe("postPayrollRunWithGL — HR-002 atomicity (status flip + payment JE)", () => {
  it("posts DR salary_payable(2120) / CR bank(1124) balanced, flips status, commits", async () => {
    dbState.updateReturns = [{ id: 10, status: "posted", period: "2026-06" }];

    const run = await hrEngine.postPayrollRunWithGL(ctx, {
      runId: 10, period: "2026-06", totalBankPayout: 5000, fromStatus: "completed",
    });

    expect(run).toMatchObject({ id: 10, status: "posted" });

    // The payment leg: DR the salary-payable liability, CR the bank — balanced.
    const p = captured.payload!;
    expect(p).not.toBeNull();
    const dr = p.lines.find((l) => (l.debit || 0) > 0)!;
    const cr = p.lines.find((l) => (l.credit || 0) > 0)!;
    expect(dr.accountCode).toBe("2120");
    expect(dr.debit).toBe(5000);
    expect(cr.accountCode).toBe("1124");
    expect(cr.credit).toBe(5000);
    expect(sumDebit(p.lines)).toBe(sumCredit(p.lines));

    // Idempotency + traceability so a retry dedupes against the same run.
    expect(p.sourceKey).toBe("hr:payroll_post:10");
    expect(p.guardTable).toBe("payroll_runs");
    expect(p.guardId).toBe(10);

    expect(tx.committed).toBe(true);
    expect(tx.rolledBack).toBe(false);
  });

  it("ATOMICITY: a GL failure rolls back the status flip — no posted-without-entry", async () => {
    dbState.updateReturns = [{ id: 11, status: "posted", period: "2026-06" }];
    dbState.postThrows = true; // e.g. the financial period is closed

    await expect(
      hrEngine.postPayrollRunWithGL(ctx, {
        runId: 11, period: "2026-06", totalBankPayout: 5000, fromStatus: "completed",
      }),
    ).rejects.toThrow(/مغلقة/);

    // The transaction rolled back → the status flip never persisted, so the run
    // stays retryable instead of being stranded 'posted' with no entry.
    expect(tx.committed).toBe(false);
    expect(tx.rolledBack).toBe(true);
  });

  it("no row matched the expected status → returns null, posts NO journal entry", async () => {
    dbState.updateReturns = []; // concurrent post / vanished run

    const run = await hrEngine.postPayrollRunWithGL(ctx, {
      runId: 12, period: "2026-06", totalBankPayout: 5000, fromStatus: "completed",
    });

    expect(run).toBeNull();
    expect(captured.payload).toBeNull(); // never reached the GL post
  });

  it("zero net payout → status flips but no settlement JE is posted", async () => {
    dbState.updateReturns = [{ id: 13, status: "posted", period: "2026-06" }];

    const run = await hrEngine.postPayrollRunWithGL(ctx, {
      runId: 13, period: "2026-06", totalBankPayout: 0, fromStatus: "completed",
    });

    expect(run).toMatchObject({ id: 13 });
    expect(captured.payload).toBeNull(); // amount <= 0 → postPayrollPostGL returns null
    expect(tx.committed).toBe(true);
  });
});
