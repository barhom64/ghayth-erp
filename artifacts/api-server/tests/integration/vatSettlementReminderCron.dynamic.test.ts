// Monthly VAT settlement reminder cron (monthly_vat_settlement_reminder).
//
// Proves the cron notifies the finance manager when the just-ended period has VAT
// movement but no posted settlement journal — and STAYS SILENT once the period's
// settlement (VAT-SETTLE-{period}) has been posted. Notification only — no ledger.
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
const CO_NAME = "__VAT_SETTLE_REMINDER_CRON_TEST__";
const JOB = "monthly_vat_settlement_reminder";

d("monthly VAT settlement reminder cron (live DB)", () => {
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let triggerJobByName: (n: string) => Promise<{ success: boolean; result?: string; error?: string }>;
  let bootstrapCompany: (cid: number, name: string, creator: any) => Promise<void>;
  let currentPeriod: () => string;
  const ids: { companyId?: number; branchId?: number } = {};
  let prevPeriod = "";

  async function teardown(cid?: number) {
    if (!cid) return;
    for (const [sql, p] of [
      [`DELETE FROM notifications WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM journal_lines WHERE "journalId" IN (SELECT id FROM journal_entries WHERE "companyId"=$1)`, [cid]],
      [`DELETE FROM journal_entries WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM settings WHERE "scopeId"=$1 AND scope='company'`, [cid]],
      [`DELETE FROM rbac_user_roles WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId"=$1)`, [cid]],
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
    rawExecute = (await import("../../src/lib/rawdb.js")).rawExecute;
    triggerJobByName = (await import("../../src/lib/cronScheduler.js")).triggerJobByName as any;
    bootstrapCompany = (await import("../../src/lib/companyBootstrap.js")).bootstrapCompany as any;
    currentPeriod = (await import("../../src/lib/businessHelpers.js")).currentPeriod as any;

    // الفترة المنتهية = الشهر السابق (نفس ما يحسبه الـcron).
    const [cy, cm] = currentPeriod().split("-").map(Number);
    const py = cm === 1 ? cy - 1 : cy;
    const pm = cm === 1 ? 12 : cm - 1;
    prevPeriod = `${py}-${String(pm).padStart(2, "0")}`;

    const prior = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE name=$1`, [CO_NAME]).catch(() => []);
    for (const r of prior) await teardown(r.id);

    const [{ id: companyId }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`, [CO_NAME]);
    ids.companyId = companyId;
    await bootstrapCompany(companyId, CO_NAME, null);
    const [{ id: branchId }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    ids.branchId = branchId;

    // finance manager: employee + assignment + user + rbac_user_roles → finance_manager
    const [{ id: empId }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email, status, "companyId", "branchId")
       VALUES ('vat cfo','vat-cfo@test.local','active',$1,$2) RETURNING id`, [companyId, branchId]);
    await rawQuery(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'مدير مالي','finance_manager',true,'active')`, [empId, companyId, branchId]);
    const [{ id: userId }] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId", email, "passwordHash", role, "isActive")
       VALUES ($1,'vat-cfo@test.local','x','finance_manager',true) RETURNING id`, [empId]);
    const [{ id: roleId } = {} as { id: number }] = await rawQuery<{ id: number }>(
      `SELECT id FROM rbac_roles WHERE role_key='finance_manager' AND ("companyId"=$1 OR "companyId" IS NULL)
       ORDER BY ("companyId" IS NULL) ASC LIMIT 1`, [companyId]);
    if (roleId) await rawQuery(
      `INSERT INTO rbac_user_roles ("userId","companyId",role_id,"branchId",is_primary)
       VALUES ($1,$2,$3,$4,true) ON CONFLICT ("userId","companyId",role_id) DO NOTHING`, [userId, companyId, roleId, branchId]);

    // posted journal in the just-ended period with output VAT (CR 2131=150) and
    // input VAT (DR 1180=40) → net payable 110, no settlement journal yet.
    const { insertId: jeId } = await rawExecute(
      `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type,"balancesApplied","createdAt",date)
       VALUES ($1,$2,$3,'VAT-MOVE-SEED','vat movement seed','manual',true,NOW(),($4||'-15')::date)`,
      [companyId, branchId, null, prevPeriod]);
    await rawExecute(
      `INSERT INTO journal_lines ("journalId","accountCode",debit,credit)
       VALUES ($1,'1101',1000,0), ($1,'4101',0,850), ($1,'2131',0,150), ($1,'1180',40,0)`,
      [jeId]);
  }, 90_000);

  afterAll(async () => { await teardown(ids.companyId); });

  it("notifies the finance manager when the ended period is unsettled with VAT movement", async () => {
    const res = await triggerJobByName(JOB);
    expect(res.success, JSON.stringify(res)).toBe(true);
    const notes = await rawQuery<{ id: number; body: string }>(
      `SELECT id, body FROM notifications WHERE "companyId"=$1 AND type='vat_settlement_reminder'`,
      [ids.companyId]);
    expect(notes.length, "one reminder for the unsettled period").toBe(1);
    expect(notes[0].body).toContain(prevPeriod);
  }, 60_000);

  it("stays silent once the period's settlement has been posted", async () => {
    // Post the settlement journal for the period → cron must skip on re-run.
    await rawExecute(
      `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type,"balancesApplied","createdAt",date)
       VALUES ($1,$2,$3,$4,'vat settlement','manual',true,NOW(),($5||'-28')::date)`,
      [ids.companyId, ids.branchId, null, `VAT-SETTLE-${prevPeriod}`, prevPeriod]);

    const before = await rawQuery<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE "companyId"=$1 AND type='vat_settlement_reminder'`,
      [ids.companyId]);
    const res = await triggerJobByName(JOB);
    expect(res.success).toBe(true);
    const after = await rawQuery<{ n: string }>(
      `SELECT COUNT(*)::int AS n FROM notifications WHERE "companyId"=$1 AND type='vat_settlement_reminder'`,
      [ids.companyId]);
    expect(Number(after[0].n), "no new reminder once settled").toBe(Number(before[0].n));
  }, 60_000);
});
