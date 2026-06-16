import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TR-022 — التقويم الموحَّد التفاعلي (audit doc file 20 §10) navigation
 * discoverability pin.
 *
 * The page (`pages/fleet/transport-calendar.tsx`) and the backend
 * route (`routes/transport-calendar.ts`) were shipped previously,
 * and the route is registered in `fleetRoutes.tsx`. But it was
 * never linked from the side menu — operators could only reach it
 * by typing the URL directly. This PR adds the navigation entry.
 *
 * Static pin (regex-only, per package-locality).
 */

const repoRoot = join(import.meta.dirname!, "../../../..");

const NAV = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);
const ROUTES = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/routes/fleetRoutes.tsx"),
  "utf8",
);
const PAGE = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/transport-calendar.tsx"),
  "utf8",
);

describe("TR-022 — unified transport calendar discoverability", () => {
  it("page file still exists and carries the TR-022 header", () => {
    expect(PAGE).toMatch(/TR-022/);
    expect(PAGE).toMatch(/Unified Transport Calendar/i);
  });

  it("route is registered at /fleet/transport/calendar", () => {
    expect(ROUTES).toMatch(
      /\{\s*path:\s*"\/fleet\/transport\/calendar",\s*component:\s*TransportCalendar/,
    );
  });

  it("navigation registry exposes the calendar in the fleet sub-menu", () => {
    // The entry must point at the canonical SPA route + use the
    // fleet.dispatch:list permission so it shows for dispatchers but
    // not for billing-only roles.
    expect(NAV).toMatch(
      /label:\s*"التقويم الموحَّد للنقل",\s*path:\s*"\/fleet\/transport\/calendar"[\s\S]{0,120}?perm:\s*"fleet\.dispatch:list"/,
    );
  });

  it("the entry mentions TR-022 so future readers find the audit anchor", () => {
    expect(NAV).toMatch(/TR-022[\s\S]{0,400}?label:\s*"التقويم الموحَّد للنقل"/);
  });
});
