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
  let driverDispatchId = 0;
  let handoverDispatchId = 0;
  let ownerDriverId = 0;
  let driverHeavyId = 0;
  let driverPrivateId = 0;

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
    return { companyId, branchId, eid, token };
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

    // ── سطح السائق: حجز قابل للتنفيذ + مركبة + سائق (= موظف المالك) + أمر توزيع
    //    مُسنَد له، حتى يتطابق scope.employeeId مع fleet_drivers.employeeId. ──
    const drvRes = await withAuth(request(app).post("/api/transport/bookings"), tokenA).send({
      bookingNumber: `BK-TE-DRV-${stamp}`,
      bookingSource: "manual_entry",
      transportServiceType: "cargo_load",
      fromLocationText: "أ", toLocationText: "ب", cargoDescription: "حمولة سائق",
    });
    expect(drvRes.status, JSON.stringify(drvRes.body)).toBe(201);
    const driverBookingId = drvRes.body.data.id;
    await rawExecute(
      `UPDATE transport_bookings SET status='scheduled' WHERE id=$1 AND "companyId"=$2`,
      [driverBookingId, a.companyId],
    );
    const [line] = await rawQuery<{ id: number }>(
      `SELECT id FROM transport_booking_lines
        WHERE "bookingId"=$1 AND "companyId"=$2 ORDER BY id ASC LIMIT 1`,
      [driverBookingId, a.companyId],
    );
    const [veh] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_vehicles ("companyId","branchId","plateNumber")
       VALUES ($1,$2,$3) RETURNING id`,
      [a.companyId, a.branchId, `TE-${stamp}`.slice(0, 20)],
    );
    const [drv] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_drivers ("companyId","branchId","employeeId",name)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [a.companyId, a.branchId, a.eid, "TripEvents Driver A"],
    );
    const [disp] = await rawQuery<{ id: number }>(
      `INSERT INTO transport_dispatch_orders
         ("companyId","branchId","bookingId","bookingLineId","vehicleId","driverId",
          "scheduledStartAt","scheduledEndAt",status)
       VALUES ($1,$2,$3,$4,$5,$6, NOW(), NOW() + INTERVAL '2 hours', 'accepted') RETURNING id`,
      [a.companyId, a.branchId, driverBookingId, line.id, veh.id, drv.id],
    );
    driverDispatchId = disp.id;
    ownerDriverId = drv.id;

    // ── شريحة 3 (العهدة): حجز + مركبة تتطلب رخصة heavy + أمر توزيع للمالك-السائق،
    //    وسائقان مستلِمان: مؤهّل (heavy) وغير مؤهّل (private). ──
    const hoRes = await withAuth(request(app).post("/api/transport/bookings"), tokenA).send({
      bookingNumber: `BK-TE-HO-${stamp}`, bookingSource: "manual_entry",
      transportServiceType: "cargo_load", fromLocationText: "أ", toLocationText: "ب",
    });
    expect(hoRes.status, JSON.stringify(hoRes.body)).toBe(201);
    const hoBookingId = hoRes.body.data.id;
    await rawExecute(
      `UPDATE transport_bookings SET status='scheduled' WHERE id=$1 AND "companyId"=$2`,
      [hoBookingId, a.companyId],
    );
    const [hoLine] = await rawQuery<{ id: number }>(
      `SELECT id FROM transport_booking_lines
        WHERE "bookingId"=$1 AND "companyId"=$2 ORDER BY id ASC LIMIT 1`,
      [hoBookingId, a.companyId],
    );
    const [hoVeh] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_vehicles ("companyId","branchId","plateNumber","requiredLicenseClass")
       VALUES ($1,$2,$3,'heavy') RETURNING id`,
      [a.companyId, a.branchId, `HO-${stamp}`.slice(0, 20)],
    );
    const [hoDisp] = await rawQuery<{ id: number }>(
      `INSERT INTO transport_dispatch_orders
         ("companyId","branchId","bookingId","bookingLineId","vehicleId","driverId",
          "scheduledStartAt","scheduledEndAt",status)
       VALUES ($1,$2,$3,$4,$5,$6, NOW(), NOW() + INTERVAL '2 hours', 'accepted') RETURNING id`,
      [a.companyId, a.branchId, hoBookingId, hoLine.id, hoVeh.id, drv.id],
    );
    handoverDispatchId = hoDisp.id;
    const [dh] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_drivers ("companyId","branchId",name,"licenseClass")
       VALUES ($1,$2,'Heavy Driver','heavy') RETURNING id`,
      [a.companyId, a.branchId],
    );
    driverHeavyId = dh.id;
    const [dp] = await rawQuery<{ id: number }>(
      `INSERT INTO fleet_drivers ("companyId","branchId",name,"licenseClass")
       VALUES ($1,$2,'Private Driver','private') RETURNING id`,
      [a.companyId, a.branchId],
    );
    driverPrivateId = dp.id;

    // شريحة 4 — معدّل خصم نقص الوزن (0.5 ريال/كغم) على مستوى الشركة، لاختبار
    // اشتقاق المبلغ من المعدّل. (معدّل التأخّر غير مُعدّ عمدًا → بلا مبلغ = 400.)
    await rawExecute(
      `INSERT INTO settings (scope, "scopeId", key, value)
       VALUES ('company', $1, 'fleet.deduction.shortageRatePerKg', '0.5'::jsonb)`,
      [a.companyId],
    );
  }, 90_000);

  it("واقعة «تحميل» تُسجّل (مع وزن فارغ) وتنقل الحجز إلى in_progress", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/events`), tokenA,
    ).send({ eventType: "load", weightKg: 8000, weightKind: "tare", notes: "تم التحميل" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body?.data?.derivedStatus).toBe("in_progress");

    const [ev] = await rawQuery<{ eventType: string; weightKind: string | null }>(
      `SELECT "eventType","weightKind" FROM fleet_trip_events WHERE "bookingId"=$1`,
      [bookingId],
    );
    expect(ev.eventType).toBe("load");
    expect(ev.weightKind).toBe("tare"); // شريحة 2
    const [bk] = await rawQuery<{ status: string }>(
      `SELECT status FROM transport_bookings WHERE id=$1`, [bookingId]);
    expect(bk.status).toBe("in_progress");
  });

  it("شريحة 2 — واقعة «خروج» بوزن محمّل تُخزّن weightKind=gross", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/events`), tokenA,
    ).send({ eventType: "depart", weightKg: 20000, weightKind: "gross" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [row] = await rawQuery<{ weightKind: string | null; weightKg: string }>(
      `SELECT "weightKind","weightKg" FROM fleet_trip_events
        WHERE "bookingId"=$1 AND "eventType"='depart'`,
      [bookingId],
    );
    expect(row.weightKind).toBe("gross");
    expect(Number(row.weightKg)).toBe(20000);
    // الصافي (20000 − 8000 = 12000) يُشتقّ في الواجهة عبر summarizeTripWeights.
  });

  it("شريحة 2 — نوع الوزن بلا قيمة وزن → 400", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/events`), tokenA,
    ).send({ eventType: "arrive", weightKind: "gross" });
    expect(res.status).toBe(400);
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

  it("GET الوقائع يُرجع الوقائع مرتّبة زمنيًا", async () => {
    const res = await withAuth(
      request(app).get(`/api/transport/bookings/${bookingId}/events`), tokenA);
    expect(res.status).toBe(200);
    const types = (res.body?.data ?? []).map((e: any) => e.eventType);
    expect(types).toEqual(["load", "depart", "unload"]);
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

  it("سطح السائق — السائق المُسنَد يسجّل واقعة على أمر توزيعه (201) ويربطها به", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/dispatch-orders/${driverDispatchId}/trip-event`), tokenA,
    ).send({ eventType: "load", weightKg: 9000, weightKind: "tare" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body?.data?.derivedStatus).toBe("in_progress");
    const [ev] = await rawQuery<{ dispatchOrderId: number; weightKind: string | null }>(
      `SELECT "dispatchOrderId","weightKind" FROM fleet_trip_events
        WHERE "dispatchOrderId"=$1 ORDER BY id DESC LIMIT 1`,
      [driverDispatchId],
    );
    expect(ev.dispatchOrderId).toBe(driverDispatchId);
    expect(ev.weightKind).toBe("tare");
  });

  it("سطح السائق — عزل: شركة أخرى لا تسجّل على أمر توزيع ليس لها (404)", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/dispatch-orders/${driverDispatchId}/trip-event`), tokenB,
    ).send({ eventType: "arrive" });
    expect(res.status).toBe(404);
  });

  it("سطح السائق — أمر توزيع غير موجود → 404", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/dispatch-orders/999999999/trip-event`), tokenA,
    ).send({ eventType: "arrive" });
    expect(res.status).toBe(404);
  });

  // ── شريحة 3 — العهدة (الترتيب مهم: العهدة الناجحة تُعيد الإسناد فتُنهي الملكية) ──
  it("شريحة 3 — مرشّحو العهدة يستبعدون السائق الحالي", async () => {
    const res = await withAuth(
      request(app).get(`/api/transport/dispatch-orders/${handoverDispatchId}/handover-candidates`), tokenA);
    expect(res.status).toBe(200);
    const ids = (res.body?.data ?? []).map((c: any) => c.id);
    expect(ids).toContain(driverHeavyId);
    expect(ids).not.toContain(ownerDriverId);
  });

  it("شريحة 3 — تسليم لنفس السائق → 400", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/dispatch-orders/${handoverDispatchId}/handover`), tokenA,
    ).send({ incomingDriverId: ownerDriverId, proofObjectPaths: ["/objects/ho-proof"] });
    expect(res.status).toBe(400);
  });

  it("شريحة 3 — عزل: شركة أخرى لا تسلّم عهدة ليست لها → 404", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/dispatch-orders/${handoverDispatchId}/handover`), tokenB,
    ).send({ incomingDriverId: driverHeavyId, proofObjectPaths: ["/objects/ho-proof"] });
    expect(res.status).toBe(404);
  });

  it("شريحة 3 — الأهلية إلزامية: مستلِم غير مؤهّل (private لمركبة heavy) → 400، بلا إعادة إسناد", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/dispatch-orders/${handoverDispatchId}/handover`), tokenA,
    ).send({ incomingDriverId: driverPrivateId, proofObjectPaths: ["/objects/ho-proof"] });
    expect(res.status).toBe(400);
    const [d] = await rawQuery<{ driverId: number }>(
      `SELECT "driverId" FROM transport_dispatch_orders WHERE id=$1`, [handoverDispatchId]);
    expect(d.driverId).toBe(ownerDriverId); // لم يُعَد الإسناد
  });

  it("شريحة 3 — العهدة لمؤهّل: 201 + تُعيد الإسناد + تُسجّل واقعة handover", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/dispatch-orders/${handoverDispatchId}/handover`), tokenA,
    ).send({ incomingDriverId: driverHeavyId, proofObjectPaths: ["/objects/ho-proof-1"], notes: "تسليم عهدة" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body?.data?.reassignedTo).toBe(driverHeavyId);
    const [d] = await rawQuery<{ driverId: number }>(
      `SELECT "driverId" FROM transport_dispatch_orders WHERE id=$1`, [handoverDispatchId]);
    expect(d.driverId).toBe(driverHeavyId); // أُعيد الإسناد ذرّيًا
    const [ev] = await rawQuery<{ eventType: string; handoverToDriverId: number | null }>(
      `SELECT "eventType","handoverToDriverId" FROM fleet_trip_events
        WHERE "dispatchOrderId"=$1 AND "eventType"='handover' ORDER BY id DESC LIMIT 1`,
      [handoverDispatchId]);
    expect(ev.eventType).toBe("handover");
    expect(ev.handoverToDriverId).toBe(driverHeavyId);
  });

  // ── شريحة 4 — مرشّح خصم النقص/التأخير (تشغيلي؛ لا قيد من النقل) ──
  it("شريحة 4 — تسجيل مرشّح خصم نقص وزن → 201 ويظهر في القائمة", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/deductions`), tokenA,
    ).send({ basis: "weight_shortage", shortageKg: 500, amount: 250, reason: "نقص 500 كغم" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const [row] = await rawQuery<{ basis: string; amount: string; status: string }>(
      `SELECT basis, amount, status FROM transport_deduction_candidates WHERE "bookingId"=$1 ORDER BY id DESC LIMIT 1`,
      [bookingId]);
    expect(row.basis).toBe("weight_shortage");
    expect(Number(row.amount)).toBe(250);
    expect(row.status).toBe("pending");
    const list = await withAuth(
      request(app).get(`/api/transport/bookings/${bookingId}/deductions`), tokenA);
    expect(list.status).toBe(200);
    expect((list.body?.data ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it("شريحة 4 — أساس نقص الوزن بلا قياس → 400", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/deductions`), tokenA,
    ).send({ basis: "weight_shortage", amount: 100, reason: "بلا قياس" });
    expect(res.status).toBe(400);
  });

  it("شريحة 4 — عزل: شركة أخرى لا تسجّل خصمًا على حجز ليس لها → 404", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/deductions`), tokenB,
    ).send({ basis: "delay", delayHours: 3, amount: 90, reason: "تأخّر" });
    expect(res.status).toBe(404);
  });

  it("شريحة 4 — المبلغ يُحسب من المعدّل عند غيابه (500 كغم × 0.5 = 250)", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/deductions`), tokenA,
    ).send({ basis: "weight_shortage", shortageKg: 500, reason: "بلا مبلغ — يُحسب" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body?.data?.amount).toBe(250);
  });

  it("شريحة 4 — أساس بلا مبلغ ولا معدّل مُعدّ (تأخّر) → 400", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/bookings/${bookingId}/deductions`), tokenA,
    ).send({ basis: "delay", delayHours: 4, reason: "بلا معدّل" });
    expect(res.status).toBe(400);
  });

  it("شريحة 4 — السائق يُبلّغ عن خصم (المبلغ من المعدّل) → 201", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/dispatch-orders/${driverDispatchId}/deduction`), tokenA,
    ).send({ basis: "weight_shortage", shortageKg: 200, reason: "نقص ميداني" });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body?.data?.amount).toBe(100); // 200 × 0.5
  });

  it("شريحة 4 — السائق: عزل شركة أخرى → 404", async () => {
    const res = await withAuth(
      request(app).post(`/api/transport/dispatch-orders/${driverDispatchId}/deduction`), tokenB,
    ).send({ basis: "weight_shortage", shortageKg: 100, reason: "x" });
    expect(res.status).toBe(404);
  });
});
