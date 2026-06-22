import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 5 — umrah-entities.ts split, commission-plan carve-out.
 *
 * Mirrors Phase 2 (families), Phase 3 (refunds) and Phase 4 (accommodation)
 * smoke. Pins:
 *   - The new sub-router file exists + is a valid Router export.
 *   - The parent mounts the sub-router (so /umrah/commission-plans,
 *     /commission-calculations… still resolves).
 *   - All 8 commission routes live in the child.
 *   - The same 8 routes are GONE from the parent (no double-mount risk).
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
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-commission.ts"),
  "utf8",
);

const COMMISSION_ROUTES: Array<[string, string]> = [
  ["get", "/commission-plans"],
  ["get", "/commission-plans/:id"],
  ["post", "/commission-plans"],
  ["patch", "/commission-plans/:id"],
  ["post", "/commission-plans/simulate"],
  ["post", "/commission-plans/:id/simulate"],
  ["post", "/commission-plans/:id/calculate"],
  ["get", "/commission-calculations"],
];

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file is a valid sub-router file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 5 §A — umrah-commission.ts is a valid sub-router file", () => {
  it("file is non-empty + imports Router from express", () => {
    expect(CHILD.length).toBeGreaterThan(1000);
    expect(CHILD).toMatch(/import\s*\{\s*Router\s*\}\s+from\s+["']express["']/);
  });

  it("creates a Router + exports it as default", () => {
    expect(CHILD).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(CHILD).toMatch(/^export\s+default\s+router;?\s*$/m);
  });

  it("imports the same helpers the parent uses (rawQuery + authorize + errorHandler + engine)", () => {
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/rawdb\.js["']/);
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/rbac\/authorize\.js["']/);
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/errorHandler\.js["']/);
    expect(CHILD).toMatch(/from\s+["']\.\.\/lib\/umrahCommissionEngine\.js["']/);
  });

  it("uses auditFromRequest (not createAuditLog) — IGOC ratchet compliance", () => {
    expect(CHILD).toMatch(/auditFromRequest/);
    expect(CHILD).not.toMatch(/createAuditLog/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 5 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(
      /import\s+commissionRouter\s+from\s+["']\.\/umrah-commission\.js["']/,
    );
  });

  it("parent mounts the sub-router with router.use(commissionRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*commissionRouter\s*\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — All 8 routes live in the child file
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 5 §C — all 8 commission routes are present in the child", () => {
  for (const [verb, route] of COMMISSION_ROUTES) {
    it(`child file declares router.${verb}("${route}", ...)`, () => {
      const re = new RegExp(
        `router\\.${verb}\\(\\s*\\n?\\s*["']${route.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`,
      );
      expect(CHILD).toMatch(re);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// §D — Same 8 routes are GONE from the parent (no double mount)
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 5 §D — parent no longer declares the moved routes", () => {
  for (const [verb, route] of COMMISSION_ROUTES) {
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
describe("U-07 Phase 5 §E — parent shrank from the pre-carve line count", () => {
  it("parent file has fewer than 5500 lines (pre-Phase-5 it was 5784+)", () => {
    const lineCount = PARENT.split("\n").length;
    expect(lineCount).toBeLessThan(5500);
  });
});
