import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TR-022 — unified transport calendar (static, regex-only).
 *
 * Pins the contract points the feature must hold without booting the
 * server or a DB:
 *   1. The new route file aggregates the five expected layers, each
 *      against its verified date column, with the umrah-identical
 *      { data, layers, window } response shape + 366-day cap.
 *   2. The endpoint is RBAC-gated on fleet.dispatch:list.
 *   3. The router is imported + mounted in routes/index.ts.
 *   4. The SPA page + route + tab are wired.
 *
 * Per the package-locality rule: this test lives in api-server and reads
 * the SPA files as plain text — never imports SPA runtime.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/transport-calendar.ts"),
  "utf8",
);
const INDEX = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/index.ts"),
  "utf8",
);
const SPA_ROUTES = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/routes/fleetRoutes.tsx"),
  "utf8",
);
const TABS = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/components/shared/fleet-tabs-nav.tsx"),
  "utf8",
);
const SUBNAV = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/components/shared/transport-tabs-nav.tsx"),
  "utf8",
);
void TABS;

/* ── 1. Route aggregates the five layers ─────────────────────── */

describe("TR-022 — transport-calendar route layers", () => {
  it("declares exactly the five expected layers in CALENDAR_LAYER_META", () => {
    for (const layer of ["booking", "dispatch", "maintenance", "rental", "cargo"]) {
      expect(ROUTE, `layer ${layer} missing from meta`)
        .toMatch(new RegExp(`\\b${layer}:\\s*\\{\\s*label:`));
    }
  });

  it("queries each layer against its verified date column", () => {
    expect(ROUTE).toMatch(/transport_bookings[\s\S]*?"requestedPickupDate"/);
    expect(ROUTE).toMatch(/transport_dispatch_orders[\s\S]*?"scheduledStartAt"/);
    expect(ROUTE).toMatch(/fleet_vehicles[\s\S]*?"registrationExpiry"/);
    expect(ROUTE).toMatch(/fleet_vehicles[\s\S]*?"inspectionExpiry"/);
    expect(ROUTE).toMatch(/fleet_rental_contracts[\s\S]*?"startDate"/);
    expect(ROUTE).toMatch(/fleet_rental_contracts[\s\S]*?"endDate"/);
    expect(ROUTE).toMatch(/cargo_manifests[\s\S]*?"pickupDate"/);
    expect(ROUTE).toMatch(/cargo_manifests[\s\S]*?"deliveryDate"/);
  });

  it("excludes dead rows on the status-driven layers", () => {
    // dispatch has no deletedAt — must use status exclusion.
    expect(ROUTE).toMatch(/transport_dispatch_orders[\s\S]*?status NOT IN \('declined', 'cancelled'\)/);
    expect(ROUTE).toMatch(/transport_bookings[\s\S]*?status NOT IN \('cancelled', 'rejected'\)/);
  });

  it("returns the umrah-identical { data, layers, window } shape", () => {
    expect(ROUTE).toMatch(/res\.json\(\s*\{[\s\S]*?data:\s*events[\s\S]*?layers:\s*CALENDAR_LAYER_META[\s\S]*?window:/);
  });

  it("keeps the 366-day window cap + from/to validation", () => {
    expect(ROUTE).toMatch(/days > 366/);
    expect(ROUTE).toMatch(/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
  });

  it("supports the layers= whitelist param", () => {
    expect(ROUTE).toMatch(/req\.query\.layers/);
    expect(ROUTE).toMatch(/ALL_LAYERS/);
  });
});

/* ── 2. RBAC ─────────────────────────────────────────────────── */

describe("TR-022 — RBAC gate", () => {
  it("GET /transport/calendar/events authorizes on fleet.dispatch:list", () => {
    expect(ROUTE).toMatch(
      /"\/transport\/calendar\/events"\s*,\s*authorize\(\s*\{\s*feature:\s*"fleet\.dispatch"\s*,\s*action:\s*"list"\s*\}/,
    );
  });
});

/* ── 3. Registered in index.ts ───────────────────────────────── */

describe("TR-022 — router registered in index.ts", () => {
  it("imports transportCalendarRouter from ./transport-calendar.js", () => {
    expect(INDEX).toMatch(
      /import\s*\{\s*transportCalendarRouter\s*\}\s*from\s*"\.\/transport-calendar\.js"/,
    );
  });
  it("mounts transportCalendarRouter", () => {
    expect(INDEX).toMatch(/router\.use\(\s*transportCalendarRouter\s*\)/);
  });
});

/* ── 4. SPA wiring ───────────────────────────────────────────── */

describe("TR-022 — SPA route + tab wired", () => {
  it("lazy-imports the transport-calendar page", () => {
    expect(SPA_ROUTES).toMatch(
      /lazy\(\s*\(\)\s*=>\s*import\(\s*"@\/pages\/fleet\/transport-calendar"\s*\)\s*\)/,
    );
  });
  it("registers the /fleet/transport/calendar route", () => {
    expect(SPA_ROUTES).toMatch(
      /\{\s*path:\s*"\/fleet\/transport\/calendar"\s*,\s*component:\s*TransportCalendar\s*\}/,
    );
  });
  it("the calendar route precedes the /fleet/:id catch-all", () => {
    const calIdx = SPA_ROUTES.indexOf('"/fleet/transport/calendar"');
    const catchIdx = SPA_ROUTES.search(/path:\s*"\/fleet\/:id"/);
    expect(calIdx).toBeGreaterThan(-1);
    expect(catchIdx).toBeGreaterThan(-1);
    expect(calIdx).toBeLessThan(catchIdx);
  });
  it("surfaces the calendar in the transport sub-nav (القائمة السفلية)", () => {
    // Calendar moved from the top fleet tabs into the transport sub-nav
    // (TransportTabsNav) to avoid the dual-active-tab overlap.
    expect(SUBNAV).toMatch(/href:\s*"\/fleet\/transport\/calendar"/);
  });
});
