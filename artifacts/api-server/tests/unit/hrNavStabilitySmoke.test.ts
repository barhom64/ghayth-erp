/**
 * HR top-nav stability — static guard.
 *
 * Companion to e2e/tests/persona-hr-nav-stability.spec.ts. The e2e
 * spec runs Playwright against a live dev server and produces visual
 * snapshots; that's the authoritative visual proof but it costs a
 * full browser run. This unit-level test stays cheap and runs in
 * `guard.sh`, catching the contract violations that produced the
 * "top strip changes between pages" complaint in the first place.
 *
 * Asserts (statically, from source):
 *   1. Every HR list page imports HrTabsNav from the canonical path.
 *   2. Every HR list page renders <HrTabsNav /> exactly once.
 *   3. Every HR list page passes a breadcrumbs prop with at least 2
 *      crumbs (module link + current-page label).
 *   4. Every HR list page passes a subtitle prop (uniform header height).
 *   5. No HR list page reimplements its own TabsNav-shaped strip
 *      OUTSIDE the canonical HrTabsNav.
 *
 * If any of these fails, the visual snapshot diff in the e2e spec
 * would catch it too — but this test catches it BEFORE the e2e run,
 * keeping the CI loop fast.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGES_ROOT = join(
  import.meta.dirname!,
  "..",
  "..",
  "..",
  "ghayth-erp",
  "src",
  "pages",
);

// The 5 pages the user specifically called out as visually unstable.
const HR_PAGES = [
  "employees.tsx",
  "hr/attendance.tsx",
  "hr/leaves.tsx",
  "hr/training.tsx",
  "hr/violations.tsx",
];

function readPage(relPath: string): string {
  return readFileSync(join(PAGES_ROOT, relPath), "utf8");
}

describe("HR top-nav stability — static guard", () => {
  for (const page of HR_PAGES) {
    describe(page, () => {
      const src = readPage(page);

      it("imports HrTabsNav from the canonical path", () => {
        expect(src).toMatch(
          /import\s*\{\s*HrTabsNav\s*\}\s*from\s+["'][^"']*shared\/hr-tabs-nav["']/,
        );
      });

      it("renders <HrTabsNav /> exactly once", () => {
        const matches = src.match(/<HrTabsNav\b/g) ?? [];
        expect(
          matches.length,
          `expected exactly one <HrTabsNav /> render, found ${matches.length}`,
        ).toBe(1);
      });

      it("passes a breadcrumbs prop with at least 2 levels", () => {
        // The pattern is `breadcrumbs={[ {…}, { label: "<current>" } ]}`
        // — at least one literal `label:` after a closing `}`.
        const m = src.match(/breadcrumbs=\{\s*\[([\s\S]+?)\]\s*\}/);
        expect(m, "breadcrumbs prop must be set").toBeTruthy();
        if (m) {
          const inside = m[1];
          const labelCount = (inside.match(/label\s*:/g) ?? []).length;
          expect(
            labelCount,
            "breadcrumbs must have at least 2 entries (module + current-page)",
          ).toBeGreaterThanOrEqual(2);
        }
      });

      it("passes a subtitle prop to PageShell", () => {
        // Skip violations error branch — it only takes title + breadcrumbs.
        // The success/loading branches must have subtitle.
        const subtitleMatches = src.match(/subtitle="/g) ?? [];
        expect(
          subtitleMatches.length,
          "PageShell call must pass a subtitle for uniform header height",
        ).toBeGreaterThanOrEqual(1);
      });

      it("does not reimplement TabsNav inline (no second border-b-2 strip in main)", () => {
        // The signature class string `border-b-2 transition-colors whitespace-nowrap`
        // only appears inside actual TabsNav components (canonical). Any
        // page-local copy would be a duplication.
        const matches =
          src.match(/border-b-2 transition-colors whitespace-nowrap/g) ?? [];
        expect(
          matches.length,
          "page must not reimplement HrTabsNav-style strip inline",
        ).toBe(0);
      });
    });
  }

  it("all 5 HR pages share the same module link in breadcrumbs", () => {
    for (const page of HR_PAGES) {
      const src = readPage(page);
      expect(
        src,
        `${page} must link to /hr in breadcrumbs`,
      ).toMatch(/href:\s*["']\/hr["']/);
      expect(
        src,
        `${page} must use the canonical module label`,
      ).toMatch(/label:\s*["']الموارد البشرية["']/);
    }
  });

  it("HrTabsNav mirrors the sidebar's top-level groups in declared order", () => {
    const navSrc = readFileSync(
      join(
        PAGES_ROOT,
        "..",
        "components",
        "shared",
        "hr-tabs-nav.tsx",
      ),
      "utf8",
    );
    // Extract the labels in declared order from the TABS array.
    const labelOrder: string[] = [];
    const re = /label:\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(navSrc)) !== null) labelOrder.push(m[1]);
    // HR-REV — the horizontal bar now mirrors the sidebar's top-level groups
    // 1:1 (dashboard + the 8 functional groups) instead of a flat entity list.
    expect(labelOrder).toEqual([
      "لوحة HR",
      "الموظفون",
      "النشاط والحضور",
      "الطلبات",
      "الامتثال والجزاءات",
      "الأداء والتطوير",
      "الرواتب والمستحقات",
      "التقارير",
      "الإعدادات",
    ]);
  });
});
