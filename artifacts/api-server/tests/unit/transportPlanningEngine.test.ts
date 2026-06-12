import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 — Transport Planning Engine.
// Locks in the foundational spine: schema, MapsService abstraction,
// AssignmentSuggestionEngine scoring + reasons, driver-rest guard
// integration into the dispatch order create path, planning routes
// (settings / suggest / ops-dashboard / itineraries / navigation),
// and the SPA surfaces (ops dashboard + in-app driver navigation).

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const MIGRATION = readApi("migrations/271_transport_planning_engine.sql");
const MAPS = readApi("lib/fleet/mapsService.ts");
const ENGINE = readApi("lib/fleet/assignmentSuggestionEngine.ts");
const REST = readApi("lib/fleet/driverRest.ts");
const PLANNING_ROUTES = readApi("routes/transport-planning.ts");
const TRANSPORT_BOOKINGS = readApi("routes/transport-bookings.ts");
const ROUTES_INDEX = readApi("routes/index.ts");
const OPS_DASHBOARD = readSpa("pages/fleet/transport-ops-dashboard.tsx");
const DRIVER_NAV = readSpa("pages/fleet/me-driver-navigation.tsx");
const SUGGEST_DIALOG = readSpa("components/shared/assignment-suggest-dialog.tsx");
const BOOKING_DETAIL = readSpa("pages/fleet/transport-booking-detail.tsx");
const FLEET_ROUTES = readSpa("routes/fleetRoutes.tsx");
const ME_DRIVER = readSpa("pages/fleet/me-driver.tsx");

describe("#1812 — migration 271 schema spine", () => {
  it("file exists and is marked breaking (DROP CONSTRAINT in rollback)", () => {
    expect(existsSync(join(apiSrc, "migrations/271_transport_planning_engine.sql"))).toBe(true);
    expect(MIGRATION).toContain("@policy:breaking");
    expect(MIGRATION).toContain("@rollback:");
  });

  it("adds customer-agreement fields to transport_bookings", () => {
    for (const f of [
      '"requestedVehicleClass"',
      '"vehicleSubstitutionPolicy"',
      '"allowUpgrade"',
      '"requiredExactVehicleId"',
      '"requiredExactDriverId"',
    ]) expect(MIGRATION, `${f} missing`).toContain(f);
    // 6 substitution policies enforced via CHECK constraint.
    for (const p of [
      "exact_only", "same_class_only", "equivalent_allowed",
      "upgrade_allowed", "operator_approval", "customer_approval",
    ]) expect(MIGRATION, `policy ${p} missing`).toContain(`'${p}'`);
  });

  it("adds time-window fields to transport_bookings", () => {
    for (const f of [
      '"pickupWindowStart"', '"pickupWindowEnd"',
      '"dropoffWindowStart"', '"dropoffWindowEnd"',
      '"fixedAppointmentTime"', '"isFlexibleTime"', "priority",
    ]) expect(MIGRATION, `${f} missing`).toContain(f);
  });

  it("adds driver-rest fields to fleet_drivers", () => {
    expect(MIGRATION).toContain('"restHoursRequired" NUMERIC(4,2) NOT NULL DEFAULT 8');
    expect(MIGRATION).toContain('"lastDutyEndedAt"');
  });

  it("adds time-estimate fields to transport_dispatch_orders", () => {
    for (const f of [
      '"estimatedPrepMinutes"',
      '"estimatedTravelMinutes"',
      '"estimatedLoadingMinutes"',
      '"estimatedUnloadingMinutes"',
      '"estimatedDistanceKm"',
    ]) expect(MIGRATION, `${f} missing`).toContain(f);
  });

  it("creates the 5 new tables (settings, route_estimates, navigation_sessions, itineraries, itinerary_legs)", () => {
    for (const t of [
      "transport_planning_settings",
      "transport_route_estimates",
      "driver_navigation_sessions",
      "transport_itineraries",
      "transport_itinerary_legs",
    ]) expect(MIGRATION, `table ${t} missing`).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
  });

  it("enforces the 4 map providers + 7 navigation statuses", () => {
    for (const p of ["manual_only", "google_maps", "mapbox", "here_maps"]) {
      expect(MIGRATION).toContain(`'${p}'`);
    }
    for (const s of [
      "active", "arrived_pickup", "loaded",
      "arrived_dropoff", "delivered", "ended", "cancelled",
    ]) {
      expect(MIGRATION, `nav status ${s} missing`).toContain(`'${s}'`);
    }
  });

  it("only one ACTIVE navigation session per dispatch order at a time", () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX[\s\S]{0,200}driver_navigation_sessions[\s\S]{0,200}WHERE status NOT IN \('ended', 'cancelled'\)/);
  });
});

describe("#1812 — MapsService abstraction", () => {
  it("file exists + exposes the 4-provider type + RouteEstimate shape", () => {
    expect(existsSync(join(apiSrc, "lib/fleet/mapsService.ts"))).toBe(true);
    expect(MAPS).toContain('"manual_only" | "google_maps" | "mapbox" | "here_maps"');
    expect(MAPS).toContain("isApproximate");
    expect(MAPS).toContain("isCached");
  });

  it("loadPlanningSettings lazy-creates a row when missing", () => {
    expect(MAPS).toMatch(/INSERT INTO transport_planning_settings[\s\S]{0,200}ON CONFLICT/);
  });

  it("estimateRoute reads cache, falls back to manual_only, writes cache", () => {
    expect(MAPS).toContain("readCache");
    expect(MAPS).toContain("writeCache");
    expect(MAPS).toContain("manualEstimate");
    // Haversine + detour factor + kmh.
    expect(MAPS).toContain("haversineMeters");
    expect(MAPS).toMatch(/distance \* 1\.3/);
  });

  it("openExternalNavigationLink supports the 4 providers", () => {
    expect(MAPS).toContain("openExternalNavigationLink");
    expect(MAPS).toContain("www.google.com/maps");
    expect(MAPS).toContain("mapbox.com");
    expect(MAPS).toContain("wego.here.com");
  });
});

describe("#1812 — AssignmentSuggestionEngine", () => {
  it("file exists + exports suggestAssignments", () => {
    expect(existsSync(join(apiSrc, "lib/fleet/assignmentSuggestionEngine.ts"))).toBe(true);
    expect(ENGINE).toContain("export async function suggestAssignments");
  });

  it("scores all 7 factors (capacity / availability / conflict / driverRest / license / distance / agreement)", () => {
    for (const k of [
      "capacityScore", "availabilityScore", "conflictScore",
      "restScore", "licenseScore", "distanceScore", "agreementScore",
    ]) expect(ENGINE, `${k} missing`).toContain(k);
  });

  it("respects requestedVehicleClass + vehicleSubstitutionPolicy from the booking", () => {
    expect(ENGINE).toContain("requestedVehicleClass");
    expect(ENGINE).toContain("vehicleSubstitutionPolicy");
    expect(ENGINE).toContain("allowUpgrade");
    expect(ENGINE).toContain("classesAreEquivalent");
    expect(ENGINE).toContain("isUpgrade");
  });

  it("rest-constraint hard-blocks when hours-since-last-duty < restHoursRequired", () => {
    expect(ENGINE).toMatch(/hoursSinceLastDuty[\s\S]{0,200}restHoursRequired/);
    expect(ENGINE).toContain("ساعات الراحة");
  });

  it("returns Arabic explanations + structured blockers", () => {
    expect(ENGINE).toContain("reasons");
    expect(ENGINE).toContain("blockers");
    expect(ENGINE).toContain("تعارض زمني");
    expect(ENGINE).toContain("سعة المركبة");
  });

  it("uses MapsService for distance scoring (estimateRoute)", () => {
    expect(ENGINE).toContain("MapsService.estimateRoute");
  });

  it("requiredExactVehicleId / requiredExactDriverId are HARD filters", () => {
    expect(ENGINE).toMatch(/requiredExactVehicleId != null[\s\S]{0,80}continue/);
    expect(ENGINE).toMatch(/requiredExactDriverId != null[\s\S]{0,80}continue/);
  });
});

describe("#1812 — driver-rest guard", () => {
  it("file exists + exports assertDriverRest", () => {
    expect(existsSync(join(apiSrc, "lib/fleet/driverRest.ts"))).toBe(true);
    expect(REST).toContain("export async function assertDriverRest");
  });

  it("default 8h rest applies when restHoursRequired is NULL", () => {
    expect(REST).toMatch(/restHoursRequired == null \? 8/);
  });

  it("throws ConflictError when hours-since-last-duty < required", () => {
    expect(REST).toContain("ConflictError");
    expect(REST).toContain("ساعات الراحة المطلوبة");
  });

  it("override path emits fleet.driver.rest.exception event", () => {
    expect(REST).toContain("fleet.driver.rest.exception");
  });

  it("dispatch-order create wires the rest guard", () => {
    expect(TRANSPORT_BOOKINGS).toContain('from "../lib/fleet/driverRest.js"');
    expect(TRANSPORT_BOOKINGS).toMatch(/assertDriverRest\(\{/);
    // Must call rest guard with the right pick-up window.
    expect(TRANSPORT_BOOKINGS).toContain("nextAssignmentStartAt: b.scheduledStartAt");
  });
});

describe("#1812 — planning routes", () => {
  it("router file exists + is mounted under requireModule(fleet)", () => {
    expect(existsSync(join(apiSrc, "routes/transport-planning.ts"))).toBe(true);
    expect(ROUTES_INDEX).toContain("transportPlanningRouter");
    // #1959: gated by the path-conditional fleet+financial transportPathGate.
    expect(ROUTES_INDEX).toContain('const fleetModuleGate = requireModule("fleet")');
    expect(ROUTES_INDEX).toMatch(/router\.use\(transportPathGate\)/);
  });

  it("exposes the 5 planning endpoints", () => {
    expect(PLANNING_ROUTES).toMatch(/\.get\(\s*"\/transport\/planning-settings"/);
    expect(PLANNING_ROUTES).toMatch(/\.patch\(\s*"\/transport\/planning-settings"/);
    expect(PLANNING_ROUTES).toMatch(/\.post\(\s*"\/transport\/bookings\/:id\/suggest-assignment"/);
    expect(PLANNING_ROUTES).toMatch(/\.post\(\s*"\/transport\/bookings\/:id\/estimate-route"/);
    expect(PLANNING_ROUTES).toMatch(/\.get\(\s*"\/transport\/ops-dashboard"/);
  });

  it("exposes itinerary CRUD + leg CRUD", () => {
    expect(PLANNING_ROUTES).toMatch(/\.get\(\s*"\/transport\/itineraries"/);
    expect(PLANNING_ROUTES).toMatch(/\.post\(\s*"\/transport\/itineraries"/);
    expect(PLANNING_ROUTES).toMatch(/\.get\(\s*"\/transport\/itineraries\/:id"/);
    expect(PLANNING_ROUTES).toMatch(/\.patch\(\s*"\/transport\/itineraries\/:id"/);
    expect(PLANNING_ROUTES).toMatch(/\.delete\(\s*"\/transport\/itineraries\/:id"/);
    expect(PLANNING_ROUTES).toMatch(/\.post\(\s*"\/transport\/itineraries\/:id\/legs"/);
    expect(PLANNING_ROUTES).toMatch(/\.patch\(\s*"\/transport\/itineraries\/:id\/legs\/:legId"/);
    expect(PLANNING_ROUTES).toMatch(/\.delete\(\s*"\/transport\/itineraries\/:id\/legs\/:legId"/);
  });

  it("exposes navigation session lifecycle (start / ping / event / complete / get / me)", () => {
    expect(PLANNING_ROUTES).toMatch(/\/transport\/dispatch-orders\/:id\/navigation\/start/);
    expect(PLANNING_ROUTES).toMatch(/\/transport\/dispatch-orders\/:id\/navigation\/ping/);
    expect(PLANNING_ROUTES).toMatch(/\/transport\/dispatch-orders\/:id\/navigation\/event/);
    expect(PLANNING_ROUTES).toMatch(/\/transport\/dispatch-orders\/:id\/navigation\/complete/);
    expect(PLANNING_ROUTES).toMatch(/\.get\(\s*"\/transport\/dispatch-orders\/:id\/navigation"/);
    expect(PLANNING_ROUTES).toMatch(/\.get\(\s*"\/fleet\/driver\/me\/navigation"/);
  });

  it("navigation/complete stamps the driver's lastDutyEndedAt", () => {
    expect(PLANNING_ROUTES).toMatch(/UPDATE fleet_drivers[\s\S]{0,200}"lastDutyEndedAt" = NOW\(\)/);
  });

  it("navigation/ping records a vehicle_location_snapshot for live tracking", () => {
    expect(PLANNING_ROUTES).toMatch(/INSERT INTO vehicle_location_snapshots[\s\S]{0,300}driver_navigation/);
  });
});

describe("#1812 — ops dashboard SPA", () => {
  it("file exists + uses canonical PageShell + FleetTabsNav", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-ops-dashboard.tsx"))).toBe(true);
    expect(OPS_DASHBOARD).toContain("PageShell");
    expect(OPS_DASHBOARD).toContain("FleetTabsNav");
  });

  it("consumes /transport/ops-dashboard with a date query param", () => {
    expect(OPS_DASHBOARD).toMatch(/\/transport\/ops-dashboard\?date=/);
  });

  it("renders all 6 counter cards (total / inProgress / late / completed / unassigned / utilization)", () => {
    expect(OPS_DASHBOARD).toMatch(/إجمالي رحلات اليوم/);
    expect(OPS_DASHBOARD).toMatch(/قيد التنفيذ/);
    expect(OPS_DASHBOARD).toMatch(/متأخر/);
    expect(OPS_DASHBOARD).toMatch(/مكتمل/);
    expect(OPS_DASHBOARD).toMatch(/غير مسند/);
    expect(OPS_DASHBOARD).toMatch(/الاستغلال/);
  });

  it("registered in fleetRoutes at /fleet/transport/ops-dashboard", () => {
    expect(FLEET_ROUTES).toContain("TransportOpsDashboard");
    expect(FLEET_ROUTES).toContain("/fleet/transport/ops-dashboard");
  });
});

describe("#1812 — driver in-app navigation SPA", () => {
  it("file exists + uses canonical PageShell", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/me-driver-navigation.tsx"))).toBe(true);
    expect(DRIVER_NAV).toContain("PageShell");
  });

  it("consumes the driver-me navigation endpoint", () => {
    expect(DRIVER_NAV).toContain("/fleet/driver/me/navigation");
  });

  it("supports the 4 lifecycle event transitions", () => {
    for (const e of ["arrived_pickup", "loaded", "arrived_dropoff", "delivered"]) {
      expect(DRIVER_NAV, `event ${e} missing`).toContain(`event: "${e}"`);
    }
  });

  it("pings GPS via /navigation/ping when the session is active", () => {
    expect(DRIVER_NAV).toMatch(/\/navigation\/ping/);
    expect(DRIVER_NAV).toContain("navigator.geolocation");
  });

  it("driver finance-blackout still holds (no price / cost / invoice / journal labels)", () => {
    expect(DRIVER_NAV).not.toMatch(/(السعر|التكلفة|الفاتورة|القيد|الإيراد)/);
  });

  it("offers the external-maps fallback link", () => {
    expect(DRIVER_NAV).toContain("www.google.com/maps");
    expect(DRIVER_NAV).toMatch(/احتياطي/);
  });

  it("registered in fleetRoutes at /me/driver/navigation", () => {
    expect(FLEET_ROUTES).toContain("MeDriverNavigation");
    expect(FLEET_ROUTES).toContain("/me/driver/navigation");
  });

  it("me-driver dashboard cross-links to the navigation screen", () => {
    expect(ME_DRIVER).toContain("/me/driver/navigation");
  });
});

describe("#1812 — suggest-assignment dialog component", () => {
  it("file exists + consumes the suggest-assignment endpoint", () => {
    expect(existsSync(join(spaSrc, "components/shared/assignment-suggest-dialog.tsx"))).toBe(true);
    // After PR #1839 + leg-source refactor, the URL is constructed via
    // effectiveSource.bookingId — still routes to /transport/bookings/:id.
    expect(SUGGEST_DIALOG).toMatch(/\/transport\/bookings\/\$\{(effectiveSource\.bookingId|bookingId)\}\/suggest-assignment/);
  });

  it("renders score breakdown for all 7 factors", () => {
    for (const k of [
      "capacity", "availability", "conflict",
      "driverRest", "license", "distance", "agreement",
    ]) expect(SUGGEST_DIALOG, `score ${k} missing`).toContain(k);
  });

  it("highlights blockers in red + best-suggestion in green", () => {
    expect(SUGGEST_DIALOG).toContain("blockers");
    expect(SUGGEST_DIALOG).toMatch(/أفضل اقتراح/);
    expect(SUGGEST_DIALOG).toMatch(/اعتمد رغم العوائق/);
  });

  it("booking detail mounts the suggest dialog with the bookingId", () => {
    expect(BOOKING_DETAIL).toContain("AssignmentSuggestDialog");
    expect(BOOKING_DETAIL).toMatch(/اقترح إسناداً/);
  });
});
