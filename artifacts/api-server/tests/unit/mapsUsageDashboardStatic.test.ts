import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * TA-GAP-09 Phase 2 — Maps Quota Dashboard (audit doc file 20 §10).
 *
 * Phase 1 (#2439) shipped the counter writes. Phase 2 (this PR)
 * exposes them through:
 *   1. GET /transport/maps-usage — read endpoint
 *   2. /fleet/maps/usage SPA page — operator dashboard
 *   3. Side-menu entry in the fleet sub-menu
 *
 * Phase 3 (deferred) will add the threshold alert cron once the
 * operator sets a daily/monthly cap.
 *
 * Static pin (regex-only, per package-locality).
 */

const repoRoot = join(import.meta.dirname!, "../../../..");
const ROUTES = readFileSync(
  join(repoRoot, "artifacts/api-server/src/routes/transport-planning.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(repoRoot, "artifacts/ghayth-erp/src/pages/fleet/maps-usage.tsx"),
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

describe("TA-GAP-09 Phase 2 — backend route", () => {
  it("imports the Phase 1 loader (no schema-bypass)", () => {
    expect(ROUTES).toMatch(
      /import\s*\{\s*loadMapsUsage\s*\}\s*from\s+["']\.\.\/lib\/fleet\/mapsUsageCounter\.js["']/,
    );
  });

  it("registers GET /transport/maps-usage with fleet.bookings:view RBAC", () => {
    expect(ROUTES).toMatch(
      /transportPlanningRouter\.get\(\s*"\/transport\/maps-usage",\s*authorize\(\{\s*feature:\s*"fleet\.bookings",\s*action:\s*"view"\s*\}\)/,
    );
  });

  it("the route clamps `days` query param to [1, 366] (matches Phase 1 contract)", () => {
    // Phase 1's loader already clamps; we clamp at the route too so
    // an over-large `?days=99999` doesn't even reach the loader.
    const handler = ROUTES.match(
      /transportPlanningRouter\.get\(\s*"\/transport\/maps-usage"[\s\S]+?\}\s*\)\s*;/,
    );
    expect(handler, "maps-usage handler not found").toBeTruthy();
    // The handler does `Math.min(Math.max(Number(req.query.days ?? 30) || 30, 1), 366)`.
    expect(handler![0]).toMatch(/Math\.min\(Math\.max\(Number\(req\.query\.days/);
    expect(handler![0]).toMatch(/366/);
  });

  it("the response shape is { data: { rows, windowDays } }", () => {
    expect(ROUTES).toMatch(/res\.json\(\s*\{\s*data:\s*\{\s*rows,\s*windowDays:\s*days\s*\}\s*\}\s*\)/);
  });

  it("the route does NOT mutate any maps_usage_daily_counters row (read-only)", () => {
    // Defence-in-depth: Phase 2 is read-only. Counter writes stay in
    // MapsService (Phase 1). If a future change adds an INSERT/UPDATE
    // against the counter table from a route handler, this catches it.
    const handler = ROUTES.match(
      /transportPlanningRouter\.get\(\s*"\/transport\/maps-usage"[\s\S]+?\}\s*\)\s*;/,
    );
    expect(handler).toBeTruthy();
    expect(handler![0]).not.toMatch(/INSERT INTO maps_usage_daily_counters/i);
    expect(handler![0]).not.toMatch(/UPDATE maps_usage_daily_counters/i);
    expect(handler![0]).not.toMatch(/DELETE FROM maps_usage_daily_counters/i);
  });
});

describe("TA-GAP-09 Phase 2 — SPA page", () => {
  it("page file carries the TA-GAP-09 Phase 2 anchor", () => {
    expect(PAGE).toMatch(/TA-GAP-09 Phase 2/);
  });

  it("calls the canonical backend endpoint (no string drift)", () => {
    expect(PAGE).toMatch(/`\/transport\/maps-usage\?days=\$\{days\}`/);
  });

  it("uses useApiQuery with the (key[], path) signature — caches per `days`", () => {
    expect(PAGE).toMatch(/useApiQuery<UsageResponse>\(\s*\[\s*"fleet-maps-usage",\s*String\(days\)\s*\]/);
  });

  it("renders Arabic summary tiles + the breakdown table headers", () => {
    expect(PAGE).toMatch(/إجمالي الاتصالات/);
    expect(PAGE).toMatch(/اتصالات فاشلة/);
    expect(PAGE).toMatch(/أيام بنشاط/);
    expect(PAGE).toMatch(/المزوّدون/);
    // Table headers.
    expect(PAGE).toMatch(/التاريخ/);
    expect(PAGE).toMatch(/المزوّد/);
    expect(PAGE).toMatch(/الواجهة/);
    expect(PAGE).toMatch(/عدد الاتصالات/);
  });

  it("exposes the standard window choices (7, 14, 30, 60, 90)", () => {
    expect(PAGE).toMatch(/\[7,\s*14,\s*30,\s*60,\s*90\]\s*as const/);
  });

  it("default `days` window is 30", () => {
    expect(PAGE).toMatch(/useState<number>\(30\)/);
  });
});

describe("TA-GAP-09 Phase 2 — routing + nav wiring", () => {
  it("router registers /fleet/maps/usage → MapsUsage component", () => {
    expect(FLEET_ROUTES).toMatch(
      /const MapsUsage = lazy\(\(\) => import\("@\/pages\/fleet\/maps-usage"\)\)/,
    );
    expect(FLEET_ROUTES).toMatch(
      /\{\s*path:\s*"\/fleet\/maps\/usage",\s*component:\s*MapsUsage\s*\}/,
    );
  });

  it("navigation registry exposes the page in the fleet sub-menu", () => {
    expect(NAV).toMatch(
      /label:\s*"استهلاك الخرائط",\s*path:\s*"\/fleet\/maps\/usage"[\s\S]{0,80}?perm:\s*"fleet\.bookings:list"/,
    );
  });

  it("the nav entry mentions TA-GAP-09 so future readers find the audit anchor", () => {
    expect(NAV).toMatch(/TA-GAP-09[\s\S]{0,400}?label:\s*"استهلاك الخرائط"/);
  });
});

describe("TA-GAP-09 Phase 2 — boundary intact", () => {
  it("Phase 2 does NOT modify the counter library or the migration", () => {
    // The Phase 1 contract (atomic UPSERT, best-effort writes) stays
    // unchanged. Phase 2 only ADDs a read path.
    const counter = readFileSync(
      join(repoRoot, "artifacts/api-server/src/lib/fleet/mapsUsageCounter.ts"),
      "utf8",
    );
    expect(counter).toMatch(/export async function recordMapsCall\(/);
    expect(counter).toMatch(/export async function loadMapsUsage\(/);
    // Sanity: the atomic UPSERT from Phase 1 still in place.
    expect(counter).toMatch(/ON CONFLICT \("companyId", "callDate", provider, "apiSurface"\)/);
  });

  it("Phase 2 ships NO threshold cron yet (deferred)", () => {
    // The cron job will land separately once the operator sets a cap.
    // If a future change adds a cron handler before that, the
    // listeners file would carry the new key — this catches it.
    const listeners = readFileSync(
      join(repoRoot, "artifacts/api-server/src/lib/cronScheduler.ts"),
      "utf8",
    );
    expect(listeners).not.toMatch(/maps[_-]?usage[_-]?(threshold|alert|cap)/i);
  });
});
