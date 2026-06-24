import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 22 — umrah-entities.ts split smoke (groups CRUD).
 *
 * Scope:
 *   - Carves the 5 groups CRUD routes into a dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-groups.ts
 *       GET    /groups
 *       GET    /groups/:id
 *       POST   /groups
 *       PATCH  /groups/:id
 *       DELETE /groups/:id
 *   - Parent mounts the sub-router via `router.use(groupsRouter)` so the API
 *     surface stays identical.
 *
 * Non-goals (Permanent Hard Rails):
 *   - OPERATIONAL move — no ledger/GL writes anywhere in the carved file.
 *   - No route-body change beyond the IGOC audit-helper conversion.
 *   - split/merge ship here too (POST /groups/:id/split INSERTs umrah_groups, so
 *     it must sit beside the issueNumber call for numbering-coverage). The
 *     transport service-contract sub-resources (transport-requests, cost-
 *     breakdown) deliberately STAY in umrah-entities.ts — a later phase.
 *
 * §F here is the no-ledger guard: groups CRUD + ops must never grow journal writes.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-groups.ts"),
  "utf8",
);

const ROUTES: [string, string][] = [
  ["get", "/groups"],
  ["get", "/groups/:id"],
  ["post", "/groups"],
  ["patch", "/groups/:id"],
  ["delete", "/groups/:id"],
  // Group ops — moved here too (split INSERTs umrah_groups → numbering coupling).
  ["post", "/groups/:id/split"],
  ["post", "/groups/merge"],
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 22 §A — umrah-groups.ts is a valid sub-router file", () => {
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

  it("carries the requireOpenSeason guard helper (moved with the POST)", () => {
    expect(CHILD).toMatch(/async function requireOpenSeason\(/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 22 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(/import\s+groupsRouter\s+from\s+["']\.\/umrah-groups\.js["']/);
  });

  it("parent mounts the sub-router with router.use(groupsRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*groupsRouter\s*\)/);
  });

  it("parent no longer defines requireOpenSeason or the group schemas (moved)", () => {
    expect(PARENT).not.toMatch(/async function requireOpenSeason\(/);
    expect(PARENT).not.toMatch(/const createGroupSchema\b/);
    expect(PARENT).not.toMatch(/const patchGroupSchema\b/);
    expect(PARENT).not.toMatch(/const splitGroupSchema\b/);
    expect(PARENT).not.toMatch(/const mergeGroupsSchema\b/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 5 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 22 §C — all 5 moved routes are present in the child", () => {
  for (const [method, route] of ROUTES) {
    it(`child declares router.${method}("${route}", ...)`, () => {
      expect(CHILD).toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — The moved routes are GONE from the parent (no double mount). The parent
//      KEEPS the transport service-contract sub-resources (/groups/:id/transport-
//      requests, /groups/:id/cost-breakdown) — those are a later phase.
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 22 §D — parent no longer declares the moved routes", () => {
  for (const [method, route] of ROUTES) {
    it(`parent does NOT declare router.${method}("${route}", ...)`, () => {
      expect(PARENT).not.toMatch(new RegExp(`router\\.${method}\\(\\s*["']${esc(route)}["']`));
    });
  }

  it("parent STILL declares the transport sub-resources (not part of this carve)", () => {
    expect(PARENT).toMatch(/router\.post\("\/groups\/:id\/transport-requests"/);
    expect(PARENT).toMatch(/router\.get\("\/groups\/:id\/cost-breakdown"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 22 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 450 lines (was ~861 before this carve, ~353 after)", () => {
    expect(PARENT.split("\n").length).toBeLessThan(450);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §F — NO-LEDGER GUARD: groups CRUD is operational; it must never post GL.
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 22 §F — groups CRUD stays ledger-free", () => {
  it("child contains NO GL / journal posting whatsoever", () => {
    expect(CHILD).not.toMatch(/createGuardedJournalEntry\s*\(|createJournalEntry\s*\(/);
    expect(CHILD).not.toMatch(/postNuskJournalEntries|generateSalesInvoice|registerPayment|reclassifyRevenueForInvoices/);
    expect(CHILD).not.toMatch(/INSERT\s+INTO\s+journal_(entries|lines)/i);
    expect(CHILD).not.toMatch(/UPDATE\s+journal_(entries|lines)/i);
    expect(CHILD).not.toMatch(/DELETE\s+FROM\s+journal_(entries|lines)/i);
    expect(CHILD).not.toMatch(/getAccountCodeFromMapping/);
  });

  it("group writes only ever touch group/pilgrim/numbering tables — never a financial table", () => {
    // INSERT / UPDATE targets in the child are limited to: umrah_groups (CRUD +
    // split/merge), umrah_pilgrims (split/merge re-parent pilgrims between
    // groups), and the numbering_assignments backfill link. Match SQL keywords
    // case-SENSITIVELY (uppercase) so route-handler error strings like "Update
    // group" don't register as writes.
    const writes = CHILD.match(/(?:INSERT INTO|UPDATE)\s+("?[a-zA-Z_][a-zA-Z0-9_]*"?)/g) ?? [];
    for (const w of writes) {
      expect(w).toMatch(/umrah_groups|umrah_pilgrims|numbering_assignments/);
    }
  });
});
