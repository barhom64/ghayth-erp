// Monthly FX revaluation auto-compute cron (monthly_fx_revaluation_compute).
//
// Proves the cron AUTO-COMPUTES + QUEUES a period-end FX revaluation (writes
// fx_revaluation_log with journalEntryId NULL) WITHOUT auto-posting to the GL —
// the post stays human-reviewed via the posting queue. Idempotent: a second run
// adds nothing (shared double-post guards).
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
const CO_NAME = "__FX_REVAL_COMPUTE_CRON_TEST__";
const JOB = "monthly_fx_revaluation_compute";

d("monthly FX revaluation auto-compute cron (bundled handler, live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let triggerJobByName: (n: string) => Promise<{ success: boolean; result?: string; error?: string }>;
  let bootstrapCompany: (cid: number, name: string, creator: any) => Promise<void>;
  let currentPeriod: () => string;
  const ids: { companyId?: number; branchId?: number } = {};

  async function teardown(cid?: number) {
    if (!cid) return;
    for (const [sql, p] of [
      [`DELETE FROM fx_revaluation_lines WHERE "revaluationLogId" IN (SELECT id FROM fx_revaluation_log WHERE "companyId"=$1)`, [cid]],
      [`DELETE FROM fx_revaluation_log WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM fx_revaluations WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM fx_rates WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM invoices WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM financial_periods WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM audit_logs WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM employee_assignments WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM employees WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM accounting_mappings WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM branches WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM companies WHERE id=$1`, [cid]],
    ] as Array<[string, unknown[]]>) await rawQuery(sql, p).catch(() => {});
  }

  beforeAll(async () => {
    rawQuery = (await import("../../src/lib/rawdb.js")).rawQuery;
    triggerJobByName = (await import("../../src/lib/cronScheduler.js")).triggerJobByName as any;
    bootstrapCompany = (await import("../../src/lib/companyBootstrap.js")).bootstrapCompany as any;
    currentPeriod = (await import("../../src/lib/businessHelpers.js")).currentPeriod as any;

    const prior = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE name=$1`, [CO_NAME]).catch(() => []);
    for (const r of prior) await teardown(r.id);

    const [{ id: companyId }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`, [CO_NAME]);
    ids.companyId = companyId;
    await bootstrapCompany(companyId, CO_NAME, null);
    const [{ id: branchId }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    ids.branchId = branchId;

    // finance system user (cron's ranBy lookup).
    const [{ id: empId }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email, status, "companyId", "branchId")
       VALUES ('fx owner','fx-owner@test.local','active',$1,$2) RETURNING id`, [companyId, branchId]);
    await rawQuery(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'مدير مالي','finance_manager',true,'active')`, [empId, companyId, branchId]);

    const period = currentPeriod();
    const [y, m] = period.split("-").map(Number);
    const startDate = `${period}-01`;
    const endDate = new Date(y, m, 0).toISOString().slice(0, 10); // last day of month

    // OPEN financial period covering the current month (cron needs the FK + open gate).
    await rawQuery(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1,$2,$3::date,$4::date,'open')`, [companyId, `FY ${period}`, startDate, endDate]);

    // closing rate USD→SAR as of period end (booked rate on the invoice differs → gain/loss ≠ 0).
    await rawQuery(
      `INSERT INTO fx_rates ("companyId","rateDate","fromCurrency","toCurrency",rate,type,"effectiveDate",source)
       VALUES ($1,$2::date,'USD','SAR',3.75,'closing',$2::date,'manual')`, [companyId, endDate]);

    // open foreign-currency receivable: USD invoice, booked 3.50, outstanding 1000 USD.
    await rawQuery(
      `INSERT INTO invoices ("companyId","branchId",ref,currency,"exchangeRate",total,"paidAmount",status,"discountAmount","discountPercent","createdAt")
       VALUES ($1,$2,'FX-INV-1','USD',3.50,1000,0,'sent',0,0,$3::date)`, [companyId, branchId, startDate]);
  }, 90_000);

  afterAll(async () => { await teardown(ids.companyId); });

  it("auto-computes + QUEUES the revaluation (log, journalEntryId NULL) — NOT auto-posted to GL; idempotent", async () => {
    const res = await triggerJobByName(JOB);
    expect(res.success, JSON.stringify(res)).toBe(true);

    const logs = await rawQuery<{ id: number; journalEntryId: number | null }>(
      `SELECT id, "journalEntryId" FROM fx_revaluation_log WHERE "companyId"=$1`, [ids.companyId]);
    expect(logs.length, "exactly one revaluation queued for the period").toBe(1);
    expect(logs[0].journalEntryId, "queued only — NOT posted to GL by the cron").toBeNull();

    // The cron must NOT have written the hard double-post guard row (that happens at POST).
    const posted = await rawQuery<{ id: number }>(`SELECT id FROM fx_revaluations WHERE "companyId"=$1`, [ids.companyId]);
    expect(posted.length, "cron does not auto-post (no fx_revaluations row)").toBe(0);

    // Lines were computed for the queued revaluation.
    const lines = await rawQuery<{ id: number }>(
      `SELECT id FROM fx_revaluation_lines WHERE "revaluationLogId"=$1`, [logs[0].id]);
    expect(lines.length).toBeGreaterThan(0);

    // Idempotency: a second run adds nothing (pending-queue guard).
    const res2 = await triggerJobByName(JOB);
    expect(res2.success).toBe(true);
    const after = await rawQuery<{ id: number }>(`SELECT id FROM fx_revaluation_log WHERE "companyId"=$1`, [ids.companyId]);
    expect(after.length, "no duplicate revaluation on re-run").toBe(1);
  }, 120_000);
});
