// Constitution Rule 3 — assertion on the ACTUAL journal_lines the bad-debt
// provision posts, proving delta-to-target accounting: each period books only
// (aging target − current 1135 balance), so the allowance reflects the target
// with NO cumulative over-provision. Positive delta ⇒ DR 5820 / CR 1135 (raise);
// negative ⇒ DR 1135 / CR 5820 (release); at-target ⇒ no entry. Idempotent per
// period via the shared ref. Live test DB only; skips otherwise.
import { describe, it, expect, beforeAll } from "vitest";

const M = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  M.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

d("bad-debt provision — delta-to-target posts the right journal_lines (live DB)", () => {
  let rawQuery: any;
  let rawExecute: any;
  let postBadDebtProvision: any;
  let companyId: number;
  let branchId: number;
  let clientId: number;

  const ALLOWANCE = "1135";
  const EXPENSE = "5820";

  async function allowanceBalance(): Promise<number> {
    const [row] = await rawQuery(
      `SELECT COALESCE(SUM(jl.credit) - SUM(jl.debit), 0)::float8 AS bal
         FROM journal_lines jl JOIN journal_entries je ON je.id = jl."journalId"
        WHERE je."companyId"=$1 AND je."deletedAt" IS NULL AND jl."deletedAt" IS NULL
          AND jl."accountCode"=$2`,
      [companyId, ALLOWANCE],
    );
    return Math.round(Number(row.bal) * 100) / 100;
  }

  async function linesFor(period: string): Promise<Array<{ accountCode: string; debit: number; credit: number }>> {
    const [je] = await rawQuery(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [companyId, `BAD-DEBT-${period}`],
    );
    if (!je) return [];
    return rawQuery(
      `SELECT "accountCode", debit::float8 AS debit, credit::float8 AS credit
         FROM journal_lines WHERE "journalId"=$1 ORDER BY debit DESC`,
      [je.id],
    );
  }

  async function mkInvoice(ref: string, total: number, dueDate: string): Promise<number> {
    const [r] = await rawQuery(
      `INSERT INTO invoices ("companyId","branchId","clientId",ref,total,"paidAmount",status,"createdAt","dueDate")
       VALUES ($1,$2,$3,$4,$5,0,'sent','2026-01-01T00:00:00Z',$6) RETURNING id`,
      [companyId, branchId, clientId, ref, total, dueDate],
    );
    return r.id;
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ postBadDebtProvision } = await import("../../src/lib/finance/badDebtProvision.js"));
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");

    const [{ id }] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`,
      [`BadDebt Co ${Date.now()}`],
    );
    companyId = id;
    await bootstrapCompany(companyId, "BadDebt Co");
    const [{ id: b }] = await rawQuery(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`,
      [companyId],
    );
    branchId = b;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status)
       VALUES ($1,'فترة الاختبار','2020-01-01','2035-12-31','open')`,
      [companyId],
    );
    const [{ id: cl }] = await rawQuery(
      `INSERT INTO clients ("companyId", name) VALUES ($1,$2) RETURNING id`,
      [companyId, "BadDebt Client"],
    );
    clientId = cl;
  }, 90_000);

  it("period 1: raises the provision by the full target — DR 5820 / CR 1135, balanced", async () => {
    // one invoice 1000, due 2026-01-01 → 90+ days overdue (rate .75) ⇒ target 750
    await mkInvoice("BD-INV-1", 1000, "2026-01-01");
    const r = await postBadDebtProvision({ companyId, branchId, period: "2026-05", createdBy: 0 });
    expect(r.posted).toBe(true);
    expect(r.target).toBe(750);
    expect(r.currentAllowance).toBe(0);
    expect(r.delta).toBe(750);
    expect(await linesFor("2026-05")).toEqual([
      { accountCode: EXPENSE, debit: 750, credit: 0 },
      { accountCode: ALLOWANCE, debit: 0, credit: 750 },
    ]);
    expect(await allowanceBalance()).toBe(750);
  });

  it("re-running the same period is idempotent — no second entry", async () => {
    const r = await postBadDebtProvision({ companyId, branchId, period: "2026-05", createdBy: 0 });
    expect(r.posted).toBe(false);
    expect(r.reason).toBe("already_posted");
    expect(await allowanceBalance()).toBe(750); // unchanged
  });

  it("next period at the SAME target books NOTHING (no cumulative over-provision)", async () => {
    const r = await postBadDebtProvision({ companyId, branchId, period: "2026-06", createdBy: 0 });
    expect(r.posted).toBe(false);
    expect(r.reason).toBe("at_target");
    expect(r.delta).toBe(0);
    expect(await allowanceBalance()).toBe(750); // still 750, NOT 1500
    expect(await linesFor("2026-06")).toEqual([]); // no entry booked
  });

  it("a higher target raises only the delta — DR 5820 / CR 1135 for the increase", async () => {
    await mkInvoice("BD-INV-2", 1000, "2026-01-01"); // +750 target ⇒ target 1500
    const r = await postBadDebtProvision({ companyId, branchId, period: "2026-07", createdBy: 0 });
    expect(r.posted).toBe(true);
    expect(r.target).toBe(1500);
    expect(r.currentAllowance).toBe(750);
    expect(r.delta).toBe(750);
    expect(await linesFor("2026-07")).toEqual([
      { accountCode: EXPENSE, debit: 750, credit: 0 },
      { accountCode: ALLOWANCE, debit: 0, credit: 750 },
    ]);
    expect(await allowanceBalance()).toBe(1500);
  });

  it("a lower target RELEASES the provision — DR 1135 / CR 5820 for the decrease", async () => {
    // collect inv2 fully ⇒ it drops out of the aging ⇒ target back to 750
    await rawExecute(
      `UPDATE invoices SET "paidAmount"=total, status='paid' WHERE "companyId"=$1 AND ref=$2`,
      [companyId, "BD-INV-2"],
    );
    const r = await postBadDebtProvision({ companyId, branchId, period: "2026-08", createdBy: 0 });
    expect(r.posted).toBe(true);
    expect(r.target).toBe(750);
    expect(r.currentAllowance).toBe(1500);
    expect(r.delta).toBe(-750);
    expect(await linesFor("2026-08")).toEqual([
      { accountCode: ALLOWANCE, debit: 750, credit: 0 },
      { accountCode: EXPENSE, debit: 0, credit: 750 },
    ]);
    expect(await allowanceBalance()).toBe(750);
  });
});
