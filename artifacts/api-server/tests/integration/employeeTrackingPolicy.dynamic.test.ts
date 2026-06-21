/**
 * Tracking Eligibility Contract — dynamic (real Postgres).
 *
 * GPS-tracking eligibility derives ONLY from an explicit, active, per-employee
 * tracking policy (employee_tracking_policies). It NEVER derives from
 * role=driver or attendance categoryKey. Location viewing requires the
 * tracking_view permission + company membership + an active policy (+ the
 * policy's allowedViewerRoles when set), and EVERY view is audited. Disabling
 * the policy stops both ingestion and visibility immediately. A direct URL can
 * NOT bypass any of these server-side gates.
 *
 * 10 scenarios:
 *   1. no policy (office)          → ineligible
 *   2. driver, no policy           → ineligible (role/category never grants it)
 *   3. office + active policy       → eligible
 *   4. manager, no view perm        → 403 on the direct location URL
 *   5. manager + view perm          → 200
 *   6. a location view              → writes a tracking.view audit row
 *   7. other-company employee       → 404 (no existence leak)
 *   8. disable the policy           → ingestion + visibility stop immediately
 *   9. restricted allowedViewerRoles → allowed role sees it / disallowed role
 *      is 403 on the direct URL AND filtered off the map
 *  10. disable the policy           → employee immediately disappears from the map
 *
 * Mirrors the dbReady auto-skip used across the *.dynamic.test.ts suite: it
 * runs only when DATABASE_URL points at the marker test DB and JWT_SECRET is
 * set. Self-provisions migration 390 (post-cutoff DDL isn't applied on the CI
 * harness, which pre-marks all migrations applied-without-running).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const CO_A = "__TRACKING_CONTRACT_A__";
const CO_B = "__TRACKING_CONTRACT_B__";
const OWNER_A = "tracking.owner.a@ghayth.sa";
const MANAGER_A = "tracking.manager.a@ghayth.sa";

d("Tracking Eligibility Contract — dynamic (real Postgres)", () => {
  let rawQuery: any;
  let svc: any;
  let bumpCacheVersion: (companyId: number) => Promise<void>;
  let app: any;
  let request: any;
  let server: Server | null = null;

  let companyA = 0;
  let branchA = 0;
  let companyB = 0;
  let branchB = 0;
  let ownerUserId = 0;
  let ownerToken = "";
  let managerToken = "";
  let deptMgrRoleId = 0;

  let empOfficePolicy = 0;
  let aOfficePolicy = 0;
  let aDriverNoPolicy = 0;
  let aOfficeNoPolicy = 0;
  let empDisable = 0;
  let aDisable = 0;
  let disablePolicyId = 0;
  let empOther = 0;
  let empRestricted = 0;
  let aRestricted = 0;
  let empMapDisable = 0;
  let aMapDisable = 0;
  let mapDisablePolicyId = 0;

  async function mkEmployee(
    cid: number,
    bid: number,
    name: string,
    email: string,
    role = "employee",
    categoryKey: string | null = null,
  ): Promise<{ employeeId: number; assignmentId: number }> {
    const [{ id: employeeId }] = await rawQuery(
      `INSERT INTO employees (name, email, status, "companyId", "branchId")
       VALUES ($1, $2, 'active', $3, $4) RETURNING id`,
      [name, email, cid, bid],
    );
    const [{ id: assignmentId }] = await rawQuery(
      `INSERT INTO employee_assignments
         ("employeeId", "companyId", "branchId", "jobTitle", role, "categoryKey", "isPrimary", status)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE, 'active') RETURNING id`,
      [employeeId, cid, bid, name, role, categoryKey],
    );
    return { employeeId, assignmentId };
  }

  async function createPolicy(
    cid: number,
    bid: number,
    empId: number,
    opts: { mode?: string; enabled?: boolean; allowedViewerRoles?: string[] } = {},
  ): Promise<number> {
    const [{ id }] = await rawQuery(
      `INSERT INTO employee_tracking_policies
         ("companyId", "branchId", "employeeId", "trackingEnabled", "trackingMode",
          "allowedViewerRoles", "createdBy")
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) RETURNING id`,
      [
        cid,
        bid,
        empId,
        opts.enabled ?? true,
        opts.mode ?? "work_hours",
        JSON.stringify(opts.allowedViewerRoles ?? []),
        ownerUserId,
      ],
    );
    return id as number;
  }

  function scopeFor(cid: number, bid: number, assignmentId: number, role = "employee") {
    return {
      companyId: cid,
      branchId: bid,
      userId: ownerUserId,
      activeAssignmentId: assignmentId,
      selectedRoleKey: role,
    };
  }

  async function bootstrapTenant(name: string): Promise<{ cid: number; bid: number }> {
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");
    const [{ id: cid }] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [name],
    );
    await bootstrapCompany(cid, name, null);
    const [{ id: bid }] = await rawQuery(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`,
      [cid],
    );
    return { cid: cid as number, bid: bid as number };
  }

  async function teardownCompany(cid: number) {
    if (!cid) return;
    const stmts: Array<[string, unknown[]]> = [
      [`DELETE FROM employee_tracking_policies WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM field_tracking_points WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM audit_logs WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM rbac_user_roles WHERE "companyId"=$1`, [cid]],
      [`DELETE FROM rbac_role_grants WHERE role_id IN (SELECT id FROM rbac_roles WHERE "companyId"=$1)`, [cid]],
      [`DELETE FROM rbac_roles WHERE "companyId"=$1`, [cid]],
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

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    svc = await import("../../src/lib/fieldTrackingService.js");
    const authz = await import("../../src/lib/rbac/authzEngine.js");
    bumpCacheVersion = authz.bumpCacheVersion;
    const { signToken, hashPassword } = await import("../../src/lib/auth.js");
    request = (await import("supertest")).default;

    // Self-provision migration 390 — post-cutoff DDL isn't materialized on the
    // CI harness (it pre-marks every migration applied-without-running). The
    // file is idempotent (CREATE TABLE/INDEX IF NOT EXISTS).
    const mig = readFileSync(
      join(import.meta.dirname!, "../../src/migrations/390_employee_tracking_policies.sql"),
      "utf8",
    );
    await rawQuery(mig);

    // Clean any prior run.
    for (const nm of [CO_A, CO_B]) {
      const rows = await rawQuery(`SELECT id FROM companies WHERE name=$1`, [nm]).catch(() => []);
      for (const r of rows) await teardownCompany(r.id);
    }

    // ── Company A: full tenant + owner ──
    const a = await bootstrapTenant(CO_A);
    companyA = a.cid;
    branchA = a.bid;

    const [{ id: ownerRoleId } = {} as { id: number }] = await rawQuery(
      `SELECT id FROM rbac_roles WHERE "companyId"=$1 AND role_key='owner' LIMIT 1`,
      [companyA],
    );
    if (!ownerRoleId) throw new Error(`No owner rbac_role seeded for company ${companyA}`);

    const owner = await mkEmployee(companyA, branchA, "مالك أ", OWNER_A, "owner");
    const ownerHash = await hashPassword("TrackOwner#A1");
    const [{ id: oUserId }] = await rawQuery(
      `INSERT INTO users ("employeeId", email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, 'owner', TRUE) RETURNING id`,
      [owner.employeeId, OWNER_A, ownerHash],
    );
    ownerUserId = oUserId as number;
    await rawQuery(
      `INSERT INTO rbac_user_roles ("userId", "companyId", role_id, "branchId", is_primary)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT ("userId", "companyId", role_id) DO NOTHING`,
      [ownerUserId, companyA, ownerRoleId, branchA],
    );
    ownerToken = signToken({ userId: ownerUserId, assignmentId: owner.assignmentId, role: "owner" });

    // ── Manager (department_manager) — carries the hr module via the role
    //    catalog, but starts with NO grants (test 4). ──
    const [{ id: mgrRoleId }] = await rawQuery(
      `INSERT INTO rbac_roles ("companyId", role_key, label_ar, level, is_system)
       VALUES ($1, 'department_manager', 'مدير إدارة', 50, FALSE)
       ON CONFLICT ("companyId", role_key) DO UPDATE SET label_ar=EXCLUDED.label_ar
       RETURNING id`,
      [companyA],
    );
    deptMgrRoleId = mgrRoleId as number;
    const mgr = await mkEmployee(companyA, branchA, "مدير أ", MANAGER_A, "department_manager");
    const mgrHash = await hashPassword("TrackMgr#A1");
    const [{ id: mUserId }] = await rawQuery(
      `INSERT INTO users ("employeeId", email, "passwordHash", role, "isActive")
       VALUES ($1, $2, $3, 'department_manager', TRUE) RETURNING id`,
      [mgr.employeeId, MANAGER_A, mgrHash],
    );
    await rawQuery(
      `INSERT INTO rbac_user_roles ("userId", "companyId", role_id, "branchId", is_primary)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT ("userId", "companyId", role_id) DO NOTHING`,
      [mUserId, companyA, deptMgrRoleId, branchA],
    );
    managerToken = signToken({
      userId: mUserId,
      assignmentId: mgr.assignmentId,
      role: "department_manager",
    });

    // ── Tracked / untracked employees in company A ──
    const op = await mkEmployee(companyA, branchA, "موظف مكتبي بسياسة", "track.office.policy@ghayth.sa", "employee", "office");
    empOfficePolicy = op.employeeId;
    aOfficePolicy = op.assignmentId;
    await createPolicy(companyA, branchA, empOfficePolicy, { mode: "work_hours" });

    const dr = await mkEmployee(companyA, branchA, "سائق بلا سياسة", "track.driver.nopolicy@ghayth.sa", "driver", "driver");
    aDriverNoPolicy = dr.assignmentId;

    const on = await mkEmployee(companyA, branchA, "موظف مكتبي بلا سياسة", "track.office.nopolicy@ghayth.sa", "employee", "office");
    aOfficeNoPolicy = on.assignmentId;

    const ds = await mkEmployee(companyA, branchA, "موظف للتعطيل", "track.disable@ghayth.sa", "employee", "office");
    empDisable = ds.employeeId;
    aDisable = ds.assignmentId;
    disablePolicyId = await createPolicy(companyA, branchA, empDisable, { mode: "live" });

    // Seed a location point so a successful view returns data.
    await rawQuery(
      `INSERT INTO field_tracking_points
         ("assignmentId", "employeeId", "companyId", "branchId", lat, lng, source, "capturedAt")
       VALUES ($1, $2, $3, $4, 24.7136, 46.6753, 'test', NOW())`,
      [aOfficePolicy, empOfficePolicy, companyA, branchA],
    );

    // ── Restricted-viewer employee: policy only viewable by role 'owner'. ──
    const rs = await mkEmployee(companyA, branchA, "موظف بسياسة مقيّدة", "track.restricted@ghayth.sa", "employee", "office");
    empRestricted = rs.employeeId;
    aRestricted = rs.assignmentId;
    await createPolicy(companyA, branchA, empRestricted, { mode: "work_hours", allowedViewerRoles: ["owner"] });
    await rawQuery(
      `INSERT INTO field_tracking_points
         ("assignmentId", "employeeId", "companyId", "branchId", lat, lng, source, "capturedAt")
       VALUES ($1, $2, $3, $4, 24.72, 46.68, 'test', NOW())`,
      [aRestricted, empRestricted, companyA, branchA],
    );

    // ── Map-disable employee: active live policy, disabled inside test 10. ──
    const md = await mkEmployee(companyA, branchA, "موظف لتعطيل الخريطة", "track.mapdisable@ghayth.sa", "employee", "office");
    empMapDisable = md.employeeId;
    aMapDisable = md.assignmentId;
    mapDisablePolicyId = await createPolicy(companyA, branchA, empMapDisable, { mode: "live" });
    await rawQuery(
      `INSERT INTO field_tracking_points
         ("assignmentId", "employeeId", "companyId", "branchId", lat, lng, source, "capturedAt")
       VALUES ($1, $2, $3, $4, 24.73, 46.69, 'test', NOW())`,
      [aMapDisable, empMapDisable, companyA, branchA],
    );

    // ── Company B: separate tenant with a tracked employee (cross-company) ──
    const b = await bootstrapTenant(CO_B);
    companyB = b.cid;
    branchB = b.bid;
    const other = await mkEmployee(companyB, branchB, "موظف شركة أخرى", "track.other.company@ghayth.sa", "employee", "office");
    empOther = other.employeeId;
    await createPolicy(companyB, branchB, empOther, { mode: "work_hours" });

    const appModule = await import("../../src/app.js");
    app = appModule.default;
    server = await new Promise<Server>((resolveServer) => {
      const s = app.listen(0, "127.0.0.1", () => resolveServer(s));
    });
  }, 120_000);

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolveClose) => server!.close(() => resolveClose()));
      server = null;
    }
    await teardownCompany(companyA);
    await teardownCompany(companyB);
  });

  // 1 ─────────────────────────────────────────────────────────────────────────
  it("no policy (office employee) → ineligible", async () => {
    const r = await svc.getFieldEligibility(scopeFor(companyA, branchA, aOfficeNoPolicy));
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("no_tracking_policy");
  });

  // 2 ─────────────────────────────────────────────────────────────────────────
  it("driver with NO policy → ineligible (role/category never grants eligibility)", async () => {
    const r = await svc.getFieldEligibility(scopeFor(companyA, branchA, aDriverNoPolicy, "driver"));
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("no_tracking_policy");
  });

  // 3 ─────────────────────────────────────────────────────────────────────────
  it("office employee WITH an active policy → eligible", async () => {
    const r = await svc.getFieldEligibility(scopeFor(companyA, branchA, aOfficePolicy));
    expect(r.eligible).toBe(true);
    expect(r.trackingFrequencySeconds).toBe(svc.frequencyForMode("work_hours"));
  });

  // 4 ─────────────────────────────────────────────────────────────────────────
  it("manager WITHOUT tracking_view perm → 403 on the direct location URL", async () => {
    const res = await request(app)
      .get(`/api/hr/attendance/tracking-policies/${empOfficePolicy}/location`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(res.status).toBe(403);
  });

  // 5 ─────────────────────────────────────────────────────────────────────────
  it("manager WITH tracking_view perm → 200", async () => {
    await rawQuery(
      `INSERT INTO rbac_role_grants (role_id, feature_key, actions, scope)
       VALUES ($1, 'hr.attendance.tracking_view', ARRAY['view','list'], 'company')
       ON CONFLICT (role_id, feature_key) DO UPDATE SET actions=EXCLUDED.actions`,
      [deptMgrRoleId],
    );
    await bumpCacheVersion(companyA);

    const res = await request(app)
      .get(`/api/hr/attendance/tracking-policies/${empOfficePolicy}/location`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.employeeId).toBe(empOfficePolicy);
  });

  // 6 ─────────────────────────────────────────────────────────────────────────
  it("every location view writes a tracking.view audit row", async () => {
    const before = await rawQuery(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE "companyId"=$1 AND action='tracking.view' AND "entityId"=$2`,
      [companyA, empOfficePolicy],
    );
    const res = await request(app)
      .get(`/api/hr/attendance/tracking-policies/${empOfficePolicy}/location`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const after = await rawQuery(
      `SELECT COUNT(*)::int AS n FROM audit_logs
        WHERE "companyId"=$1 AND action='tracking.view' AND "entityId"=$2`,
      [companyA, empOfficePolicy],
    );
    expect(after[0].n).toBeGreaterThan(before[0].n);
  });

  // 7 ─────────────────────────────────────────────────────────────────────────
  it("other-company employee location is hidden (404, no existence leak)", async () => {
    const res = await request(app)
      .get(`/api/hr/attendance/tracking-policies/${empOther}/location`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  // 8 ─────────────────────────────────────────────────────────────────────────
  it("disabling the policy stops tracking immediately (ingestion + visibility)", async () => {
    // Active first.
    const active = await svc.getActiveTrackingPolicy(companyA, empDisable);
    expect(active).not.toBeNull();

    // Disable it.
    await rawQuery(
      `UPDATE employee_tracking_policies SET "trackingEnabled"=FALSE, "updatedAt"=NOW() WHERE id=$1`,
      [disablePolicyId],
    );

    // Eligibility + ingestion stop at once.
    const afterDisable = await svc.getActiveTrackingPolicy(companyA, empDisable);
    expect(afterDisable).toBeNull();

    const ping = await svc.recordFieldPing(scopeFor(companyA, branchA, aDisable), { lat: 24.7, lng: 46.6 });
    expect(ping.kind).toBe("forbidden");

    // Visibility stops too — the location endpoint now 404s.
    const res = await request(app)
      .get(`/api/hr/attendance/tracking-policies/${empDisable}/location`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(404);
  });

  // 9 ─────────────────────────────────────────────────────────────────────────
  it("allowedViewerRoles restricts viewers on BOTH the location URL and the map", async () => {
    // Manager HAS tracking_view (granted in test 5) but is NOT in
    // allowedViewerRoles=['owner']. Direct URL → 403, not a silent leak.
    const denyDirect = await request(app)
      .get(`/api/hr/attendance/tracking-policies/${empRestricted}/location`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(denyDirect.status).toBe(403);

    // Map breadcrumb for the same assignment → the restricted employee is
    // filtered out for the manager (no bypass via the list surface).
    const denyMap = await request(app)
      .get(`/api/hr/attendance/field-track?assignmentId=${aRestricted}`)
      .set("Authorization", `Bearer ${managerToken}`);
    expect(denyMap.status).toBe(200);
    expect(denyMap.body.data.length).toBe(0);

    // The owner IS an allowed viewer → sees the location on both surfaces.
    const allowDirect = await request(app)
      .get(`/api/hr/attendance/tracking-policies/${empRestricted}/location`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(allowDirect.status, JSON.stringify(allowDirect.body)).toBe(200);

    const allowMap = await request(app)
      .get(`/api/hr/attendance/field-track?assignmentId=${aRestricted}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(allowMap.status).toBe(200);
    expect(allowMap.body.data.length).toBeGreaterThan(0);
  });

  // 10 ────────────────────────────────────────────────────────────────────────
  it("disabling the policy removes the employee from the field-track map immediately", async () => {
    // Visible on the live map while the policy is active.
    const before = await request(app)
      .get(`/api/hr/attendance/field-track`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(before.status).toBe(200);
    expect(before.body.data.some((p: any) => p.assignmentId === aMapDisable)).toBe(true);

    // Disable the policy.
    await rawQuery(
      `UPDATE employee_tracking_policies SET "trackingEnabled"=FALSE, "updatedAt"=NOW() WHERE id=$1`,
      [mapDisablePolicyId],
    );

    // Gone from the live map at once — and from the breadcrumb surface too.
    const afterLive = await request(app)
      .get(`/api/hr/attendance/field-track`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(afterLive.status).toBe(200);
    expect(afterLive.body.data.some((p: any) => p.assignmentId === aMapDisable)).toBe(false);

    const afterCrumb = await request(app)
      .get(`/api/hr/attendance/field-track?assignmentId=${aMapDisable}`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(afterCrumb.status).toBe(200);
    expect(afterCrumb.body.data.length).toBe(0);
  });
});
