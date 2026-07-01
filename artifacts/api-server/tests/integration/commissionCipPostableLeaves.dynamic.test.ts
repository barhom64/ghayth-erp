// Commission + CIP/datafix fallbacks must resolve to POSTABLE leaves, not the
// phantom codes that blocked posting:
//   commission_expense → 5430 «العمولات والوساطة»  (كان 5200 رواتب-أب / 6200 وهمي)
//   CIP account        → 1270 «أعمال تحت التنفيذ»   (كان 1530 وهمي)
//   capitalized asset  → 1280 «أصول ثابتة أخرى»     (كان 1500 وهمي؛ ورقة جديدة + backfill 414)
//   datafix AR/سلف/AP  → 1131 / 1141 / 2111         (كانت آباء 1130/1140/2110)
// Activation: disposable test DB (port 54329 / *_test). Skips without it.

import { describe, it, expect, beforeAll } from "vitest";

const M = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady = !!dbUrl && M.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET && (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

d("commission + CIP + datafix fallbacks resolve to postable leaves", () => {
  let rawQuery; let financialEngine;
  let companyId; let branchId;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    const rawExecute = rawdb.rawExecute;
    financialEngine = (await import("../../src/lib/engines/financialEngine.js")).financialEngine;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");
    const [{ id }] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`, [`Comm Co ${Date.now()}`]);
    companyId = id;
    await bootstrapCompany(companyId, "Comm Co");
    const [{ id: b }] = await rawQuery(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = b;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status)
       VALUES ($1,'فترة الاختبار','2020-01-01','2035-12-31','open')`, [companyId]);
  });

  it("5430/1270/1280/1131/1141/2111 exist as postable leaves; phantom codes absent", async () => {
    const rows = await rawQuery(
      `SELECT code, "allowPosting" FROM chart_of_accounts
        WHERE "companyId"=$1 AND code IN
          ('5430','1270','1280','1131','1141','2111','5200','6200','1500','1530')`, [companyId]);
    const by = Object.fromEntries(rows.map((r) => [r.code, r.allowPosting]));
    expect(by["5430"]).toBe(true);   // commission expense leaf
    expect(by["1270"]).toBe(true);   // CIP leaf
    expect(by["1280"]).toBe(true);   // other fixed assets leaf (new + backfill 414)
    expect(by["1131"]).toBe(true);   // local customers (AR)
    expect(by["1141"]).toBe(true);   // employee advances
    expect(by["2111"]).toBe(true);   // local suppliers (AP)
    expect(by["6200"]).toBeUndefined();  // phantom — never existed
    expect(by["1500"]).toBeUndefined();
    expect(by["1530"]).toBeUndefined();
    expect(by["5200"]).toBe(false);  // 5200 is the non-postable payroll PARENT (never the commission leaf)
  });

  it("a commission JE on 5430 posts balanced", async () => {
    const exp = await financialEngine.resolveAccountCode(companyId, "commission_expense", "debit", "5430");
    const cash = await financialEngine.resolveAccountCode(companyId, "__unmapped_cash__", "credit", "1111");
    expect(exp).toBe("5430");
    const res = await financialEngine.postJournalEntry({
      companyId, branchId, createdBy: 0,
      ref: `COMM-${Date.now()}`, description: "عمولة — اختبار",
      type: "general", sourceType: "commission", sourceId: 993001,
      sourceKey: `test:commission:${companyId}:993001`,
      lines: [{ accountCode: exp, debit: 250, credit: 0 }, { accountCode: cash, debit: 0, credit: 250 }],
    });
    expect(res.journalId).toBeTruthy();
    const lines = await rawQuery(`SELECT debit, credit FROM journal_lines WHERE "journalId"=$1`, [res.journalId]);
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr).toBeCloseTo(250, 2); expect(cr).toBeCloseTo(250, 2);
  });

  it("a CIP capitalization JE (1270 → 1280) posts balanced", async () => {
    const cip = await financialEngine.resolveAccountCode(companyId, "asset_cip", "credit", "1270");
    const asset = await financialEngine.resolveAccountCode(companyId, "asset_cost", "debit", "1280");
    expect(cip).toBe("1270"); expect(asset).toBe("1280");
    const res = await financialEngine.postJournalEntry({
      companyId, branchId, createdBy: 0,
      ref: `CIP-${Date.now()}`, description: "رسملة أعمال تحت التنفيذ — اختبار",
      type: "general", sourceType: "cip_capitalization", sourceId: 993002,
      sourceKey: `test:cip:${companyId}:993002`,
      lines: [{ accountCode: asset, debit: 1000, credit: 0 }, { accountCode: cip, debit: 0, credit: 1000 }],
    });
    expect(res.journalId).toBeTruthy();
    const lines = await rawQuery(`SELECT debit, credit FROM journal_lines WHERE "journalId"=$1`, [res.journalId]);
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr).toBeCloseTo(1000, 2); expect(cr).toBeCloseTo(1000, 2);
  });
});
