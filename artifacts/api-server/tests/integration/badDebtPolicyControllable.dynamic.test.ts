// Bad-debt provision policy — controllable + standard default (live DB, HTTP).
//
// Proves the wiring of lib/badDebtPolicy.ts into GET /finance/bad-debt/preview:
//   1. No company setting → the STANDARD default policy is returned.
//   2. A per-company `finance.bad_debt_policy` setting overrides the standard.
//   3. A per-request override (query) beats the company setting.
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
const CO_NAME = "__BAD_DEBT_POLICY_TEST__";
const CSRF = "bad-debt-policy-csrf";

d("bad-debt policy — controllable + standard default (live DB, HTTP)", () => {
  let request: any, app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let signToken: (p: any) => string;
  let bootstrapCompany: (cid: number, name: string, creator: any) => Promise<void>;
  const ids: { companyId?: number; ownerToken?: string } = {};

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
    const [{ id: roleId } = {} as { id: number }] = await rawQuery<{ id: number }>(
      `SELECT id FROM rbac_roles WHERE "companyId"=$1 AND role_key='owner' LIMIT 1`, [companyId]);
    const [{ id: empId }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email, status, "companyId", "branchId")
       VALUES ('bad-debt owner','bad-debt-owner@test.local','active',$1,$2) RETURNING id`, [companyId, branchId]);
    const [{ id: asnId }] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'مالك','owner',true,'active') RETURNING id`, [empId, companyId, branchId]);
    const [{ id: userId }] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId", email, "passwordHash", role, "isActive")
       VALUES ($1,'bad-debt-owner@test.local','x','owner',true) RETURNING id`, [empId]);
    if (roleId) await rawQuery(
      `INSERT INTO rbac_user_roles ("userId","companyId",role_id,"branchId",is_primary)
       VALUES ($1,$2,$3,$4,true) ON CONFLICT ("userId","companyId",role_id) DO NOTHING`, [userId, companyId, roleId, branchId]);
    ids.ownerToken = signToken({ userId, assignmentId: asnId, role: "owner" });
  }, 90_000);

  afterAll(async () => { await teardown(ids.companyId); });

  const preview = (q = "") =>
    request(app).get(`/api/finance/bad-debt/preview${q}`)
      .set("Authorization", `Bearer ${ids.ownerToken}`)
      .set("Cookie", `erp_csrf=${CSRF}`).set("x-csrf-token", CSRF);

  it("no company setting → STANDARD default rates", async () => {
    const res = await preview();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.rates).toEqual({ current: 0, d30: 0.05, d60: 0.25, d90: 0.5, d90plus: 0.75 });
  });

  it("per-company setting overrides the standard", async () => {
    await rawQuery(
      `DELETE FROM settings WHERE key='finance.bad_debt_policy' AND scope='company' AND "scopeId"=$1`,
      [ids.companyId],
    );
    await rawQuery(
      `INSERT INTO settings (key, scope, "scopeId", value)
       VALUES ('finance.bad_debt_policy','company',$1,$2::jsonb)`,
      [ids.companyId, JSON.stringify({ d90plus: 1, d90: 0.6 })],
    );
    const res = await preview();
    expect(res.status).toBe(200);
    expect(res.body.rates.d90plus).toBe(1);   // company tightened
    expect(res.body.rates.d90).toBe(0.6);
    expect(res.body.rates.d30).toBe(0.05);    // untouched → standard
  });

  it("per-request override beats the company setting", async () => {
    const res = await preview("?rate90plus=0.8");
    expect(res.status).toBe(200);
    expect(res.body.rates.d90plus).toBe(0.8);  // query override wins over company's 1
    expect(res.body.rates.d90).toBe(0.6);      // company value where no override
  });

  // ── control surface: GET/PUT /finance/bad-debt/policy ──────────────────────
  const policy = () =>
    request(app).get("/api/finance/bad-debt/policy")
      .set("Authorization", `Bearer ${ids.ownerToken}`)
      .set("Cookie", `erp_csrf=${CSRF}`).set("x-csrf-token", CSRF);
  const putPolicy = (rates: any) =>
    request(app).put("/api/finance/bad-debt/policy")
      .set("Authorization", `Bearer ${ids.ownerToken}`)
      .set("Cookie", `erp_csrf=${CSRF}`).set("x-csrf-token", CSRF)
      .send({ rates });

  it("GET /bad-debt/policy returns the resolved rates + the standard reference", async () => {
    const res = await policy();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.key).toBe("finance.bad_debt_policy");
    expect(res.body.standard).toEqual({ current: 0, d30: 0.05, d60: 0.25, d90: 0.5, d90plus: 0.75 });
    // company override from the earlier test still in effect (d90plus=1, d90=0.6)
    expect(res.body.rates.d90plus).toBe(1);
  });

  it("PUT /bad-debt/policy is a partial update — unset buckets stay dynamic on the standard", async () => {
    // Clear the company row first so we start from pure standard.
    await rawQuery(`DELETE FROM settings WHERE key='finance.bad_debt_policy' AND scope='company' AND "scopeId"=$1`, [ids.companyId]);
    const put = await putPolicy({ d90plus: 0.9 });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    expect(put.body.rates.d90plus).toBe(0.9);   // saved
    expect(put.body.rates.d30).toBe(0.05);      // untouched → standard

    // persisted + applied by preview
    const prev = await preview();
    expect(prev.body.rates.d90plus).toBe(0.9);
    expect(prev.body.rates.d60).toBe(0.25);     // still standard

    // a second partial PUT keeps the first override
    const put2 = await putPolicy({ d60: 0.4 });
    expect(put2.body.rates.d60).toBe(0.4);
    expect(put2.body.rates.d90plus).toBe(0.9);  // earlier override preserved
  });

  it("PUT rejects an out-of-range rate (> 1)", async () => {
    const res = await putPolicy({ d90plus: 1.5 });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
});
