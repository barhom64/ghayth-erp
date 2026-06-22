// storeEngine.postOrderGL must resolve to REAL postable leaves (not phantom
// parents 1100/2200/5300 or codes absent from the chart 4300/1500 that block
// posting). A store order with VAT + COGS posts a BALANCED journal on:
//   DR 1111 cash (total) / CR 4111 sales (subtotal) / CR 2131 output-VAT (vat)
//   DR 5110 COGS (cogs)  / CR 1151 inventory (cogs)
// Activation: disposable test DB (port 54329 / *_test). Skips without it.

import { describe, it, expect, beforeAll } from "vitest";

const M = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady = !!dbUrl && M.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET && (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

d("storeEngine.postOrderGL posts a balanced JE on real postable leaves", () => {
  let rawQuery; let rawExecute; let storeEngine;
  let companyId; let branchId;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery; rawExecute = rawdb.rawExecute;
    storeEngine = (await import("../../src/lib/engines/storeEngine.js")).storeEngine;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");
    const [{ id }] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`, [`Store GL Co ${Date.now()}`]);
    companyId = id;
    await bootstrapCompany(companyId, "Store GL Co");
    const [{ id: b }] = await rawQuery(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = b;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status)
       VALUES ($1,'فترة الاختبار','2020-01-01','2035-12-31','open')`, [companyId]);
  });

  it("balanced lines hit 1111/4111/2131/5110/1151 (all postable)", async () => {
    const res = await storeEngine.postOrderGL(
      { companyId, branchId, createdBy: 0 },
      { id: 880101, subtotal: 100, vatAmount: 15, total: 115, cogsAmount: 60 });
    expect(res.journalId).toBeTruthy();

    const lines = await rawQuery(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId"=$1`, [res.journalId]);
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr).toBeCloseTo(175, 2);   // 115 cash + 60 cogs
    expect(cr).toBeCloseTo(175, 2);   // 100 sales + 15 vat + 60 inventory
    expect(dr).toBeCloseTo(cr, 2);

    const codes = new Set(lines.map((l) => l.accountCode));
    for (const c of ["1111", "4111", "2131", "5110", "1151"]) {
      expect(codes.has(c), `missing real leaf ${c}`).toBe(true);
    }
    // none of the phantom/parent codes
    for (const c of ["1100", "4300", "2200", "5300", "1500"]) {
      expect(codes.has(c), `phantom ${c} present`).toBe(false);
    }
  });
});
