import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * وقائع الرحلة (الكيان يقود التجربة / تسجيل واقعة) — تحقّق ساكن للتوصيل:
 *   • شريحة 1: سجل fleet_trip_events + POD + اشتقاق الحالة.
 *   • شريحة 2: الوزن (weightKind) + اشتقاق الصافي.
 *   • تطبيق السائق: منطق مشترك (recordBookingTripEvent) يستدعيه سطحان
 *     (المشغّل + السائق) ومكوّن واجهة مشترك (TripEventRecorder) — لا تكرار.
 * عملياتي بحت — لا مساس بالدفتر، فلا يلزم assertion على سطور القيد.
 */
const apiSrc = join(import.meta.dirname!, "../../src");
const repoRoot = join(import.meta.dirname!, "../../../..");
const spaSrc = join(repoRoot, "artifacts/ghayth-erp/src");
const read = (p: string) => readFileSync(p, "utf8");

const MIGRATION_429_PATH = join(apiSrc, "migrations/429_fleet_trip_events.sql");
const MIGRATION_429 = read(MIGRATION_429_PATH);
const MIGRATION_430_PATH = join(apiSrc, "migrations/430_fleet_trip_events_weight_kind.sql");
const MIGRATION_430 = read(MIGRATION_430_PATH);
const MIGRATION_433_PATH = join(apiSrc, "migrations/433_fleet_trip_events_handover_driver.sql");
const MIGRATION_433 = read(MIGRATION_433_PATH);
const MIGRATION_434_PATH = join(apiSrc, "migrations/434_transport_deduction_candidates.sql");
const MIGRATION_434 = read(MIGRATION_434_PATH);
const HELPER = read(join(apiSrc, "lib/transport/tripEvents.ts"));
const DEDUCTIONS = read(join(apiSrc, "lib/transport/deductions.ts"));
const EVENT_CATALOG = read(join(apiSrc, "lib/eventCatalog.ts"));
const EVENT_LISTENERS = read(join(apiSrc, "lib/eventListeners.ts"));
const FINANCE_INVOICES = read(join(apiSrc, "routes/finance-invoices.ts"));
const BOOKINGS = read(join(apiSrc, "routes/transport-bookings.ts"));
const PLANNING = read(join(apiSrc, "routes/transport-planning.ts"));
const RECORDER = read(join(spaSrc, "components/shared/trip-event-recorder.tsx"));
const DETAIL = read(join(spaSrc, "pages/fleet/transport-booking-detail.tsx"));
const DRIVER = read(join(spaSrc, "pages/fleet/me-driver-navigation.tsx"));
const TRIP_WEIGHT = read(join(spaSrc, "lib/trip-weight.ts"));

describe("شريحة 1 — هجرة fleet_trip_events", () => {
  it("الملف موجود ويلتزم نمط الهجرات + ينشئ الجدول معزولًا إيجاريًا", () => {
    expect(existsSync(MIGRATION_429_PATH)).toBe(true);
    expect(MIGRATION_429).toContain("BEGIN;");
    expect(MIGRATION_429).toContain("@rollback");
    expect(MIGRATION_429).toContain("CREATE TABLE IF NOT EXISTS fleet_trip_events");
    expect(MIGRATION_429).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\)/);
    expect(MIGRATION_429).toMatch(/"bookingId"\s+INTEGER NOT NULL REFERENCES transport_bookings\(id\)/);
    expect(MIGRATION_429).toContain('"recordedByAssignmentId"'); // القاعدة الذهبية
    expect(MIGRATION_429).toContain('"voidedAt"'); // إبطال ناعم لا حذف
    for (const t of ["load", "depart", "arrive", "inspect", "unload", "handover", "deliver"]) {
      expect(MIGRATION_429, `eventType ${t} missing`).toContain(`'${t}'`);
    }
  });
});

describe("شريحة 2 — هجرة weightKind", () => {
  it("تضيف weightKind بقيد idempotent عبر حارس pg_constraint (بلا DROP CONSTRAINT)", () => {
    expect(existsSync(MIGRATION_430_PATH)).toBe(true);
    expect(MIGRATION_430).toContain("@rollback");
    expect(MIGRATION_430).toMatch(/ADD COLUMN IF NOT EXISTS "weightKind"/);
    expect(MIGRATION_430).toContain("FROM pg_constraint");
    expect(MIGRATION_430).toMatch(/ADD CONSTRAINT fleet_trip_events_weight_kind_check/);
    for (const k of ["tare", "gross", "axle", "other"]) {
      expect(MIGRATION_430, `weightKind ${k} missing`).toContain(`'${k}'`);
    }
  });
});

describe("المنطق المشترك — recordBookingTripEvent (lib/transport/tripEvents)", () => {
  it("يُصدّر المخطّط والدالة المشتركة", () => {
    expect(HELPER).toContain("export const recordTripEventSchema");
    expect(HELPER).toContain("export async function recordBookingTripEvent");
    expect(HELPER).toContain('weightKind: z.enum(["tare", "gross", "axle", "other"])');
  });

  it("يفرض: حالة قابلة للتنفيذ + إثبات POD للإغلاق + ملكية أمر التوزيع + الوزن مع نوعه", () => {
    expect(HELPER).toContain("لا يمكن تسجيل واقعة على حجز في هذه الحالة");
    expect(HELPER).toContain("واقعة الإغلاق تتطلب صورة إثبات");
    expect(HELPER).toMatch(/transport_dispatch_orders\s*\n?\s*WHERE id = \$1 AND "bookingId" = \$2 AND "companyId" = \$3/);
    expect(HELPER).toContain("حدّد قيمة الوزن (كغم) عند اختيار نوع الوزن");
  });

  it("يشتقّ الحالة للأمام، يكتب ذرّيًا، ويسجّل Audit", () => {
    expect(HELPER).toContain('derivedStatus = "completed"');
    expect(HELPER).toContain('derivedStatus = "in_progress"');
    expect(HELPER).toContain("withTransaction");
    expect(HELPER).toContain("INSERT INTO fleet_trip_events");
    expect(HELPER).toContain("UPDATE transport_bookings SET status");
    expect(HELPER).toContain('action: "trip_event_recorded"');
  });
});

describe("سطح المشغّل — /transport/bookings/:id/events", () => {
  it("يستورد المنطق المشترك ويستدعيه (لا منطق مزدوج) بصلاحية fleet.bookings", () => {
    expect(BOOKINGS).toContain('from "../lib/transport/tripEvents.js"');
    expect(BOOKINGS).toContain("recordBookingTripEvent(scope, id, b)");
    expect(BOOKINGS).toMatch(/"\/transport\/bookings\/:id\/events"[\s\S]{0,120}fleet\.bookings/);
  });
  it("تفاصيل الحجز تُدرج tripEvents (غير المُبطَلة) في الرد", () => {
    expect(BOOKINGS).toMatch(/FROM fleet_trip_events[\s\S]+?"voidedAt" IS NULL/);
    expect(BOOKINGS).toContain("dispatchOrders, tripEvents, deductions, deductionRates, sourceContext");
  });
});

describe("سطح السائق — /transport/dispatch-orders/:id/trip-event", () => {
  it("الموجود بصلاحية fleet.dispatch ويستدعي نفس المنطق المشترك", () => {
    expect(PLANNING).toContain('"/transport/dispatch-orders/:id/trip-event"');
    expect(PLANNING).toMatch(/trip-event"[\s\S]{0,120}fleet\.dispatch/);
    expect(PLANNING).toContain("recordBookingTripEvent(");
  });
  it("يتحقّق من ملكية السائق لأمر التوزيع عبر fleet_drivers.employeeId = scope.employeeId", () => {
    expect(PLANNING).toMatch(/fleet_drivers fd[\s\S]+?fd\."employeeId" = \$3/);
    expect(PLANNING).toContain("scope.employeeId");
    expect(PLANNING).toContain("أمر التوزيع غير مُسنَد إليك");
  });
});

describe("المكوّن المشترك — TripEventRecorder", () => {
  it("يعرّف الوقائع الستة + الإغلاق + يرسل إلى endpoint المُمرَّر", () => {
    expect(RECORDER).toContain("export function TripEventRecorder");
    for (const t of ["load", "depart", "arrive", "inspect", "unload", "deliver"]) {
      expect(RECORDER, `event ${t} missing`).toContain(`type: "${t}"`);
    }
    expect(RECORDER).toContain('TRIP_EVENT_CLOSING = new Set(["unload", "deliver"])');
    expect(RECORDER).toContain("apiFetch(endpoint");
    expect(RECORDER).toContain("eventType: activeEvent");
  });
  it("يشترط POD للإغلاق + منتقي نوع الوزن + يعيد استخدام تدفّق الرفع القائم", () => {
    expect(RECORDER).toContain("صورة الإثبات مطلوبة");
    expect(RECORDER).toContain("setEventWeightKind");
    expect(RECORDER).toContain("weightKind: eventWeightKind");
    expect(RECORDER).toContain("/storage/uploads/request-url");
  });
});

describe("استهلاك المكوّن في السطحين", () => {
  it("صفحة الحجز تستعمل TripEventRecorder على endpoint المشغّل + تعرض الجدول والملخّص", () => {
    expect(DETAIL).toContain("TripEventRecorder");
    expect(DETAIL).toMatch(/endpoint=\{`\/transport\/bookings\/\$\{id\}\/events`\}/);
    expect(DETAIL).toContain("summarizeTripWeights");
    expect(DETAIL).toContain("صافي الحمولة");
  });
  it("تطبيق السائق يستعمل TripEventRecorder على endpoint السائق", () => {
    expect(DRIVER).toContain("TripEventRecorder");
    expect(DRIVER).toMatch(/endpoint=\{`\/transport\/dispatch-orders\/\$\{session\.dispatchOrderId\}\/trip-event`\}/);
  });
});

describe("اشتقاق صافي الوزن — summarizeTripWeights", () => {
  it("يشتقّ الصافي ولا يُخزّنه (المصدر الواحد)", () => {
    expect(TRIP_WEIGHT).toContain("export function summarizeTripWeights");
    expect(TRIP_WEIGHT).toMatch(/grossKg\s*-\s*tareKg/);
  });
});

describe("شريحة 3 — عهدة تبديل السائق", () => {
  it("هجرة 433 تضيف handoverToDriverId توسّعيًا (ADD COLUMN IF NOT EXISTS)", () => {
    expect(existsSync(MIGRATION_433_PATH)).toBe(true);
    expect(MIGRATION_433).toContain("@rollback");
    expect(MIGRATION_433).toMatch(/ADD COLUMN IF NOT EXISTS "handoverToDriverId"/);
  });

  it("المنطق المشترك يُدرج handoverToDriverId ويُعيد إسناد أمر التوزيع ذرّيًا", () => {
    expect(HELPER).toContain('"handoverToDriverId"');
    expect(HELPER).toContain("reassignDispatchDriverId");
    expect(HELPER).toMatch(/UPDATE transport_dispatch_orders SET "driverId"/);
  });

  it("endpoint العهدة: fleet.dispatch + ملكية + منع التسليم للنفس + يستدعي المنطق المشترك", () => {
    expect(PLANNING).toContain('"/transport/dispatch-orders/:id/handover"');
    expect(PLANNING).toMatch(/handover"[\s\S]{0,120}fleet\.dispatch/);
    expect(PLANNING).toContain("لا يمكن تسليم العهدة لنفس السائق");
    expect(PLANNING).toMatch(/reassignDispatchDriverId: b\.incomingDriverId/);
  });

  it("فحص أهلية المستلِم إلزامي (رخصة + راحة) قبل العهدة", () => {
    const body = PLANNING.slice(PLANNING.indexOf('"/transport/dispatch-orders/:id/handover"'));
    expect(body).toContain("assertDriverEligibility(");
    expect(body).toContain("assertDriverRest(");
  });

  it("endpoint مرشّحي العهدة موجود (يستبعد السائق الحالي)", () => {
    expect(PLANNING).toContain('"/transport/dispatch-orders/:id/handover-candidates"');
    expect(PLANNING).toMatch(/FROM fleet_drivers[\s\S]+?id <> \$2/);
  });

  it("تطبيق السائق يعرض «تسليم العهدة» ويستدعي endpoint العهدة + المرشّحين", () => {
    expect(DRIVER).toContain("تسليم العهدة");
    expect(DRIVER).toContain("submitHandover");
    expect(DRIVER).toMatch(/handover-candidates/);
    expect(DRIVER).toMatch(/dispatch-orders\/\$\{session\.dispatchOrderId\}\/handover`/);
    expect(DRIVER).toContain("incomingDriverId");
  });
});

describe("شريحة 4 — خصم النقص/التأخير (مرشّح → مالية)", () => {
  it("هجرة 434 تنشئ transport_deduction_candidates معزولًا إيجاريًا بلا قيد", () => {
    expect(existsSync(MIGRATION_434_PATH)).toBe(true);
    expect(MIGRATION_434).toContain("@rollback");
    expect(MIGRATION_434).toContain("CREATE TABLE IF NOT EXISTS transport_deduction_candidates");
    expect(MIGRATION_434).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\)/);
    expect(MIGRATION_434).toMatch(/"bookingId"\s+INTEGER NOT NULL REFERENCES transport_bookings\(id\)/);
    for (const v of ["weight_shortage", "delay"]) expect(MIGRATION_434).toContain(`'${v}'`);
    expect(MIGRATION_434).toContain('"recordedByAssignmentId"'); // القاعدة الذهبية
  });

  it("المنطق المشترك يُنشئ المرشّح فقط (تشغيلي) — لا ترحيل دفتر", () => {
    expect(DEDUCTIONS).toContain("export async function createDeductionCandidate");
    expect(DEDUCTIONS).toContain("INSERT INTO transport_deduction_candidates");
    expect(DEDUCTIONS).toContain("نقص الوزن (كغم) مطلوب");
    expect(DEDUCTIONS).toContain('action: "deduction_candidate_created"');
    // قفل الحدود: لا يكتب الدفتر ولا جداول المالية في النقل ولا المُساعد.
    for (const src of [BOOKINGS, DEDUCTIONS, PLANNING]) {
      expect(src).not.toContain("INSERT INTO credit_memos");
      expect(src).not.toContain("postJournalEntry");
    }
  });

  it("المبلغ يُحسب من المعدّل المُعدّ عند غيابه (resolveDeductionRates)", () => {
    expect(DEDUCTIONS).toContain("export async function resolveDeductionRates");
    expect(DEDUCTIONS).toContain("fleet.deduction.shortageRatePerKg");
    expect(DEDUCTIONS).toContain("fleet.deduction.delayRatePerHour");
    expect(DEDUCTIONS).toMatch(/measure \* rate/);
    expect(DEDUCTIONS).toContain("لا معدّل خصم مُعدّ");
  });

  it("سطحا المشغّل والسائق يستدعيان المنطق المشترك + التفاصيل تُدرج deductionRates", () => {
    expect(BOOKINGS).toContain('"/transport/bookings/:id/deductions"');
    expect(BOOKINGS).toContain("createDeductionCandidate(scope, id, b)");
    expect(BOOKINGS).toContain("tripEvents, deductions, deductionRates, sourceContext");
    expect(PLANNING).toContain('"/transport/dispatch-orders/:id/deduction"');
    expect(PLANNING).toMatch(/deduction"[\s\S]{0,120}fleet\.dispatch/);
    expect(PLANNING).toContain("createDeductionCandidate(scope, d.bookingId, b)");
  });

  it("صفحة الحجز تعرض نموذج الخصم + اقتراح المبلغ من المعدّل", () => {
    expect(DETAIL).toContain("خصومات النقص/التأخير");
    expect(DETAIL).toMatch(/\/transport\/bookings\/\$\{id\}\/deductions/);
    expect(DETAIL).toContain("submitDeduction");
    expect(DETAIL).toContain("إشعارًا دائنًا");
    expect(DETAIL).toContain("deductionRates"); // اقتراح المبلغ
  });

  it("تطبيق السائق يُبلّغ عن خصم على endpoint السائق", () => {
    expect(DRIVER).toContain("إبلاغ خصم");
    expect(DRIVER).toContain("submitDriverDeduction");
    expect(DRIVER).toMatch(/dispatch-orders\/\$\{session\.dispatchOrderId\}\/deduction`/);
  });

  it("نقص الوزن يُشتقّ من الأوزان المسجّلة (computeWeightShortage) ويُقترح في النموذج", () => {
    expect(TRIP_WEIGHT).toContain("export function computeWeightShortage");
    expect(DETAIL).toContain("computeWeightShortage(b.tripEvents)");
    expect(DETAIL).toContain("اقتراح من الأوزان");
  });
});

describe("شريحة 4 — ربط المرشّح بالإشعار (عبر حدث، قفل الحدود)", () => {
  it("الحدث مُسجّل في الكتالوج", () => {
    expect(EVENT_CATALOG).toContain('name: "transport.deduction.materialized"');
    expect(EVENT_CATALOG).toMatch(/deductionCandidateId: "number"[\s\S]*?creditMemoId: "number"/);
  });

  it("المالية تقبل deductionCandidateId وتُطلق الحدث (لا تكتب جدول النقل)", () => {
    expect(FINANCE_INVOICES).toContain("deductionCandidateId: z.coerce.number()");
    expect(FINANCE_INVOICES).toContain('action: "transport.deduction.materialized"');
    expect(FINANCE_INVOICES).not.toContain("UPDATE transport_deduction_candidates");
  });

  it("مستمع النقل يربط مرشّحه (status=issued + creditMemoId) — يكتب جدوله فقط", () => {
    expect(EVENT_LISTENERS).toContain('registerCrossDomainHandler("transport.deduction.materialized"');
    expect(EVENT_LISTENERS).toMatch(/UPDATE transport_deduction_candidates[\s\S]*?status = 'issued'[\s\S]*?"creditMemoId"/);
  });
});
