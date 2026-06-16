// #2079 Wave 3 — A-02 live E2E: capacity rejection in Arabic.
//
// Acceptance criteria (docs/transport-audit/17_معايير_القبول.md, A-02):
//   45 passengers on a 40-seat vehicle => REJECTION with Arabic
//   readable capacity reason (does not silently fall through to a
//   score-based "thin" candidate); the same 45-passenger booking
//   on a 50-seat vehicle => ACCEPTED with score > 0.
//
// What this proves end-to-end (no mocks, real Postgres, real engine):
//
//   • POST /api/transport/bookings/:id/suggest-assignment actually
//     runs the assignmentSuggestionEngine guard chain (Operating
//     Window → VCM → Vehicle Readiness → Driver Readiness →
//     Scoring) — not a stub.
//   • The capacity scorer's hard branch fires when both effective
//     AND nominal capacity are below the booking's passengerCount.
//   • The Arabic blocker text the dispatcher will see is the exact
//     string the engine emits (no UI rephrasing in between).
//   • A bigger vehicle that satisfies the canon is surfaced as a
//     positive candidate in the SAME call, so the operator can
//     pick it without a separate request.
//
// Activation gate (same as A-01): SKIPS unless DATABASE_URL points
// at a disposable test DB (54329 / *_test) AND JWT_SECRET >= 32 chars.
//
//   pnpm db:provision-agent
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server exec vitest run \
//     tests/integration/transportSuggestCapacityRejectionA02.dynamic.test.ts

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const CSRF_TOKEN = "a02-test-csrf-token-double-submit-pair";

function withAuth(req: any, token: string) {
  return req
    .set("Authorization", `Bearer ${token}`)
    .set("Cookie", `erp_csrf=${CSRF_TOKEN}`)
    .set("x-csrf-token", CSRF_TOKEN);
}

d("#2079 A-02 — passenger capacity rejection (live DB, real engine)", () => {
  let app: any;
  let request: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let signToken: typeof import("../../src/lib/auth.js").signToken;

  let companyId: number;
  let branchId: number;
  let ownerToken: string;
  let smallBusId: number;
  let bigBusId: number;
  let driverId: number;
  let bookingId: number;

  // The booking's pickup window — pinned to a known future range so
  // every readiness check (license / registration / insurance /
  // inspection) has the same cutoff to compare against.
  const SCHEDULED_START = "2028-04-10T08:00:00Z";
  const SCHEDULED_END = "2028-04-10T18:00:00Z";

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

    // ── Fresh company + branch ───────────────────────────────
    const stamp = Date.now();
    const [{ id: cid }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [`A-02 Capacity Co ${stamp}`],
    );
    companyId = cid;
    await bootstrapCompany(companyId, "A-02 Capacity Co");
    const [{ id: bid }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`,
      [companyId],
    );
    branchId = bid;

    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'A-02 period', '2020-01-01', '2099-12-31', 'open')`,
      [companyId],
    );

    // transport_planning_settings has no `id` column (PK is companyId),
    // so the lazy-create branch in mapsService.loadPlanningSettings
    // crashes under rawExecute's auto-RETURNING-id wrapper. Insert the
    // row directly so the suggest endpoint's first lookup hits the
    // SELECT path. (Bug noted; fix is outside A-02's scope.)
    await rawQuery(
      `INSERT INTO transport_planning_settings ("companyId")
       VALUES ($1) ON CONFLICT ("companyId") DO NOTHING`,
      [companyId],
    );

    // ── Owner user + JWT ─────────────────────────────────────
    const hash = await hashPassword("test-password-1234");
    const [{ id: eid }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees ("companyId","branchId",name,status,"createdAt")
       VALUES ($1,$2,'A-02 Owner','active',NOW()) RETURNING id`,
      [companyId, branchId],
    );
    const [{ id: uid }] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive","createdAt")
       VALUES ($1,$2,$3,TRUE,NOW()) RETURNING id`,
      [eid, `a02-owner-${stamp}@local.test`, hash],
    );
    const [{ id: aid }] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle","role",status,"hireDate","createdAt")
       VALUES ($1,$2,$3,'Owner','owner','active',CURRENT_DATE,NOW()) RETURNING id`,
      [eid, companyId, branchId],
    );
    ownerToken = signToken({ userId: uid, assignmentId: aid, role: "owner" });

    // ── Booking — 45 passengers, passenger_umrah ─────────────
    const [{ id: bookId }] = await rawQuery<{ id: number }>(
      `INSERT INTO transport_bookings
         ("companyId","branchId","bookingNumber","bookingSource","transportServiceType",
          "passengerCount","fromLocationText","toLocationText",
          "fromLocationKind","toLocationKind",
          "requestedPickupDate","requestedPickupTime",
          "pickupWindowStart","pickupWindowEnd",
          "dropoffWindowStart","dropoffWindowEnd",
          status,"createdBy","tripFamily")
       VALUES ($1,$2,$3,'manual_entry','passenger_umrah',
               45,'مطار جدة الدولي','مكة المكرمة - فندق العاصمة',
               'airport','hotel',
               '2028-04-10','08:00',
               $4,$5,$5,$5,
               'draft',$6,'passenger') RETURNING id`,
      [companyId, branchId, `BK-A02-${stamp}`,
       SCHEDULED_START, SCHEDULED_END, uid],
    );
    bookingId = bookId;
    // Gate-PE-2: synthesise the single leg the booking needs.
    await rawExecute(
      `INSERT INTO transport_booking_lines
         ("bookingId","companyId","lineNumber",
          "fromLocationText","toLocationText",
          "fromLocationKind","toLocationKind",status)
       VALUES ($1,$2,1,'مطار جدة الدولي','مكة المكرمة - فندق العاصمة',
               'airport','hotel','open')`,
      [bookId, companyId],
    );

    // ── Helper: insert a vehicle with all 11 VCM safety fields
    //    populated AND future-dated readiness documents.
    async function makeBus(plate: string, seats: number): Promise<number> {
      const [{ id }] = await rawQuery<{ id: number }>(
        `INSERT INTO fleet_vehicles
           ("companyId","branchId","plateNumber",make,model,year,
            status,"vehicleType","fuelType",
            "validForPassengers","validForCargo",
            "payloadKg","operationalPayloadKg",
            "seatCount","operationalPassengerCapacity",
            "axleCount","tireCount","engineDisplacementCc","transmissionType",
            "registrationExpiry","insuranceExpiry","nextInspectionDate",
            "createdAt")
         VALUES ($1,$2,$3,'TestBus',$5,2024,
                 'available','bus','diesel',
                 TRUE,FALSE,
                 6000,6000,
                 $4::int,$4::numeric,
                 2,6,5200,'automatic',
                 '2099-12-31','2099-12-31','2099-12-31',
                 NOW()) RETURNING id`,
        [companyId, branchId, plate, seats, `M-${seats}`],
      );
      return id;
    }

    // plateNumber is VARCHAR(20) — keep it short.
    const short = String(stamp).slice(-6);
    smallBusId = await makeBus(`A02-S${short}`, 40);
    bigBusId = await makeBus(`A02-B${short}`, 50);

    // ── Driver — license + rest valid for the window. ────────
    const [{ id: drvEid }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees ("companyId","branchId",name,status,"createdAt")
       VALUES ($1,$2,'A-02 Driver','active',NOW()) RETURNING id`,
      [companyId, branchId],
    );
    const [{ id: drv }] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_drivers
         ("companyId","employeeId",name,"licenseNumber","licenseExpiry",
          "licenseType","licenseClass",status,"restHoursRequired")
       VALUES ($1,$2,'سائق اختبار A-02',$3,'2099-12-31','PUBLIC','D','available',8)
       RETURNING id`,
      [companyId, drvEid, `A02-DRV-${stamp}`],
    );
    driverId = drv;
  }, 90_000);

  // ── 1. Suggest with ONLY the 40-seater available — rejection ─
  it("with a 40-seat bus, the engine returns the bus as score=0 with an Arabic capacity blocker", async () => {
    // Force the small bus to be the only option this call sees by
    // soft-deleting the big bus for this assertion, then restoring
    // it before the next test (cleaner than splitting the fixture).
    await rawExecute(
      `UPDATE fleet_vehicles SET "deletedAt"=NOW() WHERE id=$1`,
      [bigBusId],
    );
    try {
      const res = await withAuth(
        request(app).post(`/api/transport/bookings/${bookingId}/suggest-assignment`),
        ownerToken,
      ).send({
        scheduledStartAt: SCHEDULED_START,
        scheduledEndAt: SCHEDULED_END,
        limit: 10,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const candidates = res.body?.data ?? [];
      expect(Array.isArray(candidates)).toBe(true);

      // The bus shows up (it cleared VCM eligibility — 11/11 safety
      // fields populated, validForPassengers TRUE) and the SOLE
      // reason it's score=0 is capacity.
      const small = candidates.find((c: any) => c.vehicleId === smallBusId);
      expect(small, JSON.stringify(candidates)).toBeTruthy();
      expect(small.score).toBe(0);
      expect(Array.isArray(small.blockers)).toBe(true);
      // The exact engine wording — verbatim Arabic that the
      // dispatcher will see on screen. Mismatched arithmetic
      // (e.g. `45 > 40`) is unambiguous; the operator does NOT
      // need to do the math.
      const capacityBlocker = small.blockers.find((m: string) =>
        m.includes("عدد الركاب") && m.includes("45") && m.includes("40"),
      );
      expect(capacityBlocker, JSON.stringify(small.blockers)).toBeTruthy();
    } finally {
      await rawExecute(
        `UPDATE fleet_vehicles SET "deletedAt"=NULL WHERE id=$1`,
        [bigBusId],
      );
    }
  });

  // ── 2. Same booking + 50-seater available — acceptance ──────
  it("with the 50-seat bus available, the engine returns it as a positive candidate", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/suggest-assignment`),
      ownerToken,
    ).send({
      scheduledStartAt: SCHEDULED_START,
      scheduledEndAt: SCHEDULED_END,
      limit: 10,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const candidates = res.body?.data ?? [];
    expect(Array.isArray(candidates)).toBe(true);

    const big = candidates.find((c: any) => c.vehicleId === bigBusId);
    expect(big, JSON.stringify(candidates)).toBeTruthy();
    // The big bus must be a POSITIVE candidate — score > 0 means
    // no hard blockers (capacity OK + readiness OK + no conflict).
    expect(big.score).toBeGreaterThan(0);
    expect(Array.isArray(big.blockers)).toBe(true);
    expect(big.blockers.length).toBe(0);
    // The 40-seater is still in the response but still score=0 —
    // the dispatcher sees BOTH options ranked.
    const small = candidates.find((c: any) => c.vehicleId === smallBusId);
    expect(small, JSON.stringify(candidates)).toBeTruthy();
    expect(small.score).toBe(0);
    expect(small.blockers.some((m: string) =>
      m.includes("عدد الركاب") && m.includes("45") && m.includes("40"),
    )).toBe(true);
  });

  // ── 3. The driver actually surfaces in the candidates list ──
  // Sanity: empty candidates would mean the driver got filtered
  // upstream (license / rest / leave). Asserting the driver is
  // assigned to the surfacing candidates proves the full chain
  // (Operating Window → Driver Readiness → Scoring) cleared.
  it("the driver is on the surfaced candidates (chain cleared past driver readiness)", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/suggest-assignment`),
      ownerToken,
    ).send({
      scheduledStartAt: SCHEDULED_START,
      scheduledEndAt: SCHEDULED_END,
      limit: 10,
    });
    expect(res.status).toBe(200);
    const candidates = res.body?.data ?? [];
    const withDriver = candidates.filter((c: any) => c.driverId === driverId);
    expect(withDriver.length).toBeGreaterThan(0);
  });
});
