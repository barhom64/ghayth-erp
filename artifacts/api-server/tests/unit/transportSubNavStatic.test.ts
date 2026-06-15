import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Transport sub-navigation (القائمة السفلية تحت العلوية) — a second-level
 * nav for the /fleet/transport/* cluster, rendered under FleetTabsNav
 * (mirroring the telematics sub-nav). It gathers the transport surfaces
 * into one pipeline-ordered bar so the operator moves within transport
 * without bouncing back to the top fleet tabs.
 */
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const SUBNAV = readFileSync(join(spaSrc, "components/shared/transport-tabs-nav.tsx"), "utf8");
const FLEET_TABS = readFileSync(join(spaSrc, "components/shared/fleet-tabs-nav.tsx"), "utf8");

describe("transport sub-nav (القائمة السفلية)", () => {
  it("exports TransportTabsNav covering the full transport cluster", () => {
    expect(SUBNAV).toMatch(/export function TransportTabsNav/);
    for (const p of ["bookings", "dispatch", "itineraries", "route-patterns", "ops-dashboard", "calendar", "rules", "price-rules", "service-lines", "integration"]) {
      expect(SUBNAV, `sub-nav missing /fleet/transport/${p}`).toContain(`/fleet/transport/${p}`);
    }
  });

  it("FleetTabsNav mounts the sub-nav only on the transport cluster", () => {
    expect(FLEET_TABS).toMatch(/import \{ TransportTabsNav \} from "\.\/transport-tabs-nav"/);
    expect(FLEET_TABS).toMatch(/location\.startsWith\("\/fleet\/transport"\)/);
    expect(FLEET_TABS).toMatch(/inTransport && <TransportTabsNav \/>/);
  });
});
