import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Control Tower (audit doc file 22 + #1812) — single-page operator
 * dashboard. One-shot snapshot of fleet state via
 * GET /transport/control-tower.
 *
 * Static pins:
 *   1. Backend route registered with the right RBAC.
 *   2. Late/critical thresholds match the operator brief
 *      (late = 15 min past scheduledStartAt with startedAt IS NULL,
 *       critical = pending/notified within next 2h).
 *   3. Bookings unassigned predicate uses NOT EXISTS against
 *      transport_dispatch_orders (declined/cancelled excluded).
 *   4. Asia/Riyadh time zone is used for day boundaries.
 *   5. SPA page exists at the canonical path.
 *   6. Side-menu entry is present + RBAC matches.
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const ROUTES = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/transport-planning.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/transport-control-tower.tsx"),
  "utf8",
);
const FLEET_ROUTES = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/routes/fleetRoutes.tsx"),
  "utf8",
);
const NAV = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/components/layout/navigation.registry.ts"),
  "utf8",
);

describe("Control Tower — backend route", () => {
  it("GET /transport/control-tower registered with fleet.dispatch:list RBAC", () => {
    expect(ROUTES).toMatch(
      /transportPlanningRouter\.get\(\s*"\/transport\/control-tower",\s*authorize\(\{\s*feature:\s*"fleet\.dispatch",\s*action:\s*"list"\s*\}\)/,
    );
  });

  it("uses Asia/Riyadh for the date boundary", () => {
    expect(ROUTES).toMatch(/timeZone:\s*"Asia\/Riyadh"/);
    expect(ROUTES).toMatch(/AT TIME ZONE 'Asia\/Riyadh'/);
  });

  it("`late` predicate: scheduledStartAt + 15min < NOW(), startedAt IS NULL, in flight", () => {
    expect(ROUTES).toMatch(
      /COUNT\(\*\)\s*FILTER\s*\(WHERE status IN \('accepted','executing'\)[\s\S]+?"startedAt" IS NULL[\s\S]+?"scheduledStartAt" \+ INTERVAL '15 minutes' < NOW\(\)\)::int\s+AS\s+late/,
    );
  });

  it("`critical` predicate: pending/notified within the next 2 hours", () => {
    expect(ROUTES).toMatch(
      /COUNT\(\*\)\s*FILTER\s*\(WHERE status IN \('pending','notified'\)[\s\S]+?"scheduledStartAt" > NOW\(\)[\s\S]+?"scheduledStartAt" < NOW\(\) \+ INTERVAL '2 hours'\)::int\s+AS\s+critical/,
    );
  });

  it("`unassigned` bookings predicate: NOT EXISTS, excludes declined/cancelled dispatch orders", () => {
    expect(ROUTES).toMatch(
      /NOT EXISTS \(\s*SELECT 1 FROM transport_dispatch_orders d[\s\S]+?d\.status NOT IN \('declined','cancelled'\)/,
    );
  });

  it("response shape carries the 5 snapshot sections + alerts array", () => {
    expect(ROUTES).toMatch(/res\.json\(\s*\{\s*data:\s*\{[\s\S]+?date:\s*day,[\s\S]+?vehicles:\s*vehiclesRow,[\s\S]+?drivers:\s*driversRow,[\s\S]+?dispatches:\s*dispatchesRow,[\s\S]+?bookings:\s*bookingsRow,[\s\S]+?alerts/);
  });
});

describe("Control Tower — SPA page", () => {
  it("calls the canonical endpoint with the date param", () => {
    expect(PAGE).toMatch(/`\/transport\/control-tower\?date=\$\{date\}`/);
  });

  it("date defaults to today in Asia/Riyadh", () => {
    expect(PAGE).toMatch(/timeZone:\s*"Asia\/Riyadh"/);
  });

  it("renders the five sections + arabic labels", () => {
    expect(PAGE).toMatch(/التنبيهات التشغيلية/);
    expect(PAGE).toMatch(/المركبات/);
    expect(PAGE).toMatch(/السائقون/);
    expect(PAGE).toMatch(/رحلات اليوم/);
    expect(PAGE).toMatch(/حجوزات اليوم/);
  });

  it("deep-links to /fleet/transport/dispatch and /bookings", () => {
    expect(PAGE).toMatch(/href="\/fleet\/transport\/dispatch"/);
    expect(PAGE).toMatch(/href="\/fleet\/transport\/bookings"/);
  });
});

describe("Control Tower — routing + nav", () => {
  it("router registers /fleet/transport/control-tower → TransportControlTower", () => {
    expect(FLEET_ROUTES).toMatch(
      /const TransportControlTower = lazy\(\(\) => import\("@\/pages\/fleet\/transport-control-tower"\)\)/,
    );
    expect(FLEET_ROUTES).toMatch(
      /\{\s*path:\s*"\/fleet\/transport\/control-tower",\s*component:\s*TransportControlTower\s*\}/,
    );
  });

  it("nav entry exists with fleet.dispatch:list perm", () => {
    expect(NAV).toMatch(
      /label:\s*"برج المراقبة",\s*path:\s*"\/fleet\/transport\/control-tower"[\s\S]{0,80}?perm:\s*"fleet\.dispatch:list"/,
    );
  });
});
