import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §4 Phase 2 of #1870 — Operational Umrah Calendar extensions.
 *
 * Pins:
 *   1. Two new event layers (nusk_invoice_issued + penalty_created)
 *      added to the API catalog + the FE type union.
 *   2. The window cap raised from 90 to 366 days so the yearly view
 *      is one round-trip per year.
 *   3. FE adds:
 *      - View-mode toggle (month / year) with stable testids.
 *      - Yearly heat-map grid (12 mini-month components).
 *      - Day-detail quick-action row.
 *   4. Clicking a day in the yearly view drops the operator back
 *      into the monthly view focused on that day.
 *   5. Existing layer drill-downs still wired (LAYER_HREF entries
 *      for the two new layers).
 */
// U-07 Phase 15 — calendar route + layer metadata carved into umrah-calendar.ts.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-calendar.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/calendar.tsx"),
  "utf8",
);

describe("API — two new event layers", () => {
  it("CalendarLayer union includes the new layers", () => {
    expect(ROUTE).toMatch(/\| "nusk_invoice_issued"/);
    expect(ROUTE).toMatch(/\| "penalty_created"/);
  });

  it("CALENDAR_LAYER_META declares Arabic labels + colors", () => {
    expect(ROUTE).toMatch(/nusk_invoice_issued: \{ label: "فواتير نسك مُصدَرة"/);
    expect(ROUTE).toMatch(/penalty_created:\s+\{ label: "غرامات مُصدرة"/);
  });

  it("nusk_invoice_issued probe groups by n.issueDate + excludes cancelled", () => {
    expect(ROUTE).toMatch(/runs\.nusk_invoice_issued = rawQuery/);
    expect(ROUTE).toMatch(/n\."issueDate" BETWEEN \$2::date AND \$3::date/);
    expect(ROUTE).toMatch(/AND n\."nuskStatus" <> 'cancelled'/);
  });

  it("penalty_created probe groups by createdAt::date + filters soft-deletes", () => {
    expect(ROUTE).toMatch(/runs\.penalty_created = rawQuery/);
    expect(ROUTE).toMatch(/FROM umrah_penalties pen/);
    expect(ROUTE).toMatch(/pen\."createdAt"::date BETWEEN \$2::date AND \$3::date/);
    expect(ROUTE).toMatch(/AND pen\."deletedAt" IS NULL/);
  });

  it("window cap raised to 366 days (yearly view in one round-trip)", () => {
    expect(ROUTE).toMatch(/if \(days > 366\)/);
    expect(ROUTE).toMatch(/نافذة التقويم محدودة بـ 366 يوماً/);
  });
});

describe("FE — view-mode toggle (month / year)", () => {
  it("ViewMode type + toggle buttons exist", () => {
    expect(PAGE).toMatch(/type ViewMode = "month" \| "year"/);
    expect(PAGE).toMatch(/data-testid="calendar-view-month"/);
    expect(PAGE).toMatch(/data-testid="calendar-view-year"/);
  });

  it("prev/next nav steps by 12 months in yearly view, 1 in monthly", () => {
    expect(PAGE).toMatch(/view === "month" \? addMonths\(cursor, -1\) : addMonths\(cursor, -12\)/);
    expect(PAGE).toMatch(/view === "month" \? addMonths\(cursor, 1\) : addMonths\(cursor, 12\)/);
  });

  it("API window expands to full calendar year in yearly view", () => {
    expect(PAGE).toMatch(/view === "month"\s*\?\s*fmtDate\(firstOfMonth\(cursor\)\)\s*:\s*fmtDate\(new Date\(cursor\.getFullYear\(\), 0, 1\)\)/);
    expect(PAGE).toMatch(/view === "month"\s*\?\s*fmtDate\(lastOfMonth\(cursor\)\)\s*:\s*fmtDate\(new Date\(cursor\.getFullYear\(\), 11, 31\)\)/);
  });

  it("month-label switches between 'يناير 2026' and 'سنة 2026'", () => {
    expect(PAGE).toMatch(/`سنة \$\{cursor\.getFullYear\(\)\}`/);
  });
});

describe("FE — YearGrid component (heat-map yearly view)", () => {
  it("declares the YearGrid component + container testid", () => {
    expect(PAGE).toMatch(/function YearGrid\(\{/);
    expect(PAGE).toMatch(/data-testid="calendar-year-grid"/);
  });

  it("renders 12 mini-month components", () => {
    expect(PAGE).toMatch(/data-testid=\{`calendar-mini-month-\$\{monthIdx \+ 1\}`\}/);
    expect(PAGE).toMatch(/Array\.from\(\{ length: 12 \}/);
  });

  it("clicking a mini-day pivots back to monthly view focused on it", () => {
    // The onPickDay callback both selects the day AND switches to
    // monthly view. Without that pivot, the operator sees only the
    // tiny heat cell and has to manually switch views.
    expect(PAGE).toMatch(/setSelectedDay\(date\)/);
    expect(PAGE).toMatch(/setView\("month"\)/);
  });

  it("heat tones bucketed by total event count", () => {
    expect(PAGE).toMatch(/function heatTone\(date: string\): string/);
    expect(PAGE).toMatch(/if \(total === 0\) return "bg-muted\/30 border-transparent"/);
    expect(PAGE).toMatch(/if \(total <= 2\)\s+return "bg-emerald-100/);
    expect(PAGE).toMatch(/if \(total <= 5\)\s+return "bg-sky-100/);
    expect(PAGE).toMatch(/if \(total <= 10\) return "bg-amber-100/);
    expect(PAGE).toMatch(/return "bg-rose-100/);
  });

  it("each mini-day has a stable testid for E2E", () => {
    expect(PAGE).toMatch(/data-testid=\{`calendar-mini-day-\$\{cell\.date\}`\}/);
  });
});

describe("FE — day-detail quick actions", () => {
  it("renders an action row only when a day is selected", () => {
    expect(PAGE).toMatch(/data-testid="calendar-day-actions"/);
  });

  it("links to create-pilgrim, daily-runsheet, groups", () => {
    expect(PAGE).toMatch(/data-testid="calendar-action-create-pilgrim"/);
    expect(PAGE).toMatch(/data-testid="calendar-action-runsheet"/);
    expect(PAGE).toMatch(/data-testid="calendar-action-groups"/);
  });

  it("runsheet action carries the selected date as ?date=", () => {
    expect(PAGE).toMatch(/`\/umrah\/daily-runsheet\?date=\$\{selectedDay\}`/);
  });
});

describe("FE — LAYER_HREF for the two new layers", () => {
  it("nusk_invoice_issued drills to /umrah/nusk-invoices", () => {
    expect(PAGE).toMatch(/nusk_invoice_issued:\s+\(\)\s+=> `\/umrah\/nusk-invoices`/);
  });

  it("penalty_created drills to /umrah/penalties", () => {
    expect(PAGE).toMatch(/penalty_created:\s+\(\)\s+=> `\/umrah\/penalties`/);
  });
});