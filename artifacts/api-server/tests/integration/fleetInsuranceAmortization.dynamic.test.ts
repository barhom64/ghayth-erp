// البند ٤ شريحة ٣ — تأمين المركبة: قسط مدفوع مقدمًا → إطفاء شهري — assertion على القيد.
//
// الدستور م٣ (مطلق): أي ترحيل يمسّ الدفتر يُشحن **مع** assertion على سطور القيد.
// تُمارِس هذه الحالة المسارَ كاملًا على Postgres حقيقي وتُثبت مبدأ الاستحقاق + مبدأ
// إبراهيم (حساب الأصل لكل لوحة + التوزيع الزمني):
//   (أ) postInsuranceGL يرحّل القسط أصلًا مدفوعًا مقدمًا (مدين 1172 / دائن نقد) لا
//       مصروفًا فوريًّا، ويفتح جدول إطفاء (prepaid_amortization_schedules) موسومًا
//       ببُعد المركبة.
//   (ب) runDueAmortizations (الكرون القائم) يعترف شهريًّا: مدين «تأمين المركبات»
//       (5530 عبر نيّة fleet_insurance_expense) / دائن المدفوع مقدمًا (1172)، متوازنًا
//       وحاملًا vehicleId.
//   (ج) النيّة fleet_insurance_expense تُحَلّ إلى 5530 (postable).
// idempotent: إعادة ترحيل القسط لا تُكرّر الجدول.
//
// التفعيل: مقيّد بقاعدة الاختبار القابلة للإسقاط (منفذ 54329 / علامة *_test). يُتخطّى بدونها.
//
//   pnpm db:provision-agent
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server test tests/integration/fleetInsuranceAmortization.dynamic.test.ts

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("Fleet insurance premium books prepaid + amortises monthly to vehicle insurance expense", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let fleetEngine: typeof import("../../src/lib/engines/fleetEngine.js").fleetEngine;
  let runDueAmortizations: typeof import("../../src/lib/engines/prepaidAmortizationEngine.js").runDueAmortizations;
  let getAccountCodeFromMapping: typeof import("../../src/lib/businessHelpers.js").getAccountCodeFromMapping;

  let companyId: number;
  let branchId: number;
  let vehicleId: number;
  let policyId: number;

  async function linesForSourceKey(sourceKey: string) {
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "sourceKey"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [sourceKey, companyId]);
    expect(je, `journal entry not posted for ${sourceKey}`).toBeTruthy();
    return rawQuery<{ accountCode: string; debit: string; credit: string; vehicleId: number | null }>(
      `SELECT "accountCode", debit, credit, "vehicleId" FROM journal_lines WHERE "journalId"=$1`, [je.id]);
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    fleetEngine = (await import("../../src/lib/engines/fleetEngine.js")).fleetEngine;
    ({ runDueAmortizations } = await import("../../src/lib/engines/prepaidAmortizationEngine.js"));
    ({ getAccountCodeFromMapping } = await import("../../src/lib/businessHelpers.js"));
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");

    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [`Ins Amort Co ${Date.now()}`]);
    companyId = cid;
    await bootstrapCompany(companyId, "Ins Amort Co");
    const [{ id: bid }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = bid;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'فترة الاختبار', '2020-01-01', '2035-12-31', 'open')`, [companyId]);

    const [{ id: vid }] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_vehicles ("companyId","branchId",make,model,"plateNumber",status)
       VALUES ($1,$2,'Test','Ins','test-b4-ins-0001','active') RETURNING id`,
      [companyId, branchId]);
    vehicleId = vid;

    // وثيقة تأمين: قسط 1200 على 12 شهرًا (2025-01-01 → 2025-12-31) ⇒ 100/شهر.
    const { insertId } = await rawExecute(
      `INSERT INTO fleet_insurance ("companyId","vehicleId",type,provider,"policyNumber","startDate","endDate",premium,"coverageAmount",notes)
       VALUES ($1,$2,'comprehensive','شركة تأمين اختبار','POL-B4-INS-1','2025-01-01','2025-12-31',1200,50000,NULL)`,
      [companyId, vehicleId]);
    policyId = insertId;
  });

  it("intent fleet_insurance_expense resolves to vehicle-insurance expense 5530 (postable)", async () => {
    const code = await getAccountCodeFromMapping(companyId, "fleet_insurance_expense", "debit", "");
    expect(code).toBe("5530");
  });

  it("(a) premium posts as PREPAID (DR 1172 / CR cash), balanced, carrying vehicleId", async () => {
    await fleetEngine.postInsuranceGL(
      { companyId, branchId, createdBy: 0 },
      { id: policyId, vehicleId, premium: 1200 });

    const lines = await linesForSourceKey(`fleet:insurance:${policyId}`);
    const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(1200, 2);
    expect(credit).toBeCloseTo(1200, 2);
    // المدين هو المدفوع مقدمًا 1172 (أصل) لا مصروف — موسوم بالمركبة.
    const debitLeg = lines.find((l) => Number(l.debit) > 0)!;
    expect(debitLeg.accountCode).toBe("1172");
    expect(debitLeg.vehicleId).toBe(vehicleId);
  });

  it("(a) opens ONE amortization schedule for the policy (12 months × 100), tagged with the vehicle", async () => {
    const rows = await rawQuery<{ id: number; expenseAccountPurpose: string; prepaidAccountCode: string; months: number; monthlyAmount: string; vehicleId: number | null; status: string }>(
      `SELECT id, "expenseAccountPurpose", "prepaidAccountCode", months, "monthlyAmount"::text AS "monthlyAmount", "vehicleId", status
         FROM prepaid_amortization_schedules
        WHERE "companyId"=$1 AND "sourceType"='vehicle_insurance' AND "sourceId"=$2 AND "deletedAt" IS NULL`,
      [companyId, policyId]);
    expect(rows.length).toBe(1);
    const s = rows[0];
    expect(s.expenseAccountPurpose).toBe("fleet_insurance_expense");
    expect(s.prepaidAccountCode).toBe("1172");
    expect(s.months).toBe(12);
    expect(Number(s.monthlyAmount)).toBeCloseTo(100, 2);
    expect(s.vehicleId).toBe(vehicleId);
    expect(s.status).toBe("active");
  });

  it("(b) runDueAmortizations recognises monthly: DR 5530 vehicle-insurance expense / CR 1172 prepaid, balanced, vehicle-tagged", async () => {
    const res = await runDueAmortizations({ companyId, asOf: "2025-02-15", createdBy: 0 });
    expect(res.posted).toBeGreaterThanOrEqual(1);

    // قيد إطفاء يناير 2025 (أوّل فترة مستحقّة): مدين 5530 / دائن 1172.
    const [sched] = await rawQuery<{ id: number }>(
      `SELECT id FROM prepaid_amortization_schedules WHERE "companyId"=$1 AND "sourceType"='vehicle_insurance' AND "sourceId"=$2`,
      [companyId, policyId]);
    const janLines = await linesForSourceKey(`prepaid:${sched.id}:2025-01`);
    const debit = janLines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = janLines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(100, 2);
    expect(credit).toBeCloseTo(100, 2);
    const debitLeg = janLines.find((l) => Number(l.debit) > 0)!;
    const creditLeg = janLines.find((l) => Number(l.credit) > 0)!;
    expect(debitLeg.accountCode).toBe("5530");  // مصروف تأمين المركبات (الإطفاء)
    expect(creditLeg.accountCode).toBe("1172");  // يقاصّ المدفوع مقدمًا
    expect(debitLeg.vehicleId).toBe(vehicleId);  // موسوم بالمركبة (مبدأ إبراهيم)
  });

  it("is idempotent — re-posting the premium does not duplicate the schedule", async () => {
    const replay = await fleetEngine.postInsuranceGL(
      { companyId, branchId, createdBy: 0 },
      { id: policyId, vehicleId, premium: 1200 });
    expect((replay as { alreadyExists?: boolean }).alreadyExists).toBe(true);
    const rows = await rawQuery<{ id: number }>(
      `SELECT id FROM prepaid_amortization_schedules WHERE "companyId"=$1 AND "sourceType"='vehicle_insurance' AND "sourceId"=$2 AND "deletedAt" IS NULL`,
      [companyId, policyId]);
    expect(rows.length).toBe(1);
  });
});
