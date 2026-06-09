import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 follow-up — Control Tower.
//
// User's evaluation: "Control Tower — هذه بالنسبة لي أهم شاشة ناقصة."
//
// One backend endpoint returning the entire fleet state, one SPA page
// rendering it as the operator's daily landing surface.

const apiSrc = join(import.meta.dirname!, "../../src");
const spaSrc = join(import.meta.dirname!, "../../../../artifacts/ghayth-erp/src");
const readApi = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");
const readSpa = (rel: string) => readFileSync(join(spaSrc, rel), "utf8");

const ROUTER = readApi("routes/transport-control-tower.ts");
const INDEX  = readApi("routes/index.ts");
const PAGE   = readSpa("pages/fleet/transport-control-tower.tsx");
const ROUTES = readSpa("routes/fleetRoutes.tsx");

describe("#1812 — Control Tower backend endpoint", () => {
  it("file exists at the canonical route path", () => {
    expect(existsSync(join(apiSrc, "routes/transport-control-tower.ts"))).toBe(true);
  });

  it("registers GET /transport/control-tower with dispatch:list gating", () => {
    expect(ROUTER).toMatch(/transportControlTowerRouter\.get\(\s*\n?\s*"\/transport\/control-tower"/);
    expect(ROUTER).toMatch(/authorize\(\{ feature: "fleet\.dispatch", action: "list" \}\)/);
  });

  it("validates date as YYYY-MM-DD or rejects", () => {
    expect(ROUTER).toMatch(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\//);
    expect(ROUTER).toMatch(/date يجب أن يكون بصيغة YYYY-MM-DD/);
  });

  it("vehicles snapshot counts: total + 5 status buckets + utilizationRate", () => {
    expect(ROUTER).toMatch(/COUNT\(\*\) FILTER \(WHERE status = 'available'\)/);
    expect(ROUTER).toMatch(/COUNT\(\*\) FILTER \(WHERE status = 'in_use'\)/);
    expect(ROUTER).toMatch(/COUNT\(\*\) FILTER \(WHERE status = 'maintenance'\)/);
    expect(ROUTER).toMatch(/COUNT\(\*\) FILTER \(WHERE status = 'off_duty'\)/);
    expect(ROUTER).toMatch(/COUNT\(\*\) FILTER \(WHERE status = 'suspended'\)/);
    expect(ROUTER).toMatch(/utilizationRate/);
  });

  it("drivers snapshot counts the 5 status buckets + availabilityRate", () => {
    expect(ROUTER).toMatch(/availabilityRate/);
    // on_duty + on_rest + on_leave + suspended (active is default)
    expect(ROUTER).toMatch(/COUNT\(\*\) FILTER \(WHERE status = 'on_duty'\)/);
    expect(ROUTER).toMatch(/status = 'on_rest' OR status = 'on_trip'/);
    expect(ROUTER).toMatch(/status = 'on_leave' OR status = 'off_duty'/);
  });

  it("today's dispatches: status buckets + late + critical", () => {
    expect(ROUTER).toMatch(/lateCount/);
    expect(ROUTER).toMatch(/criticalCount/);
    // late = accepted/executing past scheduledStartAt + 15min, no startedAt
    expect(ROUTER).toMatch(/status IN \('accepted', 'executing'\)[\s\S]{0,200}NOW\(\) - INTERVAL '15 minutes'/);
    expect(ROUTER).toMatch(/"startedAt" IS NULL/);
    // critical = pending/notified within 2h of pickup
    expect(ROUTER).toMatch(/status IN \('pending', 'notified'\)[\s\S]{0,200}NOW\(\) \+ INTERVAL '2 hours'/);
  });

  it("today's dispatch query uses Riyadh time zone for date matching", () => {
    expect(ROUTER).toMatch(/DATE\("scheduledStartAt" AT TIME ZONE 'Asia\/Riyadh'\) = \$2::date/);
  });

  it("today's bookings: status buckets + unassigned (no dispatch order)", () => {
    expect(ROUTER).toMatch(/unassignedTodayCount/);
    expect(ROUTER).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM transport_dispatch_orders d/);
    expect(ROUTER).toMatch(/d\.status NOT IN \('declined', 'cancelled'\)/);
  });

  it("synthesizes alerts: late / unassigned / critical / no_capacity / no_drivers / utilization", () => {
    for (const kind of [
      "late_dispatches",
      "unassigned_bookings",
      "critical_window",
      "no_capacity",
      "no_active_drivers",
      "all_drivers_resting",
      "high_utilization",
      "low_utilization",
    ]) {
      expect(ROUTER, `alert kind ${kind} missing`).toMatch(new RegExp(`kind: "${kind}"`));
    }
  });

  it("alert severities are 3-valued: info / warn / critical", () => {
    expect(ROUTER).toMatch(/severity: "critical"/);
    expect(ROUTER).toMatch(/severity: "warn"/);
    expect(ROUTER).toMatch(/severity: "info"/);
  });

  it("router mounted in index.ts with fleet+financial guards", () => {
    expect(INDEX).toContain("transportControlTowerRouter");
    expect(INDEX).toMatch(/router\.use\(requireModule\("fleet"\), requireGuards\("financial"\), transportControlTowerRouter\)/);
  });
});

describe("#1812 — Control Tower SPA page", () => {
  it("file exists at /fleet/transport/control-tower", () => {
    expect(existsSync(join(spaSrc, "pages/fleet/transport-control-tower.tsx"))).toBe(true);
  });

  it("uses Riyadh wall-clock for date default (todayLocal helper)", () => {
    expect(PAGE).toMatch(/timeZone: "Asia\/Riyadh"/);
    expect(PAGE).toMatch(/Intl\.DateTimeFormat\("en-CA"/);
  });

  it("queries /transport/control-tower with date param", () => {
    expect(PAGE).toMatch(/\/transport\/control-tower\?date=\$\{date\}/);
  });

  it("renders 4 sections: alerts, vehicles, drivers, dispatches, bookings", () => {
    expect(PAGE).toMatch(/تنبيهات تشغيلية/);
    expect(PAGE).toMatch(/المركبات/);
    expect(PAGE).toMatch(/السائقون/);
    expect(PAGE).toMatch(/رحلات اليوم/);
    expect(PAGE).toMatch(/حجوزات اليوم/);
  });

  it("Arabic alert severity labels: critical → حرج, warn → تنبيه, info → ملاحظة", () => {
    expect(PAGE).toMatch(/critical:[\s\S]{0,300}"حرج"/);
    expect(PAGE).toMatch(/warn:[\s\S]{0,300}"تنبيه"/);
    expect(PAGE).toMatch(/info:[\s\S]{0,300}"ملاحظة"/);
  });

  it("utilization bar color thresholds (red ≥90, amber ≥70, green ≥30, blue < 30)", () => {
    expect(PAGE).toMatch(/rate >= 90 \? "bg-rose-500"/);
    expect(PAGE).toMatch(/rate >= 70 \? "bg-status-warning-foreground"/);
    expect(PAGE).toMatch(/rate >= 30 \? "bg-status-success-foreground"/);
  });

  it("celebratory empty state when alerts.length === 0", () => {
    expect(PAGE).toMatch(/لا توجد تنبيهات تشغيلية — كل شيء يسير حسب الخطة/);
  });

  it("deep-links to dispatch board + bookings list", () => {
    expect(PAGE).toMatch(/href="\/fleet\/transport\/dispatch"/);
    expect(PAGE).toMatch(/href="\/fleet\/transport\/bookings"/);
  });

  it("manual refresh button + spinner during isFetching", () => {
    expect(PAGE).toMatch(/onClick=\{\(\) => refetch\(\)\}/);
    expect(PAGE).toMatch(/isFetching \? "animate-spin" : ""/);
  });
});

describe("#1812 — Control Tower route registered", () => {
  it("fleetRoutes.tsx imports + maps /fleet/transport/control-tower", () => {
    expect(ROUTES).toContain("TransportControlTower");
    expect(ROUTES).toContain("/fleet/transport/control-tower");
  });
});
