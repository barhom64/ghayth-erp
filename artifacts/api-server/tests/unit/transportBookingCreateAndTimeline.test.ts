import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 follow-up — the two highest-value UI gaps after the 9 PRs landed:
//   1. Booking create form (operator's intake surface).
//   2. Timeline component inside cargo-detail (consumes the
//      /cargo/manifests/:id/timeline endpoint).

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const read = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const CREATE_PAGE = read("pages/fleet/transport-booking-create.tsx");
const CARGO_DETAIL = read("pages/fleet/cargo-detail.tsx");
const TIMELINE_COMP = read("components/shared/cargo-timeline.tsx");
const FLEET_ROUTES = read("routes/fleetRoutes.tsx");

describe("#1733 — booking create form", () => {
  it("file exists + uses canonical PageShell + FleetTabsNav", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-booking-create.tsx"))).toBe(true);
    expect(CREATE_PAGE).toContain("PageShell");
    expect(CREATE_PAGE).toContain("FleetTabsNav");
  });

  it("offers all 6 service types and all 7 booking sources", () => {
    for (const v of [
      "cargo_load", "passenger_umrah", "passenger_general",
      "equipment_rental", "internal_transfer", "other",
    ]) {
      expect(CREATE_PAGE, `service type ${v} missing`).toContain(`value: "${v}"`);
    }
    for (const v of [
      "manual_entry", "customer_request", "umrah_group",
      "contract_schedule", "import_excel", "api_integration",
      "recurring_schedule",
    ]) {
      expect(CREATE_PAGE, `source ${v} missing`).toContain(`value: "${v}"`);
    }
  });

  it("offers the 7 umrah route types (from the shared ROUTE_TYPES source)", () => {
    // UX-05 (TA-T18-UX-AUDIT-01) — ROUTE_TYPES وُحِّد في مصدر مشترك؛ النموذج
    // يستورده بدل تعريفه محليًا، فينتقل ضمان القيم السبع إلى المصدر المشترك.
    expect(CREATE_PAGE).toMatch(/import \{ ROUTE_TYPES \} from "@\/lib\/transport-constants"/);
    expect(CREATE_PAGE).toMatch(/ROUTE_TYPES\.map\(/);
    const ROUTE_SRC = read("lib/transport-constants.ts");
    for (const v of [
      "airport_to_makkah", "makkah_to_madinah", "madinah_to_airport",
      "makkah_local", "madinah_local", "ziyarah", "custom",
    ]) {
      expect(ROUTE_SRC, `route type ${v} missing`).toContain(`value: "${v}"`);
    }
  });

  it("dynamically toggles cargo vs passenger vs umrah field blocks", () => {
    // Three conditionals — service-type-driven field visibility per Comment 9.
    expect(CREATE_PAGE).toMatch(/isCargo\s*=\s*transportServiceType === "cargo_load"/);
    expect(CREATE_PAGE).toMatch(/isUmrah\s*=\s*transportServiceType === "passenger_umrah"/);
    expect(CREATE_PAGE).toMatch(/isPassenger\s*=\s*transportServiceType\.startsWith\("passenger_"\)/);
    // Cargo block guarded by isCargo (JSX block; window covers card header + input).
    expect(CREATE_PAGE).toMatch(/\{isCargo &&[\s\S]{0,1500}cargoDescription/);
    // Umrah-only fields (flightNumber, hotelName, supervisorName, routeType)
    // appear inside an isUmrah block nested inside isPassenger.
    expect(CREATE_PAGE).toMatch(/\{isUmrah &&[\s\S]{0,4000}flightNumber/);
  });

  it("POSTs to /transport/bookings + navigates to detail on success", () => {
    expect(CREATE_PAGE).toMatch(/apiFetch[^(]*\(\s*"\/transport\/bookings"/);
    expect(CREATE_PAGE).toMatch(/navigate\(`\/fleet\/transport\/bookings\/\$\{newId\}`\)/);
  });

  it("Arabic-first UI", () => {
    expect(CREATE_PAGE).toMatch(/حجز نقل جديد/);
    expect(CREATE_PAGE).toMatch(/نوع الخدمة/);
    expect(CREATE_PAGE).toMatch(/إنشاء الحجز/);
  });
});

describe("#1733 — cargo-detail timeline component wired", () => {
  it("CargoTimeline component file exists", () => {
    expect(existsSync(join(spaSrc, "components/shared/cargo-timeline.tsx"))).toBe(true);
  });

  it("consumes /cargo/manifests/:id/timeline", () => {
    expect(TIMELINE_COMP).toMatch(/\/cargo\/manifests\/\$\{manifestId\}\/timeline/);
  });

  it("renders Arabic labels for every key FREIGHT_EVENTS value", () => {
    for (const action of [
      "fleet.cargo.manifest.created",
      "fleet.cargo.ready_for_invoice",
      "fleet.cargo.billing_candidate.created",
      "finance.transport_billing.materialized",
      "fleet.vehicle.capacity.exception",
      "fleet.driver.eligibility.exception",
    ]) {
      expect(TIMELINE_COMP, `label for ${action} missing`).toContain(`"${action}":`);
    }
    // Arabic labels sampled.
    expect(TIMELINE_COMP).toMatch(/تم إنشاء البوليصة/);
    expect(TIMELINE_COMP).toMatch(/جاهزة للمحاسبة/);
    expect(TIMELINE_COMP).toMatch(/تم ترحيل الأثر للمحاسب/);
  });

  it("renders the events with chronological sort + status-change parsing", () => {
    expect(TIMELINE_COMP).toContain("summarizeStatusChange");
    expect(TIMELINE_COMP).toMatch(/from.*to/);
  });

  it("cargo-detail.tsx imports + mounts CargoTimeline", () => {
    expect(CARGO_DETAIL).toContain("CargoTimeline");
    expect(CARGO_DETAIL).toMatch(/<CargoTimeline\s+manifestId=\{m\.id\}/);
  });
});

describe("#1733 — fleetRoutes registration", () => {
  it("transport-booking-create route is registered BEFORE the /:id route", () => {
    expect(FLEET_ROUTES).toContain("TransportBookingCreate");
    expect(FLEET_ROUTES).toContain("/fleet/transport/bookings/create");
    // wouter is order-sensitive: /create must come before /:id or the
    // :id route matches "create" as an id.
    const createIdx = FLEET_ROUTES.indexOf("/fleet/transport/bookings/create");
    const idIdx = FLEET_ROUTES.indexOf("/fleet/transport/bookings/:id");
    expect(createIdx).toBeGreaterThan(0);
    expect(idIdx).toBeGreaterThan(0);
    expect(createIdx, "/create must come before /:id").toBeLessThan(idIdx);
  });
});
