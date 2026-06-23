// العقيدة «النظام مساعد لا عائق»: POST /finance/expenses بلا accountCode يجب ألا
// يُرفض. كان حارسٌ متناقض (سطر 985) يرمي «لا يمكن صرف بدون حساب محاسبي واضح»
// بينما المعالج نفسه يوجّه الفارغ تلقائيًا إلى 5399 «مصروفات عمومية أخرى» (سطر
// ~1218). أُزيل الحارس (Codex P1، اعتمده إبراهيم). هذا الاختبار assertion على
// سطور القيد: المصروف بلا حساب يُرحَّل على ورقة قابلة للترحيل (5399) ومتوازن.
// Activation: disposable test DB (port 54329 / *_test). Skips without it.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const M = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady = !!dbUrl && M.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET && (process.env.JWT_SECRET ?? "").length >= 32;
const d = dbReady ? describe : describe.skip;

d("POST /finance/expenses with NO accountCode auto-routes to 5399 (helper-not-obstacle)", () => {
  let request: any; let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let companyId = 0; let branchId = 0; let assignmentId = 0; let userId = 0;
  let token = "";
  const REF_DESC = `EXP-empty-acct-${Date.now()}`;

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery; rawExecute = rawdb.rawExecute;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");
    const { signToken } = await import("../../src/lib/auth.js");

    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`, [`EmptyAcct Co ${Date.now()}`]);
    companyId = cid;
    await bootstrapCompany(companyId, "EmptyAcct Co");
    const [{ id: b }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    branchId = b;
    await rawExecute(
      `INSERT INTO financial_periods ("companyId",name,"startDate","endDate",status)
       VALUES ($1,'فترة الاختبار','2020-01-01','2035-12-31','open')`, [companyId]);
    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1,$2) RETURNING id`, [REF_DESC, `${REF_DESC}@t.local`]);
    const [asg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'Owner','owner',TRUE,'active') RETURNING id`, [emp.id, companyId, branchId]);
    assignmentId = asg.id;
    const [usr] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive") VALUES ($1,$2,'x',TRUE) RETURNING id`,
      [emp.id, `${REF_DESC}@t.local`]);
    userId = usr.id;
    token = signToken({ userId, assignmentId, role: "owner" });
  }, 60_000);

  afterAll(async () => {
    if (!rawExecute) return;
    const js = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND description LIKE $2`, [companyId, `%${REF_DESC}%`]);
    for (const j of js) {
      await rawExecute(`DELETE FROM journal_lines WHERE "journalId"=$1`, [j.id]);
      await rawExecute(`DELETE FROM journal_entries WHERE id=$1`, [j.id]);
    }
    await rawExecute(`DELETE FROM users WHERE email LIKE $1`, [`${REF_DESC}%`]);
    await rawExecute(`DELETE FROM employee_assignments WHERE "companyId"=$1`, [companyId]);
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [`${REF_DESC}%`]);
  });

  it("is NOT rejected with «لا يمكن صرف بدون حساب», and posts the expense leg to postable 5399", async () => {
    const res = await request(app)
      .post("/api/finance/expenses")
      .set("Authorization", `Bearer ${token}`)
      .send({
        // NO accountCode — the whole point.
        amount: 100,
        paymentMethod: "cash",
        sourceAccountCode: "1111",
        costCenter: "تشغيل عام",
        branchId,
        expenseType: "operational",
        operationType: "expense",
        description: `مصروف بلا حساب — ${REF_DESC}`,
        date: "2024-06-01",
      });

    // The fix: no longer a 400 «لا يمكن صرف بدون حساب محاسبي واضح».
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(400);

    // Assertion on the journal lines: the expense (debit) leg landed on 5399,
    // a REAL postable leaf — not a dead/rejected journal.
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND description LIKE $2 ORDER BY id DESC LIMIT 1`,
      [companyId, `%${REF_DESC}%`]);
    expect(je?.id, "a journal entry must have been posted").toBeTruthy();

    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId"=$1`, [je.id]);
    const dr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const cr = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(dr).toBeCloseTo(cr, 2);                       // balanced
    expect(dr).toBeGreaterThan(0);

    const expenseLeg = lines.find((l) => l.accountCode === "5399");
    expect(expenseLeg, "the empty-account expense must post to 5399").toBeTruthy();
    const [acc] = await rawQuery<{ allowPosting: boolean }>(
      `SELECT "allowPosting" FROM chart_of_accounts WHERE "companyId"=$1 AND code='5399'`, [companyId]);
    expect(acc?.allowPosting).toBe(true);                // postable leaf, not a dead parent
  });
});
