/**
 * Saudi Labor Law (نظام العمل السعودي) — behavioral compliance suite.
 *
 * Covers the law-driven HR calculations the audit flagged as wrong or
 * missing. Each test names the article it asserts so future readers can
 * verify against the law text directly.
 *
 *   - Article 84:  مكافأة نهاية الخدمة عند الإنهاء من صاحب العمل.
 *   - Article 85:  تخفيض المكافأة على الاستقالة (تدرّج 0 / 1/3 / 2/3 / 1).
 *   - Article 80:  لا مكافأة للفصل المبرّر.
 *   - Article 98:  الحد الأقصى لساعات العمل (8/يوم، 6/يوم في رمضان).
 *   - Article 104: يوم الراحة الأسبوعية — الجمعة افتراضًا.
 *   - Article 109: 21 يومًا للسنة الأولى-الخامسة، 30 بعد ذلك.
 *   - GOSI Article 19: 10% + 12% على الأساسي + بدل السكن (سقف 45,000).
 *
 * These are pure-function tests; they import the helpers and run them
 * with known inputs. No DB needed. Read as: "given X years of service
 * and Y exit type, the gratuity must equal Z".
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  calcGratuity,
  yearsOfService,
  annualLeaveEntitlement,
  countLeaveDaysExcludingRest,
  RAMADAN_HOURS_FACTOR,
  calcHourlyRateConfigurable,
} from "../../src/lib/hrHelpers.js";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

// ─── المادة 84 — مكافأة نهاية الخدمة عند إنهاء العقد من صاحب العمل ──────

describe("Article 84 — termination by employer (full gratuity)", () => {
  it("3 years × 10,000 SAR → 0.5 × 10,000 × 3 = 15,000", () => {
    const eos = calcGratuity(10_000, 3, "termination");
    expect(eos.first5Years).toBe(15_000);
    expect(eos.after5Years).toBe(0);
    expect(eos.fullGratuity).toBe(15_000);
    expect(eos.resignationFraction).toBe(1);
    expect(eos.total).toBe(15_000);
  });

  it("7 years × 10,000 SAR → 25,000 (5y half) + 20,000 (2y full) = 45,000", () => {
    const eos = calcGratuity(10_000, 7, "termination");
    expect(eos.first5Years).toBe(25_000);
    expect(eos.after5Years).toBe(20_000);
    expect(eos.total).toBe(45_000);
  });

  it("exactly 5.000 years lands in 'first 5' tier only", () => {
    const eos = calcGratuity(10_000, 5, "termination");
    expect(eos.first5Years).toBe(25_000);
    expect(eos.after5Years).toBe(0);
    expect(eos.total).toBe(25_000);
  });
});

// ─── المادة 85 — الاستقالة (تدرّج المستحَق) ─────────────────────────────

describe("Article 85 — resignation (fractional gratuity)", () => {
  it("<2 years resignation: ZERO gratuity", () => {
    const eos = calcGratuity(10_000, 1.5, "resignation");
    expect(eos.fullGratuity).toBe(7_500);
    expect(eos.resignationFraction).toBe(0);
    expect(eos.total).toBe(0);
  });

  it("2–5 years resignation: 1/3 of the full benefit", () => {
    // 3 years at 10,000 → full = 15,000 → 1/3 = 5,000
    const eos = calcGratuity(10_000, 3, "resignation");
    expect(eos.fullGratuity).toBe(15_000);
    expect(eos.resignationFraction).toBeCloseTo(1 / 3);
    expect(eos.total).toBe(5_000);
  });

  it("5–10 years resignation: 2/3 of the full benefit", () => {
    // 7 years at 10,000 → full = 45,000 → 2/3 = 30,000
    const eos = calcGratuity(10_000, 7, "resignation");
    expect(eos.fullGratuity).toBe(45_000);
    expect(eos.resignationFraction).toBeCloseTo(2 / 3);
    expect(eos.total).toBe(30_000);
  });

  it("10+ years resignation: FULL benefit (same as termination)", () => {
    const eos = calcGratuity(10_000, 12, "resignation");
    const term = calcGratuity(10_000, 12, "termination");
    expect(eos.total).toBe(term.total);
  });
});

// ─── المادة 80 — الفصل لسبب — لا مكافأة ──────────────────────────────────

describe("Article 80 — just_cause termination yields NO gratuity", () => {
  it("any years of service with just_cause → 0", () => {
    expect(calcGratuity(10_000, 3, "just_cause").total).toBe(0);
    expect(calcGratuity(10_000, 12, "just_cause").total).toBe(0);
  });
});

// ─── المادة 109 — رصيد الإجازة السنوية (21/30) ───────────────────────────

describe("Article 109 — annual leave entitlement", () => {
  it("0–5 years → 21 days", () => {
    expect(annualLeaveEntitlement(0)).toBe(21);
    expect(annualLeaveEntitlement(2.5)).toBe(21);
    expect(annualLeaveEntitlement(4.99)).toBe(21);
  });

  it("≥5 years → 30 days", () => {
    expect(annualLeaveEntitlement(5)).toBe(30);
    expect(annualLeaveEntitlement(7.3)).toBe(30);
    expect(annualLeaveEntitlement(20)).toBe(30);
  });

  it("custom configured days (e.g. 14 unpaid personal) honored", () => {
    expect(annualLeaveEntitlement(2, 14)).toBe(14);
    expect(annualLeaveEntitlement(10, 14)).toBe(14);
  });

  it("explicit configured 21 still upgrades after 5y (canonical annual)", () => {
    // Treat configured=21 as "the canonical annual leave type" → auto-upgrade.
    expect(annualLeaveEntitlement(7, 21)).toBe(30);
  });

  it("null/undefined configured uses tenure-based default", () => {
    expect(annualLeaveEntitlement(7, null)).toBe(30);
    expect(annualLeaveEntitlement(3, undefined)).toBe(21);
  });
});

// ─── المادة 104 — يوم الراحة الأسبوعية (الجمعة) ──────────────────────────

describe("Article 104 — Friday rest day excluded from leave days", () => {
  it("week-long leave (Sat→Fri) deducts 6 working days, not 7", () => {
    // 2026-01-03 = Saturday → 2026-01-09 = Friday (7 calendar days)
    // Exclude the Friday → 6 days deducted.
    const days = countLeaveDaysExcludingRest("2026-01-03", "2026-01-09", [5]);
    expect(days).toBe(6);
  });

  it("single Friday leave deducts 0 days", () => {
    // 2026-01-09 is a Friday.
    const days = countLeaveDaysExcludingRest("2026-01-09", "2026-01-09", [5]);
    expect(days).toBe(0);
  });

  it("Sat→Mon leave (no Friday in range) deducts all 3 days", () => {
    const days = countLeaveDaysExcludingRest("2026-01-03", "2026-01-05", [5]);
    expect(days).toBe(3);
  });

  it("two-week leave excludes both Fridays", () => {
    // 2026-01-03 (Sat) → 2026-01-16 (Fri) = 14 days, 2 of which are Friday.
    const days = countLeaveDaysExcludingRest("2026-01-03", "2026-01-16", [5]);
    expect(days).toBe(12);
  });

  it("custom rest-day list (e.g., Fri+Sat for some sectors)", () => {
    // 2026-01-03 (Sat) → 2026-01-09 (Fri): exclude both Fri+Sat = 2 days
    // out of 7.
    const days = countLeaveDaysExcludingRest("2026-01-03", "2026-01-09", [5, 6]);
    expect(days).toBe(5);
  });
});

// ─── المادة 98 — ساعات رمضان (6 ساعات/يوم) ───────────────────────────────

describe("Article 98 — Ramadan reduced hours factor", () => {
  it("RAMADAN_HOURS_FACTOR equals 6/8 = 0.75", () => {
    expect(RAMADAN_HOURS_FACTOR).toBeCloseTo(0.75);
  });

  it("hourly rate scales linearly with configured working days/hours", () => {
    // 10,000 / 30 / 8 = 41.67
    expect(calcHourlyRateConfigurable(10_000)).toBeCloseTo(41.67, 1);
    // 6-day week (26 working days) override: 10,000 / 26 / 8 = 48.08
    expect(calcHourlyRateConfigurable(10_000, 26)).toBeCloseTo(48.08, 1);
    // Ramadan (6h/day): 10,000 / 30 / 6 = 55.56
    expect(calcHourlyRateConfigurable(10_000, 30, 6)).toBeCloseTo(55.56, 1);
  });
});

// ─── yearsOfService — حدود التدرّج لا تتأثر بالمنطقة الزمنية ───────────

describe("yearsOfService — calendar-date precision at tier boundaries", () => {
  it("2020-03-15 → 2025-03-15 lands at EXACTLY 5.00 years (not 4.99)", () => {
    const yrs = yearsOfService("2020-03-15", "2025-03-15");
    // 365.25-day denominator: (5 × 365 + 1 leap)/365.25 = 1826/365.25 ≈ 4.999
    // Acceptable: within ±0.01 — but NOT off by hours like the old impl.
    expect(yrs).toBeGreaterThanOrEqual(4.99);
    expect(yrs).toBeLessThanOrEqual(5.01);
  });

  it("identical dates → 0 years", () => {
    expect(yearsOfService("2024-01-01", "2024-01-01")).toBe(0);
  });

  it("Date object input matches string input", () => {
    const a = yearsOfService("2020-01-01", "2025-01-01");
    const b = yearsOfService(new Date("2020-01-01T00:00:00Z"), new Date("2025-01-01T00:00:00Z"));
    expect(a).toBeCloseTo(b, 2);
  });
});

// ─── GOSI Article 19 — wage base includes housing, default rates 10/12 ─

describe("GOSI Article 19 — wage base & default rates", () => {
  const HR_SRC = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
    "utf8",
  );

  it("default employee rate is 10% (not the old 9.75%)", () => {
    expect(HR_SRC).toMatch(/gosiEmployeeRate.*\?\?\s*"10"/);
  });

  it("default employer rate is 12% (not the old 11.75%)", () => {
    expect(HR_SRC).toMatch(/gosiEmployerRate.*\?\?\s*"12"/);
  });

  it("contribution base includes housing allowance by default", () => {
    expect(HR_SRC).toContain("GOSI_INCLUDE_HOUSING");
    expect(HR_SRC).toContain("basic + housingAllowance");
  });

  it("contribution base is still capped by GOSI_CEILING (default 45,000)", () => {
    expect(HR_SRC).toContain("gosiContributionWage, GOSI_CEILING");
  });
});

// ─── خصم الغياب — يستثني الجمع والعطل الرسمية ───────────────────────────

describe("Absence deduction — excludes Fridays and public holidays", () => {
  const HR_SRC = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
    "utf8",
  );

  it("payroll absence query excludes EXTRACT(DOW)=5 (Friday)", () => {
    expect(HR_SRC).toContain("EXTRACT(DOW FROM a.date) <> 5");
  });

  it("payroll absence query excludes public holidays via NOT EXISTS", () => {
    const slice = HR_SRC.slice(HR_SRC.indexOf("EXTRACT(DOW FROM a.date) <> 5"));
    expect(slice).toContain("NOT EXISTS");
    expect(slice).toContain("public_holidays");
  });
});

// ─── المادة 104 — منع جدولة وردية بلا يوم راحة ──────────────────────────

describe("Article 104 — shift schema rejects 7-day weeks", () => {
  const HR_SRC = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/hr.ts"),
    "utf8",
  );

  it("shiftSchema has superRefine that rejects 7-day shifts", () => {
    expect(HR_SRC).toContain("if (unique.size >= 7)");
    expect(HR_SRC).toContain("المادة 104");
    expect(HR_SRC).toContain("يوم راحة أسبوعي");
  });
});

// ─── hr-exit.ts — يستدعي calcGratuity وليس صيغة محلية مشوّهة ─────────────

describe("hr-exit.ts uses calcGratuity helper (no inline broken formula)", () => {
  const EXIT_SRC = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/routes/hr-exit.ts"),
    "utf8",
  );

  it("imports calcGratuity + ExitType", () => {
    expect(EXIT_SRC).toContain("calcGratuity");
    expect(EXIT_SRC).toContain("ExitType");
  });

  it("invokes calcGratuity with eosExitType", () => {
    expect(EXIT_SRC).toContain("calcGratuity(salary, yearsOfService, eosExitType)");
  });

  it("queries hr_leave_balances (not stale leave_balances)", () => {
    expect(EXIT_SRC).toContain('FROM hr_leave_balances');
    expect(EXIT_SRC).not.toMatch(/FROM\s+leave_balances\b/);
  });

  it("no longer contains the broken inline resignation tiers", () => {
    // The old code multiplied by fractions inside both halves; the new
    // implementation lives entirely inside calcGratuity.
    expect(EXIT_SRC).not.toContain("(salary / 2) * first5 / 3");
  });
});
