import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Quick-pick date-range presets — operators frame reports by a small
 * set of stock windows (YTD / last quarter / 30D / 12M). This is the
 * shared chip-bar component plus its wiring into the 3 finance drill
 * pages where it lives.
 */

const COMPONENT = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/date-range-presets.tsx"),
  "utf8",
);

const PAGES = {
  entityPnl: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/entity-pnl.tsx"), "utf8"),
  entityRanking: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/entity-ranking.tsx"), "utf8"),
  ccDrillPnl: readFileSync(join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cost-center-drill-pnl.tsx"), "utf8"),
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
describe("DateRangePresets — shared chip-bar component", () => {
  it("exports the DateRange + props types so callers stay typed", () => {
    expect(COMPONENT).toMatch(/export interface DateRange/);
    expect(COMPONENT).toMatch(/export interface DateRangePresetsProps/);
    expect(COMPONENT).toMatch(/export function DateRangePresets/);
  });

  it("5 stock presets: 30 days / current Q / last Q / YTD / 12 months", () => {
    for (const t of ["30d", "qtd", "last-qtr", "ytd", "12m"]) {
      expect(COMPONENT).toContain(`testid: "${t}"`);
    }
  });

  it("Arabic labels match the operator's vocabulary", () => {
    for (const label of [
      "آخر 30 يوماً",
      "هذا الربع",
      "الربع السابق",
      "من بداية السنة",
      "آخر 12 شهراً",
    ]) {
      expect(COMPONENT).toContain(label);
    }
  });

  it("'كامل العمر' reset is OPT-OUT via the hideAllTime prop (some pages use defaults)", () => {
    expect(COMPONENT).toMatch(/hideAllTime\?: boolean/);
    expect(COMPONENT).toMatch(/!hideAllTime && \(/);
    expect(COMPONENT).toContain("كامل العمر");
  });

  it("active preset chip highlights when current value matches what it would produce", () => {
    expect(COMPONENT).toMatch(/const activeKey = PRESETS\.find\(\(p\) =>/);
    expect(COMPONENT).toMatch(/r\.from === value\.from && r\.to === value\.to/);
    expect(COMPONENT).toMatch(/variant=\{activeKey === p\.testid \? "default" : "outline"\}/);
  });

  it("last-quarter math handles year underflow (currently Q1 → last Q is Q4 of prior year)", () => {
    // Pinned because the off-by-one math is easy to get wrong.
    expect(COMPONENT).toMatch(/const lastQ = currentQ === 0 \? 3 : currentQ - 1/);
    expect(COMPONENT).toMatch(/const year = currentQ === 0 \? d\.getUTCFullYear\(\) - 1 : d\.getUTCFullYear\(\)/);
  });

  it("stable testid template — `${prefix}-${preset}` lets consumer pages scope screenshots separately", () => {
    expect(COMPONENT).toContain("data-testid={`${testidPrefix}-row`}");
    expect(COMPONENT).toContain("data-testid={`${testidPrefix}-${p.testid}`}");
    expect(COMPONENT).toContain("data-testid={`${testidPrefix}-all-time`}");
  });

  it("default testidPrefix = 'date-presets'", () => {
    expect(COMPONENT).toMatch(/testidPrefix = "date-presets"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Wiring on the 3 drill pages
// ─────────────────────────────────────────────────────────────────────────────
describe("Drill-page wirings — one DateRangePresets per page", () => {
  for (const [pageName, page] of Object.entries(PAGES)) {
    it(`${pageName} imports the shared component`, () => {
      expect(page).toMatch(/import \{ DateRangePresets \} from "@\/components\/shared\/date-range-presets"/);
    });

    it(`${pageName} renders DateRangePresets with from/to state wired both ways`, () => {
      expect(page).toMatch(/<DateRangePresets[\s\S]{1,400}value=\{\{ from, to \}\}[\s\S]{1,400}onChange=\{\(r\) => \{ setFrom\(r\.from\); setTo\(r\.to\); \}\}/);
    });
  }

  it("CC drill page hides the 'all-time' chip (per-CC P&L uses month default, not lifetime)", () => {
    expect(PAGES.ccDrillPnl).toMatch(/<DateRangePresets[\s\S]{1,500}hideAllTime/);
  });

  it("entity-pnl page exposes 'all-time' (operator drills lifetime by default)", () => {
    // No hideAllTime override on entity-pnl — the chip stays visible.
    const match = PAGES.entityPnl.match(/<DateRangePresets[\s\S]{1,400}\/>/);
    expect(match).toBeTruthy();
    expect(match![0]).not.toContain("hideAllTime");
  });

  it("entity-ranking page uses its own testid prefix for screenshot scoping", () => {
    expect(PAGES.entityRanking).toContain('testidPrefix="entity-ranking-preset"');
  });
});
