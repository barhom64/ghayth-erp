import { describe, it, expect, vi } from "vitest";

// Ledger assertion coverage for warehouseEngine.postMovementGL — inventory
// movements that post REAL valuation money per trigger but lacked a runtime
// journal_lines test. Each trigger maps to a specific DR/CR account pair on the
// inventory asset (1151) / GRNI (2115) / COGS (5110) / variance (5150) accounts;
// we execute every trigger against a capturing financial engine and assert the
// REAL produced accounts, the productId dimension, and debit==credit balance.

interface Line { accountCode: string; debit?: number; credit?: number; productId?: number; }
const captured: { lines: Line[] } = { lines: [] };

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: vi.fn(
      async (_c: number, _op: string, _s: string, fallback: string) => fallback,
    ),
    postJournalEntry: vi.fn(async (payload: { lines: Line[] }) => {
      captured.lines = payload.lines;
      return { journalId: 5151, alreadyExists: false };
    }),
  },
}));
// warehouseEngine imports these at module load (used by OTHER methods, not by
// postMovementGL); stub so the import resolves without a live DB.
vi.mock("../../src/lib/rawdb.js", () => ({
  withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
  rawExecute: vi.fn(async () => ({ affectedRows: 0 })),
  rawQuery: vi.fn(async () => []),
}));
vi.mock("../../src/lib/businessHelpers.js", () => ({
  checkFinancialPeriodOpen: vi.fn(async () => true),
  todayISO: () => "2026-06-01",
  roundTo2: (n: number) => Math.round(n * 100) / 100,
}));
vi.mock("../../src/lib/logger.js", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { warehouseEngine } from "../../src/lib/engines/warehouseEngine.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));
const debitFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.debit || 0), 0));
const creditFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.credit || 0), 0));

const ctx = { companyId: 1, branchId: 1, createdBy: 1 };

// Each inventory trigger and its expected DR/CR account pair.
const cases = [
  { trigger: "receipt", dr: "1151", cr: "2115" },        // مخزون / مستحقات استلام
  { trigger: "issue", dr: "5110", cr: "1151" },          // تكلفة مبيعات / مخزون
  { trigger: "variance_in", dr: "1151", cr: "5150" },    // مخزون / فائض جرد
  { trigger: "variance_out", dr: "5150", cr: "1151" },   // عجز جرد / مخزون
  { trigger: "adjustment_in", dr: "1151", cr: "5150" },  // تسوية زيادة
  { trigger: "adjustment_out", dr: "5150", cr: "1151" }, // تسوية نقص
] as const;

describe("warehouseEngine.postMovementGL — journal_lines per trigger", () => {
  it.each(cases)("$trigger: DR $dr / CR $cr, productId stamped, balanced", async ({ trigger, dr, cr }) => {
    captured.lines = [];
    await warehouseEngine.postMovementGL(ctx, {
      id: 1, trigger, totalValue: 4000, productId: 77, productName: "صنف",
    });
    const l = captured.lines;
    expect(debitFor(l, dr)).toBe(4000);
    expect(creditFor(l, cr)).toBe(4000);
    expect(l.every(x => x.productId === 77)).toBe(true);  // per-product GL drilldown
    expect(sumDebit(l)).toBe(sumCredit(l));
  });
});
