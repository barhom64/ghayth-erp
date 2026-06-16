import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — "الحالة لا تتحدث تلقائيًا من أفعال السائق".
// Until #1812, every driver action only flipped the dispatch_order status; the
// operator had to manually update booking_line.status AND booking.status from
// the detail dropdown, defeating the integration. The cascade now propagates
// the dispatch lifecycle UP the chain on every action.
//
// #12 extracted that cascade into lib/transportDispatchCascade so the fleet
// trip-completion path reuses the IDENTICAL rules instead of a second copy.
// These tests therefore pin the rules in the shared helper and verify both
// call sites (the dispatch board + fleet trip completion) delegate to it.

const ROOT = join(import.meta.dirname!, "../..");
const BOOKINGS = readFileSync(join(ROOT, "src/routes/transport-bookings.ts"), "utf8");
const CASCADE = readFileSync(join(ROOT, "src/lib/transportDispatchCascade.ts"), "utf8");
const FLEET = readFileSync(join(ROOT, "src/routes/fleet.ts"), "utf8");

describe("#1812 — dispatch → booking_line cascade (shared helper)", () => {
  it("maps driver actions to booking_line statuses", () => {
    expect(CASCADE).toContain('lineStatusMap');
    // The four most important cascades, all explicit.
    expect(CASCADE).toMatch(/accepted:\s*"dispatched"/);
    expect(CASCADE).toMatch(/executing:\s*"in_progress"/);
    expect(CASCADE).toMatch(/completed:\s*"completed"/);
    expect(CASCADE).toMatch(/cancelled:\s*"cancelled"/);
  });

  it("intermediate states (notified, closed) DO NOT trigger a line update", () => {
    expect(CASCADE).toMatch(/notified:\s*null/);
    expect(CASCADE).toMatch(/closed:\s*null/);
  });

  it("decline puts the line BACK to pending (not declined)", () => {
    // The line is re-pickable by another driver — declining doesn't
    // cancel the operational need.
    expect(CASCADE).toMatch(/declined:\s*"pending"/);
  });

  it("UPDATE transport_booking_lines fires on the caller's transaction client", () => {
    expect(CASCADE).toMatch(/await client\.query\([\s\S]{0,200}UPDATE transport_booking_lines/);
  });
});

describe("#1812 — booking → terminal-state cascade (shared helper)", () => {
  it("executing on a non-in_progress booking promotes the booking to in_progress", () => {
    expect(CASCADE).toMatch(/target === "executing"[\s\S]{0,500}nextBookingStatus = "in_progress"/);
  });

  it("completed/cancelled only promotes the BOOKING when ALL lines match", () => {
    // The aggregate query checks total vs matching count.
    expect(CASCADE).toMatch(/COUNT\(\*\) FILTER \(WHERE status = \$1\)/);
    expect(CASCADE).toMatch(/total === matching/);
  });

  it("uses 'completed' or 'cancelled' as the terminal target", () => {
    expect(CASCADE).toMatch(/target === "completed" \? "completed" : "cancelled"/);
  });

  it("no booking flip when current status already matches (no-op safety)", () => {
    expect(CASCADE).toMatch(/nextBookingStatus !== lineRow\.bookingStatus/);
  });
});

describe("#1812 / #12 — single source of truth, atomic at both call sites", () => {
  it("dispatch board delegates to the helper between the dispatch UPDATE and the tx return", () => {
    // Same `tx` → the cascade is atomic with the dispatch-order update. The
    // window between the UPDATE and the helper is generous: the cancel branch
    // also runs the top-down trip-cancel cascade in this span, all on `tx`.
    expect(BOOKINGS).toMatch(
      /UPDATE transport_dispatch_orders[\s\S]{0,7000}cascadeDispatchToBooking\(tx, \{[\s\S]{0,2000}return \{ previous: order\.status, next: target \}/,
    );
  });

  it("fleet trip-completion delegates to the SAME helper on its transition client", () => {
    // Atomic with the trip → completed transition (runs in onApply's client).
    expect(FLEET).toMatch(/cascadeDispatchToBooking\(client, \{[\s\S]{0,120}target: "completed"/);
  });

  it("multi-leg umrah trips (3 lines) don't prematurely close on leg 1", () => {
    // The aggregate-completion gate is the key invariant for the user's
    // "نقل المعتمرين متعدد المقاطع" scenario: total > 0 AND total === matching
    // before promoting the booking.
    expect(CASCADE).toMatch(/total > 0 && total === matching/);
  });
});

// Booking-cancel policy — completing the top of the cancel hierarchy. The
// bottom-up cascade (above) flips booking states FROM driver/dispatch actions;
// the dispatch board's top-down cancel (#2463) releases a single order's trip.
// This closes the last gap: cancelling the BOOKING itself. Because force-
// cancelling a booking with a driver already en route is a strong action, the
// behaviour is a configurable company preference (key fleet.bookings.cancelPolicy)
// rather than hardcoded — "guard" (safe default) or "cascade".
describe("booking-cancel policy (configurable top-down cancel)", () => {
  it("resolves the company preference from the 3-level settings engine, default guard", () => {
    expect(BOOKINGS).toMatch(/resolveSettings\(\s*["']fleet\.bookings\.cancelPolicy["']/);
    // anything that isn't an explicit "cascade" opt-in stays on the safe guard.
    expect(BOOKINGS).toMatch(/rawPolicy === "cascade" \? "cascade" : "guard"/);
    // only fires when the booking actually transitions INTO cancelled.
    expect(BOOKINGS).toMatch(/b\.status === "cancelled" && existing\.status !== "cancelled"/);
  });

  it("guard policy refuses the cancel while an active dispatch order exists", () => {
    const block = BOOKINGS.match(/if \(policy === "guard"\) \{[\s\S]{0,900}/)?.[0] ?? "";
    // counts only the LIVE dispatch states — terminal ones can't orphan anything.
    expect(block).toMatch(/status IN \('pending', 'notified', 'accepted', 'executing'\)/);
    expect(block).toMatch(/active > 0/);
    expect(block).toMatch(/ConflictError/);
    expect(block).toMatch(/لا يمكن إلغاء الحجز/);
  });

  it("cascade policy cancels orders → trips → lines → booking atomically", () => {
    // The whole top-down cancel runs inside ONE withTransaction so a mid-cascade
    // failure rolls back the booking flip too.
    const block =
      BOOKINGS.match(/\/\/ "cascade" — do the whole top-down[\s\S]{0,3200}bookingUpdateDone = true/)?.[0] ?? "";
    expect(block).toMatch(/withTransaction\(async \(tx\)/);
    // selects the active orders FOR UPDATE …
    expect(block).toMatch(/FROM transport_dispatch_orders[\s\S]{0,200}FOR UPDATE/);
    // … then per order: cancel it, end its nav session …
    expect(block).toMatch(/UPDATE transport_dispatch_orders[\s\S]{0,120}status = 'cancelled'/);
    expect(block).toMatch(/driver_navigation_sessions[\s\S]{0,120}status = 'cancelled'/);
    // … reusing the SAME trip-cancel + resource-release helper as the board …
    expect(block).toMatch(/cancelTripsForDispatchOrder\(tx, \{/);
    expect(block).toMatch(/cascadeDispatchToBooking\(tx, \{[\s\S]{0,120}target: "cancelled"/);
    // pending legs with no order are cancelled too; completed legs survive.
    expect(block).toMatch(/UPDATE transport_booking_lines[\s\S]{0,220}status NOT IN \('completed', 'cancelled'\)/);
    // the booking row itself is updated on the SAME tx client.
    expect(block).toMatch(/tx\.query\(bookingUpdateSql, params\)/);
  });

  it("imports the shared helpers (no inline duplication of the cascade)", () => {
    expect(BOOKINGS).toMatch(
      /import \{ cascadeDispatchToBooking, cancelTripsForDispatchOrder \} from "\.\.\/lib\/transportDispatchCascade\.js"/,
    );
    expect(BOOKINGS).toMatch(/import \{ resolveSettings \} from "\.\.\/lib\/settings\.js"/);
  });
});
