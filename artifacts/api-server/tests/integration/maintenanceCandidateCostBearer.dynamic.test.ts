// البند ٤ ج-٥ — التقاط costBearer للصيانة تشغيليًّا: المُكمِل يختار مَن يتحمّل،
// فيُخزَّن على ترشيح transport_billing_candidates، ويصل المحاسب **كافتراض** عند
// المادْيَلة (يبقى تجاوزه ممكنًا). assertion على الدفتر (الدستور م٣): القيمة المخزّنة
// توجّه قيد postMaintenanceGL (تأمين → ذمة مدينة مستردّة، غياب → company).
// يُفعَّل فقط على عنقود الاختبار (migration 428 يُشغَّل ما بعد الـcutoff)؛ يُتخطّى محليًّا.
import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("البند ٤ ج-٥ — costBearer مخزّن على ترشيح الصيانة يقود القيد عند المادْيَلة", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let fleetEngine: typeof import("../../src/lib/engines/fleetEngine.js").fleetEngine;

  let companyId: number;
  let branchId: number;
  const vehicleId = 990701; // tag فقط
  const insMaintId = 870001; // ترشيح بتأمين
  const defMaintId = 870002; // ترشيح بلا اختيار → company

  async function candidate(sourceId: number) {
    const [row] = await rawQuery<{ costBearer: string | null; sourceId: number }>(
      `SELECT "costBearer", "sourceId" FROM transport_billing_candidates
        WHERE "companyId"=$1 AND "sourceType"='maintenance' AND "sourceId"=$2`,
      [companyId, sourceId]);
    return row;
  }
  async function maintLines(maintId: number) {
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "sourceKey"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [`fleet:maintenance:${maintId}`, companyId]);
    expect(je, "maintenance JE not posted").toBeTruthy();
    return rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId"=$1`, [je.id]);
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    fleetEngine = (await import("../../src/lib/engines/fleetEngine.js")).fleetEngine;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");

    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [`Maint CB Co ${Date.now()}`]);
    companyId = cid;
    await bootstrapCompany(companyId, "Maint CB Co");
    const [{ id: bid }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = bid;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'فترة الاختبار', '2020-01-01', '2035-12-31', 'open')`, [companyId]);
  });

  it("المُكمِل يختار «تأمين» → يُخزَّن على الترشيح", async () => {
    const res = await fleetEngine.createMaintenanceExpenseCandidate(
      { companyId, branchId, createdBy: 0 },
      { id: insMaintId, vehicleId, cost: 500, costBearer: "insurance" });
    expect(res?.created).toBe(true);
    const c = await candidate(insMaintId);
    expect(c?.costBearer).toBe("insurance");
  });

  it("بلا اختيار → costBearer على الترشيح NULL (يُعامَل company)", async () => {
    await fleetEngine.createMaintenanceExpenseCandidate(
      { companyId, branchId, createdBy: 0 },
      { id: defMaintId, vehicleId, cost: 300 });
    const c = await candidate(defMaintId);
    expect(c?.costBearer ?? null).toBeNull();
  });

  it("المادْيَلة بلا تجاوز محاسب تستعمل قيمة الترشيح: تأمين → ذمة مدينة مستردّة", async () => {
    const c = await candidate(insMaintId);
    // محاكاة المادْيَلة: overrides.costBearer ?? candidate.costBearer ?? undefined.
    await fleetEngine.postMaintenanceGL(
      { companyId, branchId, createdBy: 0 },
      { id: insMaintId, vehicleId, totalCost: 500, costBearer: c?.costBearer ?? undefined });
    const lines = await maintLines(insMaintId);
    const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(500, 2);
    expect(credit).toBeCloseTo(500, 2);
    // مستردّ (تصحيح ٢٠٢٦-٠٧-٠١): المدين ذمة (1131)، والدائن النقد (1111) — الشركة
    // تدفع الورشة وتسترد من الطرف؛ لا يُدائَن حساب المصروف (فلا يصير رصيده سالبًا).
    const debitLeg = lines.find((l) => Number(l.debit) > 0)!;
    const creditLeg = lines.find((l) => Number(l.credit) > 0)!;
    expect(debitLeg.accountCode).toBe("1131");
    expect(creditLeg.accountCode).toBe("1111");
  });

  it("المادْيَلة لترشيح بلا اختيار → company (مدين حساب صيانة المركبة، لا ذمة)", async () => {
    const c = await candidate(defMaintId);
    await fleetEngine.postMaintenanceGL(
      { companyId, branchId, createdBy: 0 },
      { id: defMaintId, vehicleId, totalCost: 300, costBearer: c?.costBearer ?? undefined });
    const lines = await maintLines(defMaintId);
    const debitLeg = lines.find((l) => Number(l.debit) > 0)!;
    expect(debitLeg.accountCode).not.toBe("1131"); // ليست ذمة — مصروف صيانة المركبة
  });
});
