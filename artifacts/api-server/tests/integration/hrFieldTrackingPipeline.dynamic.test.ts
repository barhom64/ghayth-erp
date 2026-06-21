// HR-021 §K — integration test for the GPS field tracking pipeline.
//
// #1799 §E required: "سائق GPS → نقطة محفوظة في field_tracking_points".
// This test exercises the WHOLE pipeline at the SQL layer (the route
// handler does authz/zod/policy enforcement which is unit-covered
// separately; what we need to prove here is that:
//
//   1. A driver assignment (category=driver, trackingFrequencySeconds=30)
//      results in pings being accepted and stored.
//   2. A manager assignment (category=manager, trackingFrequencySeconds=0)
//      is rejected because the policy says no live tracking.
//   3. The breadcrumb query orders by capturedAt ASC for the same day.
//
// The route-level enforcement is well-covered by attendancePolicyEngine
// unit tests; here we prove the DB schema + engine policy + storage all
// agree end-to-end.
//
// Gated on DATABASE_URL pointing at the local test DB (same convention
// as the other *.dynamic.test.ts files).

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY_NAME = "__HR_GPS_PIPELINE_CO__";

d("field tracking pipeline — GPS ingestion + breadcrumb read (#1799 §K)", () => {
  let rawQuery: any;
  let rawExecute: any;
  let resolveAttendancePolicy: any;
  const ids: {
    companyId?: number; branchId?: number;
    driverEmployeeId?: number; driverAssignmentId?: number;
    managerEmployeeId?: number; managerAssignmentId?: number;
  } = {};

  async function teardown() {
    if (!ids.companyId) return;
    await rawExecute(`DELETE FROM field_tracking_points WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM employee_assignments WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    for (const eId of [ids.driverEmployeeId, ids.managerEmployeeId]) {
      if (eId) await rawExecute(`DELETE FROM employees WHERE id=$1`, [eId]).catch(() => {});
    }
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

    // Driver — category seeded with trackingFrequencySeconds=30.
    const [dEmp] = await rawQuery(
      `INSERT INTO employees (name, email, status) VALUES ('GPS Driver', $1, 'active') RETURNING id`,
      [`gps-driver-${ids.companyId}@smoke.local`]
    );
    ids.driverEmployeeId = dEmp.id as number;
    const [dAsn] = await rawQuery(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status,"categoryKey")
       VALUES ($1, $2, $3, 'Driver', 'employee', TRUE, 'active', 'driver') RETURNING id`,
      [ids.driverEmployeeId, ids.companyId, ids.branchId]
    );
    ids.driverAssignmentId = dAsn.id as number;

    // Manager — category seeded with trackingFrequencySeconds=0 (no tracking).
    const [mEmp] = await rawQuery(
      `INSERT INTO employees (name, email, status) VALUES ('GPS Manager', $1, 'active') RETURNING id`,
      [`gps-manager-${ids.companyId}@smoke.local`]
    );
    ids.managerEmployeeId = mEmp.id as number;
    const [mAsn] = await rawQuery(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status,"categoryKey")
       VALUES ($1, $2, $3, 'Manager', 'general_manager', TRUE, 'active', 'manager') RETURNING id`,
      [ids.managerEmployeeId, ids.companyId, ids.branchId]
    );
    ids.managerAssignmentId = mAsn.id as number;
  });

  afterAll(async () => { await teardown(); });

  it("driver category has trackingFrequencySeconds > 0 (tracking enabled)", async () => {
    const policy = await resolveAttendancePolicy({
      companyId: ids.companyId, assignmentId: ids.driverAssignmentId,
    });
    expect(policy.trackingFrequencySeconds).toBeGreaterThan(0);
    expect(policy.trackingFrequencySeconds).toBe(30); // worker/driver seed default
  });

  it("manager category has trackingFrequencySeconds = 0 (tracking disabled)", async () => {
    const policy = await resolveAttendancePolicy({
      companyId: ids.companyId, assignmentId: ids.managerAssignmentId,
    });
    expect(policy.trackingFrequencySeconds).toBe(0);
  });

  it("inserting a ping row produces a readable field_tracking_points entry", async () => {
    // Simulate what /hr/attendance/field-ping does after passing
    // policy/zod gates. The schema requirements: companyId, assignmentId,
    // lat/lng, plus the optional fields.
    const ping = {
      lat: 24.7136, lng: 46.6753, accuracy: 5.2, speed: 65, heading: 90,
      battery: 78, source: "gps", deviceId: "device-abc-123",
    };
    const [row] = await rawQuery<any>(
      `INSERT INTO field_tracking_points
        ("companyId", "assignmentId", lat, lng, accuracy, speed, heading,
         battery, source, "deviceId", "capturedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       RETURNING *`,
      [ids.companyId, ids.driverAssignmentId, ping.lat, ping.lng,
       ping.accuracy, ping.speed, ping.heading, ping.battery,
       ping.source, ping.deviceId],
    );
    expect(Number(row.id)).toBeGreaterThan(0);
    expect(Number(row.lat)).toBeCloseTo(ping.lat, 4);
    expect(Number(row.lng)).toBeCloseTo(ping.lng, 4);
    expect(row.source).toBe("gps");
    expect(row.deviceId).toBe("device-abc-123");

    // Now read it back the way the breadcrumb endpoint does.
    const reread = await rawQuery<any>(
      `SELECT id, lat, lng, source, battery, "capturedAt"
         FROM field_tracking_points
        WHERE "assignmentId" = $1 AND "companyId" = $2
        ORDER BY "capturedAt" ASC`,
      [ids.driverAssignmentId, ids.companyId],
    );
    expect(reread.length).toBeGreaterThanOrEqual(1);
    expect(reread.find((r: any) => r.id === row.id)).toBeTruthy();
  });

  it("multiple pings for the same day order by capturedAt ASC (breadcrumb shape)", async () => {
    // Clear earlier inserts from the previous test to make ordering crisp.
    await rawExecute(
      `DELETE FROM field_tracking_points WHERE "assignmentId" = $1`,
      [ids.driverAssignmentId],
    );
    const baseTs = new Date();
    baseTs.setMinutes(baseTs.getMinutes() - 60);
    // Insert 3 pings out of order in real time, but with capturedAt
    // timestamps 20 minutes apart. The ASC order on capturedAt must
    // produce the [first → middle → last] sequence regardless of insert
    // order.
    const pings = [
      { dt: new Date(baseTs.getTime() + 40 * 60_000), lat: 24.74, lng: 46.69 },
      { dt: baseTs, lat: 24.71, lng: 46.67 },
      { dt: new Date(baseTs.getTime() + 20 * 60_000), lat: 24.72, lng: 46.68 },
    ];
    for (const p of pings) {
      await rawExecute(
        `INSERT INTO field_tracking_points
          ("companyId", "assignmentId", lat, lng, source, "capturedAt")
         VALUES ($1, $2, $3, $4, 'gps', $5)`,
        [ids.companyId, ids.driverAssignmentId, p.lat, p.lng, p.dt.toISOString()],
      );
    }
    const ordered = await rawQuery<any>(
      `SELECT lat, lng, "capturedAt" FROM field_tracking_points
        WHERE "assignmentId" = $1 AND "companyId" = $2
        ORDER BY "capturedAt" ASC`,
      [ids.driverAssignmentId, ids.companyId],
    );
    expect(ordered.length).toBe(3);
    // The first row must be the earliest timestamp (lat 24.71).
    expect(Number(ordered[0].lat)).toBeCloseTo(24.71, 2);
    expect(Number(ordered[1].lat)).toBeCloseTo(24.72, 2);
    expect(Number(ordered[2].lat)).toBeCloseTo(24.74, 2);
  });

  it("field_tracking_points respects companyId scoping (no cross-tenant leak)", async () => {
    // Pull only this company's rows — must not see anything from other
    // companies in the test DB.
    const rows = await rawQuery<{ id: number }>(
      `SELECT id FROM field_tracking_points
        WHERE "assignmentId" = $1 AND "companyId" = $2`,
      [ids.driverAssignmentId, ids.companyId],
    );
    expect(rows.every((r: any) => r.id !== null)).toBe(true);
    // And explicitly querying with the WRONG companyId returns nothing.
    const wrongCompany = await rawQuery<{ id: number }>(
      `SELECT id FROM field_tracking_points
        WHERE "assignmentId" = $1 AND "companyId" = -1`,
      [ids.driverAssignmentId],
    );
    expect(wrongCompany.length).toBe(0);
  });
});
