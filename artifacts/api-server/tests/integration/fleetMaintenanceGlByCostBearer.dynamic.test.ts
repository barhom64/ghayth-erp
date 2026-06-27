// البند ٤ شريحة ٢ — صيانة المركبة → GL حسب costBearer — assertion على سطور القيد.
//
// الدستور م٣ (مطلق): أي ترحيل يمسّ الدفتر يُشحن **مع** assertion على سطور القيد.
// تُمارِس هذه الحالة fleetEngine.postMaintenanceGL على Postgres حقيقي وتُثبت، لكل
// costBearer، أن القيد **متوازن** ويوجَّه للجهة الصحيحة (مبدأ إبراهيم: التوجيه يقرّر
// الحساب):
//   • company  → مدين حساب صيانة المركبة، دائن النقد.
//   • insurance → مدين ذمة مدينة، دائن **نفس** حساب صيانة المركبة (التعويض يقاصّ
//     الكلفة) — إثبات أن الفرع قلب الجهة (مبدأ ١).
// والترحيل idempotent عبر sourceKey (إعادة الترحيل لا تُكرّر القيد).
//
// التفعيل: مقيّد بقاعدة الاختبار القابلة للإسقاط (منفذ 54329 / علامة *_test)، مثل
// بقية حِزَم *.dynamic. يُتخطّى (لا يفشل) بدونها.
//
//   pnpm db:provision-agent
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server test tests/integration/fleetMaintenanceGlByCostBearer.dynamic.test.ts

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("Fleet maintenance materialise posts a balanced GL routed by costBearer", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let fleetEngine: typeof import("../../src/lib/engines/fleetEngine.js").fleetEngine;

  let companyId: number;
  let branchId: number;
  const vehicleId = 990501; // tag only — postMaintenanceGL needs no real row.

  async function linesFor(maintenanceId: number) {
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "sourceKey"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [`fleet:maintenance:${maintenanceId}`, companyId]);
    expect(je, "journal entry not posted").toBeTruthy();
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
      [`Maint GL Co ${Date.now()}`]);
    companyId = cid;
    await bootstrapCompany(companyId, "Maint GL Co");
    const [{ id: bid }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = bid;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'فترة الاختبار', '2020-01-01', '2035-12-31', 'open')`, [companyId]);
  });

  it("company-borne maintenance: balanced, DEBIT maintenance expense / CREDIT cash", async () => {
    const maintenanceId = 800001;
    await fleetEngine.postMaintenanceGL(
      { companyId, branchId, createdBy: 0 },
      { id: maintenanceId, vehicleId, totalCost: 1200, type: "دورية", costBearer: "company" });

    const lines = await linesFor(maintenanceId);
    const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(1200, 2);
    expect(credit).toBeCloseTo(1200, 2);
    const debitLeg = lines.find((l) => Number(l.debit) > 0)!;
    const creditLeg = lines.find((l) => Number(l.credit) > 0)!;
    // مدين/دائن على حسابين متمايزين (لا قيد منحلّ).
    expect(debitLeg.accountCode).not.toBe(creditLeg.accountCode);
  });

  it("default (no costBearer) behaves as company-borne — backward compatible", async () => {
    const maintenanceId = 800002;
    await fleetEngine.postMaintenanceGL(
      { companyId, branchId, createdBy: 0 },
      { id: maintenanceId, vehicleId, totalCost: 300, type: "زيت" }); // no costBearer

    const lines = await linesFor(maintenanceId);
    const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(300, 2);
    expect(credit).toBeCloseTo(300, 2);
    // الجهة المدينة هي نفس حساب الصيانة المدين في حالة الشركة (السلوك السابق محفوظ).
    const companyDebit = (await linesFor(800001)).find((l) => Number(l.debit) > 0)!.accountCode;
    expect(lines.find((l) => Number(l.debit) > 0)!.accountCode).toBe(companyDebit);
  });

  it("insurance-borne maintenance: balanced, DEBIT receivable / CREDIT the maintenance account (recovery flip)", async () => {
    const companyDebit = (await linesFor(800001)).find((l) => Number(l.debit) > 0)!.accountCode;

    const insMaintId = 800003;
    await fleetEngine.postMaintenanceGL(
      { companyId, branchId, createdBy: 0 },
      { id: insMaintId, vehicleId, totalCost: 500, type: "حادث", costBearer: "insurance" });
    const insLines = await linesFor(insMaintId);

    const debit = insLines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = insLines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(500, 2);
    expect(credit).toBeCloseTo(500, 2);

    const insDebitLeg = insLines.find((l) => Number(l.debit) > 0)!;
    const insCreditLeg = insLines.find((l) => Number(l.credit) > 0)!;
    // الفرع قُلِب: حساب الصيانة الذي كان مدينًا في حالة الشركة صار دائنًا (تعويض)،
    // ومدينٌ جديد هو الذمة المدينة (مستردّة من التأمين).
    expect(insCreditLeg.accountCode).toBe(companyDebit);
    expect(insDebitLeg.accountCode).not.toBe(companyDebit);
  });

  it("is idempotent on sourceKey — re-posting the same maintenance returns the same JE", async () => {
    const replay = await fleetEngine.postMaintenanceGL(
      { companyId, branchId, createdBy: 0 },
      { id: 800001, vehicleId, totalCost: 1200, type: "دورية", costBearer: "company" });
    expect((replay as { alreadyExists?: boolean }).alreadyExists).toBe(true);

    // قيد نشط واحد فقط بنفس sourceKey.
    const active = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [companyId, `fleet:maintenance:800001`]);
    expect(active.length).toBe(1);
  });
});
