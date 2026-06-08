/**
 * RBAC V2 roles list — 2×N+1 fix static guard.
 *
 * GET /api/rbac/roles carried TWO correlated scalar COUNT subqueries
 * per row:
 *
 *   - (SELECT COUNT(*) FROM rbac_user_roles ur WHERE ur.role_id = r.id)
 *      AS member_count
 *   - (SELECT COUNT(*) FROM rbac_role_grants g WHERE g.role_id = r.id)
 *      AS grant_count
 *
 * With N roles in the company that's 2N+1 lookups across the join
 * tables. Same N+1 shape as the 24 sites already fixed in this
 * session — twenty-fifth site.
 *
 * The fix uses TWO sibling CTEs (member_counts + grant_counts) that
 * aggregate by role_id once each, then LEFT JOINs them back to
 * rbac_roles.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/rbacV2.ts"),
  "utf8",
);

describe("RBAC V2 roles list — 2×N+1 fix", () => {
  const handlerIdx = SRC.indexOf('router.get("/roles"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 3500);

  it("the /roles handler is locatable", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no correlated scalar COUNT subquery on rbac_user_roles for role_id = r.id remains", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+rbac_user_roles\s+ur\s+WHERE\s+ur\.role_id\s*=\s*r\.id\)/,
    );
  });

  it("no correlated scalar COUNT subquery on rbac_role_grants for role_id = r.id remains", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+rbac_role_grants\s+g\s+WHERE\s+g\.role_id\s*=\s*r\.id\)/,
    );
  });

  it("uses two sibling CTEs (member_counts + grant_counts)", () => {
    expect(handler).toContain("WITH member_counts AS");
    expect(handler).toContain("grant_counts AS");
    expect(handler).toContain("FROM rbac_user_roles");
    expect(handler).toContain("FROM rbac_role_grants");
  });

  it("both CTEs aggregate by role_id", () => {
    const matches = handler.match(/GROUP BY role_id/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("LEFT JOINs both CTEs back to rbac_roles by role_id", () => {
    expect(handler).toMatch(/LEFT JOIN member_counts mc ON mc\.role_id = r\.id/);
    expect(handler).toMatch(/LEFT JOIN grant_counts gc ON gc\.role_id = r\.id/);
  });

  it("COALESCEs both counters so roles with no members/grants return 0", () => {
    expect(handler).toContain("COALESCE(mc.member_count, 0) AS member_count");
    expect(handler).toContain("COALESCE(gc.grant_count, 0) AS grant_count");
  });
});
