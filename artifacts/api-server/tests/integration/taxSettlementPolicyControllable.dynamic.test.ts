// VAT settlement policy + settlement posting — controllable + standard (live DB).
//
// Proves the wiring of lib/taxSettlementPolicy.ts into the finance-zatca routes:
//   1. GET  /tax-settlement/policy  → STANDARD default (incl. settlement account
//      2130) + read-only resolved refs (rate, output/input accounts).
//   2. PUT  /tax-settlement/policy  → partial update; unset fields stay dynamic;
//      rejects a bad frequency / out-of-range due-days / unknown account code.
//   3. GET  /tax-settlement/preview → proposed settlement journal for the period.
//   4. POST /tax-settlement/post    → books the balanced settlement journal
//      (DR output, CR input, net to settlement account) + idempotent re-post.
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
const CO_NAME = "__TAX_SETTLEMENT_POLICY_TEST__";
const CSRF = "tax-settlement-policy-csrf";

d("VAT settlement policy — controllable + standard default (live DB, HTTP)", () => {
  let request: any, app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let signToken: (p: any) => string;
  let bootstrapCompany: (cid: number, name: string, creator: any) => Promise<void>;
  const ids: { companyId?: number; branchId?: number; ownerToken?: string } = {};
  // Settlement period — keep it inside an OPEN financial period seeded below.
  const PERIOD = "2026-03";

  async function teardown(cid?: number) {
    if (!cid) return;
    for (const [sql, p] of [
      [`DELETE FROM journal_lines WHERE "journalId" IN (SELECT id FROM journal_entries WHERE "companyId"=$1)`, [cid]],
      [`DELETE FROM journal_entries WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM financial_periods WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM settings WHERE "scopeId"=$1 AND scope='company'`, [cid]],
      [`DELETE FROM rbac_user_roles WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM rbac_roles WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM employee_assignments WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId"=$1)`, [cid]],
      [`DELETE FROM employees WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM accounting_mappings WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM branches WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM companies WHERE id=$1`, [cid]],
    ] as Array<[string, unknown[]]>) await rawQuery(sql, p).catch(() => {});
  }

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    rawQuery = (await import("../../src/lib/rawdb.js")).rawQuery;
    rawExecute = (await import("../../src/lib/rawdb.js")).rawExecute;
    signToken = (await import("../../src/lib/auth.js")).signToken as any;
    bootstrapCompany = (await import("../../src/lib/companyBootstrap.js")).bootstrapCompany as any;

    const prior = await rawQuery<{ id: number }>(`SELECT id FROM companies WHERE name=$1`, [CO_NAME]).catch(() => []);
    for (const r of prior) await teardown(r.id);

    const [{ id: companyId }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1,'active') RETURNING id`, [CO_NAME]);
    ids.companyId = companyId;
    await bootstrapCompany(companyId, CO_NAME, null);
    const [{ id: branchId }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`, [companyId]);
    ids.branchId = branchId;
    const [{ id: roleId } = {} as { id: number }] = await rawQuery<{ id: number }>(
      `SELECT id FROM rbac_roles WHERE "companyId"=$1 AND role_key='owner' LIMIT 1`, [companyId]);
    const [{ id: empId }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email, status, "companyId", "branchId")
       VALUES ('tax owner','tax-owner@test.local','active',$1,$2) RETURNING id`, [companyId, branchId]);
    const [{ id: asnId }] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'مالك','owner',true,'active') RETURNING id`, [empId, companyId, branchId]);
    const [{ id: userId }] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId", email, "passwordHash", role, "isActive")
       VALUES ($1,'tax-owner@test.local','x','owner',true) RETURNING id`, [empId]);
    if (roleId) await rawQuery(
      `INSERT INTO rbac_user_roles ("userId","companyId",role_id,"branchId",is_primary)
       VALUES ($1,$2,$3,$4,true) ON CONFLICT ("userId","companyId",role_id) DO NOTHING`, [userId, companyId, roleId, branchId]);
    ids.ownerToken = signToken({ userId, assignmentId: asnId, role: "owner" });

    // OPEN financial period covering 2026-03 (the settlement post needs it open).
    await rawQuery(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1,'مارس 2026','2026-03-01','2026-03-31','open')`, [companyId]);

    // A dedicated postable settlement account (distinct from output VAT) so we can
    // exercise the customizable "general account" path the user approved.
    await rawQuery(
      `INSERT INTO chart_of_accounts ("companyId", code, name, type, level, "allowPosting")
       VALUES ($1,'2139','مستحق ضريبة القيمة المضافة للهيئة','liability',2,true)
       ON CONFLICT DO NOTHING`, [companyId]);

    // A posted journal in 2026-03 with output VAT (CR 2131 = 150) and input VAT
    // (DR 1180 = 40) → net VAT payable = 110.
    const { insertId: jeId } = await rawExecute(
      `INSERT INTO journal_entries ("companyId","branchId","createdBy",ref,description,type,"balancesApplied","createdAt",date)
       VALUES ($1,$2,$3,'TAX-SETTLE-SEED','vat settlement seed','manual',true,NOW(),'2026-03-15'::date)`,
      [companyId, branchId, asnId]);
    await rawExecute(
      `INSERT INTO journal_lines ("journalId","accountCode",debit,credit)
       VALUES ($1,'1101',1000,0), ($1,'4101',0,850), ($1,'2131',0,150), ($1,'1180',40,0)`,
      [jeId]);
  }, 90_000);

  afterAll(async () => { await teardown(ids.companyId); });

  const auth = (r: any) =>
    r.set("Authorization", `Bearer ${ids.ownerToken}`)
      .set("Cookie", `erp_csrf=${CSRF}`).set("x-csrf-token", CSRF);

  const getPolicy = () => auth(request(app).get("/api/finance/tax-settlement/policy"));
  const putPolicy = (body: any) => auth(request(app).put("/api/finance/tax-settlement/policy").send(body));
  const preview = (q = "") => auth(request(app).get(`/api/finance/tax-settlement/preview${q}`));
  const post = (body: any) => auth(request(app).post("/api/finance/tax-settlement/post").send(body));

  it("GET /tax-settlement/policy → STANDARD default + read-only resolved refs", async () => {
    const res = await getPolicy();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.key).toBe("finance.tax_settlement_policy");
    expect(res.body.standard).toEqual({ frequency: "monthly", filingDueDays: 30, settlementAccountCode: "2131" });
    expect(res.body.policy).toEqual(res.body.standard); // no company override yet
    // refs are sourced read-only from their existing authorities (not stored here).
    expect(typeof res.body.refs.vatRate).toBe("number");
    expect(res.body.refs.accounts.output).toBeTruthy();
    expect(res.body.refs.accounts.input).toBeTruthy();
    expect(res.body.refs.previewEndpoint).toBe("/finance/reports/vat-reconciliation");
  });

  it("PUT rejects an unknown settlement account code", async () => {
    const res = await putPolicy({ settlementAccountCode: "9999999" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("PUT rejects a non-postable (group) settlement account", async () => {
    const res = await putPolicy({ settlementAccountCode: "2130" }); // parent, allowPosting=false
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("PUT /tax-settlement/policy is a partial update — unset fields stay dynamic on the standard", async () => {
    const put = await putPolicy({ frequency: "quarterly" });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.policy.frequency).toBe("quarterly"); // saved
    expect(put.body.policy.filingDueDays).toBe(30);      // untouched → standard

    // a second partial PUT keeps the first override
    const put2 = await putPolicy({ filingDueDays: 60 });
    expect(put2.body.policy.filingDueDays).toBe(60);
    expect(put2.body.policy.frequency).toBe("quarterly"); // earlier override preserved

    // persisted + reflected on a fresh GET
    const get = await getPolicy();
    expect(get.body.policy.frequency).toBe("quarterly");
    expect(get.body.policy.filingDueDays).toBe(60);
  });

  it("PUT rejects an out-of-range filingDueDays (> 120)", async () => {
    const res = await putPolicy({ filingDueDays: 200 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("PUT rejects an invalid frequency", async () => {
    const res = await putPolicy({ frequency: "yearly" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("GET /tax-settlement/preview (default) → nets onto the output VAT account", async () => {
    // No custom settlement account yet → default 2131. Output 150 closes with the
    // settlement's net 110, leaving DR 2131=40 against CR 1180=40 (input cleared).
    const res = await preview(`?period=${PERIOD}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.outputVat).toBe(150);
    expect(res.body.inputVat).toBe(40);
    expect(res.body.netVat).toBe(110);
    expect(res.body.direction).toBe("payable");
    expect(res.body.accounts.settlement).toBe("2131");
    expect(res.body.alreadyPosted).toBe(false);
    const byCode = Object.fromEntries(res.body.lines.map((l: any) => [l.accountCode, l]));
    expect(byCode["2131"]).toMatchObject({ debit: 40, credit: 0 });
    expect(byCode["1180"]).toMatchObject({ debit: 0, credit: 40 });
  });

  it("POST /tax-settlement/post (custom distinct settlement account) → 3-line balanced journal; idempotent", async () => {
    // Point the settlement at the dedicated postable account 2139 (the user's
    // "general account" customization) → clean 3-line entry.
    const putAcct = await putPolicy({ settlementAccountCode: "2139" });
    expect(putAcct.status, JSON.stringify(putAcct.body)).toBe(200);
    expect(putAcct.body.policy.settlementAccountCode).toBe("2139");

    const prev = await preview(`?period=${PERIOD}`);
    expect(prev.body.accounts.settlement).toBe("2139");
    const pBy = Object.fromEntries(prev.body.lines.map((l: any) => [l.accountCode, l]));
    expect(pBy["2131"]).toMatchObject({ debit: 150, credit: 0 });
    expect(pBy["1180"]).toMatchObject({ debit: 0, credit: 40 });
    expect(pBy["2139"]).toMatchObject({ debit: 0, credit: 110 });

    const res = await post({ period: PERIOD });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.journalId).toBeTruthy();
    expect(res.body.ref).toBe(`VAT-SETTLE-${PERIOD}`);
    expect(res.body.alreadyPosted).toBe(false);

    // Assert the persisted journal lines tie out and balance: DR 2131=150,
    // CR 1180=40, CR 2139=110.
    const lines = await rawQuery<{ accountCode: string; debit: string; credit: string }>(
      `SELECT "accountCode", debit, credit FROM journal_lines WHERE "journalId"=$1`, [res.body.journalId]);
    const byCode = Object.fromEntries(lines.map((l) => [l.accountCode, l]));
    expect(Number(byCode["2131"].debit)).toBe(150);
    expect(Number(byCode["1180"].credit)).toBe(40);
    expect(Number(byCode["2139"].credit)).toBe(110);
    const totDr = lines.reduce((s, l) => s + Number(l.debit), 0);
    const totCr = lines.reduce((s, l) => s + Number(l.credit), 0);
    expect(totDr).toBe(totCr); // balanced

    // Idempotent: a second post returns the same journal, books nothing new.
    const res2 = await post({ period: PERIOD });
    expect(res2.status).toBe(200);
    expect(res2.body.alreadyPosted).toBe(true);
    expect(res2.body.journalId).toBe(res.body.journalId);
    const dup = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND ref=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, `VAT-SETTLE-${PERIOD}`]);
    expect(dup.length, "no duplicate settlement journal").toBe(1);

    // preview now reflects the posted state.
    const prevPosted = await preview(`?period=${PERIOD}`);
    expect(prevPosted.body.alreadyPosted).toBe(true);
    expect(prevPosted.body.postedJournalId).toBe(res.body.journalId);
  });

  it("POST rejects a period outside any open financial period", async () => {
    const res = await post({ period: "2030-01" }); // no open period seeded for 2030
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
