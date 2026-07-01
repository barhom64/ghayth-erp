// تسوية ض.ق.م (#2280) — assertion على سطور القيد على قاعدة حيّة (الدستور م٣).
// تُرحّل مخرجات ومدخلات داخل الفترة ثم تُسوّي، وتُثبت أن القيد يُصفّر 2131/1180
// ويُسجّل الصافي نقدًا، متوازنًا، وidempotent عبر sourceKey.
//
// التفعيل: مقيّد بقاعدة الاختبار القابلة للإسقاط (منفذ 54329 / *_test)، يُتخطّى بدونها.
//   pnpm db:provision-agent
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server test tests/integration/vatSettlement.dynamic.test.ts
import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("VAT settlement posts DR 2131 / CR 1180 / CR cash (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let financialEngine: typeof import("../../src/lib/engines/index.js").financialEngine;
  let postVatSettlement: typeof import("../../src/lib/finance/vatSettlement.js").postVatSettlement;

  let companyId: number;
  let branchId: number;
  const KEY = () => `finance:vat_settlement:${companyId}:2026-05-01:2026-05-31`;

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    financialEngine = (await import("../../src/lib/engines/index.js")).financialEngine;
    postVatSettlement = (await import("../../src/lib/finance/vatSettlement.js")).postVatSettlement;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");

    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`,
      [`VAT Settle Co ${Date.now()}`]);
    companyId = cid;
    await bootstrapCompany(companyId, "VAT Settle Co");
    const [{ id: bid }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = bid;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1,'فترة الاختبار','2020-01-01','2035-12-31','open')`, [companyId]);
  }, 60_000);

  it("settles the period: DR 2131=output, CR 1180=input, CR cash=net, balanced", async () => {
    // إعداد داخل الفترة (مايو): مخرجات CR 2131 1500 · مدخلات DR 1180 400.
    await financialEngine.postJournalEntry({
      companyId, branchId, createdBy: 0, ref: "SETUP-VAT-OUT",
      description: "إعداد مخرجات", sourceType: "invoice", sourceId: 0,
      sourceKey: `test:vatout:${companyId}`, postingDate: "2026-05-10",
      lines: [{ accountCode: "1131", debit: 1500, credit: 0 }, { accountCode: "2131", debit: 0, credit: 1500 }],
    });
    await financialEngine.postJournalEntry({
      companyId, branchId, createdBy: 0, ref: "SETUP-VAT-IN",
      description: "إعداد مدخلات", sourceType: "purchase", sourceId: 0,
      sourceKey: `test:vatin:${companyId}`, postingDate: "2026-05-12",
      lines: [{ accountCode: "1180", debit: 400, credit: 0 }, { accountCode: "1111", debit: 0, credit: 400 }],
    });

    const out = await postVatSettlement({
      companyId, branchId, startDate: "2026-05-01", endDate: "2026-05-31",
      paymentDate: "2026-06-05", createdBy: 0,
    });
    expect(out.posted).toBe(true);
    expect(out.outputVat).toBeCloseTo(1500, 2);
    expect(out.inputVat).toBeCloseTo(400, 2);
    expect(out.netDue).toBeCloseTo(1100, 2);

    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [companyId, KEY()]);
    expect(je, "settlement JE not posted").toBeTruthy();

    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit::text, credit::text FROM journal_lines WHERE "journalId"=$1`, [je.id]);
    const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(credit, 2);

    const byCode = (c: string) => lines.find((l) => l.accountCode === c)!;
    expect(Number(byCode("2131").debit)).toBeCloseTo(1500, 2);  // مدين المخرجات (تصفية)
    expect(Number(byCode("1180").credit)).toBeCloseTo(400, 2);  // دائن المدخلات (تصفية)
    expect(Number(byCode("1111").credit)).toBeCloseTo(1100, 2); // دائن النقد (الصافي المدفوع)
  });

  it("is idempotent — re-settling the same period does not double-post", async () => {
    const again = await postVatSettlement({
      companyId, branchId, startDate: "2026-05-01", endDate: "2026-05-31",
      paymentDate: "2026-06-05", createdBy: 0,
    });
    expect(again.posted).toBe(false);
    expect(again.reason).toBe("already_posted");
    const [cnt] = await rawQuery<{ n: string }>(
      `SELECT count(*)::text n FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [companyId, KEY()]);
    expect(Number(cnt.n)).toBe(1);
  });
});
