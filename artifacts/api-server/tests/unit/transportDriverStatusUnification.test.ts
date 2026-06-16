import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// TA-T18-UX-AUDIT-01 (متابعة) — إتمام توحيد حالات السائق على القاموس الموحّد:
// إضافة كيانات navigation / trip / driver، وترحيل شاشات me-driver،
// me-driver-navigation، و umrah/transport القديمة — إغلاق RM-03 «صفر fallback
// إنجليزي» على شاشات السائق المتبقية.

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const read = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");
const DICT = read("lib/transport-status-labels.ts");
const ME = read("pages/fleet/me-driver.tsx");
const NAV = read("pages/fleet/me-driver-navigation.tsx");

describe("توحيد الحالات — القاموس يصرّح كيانات navigation/trip/driver", () => {
  it("الكيانات الثلاثة في union و ALL", () => {
    for (const e of ['"navigation"', '"trip"', '"driver"']) {
      expect(DICT, `${e} في union`).toContain(e);
    }
    expect(DICT).toMatch(/navigation:\s*NAVIGATION/);
    expect(DICT).toMatch(/trip:\s*TRIP/);
    expect(DICT).toMatch(/driver:\s*DRIVER/);
  });

  it("navigation يغطّي حالات جلسة الملاحة السبع", () => {
    const blk = DICT.slice(DICT.indexOf("const NAVIGATION"), DICT.indexOf("const TRIP"));
    for (const s of ["active", "arrived_pickup", "loaded", "arrived_dropoff", "delivered", "ended", "cancelled"]) {
      expect(blk, `navigation ${s} مفقود`).toContain(`${s}:`);
    }
  });

  it("trip و driver يغطّيان قيمهما", () => {
    const tripBlk = DICT.slice(DICT.indexOf("const TRIP"), DICT.indexOf("const DRIVER"));
    for (const s of ["scheduled", "planned", "in_progress", "completed", "cancelled"]) {
      expect(tripBlk, `trip ${s} مفقود`).toContain(`${s}:`);
    }
    const drvBlk = DICT.slice(DICT.indexOf("const DRIVER"), DICT.indexOf("const ALL"));
    for (const s of ["available", "on_trip", "off_duty", "suspended"]) {
      expect(drvBlk, `driver ${s} مفقود`).toContain(`${s}:`);
    }
  });
});

describe("توحيد الحالات — الشاشات الثلاث تستهلك القاموس بلا خرائط محلية", () => {
  it("me-driver: trip + driver عبر القاموس، لا خرائط محلية، والشحن باقٍ", () => {
    expect(ME).toMatch(/statusLabel\("trip", t\.status\)/);
    expect(ME).toMatch(/statusLabel\("driver", me\.status\)/);
    expect(ME).not.toMatch(/const TRIP_STATUS/);
    expect(ME).not.toMatch(/const DRIVER_STATUS/);
    expect(ME).toMatch(/statusLabel\("cargo", m\.status\)/);
  });

  it("me-driver-navigation: navigation عبر القاموس، و NEXT_EVENT باقٍ", () => {
    expect(NAV).toMatch(/import \{ statusLabel \} from "@\/lib\/transport-status-labels"/);
    expect(NAV).toMatch(/statusLabel\("navigation", session\.status\)\.tone/);
    expect(NAV).toMatch(/statusLabel\("navigation", session\.status\)\.label/);
    expect(NAV).not.toMatch(/const STATUS_LABEL: Record/);
    expect(NAV).not.toMatch(/const STATUS_TONE: Record/);
    expect(NAV).toMatch(/const NEXT_EVENT/);
  });
});
