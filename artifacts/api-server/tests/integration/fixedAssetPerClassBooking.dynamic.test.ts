// Constitution Rule 3 (Ledger safety) — a per-class fixed-asset booking must
// post its journal lines to the class's OWN accounts, not the generic "other"
// bucket. This asserts the posted journal_lines for a "vehicles" asset land on
// 1210 / 5710 / 1211 (balanced), and that the cash-receipt fallback resolves to
// postable 1111 / 1124, against a live DB.
// Activation: disposable test DB (port 54329 / *_test). Skips without it.
import { describe, it, expect, beforeAll } from "vitest";
import { resolveAssetAccounts } from "../../src/lib/finance/assetClassAccounts.js";

const M = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  M.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

d("per-class fixed-asset booking posts journal lines to the class accounts", () => {
  let rawQuery: any;
  let rawExecute: any;
  let financialEngine: any;
  let getAccountCodeFromMapping: any;
  let companyId: number;
  let branchId: number;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    financialEngine = (await import("../../src/lib/engines/financialEngine.js")).financialEngine;
    getAccountCodeFromMapping = (await import("../../src/lib/businessHelpers.js")).getAccountCodeFromMapping;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");
    const [{ id }] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`,
      [`PerClass Co ${Date.now()}`],
    );
    companyId = id;
    await bootstrapCompany(companyId, "PerClass Co");
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
  });

  it("vehicle class routes to 1210/5710/1211, all postable leaves", async () => {
    const acct = resolveAssetAccounts({
      category: "سيارات",
      assetAccountCode: "1280",
      depreciationAccountCode: "5790",
      accDepreciationAccountCode: "1290",
    });
    expect(acct).toEqual({ asset: "1210", dep: "5710", accDep: "1211" });
    const rows = await rawQuery(
      `SELECT code, "allowPosting" FROM chart_of_accounts WHERE "companyId"=$1 AND code IN ('1210','5710','1211')`,
      [companyId],
    );
    const by = Object.fromEntries(rows.map((r: any) => [r.code, r.allowPosting]));
    expect(by["1210"]).toBe(true);
    expect(by["5710"]).toBe(true);
    expect(by["1211"]).toBe(true);
  });

  it("acquisition JE debits the per-class asset account 1210 (not generic 1280)", async () => {
    const acct = resolveAssetAccounts({ category: "سيارة نقل", assetAccountCode: "1280" });
    const res = await financialEngine.postJournalEntry({
      companyId,
      branchId,
      createdBy: 0,
      ref: `ACQ-PC-${Date.now()}`,
      description: "اقتناء مركبة — اختبار فئة",
      type: "general",
      sourceType: "fixed_asset_acquisition",
      sourceId: 993001,
      sourceKey: `test:acq:pc:${Date.now()}`,
      lines: [
        { accountCode: acct.asset, debit: 5000, credit: 0 },
        { accountCode: "1111", debit: 0, credit: 5000 },
      ],
    });
    expect(res.journalId).toBeTruthy();
    const lines = await rawQuery(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId"=$1`,
      [res.journalId],
    );
    const debitLine = lines.find((l: any) => Number(l.debit) > 0);
    expect(debitLine.accountCode).toBe("1210"); // vehicles cost, not generic 1280
    const dr = lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
    const cr = lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
    expect(dr).toBeCloseTo(cr, 2);
  });

  it("depreciation JE for the vehicle class posts to 5710 / 1211 balanced", async () => {
    const acct = resolveAssetAccounts({ category: "مركبة" });
    const res = await financialEngine.postJournalEntry({
      companyId,
      branchId,
      createdBy: 0,
      ref: `DEP-PC-${Date.now()}`,
      description: "إهلاك مركبة — اختبار فئة",
      type: "depreciation",
      sourceType: "depreciation",
      sourceId: 993002,
      sourceKey: `test:dep:pc:${Date.now()}`,
      lines: [
        { accountCode: acct.dep, debit: 100, credit: 0 },
        { accountCode: acct.accDep, debit: 0, credit: 100 },
      ],
    });
    expect(res.journalId).toBeTruthy();
    const lines = await rawQuery(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId"=$1`,
      [res.journalId],
    );
    const codes = lines.map((l: any) => l.accountCode).sort();
    expect(codes).toEqual(["1211", "5710"]);
    const dr = lines.reduce((s: number, l: any) => s + Number(l.debit), 0);
    const cr = lines.reduce((s: number, l: any) => s + Number(l.credit), 0);
    expect(dr).toBeCloseTo(100, 2);
    expect(cr).toBeCloseTo(100, 2);
  });

  it("cash-receipt fallback resolves to postable 1111 (cash) / 1124 (non-cash)", async () => {
    const cash = await getAccountCodeFromMapping(companyId, "invoice_payment_cash", "debit", "1111");
    const nonCash = await getAccountCodeFromMapping(companyId, "invoice_payment_cash", "debit", "1124");
    expect(cash).toBe("1111");
    expect(nonCash).toBe("1124");
    const rows = await rawQuery(
      `SELECT code, "allowPosting" FROM chart_of_accounts WHERE "companyId"=$1 AND code IN ('1111','1124')`,
      [companyId],
    );
    const by = Object.fromEntries(rows.map((r: any) => [r.code, r.allowPosting]));
    expect(by["1111"]).toBe(true);
    expect(by["1124"]).toBe(true);
  });
});
