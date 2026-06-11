import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 governing comment — "النقل ليس جزيرة". Locks in the
// integration-bridge surface:
//
//   • POST /transport/integration/from-umrah-group/:groupId
//     auto-materializes the 3-leg umrah trip set, idempotent on
//     (umrahGroupId, routeType).
//
//   • GET  /transport/integration/linked-sources
//     lists umrah groups + rental contracts that need transport
//     bookings but don't have any yet.
//
//   • GET  /transport/integration/calendar.ics
//     iCalendar feed for the central calendar.
//
//   • SPA: /fleet/transport/integration page + linked-source banner
//     on the booking detail.

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const ROUTER = readApi("routes/transport-integration.ts");
const ROUTES_INDEX = readApi("routes/index.ts");
const SPA_PAGE = readSpa("pages/fleet/transport-integration.tsx");
const FLEET_ROUTES = readSpa("routes/fleetRoutes.tsx");
const BOOKING_DETAIL = readSpa("pages/fleet/transport-booking-detail.tsx");
const BOOKINGS_LIST = readSpa("pages/fleet/transport-bookings.tsx");

describe("#1812 — integration router exists + is mounted", () => {
  it("file exists + mounts via PR-5a fleetGuards helper (still gates on fleet + financial)", () => {
    expect(existsSync(join(apiSrc, "routes/transport-integration.ts"))).toBe(true);
    expect(ROUTES_INDEX).toContain("transportIntegrationRouter");
    expect(ROUTES_INDEX).toMatch(/router\.use\(fleetGuards\(\),\s*transportIntegrationRouter\)/);
  });

  it("exposes the 3 integration endpoints", () => {
    expect(ROUTER).toMatch(/\.get\(\s*"\/transport\/integration\/linked-sources"/);
    expect(ROUTER).toMatch(/\.post\(\s*"\/transport\/integration\/from-umrah-group\/:groupId"/);
    expect(ROUTER).toMatch(/\.get\(\s*"\/transport\/integration\/calendar\.ics"/);
  });
});

describe("#1812 — from-umrah-group materialization", () => {
  it("creates the standard 3 umrah legs (airport→makkah, makkah→madinah, madinah→airport)", () => {
    for (const leg of [
      "airport_to_makkah", "makkah_to_madinah", "madinah_to_airport",
    ]) {
      expect(ROUTER, `leg ${leg} missing`).toContain(`"${leg}"`);
    }
    expect(ROUTER).toContain("UMRAH_LEGS");
  });

  it("idempotent on (umrahGroupId, routeType) — skips already-existing legs", () => {
    expect(ROUTER).toContain("haveRoutes");
    expect(ROUTER).toContain('haveRoutes.has(leg.routeType)');
    expect(ROUTER).toContain("skipped.push");
  });

  it("inserts bookings with bookingSource='umrah_group' and serviceType='passenger_umrah'", () => {
    expect(ROUTER).toMatch(/'umrah_group'/);
    expect(ROUTER).toMatch(/'passenger_umrah'/);
  });

  it("carries umrahGroupId + passenger count + season-derived dates onto each booking", () => {
    expect(ROUTER).toContain('"umrahGroupId"');
    expect(ROUTER).toContain('"passengerCount"');
    expect(ROUTER).toContain("seasonStartDate");
    expect(ROUTER).toContain("seasonEndDate");
  });

  it("supports a `legs` body filter for partial re-materialization", () => {
    expect(ROUTER).toContain("materializeUmrahSchema");
    expect(ROUTER).toContain("b.legs");
  });

  it("emits fleet.transport.materialized_from_umrah event", () => {
    expect(ROUTER).toContain("fleet.transport.materialized_from_umrah");
  });
});

describe("#1812 — linked-sources view", () => {
  it("returns umrah_groups + rental_contracts in the date window", () => {
    expect(ROUTER).toContain("FROM umrah_groups");
    expect(ROUTER).toContain("FROM fleet_rental_contracts");
  });

  it("computes existingBookings for each source", () => {
    expect(ROUTER).toMatch(/existingBookings/);
    expect(ROUTER).toMatch(/SELECT COUNT[\s\S]{0,400}"umrahGroupId" = g\.id/);
    expect(ROUTER).toMatch(/SELECT COUNT[\s\S]{0,400}"contractId" = c\.id/);
  });

  it("optional fromDate / toDate / sourceType filters supported", () => {
    expect(ROUTER).toContain("fromDate");
    expect(ROUTER).toContain("toDate");
    expect(ROUTER).toContain("sourceType");
  });

  it("rental_contracts query is honest-optional (.catch fallback)", () => {
    // The rental contracts module may not be present in every
    // deployment — fall back gracefully.
    expect(ROUTER).toMatch(/fleet_rental_contracts[\s\S]{0,500}\.catch\(/);
  });
});

describe("#1812 — iCalendar feed", () => {
  it("emits a valid VCALENDAR payload with VEVENT entries", () => {
    expect(ROUTER).toContain("BEGIN:VCALENDAR");
    expect(ROUTER).toContain("END:VCALENDAR");
    expect(ROUTER).toContain("BEGIN:VEVENT");
    expect(ROUTER).toContain("END:VEVENT");
    expect(ROUTER).toMatch(/Content-Type[\s\S]{0,40}text\/calendar/);
  });

  it("escapes special ICS characters", () => {
    expect(ROUTER).toContain("icsEscape");
    expect(ROUTER).toMatch(/\\\\;/);
    expect(ROUTER).toMatch(/\\\\,/);
  });

  it("filters by approved/scheduled/dispatched/in_progress statuses", () => {
    expect(ROUTER).toMatch(/b\.status IN \('approved', 'scheduled', 'dispatched', 'in_progress'\)/);
  });
});

describe("#1812 — integration SPA page", () => {
  it("file exists + uses PageShell + FleetTabsNav", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-integration.tsx"))).toBe(true);
    expect(SPA_PAGE).toContain("PageShell");
    expect(SPA_PAGE).toContain("FleetTabsNav");
  });

  it("consumes the linked-sources endpoint with date filters", () => {
    expect(SPA_PAGE).toContain("/transport/integration/linked-sources");
    expect(SPA_PAGE).toContain("fromDate");
    expect(SPA_PAGE).toContain("toDate");
  });

  it("offers the materialize-umrah-group button + POSTs to the right endpoint", () => {
    expect(SPA_PAGE).toContain("/transport/integration/from-umrah-group/");
    expect(SPA_PAGE).toMatch(/إنشاء حجوزات النقل/);
  });

  it("offers the iCalendar download link", () => {
    expect(SPA_PAGE).toContain("/transport/integration/calendar.ics");
    expect(SPA_PAGE).toMatch(/iCalendar/);
  });

  it("registered in fleetRoutes at /fleet/transport/integration", () => {
    expect(FLEET_ROUTES).toContain("TransportIntegration");
    expect(FLEET_ROUTES).toContain("/fleet/transport/integration");
  });

  it("Arabic-first UI", () => {
    expect(SPA_PAGE).toMatch(/تكامل النقل مع النظام/);
    expect(SPA_PAGE).toMatch(/مجموعات العمرة/);
    expect(SPA_PAGE).toMatch(/عقود تأجير نشطة/);
  });
});

describe("#1812 — booking detail linked-source banner", () => {
  it("shows the source label + jumps back to source entities", () => {
    expect(BOOKING_DETAIL).toContain("SOURCE_LABEL");
    expect(BOOKING_DETAIL).toMatch(/مصدر:/);
    // Cross-links to umrah groups + clients.
    expect(BOOKING_DETAIL).toMatch(/href=\{`\/umrah\/groups\/\$\{b\.umrahGroupId\}`\}/);
    expect(BOOKING_DETAIL).toMatch(/href=\{`\/clients\/\$\{b\.customerId\}`\}/);
  });

  it("BookingDetail interface carries contractId / projectId / waqfId", () => {
    expect(BOOKING_DETAIL).toContain("contractId: number | null");
    expect(BOOKING_DETAIL).toContain("projectId: number | null");
    expect(BOOKING_DETAIL).toContain("waqfId: number | null");
  });

  it("bookings list cross-links to /fleet/transport/integration", () => {
    expect(BOOKINGS_LIST).toContain("/fleet/transport/integration");
    expect(BOOKINGS_LIST).toMatch(/التكامل/);
  });
});
