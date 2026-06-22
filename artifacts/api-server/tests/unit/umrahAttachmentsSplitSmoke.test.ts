import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 10 — umrah-entities.ts split smoke.
 *
 * Scope:
 *   - Carves the 3 attachments routes (polymorphic document storage) into a
 *     dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-attachments.ts
 *   - The parent `umrah-entities.ts` mounts the sub-router via
 *     `router.use(attachmentsRouter)` so the API surface stays identical
 *     (all paths still resolve under /umrah/attachments...).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No route body change — pure code move + mount.
 *   - No API surface change.
 *   - No ledger touch — attachments write to the shared documents store, not GL.
 *
 * Failure modes pinned:
 *   - The new file disappears → §A fails.
 *   - The parent stops mounting it → §B fails.
 *   - One of the 3 routes is missing in the new file → §C fails.
 *   - One of the 3 routes accidentally remains in the parent → §D fails.
 *   - Parent file didn't shrink → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-attachments.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 10 §A — umrah-attachments.ts is a valid sub-router file", () => {
  it("file is non-empty + imports Router from express", () => {
    expect(CHILD.length).toBeGreaterThan(1000);
    expect(CHILD).toMatch(/import\s*\{\s*Router\s*\}\s+from\s+["']express["']/);
  });

  it("creates a Router + exports it as default", () => {
    expect(CHILD).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(CHILD).toMatch(/^export\s+default\s+router;?\s*$/m);
  });

  it("imports the same helpers the parent uses (rawdb + authorize + errorHandler)", () => {
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/rawdb\.js["']/);
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/rbac\/authorize\.js["']/);
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/errorHandler\.js["']/);
  });

  it("uses auditFromRequest (IGOC ratchet) — not the legacy createAuditLog directly", () => {
    expect(CHILD).toMatch(/auditFromRequest/);
    expect(CHILD).not.toMatch(/import\s*\{[^}]*createAuditLog[^}]*\}\s*from/);
  });

  it("posts NO journal entries (ledger-free carve)", () => {
    expect(CHILD).not.toMatch(/postNuskJournalEntries|reclassifyRevenueForInvoices|journal_entries/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 10 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(
      /import\s+attachmentsRouter\s+from\s+["']\.\/umrah-attachments\.js["']/,
    );
  });

  it("parent mounts the sub-router with router.use(attachmentsRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*attachmentsRouter\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 3 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 10 §C — all 3 moved routes are present in the child", () => {
  const routes: [string, string][] = [
    ["get", "/attachments"],
    ["post", "/attachments"],
    ["delete", "/attachments/:id"],
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
// §D — The same 3 routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 10 §D — parent no longer declares the moved routes", () => {
  const routes: [string, string][] = [
    ["get", "/attachments"],
    ["post", "/attachments"],
    ["delete", "/attachments/:id"],
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
describe("U-07 Phase 10 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 4460 lines (started ~4585 before this carve, ~4429 after)", () => {
    const lineCount = PARENT.split("\n").length;
    expect(lineCount).toBeLessThan(4460);
  });
});
