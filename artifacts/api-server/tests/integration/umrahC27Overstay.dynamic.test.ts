// CI wiring for the C27 overstay smoke promised by PR #427.
//
// Mirrors scripts/smoke-umrah-c27-overstay.mjs as a vitest test so the
// guard step 4 (`pnpm --filter @workspace/api-server run test`) exercises
// the bundled cron handler on every PR. Auto-discovered by vitest;
// scenarios are wrapped in `runIf(dbReady)` so dev runs without
// DATABASE_URL skip cleanly.
//
// To run locally:
//   docker compose -f tests/integration/postgres/docker-compose.yml up -d
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa
//   bash db/bootstrap.sh
//   pnpm --filter @workspace/api-server test tests/integration/umrahC27Overstay.dynamic.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY_NAME = "__C27_SMOKE_COMPANY__";
const PASSPORT = "C27-SMOKE-PP-1";
const JOB_NAME = "umrah_daily_overstay_scan";

d("C27 — daily umrah overstay scan (bundled cron handler)", () => {
  let rawQuery: any;
  let rawExecute: any;
  let triggerJobByName: any;
  let seedCronJobs: any;
  const ids: { companyId?: number; employeeId?: number; assignmentId?: number; seasonId?: number; pilgrimId?: number } = {};

  async function teardown() {
    if (!ids.companyId) return;
    await rawExecute(`DELETE FROM notifications WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM umrah_violations WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM umrah_pilgrims WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM umrah_seasons WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM employee_assignments WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    if (ids.employeeId) await rawExecute(`DELETE FROM employees WHERE id=$1`, [ids.employeeId]).catch(() => {});
    await rawExecute(`DELETE FROM cron_locks WHERE job_name=$1`, [JOB_NAME]).catch(() => {});
    await rawExecute(`DELETE FROM cron_logs WHERE "jobName"=$1 AND "createdAt" > NOW() - INTERVAL '10 minutes'`, [JOB_NAME]).catch(() => {});
    await rawExecute(`DELETE FROM companies WHERE id=$1 AND name=$2`, [ids.companyId, COMPANY_NAME]).catch(() => {});
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const cron = await import("../../src/lib/cronScheduler.js");
    triggerJobByName = cron.triggerJobByName;
    seedCronJobs = cron.seedCronJobs;

    await teardown();

    const [c] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [COMPANY_NAME]
    );
    ids.companyId = c.id as number;

    // Sentinel branch id=0 — the C27 handler resolves the manager via
    // getManagerAssignmentId(companyId, 0), so the manager assignment must
    // sit on branchId=0. ON CONFLICT keeps the seed idempotent.
    await rawExecute(
      `INSERT INTO branches (id, "companyId", name, status)
       VALUES (0, $1, '__C27_SMOKE_BRANCH_0__', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [ids.companyId]
    );

    const [emp] = await rawQuery(
      `INSERT INTO employees (name, email, status)
       VALUES ('C27 Smoke Manager', $1, 'active') RETURNING id`,
      [`c27-mgr-${ids.companyId}@smoke.local`]
    );
    ids.employeeId = emp.id as number;

    const [asn] = await rawQuery(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1, $2, 0, 'Manager', 'general_manager', TRUE, 'active')
       RETURNING id`,
      [ids.employeeId, ids.companyId]
    );
    ids.assignmentId = asn.id as number;

    const [season] = await rawQuery(
      `INSERT INTO umrah_seasons ("companyId", title, "startDate", "endDate", status)
       VALUES ($1, 'C27 Smoke Season', '2026-01-01', '2026-12-31', 'open') RETURNING id`,
      [ids.companyId]
    );
    ids.seasonId = season.id as number;

    const [pilgrim] = await rawQuery(
      `INSERT INTO umrah_pilgrims
         ("companyId","seasonId","fullName","passportNumber","status",
          "isInsideKingdom","actualStayDays","programDuration","createdAt")
       VALUES ($1, $2, 'معتمر اختبار C27', $3, 'active', TRUE, 15, 10, NOW())
       RETURNING id`,
      [ids.companyId, ids.seasonId, PASSPORT]
    );
    ids.pilgrimId = pilgrim.id as number;

    await seedCronJobs();
    await rawExecute(`DELETE FROM cron_locks WHERE job_name=$1`, [JOB_NAME]);
  }, 30000);

  afterAll(async () => {
    await teardown();
  });

  it("creates exactly one overstay violation scoped to the test company", async () => {
    const r = await triggerJobByName(JOB_NAME);
    expect(r.success, `handler error: ${r.error || ""}`).toBe(true);

    const v = await rawQuery(
      `SELECT id, type, "mutamerId", "companyId", status
         FROM umrah_violations
        WHERE "companyId"=$1 AND "mutamerId"=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, ids.pilgrimId]
    );
    expect(v).toHaveLength(1);
    expect(v[0].type).toBe("overstay");
    expect(Number(v[0].companyId)).toBe(Number(ids.companyId));
  });

  it("enqueues a manager notification for the same company", async () => {
    const n = await rawQuery(
      `SELECT id, type, title FROM notifications
        WHERE "companyId"=$1 AND "assignmentId"=$2 AND type='umrah'`,
      [ids.companyId, ids.assignmentId]
    );
    expect(n.length).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent — re-running does not duplicate the violation row", async () => {
    await rawExecute(`DELETE FROM cron_locks WHERE job_name=$1`, [JOB_NAME]);
    const r = await triggerJobByName(JOB_NAME);
    expect(r.success, `handler error: ${r.error || ""}`).toBe(true);

    const v = await rawQuery(
      `SELECT id FROM umrah_violations
        WHERE "companyId"=$1 AND "mutamerId"=$2 AND "deletedAt" IS NULL`,
      [ids.companyId, ids.pilgrimId]
    );
    expect(v).toHaveLength(1);
  });
});
