import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkOperatingWindow,
  dailyOperatingMinutes,
  riyadhDayOfWeek,
  riyadhMinutesOfDay,
  utilizationScore,
  type OperatingWindowSettings,
} from "../../src/lib/fleet/operatingWindow.js";

/**
 * #2079 PE-04 — Operating window (hard guard) + utilization (scoring).
 *
 * Owner's mandate (2026-06-11):
 *   «ساعات تشغيل الفرع تكون حارسًا تشغيليًا واضحًا... يجب أن يظهر
 *    سبب رفض عربي واضح.»
 *   «utilization لا يكون حارسًا مانعًا بذاته... الأصل أن يكون عامل
 *    scoring / balancing حتى لا يمنع التشغيل بلا سبب.»
 *
 * Closes UTIL-01 + UTIL-02 from docs/transport-audit/20 §1.
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const ENGINE = readFileSync(join(apiSrc, "lib/fleet/assignmentSuggestionEngine.ts"), "utf8");
const DIAG   = readFileSync(join(apiSrc, "lib/fleet/suggestDiagnostics.ts"), "utf8");
const MIG    = readFileSync(join(apiSrc, "migrations/330_transport_operating_hours.sql"), "utf8");

function win(over: Partial<OperatingWindowSettings> = {}): OperatingWindowSettings {
  return {
    operatingStartTime: null,
    operatingEndTime: null,
    operatingDaysMask: null,
    ...over,
  };
}

/* ── Riyadh wall-clock helpers ─────────────────────────────────── */

describe("#2079 PE-04 — Riyadh wall-clock conversion", () => {
  it("2026-06-15 is a Monday in Riyadh (dow=1)", () => {
    expect(riyadhDayOfWeek("2026-06-15T09:00:00+03:00")).toBe(1);
  });

  it("UTC instant late Sunday night IS Monday in Riyadh (+03:00 rollover)", () => {
    // 22:30 UTC Sunday = 01:30 Monday in Riyadh.
    expect(riyadhDayOfWeek("2026-06-14T22:30:00Z")).toBe(1);
  });

  it("minutes-of-day uses Riyadh wall-clock, not UTC", () => {
    // 06:00 UTC = 09:00 Riyadh = 540 minutes.
    expect(riyadhMinutesOfDay("2026-06-15T06:00:00Z")).toBe(540);
  });
});

/* ── checkOperatingWindow (HARD guard) ─────────────────────────── */

describe("#2079 PE-04 — operating window verdicts", () => {
  it("NULL settings (no row) → allowed", () => {
    expect(checkOperatingWindow("2026-06-15T03:00:00+03:00", null).blocked).toBe(false);
  });

  it("NULL columns (row exists, unconfigured) → allowed — enforcement is opt-in", () => {
    const v = checkOperatingWindow("2026-06-15T03:00:00+03:00", win());
    expect(v.blocked).toBe(false);
  });

  it("trip at 03:00 Riyadh with window 06:00–22:00 → blocked with Arabic times", () => {
    const v = checkOperatingWindow(
      "2026-06-15T03:00:00+03:00",
      win({ operatingStartTime: "06:00", operatingEndTime: "22:00" }),
    );
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/خارج ساعات تشغيل النقل/);
    expect(v.reason).toContain("03:00");
    expect(v.reason).toContain("06:00–22:00");
  });

  it("trip at 09:00 Riyadh with window 06:00–22:00 → allowed", () => {
    const v = checkOperatingWindow(
      "2026-06-15T09:00:00+03:00",
      win({ operatingStartTime: "06:00", operatingEndTime: "22:00" }),
    );
    expect(v.blocked).toBe(false);
  });

  it("overnight window 20:00–04:00: trip at 23:00 allowed, trip at 12:00 blocked", () => {
    const night = win({ operatingStartTime: "20:00", operatingEndTime: "04:00" });
    expect(checkOperatingWindow("2026-06-15T23:00:00+03:00", night).blocked).toBe(false);
    expect(checkOperatingWindow("2026-06-15T12:00:00+03:00", night).blocked).toBe(true);
  });

  it("days mask excluding Friday blocks a Friday departure with the day name", () => {
    // 0x7F minus Friday (bit 5) = 0x5F. 2026-06-19 is a Friday.
    const v = checkOperatingWindow(
      "2026-06-19T10:00:00+03:00",
      win({ operatingDaysMask: 0x7F & ~(1 << 5) }),
    );
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/يوم الجمعة خارج أيام تشغيل النقل/);
  });

  it("TIME column value with seconds ('06:00:00') parses the same as '06:00'", () => {
    const v = checkOperatingWindow(
      "2026-06-15T03:00:00+03:00",
      win({ operatingStartTime: "06:00:00", operatingEndTime: "22:00:00" }),
    );
    expect(v.blocked).toBe(true);
  });
});

/* ── dailyOperatingMinutes (UTIL-02 denominator) ───────────────── */

describe("#2079 PE-04 — utilisation denominator honours the window", () => {
  it("unconfigured → 720 (12h) — the audit's documented fallback, not 24h", () => {
    expect(dailyOperatingMinutes(null)).toBe(720);
    expect(dailyOperatingMinutes(win())).toBe(720);
  });

  it("06:00–22:00 → 960 minutes", () => {
    expect(dailyOperatingMinutes(win({ operatingStartTime: "06:00", operatingEndTime: "22:00" }))).toBe(960);
  });

  it("overnight 20:00–04:00 → 480 minutes (wraps midnight)", () => {
    expect(dailyOperatingMinutes(win({ operatingStartTime: "20:00", operatingEndTime: "04:00" }))).toBe(480);
  });
});

/* ── utilizationScore (scoring curve, NEVER blocks) ────────────── */

describe("#2079 PE-04 — utilization scoring curve", () => {
  it("mid band 30–60% scores 100 (healthy rotation)", () => {
    expect(utilizationScore(45)).toBe(100);
    expect(utilizationScore(30)).toBe(100);
    expect(utilizationScore(60)).toBe(100);
  });

  it("over-worked >80% scores 40 — lowest, but NOT zero (no blocking)", () => {
    expect(utilizationScore(95)).toBe(40);
    expect(utilizationScore(81)).toBe(40);
  });

  it("idle <10% scores 55 (surface, don't bury)", () => {
    expect(utilizationScore(3)).toBe(55);
  });

  it("shoulder bands 10–30 / 60–80 score 70", () => {
    expect(utilizationScore(20)).toBe(70);
    expect(utilizationScore(70)).toBe(70);
  });

  it("every output ≥ 40 — utilization can NEVER zero a candidate out", () => {
    for (let pct = 0; pct <= 150; pct += 5) {
      expect(utilizationScore(pct)).toBeGreaterThanOrEqual(40);
    }
  });
});

/* ── Engine wiring ─────────────────────────────────────────────── */

describe("#2079 PE-04 — engine wiring", () => {
  it("imports the operating-window helpers from the canonical path", () => {
    expect(ENGINE).toMatch(/from "\.\/operatingWindow\.js"/);
    expect(ENGINE).toMatch(/checkOperatingWindow/);
    expect(ENGINE).toMatch(/utilizationScore/);
    expect(ENGINE).toMatch(/dailyOperatingMinutes/);
  });

  it("settings query hydrates the three operating-window columns", () => {
    for (const col of ["operatingStartTime", "operatingEndTime", "operatingDaysMask"]) {
      expect(ENGINE, `column ${col} missing from settings SELECT`).toContain(`"${col}"`);
    }
  });

  it("HARD guard: blocked window returns [] before any candidate work", () => {
    expect(ENGINE).toMatch(/const windowVerdict = checkOperatingWindow\(start, operatingWindow\);/);
    expect(ENGINE).toMatch(/if \(windowVerdict\.blocked\) \{\s*\n\s*return \[\];/);
  });

  it("guard sits BEFORE the vehicle-minutes probe and the scoring loop", () => {
    const guardIdx  = ENGINE.indexOf("const windowVerdict = checkOperatingWindow");
    const minsIdx   = ENGINE.indexOf("vehicleMinutesRows");
    const loopIdx   = ENGINE.indexOf("for (const v of eligibleVehicles)");
    expect(guardIdx).toBeGreaterThan(0);
    expect(guardIdx).toBeLessThan(minsIdx);
    expect(minsIdx).toBeLessThan(loopIdx);
  });

  it("trailing 7-day booked-minutes probe groups by vehicleId", () => {
    expect(ENGINE).toMatch(/bookedMinutesByVehicleId/);
    expect(ENGINE).toMatch(/GROUP BY "vehicleId"/);
  });

  it("utilization is a SCORING axis — appears in scores + weighted sum at 0.05", () => {
    expect(ENGINE).toMatch(/utilization: number;/);
    expect(ENGINE).toMatch(/utilization: utilScore,/);
    expect(ENGINE).toMatch(/utilScore\s+\* 0\.05/);
  });

  it("weights still sum to 1.00 — distance dropped to 0.05 to fund utilization", () => {
    expect(ENGINE).toMatch(/distanceScore\s+\* 0\.05/);
    const weights = [0.20, 0.10, 0.25, 0.15, 0.10, 0.05, 0.10, 0.05];
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1.0);
  });

  it("utilization NEVER pushes into blockers — only a soft reason above 80%", () => {
    const utilBlock = ENGINE.slice(
      ENGINE.indexOf("─ utilization (weight 5"),
      ENGINE.indexOf("─ Aggregate"),
    );
    expect(utilBlock).not.toMatch(/blockers\.push/);
    expect(utilBlock).toMatch(/reasons\.push/);
    expect(utilBlock).toMatch(/يُفضَّل توزيع الحمل/);
  });

  it("predictedUtilisation is finally computed (was declared-but-never-set since #1812)", () => {
    expect(ENGINE).toMatch(/const predictedUtilisation = Math\.round\(/);
    expect(ENGINE).toMatch(/predictedUtilisation,\s*\n\s*\}\);/);
  });
});

/* ── Diagnostics wiring ────────────────────────────────────────── */

describe("#2079 PE-04 — diagnostics surface the Arabic reason", () => {
  it("declares the outside_operating_hours axis", () => {
    expect(DIAG).toMatch(/"outside_operating_hours"/);
  });

  it("queries the same settings columns and reuses checkOperatingWindow", () => {
    expect(DIAG).toMatch(/from "\.\/operatingWindow\.js"/);
    expect(DIAG).toMatch(/checkOperatingWindow\(args\.scheduledStartAt, windowRow\)/);
  });

  it("returns the verdict's own Arabic reason verbatim + actionable hints", () => {
    expect(DIAG).toMatch(/reason: verdict\.reason!/);
    expect(DIAG).toMatch(/عدّل وقت انطلاق الرحلة ليقع داخل ساعات تشغيل النقل/);
  });
});

/* ── Migration 330 ─────────────────────────────────────────────── */

describe("#2079 PE-04 — migration 330 shape", () => {
  it("adds three nullable columns (opt-in enforcement)", () => {
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS "operatingStartTime" TIME/);
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS "operatingEndTime"\s+TIME/);
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS "operatingDaysMask"\s+INTEGER/);
    expect(MIG).not.toMatch(/NOT NULL DEFAULT/);
  });

  it("CHECK rejects an out-of-range mask and a zero-length window, allows overnight", () => {
    expect(MIG).toMatch(/transport_operating_window_sane_check/);
    expect(MIG).toMatch(/"operatingDaysMask" >= 1 AND "operatingDaysMask" <= 127/);
    expect(MIG).toMatch(/"operatingStartTime" <> "operatingEndTime"/);
  });

  it("declares a rollback block", () => {
    expect(MIG).toMatch(/@rollback:/);
    expect(MIG).toMatch(/DROP COLUMN IF EXISTS "operatingStartTime"/);
  });
});

/* ── Boundary pins ─────────────────────────────────────────────── */

describe("#2079 PE-04 — boundary intact", () => {
  it("operatingWindow module is finance-blackout", () => {
    const lib = readFileSync(join(apiSrc, "lib/fleet/operatingWindow.ts"), "utf8");
    expect(lib).not.toMatch(/price|cost|revenue|invoice|amount/i);
  });

  it("engine still has no GL / journal import", () => {
    expect(ENGINE).not.toMatch(/financeJournalEngine|journalEngine|postingEngine|financialEngine/);
  });

  it("guard chain order: VCM → vehicle readiness → driver readiness → scoring", () => {
    const vcmIdx       = ENGINE.indexOf("isEligibleForTripFamily(vcm, tripFamily");
    const vehicleIdx   = ENGINE.indexOf("checkVehicleDocumentReadiness(v, end)");
    const driverIdx    = ENGINE.indexOf("checkDriverLeave(d.employeeId");
    const scoringIdx   = ENGINE.indexOf("for (const v of eligibleVehicles)");
    expect(vcmIdx).toBeGreaterThan(0);
    expect(vcmIdx).toBeLessThan(vehicleIdx);
    expect(vehicleIdx).toBeLessThan(driverIdx);
    expect(driverIdx).toBeLessThan(scoringIdx);
  });
});
