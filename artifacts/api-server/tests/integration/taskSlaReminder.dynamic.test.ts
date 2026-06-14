// CI wiring for the inbox-task SLA reminder cron handler
// (inbox_task_sla_reminder_scan).
//
// Exercises the BUNDLED cron handler via triggerJobByName so the guard
// step 4 catches handler regressions on every PR. Auto-discovered by
// vitest; scenarios are gated on `dbReady` so dev runs without a test
// DATABASE_URL skip cleanly.
//
// The handler is pre-breach only: per company it scans pending, not-yet-
// breached tasks (slaDeadline > NOW()) that carry an slaDeadline, fires a
// first reminder once the remaining window crosses the lead threshold
// (stamping slaReminderSentAt), and — when the company opts into
// finalReminderHours — an optional final reminder closer to the deadline
// (stamping slaFinalReminderSentAt). Both stamps are atomic compare-and-set
// so repeated runs are idempotent. The decision lives in the pure
// shouldFireSlaReminder (unit-tested without a DB).
//
// To run locally:
//   docker compose -f tests/integration/postgres/docker-compose.yml up -d
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=test-secret-with-at-least-thirty-two-characters-aaaaaaaaaaaaa
//   bash db/bootstrap.sh
//   pnpm --filter @workspace/api-server test tests/integration/taskSlaReminder.dynamic.test.ts

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { fkSafeTeardown } from "./_fixtures/teardown.js";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY_NAME = "__TASK_SLA_SMOKE_COMPANY__";
const JOB_NAME = "inbox_task_sla_reminder_scan";

d("inbox task SLA reminder (bundled cron handler)", () => {
  let rawQuery: any;
  let rawExecute: any;
  let triggerJobByName: any;
  let seedCronJobs: any;
  const ids: {
    companyId?: number; branchId?: number;
    asnEmp?: number; asn?: number;   // assignee (task owner)
    reminderTask?: number;
  } = {};

  async function teardown() {
    if (!ids.companyId) return;
    await fkSafeTeardown(async (del) => {
      await del(`DELETE FROM notifications WHERE "companyId"=$1`, [ids.companyId]);
      await del(`DELETE FROM notification_deliveries WHERE "companyId"=$1`, [ids.companyId]);
      await del(`DELETE FROM outbound_queue WHERE "companyId"=$1`, [ids.companyId]);
      await del(`DELETE FROM task_assignees WHERE "companyId"=$1`, [ids.companyId]);
      await del(`DELETE FROM tasks WHERE "companyId"=$1`, [ids.companyId]);
      await del(`DELETE FROM employee_assignments WHERE "companyId"=$1`, [ids.companyId]);
      if (ids.asnEmp) await del(`DELETE FROM employees WHERE id=$1`, [ids.asnEmp]);
      if (ids.branchId) await del(`DELETE FROM branches WHERE id=$1`, [ids.branchId]);
      await del(`DELETE FROM cron_locks WHERE job_name=$1`, [JOB_NAME]);
      await del(`DELETE FROM cron_logs WHERE "jobName"=$1 AND "createdAt" > NOW() - INTERVAL '10 minutes'`, [JOB_NAME]);
      await del(`DELETE FROM settings WHERE scope='company' AND "scopeId"=$1 AND key='inbox.task_sla_reminder'`, [ids.companyId]);
      await del(`DELETE FROM companies WHERE id=$1 AND name=$2`, [ids.companyId, COMPANY_NAME]);
    });
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const cron = await import("../../src/lib/cronScheduler.js");
    triggerJobByName = cron.triggerJobByName;
    seedCronJobs = cron.seedCronJobs;

    // Self-provision the reminder-stamp columns: the CI harness marks all
    // migrations applied without running post-dump DDL, so these columns
    // would otherwise be missing on a fresh harness DB.
    await rawExecute(
      `ALTER TABLE tasks
         ADD COLUMN IF NOT EXISTS "slaReminderSentAt"      TIMESTAMPTZ,
         ADD COLUMN IF NOT EXISTS "slaFinalReminderSentAt" TIMESTAMPTZ`
    );

    await teardown();

    const [c] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [COMPANY_NAME]
    );
    ids.companyId = c.id as number;

    const [b] = await rawQuery(
      `INSERT INTO branches ("companyId", name, status)
       VALUES ($1, '__TASK_SLA_BRANCH__', 'active') RETURNING id`,
      [ids.companyId]
    );
    ids.branchId = b.id as number;

    // The task assignee — the reminder target.
    const [emp] = await rawQuery(
      `INSERT INTO employees (name, email, status)
       VALUES ('Task SLA Assignee', $1, 'active') RETURNING id`,
      [`task-sla-asn-${ids.companyId}@smoke.local`]
    );
    ids.asnEmp = emp.id as number;
    const [asn] = await rawQuery(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1,$2,$3,'Support Manager','support_manager',TRUE,'active') RETURNING id`,
      [ids.asnEmp, ids.companyId, ids.branchId]
    );
    ids.asn = asn.id as number;

    // Reminder task: created 10h ago, deadline in 1h → inside the last 20%
    // of the 11h window (threshold 2.2h), so the first reminder fires.
    const [rt] = await rawQuery(
      `INSERT INTO tasks ("companyId", title, description, type, status, priority,
                          "slaDeadline", "assignedTo", "assignmentId", "createdAt")
       VALUES ($1, 'شكوى قرب الموعد', 'reminder fixture', 'complaint', 'pending', 'high',
               NOW() + INTERVAL '1 hour', $2, $2, NOW() - INTERVAL '10 hours')
       RETURNING id`,
      [ids.companyId, ids.asn]
    );
    ids.reminderTask = rt.id as number;

    await seedCronJobs();
    await rawExecute(`DELETE FROM cron_locks WHERE job_name=$1`, [JOB_NAME]);
  }, 30000);

  afterAll(async () => {
    await teardown();
  });

  it("reminds the assignee when the deadline is approaching", async () => {
    const r = await triggerJobByName(JOB_NAME);
    expect(r.success, `handler error: ${r.error || ""}`).toBe(true);

    const [task] = await rawQuery(
      `SELECT "slaReminderSentAt" FROM tasks WHERE id=$1`,
      [ids.reminderTask]
    );
    expect(task.slaReminderSentAt).not.toBeNull();

    const n = await rawQuery(
      `SELECT id FROM notifications
        WHERE "companyId"=$1 AND "assignmentId"=$2 AND type='task'
          AND "refType"='tasks' AND "refId"=$3`,
      [ids.companyId, ids.asn, ids.reminderTask]
    );
    expect(n.length).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent — re-running does not re-notify an already-reminded task", async () => {
    await rawExecute(`DELETE FROM cron_locks WHERE job_name=$1`, [JOB_NAME]);
    const r = await triggerJobByName(JOB_NAME);
    expect(r.success, `handler error: ${r.error || ""}`).toBe(true);

    const reminderNotifs = await rawQuery(
      `SELECT id FROM notifications
        WHERE "companyId"=$1 AND "assignmentId"=$2 AND type='task'
          AND "refType"='tasks' AND "refId"=$3`,
      [ids.companyId, ids.asn, ids.reminderTask]
    );
    expect(reminderNotifs).toHaveLength(1);
  });

  it("honors a per-company finalReminderHours setting (optional second reminder)", async () => {
    // Opt the company into a 2h second-reminder window via the 3-level
    // settings engine. resolveSettings reads this per company.
    await rawExecute(
      `INSERT INTO settings (scope, "scopeId", key, value)
       VALUES ('company', $1, 'inbox.task_sla_reminder', $2::jsonb)
       ON CONFLICT (scope, "scopeId", key) WHERE "scopeId" IS NOT NULL
       DO UPDATE SET value = EXCLUDED.value`,
      [ids.companyId, JSON.stringify({ leadFraction: 0.2, leadHours: null, finalReminderHours: 2 })]
    );

    // Fresh task: created 1h ago, deadline in 1.5h. The last-20% first-reminder
    // window (0.5h before deadline) has NOT been entered yet, but the 2h final
    // window HAS — so ONLY the final reminder fires for this task.
    const [ft] = await rawQuery(
      `INSERT INTO tasks ("companyId", title, description, type, status, priority,
                          "slaDeadline", "assignedTo", "assignmentId", "createdAt")
       VALUES ($1, 'شكوى تذكير أخير', 'final reminder fixture', 'complaint', 'pending', 'high',
               NOW() + INTERVAL '1.5 hours', $2, $2, NOW() - INTERVAL '1 hour')
       RETURNING id`,
      [ids.companyId, ids.asn]
    );
    const finalTask = ft.id as number;

    await rawExecute(`DELETE FROM cron_locks WHERE job_name=$1`, [JOB_NAME]);
    const r = await triggerJobByName(JOB_NAME);
    expect(r.success, `handler error: ${r.error || ""}`).toBe(true);

    const [task] = await rawQuery(
      `SELECT "slaReminderSentAt", "slaFinalReminderSentAt" FROM tasks WHERE id=$1`,
      [finalTask]
    );
    expect(task.slaFinalReminderSentAt).not.toBeNull();
    expect(task.slaReminderSentAt).toBeNull();

    const n = await rawQuery(
      `SELECT id FROM notifications
        WHERE "companyId"=$1 AND "assignmentId"=$2 AND type='task'
          AND "refType"='tasks' AND "refId"=$3`,
      [ids.companyId, ids.asn, finalTask]
    );
    expect(n.length).toBeGreaterThanOrEqual(1);

    // Idempotent: a second run does not re-stamp or re-notify.
    await rawExecute(`DELETE FROM cron_locks WHERE job_name=$1`, [JOB_NAME]);
    const r2 = await triggerJobByName(JOB_NAME);
    expect(r2.success, `handler error: ${r2.error || ""}`).toBe(true);
    const n2 = await rawQuery(
      `SELECT id FROM notifications
        WHERE "companyId"=$1 AND "assignmentId"=$2 AND type='task'
          AND "refType"='tasks' AND "refId"=$3`,
      [ids.companyId, ids.asn, finalTask]
    );
    expect(n2).toHaveLength(1);

    await rawExecute(`DELETE FROM settings WHERE scope='company' AND "scopeId"=$1 AND key='inbox.task_sla_reminder'`, [ids.companyId]);
  });
});
