import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 Comment 4663005810 — cargo recurring route patterns SPA surface.
//
// Backend endpoints landed in PR #1961. This test pins the SPA pages
// that consume them:
//   - /fleet/transport/route-patterns (list)
//   - /fleet/transport/route-patterns/create (create form)
// And the fleet route registration (wouter is order-sensitive: /create
// must come before /:id).

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const read = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const LIST    = read("pages/fleet/transport-route-patterns.tsx");
const CREATE  = read("pages/fleet/transport-route-patterns-create.tsx");
const ROUTES  = read("routes/fleetRoutes.tsx");

describe("#1812 — TransportRoutePatterns list page", () => {
  it("file exists + uses PageShell + FleetTabsNav", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-route-patterns.tsx"))).toBe(true);
    expect(LIST).toContain("PageShell");
    expect(LIST).toContain("FleetTabsNav");
  });

  it("queries /transport/route-patterns with status filter", () => {
    expect(LIST).toMatch(/\/transport\/route-patterns\?status=/);
    expect(LIST).toContain("statusFilter");
  });

  it("renders the 7 Arabic day labels", () => {
    for (const day of ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]) {
      expect(LIST, `day ${day} missing`).toContain(day);
    }
  });

  it("renders day mask via bitwise check (bit i = day i)", () => {
    expect(LIST).toMatch(/mask & \(1 << i\)/);
  });

  it("shows 4 status filter options + Arabic title", () => {
    for (const status of ["active", "paused", "archived", "all"]) {
      expect(LIST).toMatch(new RegExp(`value="${status}"`));
    }
    expect(LIST).toMatch(/جداول الرحلات المتكرّرة/);
    expect(LIST).toMatch(/قوالب رحلات الحمولة المتكرّرة/);
  });

  it("supports manual materialise via POST /:id/materialise", () => {
    expect(LIST).toContain("/materialise");
    expect(LIST).toMatch(/تشغيل اليوم/);
    expect(LIST).toMatch(/handleMaterialise/);
  });

  it("disables materialise button for non-active patterns + during firing", () => {
    expect(LIST).toMatch(/disabled=\{r\.status !== "active" \|\| firingId === r\.id\}/);
  });

  it("prevents double-click duplicates via per-row firingId state", () => {
    expect(LIST).toMatch(/const \[firingId, setFiringId\] = useState<number \| null>/);
    expect(LIST).toMatch(/if \(firingId !== null\) return/);
  });

  it("surfaces idempotent-return signal to the operator", () => {
    expect(LIST).toMatch(/alreadyExisted/);
    expect(LIST).toMatch(/موجود مسبقاً/);
  });

  it("explains the cron behavior to operators", () => {
    expect(LIST).toMatch(/كل يوم يفحص النظام القوالب النشطة/);
    expect(LIST).toMatch(/routePatternId/);
  });
});

describe("#1812 — TransportRoutePatternsCreate form", () => {
  it("file exists + uses PageShell + FleetTabsNav", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-route-patterns-create.tsx"))).toBe(true);
    expect(CREATE).toContain("PageShell");
    expect(CREATE).toContain("FleetTabsNav");
  });

  it("offers all 7 days as toggleable checkboxes", () => {
    for (const day of [
      ["0", "الأحد"], ["1", "الإثنين"], ["2", "الثلاثاء"],
      ["3", "الأربعاء"], ["4", "الخميس"], ["5", "الجمعة"], ["6", "السبت"],
    ]) {
      expect(CREATE, `day ${day[1]} missing`).toContain(day[1]);
      expect(CREATE, `day value ${day[0]} missing`).toMatch(new RegExp(`value: ${day[0]},`));
    }
  });

  it("builds the mask via bitwise OR (bit i = day i)", () => {
    expect(CREATE).toMatch(/mask \|= \(1 << d\)/);
    expect(CREATE).toMatch(/const buildMask = \(\): number/);
  });

  it("uses the canonical DateField for activeFrom + activeUntil (#1812 §8)", () => {
    expect(CREATE).toContain("DateField");
    expect(CREATE).toMatch(/<DateField[\s\S]{0,200}label="ساري من"/);
    expect(CREATE).toMatch(/<DateField[\s\S]{0,200}label="ساري إلى"/);
  });

  it("POSTs to /transport/route-patterns", () => {
    expect(CREATE).toMatch(/apiFetch[\s\S]{0,200}"\/transport\/route-patterns"/);
    expect(CREATE).toMatch(/daysOfWeekMask: buildMask\(\)/);
  });

  it("validates: at least one day + patternCode + name required", () => {
    expect(CREATE).toMatch(/رمز القالب مطلوب/);
    expect(CREATE).toMatch(/اسم القالب مطلوب/);
    expect(CREATE).toMatch(/اختر يوماً واحداً على الأقل/);
  });

  it("offers cargo defaults: vehicleClass / licenseClass / weight / unit", () => {
    for (const f of ["defaultVehicleClass", "defaultLicenseClass", "defaultCargoWeight", "defaultCargoUnit"]) {
      expect(CREATE, `field ${f} missing`).toContain(f);
    }
    expect(CREATE).toMatch(/فئة المركبة الافتراضية/);
    expect(CREATE).toMatch(/فئة الرخصة المطلوبة/);
    expect(CREATE).toMatch(/الوزن الافتراضي/);
  });

  it("explains the cron + bookingSource = recurring_schedule lineage", () => {
    expect(CREATE).toMatch(/recurring_schedule/);
    expect(CREATE).toMatch(/cron اليومي/);
  });
});

describe("#1812 — fleetRoutes registration", () => {
  it("imports both pages as lazy modules", () => {
    expect(ROUTES).toContain("TransportRoutePatterns");
    expect(ROUTES).toContain("TransportRoutePatternsCreate");
  });

  it("registers /create BEFORE /:id-free /list (wouter order-sensitive)", () => {
    const createIdx = ROUTES.indexOf("/fleet/transport/route-patterns/create");
    const listIdx = ROUTES.indexOf('"/fleet/transport/route-patterns"');
    expect(createIdx).toBeGreaterThan(0);
    expect(listIdx).toBeGreaterThan(0);
    expect(createIdx, "/create must come before /route-patterns list").toBeLessThan(listIdx);
  });
});
