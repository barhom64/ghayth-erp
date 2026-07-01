// دفعة تسوية المورّد (جدولة الدفع) تُموَّل من النقد التشغيلي (1111) لا من بنك
// الرواتب — assertion على سطور القيد (الدستور م٣).
//
// كان الطرف الدائن يُحلّ عبر غرض الرواتب "payroll_bank_payout" (→1121 بنك الرواتب،
// واحتياطي 1124 غير موجود في الشجرة) فيخلط دفعات الموردين بصرف الرواتب ويُفسد
// التسوية البنكية. بعد التصحيح (٢٠٢٦-٠٧-٠١ باعتماد إبراهيم) يستعمل موضعا التسوية
// (تشغيل الدفعات + جدولة الدفع) الغرضَ "vendor_payment_cash" (→1111 الصندوق
// الرئيسي). تُرحّل هذه الحالة جدولةَ دفعٍ فعلية عبر مسار HTTP على قاعدة رأس-main
// وتُثبت أن الدائن هو النقد 1111 لا 1121/1124، مع توازن القيد (DR 2111 = CR 1111).
//
// يعمل فقط حين تشير DATABASE_URL إلى عنقود الاختبار المزروع (نفس مرساة شركة
// vendorApNumberingPosting: الضياء، شركة 2).
//
//   pnpm db:provision-agent
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server test tests/integration/apSettlementCashLeg.dynamic.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// الضياء (شجرة SOCPA المزروعة) — نفس شركة مرساة الذمم الدائنة.
const COMPANY = 2;
const BRANCH = 2;
const PFX = "test-apsettle-";

d("AP settlement (schedule-payment) credits operational cash 1111, not payroll bank (live DB, HTTP)", () => {
  let request: any;
  let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let reverseAccountBalances: typeof import("../../src/lib/businessHelpers.js").reverseAccountBalances;

  let token: string;
  let supplierId: number;
  const created = { employeeId: 0, assignmentId: 0, userId: 0 };

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    ({ reverseAccountBalances } = await import("../../src/lib/businessHelpers.js"));
    const { signToken } = await import("../../src/lib/auth.js");

    await cleanup();

    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1,$2) RETURNING id`,
      [PFX + "owner", PFX + "owner@test.local"]);
    created.employeeId = emp.id;
    const [asg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'Owner','owner',TRUE,'active') RETURNING id`,
      [emp.id, COMPANY, BRANCH]);
    created.assignmentId = asg.id;
    const [usr] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive") VALUES ($1,$2,'x',TRUE) RETURNING id`,
      [emp.id, PFX + "owner@test.local"]);
    created.userId = usr.id;
    token = signToken({ userId: usr.id, assignmentId: asg.id, role: "owner" });

    const [sup] = await rawQuery<{ id: number }>(
      `INSERT INTO suppliers ("companyId",name) VALUES ($1,$2) RETURNING id`, [COMPANY, PFX + "supplier"]);
    supplierId = sup.id;
  }, 60_000);

  async function cleanup() {
    if (!rawExecute) return;
    // Rewind balances + delete the schedule-payment JEs this test posted, then the PO.
    const jes = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceType"='purchase_order_payment' AND ref LIKE $2`,
      [COMPANY, "SCHED-PAY-" + PFX + "%"]).catch(() => [] as { id: number }[]);
    for (const je of jes) {
      try { await reverseAccountBalances(COMPANY, je.id); } catch { /* not applied */ }
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [je.id]);
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [je.id]);
    }
    await rawExecute(`DELETE FROM purchase_orders WHERE "companyId"=$1 AND ref LIKE $2`, [COMPANY, PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM suppliers WHERE "companyId"=$1 AND name LIKE $2`, [COMPANY, PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM users WHERE email LIKE $1`, [PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM employee_assignments WHERE "employeeId" IN (SELECT id FROM employees WHERE email LIKE $1)`, [PFX + "%"]).catch(() => {});
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [PFX + "%"]).catch(() => {});
  }
  afterAll(cleanup);

  it("schedule-payment posts a balanced JE: DR purchase_vendor_ap (2111) / CR operational cash (1111)", async () => {
    const amount = 1000;
    const poRef = PFX + "po";
    const [po] = await rawQuery<{ id: number }>(
      `INSERT INTO purchase_orders ("companyId","branchId","supplierId",ref,status,"totalAmount")
       VALUES ($1,$2,$3,$4,'invoice_matched',$5) RETURNING id`,
      [COMPANY, BRANCH, supplierId, poRef, amount]);

    const res = await request(app)
      .post(`/api/finance/purchase-orders/${po.id}/schedule-payment`)
      .set("Authorization", `Bearer ${token}`)
      .send({ paymentDate: "2026-06-22", amount });
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL`,
      [COMPANY, `finance:sched_payment:${po.id}:2026-06-22:${amount}`]);
    expect(je, "schedule-payment JE not posted").toBeTruthy();

    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit::text, credit::text FROM journal_lines WHERE "journalId"=$1`, [je.id]);
    const debit = lines.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(debit).toBeCloseTo(amount, 2);
    expect(credit).toBeCloseTo(amount, 2);

    const drLeg = lines.find((l) => Number(l.debit) > 0)!;
    const crLeg = lines.find((l) => Number(l.credit) > 0)!;
    expect(drLeg.accountCode).toBe("2111");     // مدين ذمة المورّد
    expect(crLeg.accountCode).toBe("1111");      // دائن النقد التشغيلي (الصندوق الرئيسي)
    expect(crLeg.accountCode).not.toBe("1121");  // ليس بنك الرواتب (الخلل السابق)
    expect(crLeg.accountCode).not.toBe("1124");  // ولا الاحتياطي الوهمي غير الموجود
  });
});
