import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 4 — umrah-entities.ts split, accommodation carve-out.
 *
 * Mirrors the Phase 1-3 smokes. Pins:
 *   - The new sub-router file exists + is a valid Router export.
 *   - The parent mounts the sub-router (so /umrah/hotels, /umrah/room-blocks,
 *     /umrah/room-allocations still resolve).
 *   - The 9 accommodation routes ALL live in the child.
 *   - The same 9 routes are GONE from the parent (no double-mount risk).
 *   - The parent file continues to shrink.
 *
 * Non-goals (Permanent Hard Rails):
 *   - No engine touch. Pure code move + mount.
 *   - No API surface change. Same paths, same handlers, same RBAC.
 *   - The N+1 fix on /room-blocks (CTE) is preserved verbatim.
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-hotels.ts"),
  "utf8",
);

const HOTEL_ROUTES: Array<[string, string]> = [
  ["get", "/hotels"],
  ["post", "/hotels"],
  ["patch", "/hotels/:id"],
  ["delete", "/hotels/:id"],
  ["get", "/room-blocks"],
  ["post", "/room-blocks"],
  ["get", "/room-blocks/:id/allocations"],
  ["post", "/room-allocations"],
  ["delete", "/room-allocations/:id"],
];

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file is a valid sub-router file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 4 §A — umrah-hotels.ts is a valid sub-router file", () => {
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

  it("preserves the /room-blocks N+1 fix (alloc_counts CTE)", () => {
    // The list query was lifted to a CTE so 500 blocks don't fan out
    // into 501 lookups. Anchor on the CTE name to keep that contract.
    expect(CHILD).toMatch(/WITH alloc_counts AS/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 4 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(
      /import\s+hotelsRouter\s+from\s+["']\.\/umrah-hotels\.js["']/,
    );
  });

  it("parent mounts the sub-router with router.use(hotelsRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*hotelsRouter\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 9 accommodation routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 4 §C — all 9 accommodation routes are present in the child", () => {
  for (const [verb, route] of HOTEL_ROUTES) {
    it(`child file declares router.${verb}("${route}", ...)`, () => {
      const re = new RegExp(
        `router\\.${verb}\\(\\s*\\n?\\s*["']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      );
      expect(CHILD).toMatch(re);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Same 9 routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 4 §D — parent no longer declares the moved routes", () => {
  for (const [verb, route] of HOTEL_ROUTES) {
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
describe("U-07 Phase 4 §E — parent shrunk below the post-Phase-1 line count", () => {
  it("parent file has fewer than 6000 lines (Phase 1 left it at 6122)", () => {
    const lineCount = PARENT.split("\n").length;
    expect(lineCount).toBeLessThan(6000);
  });
});
