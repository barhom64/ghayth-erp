import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 16 — umrah-entities.ts split smoke (analytical reports batch 1).
 *
 * Scope:
 *   - Carves 7 read-only analytical-report routes into the EXISTING
 *     umrah-reports.ts sub-router:
 *       GET /reports/profitability
 *       GET /journal/:sourceType/:sourceId        (read-only GL drill)
 *       GET /assistant/suggestions
 *       GET /reports/catalog
 *       GET /reports/violations-summary
 *       GET /reports/commissions-summary
 *       GET /reports/commissions-summary/export   (CSV)
 *     plus the JOURNAL_DRILL_SOURCES lookup const.
 *   - umrah-reports.ts is already mounted via router.use(reportsRouter) in
 *     umrah-entities.ts, so the API surface stays identical.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No route body change — pure code move.
 *   - No API surface change.
 *   - No ledger touch — all 7 routes are read-only. The /journal route only
 *     SELECTs journal_entries/journal_lines (a GL drill), it does not post.
 *
 * Failure modes pinned:
 *   - A route fails to land in umrah-reports.ts → §C fails.
 *   - A route accidentally remains in umrah-entities.ts → §D fails.
 *   - A write/ledger primitive leaks into the reports file → §B fails.
 *   - Parent file didn't shrink → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const REPORTS = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-reports.ts"),
  "utf8",
);

const MOVED: [string, string][] = [
  ["get", "/reports/profitability"],
  ["get", "/journal/:sourceType/:sourceId"],
  ["get", "/assistant/suggestions"],
  ["get", "/reports/catalog"],
  ["get", "/reports/violations-summary"],
  ["get", "/reports/commissions-summary"],
  ["get", "/reports/commissions-summary/export"],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─────────────────────────────────────────────────────────────────────────────
// §A — Reports file still a valid, already-mounted sub-router with new deps
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 16 §A — umrah-reports.ts stays a valid sub-router", () => {
  it("creates a Router + exports it as default", () => {
    expect(REPORTS).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(REPORTS).toMatch(/^export\s+default\s+router;?\s*$/m);
  });

  it("parent still mounts the reports sub-router (no new wiring needed)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*reportsRouter\s*\)/);
  });

  it("imports the engine/catalog deps the moved routes need", () => {
    expect(REPORTS).toMatch(/getDashboardSuggestions/);
    expect(REPORTS).toMatch(/from\s+["']\.\.\/lib\/umrahAssistantEngine\.js["']/);
    expect(REPORTS).toMatch(/UMRAH_REPORTS_CATALOG/);
    expect(REPORTS).toMatch(/from\s+["']\.\.\/lib\/umrahReportsCatalog\.js["']/);
  });

  it("carries the JOURNAL_DRILL_SOURCES lookup const", () => {
    expect(REPORTS).toMatch(/JOURNAL_DRILL_SOURCES/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Reports file stays read-only / ledger-free
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 16 §B — moved reports are read-only (no ledger leak)", () => {
  it("no write/transaction primitives in the reports file", () => {
    expect(REPORTS).not.toMatch(/INSERT\s+INTO|rawExecute|withTransaction/);
  });

  it("no ledger-posting INVOCATIONS in the reports file", () => {
    expect(REPORTS).not.toMatch(/postNuskJournalEntries\s*\(|reclassifyRevenueForInvoices\s*\(/);
  });

  it("no audit/event write INVOCATIONS in the reports file", () => {
    expect(REPORTS).not.toMatch(/createAuditLog\s*\(|auditFromRequest\s*\(|emitEvent\s*\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 7 routes live in the reports file now
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 16 §C — moved routes are present in umrah-reports.ts", () => {
  for (const [method, route] of MOVED) {
    it(`reports declares router.${method}("${route}", ...)`, () => {
      expect(REPORTS).toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The same routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 16 §D — parent no longer declares the moved routes", () => {
  for (const [method, route] of MOVED) {
    it(`parent does NOT declare router.${method}("${route}", ...)`, () => {
      expect(PARENT).not.toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 16 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 2250 lines (was ~2892 before this carve, ~2141 after)", () => {
    expect(PARENT.split("\n").length).toBeLessThan(2250);
  });
});
