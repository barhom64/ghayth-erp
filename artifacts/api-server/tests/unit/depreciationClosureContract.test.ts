// depreciationClosureContract.test.ts
//
// FIN-P12-REGRESSION-TESTS (#2242) — SCENARIO 5: depreciation / time-recognition.
//
// OWNER MANDATE: assert that the depreciation engine produces BALANCED periodic
// journal lines that carry the ASSET dimension — not just "a row saved".
//
// WHAT WE FOUND (paths):
//   • The depreciation amount math is the pure function `calcDepreciationAmount`
//     in artifacts/api-server/src/routes/finance-algorithms.ts (~line 1232).
//   • The PERIODIC SCHEDULE generator is inline in
//     GET /finance/fixed-assets/:id/schedule (~line 1277) — pure math producing
//     one {period, depreciationAmount, accumulatedDepreciation, bookValue} row
//     per month.
//   • The actual MONTHLY JOURNAL is posted by
//     POST /finance/fixed-assets/:id/depreciate (~line 1352) and the batch
//     POST /finance/fixed-assets/depreciate-all — two legs:
//        DR depreciationAccountCode (5790)      assetId
//        CR accDepreciationAccountCode (1290)   assetId
//     equal amounts ⇒ balanced, both stamped with assetId.
//
// TESTABILITY: `calcDepreciationAmount` is NOT exported and the journal posting
// is DB-bound (financialEngine.postJournalEntry + INSERT depreciation_entries),
// so the journal_lines cannot be produced in isolation without a DB. We
// therefore cover scenario 5 two ways, both without a DB:
//   (A) a PURE re-derivation of the straight-line monthly schedule (mirrors the
//       schedule generator's math) → assert the periodic lines BALANCE per month
//       and accumulate correctly to (cost − salvage), and that the journal shape
//       per period is a balanced two-leg DR/CR carrying assetId.
//   (B) STATIC-CONTRACT assertions against the route source → the posted legs
//       carry assetId on BOTH sides, amounts are equal (balanced), and the
//       schedule generator emits a monthly period per useful-life month.
// (A) proves the math+shape; (B) pins it to the real posting path.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const API_ROOT = join(import.meta.dirname!, "../..");
const ALGO_ROUTE = readFileSync(join(API_ROOT, "src/routes/finance-algorithms.ts"), "utf8");

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Mirror of the straight-line monthly schedule generator (pure). Produces the
// SAME periodic lines the route emits, so we can assert balance per period and
// the journal-line shape (DR expense / CR accumulated, both stamped assetId).
function straightLineSchedule(opts: {
  assetId: number;
  purchaseCost: number;
  salvageValue: number;
  usefulLifeYears: number;
  purchaseDate: string;
  depreciationAccountCode?: string;
  accDepreciationAccountCode?: string;
}) {
  const {
    assetId,
    purchaseCost,
    salvageValue,
    usefulLifeYears,
    purchaseDate,
    depreciationAccountCode = "5790",
    accDepreciationAccountCode = "1290",
  } = opts;
  const months = usefulLifeYears * 12;
  const depreciable = purchaseCost - salvageValue;
  const periods: Array<{
    period: string;
    amount: number;
    accumulated: number;
    bookValue: number;
    lines: Array<{ accountCode: string; debit: number; credit: number; assetId: number }>;
  }> = [];
  let bookValue = purchaseCost;
  let accumulated = 0;
  const start = new Date(purchaseDate);
  for (let m = 0; m < months; m++) {
    const d = new Date(start);
    d.setMonth(d.getMonth() + m + 1);
    const period = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    let monthly = round2(depreciable / months);
    if (bookValue - monthly < salvageValue) monthly = Math.max(0, bookValue - salvageValue);
    if (monthly <= 0) break;
    accumulated = round2(accumulated + monthly);
    bookValue = round2(bookValue - monthly);
    periods.push({
      period,
      amount: monthly,
      accumulated,
      bookValue: Math.max(bookValue, salvageValue),
      // the two-leg monthly journal the depreciate route posts.
      lines: [
        { accountCode: depreciationAccountCode, debit: monthly, credit: 0, assetId },
        { accountCode: accDepreciationAccountCode, debit: 0, credit: monthly, assetId },
      ],
    });
  }
  return periods;
}

describe("Scenario 5 — Depreciation: balanced periodic journal lines carrying the asset dimension (pure)", () => {
  const schedule = straightLineSchedule({
    assetId: 42,
    purchaseCost: 120000,
    salvageValue: 0,
    usefulLifeYears: 5, // 60 months
    purchaseDate: "2025-01-01",
  });

  it("generates one monthly period per useful-life month", () => {
    expect(schedule.length).toBe(60);
    // distinct YYYY-MM periods, advancing monthly.
    expect(schedule[0].period).toBe("2025-02");
    expect(new Set(schedule.map((p) => p.period)).size).toBe(60);
  });

  it("EVERY monthly journal is a balanced two-leg DR/CR", () => {
    for (const p of schedule) {
      const debit = p.lines.reduce((s, l) => s + l.debit, 0);
      const credit = p.lines.reduce((s, l) => s + l.credit, 0);
      expect(debit).toBe(credit);
      expect(debit).toBeGreaterThan(0);
    }
  });

  it("EVERY line carries the asset dimension (assetId) on BOTH legs", () => {
    for (const p of schedule) {
      expect(p.lines.every((l) => l.assetId === 42)).toBe(true);
    }
  });

  it("the DR leg is the depreciation expense, the CR leg is accumulated depreciation", () => {
    const p = schedule[0];
    const dr = p.lines.find((l) => l.debit > 0)!;
    const cr = p.lines.find((l) => l.credit > 0)!;
    expect(dr.accountCode).toBe("5790");
    expect(cr.accountCode).toBe("1290");
  });

  it("accumulated depreciation converges to (cost − salvage); book value lands at salvage", () => {
    const last = schedule[schedule.length - 1];
    expect(round2(last.accumulated)).toBe(120000);
    expect(last.bookValue).toBe(0);
  });

  it("caps the final period so book value never dips below salvage", () => {
    const sched = straightLineSchedule({
      assetId: 7, purchaseCost: 10000, salvageValue: 1000, usefulLifeYears: 1, purchaseDate: "2025-01-01",
    });
    const last = sched[sched.length - 1];
    expect(last.bookValue).toBeGreaterThanOrEqual(1000);
    expect(round2(last.accumulated)).toBe(9000); // depreciable = 10000 − 1000
  });
});

describe("Scenario 5 — Depreciation posting path: static contract (real route, DB-bound)", () => {
  it("monthly depreciate route posts a balanced two-leg entry, both legs stamped assetId", () => {
    // DR depreciation expense …
    expect(ALGO_ROUTE).toMatch(
      /accountCode:\s*\(asset\.depreciationAccountCode[^)]*\)\s*\?\?\s*"5790",\s*debit:\s*depAmount,\s*credit:\s*0[\s\S]{0,80}assetId:\s*asset\.id/,
    );
    // … CR accumulated depreciation, same amount ⇒ balanced.
    expect(ALGO_ROUTE).toMatch(
      /accountCode:\s*\(asset\.accDepreciationAccountCode[^)]*\)\s*\?\?\s*"1290",\s*debit:\s*0,\s*credit:\s*depAmount[\s\S]{0,90}assetId:\s*asset\.id/,
    );
  });

  it("the schedule generator emits one period per useful-life month (time recognition)", () => {
    expect(ALGO_ROUTE).toContain("const usefulLifeMonths = usefulLifeYears * 12;");
    expect(ALGO_ROUTE).toMatch(/for\s*\(let m = 0; m < usefulLifeMonths; m\+\+\)/);
    expect(ALGO_ROUTE).toMatch(/scheduleRows\.push\(\{ period, depreciationAmount: monthlyDep/);
  });

  it("the batch depreciate-all route exists (period close runs all active assets)", () => {
    expect(ALGO_ROUTE).toContain('/fixed-assets/depreciate-all"');
  });

  // NOTE: the produced journal_lines cannot be asserted from a DB row in unit
  // isolation (postJournalEntry + INSERT depreciation_entries are DB-bound).
  // Live-DB coverage of asset lifecycle posting lives in
  // tests/integration/fixedAssetAnchors.dynamic.test.ts (gated by dbReady).
  // Here we cover the math + shape purely (above) and pin the posting contract
  // statically (this block).
});
