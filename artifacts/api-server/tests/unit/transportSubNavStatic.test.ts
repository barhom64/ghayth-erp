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

  it("FleetTabsNav derives the transport sub-tabs from the registry (no separate sub-nav component)", () => {
    // The bar mirrors the sidebar via ModuleTabsNav; the «النقل والإرسال» group's
    // pages become the sub-tab row automatically on /fleet/transport routes, so
    // the old hand-mounted TransportTabsNav is gone.
    expect(FLEET_TABS).toMatch(/<ModuleTabsNav\s+section="الأسطول والنقل"/);
    expect(FLEET_TABS).not.toMatch(/inTransport/);
  });
});
