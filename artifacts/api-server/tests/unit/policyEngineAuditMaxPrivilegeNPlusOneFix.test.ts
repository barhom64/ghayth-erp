/**
 * policyEngine.auditMaxPrivilege — N+1 fix on role-permission count.
 *
 * `auditMaxPrivilege` in lib/policyEngine.ts is part of the full
 * policy audit (runFullPolicyAudit) called by admin governance
 * dashboards and the daily compliance cron. It flags users whose
 * assigned role grants more permissions than the role's declared
 * cap (e.g. branch_manager → 50 max).
 *
 * The previous shape evaluated a correlated COUNT(*) subquery
 * against role_permissions PER active assignment in the company:
 *
 *   (SELECT COUNT(*) FROM role_permissions rp
 *    WHERE rp.role = ea.role
 *    AND (rp."companyId" = $1 OR rp."companyId" IS NULL))::int AS "permCount"
 *
 * For 200 active assignments that's 200 lookups against
 * role_permissions per audit run. Audit fires daily + on-demand.
 *
 * The fix uses a single GROUP BY CTE (`role_perm_counts`) keyed by
 * `role_permissions.role`, then LEFT JOINs back to the assignment
 * query. COALESCE → 0 for roles that have no permission rows yet.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/policyEngine.ts"),
  "utf8",
);

describe("policyEngine.auditMaxPrivilege — N+1 fix", () => {
  const handlerIdx = SRC.indexOf("export async function auditMaxPrivilege");
  const handler = SRC.slice(handlerIdx, handlerIdx + 3500);

  it("auditMaxPrivilege is locatable", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no correlated COUNT subquery on role_permissions for ea.role remains", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)\s+FROM\s+role_permissions\s+rp\s+WHERE\s+rp\.role\s*=\s*ea\.role/,
    );
  });

  it("uses a role_perm_counts CTE keyed by role", () => {
    expect(handler).toContain("WITH role_perm_counts AS");
    expect(handler).toMatch(/GROUP BY role/);
  });

  it("LEFT JOINs the CTE back to assignments by role name", () => {
    expect(handler).toMatch(
      /LEFT JOIN role_perm_counts rpc ON rpc\.role = ea\.role/,
    );
  });

  it('projects COALESCE(rpc.c, 0) AS "permCount" so empty role rows count as 0', () => {
    expect(handler).toMatch(/COALESCE\(rpc\.c, 0\)\s+AS\s+"permCount"/);
  });

  it("CTE scopes permissions to the company OR the global (NULL companyId) bucket", () => {
    expect(handler).toMatch(/"companyId"\s*=\s*\$1\s+OR\s+"companyId"\s+IS\s+NULL/);
  });

  it("preserves the active-assignment + employeeId filter", () => {
    expect(handler).toMatch(/u\."employeeId" IS NOT NULL/);
    expect(handler).toMatch(/ea\.status = 'active'/);
  });
});
