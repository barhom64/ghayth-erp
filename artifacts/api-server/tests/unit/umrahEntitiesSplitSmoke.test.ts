import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 1 — umrah-entities.ts split smoke.
 *
 * Scope (autonomous-class under
 * UMRAH_REMAINING_WORK_ROADMAP.md §4 + U-07 audit):
 *   - Carves the 4 journey + recovery + pricing-drift read paths into
 *     a dedicated sub-router file:
 *       artifacts/api-server/src/routes/umrah-journey-reports.ts
 *   - The parent `umrah-entities.ts` mounts the sub-router via
 *     `router.use(journeyReportsRouter)` so the API surface stays
 *     identical (all paths still resolve under /umrah/...).
 *   - First step of the wider U-07 split (the original file was
 *     ~6700 lines; this Phase 1 brings it down to ~6120).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No route body change — pure code move + mount.
 *   - No API surface change — the routes still resolve at the same
 *     URLs because the new sub-router has no prefix.
 *
 * Failure modes pinned:
 *   - The new file disappears → §A fails.
 *   - The parent stops mounting it → §B fails.
 *   - One of the 4 routes is missing in the new file → §C fails.
 *   - One of the 4 routes accidentally remains in the parent (double
 *     mount risk) → §D fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-journey-reports.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 1 §A — umrah-journey-reports.ts is a valid sub-router file", () => {
  it("file is non-empty + imports Router from express", () => {
    expect(CHILD.length).toBeGreaterThan(1000);
    expect(CHILD).toMatch(/import\s*\{\s*Router\s*\}\s+from\s+["']express["']/);
  });

  it("creates a Router + exports it as default", () => {
    expect(CHILD).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(CHILD).toMatch(/^export\s+default\s+router;?\s*$/m);
  });

  it("imports the same helpers the parent uses (rawQuery + authorize + errorHandler)", () => {
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/rawdb\.js["']/);
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/rbac\/authorize\.js["']/);
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/errorHandler\.js["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 1 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(
      /import\s+journeyReportsRouter\s+from\s+["']\.\/umrah-journey-reports\.js["']/,
    );
  });

  it("parent mounts the sub-router with router.use(journeyReportsRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*journeyReportsRouter\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 4 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 1 §C — all 4 moved routes are present in the child", () => {
  for (const route of [
    "/sub-agents/:id/journey",
    "/groups/:id/journey",
    "/reports/packages-vs-allocations-pricing-drift",
    "/reports/recovery-hub",
  ]) {
    it(`child file declares router.get("${route}", ...)`, () => {
      const re = new RegExp(
        `router\\.get\\(\\s*\\n?\\s*["']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      );
      expect(CHILD).toMatch(re);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The same 4 routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 1 §D — parent no longer declares the moved routes", () => {
  for (const route of [
    "/sub-agents/:id/journey",
    "/groups/:id/journey",
    "/reports/packages-vs-allocations-pricing-drift",
    "/reports/recovery-hub",
  ]) {
    it(`parent does NOT declare router.get("${route}", ...)`, () => {
      const re = new RegExp(
        `router\\.get\\(\\s*\\n?\\s*["']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      );
      expect(PARENT).not.toMatch(re);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 1 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 6400 lines (started ~6700)", () => {
    const lineCount = PARENT.split("\n").length;
    expect(lineCount).toBeLessThan(6400);
  });
});
