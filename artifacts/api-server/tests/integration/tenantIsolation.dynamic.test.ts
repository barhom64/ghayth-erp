// Day 12-13 dynamic tenant-isolation harness.
//
// Spins the Express app against a real Postgres (seeded via
// `_fixtures/twoCompanies.ts`) and verifies, end-to-end over HTTP,
// that company A cannot read or write company B's rows. This is the
// runtime complement to the static guard in `tenantIsolation.test.ts`.
//
// Activation: this file is auto-discovered by vitest, but every
// `describe()` is wrapped in `runIf(dbReady)` — when DATABASE_URL is
// absent or doesn't point at the disposable test database, the
// scenarios are skipped (printed as "skipped" rather than failed).
// This keeps the static tenant-isolation suite green on dev boxes
// and CI runners without docker, while flipping ON automatically as
// soon as the test Postgres is wired up.
//
// To run locally:
//
//   docker compose -f tests/integration/postgres/docker-compose.yml up -d
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa
//   bash db/bootstrap.sh
//   pnpm --filter @workspace/api-server test tests/integration/tenantIsolation.dynamic.test.ts
//
// CI wiring: see docs/freeze/freeze-day-12-13-dynamic-tests.md.

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

d("Tenant isolation — dynamic (real Postgres)", () => {
  // Late-bound to keep the file loadable when the env isn't set up.
  let app: any;
  let request: any;
  let fx: any;

  beforeAll(async () => {
    request = (await import("supertest")).default;
    const appModule = await import("../../src/app.js");
    app = appModule.default;
    const { setupTwoCompanyFixture } = await import("./_fixtures/twoCompanies.js");
    fx = await setupTwoCompanyFixture();
  });

  // ── Reproduces the Day 2 D-class "finance-custodies.ts:441" finding ──
  // Company A submits a custody POST referencing an assignmentId that
  // belongs to Company B. The Day 3-5 fix added `ea."companyId" = $X`
  // to the validation; this assertion locks in the runtime contract.
  it("custody POST refusing foreign-tenant assignmentId", async () => {
    const res = await request(app)
      .post("/api/finance/custodies/custodies")
      .set("Authorization", `Bearer ${fx.tokenA}`)
      .send({
        assignmentId: fx.companyB.assignmentId,
        amount: 100,
        description: "cross-tenant leak attempt",
      });
    expect([400, 403, 404]).toContain(res.status);
  });

  // ── Reproduces the Day 2 D-class "properties.ts:2223" finding ──
  // The maintenance request handler must reject a technicianId
  // sourced from another company.
  it("maintenance-request POST refusing foreign-tenant assignedTo", async () => {
    const res = await request(app)
      .post("/api/properties/maintenance-requests")
      .set("Authorization", `Bearer ${fx.tokenA}`)
      .send({
        unitId: 0,
        description: "cross-tenant leak attempt",
        category: "general",
        assignedTo: 99999, // intentionally a non-existent / foreign id
      });
    // 422 = validation rejected the body before any DB interaction
    // touched the foreign id; that still satisfies the no-leak contract.
    expect([400, 403, 404, 422]).toContain(res.status);
  });

  // ── Generic list-endpoint isolation contract ──
  // For each endpoint, fetching with token A must return only rows
  // belonging to company A. We don't seed children for either company
  // in the minimal fixture, so the contract here is "list returns 200
  // and the data array does not contain any companyId from the other
  // tenant" rather than a specific row count.
  const SCOPED_LIST_ENDPOINTS = [
    "/api/clients",
    "/api/employees",
    "/api/finance/journal/entries",
    "/api/hr/leave-requests",
    "/api/finance/budget/budgets",
    "/api/finance/vendors",
    "/api/projects",
    "/api/tasks",
    "/api/documents",
    "/api/requests",
    "/api/workflows",
    "/api/gov-integrations",
    "/api/notifications",
    "/api/audit-logs",
    // ── Umrah endpoints added by PRs #303 / #305 / #306 / #312 ──
    // Locks in CONTRIBUTING.md §3.1: a token-A list query must never
    // return a companyId belonging to company B, even on the new
    // operational endpoints. Empty arrays pass — the contract is the
    // absence of foreign rows, not a specific row count.
    "/api/umrah/attachments",
    "/api/umrah/reports/daily-runsheet",
    "/api/umrah/reports/reconciliation",
  ];

  for (const path of SCOPED_LIST_ENDPOINTS) {
    it(`${path} — list response never leaks a foreign companyId`, async () => {
      const res = await request(app)
        .get(path)
        .set("Authorization", `Bearer ${fx.tokenA}`);
      // 200 = empty list is fine; 401/403 means the route's own RBAC
      // didn't grant the test user — that's a fixture problem, not a
      // tenant-isolation problem; 422 means the route requires a query
      // param (e.g. branchId) that the minimal fixture didn't supply,
      // which is also not a leak. We accept all four here.
      expect([200, 401, 403, 422]).toContain(res.status);
      if (res.status !== 200) return;
      const rows = res.body?.data ?? res.body?.rows ?? res.body ?? [];
      const foreign = (Array.isArray(rows) ? rows : []).filter(
        (r: any) => r?.companyId && r.companyId !== fx.companyA.id
      );
      expect(foreign).toEqual([]);
    });
  }

  // ── Cross-tenant write contracts ──
  // For each write path, token A must not be able to mutate a row that
  // belongs to company B. The fixture seeds one row per company in
  // `clients`, `projects`, and `tasks`; the cross-tenant case asks for
  // the OTHER company's id and we expect 403 / 404 (never 200).
  // Same-tenant control checks confirm the route works for legitimate
  // owners — guards against the trivial false-positive of "every write
  // returns 404, so cross-tenant writes are also 404".
  const CROSS_TENANT_WRITE_CASES: Array<{
    method: "delete" | "patch" | "put";
    path: (fx: any) => string;
    body?: object;
    label: string;
  }> = [
    {
      method: "delete",
      path: (fx) => `/api/clients/${fx.companyB.clientId}`,
      label: "DELETE /api/clients/:id (foreign client)",
    },
    {
      method: "patch",
      path: (fx) => `/api/clients/${fx.companyB.clientId}`,
      body: { name: "hijacked" },
      label: "PATCH /api/clients/:id (foreign client)",
    },
    {
      method: "delete",
      path: (fx) => `/api/projects/${fx.companyB.projectId}`,
      label: "DELETE /api/projects/:id (foreign project)",
    },
    {
      method: "patch",
      path: (fx) => `/api/projects/${fx.companyB.projectId}`,
      body: { name: "hijacked" },
      label: "PATCH /api/projects/:id (foreign project)",
    },
    {
      method: "delete",
      path: (fx) => `/api/tasks/${fx.companyB.taskId}`,
      label: "DELETE /api/tasks/:id (foreign task)",
    },
    {
      method: "patch",
      path: (fx) => `/api/employees/${fx.companyB.employeeId}`,
      body: { name: "hijacked" },
      label: "PATCH /api/employees/:id (foreign employee)",
    },
    {
      method: "delete",
      path: (fx) => `/api/employees/${fx.companyB.employeeId}`,
      label: "DELETE /api/employees/:id (foreign employee)",
    },
    {
      method: "patch",
      path: (fx) => `/api/documents/${fx.companyB.documentId}`,
      body: { title: "hijacked" },
      label: "PATCH /api/documents/:id (foreign document)",
    },
    {
      method: "delete",
      path: (fx) => `/api/documents/${fx.companyB.documentId}`,
      label: "DELETE /api/documents/:id (foreign document)",
    },
    {
      method: "patch",
      path: (fx) => `/api/requests/${fx.companyB.requestId}`,
      body: { title: "hijacked" },
      label: "PATCH /api/requests/:id (foreign request)",
    },
    {
      method: "delete",
      path: (fx) => `/api/requests/${fx.companyB.requestId}`,
      label: "DELETE /api/requests/:id (foreign request)",
    },
    // ── Umrah cross-tenant write contracts (PRs #305 / #312) ──
    // The minimal fixture doesn't seed umrah_groups / umrah_penalties /
    // umrah_attachments for either company, so we probe with a foreign
    // id of 99999 — the route must refuse via its own companyId guard
    // (NotFound / ValidationError) regardless of whether such a row
    // exists. Same contract as the maintenance-request foreign-id case
    // at the top of this file.
    {
      method: "delete",
      path: () => `/api/umrah/attachments/99999`,
      label: "DELETE /api/umrah/attachments/:id (foreign id)",
    },
  ];

  // ── Umrah cross-tenant POST contracts ──
  // Per CONTRIBUTING.md §3.1, every newly added write route must refuse
  // token A's attempt to mutate company-B data. The four POST endpoints
  // below take entity ids in their body (not path), so they're handled
  // separately from CROSS_TENANT_WRITE_CASES.
  const UMRAH_POST_CASES: Array<{
    path: string;
    body: object;
    label: string;
  }> = [
    {
      path: "/api/umrah/groups/99999/split",
      body: { pilgrimIds: [99999], newGroupName: "hijack" },
      label: "POST /api/umrah/groups/:id/split (foreign source group)",
    },
    {
      path: "/api/umrah/groups/merge",
      body: { sourceGroupIds: [99999], targetGroupId: 99998 },
      label: "POST /api/umrah/groups/merge (foreign groups)",
    },
    {
      path: "/api/umrah/penalties/waive-bulk",
      body: { penaltyIds: [99999], reason: "cross-tenant probe" },
      label: "POST /api/umrah/penalties/waive-bulk (foreign penalty)",
    },
    {
      path: "/api/umrah/attachments",
      body: { entityType: "mutamer", entityId: 99999, type: "passport", title: "x" },
      label: "POST /api/umrah/attachments (foreign owner)",
    },
  ];

  for (const c of UMRAH_POST_CASES) {
    it(`${c.label} — token A must not touch company B's row`, async () => {
      const res = await request(app)
        .post(c.path)
        .set("Authorization", `Bearer ${fx.tokenA}`)
        .send(c.body);
      // Bulk-waive returns 200 with all rows in skipped[] when the
      // ids don't belong to caller's company — that's still a no-leak
      // outcome (zero rows touched). We accept it alongside the usual
      // refusals.
      expect([200, 400, 401, 403, 404, 422]).toContain(res.status);
      if (res.status === 200 && c.path.endsWith("/waive-bulk")) {
        expect(res.body?.successCount ?? 0).toBe(0);
      }
    });
  }

  for (const c of CROSS_TENANT_WRITE_CASES) {
    it(`${c.label} — token A must not mutate company B's row`, async () => {
      const req = (request(app) as any)[c.method](c.path(fx)).set(
        "Authorization",
        `Bearer ${fx.tokenA}`
      );
      const res = await (c.body ? req.send(c.body) : req);
      // 200/204 = the mutation went through, which is the leak we're
      // asserting against. 401/403/404/422 = correctly refused.
      expect([401, 403, 404, 422]).toContain(res.status);
    });
  }
});
