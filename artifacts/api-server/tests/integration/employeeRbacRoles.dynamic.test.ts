/**
 * Employee creation → RBAC multi-role grant — dynamic (real Postgres, HTTP).
 *
 * Drives the REAL POST /api/employees route as an owner over the live test DB
 * and proves the central rbacService.grantUserRole contract wired into Step
 * 8a-bis:
 *
 *   1. selectedRoleKeys=[A,B] (non-conflicting) → BOTH land in rbac_user_roles
 *      for the new employee's user, the FIRST is is_primary, and the login user
 *      row exists.
 *   2. selectedRoleKeys containing an SoD-conflicting pair (hr_manager +
 *      finance_manager) → the conflicting role is SOFT-rejected (not inserted),
 *      the employee is still created, and the non-conflicting roles ARE granted.
 *   3. NO selectedRoleKeys → unchanged legacy behaviour: exactly ONE derived
 *      role is bound (no regression).
 *
 * Each case runs in its OWN freshly-bootstrapped company and creates the FIRST
 * employee there, so the institutional-mandatoriness carve-out applies (no
 * positionId / categoryKey gymnastics) and the grants start from a clean slate.
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

const CO_PREFIX = "__EMP_RBAC_ROLES_TEST__";
const PFX = "emp-rbac-roles-";
const CSRF = "emp-rbac-roles-csrf";

interface Ctx {
  companyId: number;
  branchId: number;
  ownerUserId: number;
  ownerEmployeeId: number;
  ownerToken: string;
  positionId: number;
}

d("Employee creation → RBAC multi-role grant (live DB, HTTP, owner)", () => {
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

  /**
   * Fresh tenant + an ACTIVE owner user/token (auth needs an active assignment)
   * + a seeded position + a global employee category. We therefore satisfy the
   * institutional-mandatoriness fields (positionId + categoryKey) on every
   * create instead of relying on the bootstrap carve-out, so each test is
   * self-contained and the assertions key only on the RBAC grant behaviour.
   */
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
    // The create route issues hr.employee_code via numberingService; a fresh
    // bootstrap (no template company to clone from) has no scheme, so seed one.
    await rawQuery(
      `INSERT INTO numbering_schemes ("companyId","moduleKey","entityKey","displayNameAr","prefix","defaultEntityTable")
       VALUES ($1,'hr','employee_code','رقم الموظف','EMP','employees'),
              ($1,'hr','employee_contract','عقد الموظف','CTR','employment_contracts')
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
    // A position for the created employees' institutional binding.
    const [{ id: positionId }] = await rawQuery<{ id: number }>(
      `INSERT INTO positions ("companyId","positionKey","labelAr","level","isActive")
       VALUES ($1,$2,$3,50,TRUE)
       ON CONFLICT ("companyId","positionKey") DO UPDATE SET "isActive"=TRUE
       RETURNING id`,
      [companyId, `emp_${tag}`, `موظف ${tag}`],
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
    return { companyId, branchId, ownerUserId, ownerEmployeeId: ownerEmpId, ownerToken, positionId };
  }

  function createEmployee(ctx: Ctx, body: Record<string, unknown>) {
    return request(app)
      .post("/api/employees")
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

  async function userIdForEmployee(employeeId: number): Promise<number | null> {
    const rows = await rawQuery<{ id: number }>(
      `SELECT id FROM users WHERE "employeeId" = $1`,
      [employeeId],
    );
    return rows[0]?.id ?? null;
  }

  const baseBody = (ctx: Ctx, suffix: string) => ({
    name: `موظف ${suffix}`,
    phone: `05000${suffix}`,
    nationalId: `109900${suffix}`,
    nationality: "سعودي",
    email: `${PFX}${suffix}@test.local`,
    department: "الإدارة العامة",
    jobTitle: `مسمى ${suffix}`,
    contractType: "full_time",
    salary: 5000,
    branchId: ctx.branchId,
    // Institutional binding — satisfy the mandatory fields directly so the
    // create succeeds independent of the bootstrap carve-out.
    positionId: ctx.positionId,
    categoryKey: "worker", // seeded global category (migration 384)
    managerId: ctx.ownerEmployeeId, // a valid in-company employee (the owner)
  });

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    signToken = (await import("../../src/lib/auth.js")).signToken as any;
    bootstrapCompany = (await import("../../src/lib/companyBootstrap.js")).bootstrapCompany as any;

    // Clean any prior run.
    const prior = await rawQuery<{ id: number }>(
      `SELECT id FROM companies WHERE name LIKE $1`,
      [`${CO_PREFIX}%`],
    ).catch(() => []);
    for (const r of prior) await teardownCompany(r.id);
  }, 90_000);

  afterAll(async () => {
    for (const cid of provisioned) await teardownCompany(cid);
  });

  it("selectedRoleKeys=[A,B] (non-conflicting) → both bound, first is primary, user created", async () => {
    const ctx = await provision("A");
    const res = await createEmployee(ctx, {
      ...baseBody(ctx, "01"),
      selectedRoleKeys: ["warehouse_manager", "fleet_manager"],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const employeeId = res.body?.id ?? res.body?.employeeId;
    expect(employeeId, "create must return the employee id").toBeTruthy();

    const userId = await userIdForEmployee(employeeId);
    expect(userId, "a login user must be created for the employee").toBeTruthy();

    const rows = await rolesForUser(ctx, userId!);
    const keys = rows.map((r) => r.role_key);
    expect(keys).toContain("warehouse_manager");
    expect(keys).toContain("fleet_manager");
    expect(rows.length).toBe(2);

    const primaries = rows.filter((r) => r.is_primary).map((r) => r.role_key);
    expect(primaries).toEqual(["warehouse_manager"]); // first selected = primary
  }, 60_000);

  it("SoD-conflicting role in the list is soft-rejected; employee created; other roles granted", async () => {
    // hr_manager ↔ finance_manager is a seeded SEPARATION_OF_DUTIES pair.
    // hr_manager binds first, then finance_manager is rejected by the SoD gate
    // (it reads the just-bound hr_manager via the same transaction), and
    // warehouse_manager still binds after.
    const ctx = await provision("B");
    const res = await createEmployee(ctx, {
      ...baseBody(ctx, "02"),
      selectedRoleKeys: ["hr_manager", "finance_manager", "warehouse_manager"],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201); // NOT a 4xx — soft-fail
    const employeeId = res.body?.id ?? res.body?.employeeId;
    expect(employeeId).toBeTruthy();

    const userId = await userIdForEmployee(employeeId);
    expect(userId, "the employee is still created despite the SoD rejection").toBeTruthy();

    const keys = (await rolesForUser(ctx, userId!)).map((r) => r.role_key);
    expect(keys).toContain("hr_manager");          // granted (bound first)
    expect(keys).toContain("warehouse_manager");   // granted (no conflict)
    expect(keys).not.toContain("finance_manager"); // SoD-blocked, left for admin
  }, 60_000);

  it("no selectedRoleKeys → exactly one derived role (no regression)", async () => {
    const ctx = await provision("C");
    const res = await createEmployee(ctx, {
      ...baseBody(ctx, "03"),
      role: "warehouse_manager", // explicit single role, the legacy path
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const employeeId = res.body?.id ?? res.body?.employeeId;
    expect(employeeId).toBeTruthy();

    const userId = await userIdForEmployee(employeeId);
    expect(userId).toBeTruthy();

    const rows = await rolesForUser(ctx, userId!);
    expect(rows.length, "legacy path binds exactly one role").toBe(1);
    expect(rows[0].role_key).toBe("warehouse_manager");
    expect(rows[0].is_primary).toBe(true);
  }, 60_000);
});
