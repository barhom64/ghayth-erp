import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 14 — umrah-entities.ts split smoke (refund requests).
 *
 * Scope:
 *   - Carves the 6 refund-request lifecycle routes into a dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-refunds.ts
 *   - The parent `umrah-entities.ts` mounts the sub-router via
 *     `router.use(refundsRouter)` so the API surface stays identical
 *     (all paths still resolve under /umrah/refund-requests...).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No route body change — pure code move + mount.
 *   - No API surface change.
 *   - No ledger touch — every write targets the umrah-owned
 *     umrah_refund_requests table only; the /pay route records settlement
 *     metadata but posts NO journal entry.
 *
 * Failure modes pinned:
 *   - The new file disappears → §A fails.
 *   - The parent stops mounting it → §B fails.
 *   - A route is missing in the new file → §C fails.
 *   - A route accidentally remains in the parent → §D fails.
 *   - Parent file didn't shrink → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-refunds.ts"),
  "utf8",
);

const ROUTES: [string, string][] = [
  ["get", "/refund-requests"],
  ["post", "/refund-requests"],
  ["post", "/refund-requests/:id/approve"],
  ["post", "/refund-requests/:id/reject"],
  ["post", "/refund-requests/:id/pay"],
  ["post", "/refund-requests/:id/close"],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 14 §A — umrah-refunds.ts is a valid sub-router file", () => {
  it("file is non-empty + imports Router from express", () => {
    expect(CHILD.length).toBeGreaterThan(1000);
    expect(CHILD).toMatch(/import\s*\{\s*Router\s*\}\s+from\s+["']express["']/);
  });

  it("creates a Router + exports it as default", () => {
    expect(CHILD).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(CHILD).toMatch(/^export\s+default\s+router;?\s*$/m);
  });

  it("uses auditFromRequest (IGOC ratchet) — not the legacy createAuditLog directly", () => {
    expect(CHILD).toMatch(/auditFromRequest/);
    expect(CHILD).not.toMatch(/\bcreateAuditLog\s*\(/);
    expect(CHILD).not.toMatch(/import\s*\{[^}]*createAuditLog[^}]*\}\s*from/);
  });

  it("is ledger-free — no journal posting, only umrah_refund_requests writes", () => {
    expect(CHILD).not.toMatch(/postNuskJournalEntries\s*\(|reclassifyRevenueForInvoices\s*\(|journal_entries|journal_lines/);
    // The only INSERT/UPDATE targets are the umrah-owned refund table.
    expect(CHILD).toMatch(/INSERT INTO umrah_refund_requests/);
    expect(CHILD).toMatch(/UPDATE umrah_refund_requests/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 14 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(/import\s+refundsRouter\s+from\s+["']\.\/umrah-refunds\.js["']/);
  });

  it("parent mounts the sub-router with router.use(refundsRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*refundsRouter\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 6 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 14 §C — all moved routes are present in the child", () => {
  for (const [method, route] of ROUTES) {
    it(`child declares router.${method}("${route}", ...)`, () => {
      expect(CHILD).toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The same routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 14 §D — parent no longer declares the moved routes", () => {
  for (const [method, route] of ROUTES) {
    it(`parent does NOT declare router.${method}("${route}", ...)`, () => {
      expect(PARENT).not.toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 14 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 3300 lines (was ~3441 before this carve, ~3210 after)", () => {
    expect(PARENT.split("\n").length).toBeLessThan(3300);
  });
});
