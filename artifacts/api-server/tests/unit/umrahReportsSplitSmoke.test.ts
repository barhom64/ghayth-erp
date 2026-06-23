import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 11 — umrah-entities.ts split smoke.
 *
 * Scope:
 *   - Carves the 6 read-only operational reports into a dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-reports.ts
 *     (daily-runsheet [+pdf], reconciliation, exempt-pilgrims,
 *      group-portfolio, season-portfolio)
 *   - The parent `umrah-entities.ts` mounts the sub-router via
 *     `router.use(reportsRouter)` so the API surface stays identical
 *     (all paths still resolve under /umrah/reports/...).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No route body change — pure code move + mount.
 *   - No API surface change.
 *   - Read-only — no writes, no ledger touch, no direct cross-domain writes.
 *
 * Failure modes pinned:
 *   - The new file disappears → §A fails.
 *   - The parent stops mounting it → §B fails.
 *   - One of the 6 routes is missing in the new file → §C fails.
 *   - One of the 6 routes accidentally remains in the parent → §D fails.
 *   - Parent file didn't shrink → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-reports.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 11 §A — umrah-reports.ts is a valid sub-router file", () => {
  it("file is non-empty + imports Router from express", () => {
    expect(CHILD.length).toBeGreaterThan(2000);
    expect(CHILD).toMatch(/import\s*\{\s*Router\s*\}\s+from\s+["']express["']/);
  });

  it("creates a Router + exports it as default", () => {
    expect(CHILD).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(CHILD).toMatch(/^export\s+default\s+router;?\s*$/m);
  });

  it("imports the helpers it needs (rawdb + authorize + errorHandler + print)", () => {
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/rawdb\.js["']/);
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/rbac\/authorize\.js["']/);
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/errorHandler\.js["']/);
    expect(CHILD).toMatch(/renderPrint/);
  });

  it("is a read-only carve — no writes, no ledger posting, no audit/event helpers", () => {
    expect(CHILD).not.toMatch(/INSERT\s+INTO|rawExecute|withTransaction/);
    // Match actual ledger-posting INVOCATIONS (open paren), not incidental
    // comment mentions of the helper names — the U-07 Phase 13 compliance
    // report carries a comment referencing postNuskJournalEntries to explain a
    // column's provenance while doing nothing but SELECT.
    expect(CHILD).not.toMatch(/postNuskJournalEntries\s*\(|reclassifyRevenueForInvoices\s*\(/);
    expect(CHILD).not.toMatch(/createAuditLog\s*\(|auditFromRequest\s*\(|emitEvent\s*\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 11 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(
      /import\s+reportsRouter\s+from\s+["']\.\/umrah-reports\.js["']/,
    );
  });

  it("parent mounts the sub-router with router.use(reportsRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*reportsRouter\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 6 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 11 §C — all 6 moved routes are present in the child", () => {
  const routes: [string, string][] = [
    ["get", "/reports/daily-runsheet"],
    ["get", "/reports/daily-runsheet/pdf"],
    ["get", "/reports/reconciliation"],
    ["get", "/reports/exempt-pilgrims"],
    ["get", "/reports/group-portfolio"],
    ["get", "/reports/season-portfolio"],
  ];
  for (const [method, route] of routes) {
    it(`child declares router.${method}("${route}", ...)`, () => {
      const re = new RegExp(
        `router\\.${method}\\(\\s*["']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      );
      expect(CHILD).toMatch(re);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The same 6 routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 11 §D — parent no longer declares the moved routes", () => {
  const routes: [string, string][] = [
    ["get", "/reports/daily-runsheet"],
    ["get", "/reports/daily-runsheet/pdf"],
    ["get", "/reports/reconciliation"],
    ["get", "/reports/exempt-pilgrims"],
    ["get", "/reports/group-portfolio"],
    ["get", "/reports/season-portfolio"],
  ];
  for (const [method, route] of routes) {
    it(`parent does NOT declare router.${method}("${route}", ...)`, () => {
      const re = new RegExp(
        `router\\.${method}\\(\\s*["']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      );
      expect(PARENT).not.toMatch(re);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 11 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 4010 lines (started ~4429 before this carve, ~3974 after)", () => {
    const lineCount = PARENT.split("\n").length;
    expect(lineCount).toBeLessThan(4010);
  });
});
