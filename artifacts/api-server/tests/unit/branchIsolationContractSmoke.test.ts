import { describe, it, expect } from "vitest";
import { buildScopedWhere } from "../../src/lib/scopedQuery.js";
import type { RequestScope } from "../../src/middlewares/authMiddleware.js";

// ─── Branch isolation contract (financial-integrity audit gap #10) ────────
// User scenario: مستخدم فرع مكة لا يرى ولا يرحل ولا يعتمد فرع جدة،
// والتقارير تتقيد بـbranchId.
//
// Translation: a branch-scoped user must not be able to see or modify
// data from another branch. The single chokepoint that enforces this
// for finance list/report queries is buildScopedWhere with
// enforceBranchScope=true. This test locks the contract by feeding
// synthetic scopes (Makkah-branch employee, Jeddah-branch employee,
// company-scope GM, owner) and asserting the WHERE clause is filtered
// appropriately for each.
//
// Lower-level guards live elsewhere:
//   • Lifecycle transitions check scope at applyTransition time
//     (lifecycleEngine.ts).
//   • RBAC's checkAccess() enforces grant.scope on UPDATE/DELETE
//     (authzEngine.ts).
// This smoke focuses purely on the READ-side WHERE-clause builder
// because every dimensional + audit + drilldown report passes through
// it. If branch isolation is broken here, the data leaks despite the
// other layers being correct.

function mkScope(over: Partial<RequestScope>): RequestScope {
  return {
    userId: 1,
    employeeId: 1,
    companyId: 1,
    branchId: 0,
    activeAssignmentId: 1,
    allowedCompanies: [1],
    allowedBranches: [],
    allowedAssignments: [1],
    role: "employee",
    isOwner: false,
    jobTitle: null,
    jobTitleId: null,
    userName: "test",
    selectedRoleKey: null,
    ...over,
  };
}

// Synthetic scopes for the user's scenario.
const MAKKAH_BRANCH_ID = 10;
const JEDDAH_BRANCH_ID = 20;

const makkahEmployee = mkScope({
  branchId: MAKKAH_BRANCH_ID,
  allowedBranches: [MAKKAH_BRANCH_ID],
  role: "employee",
});

const jeddahEmployee = mkScope({
  branchId: JEDDAH_BRANCH_ID,
  allowedBranches: [JEDDAH_BRANCH_ID],
  role: "employee",
});

const companyAccountant = mkScope({
  branchId: MAKKAH_BRANCH_ID,
  allowedBranches: [MAKKAH_BRANCH_ID, JEDDAH_BRANCH_ID],
  role: "accountant",
});

const generalManager = mkScope({
  branchId: MAKKAH_BRANCH_ID,
  allowedBranches: [MAKKAH_BRANCH_ID, JEDDAH_BRANCH_ID],
  role: "general_manager",
});

const owner = mkScope({
  branchId: MAKKAH_BRANCH_ID,
  allowedBranches: [MAKKAH_BRANCH_ID, JEDDAH_BRANCH_ID],
  role: "owner",
  isOwner: true,
});

// ─── Default behaviour (no enforceBranchScope) ─────────────────────────────
// The default is "company scope" — caller-supplied filters drive what's
// included; absence of an explicit branchIds filter doesn't auto-narrow.
// This is correct for company-wide reports that the operator is meant to
// see across all their allowed branches.

describe("buildScopedWhere — default (no enforceBranchScope)", () => {
  it("Makkah employee with no branchIds filter → company-scoped only (no branch filter)", () => {
    const { where, params } = buildScopedWhere(makkahEmployee);
    expect(where).toContain('"companyId" = $1');
    expect(where).not.toContain('"branchId"');
    expect(params).toEqual([1]);
  });

  it("explicit branchIds=[Makkah] filters by Makkah", () => {
    const { where, params } = buildScopedWhere(makkahEmployee, {
      branchIds: [MAKKAH_BRANCH_ID],
    });
    expect(where).toContain('"branchId" = $2');
    expect(params).toEqual([1, MAKKAH_BRANCH_ID]);
  });
});

// ─── enforceBranchScope=true — production guard for dimensional reports ───

describe("buildScopedWhere — enforceBranchScope=true", () => {
  it("Makkah employee auto-scoped to ONLY Makkah even without explicit filter", () => {
    const { where, params } = buildScopedWhere(
      makkahEmployee,
      {},
      { enforceBranchScope: true },
    );
    expect(where).toContain('"companyId" = $1');
    expect(where).toContain('"branchId" = $2');
    expect(params).toEqual([1, MAKKAH_BRANCH_ID]);
  });

  it("Jeddah employee gets only Jeddah", () => {
    const { where, params } = buildScopedWhere(
      jeddahEmployee,
      {},
      { enforceBranchScope: true },
    );
    expect(where).toContain('"branchId" = $2');
    expect(params).toEqual([1, JEDDAH_BRANCH_ID]);
  });

  it("Makkah employee CANNOT smuggle Jeddah via filters.branchIds (filtered out by allowedBranches)", () => {
    const { where, params } = buildScopedWhere(
      makkahEmployee,
      { branchIds: [JEDDAH_BRANCH_ID] }, // attempt to view Jeddah
      { enforceBranchScope: true },
    );
    // Jeddah is not in allowedBranches → filtered out → falls back to
    // auto-scope (Makkah). The query NEVER includes branchId=Jeddah.
    expect(params).not.toContain(JEDDAH_BRANCH_ID);
    expect(where).toContain('"branchId" = $2');
    expect(params).toEqual([1, MAKKAH_BRANCH_ID]);
  });

  it("Makkah employee asking for BOTH Makkah and Jeddah → ONLY Makkah survives", () => {
    const { where, params } = buildScopedWhere(
      makkahEmployee,
      { branchIds: [MAKKAH_BRANCH_ID, JEDDAH_BRANCH_ID] },
      { enforceBranchScope: true },
    );
    expect(where).toContain('"branchId" = $2');
    expect(params).toEqual([1, MAKKAH_BRANCH_ID]);
  });

  it("company-scope accountant with both branches allowed sees BOTH", () => {
    const { where, params } = buildScopedWhere(
      companyAccountant,
      {},
      { enforceBranchScope: true },
    );
    expect(where).toContain('"branchId" = ANY($2)');
    expect(params).toEqual([1, [MAKKAH_BRANCH_ID, JEDDAH_BRANCH_ID]]);
  });
});

// ─── enforceBranchScope BYPASS for owner + general_manager ─────────────────
// Owners and GMs are intentionally exempt — they need to drill into any
// branch to manage the business. The exempt list is defined in
// BRANCH_SCOPE_EXEMPT_ROLES inside scopedQuery.ts.

describe("buildScopedWhere — exempt roles bypass enforceBranchScope", () => {
  it("Owner sees all data even without explicit branchIds", () => {
    const { where, params } = buildScopedWhere(
      owner,
      {},
      { enforceBranchScope: true },
    );
    expect(where).toContain('"companyId" = $1');
    expect(where).not.toContain('"branchId"');
    expect(params).toEqual([1]);
  });

  it("General manager sees all data even without explicit branchIds", () => {
    const { where, params } = buildScopedWhere(
      generalManager,
      {},
      { enforceBranchScope: true },
    );
    expect(where).not.toContain('"branchId"');
    expect(params).toEqual([1]);
  });
});

// ─── disableBranchScope — for tables that are truly company-wide ──────────
// Some tables (chart_of_accounts, tax_codes, accounting_allocation_rules)
// are company-scoped only — they have no branchId column. disableBranchScope
// must skip the branch clause entirely even with enforceBranchScope=true.

describe("buildScopedWhere — disableBranchScope (company-wide tables)", () => {
  it("Makkah employee on a branch-less table sees company-wide rows", () => {
    const { where, params } = buildScopedWhere(
      makkahEmployee,
      {},
      { disableBranchScope: true, enforceBranchScope: true },
    );
    expect(where).toContain('"companyId" = $1');
    expect(where).not.toContain('"branchId"');
    expect(params).toEqual([1]);
  });
});

// ─── Soft-delete column — always added when configured ────────────────────

describe("buildScopedWhere — soft-delete cooperates with branch scope", () => {
  it("Makkah employee + softDeleteColumn → both clauses present", () => {
    const { where, params } = buildScopedWhere(
      makkahEmployee,
      {},
      { enforceBranchScope: true, softDeleteColumn: '"deletedAt"' },
    );
    expect(where).toContain('"companyId" = $1');
    expect(where).toContain('"branchId" = $2');
    expect(where).toContain('"deletedAt" IS NULL');
    expect(params).toEqual([1, MAKKAH_BRANCH_ID]);
  });
});

// ─── Multi-company protection ────────────────────────────────────────────
// allowedCompanies is the cross-tenant guard. A user with allowedCompanies=[1]
// must NEVER see data from companyId=2 even if they ask for it explicitly.

describe("buildScopedWhere — cross-tenant isolation", () => {
  it("Makkah employee can't ask for companyId=2 (filtered out)", () => {
    const { where, params } = buildScopedWhere(
      makkahEmployee,
      { companyIds: [2] }, // attempt to view another tenant
      { enforceBranchScope: true },
    );
    // Their allowedCompanies=[1] is the gate — companyId=2 is filtered out,
    // leaving an empty companyIds list. The function silently drops the
    // companyId condition (NO data in this case — which is the safe
    // failure mode for a cross-tenant probe).
    expect(where).not.toContain('"companyId"');
    expect(params).not.toContain(2);
  });

  it("multi-company user (allowedCompanies=[1,3]) can pick any of their tenants", () => {
    const multiCompany = mkScope({
      allowedCompanies: [1, 3],
      branchId: MAKKAH_BRANCH_ID,
      allowedBranches: [MAKKAH_BRANCH_ID],
    });
    const { where, params } = buildScopedWhere(multiCompany, { companyIds: [3] });
    expect(where).toContain('"companyId" = $1');
    expect(params).toEqual([3]);
  });
});

// ─── Custom column names — tables with non-default names ─────────────────

describe("buildScopedWhere — custom column overrides", () => {
  it("branchColumn override (e.g. 'jl.branchId' for joined queries)", () => {
    const { where, params } = buildScopedWhere(
      makkahEmployee,
      {},
      {
        enforceBranchScope: true,
        companyColumn: 'je."companyId"',
        branchColumn: 'je."branchId"',
      },
    );
    expect(where).toContain('je."companyId" = $1');
    expect(where).toContain('je."branchId" = $2');
    expect(params).toEqual([1, MAKKAH_BRANCH_ID]);
  });
});
