// البند ٤ شريحة ١ — assertion على سطور القيد التي تُرحّلها واقعة «وقود» المركبة
// (الدستور م٣: أي تغيير يمسّ الدفتر يلزمه assertion على سطور القيد). يثبت أن واقعة
// الوقود تُركّب postFinancialDocument (م٥) فتُنتج قيدًا متوازنًا: مدين «مصروف وقود»
// (بُعد vehicleId) + ضريبة المدخلات / دائن النقد؛ وأن costBearer=سائق يجُبّ حساب
// المصروف بحساب ذمة السائق (التوجيه يقرّر الحساب — مبدأ إبراهيم). يُفعَّل فقط حين
// يشير DATABASE_URL لعنقود الاختبار؛ يُتخطّى محليًّا. يحاكي fixture م٣.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2;
const BRANCH = 2;
const BY = 2;
const PFX = "test-b4-fuel-";

d("البند ٤ — واقعة وقود المركبة: قيد متوازن + بُعد المركبة + تفريع costBearer (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;
  let postFinancialDocument: typeof import("../../src/lib/financeDocumentService.js").postFinancialDocument;

  let vehicleId: number;

  async function cleanup() {
    if (!rawExecute) return;
    const jes = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceKey" LIKE $2`,
      [COMPANY, `fleet:fuel:${COMPANY}:${PFX}%`],
    );
    for (const je of jes) {
      try { await reverseAccountBalances(COMPANY, je.id); } catch { /* already reversed */ }
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [je.id]);
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [je.id]);
    }
    await rawExecute(`DELETE FROM fleet_vehicles WHERE "companyId"=$1 AND "plateNumber" LIKE $2`, [COMPANY, PFX + "%"]);
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ reverseAccountBalances } = await import("../../src/lib/businessHelpers.js"));
    ({ postFinancialDocument } = await import("../../src/lib/financeDocumentService.js"));
    await cleanup();
    const [v] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_vehicles ("companyId","branchId",make,model,"plateNumber",status)
       VALUES ($1,$2,'Test','Fuel',$3,'active') RETURNING id`,
      [COMPANY, BRANCH, PFX + "0001"],
    );
    vehicleId = v.id;
  });
  afterAll(cleanup);

  // نفس مدخل postFinancialDocument الذي تبنيه نقطة /fleet/vehicles/:id/fuel-event.
  function fuelInput(opts: { costBearer: string; key: string; liters?: number; price?: number; vat?: number }) {
    const liters = opts.liters ?? 100;
    const price = opts.price ?? 2;
    return {
      companyId: COMPANY, branchId: BRANCH, createdBy: BY,
      documentKind: "expense" as const, direction: "payment" as const,
      cashAccountCode: "1111", vatAccountCode: opts.vat ? "1180" : null,
      ref: `FUEL-${vehicleId}`, description: "وقود اختبار",
      sourceKey: `fleet:fuel:${COMPANY}:${PFX}${opts.key}`,
      rawLines: [{
        lineNo: 1, quantity: liters, unitPrice: price, taxRatePercent: opts.vat ?? 0,
        counterAccountCode: "5510", itemName: "وقود",
        allocations: [{ entityType: "vehicle", entityId: vehicleId, allocationType: "percent" as const, percent: 100, costBearer: opts.costBearer }],
      }],
    };
  }

  it("company-borne fuel (100L × 2 + 15% VAT): balanced JE, DR fuel carries vehicleId, CR cash = 230", async () => {
    const res = await postFinancialDocument(fuelInput({ costBearer: "company", key: "company", vat: 15 }));
    expect(res.alreadyExists).toBe(false);

    const [sums] = await rawQuery<{ d: string; c: string }>(
      `SELECT SUM(debit)::text d, SUM(credit)::text c FROM journal_lines WHERE "journalId"=$1`, [res.journalId]);
    expect(Number(sums.d)).toBeCloseTo(230, 2);
    expect(Number(sums.c)).toBeCloseTo(230, 2);

    // سطر مصروف الوقود يحمل بُعد المركبة (vehicleId) ومبلغه الصافي 200.
    const fuelLines = await rawQuery<{ debit: string; vehicleId: number | null }>(
      `SELECT debit::text, "vehicleId" FROM journal_lines WHERE "journalId"=$1 AND debit > 0 AND "vehicleId"=$2`,
      [res.journalId, vehicleId]);
    expect(fuelLines.length).toBeGreaterThanOrEqual(1);
    expect(fuelLines.some((l) => Math.abs(Number(l.debit) - 200) < 0.01)).toBe(true);
  });

  it("driver-borne fuel: costBearer=driver flips the debit to the driver receivable (not the fuel expense)", async () => {
    const res = await postFinancialDocument(fuelInput({ costBearer: "driver", key: "driver" }));
    expect(res.alreadyExists).toBe(false);
    // الحساب المدين الآن ذمة السائق (op cost_bearer_receivable_driver، fallback 1143) لا 6500.
    const debitCodes = await rawQuery<{ code: string }>(
      `SELECT ca.code FROM journal_lines jl JOIN chart_of_accounts ca ON ca.id = jl."accountId"
        WHERE jl."journalId"=$1 AND jl.debit > 0`, [res.journalId]);
    const codes = debitCodes.map((r) => r.code);
    expect(codes).not.toContain("5510"); // لم يُرحَّل كمصروف وقود
  });

  it("is idempotent on sourceKey — replaying the company fuel event returns the same JE", async () => {
    const replay = await postFinancialDocument(fuelInput({ costBearer: "company", key: "company", vat: 15 }));
    expect(replay.alreadyExists).toBe(true);
  });
});
