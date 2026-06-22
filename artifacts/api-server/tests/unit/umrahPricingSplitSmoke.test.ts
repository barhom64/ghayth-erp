import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 7 — umrah-entities.ts split smoke.
 *
 * Scope:
 *   - Carves 4 pricing CRUD routes into a dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-pricing.ts
 *   - The parent `umrah-entities.ts` mounts the sub-router via
 *     `router.use(pricingRouter)` so the API surface stays identical
 *     (all paths still resolve under /umrah/pricing...).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No route body change — pure code move + mount.
 *   - No API surface change.
 *
 * Failure modes pinned:
 *   - The new file disappears → §A fails.
 *   - The parent stops mounting it → §B fails.
 *   - One of the 4 routes is missing in the new file → §C fails.
 *   - One of the 4 routes accidentally remains in the parent → §D fails.
 *   - Parent file didn't shrink → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-pricing.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 7 §A — umrah-pricing.ts is a valid sub-router file", () => {
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
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 7 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(
      /import\s+pricingRouter\s+from\s+["']\.\/umrah-pricing\.js["']/,
    );
  });

  it("parent mounts the sub-router with router.use(pricingRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*pricingRouter\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 4 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 7 §C — all 4 moved routes are present in the child", () => {
  const routes: [string, string][] = [
    ["get", "/pricing"],
    ["post", "/pricing"],
    ["patch", "/pricing/:id"],
    ["delete", "/pricing/:id"],
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
// §D — The same 4 routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 7 §D — parent no longer declares the moved routes", () => {
  const routes: [string, string][] = [
    ["get", "/pricing"],
    ["post", "/pricing"],
    ["patch", "/pricing/:id"],
    ["delete", "/pricing/:id"],
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
describe("U-07 Phase 7 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 4910 lines (started ~5036 before this carve, ~4899 after)", () => {
    const lineCount = PARENT.split("\n").length;
    expect(lineCount).toBeLessThan(4910);
  });
});
