// شريحة 1 — وقائع الرحلة (الكيان يقود التجربة): اختبار سلوكي حيّ.
//
// يثبت أنّ تسجيل واقعة على حجز نقل:
//   • يُنشئ صفًّا في fleet_trip_events ويشتقّ حالة الحجز للأمام
//     (أول واقعة تنفيذ → in_progress، وواقعة إغلاق + إثبات → completed).
//   • يرفض واقعة الإغلاق (تفريغ/تسليم) بلا إثبات POD.
//   • يرفض التسجيل على حجز غير قابل للتنفيذ (مسودة).
//   • يرفض أمر توزيع لا يخصّ الحجز.
//   • معزول إيجاريًا: شركة أخرى لا ترى/تسجّل وقائع حجز ليس لها (404).
//
// عملياتي بحت — لا مساس بالدفتر.
//
// بوابة التفعيل (كبقية *.dynamic): يتخطّى (لا يفشل) ما لم يكن DATABASE_URL
// على قاعدة اختبار مؤقتة مع JWT_SECRET بطول ≥ 32. محليًا:
//
//   pnpm db:provision-agent
//   export DATABASE_URL=postgres://ghayth_erp:ghayth_erp@127.0.0.1:54329/ghayth_erp
//   export JWT_SECRET=local-dev-secret-must-be-at-least-32-characters-long-test
//   pnpm --filter @workspace/api-server test \
//     tests/integration/transportTripEventsLifecycle.dynamic.test.ts

import { describe, it, expect, beforeAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const CSRF_TOKEN = "trip-events-test-csrf-token-double-submit-pair";
function withAuth(req: any, token: string) {
  return req
    .set("Authorization", `Bearer ${token}`)
    .set("Cookie", `erp_csrf=${CSRF_TOKEN}`)
    .set("x-csrf-token", CSRF_TOKEN);
}

d("شريحة 1 — دورة حياة وقائع الرحلة (قاعدة حيّة)", () => {
  let app: any;
  let request: any;
  let rawQuery: typeof import("../../src/lib/rawdb.js").rawQuery;
  let rawExecute: typeof import("../../src/lib/rawdb.js").rawExecute;
  let signToken: typeof import("../../src/lib/auth.js").signToken;
  let hashPassword: typeof import("../../src/lib/auth.js").hashPassword;

  let tokenA = "";
  let tokenB = "";
  let bookingId = 0;
  let draftBookingId = 0;

  // يهيّئ شركة معزولة مع مالك ويُعيد (companyId, branchId, token).
  async function bootstrapOwner(label: string, stamp: number) {
    const { bootstrapCompany } = await import("../../src/lib/companyBootstrap.js");
    const [{ id: companyId }] = await rawQuery<{ id: number }>(
      `INSERT INTO companies (name, status) VALUES ($1, 'active') RETURNING id`,
      [`${label} ${stamp}`],
    );
    await bootstrapCompany(companyId, label);
    const [{ id: branchId }] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id ASC LIMIT 1`,
      [companyId],
    );
    const hash = await hashPassword("test-password-1234");
    const [{ id: eid }] = await rawQuery<{ id: number }>(
      `INSERT INTO employees ("companyId","branchId",name,status,"createdAt")
       VALUES ($1,$2,$3,'active',NOW()) RETURNING id`,
      [companyId, branchId, `${label} Owner`],
    );
    const [{ id: uid }] = await rawQuery<{ id: number }>(
      `INSERT INTO users ("employeeId",email,"passwordHash","isActive","createdAt")
       VALUES ($1,$2,$3,TRUE,NOW()) RETURNING id`,
      [eid, `te-${label}-${stamp}@local.test`.toLowerCase().replace(/\s+/g, "-"), hash],
    );
    const [{ id: aid }] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments
         ("employeeId","companyId","branchId","jobTitle","role",status,"hireDate","createdAt")
       VALUES ($1,$2,$3,'Owner','owner','active',CURRENT_DATE,NOW()) RETURNING id`,
      [eid, companyId, branchId],
    );
    const token = signToken({ userId: uid, assignmentId: aid, role: "owner" });
    return { companyId, branchId, token };
  }

  beforeAll(async () => {
    request = (await import("supertest")).default;
    app = (await import("../../src/app.js")).default;
    const rawdb = await import("../../src/lib/rawdb.js");
    rawQuery = rawdb.rawQuery;
    rawExecute = rawdb.rawExecute;
    const auth = await import("../../src/lib/auth.js");
    signToken = auth.signToken;
    hashPassword = auth.hashPassword;

    const stamp = Date.now();
    const a = await bootstrapOwner("TripEvents Co A", stamp);
    const b = await bootstrapOwner("TripEvents Co B", stamp + 1);
    tokenA = a.token;
    tokenB = b.token;

    // حجز قابل للتنفيذ في شركة A.
    const res = await withAuth(request(app).post("/api/transport/bookings"), tokenA).send({
      bookingNumber: `BK-TE-${stamp}`,
      bookingSource: "manual_entry",
      transportServiceType: "cargo_load",
      fromLocationText: "المستودع - حي الصناعية",
      toLocationText: "موقع العميل - حي الملز",
      cargoDescription: "حمولة اختبار",
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    bookingId = res.body.data.id;
    await rawExecute(
      `UPDATE transport_bookings SET status='scheduled' WHERE id=$1 AND "companyId"=$2`,
      [bookingId, a.companyId],
    );

    // حجز مسودة (غير قابل للتنفيذ) في شركة A.
    const res2 = await withAuth(request(app).post("/api/transport/bookings"), tokenA).send({
      bookingNumber: `BK-TE-DRAFT-${stamp}`,
      bookingSource: "manual_entry",
      transportServiceType: "cargo_load",
      fromLocationText: "أ",
      toLocationText: "ب",
    });
    expect(res2.status, JSON.stringify(res2.body)).toBe(201);
    draftBookingId = res2.body.data.id;
  }, 90_000);

  it("واقعة «تحميل» تُسجّل وتنقل الحجز إلى in_progress", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/events`), tokenA,
    ).send({ eventType: "load", weightKg: 12000, notes: "تم التحميل" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body?.data?.derivedStatus).toBe("in_progress");

    const [ev] = await rawQuery<{ eventType: string; weightKg: string }>(
      `SELECT "eventType","weightKg" FROM fleet_trip_events WHERE "bookingId"=$1`,
      [bookingId],
    );
    expect(ev.eventType).toBe("load");
    const [bk] = await rawQuery<{ status: string }>(
      `SELECT status FROM transport_bookings WHERE id=$1`, [bookingId]);
    expect(bk.status).toBe("in_progress");
  });

  it("واقعة الإغلاق «تفريغ» بلا إثبات → 400", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/events`), tokenA,
    ).send({ eventType: "unload" });
    expect(res.status).toBe(400);
    const [bk] = await rawQuery<{ status: string }>(
      `SELECT status FROM transport_bookings WHERE id=$1`, [bookingId]);
    expect(bk.status).toBe("in_progress"); // الحالة لم تتغيّر
  });

  it("واقعة الإغلاق «تفريغ» مع إثبات → 201 وتنقل الحجز إلى completed", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/events`), tokenA,
    ).send({ eventType: "unload", proofObjectPaths: ["/objects/te-proof-unload-1"] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body?.data?.derivedStatus).toBe("completed");
    const [bk] = await rawQuery<{ status: string }>(
      `SELECT status FROM transport_bookings WHERE id=$1`, [bookingId]);
    expect(bk.status).toBe("completed");
  });

  it("GET الوقائع يُرجع الواقعتين مرتّبتين زمنيًا", async () => {
    const res = await withAuth(
      request(app).get(`/api/transport/bookings/${bookingId}/events`), tokenA);
    expect(res.status).toBe(200);
    const types = (res.body?.data ?? []).map((e: any) => e.eventType);
    expect(types).toEqual(["load", "unload"]);
  });

  it("عزل إيجاري: شركة أخرى لا تسجّل/ترى وقائع حجز ليس لها (404)", async () => {
    const post = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/events`), tokenB,
    ).send({ eventType: "arrive" });
    expect(post.status).toBe(404);
    const get = await withAuth(
      request(app).get(`/api/transport/bookings/${bookingId}/events`), tokenB);
    expect(get.status).toBe(404);
  });

  it("حجز مسودة غير قابل للتنفيذ → 400", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${draftBookingId}/events`), tokenA,
    ).send({ eventType: "load" });
    expect(res.status).toBe(400);
  });

  it("أمر توزيع لا يخصّ الحجز → 400", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${draftBookingId}/events`), tokenA,
    ).send({ eventType: "load", dispatchOrderId: 999_999_999 });
    expect(res.status).toBe(400);
  });
});
