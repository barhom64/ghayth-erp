// العقيدة «النظام مساعد لا عائق» (السند): POST /finance/vouchers بلا حساب مقابل
// يجب ألا يُرفض — يُوجَّه تلقائيًا حسب اتجاه السند إلى ورقة قابلة للترحيل:
//   صرف (payment) → 5399 «مصروفات عمومية أخرى»
//   قبض (receipt) → 4930 «إيرادات متنوعة»
// كان حارسٌ يرفض الفارغ («الحساب المحاسبي مطلوب»)؛ أُزيل (اعتمده إبراهيم).
// assertion على سطور القيد: الطرف المقابل يُرحَّل على الورقة الصحيحة ومتوازن.
// Activation: disposable test DB (port 54329 / *_test). Skips without it.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const M = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady = !!dbUrl && M.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET && (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

d("POST /finance/vouchers with NO counter account auto-routes by direction", () => {
  let request: any; let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let companyId = 0; let branchId = 0; let assignmentId = 0;
  let token = "";
  const TAG = `VCH-empty-${Date.now()}`;

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery; rawExecute = rawdb.rawExecute;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");
    const { signToken } = await import("../../src/lib/auth.js");

    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`, [`VchCo ${Date.now()}`]);
    companyId = cid;
    await bootstrapCompany(companyId, "VchCo");
    const [{ id: b }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = b;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status)
       VALUES ($1,'فترة الاختبار','2020-01-01','2035-12-31','open')`, [companyId]);
    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1,$2) RETURNING id`, [TAG, `${TAG}@t.local`]);
    const [asg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'Owner','owner',TRUE,'active') RETURNING id`, [emp.id, companyId, branchId]);
    assignmentId = asg.id;
    const [usr] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive") VALUES ($1,$2,'x',TRUE) RETURNING id`,
      [emp.id, `${TAG}@t.local`]);
    token = signToken({ userId: usr.id, assignmentId, role: "owner" });
  }, 60_000);

  afterAll(async () => {
    if (!rawExecute) return;
    const js = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND description LIKE $2`, [companyId, `%${TAG}%`]);
    for (const j of js) {
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [j.id]);
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [j.id]);
    }
    await rawExecute(`DELETE FROM users WHERE email LIKE $1`, [`${TAG}%`]);
    await rawExecute(`DELETE FROM employee_assignments WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [`${TAG}%`]);
  });

  async function postVoucher(type: "receipt" | "payment", desc: string) {
    const res = await request(app)
      .post("/api/finance/vouchers")
      .set("Authorization", `Bearer ${token}`)
      .send({
        type,
        amount: 100,
        method: "cash",
        sourceAccountCode: "1111", // cash box (صندوق) — matches نقدي
        branchId,
        description: desc,
        date: "2024-06-01",
        // NO accountCode — the point of the test.
      });
    return res;
  }

  async function counterLeg(desc: string, wantSide: "debit" | "credit") {
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND description LIKE $2 ORDER BY id DESC LIMIT 1`,
      [companyId, `%${desc}%`]);
    expect(je?.id, "a journal entry must have been posted").toBeTruthy();
    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId"=$1`, [je.id]);
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr).toBeCloseTo(cr, 2);          // balanced
    expect(dr).toBeGreaterThan(0);
    return lines.find((l) => Number(wantSide === "debit" ? l.debit : l.credit) > 0 &&
      l.accountCode !== "1111");             // the non-cash leg on the wanted side
  }

  it("a receipt voucher with no counter posts the credit leg to 4930 (إيرادات متنوعة)", async () => {
    const desc = `${TAG}-receipt`;
    const res = await postVoucher("receipt", desc);
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(400);
    const leg = await counterLeg(desc, "credit");
    expect(leg?.accountCode).toBe("4930");
    const [acc] = await rawQuery<{ allowPosting: boolean }>(
      `SELECT "allowPosting" FROM chart_of_accounts WHERE "companyId"=$1 AND code='4930'`, [companyId]);
    expect(acc?.allowPosting).toBe(true);
  });

  it("a payment voucher with no counter posts the debit leg to 5399 (مصروفات عمومية أخرى)", async () => {
    const desc = `${TAG}-payment`;
    const res = await postVoucher("payment", desc);
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(400);
    const leg = await counterLeg(desc, "debit");
    expect(leg?.accountCode).toBe("5399");
    const [acc] = await rawQuery<{ allowPosting: boolean }>(
      `SELECT "allowPosting" FROM chart_of_accounts WHERE "companyId"=$1 AND code='5399'`, [companyId]);
    expect(acc?.allowPosting).toBe(true);
  });
});
