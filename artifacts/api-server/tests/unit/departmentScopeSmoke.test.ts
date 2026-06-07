import { describe, it, expect } from "vitest";
import { buildScopedWhere } from "../../src/lib/scopedQuery.js";
import type { RequestScope } from "../../src/middlewares/authMiddleware.js";

// Minimal scope factory — only the fields buildScopedWhere reads.
function scope(overrides: Partial<RequestScope> = {}): RequestScope {
  return {
    userId: 1,
    employeeId: 1,
    companyId: 1,
    branchId: 1,
    activeAssignmentId: 1,
    allowedCompanies: [1],
    allowedBranches: [1],
    allowedDepartments: [],
    allowedAssignments: [1],
    role: "employee",
    isOwner: false,
    jobTitle: null,
    jobTitleId: null,
    userName: "t",
    selectedRoleKey: null,
    ...overrides,
  };
}

describe("department scope — additive, opt-in", () => {
  it("emits NO department predicate by default (not opted in)", () => {
    const { where } = buildScopedWhere(scope({ allowedDepartments: [5, 6] }), {}, {});
    expect(where).not.toContain('"departmentId"');
  });

  it("emits a department predicate when enforceDepartmentScope + non-owner + has departments", () => {
    const { where, params } = buildScopedWhere(
      scope({ allowedDepartments: [5, 6] }),
      {},
      { enforceDepartmentScope: true },
    );
    expect(where).toContain('"departmentId" = ANY(');
    expect(params).toContainEqual([5, 6]);
  });

  it("single department uses equality, not ANY", () => {
    const { where, params } = buildScopedWhere(
      scope({ allowedDepartments: [9] }),
      {},
      { enforceDepartmentScope: true },
    );
    expect(where).toMatch(/"departmentId" = \$\d/);
    expect(params).toContain(9);
  });

  it("company-level roles (hr/admin/finance managers) are NOT department-scoped", () => {
    for (const role of ["hr_manager", "admin", "finance_manager", "general_manager"]) {
      const { where } = buildScopedWhere(
        scope({ role, allowedDepartments: [5, 6] }),
        {},
        { enforceDepartmentScope: true },
      );
      expect(where, `${role} should be department-unbounded`).not.toContain('"departmentId"');
    }
  });

  it("a manager assigned to several departments sees ALL of them (multi-department)", () => {
    const { where, params } = buildScopedWhere(
      scope({ role: "branch_manager", allowedDepartments: [3, 7, 11] }),
      {},
      { enforceDepartmentScope: true },
    );
    expect(where).toContain('"departmentId" = ANY(');
    expect(params).toContainEqual([3, 7, 11]);
  });

  it("owner is department-unbounded even when opted in", () => {
    const { where } = buildScopedWhere(
      scope({ isOwner: true, role: "owner", allowedDepartments: [5] }),
      {},
      { enforceDepartmentScope: true },
    );
    expect(where).not.toContain('"departmentId"');
  });

  it("user with no department assignment gets no predicate (full visibility)", () => {
    const { where } = buildScopedWhere(
      scope({ allowedDepartments: [] }),
      {},
      { enforceDepartmentScope: true },
    );
    expect(where).not.toContain('"departmentId"');
  });

  it("explicit departmentIds filter narrows within the allowed set", () => {
    const { where, params } = buildScopedWhere(
      scope({ allowedDepartments: [5, 6, 7] }),
      { departmentIds: [6, 999] }, // 999 not allowed → dropped
      { enforceDepartmentScope: true },
    );
    expect(where).toMatch(/"departmentId" = \$\d/);
    expect(params).toContain(6);
    expect(params).not.toContain(999);
  });

  it("respects a custom departmentColumn (aliased)", () => {
    const { where } = buildScopedWhere(
      scope({ allowedDepartments: [3] }),
      {},
      { enforceDepartmentScope: true, departmentColumn: 'e."departmentId"' },
    );
    expect(where).toContain('e."departmentId"');
  });

  it("undefined allowedDepartments (synthetic scope) is treated as unbounded", () => {
    const s = scope();
    // simulate a cast/synthetic scope missing the field
    delete (s as Partial<RequestScope>).allowedDepartments;
    const { where } = buildScopedWhere(s, {}, { enforceDepartmentScope: true });
    expect(where).not.toContain('"departmentId"');
  });
});
