// Monthly HR accruals cron (monthly_hr_accruals) — dynamic (real Postgres).
//
// Exercises the BUNDLED cron handler via triggerJobByName so guard step 4 + the
// ledger-assertion gate cover it on every run. The cron automates hr.ts
// `/accruals/monthly`: per company, posts leave + EOS accruals via
// hrEngine.postMonthlyAccrualsGL, idempotent through the SHARED HR-ACCRUAL-{period}
// ref guard (so it never double-posts vs the manual endpoint or a re-run).
//
// Asserts the ACTUAL journal lines (the mandatory ledger gate): a balanced entry
// with EOS expense 5260 / leave expense 5270 on the debit side and EOS liability
// 2220 / leave liability 2150 on the credit side, then proves a second run posts
// nothing new (idempotency).
//
// Auto-skips unless DATABASE_URL points at the marker test DB and JWT_SECRET is set.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const CO_NAME = "__HR_ACCRUALS_CRON_TEST__";
const JOB = "monthly_hr_accruals";

d("monthly HR accruals cron (bundled handler, live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let triggerJobByName: (n: string) => Promise<{ success: boolean; result?: string; error?: string }>;
  let bootstrapCompany: (cid: number, name: string, creator: any) => Promise<void>;
  let currentPeriod: () => string;

  const ids: { companyId?: number; branchId?: number; employeeId?: number } = {};

  async function teardown(cid?: number) {
    if (!cid) return;
    const stmts: Array<[string, unknown[]]> = [
      [`DELETE FROM journal_lines WHERE "journalId" IN (SELECT id FROM journal_entries WHERE "companyId"=$1)`, [cid]],
      [`DELETE FROM journal_entries WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM audit_logs WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM employee_assignments WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM employees WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM accounting_mappings WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM financial_periods WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM branches WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM companies WHERE id=$1`, [cid]],
    ];
    for (const [sql, params] of stmts) await rawQuery(sql, params).catch(() => {});
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    triggerJobByName = (await import("../../src/lib/cronScheduler.js")).triggerJobByName as any;
    bootstrapCompany = (await import("../../src/lib/companyBootstrap.js")).bootstrapCompany as any;
    currentPeriod = (await import("../../src/lib/businessHelpers.js")).currentPeriod as any;

    // Clean any prior run.
    const prior = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE name = $1`, [CO_NAME]).catch(() => []);
    for (const r of prior) await teardown(r.id);

    const [{ id: companyId }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`,
      [CO_NAME],
    );
    ids.companyId = companyId;
    await bootstrapCompany(companyId, CO_NAME, null);
    const [{ id: branchId }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`,
      [companyId],
    );
    ids.branchId = branchId;

    // One finance employee with a salary — serves as BOTH the cron's system
    // user (role IN finance_manager/owner/…) AND the single accrual target, so
    // the expected totals are exactly this employee's EOS + leave.
    const [{ id: employeeId }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email, status, "companyId", "branchId")
       VALUES ('موظف الاستحقاق', 'hr-accrual-cron@test.local', 'active', $1, $2) RETURNING id`,
      [companyId, branchId],
    );
    ids.employeeId = employeeId;
    // hireDate ~1 year ago → yearsOfService ≤ 5 ⇒ EOS = salary/24.
    await rawQuery(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle",role,salary,"hireDate","isPrimary",status)
       VALUES ($1,$2,$3,'مدير مالي','finance_manager',12000,'2025-01-01',true,'active')`,
      [employeeId, companyId, branchId],
    );
  }, 90_000);

  afterAll(async () => { await teardown(ids.companyId); });

  it("posts a balanced accrual (DR 5260/5270, CR 2220/2150) and is idempotent on re-run", async () => {
    const res = await triggerJobByName(JOB);
    expect(res.success, JSON.stringify(res)).toBe(true);

    const period = currentPeriod();
    const ref = `HR-ACCRUAL-${period}`;
    const entries = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, ref],
    );
    expect(entries.length, "exactly one accrual journal for the period").toBe(1);
    const journalId = entries[0].id;

    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string; employeeId: number | null }>(
      `SELECT "accountCode", debit::text, credit::text, "employeeId" FROM journal_lines WHERE "journalId"=$1`,
      [journalId],
    );
    // per-employee detail: every accrual line carries the employee dimension.
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((l) => Number(l.employeeId) === ids.employeeId)).toBe(true);
    const debitOf = (code: string) => lines.filter((l) => l.accountCode === code).reduce((s, l) => s + Number(l.debit), 0);
    const creditOf = (code: string) => lines.filter((l) => l.accountCode === code).reduce((s, l) => s + Number(l.credit), 0);

    // salary 12000, < 5y service: EOS = 12000/24 = 500; leave = (12000/30)×(21/12) = 700.
    expect(debitOf("5260")).toBeCloseTo(500, 2);   // EOS expense
    expect(debitOf("5270")).toBeCloseTo(700, 2);   // leave expense
    expect(creditOf("2220")).toBeCloseTo(500, 2);  // EOS liability
    expect(creditOf("2150")).toBeCloseTo(700, 2);  // leave liability — NOT 2220 (migration 365)
    expect(creditOf("2220")).not.toBeCloseTo(700, 2); // guard: leave didn't land on the EOS liability

    const sumD = lines.reduce((s, l) => s + Number(l.debit), 0);
    const sumC = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(sumD).toBeCloseTo(sumC, 2);  // balanced
    expect(sumD).toBeCloseTo(1200, 2);

    // Idempotency — a second run posts NOTHING new (shared HR-ACCRUAL ref guard).
    const res2 = await triggerJobByName(JOB);
    expect(res2.success).toBe(true);
    const after = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, ref],
    );
    expect(after.length, "no double accrual on re-run").toBe(1);
  }, 120_000);
});
