import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * البند ٤ — «تسجيل واقعة مركبة» (الكيان يقود التجربة). صفحة تشغيلية واحدة:
 * اختر المركبة مرّة → يفتح عالمها (VehicleContextCard) → اختر الواقعة (وقود/صيانة/
 * تأمين) → سجّل، فتُستدعى نقاط الخلفية الجاهزة. تثبت هذه السمكة بنية النمط + التوجيه
 * + ظهورها في القائمة (اكتشاف الخدمة). حارس ثابت (regex، بلا DB/متصفّح).
 */
const FE = join(import.meta.dirname!, "../../../ghayth-erp/src");
const PAGE = readFileSync(join(FE, "pages/create/fleet/vehicle-event-create.tsx"), "utf8");
const ROUTES = readFileSync(join(FE, "routes/fleetRoutes.tsx"), "utf8");
const NAV = readFileSync(join(FE, "components/layout/navigation.registry.ts"), "utf8");

describe("البند ٤ — vehicle «تسجيل واقعة» page (entity-led unified input)", () => {
  it("the entity leads: picks a vehicle once + opens its world (VehicleContextCard)", () => {
    expect(PAGE).toMatch(/<VehicleSelect\b/);
    expect(PAGE).toMatch(/<VehicleContextCard\b[\s\S]*?section=\{ev/);
  });

  it("one place, three vehicle events — fuel / maintenance / insurance", () => {
    expect(PAGE).toMatch(/key: "fuel", label: "وقود"/);
    expect(PAGE).toMatch(/key: "maintenance", label: "صيانة"/);
    expect(PAGE).toMatch(/key: "insurance", label: "تأمين"/);
  });

  it("composes the READY backend endpoints (no new ledger logic in the page)", () => {
    // وقود: نقطة الواقعة لكل مركبة (costBearer-aware، شريحة ١).
    expect(PAGE).toMatch(/\/fleet\/vehicles\/\$\{body\.vehicleId\}\/fuel-event/);
    expect(PAGE).toMatch(/useApiMutation\("\/fleet\/maintenance"/);
    expect(PAGE).toMatch(/useApiMutation\("\/fleet\/insurance"/);
  });

  it("surfaces costBearer for fuel (مبدأ إبراهيم: مَن يتحمّل يقرّر الحساب)", () => {
    expect(PAGE).toMatch(/costBearer/);
    expect(PAGE).toMatch(/الشركة \(مصروف تشغيلي للمركبة\)/);
    expect(PAGE).toMatch(/السائق \(ذمة عليه تُخصم من حسابه\)/);
    expect(PAGE).toMatch(/costBearer: form\.costBearer/);
  });

  it("operational soul: no raw account codes / GL fields exposed to the user", () => {
    // واجهة تشغيلية — لا حسابات ولا أبعاد تقنية (نموذج الحقيقة التشغيلية).
    expect(PAGE).not.toMatch(/accountCode|journal_lines|debit|credit/);
  });

  it("save button is rate-limit aware + has a stable testid", () => {
    expect(PAGE).toMatch(/data-testid="vehicle-event-submit"/);
    expect(PAGE).toMatch(/rateLimitAware/);
  });

  it("routed at /fleet/record-event (lazy) + discoverable in the fleet menu", () => {
    expect(ROUTES).toMatch(/VehicleEventCreate = lazy\(\(\) => import\("@\/pages\/create\/fleet\/vehicle-event-create"\)\)/);
    expect(ROUTES).toMatch(/path: "\/fleet\/record-event", component: VehicleEventCreate/);
    expect(NAV).toMatch(/label: "تسجيل واقعة مركبة", path: "\/fleet\/record-event"/);
  });
});
