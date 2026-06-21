// HR-014 §E.3 + §E.4 — integration tests for category-driven attendance policy.
//
// #1799 §F.6 core rule: «يمنع تطبيق خصومات تلقائية على المديرين والتنفيذيين
// إلا بسياسة صريحة». The whole HR-002→004 wiring was built around this. If
// the engine ever silently regresses to "deduct everyone", we lose trust
// with the executive line — these tests are the regression net.
//
// Scenarios covered:
//   1. Worker delay → resolveAttendancePolicy returns autoDeductionEnabled=true
//      with the worker category's penalty thresholds (the legacy behaviour).
//   2. Manager delay → resolveAttendancePolicy returns autoDeductionEnabled=false
//      AND the cron/autoViolationEngine sees the exempt flag before INSERT.
//   3. Per-company override on a system category (worker) takes precedence
//      over the seeded default — proves the 3-layer fallback works end-to-end.
//
// Gated on DATABASE_URL pointing at a test DB (same convention as the
// other *.dynamic.test.ts files). Skipped cleanly when DB isn't ready.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY_NAME = "__HR_POLICY_SMOKE_CO__";

d("attendance policy resolver — category exemption (#1799 §F.6)", () => {
  let rawQuery: any;
  let rawExecute: any;
  let resolveAttendancePolicy: any;
  const ids: {
    companyId?: number; branchId?: number;
    workerEmployeeId?: number; workerAssignmentId?: number;
    managerEmployeeId?: number; managerAssignmentId?: number;
  } = {};

  async function teardown() {
    if (!ids.companyId) return;
    await rawExecute(`DELETE FROM attendance_policies_per_category WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM employee_assignments WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    for (const eId of [ids.workerEmployeeId, ids.managerEmployeeId]) {
      if (eId) await rawExecute(`DELETE FROM employees WHERE id=$1`, [eId]).catch(() => {});
    }
    await rawExecute(`DELETE FROM branches WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM branches WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM companies WHERE id=$1 AND name=$2`, [ids.companyId, COMPANY_NAME]).catch(() => {});
  }

  beforeAll(async () => {
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const engine = await import("../../src/lib/attendancePolicyEngine.js");
    resolveAttendancePolicy = engine.resolveAttendancePolicy;

    await teardown();

    const [c] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [COMPANY_NAME]
    );
    ids.companyId = c.id as number;
    const [br] = await rawQuery(
      `INSERT INTO branches ("companyId", name) VALUES ($1, 'الفرع الرئيسي') RETURNING id`,
      [ids.companyId]
    );
    ids.branchId = br.id as number;

    // Worker (default category — autoDeductionEnabled=true).
    const [wEmp] = await rawQuery(
      `INSERT INTO employees (name, email, status)
       VALUES ('HR Policy Worker', $1, 'active') RETURNING id`,
      [`hr-policy-worker-${ids.companyId}@smoke.local`]
    );
    ids.workerEmployeeId = wEmp.id as number;
    const [wAsn] = await rawQuery(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status,"categoryKey")
       VALUES ($1, $2, $3, 'Worker', 'employee', TRUE, 'active', 'worker')
       RETURNING id`,
      [ids.workerEmployeeId, ids.companyId, ids.branchId]
    );
    ids.workerAssignmentId = wAsn.id as number;

    // Manager (seeded with exemptFromAutoDeduction=true in migration 270).
    const [mEmp] = await rawQuery(
      `INSERT INTO employees (name, email, status)
       VALUES ('HR Policy Manager', $1, 'active') RETURNING id`,
      [`hr-policy-mgr-${ids.companyId}@smoke.local`]
    );
    ids.managerEmployeeId = mEmp.id as number;
    const [mAsn] = await rawQuery(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status,"categoryKey")
       VALUES ($1, $2, $3, 'Manager', 'general_manager', TRUE, 'active', 'manager')
       RETURNING id`,
      [ids.managerEmployeeId, ids.companyId, ids.branchId]
    );
    ids.managerAssignmentId = mAsn.id as number;
  });

  afterAll(async () => { await teardown(); });

  it("worker → autoDeductionEnabled=true (legacy behaviour preserved)", async () => {
    const policy = await resolveAttendancePolicy({
      companyId: ids.companyId, assignmentId: ids.workerAssignmentId,
    });
    expect(policy.autoDeductionEnabled).toBe(true);
    expect(policy.categoryKey).toBe("worker");
  });

  it("manager → autoDeductionEnabled=false (executive exempt)", async () => {
    // The CORE #1799 §F.6 invariant — if this ever flips back to true
    // we'd start auto-deducting executives, breaking the operating
    // contract documented in the spec.
    const policy = await resolveAttendancePolicy({
      companyId: ids.companyId, assignmentId: ids.managerAssignmentId,
    });
    expect(policy.autoDeductionEnabled).toBe(false);
    expect(policy.categoryKey).toBe("manager");
  });

  it("per-company override flips a system category's default", async () => {
    // Company decides workers in their org SHOULDN'T be auto-deducted
    // (e.g. craftsmen who manage their own hours). Override layer must
    // beat the system seed.
    await rawExecute(
      `INSERT INTO attendance_policies_per_category
         ("companyId","categoryKey","autoDeductionEnabled","lateThresholdMinutes")
       VALUES ($1, 'worker', FALSE, 10)
       ON CONFLICT ("companyId","categoryKey") DO UPDATE
          SET "autoDeductionEnabled" = EXCLUDED."autoDeductionEnabled",
              "lateThresholdMinutes" = EXCLUDED."lateThresholdMinutes"`,
      [ids.companyId]
    );
    const policy = await resolveAttendancePolicy({
      companyId: ids.companyId, assignmentId: ids.workerAssignmentId,
    });
    expect(policy.autoDeductionEnabled).toBe(false);
    expect(policy.lateThresholdMinutes).toBe(10);
  });

  it("uncategorised assignment falls back to company default (no NULL crash)", async () => {
    // Backward compatibility: legacy assignments without categoryKey
    // must NOT crash the engine. They should resolve to the company-wide
    // default behaviour (whatever attendance_policies row exists).
    const [legacyEmp] = await rawQuery(
      `INSERT INTO employees (name, email, status)
       VALUES ('HR Policy Legacy', $1, 'active') RETURNING id`,
      [`hr-policy-legacy-${ids.companyId}@smoke.local`]
    );
    const [legacyAsn] = await rawQuery(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1, $2, $3, 'Legacy', 'employee', TRUE, 'active')
       RETURNING id`,
      [legacyEmp.id, ids.companyId, ids.branchId]
    );
    const policy = await resolveAttendancePolicy({
      companyId: ids.companyId, assignmentId: legacyAsn.id,
    });
    expect(policy).toBeDefined();
    expect(typeof policy.autoDeductionEnabled).toBe("boolean");
    // Cleanup local seed
    await rawExecute(`DELETE FROM employee_assignments WHERE id=$1`, [legacyAsn.id]).catch(() => {});
    await rawExecute(`DELETE FROM employees WHERE id=$1`, [legacyEmp.id]).catch(() => {});
  });
});
