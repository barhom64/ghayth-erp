/**
 * Admin quick-onboard → RBAC multi-role grant with SoD — dynamic (real Postgres, HTTP).
 *
 * Drives the REAL POST /api/admin/onboard route as an owner over the live test
 * DB and proves that the onboard path now binds roles through the SAME central
 * rbacService.grantUserRole contract as employees.ts Step 8a-bis — so
 * Separation of Duties is ENFORCED here too (it previously raw-INSERTed every
 * role with NO SoD check):
 *
 *   1. roles=[A,B] (non-conflicting) → BOTH land in rbac_user_roles for the new
 *      user, the FIRST is is_primary, the login user row exists.
 *   2. roles containing an SoD-conflicting pair (hr_manager + finance_manager)
 *      → the conflicting role is SOFT-rejected (not inserted), the user is still
 *      onboarded (201), the non-conflicting roles ARE granted, and the response
 *      truthfully reports the skipped role.
 *   3. an unknown role key → the WHOLE request fails hard (422 ValidationError)
 *      and NO user is created — the up-front resolution guard (#1413 §6) is
 *      preserved.
 *
 * Each case runs in its OWN freshly-bootstrapped company so grants start clean.
 *
 * Auto-skips unless DATABASE_URL points at the marker test DB and JWT_SECRET is
 * set — mirrors the rest of the *.dynamic.test.ts suite.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const CO_PREFIX = "__ADMIN_ONBOARD_SOD_TEST__";
const PFX = "admin-onboard-sod-";
const CSRF = "admin-onboard-sod-csrf";

interface Ctx {
  companyId: number;
  branchId: number;
  ownerUserId: number;
  ownerEmployeeId: number;
  ownerToken: string;
}

d("Admin onboard → RBAC multi-role grant + SoD (live DB, HTTP, owner)", () => {
  let request: any;
  let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let signToken: (p: any) => string;
  let bootstrapCompany: (cid: number, name: string, creator: any) => Promise<void>;

  const provisioned: number[] = [];

  async function teardownCompany(cid: number) {
    if (!cid) return;
    const stmts: Array<[string, unknown[]]> = [
      [`DELETE FROM audit_logs WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM rbac_user_roles WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM rbac_role_grants WHERE role_id IN (SELECT id FROM rbac_roles WHERE "companyId"=$1)`, [cid]],
      [`DELETE FROM rbac_roles WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM subsidiary_accounts WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM refresh_tokens WHERE "userId" IN (SELECT u.id FROM users u JOIN employees e ON e.id=u."employeeId" WHERE e."companyId"=$1)`, [cid]],
      [`DELETE FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId"=$1)`, [cid]],
      [`DELETE FROM accounting_mappings WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM numbering_schemes WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM chart_of_accounts WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM employee_assignments WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM employees WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM branches WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM companies WHERE id=$1`, [cid]],
    ];
    for (const [sql, params] of stmts) await rawQuery(sql, params).catch(() => {});
  }

  /** Fresh tenant + an ACTIVE owner user/token (auth needs an active assignment). */
  async function provision(tag: string): Promise<Ctx> {
    const name = `${CO_PREFIX}${tag}`;
    const [{ id: companyId }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [name],
    );
    provisioned.push(companyId);
    await bootstrapCompany(companyId, name, null);
    const [{ id: branchId }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`,
      [companyId],
    );
    // onboard issues hr.employee_code via numberingService; a fresh bootstrap
    // has no scheme, so seed one (mirrors the employee-create dynamic test).
    await rawQuery(
      `INSERT INTO numbering_schemes ("companyId","moduleKey","entityKey","displayNameAr","prefix","defaultEntityTable")
       VALUES ($1,'hr','employee_code','رقم الموظف','EMP','employees')
       ON CONFLICT DO NOTHING`,
      [companyId],
    );

    const [{ id: ownerRoleId } = {} as { id: number }] = await rawQuery<{ id: number }>(
      `SELECT id FROM rbac_roles WHERE "companyId"=$1 AND role_key='owner' LIMIT 1`,
      [companyId],
    );
    if (!ownerRoleId) throw new Error(`No owner rbac_role seeded for company ${companyId}`);

    const [{ id: ownerEmpId }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email, status, "companyId", "branchId")
       VALUES ($1, $2, 'active', $3, $4) RETURNING id`,
      [`${PFX}owner-${tag}`, `${PFX}owner-${tag}@test.local`, companyId, branchId],
    );
    const [{ id: ownerAsgId }] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'مالك','owner',TRUE,'active') RETURNING id`,
      [ownerEmpId, companyId, branchId],
    );
    const [{ id: ownerUserId }] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId", email, "passwordHash", role, "isActive")
       VALUES ($1, $2, 'x', 'owner', TRUE) RETURNING id`,
      [ownerEmpId, `${PFX}owner-${tag}@test.local`],
    );
    await rawQuery(
      `INSERT INTO rbac_user_roles ("userId","companyId",role_id,"branchId",is_primary)
       VALUES ($1,$2,$3,$4,TRUE) ON CONFLICT ("userId","companyId",role_id) DO NOTHING`,
      [ownerUserId, companyId, ownerRoleId, branchId],
    );
    const ownerToken = signToken({ userId: ownerUserId, assignmentId: ownerAsgId, role: "owner" });
    return { companyId, branchId, ownerUserId, ownerEmployeeId: ownerEmpId, ownerToken };
  }

  function onboard(ctx: Ctx, body: Record<string, unknown>) {
    return request(app)
      .post("/api/admin/onboard")
      .set("Authorization", `Bearer ${ctx.ownerToken}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send(body);
  }

  async function rolesForUser(ctx: Ctx, userId: number): Promise<Array<{ role_key: string; is_primary: boolean }>> {
    return rawQuery<{ role_key: string; is_primary: boolean }>(
      `SELECT r.role_key, ur.is_primary
         FROM rbac_user_roles ur
         JOIN rbac_roles r ON r.id = ur.role_id
        WHERE ur."userId" = $1 AND ur."companyId" = $2
        ORDER BY ur.is_primary DESC, r.role_key`,
      [userId, ctx.companyId],
    );
  }

  const baseBody = (ctx: Ctx, suffix: string) => ({
    name: `موظف ${suffix}`,
    phone: `05000${suffix}`,
    nationalId: `209900${suffix}`,
    nationality: "سعودي",
    email: `${PFX}${suffix}@test.local`,
    jobTitle: `مسمى ${suffix}`,
    salary: 5000,
    branchId: ctx.branchId,
  });

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    signToken = (await import("../../src/lib/auth.js")).signToken as any;
    bootstrapCompany = (await import("../../src/lib/companyBootstrap.js")).bootstrapCompany as any;

    const prior = await rawQuery<{ id: number }>(
      `SELECT id FROM companies WHERE name LIKE $1`,
      [`${CO_PREFIX}%`],
    ).catch(() => []);
    for (const r of prior) await teardownCompany(r.id);
  }, 90_000);

  afterAll(async () => {
    for (const cid of provisioned) await teardownCompany(cid);
  });

  it("roles=[A,B] (non-conflicting) → both bound, first is primary, user created", async () => {
    const ctx = await provision("A");
    const res = await onboard(ctx, {
      ...baseBody(ctx, "01"),
      roles: [{ roleKey: "warehouse_manager" }, { roleKey: "fleet_manager" }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const userId = res.body?.userId;
    expect(userId, "onboard must return the user id").toBeTruthy();

    const rows = await rolesForUser(ctx, userId);
    const keys = rows.map((r) => r.role_key);
    expect(keys).toContain("warehouse_manager");
    expect(keys).toContain("fleet_manager");
    expect(rows.length).toBe(2);

    const primaries = rows.filter((r) => r.is_primary).map((r) => r.role_key);
    expect(primaries).toEqual(["warehouse_manager"]); // first wanted = primary
    expect(res.body?.skippedRoles ?? []).toEqual([]);
  }, 60_000);

  it("SoD-conflicting role is soft-rejected; user onboarded (201); other roles granted; response reports the skip", async () => {
    // hr_manager ↔ finance_manager is a seeded SEPARATION_OF_DUTIES pair.
    // hr_manager binds first, then finance_manager is rejected by the SoD gate
    // (it reads the just-bound hr_manager via the same transaction), and
    // warehouse_manager still binds after.
    const ctx = await provision("B");
    const res = await onboard(ctx, {
      ...baseBody(ctx, "02"),
      roles: [{ roleKey: "hr_manager" }, { roleKey: "finance_manager" }, { roleKey: "warehouse_manager" }],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201); // NOT a 4xx — soft-fail
    const userId = res.body?.userId;
    expect(userId, "the user is still onboarded despite the SoD rejection").toBeTruthy();

    const keys = (await rolesForUser(ctx, userId)).map((r) => r.role_key);
    expect(keys).toContain("hr_manager");          // granted (bound first)
    expect(keys).toContain("warehouse_manager");   // granted (no conflict)
    expect(keys).not.toContain("finance_manager"); // SoD-blocked, left for admin

    // The response must TRUTHFULLY surface the skipped role, not claim success.
    const skipped = (res.body?.skippedRoles ?? []).map((s: any) => s.roleKey);
    expect(skipped).toContain("finance_manager");
    expect(res.body?.roles ?? []).not.toContain("finance_manager");
  }, 60_000);

  it("unknown role key → whole request fails (422) and NO user is created (#1413 §6 preserved)", async () => {
    const ctx = await provision("C");
    const res = await onboard(ctx, {
      ...baseBody(ctx, "03"),
      roles: [{ roleKey: "warehouse_manager" }, { roleKey: "__no_such_role__" }],
    });
    // ValidationError (bad role key, resolved up-front) → 422 in this codebase.
    expect(res.status, JSON.stringify(res.body)).toBe(422);

    const created = await rawQuery<{ id: number }>(
      `SELECT id FROM users WHERE email = $1`,
      [`${PFX}03@test.local`],
    );
    expect(created.length, "a bad role key must abort the whole onboard").toBe(0);
  }, 60_000);
});
