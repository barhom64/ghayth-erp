import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #1812 — real system integration (per user feedback that earlier
// layers only built UI surfaces without wiring them to the actual
// dispatch / driver / umrah lifecycles).

const apiSrc = join(import.meta.dirname!, "../../../../artifacts/api-server/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const BOOKINGS = readApi("routes/transport-bookings.ts");
const LISTENERS = readApi("lib/eventListeners.ts");

describe("#1812 integration — dispatch lifecycle ↔ navigation session", () => {
  it("ACCEPT action lazy-creates a driver_navigation_session", () => {
    expect(BOOKINGS).toMatch(/target === "accepted"[\s\S]{0,2000}INSERT INTO driver_navigation_sessions/);
  });

  it("session insert reads origin/destination from booking_lines + transport_locations", () => {
    expect(BOOKINGS).toMatch(/transport_booking_lines bl[\s\S]{0,300}transport_bookings b[\s\S]{0,400}transport_locations fl[\s\S]{0,200}transport_locations tl/);
  });

  it("provider is read from transport_planning_settings + falls back to manual_only", () => {
    expect(BOOKINGS).toMatch(/COALESCE\(s\."mapProvider", 'manual_only'\)[\s\S]{0,500}transport_planning_settings/);
  });

  it("idempotent — no second session if one is already active", () => {
    expect(BOOKINGS).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM driver_navigation_sessions ns[\s\S]{0,200}status NOT IN \('ended', 'cancelled'\)/);
  });

  it("COMPLETE/CLOSE/CANCEL ends the session", () => {
    expect(BOOKINGS).toMatch(/target === "completed"[\s\S]{0,500}UPDATE driver_navigation_sessions[\s\S]{0,300}"endedAt" = NOW\(\)/);
  });

  it("COMPLETE/CLOSE stamps fleet_drivers.lastDutyEndedAt (feeds rest constraint)", () => {
    expect(BOOKINGS).toMatch(/UPDATE fleet_drivers[\s\S]{0,200}"lastDutyEndedAt" = NOW\(\)/);
  });

  it("CANCEL marks the session 'cancelled' (not 'ended')", () => {
    expect(BOOKINGS).toMatch(/target === "cancelled" \? "cancelled" : "ended"/);
  });

  it("the previously-interpolated companyId is now a real parameter (no template injection)", () => {
    // The original code had: WHERE id = $2 AND "companyId" = ${scope.companyId}
    // which interpolates the value into the SQL string. Fixed to use $3.
    expect(BOOKINGS).not.toMatch(/WHERE id = \$2 AND "companyId" = \$\{scope\.companyId\}/);
    expect(BOOKINGS).toMatch(/WHERE id = \$2 AND "companyId" = \$3/);
  });
});

describe("#1812 integration — umrah → transport event bridge", () => {
  it("registers umrah.group.created listener", () => {
    expect(LISTENERS).toMatch(/eventBus\.on\("umrah\.group\.created"/);
  });

  it("loads the umrah_group + mutamerCount before deciding", () => {
    expect(LISTENERS).toMatch(/SELECT id, "mutamerCount", "nuskGroupNumber"[\s\S]{0,200}FROM umrah_groups/);
  });

  it("skips groups with no pilgrims (mutamerCount <= 0)", () => {
    expect(LISTENERS).toMatch(/mutamerCount <= 0/);
  });

  it("creates a notification for the fleet dispatcher", () => {
    expect(LISTENERS).toMatch(/createNotification\(\{[\s\S]{0,500}مجموعة عمرة جديدة بحاجة لنقل/);
    expect(LISTENERS).toContain("/fleet/transport/integration");
  });

  it("links the notification back to the source umrah_group", () => {
    expect(LISTENERS).toMatch(/refType: "umrah_groups"/);
  });
});
