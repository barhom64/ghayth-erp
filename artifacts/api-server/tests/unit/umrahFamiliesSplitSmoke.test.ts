import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 2 — umrah-entities.ts split, families CRUD carve-out.
 *
 * Mirrors the Phase 1 (journey-reports) smoke. Pins:
 *   - The new sub-router file exists + is a valid Router export.
 *   - The parent mounts the sub-router (so /umrah/families/... still resolves).
 *   - The 5 families CRUD routes ALL live in the child.
 *   - The same 5 routes are GONE from the parent (no double-mount risk).
 *   - The parent file continues to shrink (regression-prevent floor).
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch. Pure code move + mount.
 *   - No API surface change. Same paths, same handlers, same RBAC.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-families.ts"),
  "utf8",
);

const FAMILY_ROUTES: Array<[string, string]> = [
  ["get", "/families"],
  ["get", "/families/:id"],
  ["post", "/families"],
  ["patch", "/families/:id"],
  ["delete", "/families/:id"],
];

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file is a valid sub-router file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 2 §A — umrah-families.ts is a valid sub-router file", () => {
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
describe("U-07 Phase 2 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(
      /import\s+familiesRouter\s+from\s+["']\.\/umrah-families\.js["']/,
    );
  });

  it("parent mounts the sub-router with router.use(familiesRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*familiesRouter\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 5 families routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 2 §C — all 5 families routes are present in the child", () => {
  for (const [verb, route] of FAMILY_ROUTES) {
    it(`child file declares router.${verb}("${route}", ...)`, () => {
      const re = new RegExp(
        `router\\.${verb}\\(\\s*\\n?\\s*["']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      );
      expect(CHILD).toMatch(re);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Same 5 routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 2 §D — parent no longer declares the moved routes", () => {
  for (const [verb, route] of FAMILY_ROUTES) {
    it(`parent does NOT declare router.${verb}("${route}", ...)`, () => {
      const re = new RegExp(
        `router\\.${verb}\\(\\s*\\n?\\s*["']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      );
      expect(PARENT).not.toMatch(re);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §E — Parent file shrunk (regression-prevent floor)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 2 §E — parent shrunk below the post-Phase-1 line count", () => {
  it("parent file has fewer than 6000 lines (Phase 1 left it at 6122)", () => {
    const lineCount = PARENT.split("\n").length;
    expect(lineCount).toBeLessThan(6000);
  });
});
