import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Transport sub-navigation (القائمة السفلية تحت العلوية) — the second-level
 * nav for the /fleet/transport/* cluster. It is now DERIVED: FleetTabsNav
 * delegates to <ModuleTabsNav>, whose second level renders the active group's
 * pages — so the «النقل والإرسال» group's pages become the transport sub-tab
 * row. The dedicated transport-tabs-nav component is retired; the sidebar
 * registry is the single source these sub-tabs mirror.
 */
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const SUBNAV = readFileSync(join(spaSrc, "components/layout/navigation.registry.ts"), "utf8");
const FLEET_TABS = readFileSync(join(spaSrc, "components/shared/fleet-tabs-nav.tsx"), "utf8");

describe("transport sub-nav (القائمة السفلية)", () => {
  it("the full transport cluster is reachable from the registry (derived sub-tabs)", () => {
    for (const p of ["bookings", "dispatch", "itineraries", "route-patterns", "ops-dashboard", "calendar", "rules", "price-rules", "service-lines", "integration"]) {
      expect(SUBNAV, `transport cluster missing /fleet/transport/${p}`).toContain(`/fleet/transport/${p}`);
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
