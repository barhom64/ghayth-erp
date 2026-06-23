import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 13 — umrah-entities.ts split smoke (dashboard / compliance reports).
 *
 * Scope:
 *   - Carves the 4 read-only dashboard/compliance reports out of
 *     umrah-entities.ts into the EXISTING umrah-reports.ts sub-router:
 *       GET /reports/compliance
 *       GET /reports/agent-balances
 *       GET /reports/pilgrim-movements
 *       GET /reports/subagent-balances
 *   - umrah-reports.ts is already mounted via router.use(reportsRouter) in
 *     umrah-entities.ts, so the API surface stays identical (all paths still
 *     resolve under /umrah/reports/...).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No route body change — pure code move.
 *   - No API surface change.
 *   - No ledger touch — all 4 routes are pure SELECT aggregates. The
 *     ledger-touching /reclassify-revenue endpoint deliberately STAYS in
 *     umrah-entities.ts.
 *
 * Failure modes pinned:
 *   - A route fails to land in umrah-reports.ts → §C fails.
 *   - A route accidentally remains in umrah-entities.ts → §D fails.
 *   - reclassify-revenue (ledger) leaks into the reports file → §B fails.
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

const MOVED_ROUTES = [
  "/reports/compliance",
  "/reports/agent-balances",
  "/reports/pilgrim-movements",
  "/reports/subagent-balances",
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─────────────────────────────────────────────────────────────────────────────
// §A — Reports file is still a valid, already-mounted sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 13 §A — umrah-reports.ts stays a valid sub-router", () => {
  it("creates a Router + exports it as default", () => {
    expect(REPORTS).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(REPORTS).toMatch(/^export\s+default\s+router;?\s*$/m);
  });

  it("parent still mounts the reports sub-router (no new wiring needed)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*reportsRouter\s*\)/);
    expect(PARENT).toMatch(/import\s+reportsRouter\s+from\s+["']\.\/umrah-reports\.js["']/);
  });

  it("imports the nationality-rules helper the compliance report needs", () => {
    expect(REPORTS).toMatch(/gccExclusionSqlFragment/);
    expect(REPORTS).toMatch(/from\s+["']\.\.\/lib\/umrahNationalityRules\.js["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Reports file stays read-only / ledger-free
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 13 §B — moved reports are read-only (no ledger leak)", () => {
  it("no write/transaction primitives in the reports file", () => {
    expect(REPORTS).not.toMatch(/INSERT\s+INTO|rawExecute|withTransaction/);
  });

  it("no ledger-posting INVOCATIONS in the reports file", () => {
    expect(REPORTS).not.toMatch(/postNuskJournalEntries\s*\(|reclassifyRevenueForInvoices\s*\(/);
  });

  it("the ledger-touching reclassify endpoint did NOT leak into the reports carve", () => {
    // Phase 13 invariant: the dashboard-reports carve must not drag the
    // ledger-touching reclassify endpoint into umrah-reports.ts. It originally
    // stayed in the parent; U-07 Phase 20 later moved it to umrah-payments.ts
    // (its own finance sub-router) — never into reports.
    const PAYMENTS = readFileSync(
      join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-payments.ts"),
      "utf8",
    );
    expect(REPORTS).not.toMatch(/router\.(post|put)\(\s*["']\/reclassify-revenue["']/);
    expect(PARENT).not.toMatch(/router\.(post|put)\(\s*["']\/reclassify-revenue["']/);
    expect(PAYMENTS).toMatch(/router\.(post|put)\(\s*["']\/reclassify-revenue["']/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 4 routes live in the reports file now
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 13 §C — moved routes are present in umrah-reports.ts", () => {
  for (const route of MOVED_ROUTES) {
    it(`reports declares router.get("${route}", ...)`, () => {
      expect(REPORTS).toMatch(new RegExp(`router\\.get\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The same routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 13 §D — parent no longer declares the moved routes", () => {
  for (const route of MOVED_ROUTES) {
    it(`parent does NOT declare router.get("${route}", ...)`, () => {
      expect(PARENT).not.toMatch(new RegExp(`router\\.get\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 13 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 3500 lines (was ~3872 before this carve, ~3441 after)", () => {
    expect(PARENT.split("\n").length).toBeLessThan(3500);
  });
});
