import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 9 — umrah-entities.ts split smoke.
 *
 * Scope:
 *   - Carves the 2 read-only sub-agent statement routes (JSON + PDF) into a
 *     dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-statements.ts
 *   - The parent `umrah-entities.ts` mounts the sub-router via
 *     `router.use(statementsRouter)` so the API surface stays identical
 *     (all paths still resolve under /umrah/statements/...).
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
 *   - One of the 2 routes is missing in the new file → §C fails.
 *   - One of the 2 routes accidentally remains in the parent → §D fails.
 *   - Parent file didn't shrink → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-statements.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 9 §A — umrah-statements.ts is a valid sub-router file", () => {
  it("file is non-empty + imports Router from express", () => {
    expect(CHILD.length).toBeGreaterThan(800);
    expect(CHILD).toMatch(/import\s*\{\s*Router\s*\}\s+from\s+["']express["']/);
  });

  it("creates a Router + exports it as default", () => {
    expect(CHILD).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(CHILD).toMatch(/^export\s+default\s+router;?\s*$/m);
  });

  it("imports the helpers it needs (rawdb + authorize + errorHandler + engines)", () => {
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/rawdb\.js["']/);
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/rbac\/authorize\.js["']/);
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/errorHandler\.js["']/);
    expect(CHILD).toMatch(/generateStatement/);
    expect(CHILD).toMatch(/renderPrint/);
  });

  it("is a read-only carve — no writes, no ledger posting, no audit/event helpers", () => {
    expect(CHILD).not.toMatch(/INSERT\s+INTO|UPDATE\s+\w|rawExecute|withTransaction/);
    expect(CHILD).not.toMatch(/postNuskJournalEntries|reclassifyRevenueForInvoices/);
    expect(CHILD).not.toMatch(/createAuditLog|auditFromRequest|emitEvent/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 9 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(
      /import\s+statementsRouter\s+from\s+["']\.\/umrah-statements\.js["']/,
    );
  });

  it("parent mounts the sub-router with router.use(statementsRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*statementsRouter\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — Both routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 9 §C — both moved routes are present in the child", () => {
  const routes: [string, string][] = [
    ["get", "/statements/:subAgentId"],
    ["get", "/statements/:subAgentId/pdf"],
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
// §D — The same routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 9 §D — parent no longer declares the moved routes", () => {
  const routes: [string, string][] = [
    ["get", "/statements/:subAgentId"],
    ["get", "/statements/:subAgentId/pdf"],
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
describe("U-07 Phase 9 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 4620 lines (started ~4669 before this carve, ~4585 after)", () => {
    const lineCount = PARENT.split("\n").length;
    expect(lineCount).toBeLessThan(4620);
  });
});
