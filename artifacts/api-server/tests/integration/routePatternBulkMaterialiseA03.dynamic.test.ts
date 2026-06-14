// #2079 Wave 3 — A-03 live E2E: weekly cargo template + 4-week
// materialise-range.
//
// Acceptance criteria (docs/transport-audit/17_معايير_القبول.md, A-03):
//   • Create a weekly cargo route_pattern.
//   • Fire materialise-range for a 4-week window.
//   • N independent draft transport_bookings appear (one per matching
//     day), each with bookingSource='recurring_schedule' and
//     routePatternId back-link.
//   • Re-firing the SAME window creates ZERO duplicates — the
//     `(companyId, bookingNumber)` UNIQUE key + the engine's
//     ON CONFLICT DO NOTHING make the operation idempotent.
//
// This is the gate that proves recurring schedules are reproducible
// (cron OR ops dispatcher can re-trigger without fear of double
// bookings).
//
// Activation gate same as A-01/A-02 — SKIPS unless DATABASE_URL
// carries a test marker AND JWT_SECRET ≥ 32 chars.

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const CSRF_TOKEN = "a03-test-csrf-token-double-submit-pair";
function withAuth(req: any, token: string) {
  return req
    .set("Authorization", `Bearer ${token}`)
    .set("Cookie", `erp_csrf=${CSRF_TOKEN}`)
    .set("x-csrf-token", CSRF_TOKEN);
}

d("#2079 A-03 — weekly cargo template + 4-week materialise-range (live)", () => {
  let app: any;
  let request: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let signToken: typeof import("../../src/lib/auth.js").signToken;

  let companyId: number;
  let branchId: number;
  let ownerToken: string;
  let patternId: number;
  let patternCode: string;

  // 4-week window starting on a Sunday (so day-of-week math is
  // unambiguous). The pattern's daysOfWeekMask=2 (bit 1 = Monday)
  // means exactly 4 matching dates inside this 28-day range.
  const WINDOW_FROM = "2028-05-07"; // Sunday
  const WINDOW_TO = "2028-06-03";   // 28 days later (inclusive)

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
      [`A-03 Pattern Co ${stamp}`],
    );
    companyId = cid;
    await bootstrapCompany(companyId, "A-03 Pattern Co");
    const [{ id: bid }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`,
      [companyId],
    );
    branchId = bid;

    await rawExecute(
      `INSERT INTO financial_periods ("companyId", name, "startDate", "endDate", status)
       VALUES ($1, 'A-03 period', '2020-01-01', '2099-12-31', 'open')`,
      [companyId],
    );

    // Owner + JWT.
    const hash = await hashPassword("test-password-1234");
    const [{ id: eid }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees ("companyId","branchId",name,status,"createdAt")
       VALUES ($1,$2,'A-03 Owner','active',NOW()) RETURNING id`,
      [companyId, branchId],
    );
    const [{ id: uid }] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive","createdAt")
       VALUES ($1,$2,$3,TRUE,NOW()) RETURNING id`,
      [eid, `a03-owner-${stamp}@local.test`, hash],
    );
    const [{ id: aid }] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle","role",status,"hireDate","createdAt")
       VALUES ($1,$2,$3,'Owner','owner','active',CURRENT_DATE,NOW()) RETURNING id`,
      [eid, companyId, branchId],
    );
    ownerToken = signToken({ userId: uid, assignmentId: aid, role: "owner" });

    // Weekly cargo pattern — Mondays only (bit 1 = 2).
    patternCode = `WK-MON-${String(stamp).slice(-6)}`;
    const [{ id: pid }] = await rawQuery<{ id: number }>(
      `INSERT INTO transport_route_patterns
         ("companyId","branchId","patternCode",name,
          "daysOfWeekMask","departureTime","activeFrom","activeUntil",
          "fromLocationText","toLocationText",
          "fromLocationKind","toLocationKind",
          "defaultCargoWeight","defaultCargoUnit",
          status,"createdBy")
       VALUES ($1,$2,$3,'مسار الإثنين الأسبوعي',
               2,'07:30',$4,$5,
               'مستودع الرياض','مستودع جدة',
               'warehouse','warehouse',
               5000,'kg',
               'active',$6) RETURNING id`,
      [companyId, branchId, patternCode, WINDOW_FROM, WINDOW_TO, uid],
    );
    patternId = pid;
  }, 90_000);

  // ── 1. First fire produces 4 distinct bookings ──────────────
  it("first materialise-range over a 28-day window emits 4 cargo bookings, 0 skipped", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/route-patterns/${patternId}/materialise-range`),
      ownerToken,
    ).send({ fromDate: WINDOW_FROM, toDate: WINDOW_TO });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const body = res.body?.data ?? {};
    expect(body.patternId).toBe(patternId);
    expect(body.patternCode).toBe(patternCode);
    expect(body.totalCreated).toBe(4);
    expect(body.totalSkipped).toBe(0);
    expect(Array.isArray(body.created)).toBe(true);
    expect(body.created.length).toBe(4);

    // Each created entry must carry a deterministic booking number
    // following the documented `RP-{patternCode}-{YYYYMMDD}` shape.
    for (const c of body.created) {
      expect(c.bookingNumber).toMatch(
        new RegExp(`^RP-${patternCode}-\\d{8}$`),
      );
    }

    // The four matching dates inside [2028-05-07, 2028-06-03] are
    // Mondays — verify each picked date IS a Monday (UTC day = 1).
    const dates: string[] = body.created.map((c: any) => c.date);
    expect(dates.length).toBe(4);
    for (const date of dates) {
      const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
      expect(dow, `date ${date} is not a Monday`).toBe(1);
    }
  });

  // ── 2. DB rows are draft + recurring_schedule + back-link ───
  it("each materialised booking is draft, sourced from recurring_schedule, and back-links to the pattern", async () => {
    const rows = await rawQuery<{
      bookingNumber: string;
      bookingSource: string;
      status: string;
      routePatternId: number | null;
      tripFamily: string | null;
      transportServiceType: string;
    }>(
      `SELECT "bookingNumber","bookingSource",status,"routePatternId",
              "tripFamily","transportServiceType"
         FROM transport_bookings
        WHERE "companyId"=$1 AND "routePatternId"=$2 AND "deletedAt" IS NULL
        ORDER BY "bookingNumber" ASC`,
      [companyId, patternId],
    );
    expect(rows.length).toBe(4);
    for (const r of rows) {
      expect(r.bookingNumber).toMatch(
        new RegExp(`^RP-${patternCode}-\\d{8}$`),
      );
      expect(r.bookingSource).toBe("recurring_schedule");
      expect(r.status).toBe("draft");
      expect(r.routePatternId).toBe(patternId);
      // The pattern handler emits cargo_load + cargo family.
      expect(r.transportServiceType).toBe("cargo_load");
      expect(r.tripFamily).toBe("cargo");
    }
  });

  // ── 3. Re-firing the same window creates ZERO duplicates ────
  it("re-firing the SAME window emits 0 created + 4 skipped (idempotent on bookingNumber UNIQUE)", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/route-patterns/${patternId}/materialise-range`),
      ownerToken,
    ).send({ fromDate: WINDOW_FROM, toDate: WINDOW_TO });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const body = res.body?.data ?? {};
    expect(body.totalCreated).toBe(0);
    expect(body.totalSkipped).toBe(4);
    for (const s of body.skipped) {
      expect(s.reason).toBe("exists");
    }

    // Hard pin: the total bookings count in the DB is still 4.
    const [{ count }] = await rawQuery<{ count: string }>(
      `SELECT COUNT(*) AS count
         FROM transport_bookings
        WHERE "companyId"=$1 AND "routePatternId"=$2 AND "deletedAt" IS NULL`,
      [companyId, patternId],
    );
    expect(Number(count)).toBe(4);
  });

  // ── 4. A separate fire on a NON-overlapping later window adds  ─
  // The cap is 90 days per fire and the loop honors activeUntil.
  // Firing the next 7 days AFTER our window's activeUntil should
  // emit 0 (the pattern is no longer active in that range). This
  // proves the activeFrom/activeUntil gates are respected, not just
  // the calendar window.
  it("activeFrom/activeUntil gate honored — firing outside the active window emits 0", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/route-patterns/${patternId}/materialise-range`),
      ownerToken,
    ).send({ fromDate: "2028-07-01", toDate: "2028-07-31" });

    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const body = res.body?.data ?? {};
    expect(body.totalCreated).toBe(0);
    expect(body.totalSkipped).toBe(0);
  });

  // ── 5. List endpoint surfaces the pattern + the materialised count ─
  it("GET pattern detail surfaces the materialised count back to the dispatcher", async () => {
    const res = await withAuth(
      request(app).get(`/api/transport/route-patterns/${patternId}`),
      ownerToken,
    );
    expect(res.status).toBe(200);
    expect(res.body?.data?.id).toBe(patternId);
    // Server's GET attaches `materialisedBookingsCount` so the
    // dispatcher sees how many active bookings exist from this
    // template — same number our DB count produced.
    expect(res.body.data.materialisedBookingsCount).toBe(4);
  });
});
