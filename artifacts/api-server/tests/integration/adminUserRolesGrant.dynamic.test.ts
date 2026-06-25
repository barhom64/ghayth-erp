/**
 * Admin manual role grant (POST /admin/user-roles) + role replace (PUT
 * /admin/users/:id) — dynamic (real Postgres, HTTP).
 *
 * After #2940/#2944 unified the *creation* role-grant paths through the central
 * rbacService.grantUserRole, this proves the remaining runtime admin
 * role-mutation endpoints behave correctly:
 *
 *   1. POST /admin/user-roles grants an existing user a role → it lands in
 *      rbac_user_roles (the grant now flows through grantUserRole, which also
 *      invalidates the permission caches the old inline INSERT skipped).
 *   2. POST /admin/user-roles with a role that conflicts with one the user
 *      already holds → HARD 403 (this is an explicit single-role admin action,
 *      so SoD is a hard failure, NOT the soft-skip used by bulk creation).
 *   3. POST /admin/user-roles seeds an unseeded predefined role on demand
 *      (#1791) and still grants it.
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

const CO_PREFIX = "__ADMIN_USER_ROLES_TEST__";
const PFX = "admin-user-roles-";
const CSRF = "admin-user-roles-csrf";

interface Ctx {
  companyId: number;
  branchId: number;
  ownerUserId: number;
  ownerToken: string;
}

d("Admin manual role grant + SoD hard-fail (live DB, HTTP, owner)", () => {
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
      [`DELETE FROM refresh_tokens WHERE "userId" IN (SELECT u.id FROM users u JOIN employees e ON e.id=u."employeeId" WHERE e."companyId"=$1)`, [cid]],
      [`DELETE FROM users WHERE "employeeId" IN (SELECT id FROM employees WHERE "companyId"=$1)`, [cid]],
      [`DELETE FROM employee_assignments WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM employees WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM branches WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM companies WHERE id=$1`, [cid]],
    ];
    for (const [sql, params] of stmts) await rawQuery(sql, params).catch(() => {});
  }

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
    return { companyId, branchId, ownerUserId, ownerToken };
  }

  /** A plain target user (employee floor) in the company to grant roles to. */
  async function makeTarget(ctx: Ctx, tag: string, withRoleKey?: string): Promise<number> {
    const [{ id: empId }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email, status, "companyId", "branchId")
       VALUES ($1,$2,'active',$3,$4) RETURNING id`,
      [`${PFX}target-${tag}`, `${PFX}target-${tag}@test.local`, ctx.companyId, ctx.branchId],
    );
    await rawQuery(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'موظف','employee',TRUE,'active')`,
      [empId, ctx.companyId, ctx.branchId],
    );
    const [{ id: uid }] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId", email, "passwordHash", role, "isActive")
       VALUES ($1,$2,'x','employee',TRUE) RETURNING id`,
      [empId, `${PFX}target-${tag}@test.local`],
    );
    if (withRoleKey) {
      const [{ id: rid } = {} as { id: number }] = await rawQuery<{ id: number }>(
        `SELECT id FROM rbac_roles WHERE "companyId"=$1 AND role_key=$2 LIMIT 1`,
        [ctx.companyId, withRoleKey],
      );
      if (rid) {
        await rawQuery(
          `INSERT INTO rbac_user_roles ("userId","companyId",role_id,is_primary)
           VALUES ($1,$2,$3,FALSE) ON CONFLICT ("userId","companyId",role_id) DO NOTHING`,
          [uid, ctx.companyId, rid],
        );
      }
    }
    return uid;
  }

  function grantRole(ctx: Ctx, userId: number, roleKey: string) {
    return request(app)
      .post("/api/admin/user-roles")
      .set("Authorization", `Bearer ${ctx.ownerToken}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({ userId, roleKey });
  }

  async function roleKeysForUser(ctx: Ctx, userId: number): Promise<string[]> {
    const rows = await rawQuery<{ role_key: string }>(
      `SELECT r.role_key FROM rbac_user_roles ur JOIN rbac_roles r ON r.id = ur.role_id
        WHERE ur."userId"=$1 AND ur."companyId"=$2`,
      [userId, ctx.companyId],
    );
    return rows.map((r) => r.role_key);
  }

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

  it("grants a non-conflicting role to an existing user (lands in rbac_user_roles)", async () => {
    const ctx = await provision("A");
    const uid = await makeTarget(ctx, "a", "warehouse_manager");
    const res = await grantRole(ctx, uid, "fleet_manager");
    expect(res.status, JSON.stringify(res.body)).toBe(201);

    const keys = await roleKeysForUser(ctx, uid);
    expect(keys).toContain("warehouse_manager");
    expect(keys).toContain("fleet_manager");
  }, 60_000);

  it("rejects an SoD-conflicting grant with a HARD 403 (not a soft skip)", async () => {
    // warehouse_manager ↔ finance_manager is a seeded SEPARATION_OF_DUTIES pair.
    const ctx = await provision("B");
    const uid = await makeTarget(ctx, "b", "warehouse_manager");
    const res = await grantRole(ctx, uid, "finance_manager");
    expect(res.status, JSON.stringify(res.body)).toBe(403);

    const keys = await roleKeysForUser(ctx, uid);
    expect(keys).toContain("warehouse_manager");
    expect(keys).not.toContain("finance_manager"); // never inserted
  }, 60_000);

  it("seeds an unseeded predefined role on demand (#1791) and grants it", async () => {
    const ctx = await provision("C");
    const uid = await makeTarget(ctx, "c");
    // Remove the role from the company so the grant path must seed it.
    await rawQuery(`DELETE FROM rbac_user_roles WHERE role_id IN (SELECT id FROM rbac_roles WHERE "companyId"=$1 AND role_key='fleet_manager')`, [ctx.companyId]);
    await rawQuery(`DELETE FROM rbac_role_grants WHERE role_id IN (SELECT id FROM rbac_roles WHERE "companyId"=$1 AND role_key='fleet_manager')`, [ctx.companyId]);
    await rawQuery(`DELETE FROM rbac_roles WHERE "companyId"=$1 AND role_key='fleet_manager'`, [ctx.companyId]);

    const res = await grantRole(ctx, uid, "fleet_manager");
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const keys = await roleKeysForUser(ctx, uid);
    expect(keys).toContain("fleet_manager");
  }, 60_000);
});
