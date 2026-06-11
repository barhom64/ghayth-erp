import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  checkDriverDrivingCaps,
  checkDriverLeave,
  type LeaveOverlap,
} from "../../src/lib/fleet/driverReadiness.js";

/**
 * #2079 PE-03 — Driver Readiness Gate.
 *
 * Owner's mandate (2026-06-11):
 *   «أي سائق في إجازة، أو متجاوز سقف القيادة، أو لا يملك راحة
 *    كافية، لا يدخل الترشيح إلا وفق استثناء موثق إن كان النظام
 *    يسمح بذلك لاحقًا.»
 *
 * Closes REST-01 (driving caps) + REST-02 (approved leave overlap)
 * from `docs/transport-audit/20_planning_engine_audit.md` §5.
 *
 * The point-to-point rest check (between sequential dispatches)
 * was already enforced by the existing `driverRest.ts` library and
 * remains untouched. This PR closes the two gaps that lived on top
 * of it: approved-leave intersection with the booking window, and
 * aggregate driving-time caps (daily / weekly).
 */

const apiSrc = join(import.meta.dirname!, "../../src");
const ENGINE = readFileSync(join(apiSrc, "lib/fleet/assignmentSuggestionEngine.ts"), "utf8");
const MIG    = readFileSync(join(apiSrc, "migrations/325_driver_driving_caps.sql"), "utf8");

/* ── checkDriverLeave ──────────────────────────────────────────── */

describe("#2079 PE-03 — checkDriverLeave verdicts", () => {
  it("driver with no employeeId mapping is allowed (legacy driver, no HR link)", () => {
    const v = checkDriverLeave(null, new Map());
    expect(v.blocked).toBe(false);
    expect(v.reason).toBeNull();
  });

  it("driver whose employee has an approved leave is REJECTED with Arabic reason", () => {
    const leaves = new Map<number, LeaveOverlap>([[
      42, { employeeId: 42, startDate: "2026-07-13", endDate: "2026-07-17", leaveType: "إجازة سنوية" },
    ]]);
    const v = checkDriverLeave(42, leaves);
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/إجازة سنوية/);
    expect(v.reason).toContain("2026-07-13");
    expect(v.reason).toContain("2026-07-17");
  });

  it("driver whose employee has no leave on this window passes", () => {
    const leaves = new Map<number, LeaveOverlap>([[
      99, { employeeId: 99, startDate: "2026-07-13", endDate: "2026-07-17", leaveType: "Sick" },
    ]]);
    const v = checkDriverLeave(42, leaves);
    expect(v.blocked).toBe(false);
  });

  it("null leaveType falls back to 'إجازة معتمدة' so the message is never blank", () => {
    const leaves = new Map<number, LeaveOverlap>([[
      42, { employeeId: 42, startDate: "2026-07-13", endDate: "2026-07-17", leaveType: null },
    ]]);
    const v = checkDriverLeave(42, leaves);
    expect(v.reason).toMatch(/إجازة معتمدة/);
  });
});

/* ── checkDriverDrivingCaps ────────────────────────────────────── */

const CAPS = { dailyMinutes: 780, weeklyMinutes: 3600 };

describe("#2079 PE-03 — checkDriverDrivingCaps verdicts", () => {
  it("fresh driver (no prior minutes) on a short trip is allowed", () => {
    const v = checkDriverDrivingCaps(null, 90, CAPS);
    expect(v.blocked).toBe(false);
  });

  it("driver at 9h who picks up a 5h trip BREAKS the 13h daily cap → blocker", () => {
    const v = checkDriverDrivingCaps({ daily: 540, weekly: 540 }, 300, CAPS);
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/تجاوز السقف اليومي للقيادة/);
    expect(v.reason).toMatch(/14 ساعة/);
    expect(v.reason).toMatch(/13 ساعة/);
  });

  it("daily check fires before weekly so the message points at the tighter window", () => {
    // 12h daily + 4h trip = 16h daily (over 13h cap) and also over the
    // weekly cap (if weekly was already 56h). We expect the daily
    // message because the dispatcher should fix the immediate breach.
    const v = checkDriverDrivingCaps({ daily: 720, weekly: 3360 }, 240, CAPS);
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/السقف اليومي/);
    expect(v.reason).not.toMatch(/السقف الأسبوعي/);
  });

  it("weekly cap fires when daily is within budget but cumulative is not", () => {
    // 9h daily + 3h trip = 12h (within 13h) but 58h weekly + 3h = 61h (over 60h).
    const v = checkDriverDrivingCaps({ daily: 540, weekly: 3480 }, 180, CAPS);
    expect(v.blocked).toBe(true);
    expect(v.reason).toMatch(/السقف الأسبوعي/);
  });

  it("driver at exactly the daily cap with a 1-minute trip is REJECTED (strict >)", () => {
    const v = checkDriverDrivingCaps({ daily: 780, weekly: 780 }, 1, CAPS);
    expect(v.blocked).toBe(true);
  });

  it("driver at exactly the daily cap with a 0-minute trip would pass (the engine guards trip>=1)", () => {
    const v = checkDriverDrivingCaps({ daily: 780, weekly: 780 }, 0, CAPS);
    expect(v.blocked).toBe(false);
  });
});

/* ── Engine wiring ─────────────────────────────────────────────── */

describe("#2079 PE-03 — engine wires the driver readiness gate", () => {
  it("imports the readiness helpers from the canonical path", () => {
    expect(ENGINE).toMatch(/from "\.\/driverReadiness\.js"/);
    expect(ENGINE).toMatch(/checkDriverLeave/);
    expect(ENGINE).toMatch(/checkDriverDrivingCaps/);
  });

  it("DriverRow interface declares employeeId so the leave map can be keyed", () => {
    expect(ENGINE).toMatch(/employeeId: number \| null;/);
    expect(ENGINE).toMatch(/d\."employeeId"/);
  });

  it("queries hr_leave_requests for approved leaves overlapping the booking window", () => {
    expect(ENGINE).toMatch(/FROM hr_leave_requests lr/);
    expect(ENGINE).toMatch(/lr\.status = 'approved'/);
    expect(ENGINE).toMatch(/lr\."startDate" <= \$3::date/);
    expect(ENGINE).toMatch(/lr\."endDate"\s+>= \$2::date/);
    expect(ENGINE).toMatch(/LEFT JOIN hr_leave_types/);
  });

  it("runs a daily + weekly driving-minute SUM probe with FILTER clauses", () => {
    expect(ENGINE).toMatch(/INTERVAL '24 hours'/);
    expect(ENGINE).toMatch(/INTERVAL '7 days'/);
    expect(ENGINE).toMatch(/EPOCH FROM \("scheduledEndAt" - "scheduledStartAt"\)/);
  });

  it("loads driving caps from transport_planning_settings with industry defaults", () => {
    expect(ENGINE).toMatch(/FROM transport_planning_settings/);
    expect(ENGINE).toMatch(/dailyMinutes:\s+capsRow\?\.dailyMinutes\s+\?\?\s+780/);
    expect(ENGINE).toMatch(/weeklyMinutes:\s+capsRow\?\.weeklyMinutes\s+\?\?\s+3600/);
  });

  it("computes tripDurationMinutes from the booking window and feeds it to the cap check", () => {
    expect(ENGINE).toMatch(/const tripDurationMinutes = Math\.max\(/);
    expect(ENGINE).toMatch(/60_000/);
  });

  it("eligibleDrivers list is built BEFORE the scoring loop (pre-loop gate)", () => {
    expect(ENGINE).toMatch(/const eligibleDrivers: DriverRow\[\] = \[\];/);
    expect(ENGINE).toMatch(/eligibleDrivers\.push\(d\);/);
  });

  it("inner scoring loop iterates eligibleDrivers, not the full drivers list", () => {
    // The pre-loop check on line ~571 still walks `drivers` to filter.
    // The SCORING loop (inside the eligibleVehicles loop) must iterate
    // the filtered list so blocked drivers never reach scoring.
    const scoringSection = ENGINE.slice(ENGINE.indexOf("for (const v of eligibleVehicles)"));
    expect(scoringSection).toMatch(/for \(const d of eligibleDrivers\)/);
    expect(scoringSection).not.toMatch(/for \(const d of drivers\)/);
  });
});

/* ── Migration 325 ─────────────────────────────────────────────── */

describe("#2079 PE-03 — migration 325 shape", () => {
  it("adds the two cap columns with industry defaults", () => {
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS "defaultMaxDailyDrivingMinutes"\s+INTEGER NOT NULL DEFAULT 780/);
    expect(MIG).toMatch(/ADD COLUMN IF NOT EXISTS "defaultMaxWeeklyDrivingMinutes"\s+INTEGER NOT NULL DEFAULT 3600/);
  });

  it("CHECK constraint refuses nonsense values (daily ≤ 24h, weekly ≤ 168h, weekly ≥ daily)", () => {
    expect(MIG).toMatch(/transport_planning_caps_sane_check/);
    expect(MIG).toMatch(/"defaultMaxDailyDrivingMinutes"\s+<= 24 \* 60/);
    expect(MIG).toMatch(/"defaultMaxWeeklyDrivingMinutes" <= 7 \* 24 \* 60/);
    expect(MIG).toMatch(/"defaultMaxWeeklyDrivingMinutes" >= "defaultMaxDailyDrivingMinutes"/);
  });

  it("declares a rollback block", () => {
    expect(MIG).toMatch(/@rollback:/);
    expect(MIG).toMatch(/DROP COLUMN IF EXISTS "defaultMaxDailyDrivingMinutes"/);
    expect(MIG).toMatch(/DROP COLUMN IF EXISTS "defaultMaxWeeklyDrivingMinutes"/);
  });
});

/* ── Boundary pins ─────────────────────────────────────────────── */

describe("#2079 PE-03 — boundary intact", () => {
  it("driverReadiness module is finance-blackout (no price/cost/invoice/amount)", () => {
    const lib = readFileSync(join(apiSrc, "lib/fleet/driverReadiness.ts"), "utf8");
    expect(lib).not.toMatch(/price|cost|revenue|invoice|amount/i);
  });

  it("engine still does not import any GL / journal helper", () => {
    expect(ENGINE).not.toMatch(/financeJournalEngine|journalEngine|postingEngine|financialEngine/);
  });

  it("driverRest (point-to-point) library was not modified — PE-03 is additive only", () => {
    const restLib = readFileSync(join(apiSrc, "lib/fleet/driverRest.ts"), "utf8");
    expect(restLib).not.toMatch(/PE-03|hr_leave_requests|maxDailyDriving/);
  });
});
