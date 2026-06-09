import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// #1812 follow-up — Driver Intelligence.
//
// User: "السائق ما زال منفذ. أنا أريد:
//          سائق ممتاز للعمرة
//          سائق ممتاز للحمولات
//          سائق يتأخر كثيرًا
//          سائق ينجز أكثر
//        ثم يدخل ذلك في الاقتراح."

const apiSrc = join(import.meta.dirname!, "../../src");
const read = (rel: string) => readFileSync(join(apiSrc, rel), "utf8");

const LIB    = read("lib/fleet/driverIntelligence.ts");
const ROUTER = read("routes/fleet-driver-intelligence.ts");
const INDEX  = read("routes/index.ts");

describe("#1812 — driverIntelligence library", () => {
  it("file exists at the canonical lib path", () => {
    expect(existsSync(join(apiSrc, "lib/fleet/driverIntelligence.ts"))).toBe(true);
  });

  it("exports computeDriverIntelligence + computeFleetIntelligence", () => {
    expect(LIB).toMatch(/export async function computeDriverIntelligence/);
    expect(LIB).toMatch(/export async function computeFleetIntelligence/);
  });

  it("DriverIntelligenceStats carries every required metric", () => {
    for (const f of [
      "driverId", "dispatchCount", "startRate", "completionRate",
      "onTimeRate", "avgLateMinutes", "serviceMix", "reputationScore", "specialty",
    ]) {
      expect(LIB, `field ${f} missing`).toContain(f);
    }
  });

  it("specialty alphabet: umrah / cargo / passenger / mixed / new", () => {
    for (const s of ['"umrah"', '"cargo"', '"passenger"', '"mixed"', '"new"']) {
      expect(LIB, `specialty ${s} missing`).toContain(s);
    }
  });

  it("counts: total / accepted / started / completed / onTime / sumLate / countLate", () => {
    expect(LIB).toMatch(/COUNT\(\*\) FILTER \(WHERE "acceptedAt" IS NOT NULL\) AS accepted/);
    expect(LIB).toMatch(/COUNT\(\*\) FILTER \(WHERE "startedAt" IS NOT NULL\)\s+AS started/);
    expect(LIB).toMatch(/COUNT\(\*\) FILTER[\s\S]{0,200}"completedAt" IS NOT NULL AND status != 'cancelled'/);
    expect(LIB).toMatch(/"scheduledStartAt" \+ INTERVAL '15 minutes'/);
  });

  it("service mix joins dispatch back through booking by transportServiceType", () => {
    expect(LIB).toMatch(/FROM transport_dispatch_orders d/);
    expect(LIB).toMatch(/JOIN transport_bookings b ON b\.id = d\."bookingId"/);
    expect(LIB).toMatch(/b\."companyId" = d\."companyId"/);
    expect(LIB).toMatch(/d\.status NOT IN \('cancelled', 'declined'\)/);
  });

  it("classifies specialty by dominant kind ≥60% of mix", () => {
    expect(LIB).toMatch(/top\[1\] >= 0\.6/);
  });

  it("composite reputation = 0.4 * onTime + 0.4 * completion + 0.2 * startRate", () => {
    expect(LIB).toMatch(/onTimeRate \* 0\.4 \+[\s\S]{0,100}completionRate \* 0\.4 \+[\s\S]{0,100}startRate \* 0\.2/);
  });

  it("new drivers (no started trips) get reputationScore = 0 (SPA neutralises)", () => {
    expect(LIB).toMatch(/startedCount === 0[\s\S]{0,100}\? 0/);
  });

  it("window bounded by `windowDays` param (default 90)", () => {
    expect(LIB).toMatch(/windowDays = args\.windowDays \?\? 90/);
    expect(LIB).toMatch(/NOW\(\) - \(\$3::text \|\| ' days'\)::interval/);
  });

  it("fleet leaderboard sorted by reputation desc", () => {
    expect(LIB).toMatch(/\.sort\(\(a, b\) => b\.reputationScore - a\.reputationScore\)/);
  });

  it("fleet query only includes active drivers (excludes terminated)", () => {
    expect(LIB).toMatch(/COALESCE\(status, 'active'\) NOT IN \('inactive', 'terminated'\)/);
  });
});

describe("#1812 — driver intelligence routes", () => {
  it("exposes GET /fleet/drivers/intelligence (list) + /:id/intelligence (detail)", () => {
    expect(ROUTER).toMatch(/\.get\(\s*"\/fleet\/drivers\/intelligence"/);
    expect(ROUTER).toMatch(/\.get\(\s*"\/fleet\/drivers\/:id\/intelligence"/);
  });

  it("list gated on dispatch:list, detail gated on dispatch:view", () => {
    const listBlock = ROUTER.slice(ROUTER.indexOf('"/fleet/drivers/intelligence"'));
    expect(listBlock).toMatch(/authorize\(\{ feature: "fleet\.dispatch", action: "list" \}\)/);
    const detailBlock = ROUTER.slice(ROUTER.indexOf('"/fleet/drivers/:id/intelligence"'));
    expect(detailBlock).toMatch(/authorize\(\{ feature: "fleet\.dispatch", action: "view" \}\)/);
  });

  it("windowDays clamped 7..365 to prevent abuse", () => {
    expect(ROUTER).toMatch(/Math\.max\(7, Math\.min\(365, Number\(req\.query\.windowDays\)\)\)/);
  });

  it("router mounted in index.ts with fleet+financial guards", () => {
    expect(INDEX).toContain("fleetDriverIntelligenceRouter");
    expect(INDEX).toMatch(/router\.use\(requireModule\("fleet"\), requireGuards\("financial"\), fleetDriverIntelligenceRouter\)/);
  });
});
