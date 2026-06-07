import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Pin the Hijri-as-origin date display across the umrah module.
 *
 *   The system stores dates as Gregorian (`YYYY-MM-DD`) but umrah
 *   operators think in Hijri ("حج ١٤٤٦"). The global calendar mode
 *   used to be "gregorian", and umrah pages called `formatDateAr`
 *   which respected that — so an operator looking at a pilgrim's
 *   arrival date saw "23 يونيو ٢٠٢٥" instead of the Hijri equivalent
 *   that matches the season name.
 *
 *   Fix: `formatUmrahDate(dateStr)` always renders dual Gregorian +
 *   Hijri ("23 يونيو 2025 / 17 محرم 1446"). The umrah pages call this
 *   helper instead of `formatDateAr`, so the dates are dual regardless
 *   of the global setting. Operators in other modules (finance, HR)
 *   keep their preferred mode.
 */
const FORMATTERS = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/lib/formatters.ts"),
  "utf8",
);

const UMRAH_PAGES_DIR = join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah");
const UMRAH_REPORTS_DIR = join(UMRAH_PAGES_DIR, "reports");

function listUmrahPages(): string[] {
  const out: string[] = [];
  for (const f of readdirSync(UMRAH_PAGES_DIR)) {
    if (f.endsWith(".tsx")) out.push(join(UMRAH_PAGES_DIR, f));
  }
  for (const f of readdirSync(UMRAH_REPORTS_DIR)) {
    if (f.endsWith(".tsx")) out.push(join(UMRAH_REPORTS_DIR, f));
  }
  return out;
}

describe("formatUmrahDate helper", () => {
  it("is exported from @/lib/formatters", () => {
    expect(FORMATTERS).toMatch(/export function formatUmrahDate\(dateStr: string \| Date \| null \| undefined\): string/);
  });

  it("delegates to formatDateBoth (always dual calendar)", () => {
    // Identity-equal to formatDateBoth today — the wrapper exists so
    // future per-module preferences only touch this one function.
    expect(FORMATTERS).toMatch(/return formatDateBoth\(dateStr\)/);
  });

  it("formatDateBoth still emits Gregorian / Hijri pair (regression guard)", () => {
    expect(FORMATTERS).toMatch(/return `\$\{fmtGregorian\(d, "long"\)\} \/ \$\{fmtHijri\(d, "long"\)\}`/);
  });
});

describe("umrah pages route through formatUmrahDate, not formatDateAr", () => {
  const pages = listUmrahPages();

  it("found a non-trivial number of umrah pages (regression guard if the dir moves)", () => {
    expect(pages.length).toBeGreaterThan(10);
  });

  it.each(pages.map((p) => [p.split("/").slice(-2).join("/")]))(
    "%s — no formatDateAr calls survive in the umrah module",
    (rel) => {
      const full = pages.find((p) => p.endsWith(rel))!;
      const src = readFileSync(full, "utf8");
      // formatDateAr can still be referenced in comments (text after //),
      // but no function CALL or IMPORT should survive. The call form is
      // `formatDateAr(` and the import form is the bare token followed
      // by a comma or closing brace from the named-import group.
      expect(src).not.toMatch(/\bformatDateAr\(/);
      expect(src).not.toMatch(/\bformatDateAr,/);
      expect(src).not.toMatch(/,\s*formatDateAr\b/);
      expect(src).not.toMatch(/\{\s*formatDateAr\s*\}/);
    },
  );
});
