import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 6 — umrah-entities.ts split smoke.
 *
 * Scope:
 *   - Carves 9 sub-agent routes (CRUD + linking) into a dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-sub-agents.ts
 *   - The parent `umrah-entities.ts` mounts the sub-router via
 *     `router.use(subAgentsRouter)` so the API surface stays identical
 *     (all paths still resolve under /umrah/sub-agents/...).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch.
 *   - No route body change — pure code move + mount.
 *   - No API surface change.
 *
 * Failure modes pinned:
 *   - The new file disappears → §A fails.
 *   - The parent stops mounting it → §B fails.
 *   - One of the 9 routes is missing in the new file → §C fails.
 *   - One of the 9 routes accidentally remains in the parent → §D fails.
 *   - Parent file didn't shrink → §E fails.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-sub-agents.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 6 §A — umrah-sub-agents.ts is a valid sub-router file", () => {
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

  it("uses auditFromRequest (IGOC ratchet) — not the legacy createAuditLog directly", () => {
    expect(CHILD).toMatch(/auditFromRequest/);
    expect(CHILD).not.toMatch(/import\s*\{[^}]*createAuditLog[^}]*\}\s*from/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 6 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(
      /import\s+subAgentsRouter\s+from\s+["']\.\/umrah-sub-agents\.js["']/,
    );
  });

  it("parent mounts the sub-router with router.use(subAgentsRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*subAgentsRouter\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 9 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 6 §C — all 9 moved routes are present in the child", () => {
  const routes: [string, string][] = [
    ["get", "/sub-agents"],
    ["post", "/sub-agents"],
    ["get", "/sub-agents/unlinked"],
    ["get", "/sub-agents/:id"],
    ["patch", "/sub-agents/:id"],
    ["delete", "/sub-agents/:id"],
    ["put", "/sub-agents/:id/link"],
    ["post", "/sub-agents/link-by-nusk"],
    ["post", "/sub-agents/:id/link-client"],
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
// §D — The same 9 routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 6 §D — parent no longer declares the moved routes", () => {
  const routes: [string, string][] = [
    ["get", "/sub-agents"],
    ["post", "/sub-agents"],
    ["get", "/sub-agents/unlinked"],
    ["get", "/sub-agents/:id"],
    ["patch", "/sub-agents/:id"],
    ["delete", "/sub-agents/:id"],
    ["put", "/sub-agents/:id/link"],
    ["post", "/sub-agents/link-by-nusk"],
    ["post", "/sub-agents/:id/link-client"],
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
describe("U-07 Phase 6 §E — parent shrunk below the pre-split line count", () => {
  it("parent file has fewer than 5450 lines (started ~5443 before this carve, ~5090 after)", () => {
    const lineCount = PARENT.split("\n").length;
    expect(lineCount).toBeLessThan(5090);
  });
});
