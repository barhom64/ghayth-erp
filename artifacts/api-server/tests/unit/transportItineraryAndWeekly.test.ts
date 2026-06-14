import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 Comment 2 + 3 — itinerary admin SPA + weekly planning view.
// Comment 3 mandated chained-trip support (سلسلة الرحلات).
// Comment 2 mandated weekly/monthly planning views with utilization.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const PLANNING = readApi("routes/transport-planning.ts");
const ITINERARIES_PAGE = readSpa("pages/fleet/transport-itineraries.tsx");
const ITINERARY_DETAIL = readSpa("pages/fleet/transport-itinerary-detail.tsx");
const FLEET_ROUTES = readSpa("routes/fleetRoutes.tsx");
const OPS_DASHBOARD = readSpa("pages/fleet/transport-ops-dashboard.tsx");
const BOOKINGS_LIST = readSpa("pages/fleet/transport-bookings.tsx");

describe("#1812 — itinerary list SPA", () => {
  it("file exists + uses canonical PageShell + FleetTabsNav", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-itineraries.tsx"))).toBe(true);
    expect(ITINERARIES_PAGE).toContain("PageShell");
    expect(ITINERARIES_PAGE).toContain("FleetTabsNav");
  });

  it("consumes the /transport/itineraries endpoint with status + serviceType filters", () => {
    expect(ITINERARIES_PAGE).toContain("/transport/itineraries");
    expect(ITINERARIES_PAGE).toContain("statusFilter");
    expect(ITINERARIES_PAGE).toContain("serviceFilter");
  });

  it("offers the 5 itinerary statuses + 6 service types", () => {
    for (const s of ["draft", "scheduled", "in_progress", "completed", "cancelled"]) {
      expect(ITINERARIES_PAGE, `status ${s} missing`).toContain(`value: "${s}"`);
    }
    for (const v of [
      "cargo_load", "passenger_umrah", "passenger_general",
      "equipment_rental", "internal_transfer", "other",
    ]) {
      expect(ITINERARIES_PAGE, `service ${v} missing`).toContain(`value: "${v}"`);
    }
  });

  it("Arabic-first UI", () => {
    expect(ITINERARIES_PAGE).toMatch(/برامج النقل/);
    expect(ITINERARIES_PAGE).toMatch(/سلاسل الرحلات/);
    expect(ITINERARIES_PAGE).toMatch(/برنامج جديد/);
  });

  it("registered in fleetRoutes at /fleet/transport/itineraries", () => {
    expect(FLEET_ROUTES).toContain("TransportItineraries");
    expect(FLEET_ROUTES).toContain("/fleet/transport/itineraries");
  });

  it("bookings list cross-links to itineraries", () => {
    expect(BOOKINGS_LIST).toContain("/fleet/transport/itineraries");
    expect(BOOKINGS_LIST).toMatch(/البرامج/);
  });
});

describe("#1812 — itinerary detail + leg editor", () => {
  it("file exists + consumes /transport/itineraries/:id", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-itinerary-detail.tsx"))).toBe(true);
    expect(ITINERARY_DETAIL).toMatch(/\/transport\/itineraries\/\$\{id\}/);
  });

  it("offers leg CRUD against /transport/itineraries/:id/legs", () => {
    expect(ITINERARY_DETAIL).toMatch(/\/transport\/itineraries\/\$\{id\}\/legs/);
    expect(ITINERARY_DETAIL).toMatch(/method: "POST"/);
    expect(ITINERARY_DETAIL).toMatch(/method: "PATCH"/);
    expect(ITINERARY_DETAIL).toMatch(/method: "DELETE"/);
  });

  it("offers the 7 leg types + 7 leg statuses", () => {
    for (const t of [
      "transit", "pickup", "dropoff", "rest", "fuel", "inspection", "custom",
    ]) {
      expect(ITINERARY_DETAIL, `leg type ${t} missing`).toContain(`value: "${t}"`);
    }
    // UX-05 (TA-T18-UX-AUDIT-01) — قائمة حالات المقطع تُشتق من القاموس الموحّد
    // (كيان "leg")؛ فينتقل ضمان القيم السبع إلى المصدر الموحّد.
    expect(ITINERARY_DETAIL).toMatch(/Object\.entries\(statusDict\("leg"\)\)/);
    const LEG_DICT = readSpa("lib/transport-status-labels.ts");
    const legStart = LEG_DICT.indexOf("const LEG:");
    const legBlock = LEG_DICT.slice(legStart, LEG_DICT.indexOf("const ", legStart + 10));
    for (const s of [
      "pending", "scheduled", "assigned", "in_progress",
      "completed", "cancelled", "skipped",
    ]) {
      expect(legBlock, `leg status ${s} missing`).toContain(`${s}:`);
    }
  });

  it("legs render in legNumber order", () => {
    expect(ITINERARY_DETAIL).toMatch(/sort\(\(a, b\) => a\.legNumber - b\.legNumber\)/);
  });

  it("registered in fleetRoutes at /fleet/transport/itineraries/:id", () => {
    expect(FLEET_ROUTES).toContain("TransportItineraryDetail");
    expect(FLEET_ROUTES).toContain("/fleet/transport/itineraries/:id");
  });
});

describe("#1812 — weekly planning endpoint", () => {
  it("backend exposes GET /transport/ops-weekly", () => {
    expect(PLANNING).toMatch(/\.get\(\s*"\/transport\/ops-weekly"/);
  });

  it("returns 7 days via generate_series + counts late / completed / cancelled per day", () => {
    expect(PLANNING).toContain("generate_series");
    expect(PLANNING).toMatch(/INTERVAL '6 days'/);
    expect(PLANNING).toMatch(/FILTER \(WHERE o\.status IN \('completed', 'closed'\)\)/);
    expect(PLANNING).toMatch(/FILTER \(WHERE o\.status = 'cancelled'\)/);
    expect(PLANNING).toMatch(/WHERE o\.status IN \('pending', 'notified'\)[\s\S]{0,200}INTERVAL '15 minutes'/);
  });

  it("computes per-vehicle utilisation as bookedSeconds / weekSeconds × 100", () => {
    expect(PLANNING).toContain("vehicleUtilisation");
    expect(PLANNING).toMatch(/7 \* 24 \* 3600/);
    expect(PLANNING).toMatch(/EXTRACT\(EPOCH FROM/);
  });

  it("excludes declined + cancelled dispatch orders from utilisation", () => {
    expect(PLANNING).toMatch(/o\.status NOT IN \('declined', 'cancelled'\)/);
  });
});

describe("#1812 — ops dashboard weekly tab", () => {
  it("renders a Tabs control with `daily` + `weekly` tabs", () => {
    expect(OPS_DASHBOARD).toContain('value="daily"');
    expect(OPS_DASHBOARD).toContain('value="weekly"');
    expect(OPS_DASHBOARD).toContain("TabsTrigger");
  });

  it("consumes /transport/ops-weekly lazily (only when the tab is open)", () => {
    expect(OPS_DASHBOARD).toMatch(/tab === "weekly" \? `\/transport\/ops-weekly\?startDate=\$\{date\}` : null/);
  });

  it("renders a 7-column day strip + a utilisation table", () => {
    expect(OPS_DASHBOARD).toMatch(/grid-cols-7/);
    expect(OPS_DASHBOARD).toMatch(/استغلال الأسطول/);
    expect(OPS_DASHBOARD).toMatch(/توزيع الأسبوع/);
  });

  it("tones utilisation values into 4 bands (high/mid/low/idle) with Arabic labels", () => {
    expect(OPS_DASHBOARD).toMatch(/مرتفع|متوسط|منخفض|خامل/);
  });
});
