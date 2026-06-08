import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Inline sparkline — tiny SVG strip rendered inside metric cells on
 * the two drill P&L pages (entity + cost-centre). Reuses the series
 * already fetched for the trend chart, so no new endpoint is needed.
 * The component is a pure presentational primitive — invariants
 * checked here are: edge-case suppression (no flat-line noise),
 * polarity-preserving polyline, tone → stroke class mapping.
 */

const COMPONENT = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/inline-sparkline.tsx"),
  "utf8",
);
const ENTITY_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/entity-pnl.tsx"),
  "utf8",
);
const CC_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/finance/cost-center-drill-pnl.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
describe("InlineSparkline — presentational invariants", () => {
  it("renders nothing on empty / single-point arrays (no useful chart)", () => {
    expect(COMPONENT).toMatch(/if \(!values \|\| values\.length < 2\) return null;/);
  });

  it("renders nothing on all-zero series (would be flat-line noise)", () => {
    expect(COMPONENT).toMatch(/const allZero = values\.every\(\(v\) => v === 0\);/);
    expect(COMPONENT).toMatch(/if \(allZero\) return null;/);
  });

  it("avoids div-by-zero on a flat non-zero series via `range = max - min || 1`", () => {
    expect(COMPONENT).toMatch(/const range = max - min \|\| 1;/);
  });

  it("STROKE_BY_TONE table covers all 4 tones (success / warning / muted / neutral)", () => {
    expect(COMPONENT).toMatch(/success: "stroke-status-success-foreground"/);
    expect(COMPONENT).toMatch(/warning: "stroke-status-warning-foreground"/);
    expect(COMPONENT).toMatch(/muted:[\s]+"stroke-muted-foreground"/);
    expect(COMPONENT).toMatch(/neutral: "stroke-foreground"/);
  });

  it("maps index → x linearly and value → y inverted (SVG y-axis grows down)", () => {
    expect(COMPONENT).toMatch(/const x = padX \+ \(i \/ \(values\.length - 1\)\) \* usableW/);
    expect(COMPONENT).toMatch(/const y = padY \+ \(\(max - v\) \/ range\) \* usableH/);
  });

  it("renders a polyline (not Path / not bar) — fastest svg primitive at this size", () => {
    expect(COMPONENT).toMatch(/<polyline[\s\S]{0,400}points=\{points\.join\(" "\)\}/);
    expect(COMPONENT).toMatch(/fill="none"/);
    expect(COMPONENT).toMatch(/strokeLinejoin="round"/);
  });

  it("end-of-series dot marks the operator's 'you are here' point", () => {
    expect(COMPONENT).toMatch(/<circle[\s\S]{0,200}cx=\{lastX\}[\s\S]{0,100}cy=\{lastY\}/);
  });

  it("aria-hidden + testid prop forwards so a11y is correct and selectors are stable", () => {
    expect(COMPONENT).toMatch(/aria-hidden="true"/);
    expect(COMPONENT).toMatch(/data-testid=\{testid\}/);
  });

  it("default width / height match the metric-cell budget (~80×24px)", () => {
    expect(COMPONENT).toMatch(/width = 80/);
    expect(COMPONENT).toMatch(/height = 24/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Page wirings — both BucketCards thread series → Metric → InlineSparkline
// ─────────────────────────────────────────────────────────────────────────────
describe("entity-pnl page — sparkline wired into Metric cells", () => {
  it("imports the shared sparkline component", () => {
    expect(ENTITY_PAGE).toMatch(/import \{ InlineSparkline \} from "@\/components\/shared\/inline-sparkline"/);
  });

  it("BucketCard slices the last 12 buckets per metric for the sparkline", () => {
    expect(ENTITY_PAGE).toMatch(/const revSpark = series\?\.buckets\.slice\(-12\)\.map\(\(b\) => b\.revenue\) \?\? \[\]/);
    expect(ENTITY_PAGE).toMatch(/const expSpark = series\?\.buckets\.slice\(-12\)\.map\(\(b\) => b\.expense\) \?\? \[\]/);
    expect(ENTITY_PAGE).toMatch(/const netSpark = series\?\.buckets\.slice\(-12\)\.map\(\(b\) => b\.net\) \?\? \[\]/);
  });

  it("Metric component accepts spark prop and renders InlineSparkline when ≥2 points", () => {
    expect(ENTITY_PAGE).toMatch(/spark\?: number\[\]/);
    expect(ENTITY_PAGE).toMatch(/\{spark && spark\.length >= 2 && \(/);
    expect(ENTITY_PAGE).toMatch(/<InlineSparkline[\s\S]{0,200}values=\{spark\}/);
  });

  it("testid for the sparkline derives from the parent metric testid (selector hygiene)", () => {
    expect(ENTITY_PAGE).toMatch(/testid=\{`\$\{testid\}-spark`\}/);
  });
});

describe("cost-center-drill-pnl page — sparkline wired into Metric cells", () => {
  it("imports the shared sparkline component", () => {
    expect(CC_PAGE).toMatch(/import \{ InlineSparkline \} from "@\/components\/shared\/inline-sparkline"/);
  });

  it("BucketCard slices the last 12 buckets per metric for the sparkline (same shape as entity-pnl)", () => {
    // Drift alarm: if these diverge the two pages will show
    // inconsistent sparkline windows.
    expect(CC_PAGE).toMatch(/const revSpark = series\?\.buckets\.slice\(-12\)\.map\(\(b\) => b\.revenue\) \?\? \[\]/);
    expect(CC_PAGE).toMatch(/const expSpark = series\?\.buckets\.slice\(-12\)\.map\(\(b\) => b\.expense\) \?\? \[\]/);
    expect(CC_PAGE).toMatch(/const netSpark = series\?\.buckets\.slice\(-12\)\.map\(\(b\) => b\.net\) \?\? \[\]/);
  });

  it("BucketCard signature accepts series so both `self` + `rolled` cards can render sparklines", () => {
    expect(CC_PAGE).toMatch(/series: SeriesResponse \| null;/);
    // Both callers thread series through — drift alarm.
    expect(CC_PAGE).toMatch(/title="على هذا المركز فقط"[\s\S]{0,200}series=\{series \?\? null\}/);
    expect(CC_PAGE).toMatch(/title=\{`تجميعي[\s\S]{0,200}series=\{series \?\? null\}/);
  });

  it("Metric component accepts spark prop and renders InlineSparkline when ≥2 points", () => {
    expect(CC_PAGE).toMatch(/spark\?: number\[\]/);
    expect(CC_PAGE).toMatch(/\{spark && spark\.length >= 2 && \(/);
    expect(CC_PAGE).toMatch(/<InlineSparkline[\s\S]{0,200}values=\{spark\}/);
  });
});
