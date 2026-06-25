import { describe, it, expect, vi } from "vitest";

// Ledger assertion coverage for the 5 fleetEngine GL methods that post REAL
// money but lacked a runtime journal_lines test (the others — accident, cargo,
// fuel, maintenance, violation-payment — are already covered, incl. #2863).
// Executes each against a capturing financial engine and asserts the REAL
// produced accounts, the vehicle/driver dimensions, and debit==credit balance.
// rawQuery is stubbed empty so the per-vehicle subsidiary lookups return null
// and the standard fleet COA leaves are used (the production fallback path).

interface Line {
  accountCode: string; debit?: number; credit?: number;
  vehicleId?: number; driverId?: number; costCenterId?: number;
}
const captured: { lines: Line[] } = { lines: [] };

vi.mock("../../src/lib/engines/financialEngine.js", () => ({
  financialEngine: {
    resolveAccountCode: vi.fn(
      async (_c: number, _op: string, _s: string, fallback: string) => fallback,
    ),
    postJournalEntry: vi.fn(async (payload: { lines: Line[] }) => {
      captured.lines = payload.lines;
      return { journalId: 6161, alreadyExists: false };
    }),
  },
}));
vi.mock("../../src/lib/eventBus.js", () => ({
  eventBus: { emit: vi.fn(), on: vi.fn(), publish: vi.fn() },
  registerCrossDomainHandler: vi.fn(),
}));
vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(async () => []),
  rawExecute: vi.fn(async () => ({ affectedRows: 0 })),
  withTransaction: vi.fn(async (fn: () => Promise<unknown>) => fn()),
}));
vi.mock("../../src/lib/businessHelpers.js", () => ({
  emitEvent: vi.fn(),
  roundTo2: (n: number) => Math.round(n * 100) / 100,
  checkFinancialPeriodOpen: vi.fn(async () => true),
  todayISO: () => "2026-06-01",
}));

import { fleetEngine } from "../../src/lib/engines/fleetEngine.js";

const round2 = (n: number) => Math.round(n * 100) / 100;
const sumDebit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.debit || 0), 0));
const sumCredit = (ls: Line[]) => round2(ls.reduce((s, l) => s + (l.credit || 0), 0));
const debitFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.debit || 0), 0));
const creditFor = (ls: Line[], code: string) =>
  round2(ls.filter(l => l.accountCode === code).reduce((s, l) => s + (l.credit || 0), 0));

const ctx = { companyId: 1, branchId: 1, createdBy: 1 };

describe("fleetEngine GL postings — journal_lines (uncovered methods)", () => {
  it("postInsuranceGL: DR 1172 prepaid-insurance / CR 1111 cash, vehicleId stamped, balanced", async () => {
    captured.lines = [];
    await fleetEngine.postInsuranceGL(ctx, { id: 1, vehicleId: 50, premium: 12000 });
    const l = captured.lines;
    expect(debitFor(l, "1172")).toBe(12000);
    expect(creditFor(l, "1111")).toBe(12000);
    expect(l.every(x => x.vehicleId === 50)).toBe(true);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postTrafficViolationGL: DR 5560 fines-expense / CR 2157 fines-payable, vehicle+driver stamped, balanced", async () => {
    captured.lines = [];
    await fleetEngine.postTrafficViolationGL(ctx, { id: 2, vehicleId: 50, driverId: 9, amount: 500 });
    const l = captured.lines;
    expect(debitFor(l, "5560")).toBe(500);
    expect(creditFor(l, "2157")).toBe(500);
    expect(l.every(x => x.vehicleId === 50)).toBe(true);
    expect(l.find(x => x.accountCode === "5560")?.driverId).toBe(9);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postVehicleAssetGL: DR 1210 vehicle-asset / CR 1111 cash, vehicleId on the asset leg, balanced", async () => {
    captured.lines = [];
    await fleetEngine.postVehicleAssetGL(ctx, { id: 3, purchasePrice: 90000, plateNumber: "ABC123" });
    const l = captured.lines;
    expect(debitFor(l, "1210")).toBe(90000);
    expect(creditFor(l, "1111")).toBe(90000);
    expect(l.find(x => x.accountCode === "1210")?.vehicleId).toBe(3);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postTripGL: DR 5140 trip-expense / CR 2111 trip-payable, vehicle+driver, balanced", async () => {
    captured.lines = [];
    await fleetEngine.postTripGL(ctx, { id: 4, vehicleId: 50, totalCost: 800, driverId: 9 });
    const l = captured.lines;
    expect(debitFor(l, "5140")).toBe(800);
    expect(creditFor(l, "2111")).toBe(800);
    expect(l.every(x => x.vehicleId === 50)).toBe(true);
    expect(sumDebit(l)).toBe(sumCredit(l));
  });

  it("postTripGL: returns null and posts nothing when totalCost <= 0", async () => {
    captured.lines = [];
    const r = await fleetEngine.postTripGL(ctx, { id: 5, vehicleId: 50, totalCost: 0 });
    expect(r).toBeNull();
    expect(captured.lines.length).toBe(0);
  });

  it("postTripCompletionGL: DR 5510 fuel + 5140 fare + 5710 dep / CR 1111 cash, balanced to total", async () => {
    captured.lines = [];
    await fleetEngine.postTripCompletionGL(ctx, {
      id: 6, vehicleId: 50, fuelCost: 300, driverFare: 200, depreciation: 100, totalCost: 600,
    });
    const l = captured.lines;
    expect(debitFor(l, "5510")).toBe(300);  // fuel
    expect(debitFor(l, "5140")).toBe(200);  // driver fare
    expect(debitFor(l, "5710")).toBe(100);  // depreciation
    expect(creditFor(l, "1111")).toBe(600); // cash
    expect(sumDebit(l)).toBe(sumCredit(l));
  });
});
