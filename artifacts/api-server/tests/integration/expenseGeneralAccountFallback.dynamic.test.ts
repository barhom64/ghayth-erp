// Expense "بدون ربط" must resolve to REAL postable accounts, not the phantom
// parents 5000 / 1100 that blocked posting («الحساب غير قابل للترحيل»).
//
// Batch 1 of the finance-entry overhaul: the general-expense fallback is now
// 5399 (مصروفات عمومية أخرى — a postable G&A leaf seeded by bootstrap + backfill
// migration 412) and the cash fallback is 1111 (الصندوق الرئيسي). This proves
// both are postable leaves and a journal built from them balances and posts.
//
// Activation: disposable test DB (port 54329 / *_test). Skips without it.

import { describe, it, expect, beforeAll } from "vitest";

const MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady = !!dbUrl && MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET && (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

d("expense general/cash fallback resolves to postable leaves (5399 / 1111)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let financialEngine: typeof import("../../src/lib/engines/financialEngine.js").financialEngine;
  let companyId: number; let branchId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery; rawExecute = rawdb.rawExecute;
    financialEngine = (await import("../../src/lib/engines/financialEngine.js")).financialEngine;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");
    const [{ id }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`, [`Exp Fallback Co ${Date.now()}`]);
    companyId = id;
    await bootstrapCompany(companyId, "Exp Fallback Co");
    const [{ id: b }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = b;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status)
       VALUES ($1,'فترة الاختبار','2020-01-01','2035-12-31','open')`, [companyId]);
  });

  it("5399 and 1111 exist as POSTABLE leaves (not the phantom parents 5000/1100)", async () => {
    const rows = await rawQuery<{ code: string; allowPosting: boolean }>(
      `SELECT code, "allowPosting" FROM chart_of_accounts
        WHERE "companyId"=$1 AND code IN ('5399','1111','5000','1100')`, [companyId]);
    const by = Object.fromEntries(rows.map((r) => [r.code, r.allowPosting]));
    expect(by["5399"], "5399 missing").toBe(true);      // postable general-expense leaf
    expect(by["1111"], "1111 missing").toBe(true);      // postable cash leaf
    expect(by["5000"]).toBe(false);                      // parent — must stay non-postable
    expect(by["1100"]).toBe(false);                      // parent — must stay non-postable
  });

  it("resolveAccountCode falls back to the postable 5399, and the JE posts balanced", async () => {
    // unmapped purpose → exercises the fallback path the expense route uses.
    const expenseCode = await financialEngine.resolveAccountCode(companyId, "__unmapped_purpose__", "debit", "5399");
    expect(expenseCode).toBe("5399"); // resolveAccountCode asserts postable — would throw on a parent
    const cashCode = await financialEngine.resolveAccountCode(companyId, "__unmapped_cash__", "credit", "1111");
    expect(cashCode).toBe("1111");

    const res = await financialEngine.postJournalEntry({
      companyId, branchId, createdBy: 0,
      ref: `EXP-FALLBACK-${Date.now()}`, description: "مصروف عام بدون ربط — اختبار",
      type: "general", sourceType: "expense", sourceId: 991001,
      sourceKey: `test:expense_fallback:${Date.now()}`,
      lines: [
        { accountCode: expenseCode, debit: 150, credit: 0 },
        { accountCode: cashCode, debit: 0, credit: 150 },
      ],
    });
    expect(res.journalId).toBeTruthy();
    const lines = await rawQuery<{ debit: string; credit: string }>(
      `SELECT debit, credit FROM journal_lines WHERE "journalId"=$1`, [res.journalId]);
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr).toBeCloseTo(150, 2);
    expect(cr).toBeCloseTo(150, 2);
  });
});
