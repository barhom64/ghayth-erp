import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2079 TA-T18-04 — Route Patterns SPA wiring (static, regex-only).
 *
 * Same rule as TA-T18-05's parity test: api-server tests stay
 * package-local. We never IMPORT the SPA runtime here — we read the
 * SPA files as plain text and assert structural invariants:
 *
 *   • the page exists and consumes only the existing
 *     `/transport/route-patterns*` endpoints (no new route, no
 *     migration, no new RBAC action)
 *   • the day-of-week mask is the 7-bit Sunday=0..Saturday=6
 *     convention the server's `matchingDatesInRange` generator uses
 *   • writes are gated on the existing `fleet.bookings:*` permission
 *     family — no new permission key invented client-side
 *   • the route is registered + the sidebar entry is added
 *   • boundary intact: no finance / GL / VRP / Reputation / engine
 *     references, no edits to the assignment guard chain
 */

const repoRoot = join(import.meta.dirname!, "../../../..");

const PAGE = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/transport-route-patterns.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/routes/fleetRoutes.tsx"),
  "utf8",
);
const NAV = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);
const SERVER_LIB = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/transport-route-patterns.ts"),
  "utf8",
);
const BOOKING_DETAIL = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/transport-booking-detail.tsx"),
  "utf8",
);

/* ── 1. Endpoint reuse — no new route, no new path ─────────────── */

describe("#2079 TA-T18-04 — endpoint reuse only", () => {
  it("page calls the existing list / create / update endpoints", () => {
    // GET list
    expect(PAGE).toMatch(/\/transport\/route-patterns\?status=/);
    // POST create
    expect(PAGE).toMatch(/apiFetch\(\s*["']\/transport\/route-patterns["']\s*,\s*\{\s*method:\s*["']POST["']/);
    // PATCH update
    expect(PAGE).toMatch(/\/transport\/route-patterns\/\$\{form\.id\}/);
    expect(PAGE).toMatch(/method:\s*["']PATCH["']/);
    // DELETE soft-archive
    expect(PAGE).toMatch(/method:\s*["']DELETE["']/);
  });

  it("page calls the existing materialise + materialise-range endpoints", () => {
    expect(PAGE).toMatch(/\/transport\/route-patterns\/\$\{matSubject\.id\}\/materialise(?!-)/);
    expect(PAGE).toMatch(/\/transport\/route-patterns\/\$\{matSubject\.id\}\/materialise-range/);
  });

  it("page does NOT invent a new endpoint path", () => {
    expect(PAGE).not.toMatch(/\/route-patterns\/[a-z]+\b(?!.*\/materialise)/);
    expect(PAGE).not.toMatch(/\/transport\/route-patterns\/[a-zA-Z]+(?:Create|Bulk|Activate|Pause)/);
    // No POST/PATCH/PUT against a brand-new transport sub-resource.
    expect(PAGE).not.toMatch(/\/transport\/(routes|patterns|recurring|schedules)\b/);
  });

  it("server lib still owns exactly the 7 endpoints we reuse — no extras inadvertently added", () => {
    const verbs = SERVER_LIB.match(/transportRoutePatternsRouter\.(get|post|patch|delete)\(/g) ?? [];
    // 2 GET (list + one), 3 POST (create + materialise + materialise-range),
    // 1 PATCH, 1 DELETE = 7 handlers exactly.
    expect(verbs.length).toBe(7);
  });
});

/* ── 2. Day-of-week mask convention parity ─────────────────────── */

describe("#2079 TA-T18-04 — day-of-week mask convention", () => {
  it("SPA labels Sunday as bit 0 and Saturday as bit 6 (matches server's mask walker)", () => {
    // The DAYS_OF_WEEK array MUST start with Sunday (bit 0) and end at
    // Saturday (bit 6). The server's `matchingDatesInRange` walks the
    // mask with `((daysOfWeekMask >> dayOfWeek) & 1)` where
    // dayOfWeek is UTCDay() in Riyadh — Sun=0..Sat=6.
    expect(PAGE).toMatch(/bit:\s*0,\s*short:\s*"أحد"/);
    expect(PAGE).toMatch(/bit:\s*6,\s*short:\s*"سبت"/);
  });

  it("SPA mask predicate uses the same bit-shift formula as server", () => {
    // Server: `((mask >> dayOfWeek) & 1) === 0`
    // SPA:    `(mask & (1 << bit)) !== 0` — algebraically identical.
    expect(PAGE).toMatch(/\(\s*mask\s*&\s*\(1\s*<<\s*[a-zA-Z]\.bit\s*\)\s*\)/);
    expect(SERVER_LIB).toMatch(/\(\s*\(\s*daysOfWeekMask\s*>>\s*dayOfWeek\s*\)\s*&\s*1\s*\)/);
  });

  it("day-of-week-mask = 0 is rejected client-side before the POST", () => {
    expect(PAGE).toMatch(/form\.daysOfWeekMask === 0/);
    expect(PAGE).toMatch(/اختر يوم واحد على الأقل/);
  });
});

/* ── 3. Permission reuse — no new RBAC action ──────────────────── */

describe("#2079 TA-T18-04 — RBAC reuse (fleet.bookings family only)", () => {
  it("page gates create/update/delete on existing fleet.bookings actions", () => {
    expect(PAGE).toMatch(/usePermission\("fleet\.bookings:create"\)/);
    expect(PAGE).toMatch(/usePermission\("fleet\.bookings:update"\)/);
    expect(PAGE).toMatch(/usePermission\("fleet\.bookings:delete"\)/);
  });

  it("page does NOT invent a fleet.routePatterns permission key", () => {
    expect(PAGE).not.toMatch(/fleet\.routePatterns/);
    expect(PAGE).not.toMatch(/fleet\.patterns/);
    expect(PAGE).not.toMatch(/fleet\.recurring/);
  });

  it("sidebar entry uses fleet.bookings:list (no new permission needed to see the link)", () => {
    expect(NAV).toMatch(/path:\s*"\/fleet\/transport\/route-patterns",\s*icon:\s*[A-Za-z0-9]+,\s*perm:\s*"fleet\.bookings:list"/);
  });
});

/* ── 4. Strict client-side sanitization ────────────────────────── */

describe("#2079 TA-T18-04 — strict payload rules (mirror TA-T18-05 mandate)", () => {
  it("empty string → null for both text and number helpers", () => {
    expect(PAGE).toMatch(/function strOrNull\(v: string\)/);
    expect(PAGE).toMatch(/function numOrNull\(v: string\)/);
    expect(PAGE).toMatch(/t === ""\s*\?\s*null/);
  });

  it("status enum is restricted to the three server-known values", () => {
    expect(PAGE).toMatch(/"active"\s*\|\s*"paused"\s*\|\s*"archived"/);
    // No 'draft' / 'live' / any non-server status leaking in.
    expect(PAGE).not.toMatch(/status:\s*"draft"/);
  });

  it("patternCode is read-only after creation (server enforces uniqueness)", () => {
    expect(PAGE).toMatch(/disabled=\{editing\}/);
    expect(PAGE).toMatch(/الرمز ثابت بعد الإنشاء/);
  });

  it("materialise-range UI mentions the server's 90-day cap explicitly", () => {
    expect(PAGE).toMatch(/90/);
    expect(PAGE).toMatch(/idempotent/);
  });
});

/* ── 5. Route + sidebar wiring ─────────────────────────────────── */

describe("#2079 TA-T18-04 — wiring", () => {
  it("fleetRoutes registers /fleet/transport/route-patterns", () => {
    expect(ROUTES).toMatch(/path:\s*"\/fleet\/transport\/route-patterns"/);
    expect(ROUTES).toMatch(/const TransportRoutePatterns = lazy\(/);
  });

  it("navigation registry adds the Arabic label", () => {
    expect(NAV).toMatch(/قوالب المسارات المتكررة/);
  });
});

/* ── 6. Boundary — no engine / finance / RBAC drift ────────────── */

describe("#2079 TA-T18-04 — boundary intact", () => {
  it("page does NOT reference the assignment guard chain or related engines", () => {
    expect(PAGE).not.toMatch(/assignmentSuggestionEngine|vehicleClassLadder|driverReadiness|vehicleReadiness|operatingWindow|umrahFamiliarity|reputationScore|driverReputation/);
  });

  it("page does NOT reference finance / GL / journal / invoice / VRP / print engine", () => {
    expect(PAGE).not.toMatch(/journalEngine|postingEngine|financialEngine|invoiceLine|generalLedger|vrpA-z|printEngine/);
  });

  it("page does NOT touch migrations or DDL", () => {
    expect(PAGE).not.toMatch(/migrations\//);
    expect(PAGE).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP TABLE/i);
  });
});

/* ── 7. Heavy-transport ready preset (2026-06-30) ──────────────── */

describe("قالب «نقل ثقيل» الجاهز — قيم مُسبقة فوق تدفّق الإنشاء القائم", () => {
  it("أصناف المركبة قائمة قانونية عربية (شاحنة=truck للنقل الثقيل)", () => {
    expect(PAGE).toMatch(/VEHICLE_CLASS_OPTIONS\s*=\s*\[/);
    expect(PAGE).toMatch(/value:\s*"truck",\s*label:\s*"شاحنة"/);
    expect(PAGE).toMatch(/value:\s*"trailer"/);
  });

  it("أصناف الرخصة قائمة قانونية عربية (نقل ثقيل=heavy)", () => {
    expect(PAGE).toMatch(/LICENSE_CLASS_OPTIONS\s*=\s*\[/);
    expect(PAGE).toMatch(/value:\s*"heavy",\s*label:\s*"نقل ثقيل"/);
  });

  it("التهيئة المسبقة: شاحنة + رخصة نقل ثقيل + وحدة طن (كلها قابلة للتعديل)", () => {
    expect(PAGE).toMatch(/HEAVY_TRANSPORT_PRESET[\s\S]{0,200}defaultVehicleClass:\s*"truck"/);
    expect(PAGE).toMatch(/HEAVY_TRANSPORT_PRESET[\s\S]{0,200}defaultLicenseClass:\s*"heavy"/);
    expect(PAGE).toMatch(/defaultCargoUnit:\s*"طن"/);
  });

  it("زر «قالب نقل ثقيل» يفتح حوار الإنشاء مُهيّأً، بصلاحية الإنشاء نفسها", () => {
    expect(PAGE).toContain("قالب نقل ثقيل");
    expect(PAGE).toMatch(/openHeavyPreset/);
    expect(PAGE).toMatch(/\{\s*\.\.\.EMPTY_FORM,\s*\.\.\.HEAVY_TRANSPORT_PRESET\s*\}/);
    // الزر مُحاط بصلاحية fleet.bookings:create (يُعاد استخدام تدفّق POST القائم).
    expect(PAGE).toMatch(/perm="fleet\.bookings:create"[\s\S]{0,80}onClick=\{openHeavyPreset\}/);
  });

  it("حقلا الصنف صارا قائمتين (تخزين كود/عرض عربي) لا إدخالًا حرًّا بأكواد إنجليزية", () => {
    expect(PAGE).toMatch(/function ClassSelectField/);
    expect(PAGE).toMatch(/options=\{VEHICLE_CLASS_OPTIONS\}/);
    expect(PAGE).toMatch(/options=\{LICENSE_CLASS_OPTIONS\}/);
    // حفظ قيمة قديمة غير قانونية + خيار «غير محدّد» (لا يضيع تعديل قالب سابق).
    expect(PAGE).toMatch(/\{\s*value,\s*label:\s*value\s*\}/);
    expect(PAGE).toContain("— غير محدّد");
  });

  it("لا endpoint/RBAC/هجرة جديدة — مجرد تهيئة مسبقة فوق POST القائم", () => {
    // القالب الجاهز لا يضيف مسارًا: يفتح نفس الحوار ويُرسل عبر POST نفسه.
    const verbs = SERVER_LIB.match(/transportRoutePatternsRouter\.(get|post|patch|delete)\(/g) ?? [];
    expect(verbs.length).toBe(7);
    expect(PAGE).not.toMatch(/fleet\.routePatterns|fleet\.heavy/);
  });
});

/* ── 8. Operational waypoints editor + propagation + display (2026-07-01) ── */

describe("محرّر نقاط التشغيل — تحرير في القالب + نقل للحجز + عرض في التنفيذ", () => {
  it("المحرّر: أنواع نقاط عربية + حالة operationalWaypoints + زر إضافة/حذف", () => {
    expect(PAGE).toMatch(/WAYPOINT_KIND_OPTIONS\s*=\s*\[/);
    expect(PAGE).toMatch(/value:\s*"loading",\s*label:\s*"تحميل"/);
    expect(PAGE).toMatch(/value:\s*"unloading",\s*label:\s*"تفريغ"/);
    expect(PAGE).toContain("operationalWaypoints: Waypoint[]");
    expect(PAGE).toContain("إضافة نقطة");
    // يُرسل النقاط في الحمولة (POST/PATCH القائم يقبلها).
    expect(PAGE).toMatch(/operationalWaypoints:\s*form\.operationalWaypoints\s*\n?\s*\.filter/);
  });

  it("قالب النقل الثقيل يبذر 4 نقاط تشغيل (قابلة للتعديل)", () => {
    expect(PAGE).toMatch(/HEAVY_TRANSPORT_PRESET[\s\S]{0,320}operationalWaypoints:\s*\[[\s\S]{0,160}kind:\s*"loading"[\s\S]{0,120}kind:\s*"unloading"/);
  });

  it("الخادم يُرجع النقاط في القائمة ويحقنها في الحجز (materialise + range) — لا هجرة/route جديد", () => {
    // القائمة + استعلام المدى يُرجعان operationalWaypoints (كي يملأ openEdit المحرّر
    // وتُحقَن في الحجوزات). يظهر العمود في select القائمة وselect المدى.
    expect(SERVER_LIB).toContain('"operationalWaypoints"');
    expect(SERVER_LIB).toContain('"defaultCargoUnit", "operationalWaypoints"');
    // كلا مسارَي التوليد يكتبان cargoOperationalMetadata من نقاط القالب.
    expect(SERVER_LIB).toContain('"cargoOperationalMetadata"');
    expect(SERVER_LIB).toMatch(/JSON\.stringify\(\{\s*waypoints:\s*pattern\.operationalWaypoints\s*\}\)/);
    // لا route/هجرة جديدة (الحقول موجودة أصلًا — إحياء).
    const verbs = SERVER_LIB.match(/transportRoutePatternsRouter\.(get|post|patch|delete)\(/g) ?? [];
    expect(verbs.length).toBe(7);
    expect(SERVER_LIB).not.toMatch(/CREATE TABLE|ALTER TABLE/i);
  });

  it("تفاصيل الحجز تعرض نقاط التشغيل قراءة فقط (عربي)", () => {
    expect(BOOKING_DETAIL).toContain("cargoOperationalMetadata");
    expect(BOOKING_DETAIL).toContain("نقاط التشغيل");
    expect(BOOKING_DETAIL).toMatch(/WAYPOINT_KIND_LABEL_AR/);
    expect(BOOKING_DETAIL).toMatch(/loading:\s*"تحميل"[\s\S]{0,120}unloading:\s*"تفريغ"/);
  });
});
