import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TA-T18-UX-AUDIT-01 · UX-05 — توحيد الحالات: لوحة التوزيع تستهلك القاموس
// الموحّد (lib/transport-status-labels) بدل خريطة محلية متوازية كانت تسقط
// لقيمة إنجليزية خام (P2-2 / RM-03 «صفر fallback إنجليزي»).

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const DISPATCH = readFileSync(join(spaSrc, "pages/fleet/transport-dispatch.tsx"), "utf8");
const REQUESTS = readFileSync(join(spaSrc, "pages/umrah/transport-requests.tsx"), "utf8");
const ITINERARY = readFileSync(join(spaSrc, "pages/fleet/transport-itinerary-detail.tsx"), "utf8");

describe("UX-05 — لوحة التوزيع تستخدم القاموس الموحّد للحالة", () => {
  it("تستورد statusLabel من القاموس الموحّد", () => {
    expect(DISPATCH).toMatch(/import \{ statusLabel \} from "@\/lib\/transport-status-labels"/);
  });

  it("تعرض حالة التوزيع عبر statusLabel('dispatch', …) لا خريطة محلية", () => {
    expect(DISPATCH).toMatch(/statusLabel\("dispatch", o\.status\)\.label/);
    expect(DISPATCH).toMatch(/statusLabel\("dispatch", o\.status\)\.tone/);
  });

  it("لم تعد هناك خريطة حالة محلية بـ fallback إنجليزي خام", () => {
    expect(DISPATCH).not.toMatch(/const STATUS_LABEL: Record/);
    expect(DISPATCH).not.toMatch(/const STATUS_TONE: Record/);
  });
});

describe("UX-05 — صفحة طلبات النقل (umrah) تستهلك القاموس الموحّد", () => {
  it("تستورد statusLabel وتعرض الحالة عبر statusLabel('booking', …)", () => {
    expect(REQUESTS).toMatch(/import \{ statusLabel \} from "@\/lib\/transport-status-labels"/);
    expect(REQUESTS).toMatch(/statusLabel\("booking", r\.status\)\.label/);
    expect(REQUESTS).toMatch(/statusLabel\("booking", r\.status\)\.tone/);
  });

  it("لم تعد هناك خرائط حالة محلية (STATUS_LABEL_AR/STATUS_TONE)", () => {
    expect(REQUESTS).not.toMatch(/const STATUS_LABEL_AR: Record/);
    expect(REQUESTS).not.toMatch(/const STATUS_TONE: Record/);
  });
});

describe("UX-05 — تفاصيل مسار الرحلة (leg) تستهلك القاموس الموحّد", () => {
  it("تستورد statusLabel/statusDict وتعرض الحالة والنغمة والقائمة منه", () => {
    expect(ITINERARY).toMatch(
      /import \{ statusLabel, statusDict \} from "@\/lib\/transport-status-labels"/,
    );
    expect(ITINERARY).toMatch(/statusLabel\("leg", leg\.status\)\.tone/);
    expect(ITINERARY).toMatch(/statusLabel\("leg", v\)\.label/);
    expect(ITINERARY).toMatch(/Object\.entries\(statusDict\("leg"\)\)/);
  });

  it("لم تعد هناك خرائط حالة محلية للمقطع (LEG_STATUSES/LEG_STATUS_TONE)", () => {
    expect(ITINERARY).not.toMatch(/const LEG_STATUSES/);
    expect(ITINERARY).not.toMatch(/const LEG_STATUS_TONE/);
  });
});
