import { describe, it, expect, vi } from "vitest";

// FIN-HR-LEAVE-ACCRUAL-ACCOUNT — ledger assertion for the monthly-accrual fix.
//
// Executes postMonthlyAccrualsGL with a mocked financial engine that CAPTURES
// the journal payload, so we assert on the REAL produced journal_lines — not
// just source substrings. Proves the fix Ibrahim approved:
//   • leave-accrual LIABILITY now honours finance's controllable mapping
//     `leave_accrual_liability` → 2150 «مصروفات مستحقة الدفع» (migration 365 /
//     #2277), instead of the hr_-prefixed key that was seeded nowhere and
//     silently fell back to 2220, bypassing finance's pinned account.
//   • EOS-accrual liability is UNCHANGED — stays on its long-term-provision
//     account 2220.
//   • The entry still balances to the cent.

interface Line {
  accountCode: string; debit?: number; credit?: number;
}
const captured: { lines: Line[] } = { lines: [] };

// resolveAccountCode mirrors production: finance SEEDS leave_accrual_liability
// → 2150 (migration 365), so the mock returns 2150 for that op; every other op
// echoes the fallback the engine passes (4th arg) so codes stay deterministic.
vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: vi.fn(
      async (_companyId: number, op: string, _side: string, fallback: string) =>
        op === "leave_accrual_liability" ? "2150" : fallback,
    ),
    postJournalEntry: vi.fn(async (payload: { lines: Line[] }) => {
      captured.lines = payload.lines;
      return { journalId: 12345, alreadyExists: false };
    }),
  },
}));
// Isolate import-time side effects (cross-domain handler registration + DB).
vi.mock("../../src/lib/eventBus.js", () => ({ registerCrossDomainHandler: vi.fn() }));
vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(async () => []),
  rawExecute: vi.fn(async () => ({ affectedRows: 0 })),
  withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { hrEngine } from "../../src/lib/engines/hrEngine.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));
const creditFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.credit || 0), 0));
const debitFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.debit || 0), 0));

const ctx = { companyId: 1, branchId: 1, createdBy: 1 };

describe("postMonthlyAccrualsGL — leave-accrual liability account (journal_lines)", () => {
  it("routes leave liability to finance's 2150 and EOS to 2220, balanced", async () => {
    captured.lines = [];
    await hrEngine.postMonthlyAccrualsGL(ctx, {
      ref: "JE-ACC-2026-06",
      period: "2026-06",
      totalLeaveAccrual: 1000,
      totalEosAccrual: 500,
      employeeCount: 7,
    });
    const lines = captured.lines;

    // Leave liability lands on 2150 (finance's pinned mapping) — NOT 2220.
    expect(creditFor(lines, "2150")).toBe(1000);
    // EOS liability is unchanged: its own long-term-provision account 2220.
    expect(creditFor(lines, "2220")).toBe(500);
    // The leave amount must NOT leak onto 2220 (the bypassed account).
    expect(creditFor(lines, "2220")).not.toBe(1500);
    // Expense legs unchanged.
    expect(debitFor(lines, "5270")).toBe(1000);
    expect(debitFor(lines, "5260")).toBe(500);
    // Entry balances to the cent.
    expect(sumDebit(lines)).toBe(sumCredit(lines));
  });

  it("falls back to 2150 (not 2220) for leave liability when finance mapping is absent", async () => {
    captured.lines = [];
    // Simulate a company with NO seeded mapping: resolveAccountCode echoes the
    // fallback the engine passes for EVERY op. The fix sets that fallback to
    // 2150, so the leave liability still lands on 2150 — never the old 2220.
    const fe = (await import("../../src/lib/engines/financialEngine.js")).financialEngine;
    (fe.resolveAccountCode as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (_c: number, _op: string, _s: string, fb: string) => fb,
    ).mockImplementation(
      async (_c: number, _op: string, _s: string, fb: string) => fb,
    );

    await hrEngine.postMonthlyAccrualsGL(ctx, {
      ref: "JE-ACC-2026-07",
      period: "2026-07",
      totalLeaveAccrual: 800,
      totalEosAccrual: 0,
      employeeCount: 4,
    });
    const lines = captured.lines;
    expect(creditFor(lines, "2150")).toBe(800);
    expect(creditFor(lines, "2220")).toBe(0);
    expect(sumDebit(lines)).toBe(sumCredit(lines));
  });
});
