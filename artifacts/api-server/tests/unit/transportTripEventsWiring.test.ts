import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * شريحة 1 — وقائع الرحلة (الكيان يقود التجربة / تسجيل واقعة).
 *
 * تحقّق ساكن (static) من سلامة التوصيل عبر الطبقات الثلاث:
 *   1. الهجرة 429 تنشئ fleet_trip_events بالأعمدة والقيود الصحيحة.
 *   2. مسار transport-bookings يعرض GET/POST /:id/events مع حُرّاسه
 *      (حالة قابلة للتنفيذ + إثبات POD للإغلاق + ملكية أمر التوزيع)،
 *      ويشتقّ حالة الحجز، ويكتب Audit، ويُدرج tripEvents في تفاصيل الحجز.
 *   3. صفحة تفاصيل الحجز تربط تجربة التسجيل (أزرار الوقائع + إعادة استخدام
 *      تدفّق الرفع + اشتراط الصورة للإغلاق).
 *
 * عملياتي بحت — لا مساس بالدفتر، فلا يلزم اختبار assertion على سطور القيد.
 */
const apiSrc = join(import.meta.dirname!, "../../src");
const repoRoot = join(import.meta.dirname!, "../../../..");
const spaSrc = join(repoRoot, "artifacts/ghayth-erp/src");
const read = (p: string) => readFileSync(p, "utf8");

const MIGRATION_PATH = join(apiSrc, "migrations/429_fleet_trip_events.sql");
const MIGRATION = read(MIGRATION_PATH);
const ROUTES = read(join(apiSrc, "routes/transport-bookings.ts"));
const DETAIL = read(join(spaSrc, "pages/fleet/transport-booking-detail.tsx"));

describe("شريحة 1 — هجرة fleet_trip_events", () => {
  it("الملف موجود ويلتزم نمط الهجرات (BEGIN/COMMIT + @rollback)", () => {
    expect(existsSync(MIGRATION_PATH)).toBe(true);
    expect(MIGRATION).toContain("BEGIN;");
    expect(MIGRATION).toContain("COMMIT;");
    expect(MIGRATION).toContain("@rollback");
    expect(MIGRATION).toContain("CREATE TABLE IF NOT EXISTS fleet_trip_events");
  });

  it("معزول إيجاريًا: companyId NOT NULL FK + branchId + bookingId FK", () => {
    expect(MIGRATION).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\)/);
    expect(MIGRATION).toMatch(/"branchId"\s+INTEGER/);
    expect(MIGRATION).toMatch(/"bookingId"\s+INTEGER NOT NULL REFERENCES transport_bookings\(id\)/);
    expect(MIGRATION).toMatch(/"dispatchOrderId"\s+INTEGER REFERENCES transport_dispatch_orders\(id\)/);
  });

  it("القاعدة الذهبية: العمود التشغيلي يحمل recordedByAssignmentId", () => {
    expect(MIGRATION).toContain('"recordedByAssignmentId"');
  });

  it("يقيّد أنواع الوقائع السبعة + لا يسمح بوزن سالب + سقف صور الإثبات", () => {
    for (const t of ["load", "depart", "arrive", "inspect", "unload", "handover", "deliver"]) {
      expect(MIGRATION, `eventType ${t} missing from CHECK`).toContain(`'${t}'`);
    }
    expect(MIGRATION).toMatch(/"weightKg"\s+IS NULL OR "weightKg" >= 0/);
    expect(MIGRATION).toContain('"proofObjectPaths"');
  });

  it("append-only: يدعم الإبطال الناعم (voidedAt) لا الحذف الصلب", () => {
    expect(MIGRATION).toContain('"voidedAt"');
    expect(MIGRATION).toContain('"voidedReason"');
  });
});

// يقتطع جسم معالج راوت بعينه للتأكيد الموضعي على حُرّاسه.
function routeBody(method: string, path: string): string {
  const re = new RegExp(
    `transportBookingsRouter\\.${method}\\(\\s*"${path.replace(/[/:]/g, (c) => "\\" + c)}"[\\s\\S]+?\\n\\);`,
  );
  const m = ROUTES.match(re);
  expect(m, `${method} ${path} not found`).toBeTruthy();
  return m![0];
}

describe("شريحة 1 — مسار وقائع الرحلة (الخادم)", () => {
  it("POST /transport/bookings/:id/events موجود ويُدرج في fleet_trip_events", () => {
    const body = routeBody("post", "/transport/bookings/:id/events");
    expect(body).toContain("INSERT INTO fleet_trip_events");
    expect(body).toContain('authorize({ feature: "fleet.bookings", action: "update" })');
  });

  it("يرفض التسجيل على حجز غير قابل للتنفيذ", () => {
    const body = routeBody("post", "/transport/bookings/:id/events");
    expect(body).toContain("TRIP_EVENT_EXECUTABLE_STATUSES");
    expect(body).toContain("لا يمكن تسجيل واقعة على حجز في هذه الحالة");
  });

  it("واقعة الإغلاق تتطلب إثبات POD", () => {
    const body = routeBody("post", "/transport/bookings/:id/events");
    expect(body).toContain("TRIP_EVENT_CLOSING_TYPES");
    expect(body).toContain("واقعة الإغلاق تتطلب صورة إثبات");
  });

  it("يتحقّق من ملكية أمر التوزيع لنفس الحجز/الشركة", () => {
    const body = routeBody("post", "/transport/bookings/:id/events");
    expect(body).toMatch(/transport_dispatch_orders\s*\n?\s*WHERE id = \$1 AND "bookingId" = \$2 AND "companyId" = \$3/);
  });

  it("يشتقّ حالة الحجز للأمام (in_progress / completed) ويكتب Audit", () => {
    const body = routeBody("post", "/transport/bookings/:id/events");
    expect(body).toContain('derivedStatus = "completed"');
    expect(body).toContain('derivedStatus = "in_progress"');
    expect(body).toContain("UPDATE transport_bookings SET status");
    expect(body).toContain('action: "trip_event_recorded"');
  });

  it("GET /transport/bookings/:id/events يعرض الوقائع غير المُبطَلة مفلترة بالشركة", () => {
    const body = routeBody("get", "/transport/bookings/:id/events");
    expect(body).toMatch(/FROM fleet_trip_events[\s\S]+"companyId" = \$2 AND "voidedAt" IS NULL/);
  });

  it("تفاصيل الحجز تُدرج tripEvents في الرد", () => {
    expect(ROUTES).toMatch(/FROM fleet_trip_events[\s\S]+?"voidedAt" IS NULL/);
    expect(ROUTES).toContain("dispatchOrders, tripEvents, sourceContext");
  });
});

describe("شريحة 1 — تجربة تسجيل الواقعة (الواجهة)", () => {
  it("تعرّف الوقائع الستة + تسمّيها عربيًا + تُعلّم الإغلاق", () => {
    expect(DETAIL).toContain("TRIP_EVENT_DEFS");
    for (const t of ["load", "depart", "arrive", "inspect", "unload", "deliver"]) {
      expect(DETAIL, `event ${t} missing`).toContain(`type: "${t}"`);
    }
    expect(DETAIL).toContain('TRIP_EVENT_CLOSING = new Set(["unload", "deliver"])');
  });

  it("تُسجّل الواقعة عبر POST /transport/bookings/:id/events", () => {
    expect(DETAIL).toMatch(/apiFetch\(`\/transport\/bookings\/\$\{id\}\/events`/);
    expect(DETAIL).toContain("eventType: activeEvent");
  });

  it("تعيد استخدام تدفّق الرفع القائم (request-url) للإثبات", () => {
    expect(DETAIL).toContain("/storage/uploads/request-url");
    expect(DETAIL).toContain("uploadEventPhoto");
  });

  it("تشترط صورة الإثبات قبل تسجيل واقعة الإغلاق", () => {
    expect(DETAIL).toContain("TRIP_EVENT_CLOSING.has(activeEvent)");
    expect(DETAIL).toContain("صورة الإثبات مطلوبة");
  });

  it("تُخفي أزرار التسجيل خارج حالات التنفيذ", () => {
    expect(DETAIL).toContain("TRIP_EVENT_EXECUTABLE.has(b.status)");
  });
});
