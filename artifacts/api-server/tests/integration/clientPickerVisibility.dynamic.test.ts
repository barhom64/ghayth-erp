// #2134 — the client added to a company MUST be visible and selectable in the
// invoice form's client picker. Drives the REAL routes the picker uses over
// HTTP on the live DB, as a real finance_manager (the role that creates
// invoices), and proves the three failure layers stay fixed:
//   1. role/module scope — finance_manager reaches GET /clients (was a double
//      403: the /clients mount required the CRM *module* and the role had no
//      crm.clients *grant* → the picker rendered EMPTY for finance users);
//   2. quick-create — «+ عميل جديد» with optional fields left blank works
//      (an empty-string email used to 422 the create, so the client silently
//      never existed) and the row lands in the SAME company;
//   3. the picker's server-side search finds a client OUTSIDE the 500-row
//      alphabetical preload window (it was invisible AND unfindable before);
//   4. company isolation — another company's client never appears, even with
//      a tampered ?companyIds= filter.
// Activates only on the test cluster.
import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY = 2;        // Al-Diyaa — the invoicing company (SOCPA chart)
const OTHER_COMPANY = 1;  // foreign company for the isolation assertions
const BRANCH = 2;
const PFX = "test-2134-";
const CSRF = "test-2134-csrf";

d("#2134 — client visibility in the invoice picker (live DB, HTTP, finance_manager)", () => {
  let request: any;
  let app: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let withTransaction: typeof import("../../src/lib/rawdb.js").withTransaction;

  let token: string;
  let fmRoleId: number;
  let seededClientId: number;
  let foreignClientId: number;

  const listClients = (qs = "limit=500") =>
    request(app).get(`/api/clients?${qs}`).set("Authorization", `Bearer ${token}`);

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    withTransaction = rawdb.withTransaction;
    const { signToken } = await import("../../src/lib/auth.js");
    const { seedRolesAndGrantsV2 } = await import("../../src/lib/rbac/autoMigrate.js");

    await cleanup();

    // The REAL role-seeding path (new-tenant case): seeds finance_manager for
    // company 2 with the updated defaults — including the narrow crm.clients
    // read+create grant.
    await withTransaction(async (tx) => {
      await seedRolesAndGrantsV2(tx as any, COMPANY);
    });
    const [role] = await rawQuery<{ id: number }>(
      `SELECT id FROM rbac_roles WHERE "companyId"=$1 AND role_key='finance_manager'`, [COMPANY]);
    expect(role, "finance_manager role must exist for company 2").toBeTruthy();
    fmRoleId = role.id;

    // a finance_manager user bound in RBAC v2 (no owner shortcuts)
    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, email) VALUES ($1,$2) RETURNING id`, [PFX + "fm", PFX + "fm@test.local"]);
    const [asg] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'FM','finance_manager',TRUE,'active') RETURNING id`, [emp.id, COMPANY, BRANCH]);
    const [usr] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive") VALUES ($1,$2,'x',TRUE) RETURNING id`,
      [emp.id, PFX + "fm@test.local"]);
    await rawExecute(
      `INSERT INTO rbac_user_roles ("userId","companyId",role_id,"branchId",is_primary)
       VALUES ($1,$2,$3,$4,true) ON CONFLICT DO NOTHING`, [usr.id, COMPANY, fmRoleId, BRANCH]);
    token = signToken({ userId: usr.id, assignmentId: asg.id, role: "finance_manager" });

    // a pre-existing client in the invoicing company + a foreign one
    const [c2] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId",name,type) VALUES ($1,$2,'individual') RETURNING id`,
      [COMPANY, PFX + "عميل-الضياء"]);
    seededClientId = c2.id;
    const [c1] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId",name,type) VALUES ($1,$2,'individual') RETURNING id`,
      [OTHER_COMPANY, PFX + "عميل-الشركة-الأخرى"]);
    foreignClientId = c1.id;
  }, 60_000);

  afterAll(cleanup);

  async function cleanup() {
    if (!rawExecute) return;
    // chart accounts auto-opened for clients created over HTTP, then the rows
    const subs = await rawQuery<{ accountId: number }>(
      `SELECT "accountId" FROM subsidiary_accounts WHERE "companyId"=$1 AND "entityType"='client'
        AND "entityId" IN (SELECT id FROM clients WHERE name LIKE $2)`, [COMPANY, PFX + "%"]);
    await rawExecute(
      `DELETE FROM subsidiary_accounts WHERE "companyId"=$1 AND "entityType"='client'
        AND "entityId" IN (SELECT id FROM clients WHERE name LIKE $2)`, [COMPANY, PFX + "%"]);
    for (const s of subs) await rawExecute(`DELETE FROM chart_of_accounts WHERE id=$1`, [s.accountId]);
    await rawExecute(`DELETE FROM clients WHERE name LIKE $1`, [PFX + "%"]);
    await rawExecute(`DELETE FROM rbac_user_roles WHERE "userId" IN (SELECT id FROM users WHERE email LIKE $1)`, [PFX + "%"]);
    await rawExecute(`DELETE FROM users WHERE email LIKE $1`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employee_assignments WHERE "employeeId" IN (SELECT id FROM employees WHERE email LIKE $1)`, [PFX + "%"]);
    await rawExecute(`DELETE FROM employees WHERE email LIKE $1`, [PFX + "%"]);
  }

  it("finance_manager reaches the picker's list (no module/role 403) and sees the company's client", async () => {
    const res = await listClients();
    expect(res.status, "GET /clients must not 403 for finance_manager — the picker was empty exactly because of this").toBe(200);
    const ids = (res.body?.data ?? []).map((r: any) => r.id);
    expect(ids).toContain(seededClientId);
  });

  it("the migration backfills an existing finance_manager role that lacks the grant (idempotently)", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const sql = readFileSync(path.resolve(here, "../../src/migrations/314_finance_manager_crm_clients_grant.sql"), "utf8");

    // the authz engine caches grants per (user, company, cache-version) —
    // bump the company's version after each direct SQL change, exactly like
    // the production invalidation path does.
    const bumpCacheVersion = () => rawQuery(
      `INSERT INTO rbac_cache_version ("companyId", version, "updatedAt") VALUES ($1, 1, now())
       ON CONFLICT ("companyId") DO UPDATE SET version = rbac_cache_version.version + 1, "updatedAt" = now()`,
      [COMPANY]);

    // simulate a pre-fix tenant: the role exists but has no crm.clients grant
    await rawExecute(`DELETE FROM rbac_role_grants WHERE role_id=$1 AND feature_key='crm.clients'`, [fmRoleId]);
    await bumpCacheVersion();
    let res = await listClients();
    expect(res.status, "without the grant the list is denied — the pre-fix symptom").toBe(403);

    await rawQuery(sql, []);              // the migration heals it
    await rawQuery(sql, []);              // and re-running adds nothing twice
    await bumpCacheVersion();
    const [{ n }] = await rawQuery<{ n: number }>(
      `SELECT count(*)::int n FROM rbac_role_grants WHERE role_id=$1 AND feature_key='crm.clients'`, [fmRoleId]);
    expect(n).toBe(1);

    res = await listClients();
    expect(res.status).toBe(200);
    expect((res.body?.data ?? []).map((r: any) => r.id)).toContain(seededClientId);
  });

  it("quick-create with blank optional fields works, lands in the SAME company, and is immediately listable", async () => {
    // exactly what «+ عميل جديد» sends after the fix: blanks omitted; the
    // backend additionally tolerates "" email (both layers proven —
    // schema-level via this empty-email body, FE-level in entity-selects.test)
    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${token}`)
      .set("Cookie", `erp_csrf=${CSRF}`)
      .set("x-csrf-token", CSRF)
      .send({ name: PFX + "عميل-جديد-من-الفاتورة", email: "" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body?.companyId).toBe(COMPANY);
    expect(res.body?.email).toBeNull(); // "" normalized, not rejected

    const list = await listClients();
    expect((list.body?.data ?? []).map((r: any) => r.id)).toContain(res.body.id);
  });

  it("a client OUTSIDE the 500-row alphabetical window is found via the picker's server-side search", async () => {
    // 510 fillers that sort BEFORE the target (ASCII '0' < Arabic letters),
    // pushing the target out of the first 500 by name.
    const values: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < 510; i++) {
      params.push(COMPANY, `${PFX}0filler-${String(i).padStart(4, "0")}`);
      values.push(`($${params.length - 1}, $${params.length}, 'individual')`);
    }
    await rawExecute(`INSERT INTO clients ("companyId",name,type) VALUES ${values.join(",")}`, params);
    const [target] = await rawQuery<{ id: number }>(
      `INSERT INTO clients ("companyId",name,type) VALUES ($1,$2,'individual') RETURNING id`,
      [COMPANY, PFX + "يعقوب-خارج-النافذة"]);

    const windowRes = await listClients("limit=500");
    const windowIds = (windowRes.body?.data ?? []).map((r: any) => r.id);
    expect(windowIds, "the preload window must truncate — that's the bug being compensated").not.toContain(target.id);

    const searchRes = await listClients(`limit=500&search=${encodeURIComponent("خارج-النافذة")}`);
    expect(searchRes.status).toBe(200);
    expect((searchRes.body?.data ?? []).map((r: any) => r.id),
      "server-side search (the picker's new path) must find the out-of-window client").toContain(target.id);
  });

  it("another company's client never appears — not in the list, not in search, not via ?companyIds= tampering", async () => {
    const all = await listClients("limit=500&search=" + encodeURIComponent("الشركة-الأخرى"));
    expect((all.body?.data ?? []).map((r: any) => r.id)).not.toContain(foreignClientId);

    const tampered = await listClients(`limit=500&companyIds=${OTHER_COMPANY}`);
    expect(tampered.status).toBe(200);
    const ids = (tampered.body?.data ?? []).map((r: any) => r.id);
    expect(ids, "an out-of-scope companyIds filter is clamped, never honored").not.toContain(foreignClientId);
  });
});
