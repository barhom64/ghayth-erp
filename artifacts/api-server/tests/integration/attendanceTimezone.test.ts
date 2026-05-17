// Route-level integration test for the Task #400 timezone fix.
//
// Task #400 patched /api/hr/check-in and /api/hr/check-out to derive the
// "today" calendar date in Asia/Riyadh (instead of the host's local TZ)
// and to interpret shift HH:MM strings as Riyadh wall-clock instants
// (instead of `setHours()` against the server's local TZ). The unit
// tests in tests/unit/attendanceTimezone.test.ts cover the two helpers
// (`currentDateInTz` + `combineDateAndShiftTime`) in isolation, but a
// future refactor of the route handler could re-introduce the bug while
// the unit tests stay green. This test boots the real Express handler
// via supertest, fakes `new Date()` to instants where the buggy
// pre-Task-#400 server-local code produced wrong answers on a TZ=UTC
// host, and asserts the persisted attendance row is correct end-to-end.
//
// Faked instants and what they would have produced under the OLD code:
//   1. 2026-05-13 22:30 UTC = 2026-05-14 01:30 Asia/Riyadh
//      OLD: attendance.date = '2026-05-13' (UTC calendar)
//      NEW: attendance.date = '2026-05-14' (Riyadh calendar)
//   2. 2026-05-17 05:30 UTC = 2026-05-17 08:30 Asia/Riyadh, shift 08:00 KSA
//      OLD: lateMinutes ≈ -150 (server-local 08:00 = 11:00 KSA, so 'early')
//      NEW: lateMinutes = 30
//   3. 2026-05-18 15:00 UTC = 2026-05-18 18:00 Asia/Riyadh, shift end 17:00 KSA
//      OLD: overtimeMinutes = ~ -180 → clamped to 0, early-departure=180
//      NEW: overtimeMinutes = 60

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY_NAME = "__ATT_TZ_COMPANY__";
const EMP_EMAIL = "att-tz-emp@smoke.local";
const CSRF_TOKEN = "att-tz-csrf-token";

// This suite MUST run with process.env.TZ='UTC'. Do NOT remove the TZ
// enforcement in beforeAll/afterAll — the whole point of Task #427 is
// to prove the handler stays correct on a UTC server, which is the
// shape of the bug Task #400 fixed. Without the TZ pin, this test can
// silently pass on a host already in (or near) Asia/Riyadh and a future
// server-local Date regression would slip through.
const ORIGINAL_TZ = process.env.TZ;

d("Attendance timezone — /api/hr/check-in & /check-out (Task #400)", () => {
  let app: any;
  let request: any;
  let rawQuery: any;
  let rawExecute: any;
  let signToken: any;
  let hashPassword: any;

  const ids: {
    companyId?: number;
    branchId?: number;
    employeeId?: number;
    userId?: number;
    assignmentId?: number;
    contractId?: number;
    shiftId?: number;
    token?: string;
  } = {};

  async function teardown() {
    if (!ids.companyId) return;
    // Order matters: child rows before parents. Each delete is best-effort.
    await rawExecute(`DELETE FROM employee_monthly_attendance WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM attendance_deductions WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM employee_violations WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM attendance WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM employee_shift_assignments WHERE "assignmentId"=$1`, [ids.assignmentId ?? 0]).catch(() => {});
    if (ids.shiftId) await rawExecute(`DELETE FROM shifts WHERE id=$1`, [ids.shiftId]).catch(() => {});
    await rawExecute(`DELETE FROM employee_contracts WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM attendance_policies WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM notifications WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM employee_assignments WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    if (ids.userId) await rawExecute(`DELETE FROM users WHERE id=$1`, [ids.userId]).catch(() => {});
    if (ids.employeeId) await rawExecute(`DELETE FROM employees WHERE id=$1`, [ids.employeeId]).catch(() => {});
    await rawExecute(`DELETE FROM branches WHERE "companyId"=$1`, [ids.companyId]).catch(() => {});
    await rawExecute(`DELETE FROM companies WHERE id=$1 AND name=$2`, [ids.companyId, COMPANY_NAME]).catch(() => {});
  }

  beforeAll(async () => {
    // Pin TZ=UTC for the whole suite. The handler helpers
    // (currentDateInTz / combineDateAndShiftTime) are TZ-independent by
    // construction, but a future regression that slips back to host-local
    // Date math would silently pass on an Asia/Riyadh runner — pinning
    // UTC here is what makes this an "on UTC servers" guarantee.
    process.env.TZ = "UTC";

    request = (await import("supertest")).default;
    const appModule = await import("../../src/app.js");
    app = appModule.default;

    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;

    const auth = await import("../../src/lib/auth.js");
    signToken = auth.signToken;
    hashPassword = auth.hashPassword;

    // Best-effort cleanup of any stragglers from a previous failed run.
    const [stale] = await rawQuery(
      `SELECT id FROM companies WHERE name=$1 LIMIT 1`,
      [COMPANY_NAME]
    );
    if (stale) {
      ids.companyId = stale.id as number;
      await teardown();
      ids.companyId = undefined;
    }

    const passwordHash = await hashPassword("test-password-1234");

    const [c] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [COMPANY_NAME]
    );
    ids.companyId = c.id as number;

    const [b] = await rawQuery(
      `INSERT INTO branches ("companyId", name, status)
       VALUES ($1, '__ATT_TZ_BRANCH__', 'active') RETURNING id`,
      [ids.companyId]
    );
    ids.branchId = b.id as number;

    const [emp] = await rawQuery(
      `INSERT INTO employees (name, email, status)
       VALUES ('TZ Smoke Employee', $1, 'active') RETURNING id`,
      [EMP_EMAIL]
    );
    ids.employeeId = emp.id as number;

    const [u] = await rawQuery(
      `INSERT INTO users ("employeeId", email, "passwordHash", "isActive")
       VALUES ($1, $2, $3, TRUE) RETURNING id`,
      [ids.employeeId, EMP_EMAIL, passwordHash]
    );
    ids.userId = u.id as number;

    const [asn] = await rawQuery(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle",role,"isPrimary",status)
       VALUES ($1, $2, $3, 'Tester', 'employee', TRUE, 'active')
       RETURNING id`,
      [ids.employeeId, ids.companyId, ids.branchId]
    );
    ids.assignmentId = asn.id as number;

    const [contract] = await rawQuery(
      `INSERT INTO employee_contracts
         ("companyId","employeeId","assignmentId","contractType","startDate","endDate",status)
       VALUES ($1, $2, $3, 'full_time', '2026-01-01', '2026-12-31', 'active')
       RETURNING id`,
      [ids.companyId, ids.employeeId, ids.assignmentId]
    );
    ids.contractId = contract.id as number;

    // Shift: 08:00–17:00 KSA, Sun(0)–Thu(4). 2026-05-14 (Thu),
    // 2026-05-17 (Sun), 2026-05-18 (Mon) all fall on workdays.
    const [shift] = await rawQuery(
      `INSERT INTO shifts ("companyId","branchId",name,"startTime","endTime",days,"isDefault","shiftType",status)
       VALUES ($1, $2, '__ATT_TZ_SHIFT__', '08:00', '17:00', '0,1,2,3,4', TRUE, 'fixed', 'active')
       RETURNING id`,
      [ids.companyId, ids.branchId]
    );
    ids.shiftId = shift.id as number;

    await rawExecute(
      `INSERT INTO employee_shift_assignments ("assignmentId","shiftId","startDate")
       VALUES ($1, $2, '2026-01-01')`,
      [ids.assignmentId, ids.shiftId]
    );

    // Default attendance_policies are fine (lateThreshold=15, gpsRadius=500),
    // but inserting an explicit row makes the test self-documenting.
    await rawExecute(
      `INSERT INTO attendance_policies ("companyId","lateThresholdMinutes","gpsRadiusMeters")
       VALUES ($1, 15, 500)`,
      [ids.companyId]
    );

    // Fake only Date so Postgres timeouts/setImmediate keep working.
    vi.useFakeTimers({ toFake: ["Date"] });
  }, 60_000);

  afterAll(async () => {
    vi.useRealTimers();
    await teardown();
    if (ORIGINAL_TZ === undefined) delete process.env.TZ;
    else process.env.TZ = ORIGINAL_TZ;
  });

  function tokenFor(): string {
    // Re-sign each call so the JWT exp is computed against the *current*
    // faked clock — otherwise vi.setSystemTime to a 2026 date can put us
    // past the token's 15-minute expiry and verifyToken throws.
    return signToken({
      userId: ids.userId!,
      assignmentId: ids.assignmentId!,
      role: "employee",
    });
  }

  async function postCheckIn(): Promise<any> {
    return request(app)
      .post("/api/hr/check-in")
      .set("Authorization", `Bearer ${tokenFor()}`)
      .set("Cookie", `erp_csrf=${CSRF_TOKEN}`)
      .set("x-csrf-token", CSRF_TOKEN)
      .send({});
  }

  async function postCheckOut(): Promise<any> {
    return request(app)
      .post("/api/hr/check-out")
      .set("Authorization", `Bearer ${tokenFor()}`)
      .set("Cookie", `erp_csrf=${CSRF_TOKEN}`)
      .set("x-csrf-token", CSRF_TOKEN)
      .send({});
  }

  it("01:30 Riyadh check-in (= 22:30 UTC the day before) lands on the Riyadh calendar date", async () => {
    // 2026-05-13 22:30 UTC === 2026-05-14 01:30 Asia/Riyadh.
    // Pre-Task-#400 code would have stored attendance.date='2026-05-13'.
    vi.setSystemTime(new Date("2026-05-13T22:30:00.000Z"));

    const res = await postCheckIn();
    expect(res.status, JSON.stringify(res.body)).toBe(200);

    const rows = await rawQuery(
      `SELECT id, date::text AS date, "lateMinutes"
         FROM attendance
        WHERE "assignmentId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL
        ORDER BY id DESC LIMIT 1`,
      [ids.assignmentId, ids.companyId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe("2026-05-14");
    // 01:30 KSA is BEFORE 08:00 KSA shift start → no late minutes.
    expect(Number(rows[0].lateMinutes)).toBe(0);
  });

  it("08:30 Riyadh check-in against an 08:00 Riyadh shift records lateMinutes=30 (not -150)", async () => {
    // 2026-05-17 05:30 UTC === 2026-05-17 08:30 Asia/Riyadh.
    vi.setSystemTime(new Date("2026-05-17T05:30:00.000Z"));

    const res = await postCheckIn();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.lateMinutes).toBe(30);
    expect(res.body.isLate).toBe(true);

    const [row] = await rawQuery(
      `SELECT date::text AS date, "lateMinutes"
         FROM attendance
        WHERE "assignmentId"=$1 AND date='2026-05-17' AND "deletedAt" IS NULL`,
      [ids.assignmentId]
    );
    expect(row).toBeTruthy();
    expect(row.date).toBe("2026-05-17");
    expect(Number(row.lateMinutes)).toBe(30);
  });

  it("18:00 Riyadh check-out against a 17:00 Riyadh shift end records overtimeMinutes=60", async () => {
    // 2026-05-18 05:00 UTC === 2026-05-18 08:00 Riyadh — on-time check-in.
    vi.setSystemTime(new Date("2026-05-18T05:00:00.000Z"));
    const inRes = await postCheckIn();
    expect(inRes.status, JSON.stringify(inRes.body)).toBe(200);
    expect(inRes.body.lateMinutes).toBe(0);

    // 2026-05-18 15:00 UTC === 2026-05-18 18:00 Riyadh — 1h after shift end.
    vi.setSystemTime(new Date("2026-05-18T15:00:00.000Z"));
    const outRes = await postCheckOut();
    expect(outRes.status, JSON.stringify(outRes.body)).toBe(200);

    const [row] = await rawQuery(
      `SELECT "overtimeMinutes", "earlyLeaveMinutes"
         FROM attendance
        WHERE "assignmentId"=$1 AND date='2026-05-18' AND "deletedAt" IS NULL`,
      [ids.assignmentId]
    );
    expect(row).toBeTruthy();
    expect(Number(row.overtimeMinutes)).toBe(60);
  });
});
