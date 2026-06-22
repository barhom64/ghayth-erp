// Asset depreciation / disposal fallbacks must be POSTABLE leaves: 5790 (other
// depreciation expense) + 1290 (other accumulated depreciation), seeded by
// bootstrap + backfill migration 413 — not the absent codes 6100/1590 that
// blocked posting. Also bank-reconciliation default 1124 (not parent 1120).
// Activation: disposable test DB (port 54329 / *_test). Skips without it.

import { describe, it, expect, beforeAll } from "vitest";

const M = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady = !!dbUrl && M.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET && (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

d("depreciation + bank fallbacks resolve to postable leaves (5790/1290/1124)", () => {
  let rawQuery; let rawExecute; let financialEngine;
  let companyId; let branchId;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery; rawExecute = rawdb.rawExecute;
    financialEngine = (await import("../../src/lib/engines/financialEngine.js")).financialEngine;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");
    const [{ id }] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`, [`Depr Co ${Date.now()}`]);
    companyId = id;
    await bootstrapCompany(companyId, "Depr Co");
    const [{ id: b }] = await rawQuery(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = b;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status)
       VALUES ($1,'فترة الاختبار','2020-01-01','2035-12-31','open')`, [companyId]);
  });

  it("5790/1290/1124 exist as postable leaves (not absent/parent)", async () => {
    const rows = await rawQuery(
      `SELECT code, "allowPosting" FROM chart_of_accounts
        WHERE "companyId"=$1 AND code IN ('5790','1290','1124','6100','1590','1120')`, [companyId]);
    const by = Object.fromEntries(rows.map((r) => [r.code, r.allowPosting]));
    expect(by["5790"]).toBe(true);
    expect(by["1290"]).toBe(true);
    expect(by["1124"]).toBe(true);
    expect(by["6100"]).toBeUndefined(); // legacy code never existed
    expect(by["1590"]).toBeUndefined();
    expect(by["1120"]).toBe(false);     // parent stays non-postable
  });

  it("a depreciation JE on the fallback leaves posts balanced", async () => {
    const exp = await financialEngine.resolveAccountCode(companyId, "__unmapped_depr__", "debit", "5790");
    const acc = await financialEngine.resolveAccountCode(companyId, "asset_accumulated_depreciation", "credit", "1290");
    expect(exp).toBe("5790"); expect(acc).toBe("1290");
    const res = await financialEngine.postJournalEntry({
      companyId, branchId, createdBy: 0,
      ref: `DEPR-${Date.now()}`, description: "إهلاك أصل — اختبار",
      type: "general", sourceType: "depreciation", sourceId: 992001,
      sourceKey: `test:depr:${Date.now()}`,
      lines: [{ accountCode: exp, debit: 100, credit: 0 }, { accountCode: acc, debit: 0, credit: 100 }],
    });
    expect(res.journalId).toBeTruthy();
    const lines = await rawQuery(`SELECT debit, credit FROM journal_lines WHERE "journalId"=$1`, [res.journalId]);
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr).toBeCloseTo(100, 2); expect(cr).toBeCloseTo(100, 2);
  });
});
