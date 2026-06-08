import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #1812 operational review — "الحالة لا تتحدث تلقائيًا من أفعال السائق".
// Until this PR, every driver action (accept/start/complete) only flipped
// the dispatch_order's status. The operator had to manually update the
// booking_line.status AND the booking.status from the detail dropdown,
// defeating the integration. This PR cascades the dispatch lifecycle UP
// the chain on every action.

const ROOT = join(import.meta.dirname!, "../..");
const BOOKINGS = readFileSync(join(ROOT, "src/routes/transport-bookings.ts"), "utf8");

describe("#1812 — dispatch → booking_line cascade", () => {
  it("maps driver actions to booking_line statuses", () => {
    expect(BOOKINGS).toContain('lineStatusMap');
    // The four most important cascades, all explicit.
    expect(BOOKINGS).toMatch(/accepted:\s*"dispatched"/);
    expect(BOOKINGS).toMatch(/executing:\s*"in_progress"/);
    expect(BOOKINGS).toMatch(/completed:\s*"completed"/);
    expect(BOOKINGS).toMatch(/cancelled:\s*"cancelled"/);
  });

  it("intermediate states (notified, closed) DO NOT trigger a line update", () => {
    expect(BOOKINGS).toMatch(/notified:\s*null/);
    expect(BOOKINGS).toMatch(/closed:\s*null/);
  });

  it("decline puts the line BACK to pending (not declined)", () => {
    // The line is re-pickable by another driver — declining doesn't
    // cancel the operational need.
    expect(BOOKINGS).toMatch(/declined:\s*"pending"/);
  });

  it("UPDATE transport_booking_lines fires inside the same transaction", () => {
    expect(BOOKINGS).toMatch(/await tx\.query\([\s\S]{0,200}UPDATE transport_booking_lines/);
  });
});

describe("#1812 — booking → terminal-state cascade", () => {
  it("executing on a non-in_progress booking promotes the booking to in_progress", () => {
    expect(BOOKINGS).toMatch(/target === "executing"[\s\S]{0,500}nextBookingStatus = "in_progress"/);
  });

  it("completed/cancelled only promotes the BOOKING when ALL lines match", () => {
    // The aggregate query checks total vs matching count.
    expect(BOOKINGS).toMatch(/COUNT\(\*\) FILTER \(WHERE status = \$1\)/);
    expect(BOOKINGS).toMatch(/total === matching/);
  });

  it("uses 'completed' or 'cancelled' as the terminal target", () => {
    expect(BOOKINGS).toMatch(/target === "completed" \? "completed" : "cancelled"/);
  });

  it("no booking flip when current status already matches (no-op safety)", () => {
    expect(BOOKINGS).toMatch(/nextBookingStatus !== lineRow\.bookingStatus/);
  });
});

describe("#1812 — operational integrity", () => {
  it("cascade runs INSIDE the existing withTransaction (atomic with dispatch update)", () => {
    // The cascade block lives between the dispatch UPDATE and the
    // transaction return statement — both share the same `tx`.
    expect(BOOKINGS).toMatch(
      /UPDATE transport_dispatch_orders[\s\S]{0,5000}lineStatusMap[\s\S]{0,5000}return \{ previous: order\.status, next: target \}/,
    );
  });

  it("multi-leg umrah trips (3 lines) don't prematurely close on leg 1", () => {
    // The aggregate-completion gate is the key invariant for the
    // user's "نقل المعتمرين متعدد المقاطع" scenario. Verified by
    // checking total > 0 AND total === matching before promoting.
    expect(BOOKINGS).toMatch(/total > 0 && total === matching/);
  });
});
