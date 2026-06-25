import { describe, it, expect, vi } from "vitest";

// Ledger assertion coverage for umrahEngine GL methods — agent invoice, penalty,
// penalty waiver (reversal), transport expense. They post REAL money but lacked
// a runtime journal_lines test. Executes each against a capturing financial
// engine and asserts the REAL produced accounts, the umrahAgentId/umrahSeasonId/
// vehicle/driver dimensions, and debit==credit balance. (Engine logic untouched —
// documents current behavior; the active umrah work is in routes/UI, not here.)

interface Line {
  accountCode: string; debit?: number; credit?: number;
  umrahAgentId?: number; umrahSeasonId?: number; vehicleId?: number; driverId?: number;
}
const captured: { lines: Line[] } = { lines: [] };

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: vi.fn(
      async (_c: number, _op: string, _s: string, fallback: string) => fallback,
    ),
    postJournalEntry: vi.fn(async (payload: { lines: Line[] }) => {
      captured.lines = payload.lines;
      return { journalId: 7070, alreadyExists: false };
    }),
  },
}));
vi.mock("../../src/lib/rawdb.js", () => ({
  rawExecute: vi.fn(async () => ({ affectedRows: 1 })),
  rawQuery: vi.fn(async () => []),
  withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));

import { umrahEngine } from "../../src/lib/engines/umrahEngine.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));
const debitFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.debit || 0), 0));
const creditFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.credit || 0), 0));

const ctx = { companyId: 1, branchId: 1, createdBy: 1 };

describe("umrahEngine GL postings — journal_lines", () => {
  it("postAgentInvoiceGL: DR 1210 AR + 5240 commission / CR 4130 revenue + 4930 penalty, agent stamped, balanced", async () => {
    captured.lines = [];
    // AR (total) is net of commission: 10000 services + 500 penalties − 800 commission = 9700
    await umrahEngine.postAgentInvoiceGL(ctx, {
      id: 1, ref: "AG-1", agentName: "وكيل", agentId: 42,
      total: 9700, servicesTotal: 10000, penaltiesTotal: 500, commission: 800,
    });
    const l = captured.lines;
    expect(debitFor(l, "1210")).toBe(9700);   // agent receivable (net)
    expect(debitFor(l, "5240")).toBe(800);    // commission expense
    expect(creditFor(l, "4130")).toBe(10000); // services revenue
    expect(creditFor(l, "4930")).toBe(500);   // penalty revenue
    expect(l.every(x => x.umrahAgentId === 42)).toBe(true);  // agent dim on EVERY line
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postAgentInvoiceGL: omits penalty + commission legs when those totals are 0", async () => {
    captured.lines = [];
    await umrahEngine.postAgentInvoiceGL(ctx, {
      id: 2, ref: "AG-2", agentName: "وكيل", agentId: 7,
      total: 6000, servicesTotal: 6000, penaltiesTotal: 0, commission: 0,
    });
    const l = captured.lines;
    expect(debitFor(l, "1210")).toBe(6000);
    expect(creditFor(l, "4130")).toBe(6000);
    expect(creditFor(l, "4930")).toBe(0);   // no penalty line
    expect(debitFor(l, "5240")).toBe(0);    // no commission line
    expect(l.length).toBe(2);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postPenaltyGL: DR 1220 penalty-receivable / CR 4930 penalty-revenue, agent+season stamped, balanced", async () => {
    captured.lines = [];
    await umrahEngine.postPenaltyGL(ctx, {
      id: 3, amount: 1500, pilgrimName: "حاج", type: "تأخر", agentId: 42, seasonId: 9,
    });
    const l = captured.lines;
    expect(debitFor(l, "1220")).toBe(1500);
    expect(creditFor(l, "4930")).toBe(1500);
    expect(l.every(x => x.umrahAgentId === 42)).toBe(true);
    expect(l.every(x => x.umrahSeasonId === 9)).toBe(true);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postPenaltyWaiverGL: reverses the penalty — DR 4930 revenue / CR 1220 receivable, balanced", async () => {
    captured.lines = [];
    await umrahEngine.postPenaltyWaiverGL(ctx, { id: 3, amount: 1500, pilgrimName: "حاج", agentId: 42, seasonId: 9 });
    const l = captured.lines;
    expect(debitFor(l, "4930")).toBe(1500);   // reverse the revenue
    expect(creditFor(l, "1220")).toBe(1500);  // clear the receivable
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postTransportExpenseGL: DR 5140 transport-expense / CR 2150 payable, vehicle/driver/season stamped, balanced", async () => {
    captured.lines = [];
    await umrahEngine.postTransportExpenseGL(ctx, {
      id: 4, cost: 2200, fromLocation: "جدة", toLocation: "مكة", vehicleId: 5, driverId: 9, umrahSeasonId: 3,
    });
    const l = captured.lines;
    expect(debitFor(l, "5140")).toBe(2200);
    expect(creditFor(l, "2150")).toBe(2200);
    expect(l.every(x => x.vehicleId === 5)).toBe(true);
    expect(l.every(x => x.umrahSeasonId === 3)).toBe(true);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });
});
