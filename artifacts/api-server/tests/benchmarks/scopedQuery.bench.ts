// Benchmarks for `buildScopedWhere` — the multi-tenant predicate
// builder that runs on virtually every list endpoint. Regressions
// here multiply across every request the API serves, so the bench
// cases mirror the realistic shapes we see in production:
//
//   - owner with broad allowedCompanies / allowedBranches
//   - branch_manager with `enforceBranchScope` cascading on
//   - filtered listing with search columns + soft-delete
//
import { bench, describe } from "vitest";
import { buildScopedWhere } from "../../src/lib/scopedQuery.js";
import type { RequestScope } from "../../src/middlewares/authMiddleware.js";

function makeScope(overrides: Partial<RequestScope> = {}): RequestScope {
  return {
    userId: 1,
    employeeId: 1,
    companyId: 1,
    branchId: 1,
    activeAssignmentId: 1,
    allowedCompanies: [1, 2, 3],
    allowedBranches: [1, 2, 3, 4, 5, 6, 7, 8],
    allowedAssignments: [1, 2, 3],
    role: "branch_manager",
    isOwner: false,
    jobTitle: null,
    jobTitleId: null,
    userName: "bench",
    ...overrides,
  };
}

const ownerScope = makeScope({
  role: "owner",
  isOwner: true,
  allowedCompanies: [1, 2, 3, 4, 5],
  allowedBranches: Array.from({ length: 50 }, (_, i) => i + 1),
});

const branchManagerScope = makeScope();

const singleBranchScope = makeScope({
  allowedCompanies: [1],
  allowedBranches: [3],
});

describe("buildScopedWhere", () => {
  bench("single company, single branch (typical scoped manager)", () => {
    buildScopedWhere(singleBranchScope);
  });

  bench("owner — many companies and branches, no filters", () => {
    buildScopedWhere(ownerScope);
  });

  bench("branch_manager — enforceBranchScope cascade", () => {
    buildScopedWhere(
      branchManagerScope,
      {},
      { enforceBranchScope: true },
    );
  });

  bench("with companyIds filter narrowing to one allowed company", () => {
    buildScopedWhere(
      ownerScope,
      { companyIds: [2] },
    );
  });

  bench("with branchIds filter narrowing to one allowed branch", () => {
    buildScopedWhere(
      branchManagerScope,
      { branchIds: [4] },
    );
  });

  bench("with search across three columns", () => {
    buildScopedWhere(
      branchManagerScope,
      {
        search: "ali",
        searchColumns: ['c."name"', 'c."code"', 'c."email"'],
      },
    );
  });

  bench("disableBranchScope (e.g. clients table)", () => {
    buildScopedWhere(
      branchManagerScope,
      {},
      { disableBranchScope: true },
    );
  });

  bench("with softDeleteColumn predicate", () => {
    buildScopedWhere(
      branchManagerScope,
      {},
      { softDeleteColumn: 'b."deletedAt"' },
    );
  });

  bench("full payload — companyIds + branchIds + search + soft-delete + extras", () => {
    buildScopedWhere(
      ownerScope,
      {
        companyIds: [1, 2],
        branchIds: [3, 4, 5],
        search: "test",
        searchColumns: ['t."name"', 't."ref"'],
      },
      {
        softDeleteColumn: 't."deletedAt"',
        extraConditions: ['t.status = $X'],
        extraParams: ["active"],
      },
    );
  });

  bench("rejects out-of-scope companyIds (cross-tenant guard)", () => {
    buildScopedWhere(
      branchManagerScope,
      {
        // 999 is not in allowedCompanies — must be filtered out by the helper.
        companyIds: [999, 1, 2],
        branchIds: [999, 3],
      },
    );
  });
});
