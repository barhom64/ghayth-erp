import { describe, it, expect } from "vitest";
import { evaluateScopeForRecord, type ScopeContext } from "../../src/lib/rbac/authzEngine.js";
import type { RequestScope } from "../../src/middlewares/authMiddleware.js";

// evaluateScopeForRecord's `self` case used `record.createdBy === scope.userId`,
// which silently failed on assignment-id tables (most of finance) — a self-
// scoped user would be denied access to records they themselves created. It
// now resolves ownership in the correct identity space (recordOwnership).

function ctx(overrides: Partial<RequestScope> = {}): ScopeContext {
  const scope = {
    userId: 7,
    employeeId: 70,
    companyId: 1,
    branchId: 1,
    activeAssignmentId: 50,
    allowedCompanies: [1],
    allowedBranches: [1],
    allowedDepartments: [],
    allowedAssignments: [50, 51],
    role: "employee",
    isOwner: false,
    jobTitle: null,
    jobTitleId: null,
    userName: "t",
    selectedRoleKey: null,
    ...overrides,
  } as RequestScope;
  return { scope, departmentId: null, managedDepartmentIds: [], directReportEmployeeIds: [] };
}

const selfGrant = { scope: "self" } as unknown as Parameters<typeof evaluateScopeForRecord>[0];

describe("evaluateScopeForRecord — self scope is ownership-aware", () => {
  it("grants access to a finance record the user created via their assignment id", () => {
    const ok = evaluateScopeForRecord(
      selfGrant,
      ctx(),
      { companyId: 1, createdBy: 50 }, // assignment id 50 belongs to user 7
      "invoices",
    );
    expect(ok).toBe(true);
  });

  it("denies a finance record created by someone else's assignment", () => {
    const ok = evaluateScopeForRecord(
      selfGrant,
      ctx(),
      { companyId: 1, createdBy: 999 },
      "journal_entries",
    );
    expect(ok).toBe(false);
  });

  it("still matches employeeId/assigneeId ownership regardless of createdBy", () => {
    expect(
      evaluateScopeForRecord(selfGrant, ctx(), { companyId: 1, createdBy: 999, employeeId: 70 }, "tasks"),
    ).toBe(true);
  });

  it("user-id FK table matches the user id, not a colliding assignment id", () => {
    // budgets.createdBy → users: only userId (7) counts as self
    expect(evaluateScopeForRecord(selfGrant, ctx(), { companyId: 1, createdBy: 7 }, "budgets")).toBe(true);
    expect(evaluateScopeForRecord(selfGrant, ctx(), { companyId: 1, createdBy: 50 }, "budgets")).toBe(false);
  });
});
