import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1733 Comment 9 — SPA surface for booking + dispatch.
// Locks in:
//   1. Booking list page exists at /fleet/transport/bookings, uses
//      FleetTabsNav, exposes filter by status + serviceType.
//   2. Booking detail page exists at /fleet/transport/bookings/:id,
//      shows lines + dispatch orders, exposes status-transition dropdown.
//   3. Dispatch board exists at /fleet/transport/dispatch, groups by
//      driver, detects overlapping time-window conflicts.
//   4. Fleet tabs nav includes the new "حجوزات النقل" tab.
//   5. Driver UI does NOT carry `cost` in the interface (defence in
//      depth — the backend may return it; the type omits it).

const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const read = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const BOOKINGS_LIST = read("pages/fleet/transport-bookings.tsx");
const BOOKING_DETAIL = read("pages/fleet/transport-booking-detail.tsx");
const DISPATCH_BOARD = read("pages/fleet/transport-dispatch.tsx");
const FLEET_ROUTES = read("routes/fleetRoutes.tsx");
const FLEET_TABS = read("components/shared/fleet-tabs-nav.tsx");
const ME_DRIVER = read("pages/fleet/me-driver.tsx");

describe("#1733 Comment 9 — booking list SPA page", () => {
  it("file exists + uses canonical PageShell + FleetTabsNav", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-bookings.tsx"))).toBe(true);
    expect(BOOKINGS_LIST).toContain("PageShell");
    expect(BOOKINGS_LIST).toContain("FleetTabsNav");
  });

  it("queries the /transport/bookings endpoint + supports status filter", () => {
    expect(BOOKINGS_LIST).toMatch(/\/transport\/bookings/);
    expect(BOOKINGS_LIST).toContain('"all"');
    expect(BOOKINGS_LIST).toContain("statusFilter");
  });

  it("offers all 10 backend booking states + 6 service types as filter values", () => {
    for (const v of [
      "draft", "submitted", "pending_approval", "approved",
      "scheduled", "dispatched", "in_progress", "completed",
      "cancelled", "rejected",
    ]) {
      expect(BOOKINGS_LIST, `status ${v} missing`).toContain(`value: "${v}"`);
    }
    for (const v of [
      "cargo_load", "passenger_umrah", "passenger_general",
      "equipment_rental", "internal_transfer", "other",
    ]) {
      expect(BOOKINGS_LIST, `service type ${v} missing`).toMatch(new RegExp(`["']${v}["']`));
    }
  });

  it("Arabic-first UI (Comment 9 mandate)", () => {
    expect(BOOKINGS_LIST).toMatch(/حجوزات النقل/);
    expect(BOOKINGS_LIST).toMatch(/كل الحالات/);
    expect(BOOKINGS_LIST).toMatch(/نقل معتمرين/);
  });
});

describe("#1733 Comment 9 — booking detail SPA page", () => {
  it("file exists + renders the three sections (info / lines / dispatch orders)", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-booking-detail.tsx"))).toBe(true);
    expect(BOOKING_DETAIL).toContain("سطور الحجز");
    expect(BOOKING_DETAIL).toContain("أوامر التوزيع");
  });

  it("knows all 10 booking states (Arabic labels in ALL_STATUS_LABELS)", () => {
    // #1812 — the operator-driveable Select now hides auto-cascaded
    // states (dispatched/in_progress/completed), so they no longer
    // appear as `value: "..."` literals. But the UI must still know
    // their Arabic labels for the read-only badge. Assert via the
    // unified labels map declared on booking-detail.tsx.
    for (const v of [
      "draft", "submitted", "pending_approval", "approved",
      "scheduled", "dispatched", "in_progress", "completed",
      "cancelled", "rejected",
    ]) {
      expect(BOOKING_DETAIL, `label for ${v} missing from ALL_STATUS_LABELS`)
        .toMatch(new RegExp(`\\b${v}:\\s*"`));
    }
  });

  it("shows umrah-specific fields when serviceType is passenger_umrah", () => {
    expect(BOOKING_DETAIL).toContain("umrahGroupId");
    expect(BOOKING_DETAIL).toContain("flightNumber");
    expect(BOOKING_DETAIL).toContain("hotelName");
    expect(BOOKING_DETAIL).toContain("supervisorName");
  });

  it("hot-links to dispatch board", () => {
    expect(BOOKING_DETAIL).toMatch(/\/fleet\/transport\/dispatch/);
  });
});

describe("#1733 Comment 9 — dispatch board SPA page", () => {
  it("file exists + queries /transport/dispatch-orders with date window", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-dispatch.tsx"))).toBe(true);
    expect(DISPATCH_BOARD).toContain("/transport/dispatch-orders");
    expect(DISPATCH_BOARD).toContain("fromDate");
    expect(DISPATCH_BOARD).toContain("toDate");
  });

  it("groups orders by driverId so each driver gets a column", () => {
    expect(DISPATCH_BOARD).toMatch(/byDriver/);
    expect(DISPATCH_BOARD).toMatch(/Map<number,/);
  });

  it("detects overlapping conflicts (defensive — server already blocks new ones)", () => {
    expect(DISPATCH_BOARD).toContain("conflictRowIds");
    // The conflict-detection compares scheduledEndAt > scheduledStartAt of next.
    expect(DISPATCH_BOARD).toMatch(/scheduledEndAt[\s\S]{0,200}scheduledStartAt/);
    // Conflict rows are visually flagged.
    expect(DISPATCH_BOARD).toMatch(/تعارض/);
  });

  it("renders the 8 dispatch-order statuses with Arabic labels (canonical dict)", () => {
    // UX-05 (TA-T18-UX-AUDIT-01) — لوحة التوزيع تفوّض القاموس الموحّد
    // (lib/transport-status-labels) بدل خريطة محلية كانت تسقط لقيمة خام.
    expect(DISPATCH_BOARD).toMatch(/statusLabel\("dispatch", o\.status\)/);
    const DICT = read("lib/transport-status-labels.ts");
    for (const v of [
      "pending", "notified", "accepted", "declined",
      "executing", "completed", "closed", "cancelled",
    ]) {
      expect(DICT, `status ${v} missing`).toContain(`${v}:`);
    }
  });
});

describe("#1733 — routes + nav integration", () => {
  it("fleetRoutes registers the three new pages", () => {
    expect(FLEET_ROUTES).toContain("/fleet/transport/bookings");
    expect(FLEET_ROUTES).toContain("/fleet/transport/bookings/:id");
    expect(FLEET_ROUTES).toContain("/fleet/transport/dispatch");
    expect(FLEET_ROUTES).toContain("TransportBookings");
    expect(FLEET_ROUTES).toContain("TransportBookingDetail");
    expect(FLEET_ROUTES).toContain("TransportDispatch");
  });

  it("fleet tabs nav links to the transport cluster + mounts the transport sub-nav", () => {
    // Reorganized: the top tab is the "النقل" cluster entry; a dedicated
    // TransportTabsNav (القائمة السفلية) renders under it on transport routes.
    expect(FLEET_TABS).toContain("/fleet/transport/bookings");
    expect(FLEET_TABS).toMatch(/TransportTabsNav/);
  });
});

describe("#1733 — driver UI finance-blackout", () => {
  it("DriverTrip interface does NOT carry `cost`", () => {
    const block = ME_DRIVER.match(/interface DriverTrip\s*\{[\s\S]+?\}/)?.[0];
    expect(block, "DriverTrip interface missing").toBeTruthy();
    expect(block!).not.toContain("cost");
    expect(block!).not.toContain("price");
    expect(block!).not.toContain("revenue");
  });

  it("DriverCargo interface does NOT carry pricing fields", () => {
    const block = ME_DRIVER.match(/interface DriverCargo\s*\{[\s\S]+?\}/)?.[0];
    expect(block, "DriverCargo interface missing").toBeTruthy();
    expect(block!).not.toContain("price");
    expect(block!).not.toContain("revenue");
    expect(block!).not.toContain("invoice");
  });

  it("page renders no price / invoice / journal labels", () => {
    expect(ME_DRIVER).not.toMatch(/(السعر|التكلفة|الفاتورة|القيد|الإيراد)/);
  });
});
