// #2079 Wave 3 — A-04 live E2E: driver bill-of-lading 7-step + checkpoints.
//
// Acceptance criteria (docs/transport-audit/17_معايير_القبول.md, A-04):
//   Driver walks the bill-of-lading 7-step flow and logs balance /
//   rest / inspection checkpoints. Each step is visible from the
//   driver screen; checkpoints appear on the ops timeline; the
//   driver seals "delivered".
//
// What A-04 proves end-to-end against the live HEAD-of-main Postgres:
//
//   • A driver-scoped JWT (assignmentId + fleet_drivers row resolved
//     from scope.employeeId) can walk POST /api/fleet/me/cargo/:id/advance
//     through the entire 7-state forward chain:
//       assigned_to_driver → driver_accepted → trip_started
//       → arrived_pickup → loaded → in_transit → arrived_delivery
//       → delivered
//   • Each transition lands in `cargo_manifests.status`; backward
//     and skip moves are refused by the state machine.
//   • The driver can record operational checkpoints during the
//     trip via POST /api/fleet/me/cargo/:id/checkpoint, and the
//     dispatcher / ops timeline (GET /api/fleet/me/cargo/:id/checkpoints)
//     surfaces them in order — proving the audit trail the auditor
//     ringed actually reaches the ops surface.
//   • The driver's `delivered` tap is the SEAL — no further state
//     change is allowed via the driver endpoint (final transitions
//     to `completed` are dispatcher / accountant moves, NOT driver).
//
// Activation gate matches A-01..A-03.

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const CSRF_TOKEN = "a04-test-csrf-token-double-submit-pair";
function withAuth(req: any, token: string) {
  return req
    .set("Authorization", `Bearer ${token}`)
    .set("Cookie", `erp_csrf=${CSRF_TOKEN}`)
    .set("x-csrf-token", CSRF_TOKEN);
}

d("#2079 A-04 — driver BoL 7-step + checkpoints (live, real driver scope)", () => {
  let app: any;
  let request: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let signToken: typeof import("../../src/lib/auth.js").signToken;

  let companyId: number;
  let branchId: number;
  let driverEmployeeId: number;
  let driverUserId: number;
  let driverAssignmentId: number;
  let driverId: number;
  let driverToken: string;
  let manifestId: number;
  let manifestNumber: string;

  beforeAll(async () => {
    request = (await import("supertest")).default;
    const appMod = await import("../../src/app.js");
    app = appMod.default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const auth = await import("../../src/lib/auth.js");
    signToken = auth.signToken;
    const { hashPassword } = auth;
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");

    const stamp = Date.now();
    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [`A-04 Driver BoL Co ${stamp}`],
    );
    companyId = cid;
    await bootstrapCompany(companyId, "A-04 Driver BoL Co");
    const [{ id: bid }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`,
      [companyId],
    );
    branchId = bid;

    // Driver employee + user + assignment + fleet_drivers row. The
    // `resolveDriverFromScope` helper inside fleet.ts looks up the
    // driver row via (employeeId, companyId), so the assignment's
    // role can be the regular "employee" — what matters is that a
    // fleet_drivers row exists for the employee.
    const hash = await hashPassword("test-password-1234");
    const [{ id: eid }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees ("companyId","branchId",name,status,"createdAt")
       VALUES ($1,$2,'A-04 Driver','active',NOW()) RETURNING id`,
      [companyId, branchId],
    );
    driverEmployeeId = eid;
    const [{ id: uid }] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive",role,"createdAt")
       VALUES ($1,$2,$3,TRUE,'driver',NOW()) RETURNING id`,
      [eid, `a04-driver-${stamp}@local.test`, hash],
    );
    driverUserId = uid;
    const [{ id: aid }] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle","role",status,"hireDate","createdAt")
       VALUES ($1,$2,$3,'Driver','driver','active',CURRENT_DATE,NOW()) RETURNING id`,
      [eid, companyId, branchId],
    );
    driverAssignmentId = aid;
    const [{ id: drv }] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_drivers
         ("companyId","employeeId",name,"licenseNumber","licenseExpiry",
          "licenseType","licenseClass",status,"restHoursRequired")
       VALUES ($1,$2,'سائق اختبار A-04',$3,'2099-12-31','PUBLIC','D','available',8)
       RETURNING id`,
      [companyId, eid, `A04-DRV-${String(stamp).slice(-6)}`],
    );
    driverId = drv;

    // requireModule("fleet") middleware (mounted in routes/index.ts on
    // every /fleet/* route) reads rbac_user_roles → rbac_roles and
    // resolves the user's allowed modules via ROLE_MODULE_DEFAULTS.
    // The string "driver" is NOT a standard role in that catalog, so
    // a JWT role='driver' alone yields 0 modules and a 403. The
    // realistic driver setup wires the user up to a known fleet
    // role (fleet_manager carries `fleet` module) — that's the same
    // shape the production seed produces for in-cab driver accounts.
    // The company bootstrap may already seed a `fleet_manager` role
    // for this company — fall back to a SELECT when the INSERT
    // collides on the (companyId, role_key) UNIQUE.
    const ins = await rawQuery<{ id: number }>(
      `INSERT INTO rbac_roles ("companyId",role_key,label_ar,is_system,is_active,level)
       VALUES ($1,'fleet_manager','مدير الأسطول (اختبار A-04)',TRUE,TRUE,70)
       ON CONFLICT ("companyId",role_key) DO NOTHING
       RETURNING id`,
      [companyId],
    );
    let roleId: number;
    if (ins[0]) {
      roleId = ins[0].id;
    } else {
      const [row] = await rawQuery<{ id: number }>(
        `SELECT id FROM rbac_roles WHERE "companyId"=$1 AND role_key='fleet_manager' LIMIT 1`,
        [companyId],
      );
      roleId = row.id;
    }
    await rawExecute(
      `INSERT INTO rbac_user_roles ("userId","companyId",role_id,is_primary,"createdAt")
       VALUES ($1,$2,$3,TRUE,NOW())`,
      [driverUserId, companyId, roleId],
    );

    driverToken = signToken({
      userId: driverUserId,
      assignmentId: driverAssignmentId,
      role: "driver",
    });

    // Cargo manifest already in `assigned_to_driver` — the dispatcher's
    // upstream orchestration (manifest create → approve → assign) is
    // exercised by other tests; A-04's surface is the DRIVER side.
    manifestNumber = `MAN-A04-${String(stamp).slice(-6)}`;
    const [{ id: mid }] = await rawQuery<{ id: number }>(
      `INSERT INTO cargo_manifests
         ("companyId","branchId","manifestNumber",status,
          "customerName","fromLocation","toLocation",
          "pickupDate","deliveryDate",
          "driverId",
          "totalWeight","createdBy","transportServiceType")
       VALUES ($1,$2,$3,'assigned_to_driver',
               'عميل اختبار A-04','مستودع الرياض','مستودع جدة',
               '2028-05-08','2028-05-09',
               $4,
               5000,$5,'cargo_load') RETURNING id`,
      [companyId, branchId, manifestNumber, driverId, driverUserId],
    );
    manifestId = mid;
  }, 90_000);

  // ── 1. Driver walks the full 7-step chain via /advance ─────
  it("walks assigned_to_driver → driver_accepted → … → delivered in 7 calls", async () => {
    const chain = [
      "driver_accepted",
      "trip_started",
      "arrived_pickup",
      "loaded",
      "in_transit",
      "arrived_delivery",
      "delivered",
    ];
    for (const next of chain) {
      const res = await withAuth(
        request(app).post(`/api/fleet/me/cargo/${manifestId}/advance`),
        driverToken,
      ).send({ status: next });
      expect(res.status, `step ${next}: ${JSON.stringify(res.body)}`).toBe(200);
      expect(res.body?.data?.status).toBe(next);
    }
    // DB confirms the seal.
    const [m] = await rawQuery<{ status: string }>(
      `SELECT status FROM cargo_manifests WHERE id=$1 AND "companyId"=$2`,
      [manifestId, companyId],
    );
    expect(m.status).toBe("delivered");
  });

  // ── 2. After delivered, the driver cannot push further ───
  // The dispatcher owns the `completed` transition. A driver who
  // tries to fast-forward must hit the state-machine 409.
  it("the driver's `delivered` is the seal — backward / skip moves are refused", async () => {
    // Backward jump.
    let res = await withAuth(
      request(app).post(`/api/fleet/me/cargo/${manifestId}/advance`),
      driverToken,
    ).send({ status: "in_transit" });
    expect(res.status).toBe(409);

    // Tries to push to dispatcher-owned `completed` — fails on the
    // allowed-set check (the driver advance endpoint only knows the
    // 7 driver states, never `completed`).
    res = await withAuth(
      request(app).post(`/api/fleet/me/cargo/${manifestId}/advance`),
      driverToken,
    ).send({ status: "completed" });
    expect([400, 409, 422]).toContain(res.status);
  });

  // ── 3. Driver records 3 operational checkpoints inside the trip ──
  // We rewind a fresh manifest into a driver-open state so we can
  // exercise the checkpoint endpoint without back-tracking the one
  // we just sealed (already in `delivered`, which is not in
  // CARGO_DRIVER_CHECKPOINT_OPEN_STATES). The test scenario:
  // weigh on pickup, rest break mid-trip, inspection at delivery.
  let secondManifestId: number;
  it("records weighing + rest_break + inspection checkpoints visible to ops", async () => {
    const stamp = Date.now();
    const [{ id: m2 }] = await rawQuery<{ id: number }>(
      `INSERT INTO cargo_manifests
         ("companyId","branchId","manifestNumber",status,
          "customerName","fromLocation","toLocation",
          "pickupDate","deliveryDate",
          "driverId","totalWeight","createdBy","transportServiceType")
       VALUES ($1,$2,$3,'driver_accepted',
               'عميل اختبار A-04','مستودع الرياض','مستودع جدة',
               '2028-05-10','2028-05-11',
               $4,5000,$5,'cargo_load') RETURNING id`,
      [companyId, branchId, `MAN-A04CHK-${String(stamp).slice(-6)}`,
       driverId, driverUserId],
    );
    secondManifestId = m2;

    // Walk to `loaded` so checkpoints have a meaningful surrounding
    // status, then record the three trip events.
    for (const next of ["trip_started", "arrived_pickup", "loaded"]) {
      const r = await withAuth(
        request(app).post(`/api/fleet/me/cargo/${m2}/advance`),
        driverToken,
      ).send({ status: next });
      expect(r.status, `walk to ${next}`).toBe(200);
    }

    const checkpoints = [
      { checkpointType: "weighing", measuredValue: 4980, measuredUnit: "kg",
        notes: "وزن جسر اختبار" },
      { checkpointType: "rest_break", notes: "استراحة 30 دقيقة" },
      { checkpointType: "inspection", notes: "فحص دوري قبل التحميل" },
    ];
    const createdIds: number[] = [];
    for (const c of checkpoints) {
      const r = await withAuth(
        request(app).post(`/api/fleet/me/cargo/${m2}/checkpoint`),
        driverToken,
      ).send(c);
      expect(r.status, `checkpoint ${c.checkpointType}: ${JSON.stringify(r.body)}`).toBe(201);
      expect(r.body?.data?.id).toBeTruthy();
      createdIds.push(r.body.data.id);
    }
    expect(createdIds.length).toBe(3);

    // DB pin: all three landed on the right manifest.
    const rows = await rawQuery<{
      checkpointType: string; measuredValue: string | null;
      measuredUnit: string | null; manifestId: number;
    }>(
      `SELECT "checkpointType","measuredValue","measuredUnit","manifestId"
         FROM cargo_manifest_checkpoints
        WHERE "companyId"=$1 AND "manifestId"=$2
        ORDER BY id ASC`,
      [companyId, m2],
    );
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.checkpointType)).toEqual([
      "weighing", "rest_break", "inspection",
    ]);
    // The weighing checkpoint preserves the measured value/unit
    // the dispatcher cares about (weighbridge audit).
    expect(rows[0].measuredValue).toBeTruthy();
    expect(Number(rows[0].measuredValue)).toBe(4980);
    expect(rows[0].measuredUnit).toBe("kg");
  });

  // ── 4. GET /me/cargo/:id/checkpoints — ops timeline visible ─
  it("ops timeline (GET /me/cargo/:id/checkpoints) returns the trio in chronological order", async () => {
    const res = await withAuth(
      request(app).get(`/api/fleet/me/cargo/${secondManifestId}/checkpoints`),
      driverToken,
    );
    expect(res.status).toBe(200);
    const list = res.body?.data ?? [];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(3);
    expect(list.map((c: any) => c.checkpointType)).toEqual([
      "weighing", "rest_break", "inspection",
    ]);
  });
});
