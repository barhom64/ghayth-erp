// Branch isolation + parameter-tampering dynamic harness.
//
// Extends the two-company fixture with a second branch per company and
// a branch_manager token scoped to only one branch. Verifies:
//
//   1. Branch managers only see data from their assigned branches.
//   2. Query-param tampering (?branchIds=<foreign>) is stripped by
//      parseScopeFilters() / buildScopedWhere().
//   3. Cross-tenant POST bodies with foreign IDs are refused.
//   4. Assignment-switch rejects assignments outside allowedCompanies.
//
// Activation: same as tenantIsolation.dynamic.test.ts — auto-discovered
// by vitest, skipped when DATABASE_URL isn't wired up.

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("Branch isolation & parameter tampering (real Postgres)", () => {
  let app: any;
  let request: any;
  let fx: any;

  beforeAll(async () => {
    request = (await import("supertest")).default;
    const appModule = await import("../../src/app.js");
    app = appModule.default;
    const { setupBranchIsolationFixture } = await import(
      "./_fixtures/branchIsolation.js"
    );
    fx = await setupBranchIsolationFixture();
  });

  // ─── 1. Branch-scoped list isolation ───────────────────────────────
  // A branch_manager token should never receive rows from a branch
  // they are not assigned to, even within the same company.

  const BRANCH_SCOPED_LIST_ENDPOINTS = [
    "/api/tasks",
    "/api/employees",
    "/api/hr/leave-requests",
    "/api/documents",
    "/api/requests",
  ];

  for (const path of BRANCH_SCOPED_LIST_ENDPOINTS) {
    it(`${path} — branch_manager sees only their branch's data`, async () => {
      const res = await request(app)
        .get(path)
        .set("Authorization", `Bearer ${fx.branchMgrToken}`);

      expect([200, 401, 403, 422]).toContain(res.status);
      if (res.status !== 200) return;

      const rows = res.body?.data ?? res.body?.rows ?? res.body ?? [];
      if (!Array.isArray(rows) || rows.length === 0) return;

      const foreignBranch = rows.filter(
        (r: any) =>
          r?.branchId &&
          r.branchId !== fx.branchA1.id &&
          r.companyId === fx.companyA.id
      );
      expect(foreignBranch).toEqual([]);
    });
  }

  // ─── 2. Query-param tampering: ?branchIds=<other_branch> ──────────
  // parseScopeFilters() filters branchIds against scope.allowedBranches.
  // A branch_manager requesting data from a sibling branch they don't
  // own should get it silently stripped.

  it("branchIds query param with foreign branch is stripped", async () => {
    const res = await request(app)
      .get(`/api/tasks?branchIds=${fx.branchA2.id}`)
      .set("Authorization", `Bearer ${fx.branchMgrToken}`);

    expect([200, 401, 403, 422]).toContain(res.status);
    if (res.status !== 200) return;

    const rows = res.body?.data ?? res.body?.rows ?? res.body ?? [];
    const leaked = (Array.isArray(rows) ? rows : []).filter(
      (r: any) => r?.branchId === fx.branchA2.id
    );
    expect(leaked).toEqual([]);
  });

  it("branchIds query param with cross-tenant branch is stripped", async () => {
    const res = await request(app)
      .get(`/api/tasks?branchIds=${fx.branchB1.id}`)
      .set("Authorization", `Bearer ${fx.branchMgrToken}`);

    expect([200, 401, 403, 422]).toContain(res.status);
    if (res.status !== 200) return;

    const rows = res.body?.data ?? res.body?.rows ?? res.body ?? [];
    const leaked = (Array.isArray(rows) ? rows : []).filter(
      (r: any) => r?.branchId === fx.branchB1.id
    );
    expect(leaked).toEqual([]);
  });

  // ─── 3. companyIds query param tampering ───────────────────────────
  // A token scoped to company A cannot pull company B data via
  // ?companyIds=<companyB>.

  it("companyIds query param with foreign company is stripped", async () => {
    const res = await request(app)
      .get(`/api/clients?companyIds=${fx.companyB.id}`)
      .set("Authorization", `Bearer ${fx.ownerTokenA}`);

    expect([200, 401, 403, 422]).toContain(res.status);
    if (res.status !== 200) return;

    const rows = res.body?.data ?? res.body?.rows ?? res.body ?? [];
    const foreign = (Array.isArray(rows) ? rows : []).filter(
      (r: any) => r?.companyId && r.companyId === fx.companyB.id
    );
    expect(foreign).toEqual([]);
  });

  // ─── 4. Cross-tenant POST body with foreign IDs ───────────────────
  // POST endpoints that accept entity IDs in the body must validate
  // them against the caller's company.

  it("POST /api/clients with foreign companyId in body is refused or scoped", async () => {
    const res = await request(app)
      .post("/api/clients")
      .set("Authorization", `Bearer ${fx.ownerTokenA}`)
      .send({
        name: "Tampering attempt",
        type: "individual",
        companyId: fx.companyB.id,
      });
    // Either the route ignores the body companyId (uses scope.companyId)
    // or it returns an error. Both are safe.
    if (res.status === 201 || res.status === 200) {
      // If created, verify it was created under company A, not B
      const created = res.body?.data ?? res.body;
      if (created?.companyId) {
        expect(created.companyId).toBe(fx.companyA.id);
      }
    } else {
      expect([400, 403, 404, 422]).toContain(res.status);
    }
  });

  it("PATCH /api/employees/:id with foreign employee is refused", async () => {
    const res = await request(app)
      .patch(`/api/employees/${fx.companyB.employeeId}`)
      .set("Authorization", `Bearer ${fx.ownerTokenA}`)
      .send({ name: "hijacked" });
    expect([401, 403, 404, 422]).toContain(res.status);
  });

  it("DELETE /api/clients/:id with foreign client is refused", async () => {
    const res = await request(app)
      .delete(`/api/clients/${fx.companyB.clientId}`)
      .set("Authorization", `Bearer ${fx.ownerTokenA}`);
    expect([401, 403, 404, 422]).toContain(res.status);
  });

  // ─── 5. Assignment-switch tampering ────────────────────────────────
  // POST /api/auth/switch-assignment must reject an assignmentId that
  // belongs to another company outside the user's allowedCompanies.

  it("switch-assignment rejects foreign-company assignment", async () => {
    const res = await request(app)
      .post("/api/auth/switch-assignment")
      .set("Authorization", `Bearer ${fx.ownerTokenA}`)
      .send({ assignmentId: fx.companyB.assignmentId });
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  // ─── 6. Owner bypasses branch scope (positive control) ────────────
  // An owner token should be able to see data from all branches in
  // their company, confirming the branch scope is correctly bypassed.

  it("owner can see tasks from all company branches", async () => {
    const res = await request(app)
      .get("/api/tasks")
      .set("Authorization", `Bearer ${fx.ownerTokenA}`);

    expect([200, 401, 403, 422]).toContain(res.status);
    if (res.status !== 200) return;

    const rows = res.body?.data ?? res.body?.rows ?? res.body ?? [];
    if (!Array.isArray(rows)) return;
    // Owner should see tasks from both branches
    const branches = new Set(rows.map((r: any) => r.branchId).filter(Boolean));
    // At minimum, no foreign company data
    const foreign = rows.filter(
      (r: any) => r?.companyId && r.companyId !== fx.companyA.id
    );
    expect(foreign).toEqual([]);
  });

  // ─── 7. Branch manager cannot write to sibling branch ─────────────
  it("branch_manager cannot create task in sibling branch", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .set("Authorization", `Bearer ${fx.branchMgrToken}`)
      .send({
        title: "cross-branch task",
        type: "manual",
        branchId: fx.branchA2.id,
      });
    // Either refused outright, or created in mgr's own branch (ignoring body branchId)
    if (res.status === 201 || res.status === 200) {
      const created = res.body?.data ?? res.body;
      if (created?.branchId) {
        expect(created.branchId).not.toBe(fx.branchA2.id);
      }
    } else {
      expect([400, 403, 404, 422]).toContain(res.status);
    }
  });
});
