import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * POST /auth/refresh — closing the tenant-isolation gap.
 *
 * Before this fix: the refresh handler looked up the active
 * employee_assignment by `employeeId` alone, so any future data
 * corruption (an employee record duplicated across companies, or a
 * historical re-org assignment that wasn't soft-deleted) could
 * surface an assignment from a foreign company and let the
 * issued JWT carry that assignment.
 *
 * After this fix: the refresh-token query joins `employees` to
 * carry the canonical `companyId` through `RefreshTokenRow`, and
 * the assignment lookup constrains by BOTH `employeeId` AND
 * `companyId`. Static tenant-isolation guard at
 * tests/integration/tenantIsolation.test.ts now passes — the
 * employee_assignments call site is companyId-aware.
 */

const AUTH = readFileSync(
  join(import.meta.dirname!, "../../src/routes/auth.ts"),
  "utf8",
);

describe("auth.ts /refresh — tenant-scoped assignment lookup", () => {
  it("RefreshTokenRow carries companyId so the assignment lookup can scope by it", () => {
    expect(AUTH).toMatch(/interface RefreshTokenRow \{[\s\S]+?companyId: number;[\s\S]+?\}/);
  });

  it("refresh-token JOIN reads e.\"companyId\" via employees", () => {
    expect(AUTH).toMatch(/SELECT rt\.\*, u\."isActive", u\."employeeId", u\."lockedUntil", e\."companyId"/);
    expect(AUTH).toMatch(/JOIN employees e ON e\.id = u\."employeeId"/);
  });

  it("assignment lookup constrains by BOTH employeeId AND companyId (drift alarm)", () => {
    // If anyone removes the companyId constraint the static tenant-
    // isolation guard test re-fails at the same line in auth.ts.
    expect(AUTH).toMatch(/SELECT ea\.id, ea\.role FROM employee_assignments ea[\s\S]{0,300}ea\."employeeId" = \$1[\s\S]{0,200}ea\."companyId" = \$2[\s\S]{0,200}ea\.status = 'active'/);
  });

  it("parameter ordering matches the SQL ($1 = employeeId, $2 = companyId)", () => {
    expect(AUTH).toMatch(/\[rt\.employeeId, rt\.companyId\]/);
  });

  it("ORDER BY isPrimary DESC + LIMIT 1 preserved — picks the primary assignment in the SAME company", () => {
    expect(AUTH).toMatch(/ORDER BY ea\."isPrimary" DESC NULLS LAST LIMIT 1/);
  });
});
