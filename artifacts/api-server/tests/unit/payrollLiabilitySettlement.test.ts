import { describe, it, expect, vi, beforeEach } from "vitest";

// #2303 — FIN-PAYROLL-DEDUCTIONS-LOAN-INTEGRITY, settlement-on-payment leg.
//
// Executes postPayrollLiabilitySettlementGL against a mocked financial engine +
// db so we assert the REAL settlement journal it produces: DR the liability
// (GOSI 2140 / WHT 2132 / deductions 2150) / CR bank (1124), balanced to the
// cent, idempotent per (run, liability), and capped at the run's accrued
// balance (read from the accrual JE) so it can never over-debit the liability.

interface Line { accountCode: string; debit?: number; credit?: number; }
interface Payload {
  lines: Line[]; sourceKey: string; sourceType: string; postingDate?: string;
  guardTable?: string; guardId?: number; ref?: string;
}
const captured: { payload: Payload | null } = { payload: null };

// Test-controllable DB responses (the engine reads accrued from the accrual JE
// and checks for an existing settlement before posting).
const dbState: { accrued: string; existing: Array<{ id: number; journalEntryId: number | null }> } = {
  accrued: "0",
  existing: [],
};

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    // Return the fallback the engine passes (4th arg) so codes are deterministic:
    // gosi→2140, wht→2132, deductions→2150, payroll_bank_payout→1124.
    resolveAccountCode: vi.fn(
      async (_companyId: number, _op: string, _side: string, fallback: string) => fallback,
    ),
    postJournalEntry: vi.fn(async (payload: Payload) => {
      captured.payload = payload;
      return { journalId: 12345, sourceKey: payload.sourceKey, alreadyExists: false };
    }),
  },
}));
vi.mock("../../src/lib/eventBus.js", () => ({ registerCrossDomainHandler: vi.fn() }));
vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(async (sql: string) => {
    if (sql.includes("INSERT INTO payroll_liability_settlements")) return [{ id: 99 }];
    if (sql.includes("AS accrued")) return [{ accrued: dbState.accrued }];
    if (sql.includes("FROM payroll_liability_settlements")) return dbState.existing;
    return [];
  }),
  rawExecute: vi.fn(async () => ({ affectedRows: 0 })),
  withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { hrEngine } from "../../src/lib/engines/hrEngine.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = { companyId: 1, branchId: 1, createdBy: 1 } as any;
const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));

beforeEach(() => {
  captured.payload = null;
  dbState.accrued = "0";
  dbState.existing = [];
});

describe("postPayrollLiabilitySettlementGL — #2303 settlement (journal_lines)", () => {
  it("GOSI: posts DR 2140 / CR bank for the full accrued amount, balanced", async () => {
    dbState.accrued = "3360";
    const out = await hrEngine.postPayrollLiabilitySettlementGL(ctx, {
      runId: 1, period: "2026-06", liabilityType: "gosi", amount: 3360,
      paymentDate: "2026-07-10", referenceNumber: "GOSI-77",
    });

    const p = captured.payload!;
    expect(p).not.toBeNull();

    // DR the GOSI liability, CR the bank — balanced to the cent.
    const dr = p.lines.find((l) => (l.debit || 0) > 0)!;
    const cr = p.lines.find((l) => (l.credit || 0) > 0)!;
    expect(dr.accountCode).toBe("2140");
    expect(dr.debit).toBe(3360);
    expect(cr.accountCode).toBe("1124");
    expect(cr.credit).toBe(3360);
    expect(sumDebit(p.lines)).toBe(sumCredit(p.lines));

    // Idempotency key + traceability (so a re-submit dedupes, and the JE is
    // back-dated to the payment date for the period gate).
    expect(p.sourceKey).toBe("hr:liab_settle:gosi:1");
    expect(p.sourceType).toBe("payroll_liability_settlement");
    expect(p.guardTable).toBe("payroll_runs");
    expect(p.guardId).toBe(1);
    expect(p.postingDate).toBe("2026-07-10");

    expect(out).toMatchObject({ journalEntryId: 12345, settlementId: 99, alreadyExists: false, amount: 3360 });
  });

  it("WHT settles to 2132 and deductions settle to 2150", async () => {
    dbState.accrued = "1000";
    await hrEngine.postPayrollLiabilitySettlementGL(ctx, {
      runId: 5, period: "2026-06", liabilityType: "wht", amount: 400, paymentDate: "2026-07-10",
    });
    expect(captured.payload!.lines.find((l) => (l.debit || 0) > 0)!.accountCode).toBe("2132");
    expect(captured.payload!.sourceKey).toBe("hr:liab_settle:wht:5");

    captured.payload = null;
    dbState.accrued = "1000";
    await hrEngine.postPayrollLiabilitySettlementGL(ctx, {
      runId: 6, period: "2026-06", liabilityType: "deductions", amount: 50, paymentDate: "2026-07-10",
    });
    expect(captured.payload!.lines.find((l) => (l.debit || 0) > 0)!.accountCode).toBe("2150");
  });

  it("allows a partial remittance (≤ accrued) without over-debiting", async () => {
    dbState.accrued = "3360";
    await hrEngine.postPayrollLiabilitySettlementGL(ctx, {
      runId: 7, period: "2026-06", liabilityType: "gosi", amount: 1000, paymentDate: "2026-07-10",
    });
    const p = captured.payload!;
    expect(p.lines.find((l) => (l.debit || 0) > 0)!.debit).toBe(1000);
    expect(sumDebit(p.lines)).toBe(sumCredit(p.lines));
  });

  it("rejects a remittance that exceeds the accrued balance — never posts", async () => {
    dbState.accrued = "1000";
    await expect(
      hrEngine.postPayrollLiabilitySettlementGL(ctx, {
        runId: 2, period: "2026-06", liabilityType: "gosi", amount: 1500, paymentDate: "2026-07-10",
      }),
    ).rejects.toThrow(/يتجاوز المستحق/);
    expect(captured.payload).toBeNull();
  });

  it("rejects settlement when nothing was accrued — never posts", async () => {
    dbState.accrued = "0";
    await expect(
      hrEngine.postPayrollLiabilitySettlementGL(ctx, {
        runId: 3, period: "2026-06", liabilityType: "gosi", amount: 100, paymentDate: "2026-07-10",
      }),
    ).rejects.toThrow(/لا يوجد رصيد مستحق/);
    expect(captured.payload).toBeNull();
  });

  it("is idempotent — an existing settlement is returned without posting again", async () => {
    dbState.existing = [{ id: 7, journalEntryId: 555 }];
    const out = await hrEngine.postPayrollLiabilitySettlementGL(ctx, {
      runId: 1, period: "2026-06", liabilityType: "gosi", amount: 3360, paymentDate: "2026-07-10",
    });
    expect(out).toMatchObject({ journalEntryId: 555, settlementId: 7, alreadyExists: true });
    expect(captured.payload).toBeNull(); // no second JE posted
  });
});
