#!/usr/bin/env node
/**
 * Smoke for C27 — daily umrah overstay scan cron handler.
 *
 * Promised by PR #427 but never landed on main. This black-box smoke
 * exercises the BUNDLED handler (not a re-implementation of its SQL) by
 * calling triggerJobByName("umrah_daily_overstay_scan") so the assertions
 * below catch handler regressions, not just SQL drift.
 *
 * Asserts:
 *   1) exactly one umrah_violations row of type='overstay' is created for
 *      the seeded pilgrim, scoped to the test companyId,
 *   2) one notifications row of type='umrah' is enqueued for the
 *      manager assignment,
 *   3) re-running the scan does NOT produce a duplicate row
 *      (NOT EXISTS guard works).
 *
 * Cleans up the seeded rows in a finally{} block — pass or fail.
 *
 * Usage (DB required):
 *   DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp \
 *     pnpm --filter @workspace/api-server exec tsx \
 *     artifacts/api-server/scripts/smoke-umrah-c27-overstay.mjs
 *
 * In CI: also exercised by tests/integration/umrahC27Overstay.dynamic.test.ts
 * which is auto-discovered by vitest in guard step 4 (gated on dbReady).
 */
process.env.DATABASE_URL ??= "postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp";
process.env.JWT_SECRET ??= "smoke-only-jwt-secret-thirty-two-chars-aaaaaaaaaa";

import { pool, rawQuery, rawExecute } from "../src/lib/rawdb.ts";
import { triggerJobByName, seedCronJobs } from "../src/lib/cronScheduler.ts";

const COMPANY_NAME = "__C27_SMOKE_COMPANY__";
const PASSPORT = "C27-SMOKE-PP-1";
const JOB_NAME = "umrah_daily_overstay_scan";

const ids = {};

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
  console.log("  ✓", msg);
}

async function teardown() {
  if (!ids.companyId) return;
  await rawExecute(`DELETE FROM notifications WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
  await rawExecute(`DELETE FROM umrah_violations WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
  await rawExecute(`DELETE FROM umrah_pilgrims WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
  await rawExecute(`DELETE FROM umrah_seasons WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
  await rawExecute(`DELETE FROM employee_assignments WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
  if (ids.employeeId) {
    await rawExecute(`DELETE FROM employees WHERE id=$1`, [ids.employeeId]).catch(() => {});
  }
  await rawExecute(`DELETE FROM cron_locks WHERE job_name=$1`, [JOB_NAME]).catch(() => {});
  await rawExecute(
    `DELETE FROM cron_logs WHERE "jobName"=$1 AND "createdAt" > NOW() - INTERVAL '10 minutes'`,
    [JOB_NAME]
  ).catch(() => {});
  await rawExecute(`DELETE FROM companies WHERE id=$1 AND name=$2`, [ids.companyId, COMPANY_NAME]).catch(() => {});
}

async function setup() {
  // Test company.
  const [c] = await rawQuery(
    `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
    [COMPANY_NAME]
  );
  ids.companyId = c.id;

  // Sentinel branch with id=0 — the C27 handler resolves the manager via
  // getManagerAssignmentId(companyId, 0), so the manager assignment must
  // sit on branchId=0. Branches.id is the PK (no composite), so id=0 is
  // global; ON CONFLICT keeps the smoke idempotent across reruns and
  // co-existing tests.
  await rawExecute(
    `INSERT INTO branches (id, "companyId", name, status)
     VALUES (0, $1, '__C27_SMOKE_BRANCH_0__', 'active')
     ON CONFLICT (id) DO NOTHING`,
    [ids.companyId]
  );

  // Manager employee + assignment (branchId=0, role matches the resolver's allow-list).
  const [emp] = await rawQuery(
    `INSERT INTO employees (name, email, status)
     VALUES ('C27 Smoke Manager', $1, 'active') RETURNING id`,
    [`c27-mgr-${ids.companyId}@smoke.local`]
  );
  ids.employeeId = emp.id;

  const [asn] = await rawQuery(
    `INSERT INTO employee_assignments
       ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
     VALUES ($1, $2, 0, 'Manager', 'general_manager', TRUE, 'active')
     RETURNING id`,
    [emp.id, ids.companyId]
  );
  ids.assignmentId = asn.id;

  // Season + overstayed pilgrim still inside KSA (15 actual vs 10 program).
  const [season] = await rawQuery(
    `INSERT INTO umrah_seasons ("companyId", title, "startDate", "endDate", status)
     VALUES ($1, 'C27 Smoke Season', '2026-01-01', '2026-12-31', 'open') RETURNING id`,
    [ids.companyId]
  );
  ids.seasonId = season.id;

  const [pilgrim] = await rawQuery(
    `INSERT INTO umrah_pilgrims
       ("companyId","seasonId","fullName","passportNumber","status",
        "isInsideKingdom","actualStayDays","programDuration","createdAt")
     VALUES ($1, $2, 'معتمر اختبار C27', $3, 'active', TRUE, 15, 10, NOW())
     RETURNING id`,
    [ids.companyId, ids.seasonId, PASSPORT]
  );
  ids.pilgrimId = pilgrim.id;

  console.log(
    `  seeded company=${ids.companyId} mgr-asn=${ids.assignmentId} pilgrim=${ids.pilgrimId} (5-day overstay)`
  );
}

async function main() {
  await teardown(); // safety net for a previous failed run
  await setup();

  // Make sure cron_jobs row exists so triggerJobByName logs cleanly,
  // and clear any stale lock from a previous failed run.
  await seedCronJobs();
  await rawExecute(`DELETE FROM cron_locks WHERE job_name=$1`, [JOB_NAME]);

  // ── Run 1: handler should detect, create violation, enqueue notification ──
  const r1 = await triggerJobByName(JOB_NAME);
  assert(r1.success, `handler run #1 succeeded (${r1.error || r1.result})`);

  const v1 = await rawQuery(
    `SELECT id, type, "mutamerId", "companyId", status
       FROM umrah_violations
      WHERE "companyId"=$1 AND "mutamerId"=$2 AND "deletedAt" IS NULL`,
    [ids.companyId, ids.pilgrimId]
  );
  assert(v1.length === 1, `exactly 1 overstay violation row created (got ${v1.length})`);
  assert(v1[0].type === "overstay", `violation.type = 'overstay' (got '${v1[0].type}')`);
  assert(
    Number(v1[0].companyId) === Number(ids.companyId),
    `violation scoped to companyId=${ids.companyId}`
  );

  const n1 = await rawQuery(
    `SELECT id, type, title FROM notifications
      WHERE "companyId"=$1 AND "assignmentId"=$2 AND type='umrah'`,
    [ids.companyId, ids.assignmentId]
  );
  assert(n1.length >= 1, `manager notification enqueued for assignment ${ids.assignmentId} (got ${n1.length})`);

  // ── Run 2: idempotency — re-running must not duplicate the violation ──
  await rawExecute(`DELETE FROM cron_locks WHERE job_name=$1`, [JOB_NAME]);
  const r2 = await triggerJobByName(JOB_NAME);
  assert(r2.success, `handler run #2 succeeded`);

  const v2 = await rawQuery(
    `SELECT id FROM umrah_violations
      WHERE "companyId"=$1 AND "mutamerId"=$2 AND "deletedAt" IS NULL`,
    [ids.companyId, ids.pilgrimId]
  );
  assert(v2.length === 1, `still exactly 1 violation after re-run (idempotent NOT EXISTS) — got ${v2.length}`);

  console.log("\nPASS — C27 overstay smoke (5/5 assertions)");
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  console.error("\nFAIL —", err?.message || err);
  exitCode = 1;
} finally {
  await teardown().catch((e) => console.error("teardown error:", e?.message || e));
  await pool.end().catch(() => {});
  process.exit(exitCode);
}
