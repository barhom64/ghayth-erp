// VAT settlement policy — controllable + standard default (live DB, HTTP).
//
// Proves the wiring of lib/taxSettlementPolicy.ts into the finance-zatca routes:
//   1. GET  /tax-settlement/policy  → STANDARD default + read-only resolved refs
//      (rate from getCompanyVatRate, accounts from accounting_mappings).
//   2. PUT  /tax-settlement/policy  → partial update; unset fields stay dynamic.
//   3. PUT rejects an out-of-range filingDueDays (> 120) and a bad frequency.
//
// The policy governs ONLY the filing cadence — net-VAT preview keeps its existing
// home (GET /finance/reports/vat-reconciliation), so it is not retested here.
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
  let signToken: (p: any) => string;
  let bootstrapCompany: (cid: number, name: string, creator: any) => Promise<void>;
  const ids: { companyId?: number; branchId?: number; ownerToken?: string } = {};

  async function teardown(cid?: number) {
    if (!cid) return;
    for (const [sql, p] of [
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
  }, 90_000);

  afterAll(async () => { await teardown(ids.companyId); });

  const auth = (r: any) =>
    r.set("Authorization", `Bearer ${ids.ownerToken}`)
      .set("Cookie", `erp_csrf=${CSRF}`).set("x-csrf-token", CSRF);

  const getPolicy = () => auth(request(app).get("/api/finance/tax-settlement/policy"));
  const putPolicy = (body: any) => auth(request(app).put("/api/finance/tax-settlement/policy").send(body));

  it("GET /tax-settlement/policy → STANDARD default + read-only resolved refs", async () => {
    const res = await getPolicy();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.key).toBe("finance.tax_settlement_policy");
    expect(res.body.standard).toEqual({ frequency: "monthly", filingDueDays: 30 });
    expect(res.body.policy).toEqual(res.body.standard); // no company override yet
    // refs are sourced read-only from their existing authorities (not stored here).
    expect(typeof res.body.refs.vatRate).toBe("number");
    expect(res.body.refs.accounts.output).toBeTruthy();
    expect(res.body.refs.accounts.input).toBeTruthy();
    expect(res.body.refs.previewEndpoint).toBe("/finance/reports/vat-reconciliation");
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
});
