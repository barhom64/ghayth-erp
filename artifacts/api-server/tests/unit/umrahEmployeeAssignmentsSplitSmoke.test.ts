import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * U-07 Phase 24 — umrah-entities.ts split smoke (employee-assignments) — FINAL CARVE.
 *
 * Scope:
 *   - Carves the last remaining route into a dedicated sub-router:
 *       artifacts/api-server/src/routes/umrah-employee-assignments.ts
 *       GET /employees/:employeeId/assignments
 *   - Parent mounts the sub-router via `router.use(employeeAssignmentsRouter)`.
 *   - This turns umrah-entities.ts into a PURE AGGREGATOR — it owns zero routes,
 *     only `router.use(...)` mounts of the umrah commercial/finance sub-routers.
 *
 * This is the closing PR of the U-07 series that decomposed the original
 * 5,443-line umrah-entities.ts monolith into dedicated single-responsibility
 * sub-routers (Phases 1–24).
 */

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const PARENT = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-entities.ts"),
  "utf8",
);
const CHILD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-employee-assignments.ts"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// §A — Child file exists + exports a Router as default
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 24 §A — umrah-employee-assignments.ts is a valid sub-router file", () => {
  it("imports Router + creates one + exports it as default", () => {
    expect(CHILD).toMatch(/import\s*\{\s*Router\s*\}\s+from\s+["']express["']/);
    expect(CHILD).toMatch(/const\s+router\s*=\s*Router\(\)/);
    expect(CHILD).toMatch(/^export\s+default\s+router;?\s*$/m);
  });

  it("declares GET /employees/:employeeId/assignments, tenant-scoped + authorized", () => {
    expect(CHILD).toMatch(/router\.get\("\/employees\/:employeeId\/assignments"/);
    expect(CHILD).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
    expect(CHILD).toMatch(/"companyId" = \$2/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §B — Parent imports + mounts the sub-router
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 24 §B — parent mounts the sub-router", () => {
  it("parent imports the new module as a default import", () => {
    expect(PARENT).toMatch(/import\s+employeeAssignmentsRouter\s+from\s+["']\.\/umrah-employee-assignments\.js["']/);
  });

  it("parent mounts it with router.use(employeeAssignmentsRouter)", () => {
    expect(PARENT).toMatch(/router\.use\(\s*employeeAssignmentsRouter\s*\)/);
  });

  it("parent no longer declares the employee-assignments route directly", () => {
    expect(PARENT).not.toMatch(/router\.get\("\/employees\/:employeeId\/assignments"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// §C — THE MILESTONE: umrah-entities.ts is now a PURE AGGREGATOR.
// ─────────────────────────────────────────────────────────────────────────────
describe("U-07 Phase 24 §C — umrah-entities.ts is a pure aggregator", () => {
  it("owns ZERO routes of its own", () => {
    expect(PARENT).not.toMatch(/router\.(get|post|patch|put|delete)\(/);
  });

  it("imports no business-logic libs — only Router + the sub-routers", () => {
    // The only non-router import should be express's Router. No rawdb, no
    // errorHandler, no rbac helpers, no engines — everything moved out.
    expect(PARENT).not.toMatch(/from\s+["']\.\.\/lib\/rawdb\.js["']/);
    expect(PARENT).not.toMatch(/from\s+["']\.\.\/lib\/errorHandler\.js["']/);
    expect(PARENT).not.toMatch(/from\s+["']\.\.\/lib\/rbac\/authorize\.js["']/);
  });

  it("is just imports + a Router + router.use(...) mounts + a default export", () => {
    // Every non-comment, non-import, non-blank line is either the Router
    // construction, a router.use(...) mount, or the default export.
    const meaningful = PARENT.split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("//") && !l.startsWith("import "));
    for (const line of meaningful) {
      expect(
        /^const router = Router\(\);$/.test(line) ||
        /^router\.use\([a-zA-Z]+Router\);$/.test(line) ||
        /^export default router;$/.test(line),
        `unexpected non-aggregator line: ${line}`,
      ).toBe(true);
    }
  });

  it("shrank below 140 lines (was 5,443 at the start of U-07)", () => {
    expect(PARENT.split("\n").length).toBeLessThan(140);
  });
});
