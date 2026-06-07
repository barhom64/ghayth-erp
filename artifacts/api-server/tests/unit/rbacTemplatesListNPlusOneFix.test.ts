/**
 * RBAC V2 templates list — 3×N+1 fix static guard.
 *
 * GET /api/rbac/templates carried THREE correlated scalar COUNT
 * subqueries per row:
 *
 *   - (SELECT COUNT(*) FROM rbac_role_grants     WHERE role_id = r.id) AS grant_count
 *   - (SELECT COUNT(*) FROM rbac_field_policies  WHERE role_id = r.id) AS field_count
 *   - (SELECT COUNT(*) FROM rbac_approval_limits WHERE role_id = r.id) AS limit_count
 *
 * Templates is a bounded set (~10-15 rows) so the absolute speed-up
 * is small, but cleaning the shape keeps the rbacV2 list endpoints
 * uniform — no surprise correlated subqueries hiding behind
 * "templates are tiny anyway".
 *
 * The fix uses three sibling CTEs (grant_counts + field_counts +
 * limit_counts) and LEFT JOINs them back to rbac_roles.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/rbacV2.ts"),
  "utf8",
);

describe("RBAC V2 templates list — 3×N+1 fix", () => {
  const handlerIdx = SRC.indexOf('router.get("/templates"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 3500);

  it("the /templates handler is locatable", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no correlated scalar COUNT subquery on rbac_role_grants remains", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+rbac_role_grants\s+WHERE\s+role_id\s*=\s*r\.id\)/,
    );
  });

  it("no correlated scalar COUNT subquery on rbac_field_policies remains", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+rbac_field_policies\s+WHERE\s+role_id\s*=\s*r\.id\)/,
    );
  });

  it("no correlated scalar COUNT subquery on rbac_approval_limits remains", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+rbac_approval_limits\s+WHERE\s+role_id\s*=\s*r\.id\)/,
    );
  });

  it("uses three sibling CTEs (grant_counts + field_counts + limit_counts)", () => {
    expect(handler).toContain("WITH grant_counts AS");
    expect(handler).toContain("field_counts AS");
    expect(handler).toContain("limit_counts AS");
  });

  it("LEFT JOINs all three CTEs back to rbac_roles by role_id", () => {
    expect(handler).toMatch(/LEFT JOIN grant_counts gc ON gc\.role_id = r\.id/);
    expect(handler).toMatch(/LEFT JOIN field_counts fc ON fc\.role_id = r\.id/);
    expect(handler).toMatch(/LEFT JOIN limit_counts lc ON lc\.role_id = r\.id/);
  });

  it("COALESCEs all three counters so templates with no rows return 0", () => {
    expect(handler).toContain("COALESCE(gc.c, 0) AS grant_count");
    expect(handler).toContain("COALESCE(fc.c, 0) AS field_count");
    expect(handler).toContain("COALESCE(lc.c, 0) AS limit_count");
  });

  it("still WHEREs is_template = TRUE (only template rows are listed)", () => {
    expect(handler).toMatch(/WHERE\s+r\.is_template\s*=\s*TRUE/);
  });
});
