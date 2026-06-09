import { rawQuery } from "./rawdb.js";
import type { RequestScope } from "../middlewares/authMiddleware.js";
import type { Request } from "express";
import { OWNER_GM_ROLES, ADMIN_ROLES, HR_ROLES, FINANCE_ROLES } from "./rbacCatalog.js";

export function parseScopeFilters(req: Request): ScopeFilters {
  const scope = req.scope!;
  const companyIds = req.query.companyIds
    ? String(req.query.companyIds).split(",").map(Number).filter((n) => scope.allowedCompanies.includes(n))
    : [];
  const branchIds = req.query.branchIds
    ? String(req.query.branchIds).split(",").map(Number).filter((n) => scope.allowedBranches.includes(n))
    : [];
  const departmentIds = req.query.departmentIds
    ? String(req.query.departmentIds).split(",").map(Number).filter((n) => (scope.allowedDepartments ?? []).includes(n))
    : [];
  const search = req.query.search ? String(req.query.search) : undefined;
  return {
    companyIds: companyIds.length > 0 ? companyIds : undefined,
    branchIds: branchIds.length > 0 ? branchIds : undefined,
    departmentIds: departmentIds.length > 0 ? departmentIds : undefined,
    search,
  };
}

export interface ScopeFilters {
  companyIds?: number[];
  branchIds?: number[];
  departmentIds?: number[];
  search?: string;
  searchColumns?: string[];
}

export interface ScopedQueryOptions {
  companyColumn?: string;
  branchColumn?: string;
  extraConditions?: string[];
  extraParams?: any[];
  orderBy?: string;
  limit?: number;
  offset?: number;
  /**
   * When true, routes that don't receive an explicit branchIds filter are
   * automatically restricted to the user's `scope.allowedBranches` unless
   * the user is owner or general_manager (who have company-wide access).
   * This implements the branch/company/role cascade: a branch_manager or
   * scoped manager only sees data from their assigned branches.
   */
  enforceBranchScope?: boolean;
  /**
   * When true, rows whose branch column is NULL are treated as
   * company-level (not branch-private) and remain visible even under
   * an active branch predicate. Without this, `branchId = ANY($branches)`
   * silently drops every NULL-branch row — so a finance document created
   * without a branch vanishes for any branch-scoped user while the
   * (unscoped) summary card still counts it. The two then disagree and
   * the table looks empty. Default false to preserve existing behaviour;
   * finance list endpoints opt in because their documents legitimately
   * sit at company level when no branch was chosen.
   */
  includeNullBranch?: boolean;
  /**
   * When true, completely disables branch filtering — even if the frontend
   * sent a `?branchIds=...` query param. Use this for tables that do not
   * have a `branchId` column (e.g. `clients`, `projects`, `crm_opportunities`,
   * `support_tickets`, `hr_leave_requests`, `recurring_invoices`).
   */
  disableBranchScope?: boolean;
  /**
   * SQL column expression for the department id (default `"departmentId"`).
   * Pass an aliased form like `e."departmentId"` when the table is aliased.
   */
  departmentColumn?: string;
  /**
   * Opt-in department cascade (org-as-security-boundary). When true and the
   * caller sent no explicit `departmentIds`, restricts results to the user's
   * `scope.allowedDepartments` — unless they are owner/GM or have no department
   * assignment (then no department predicate is applied). Off by default, so
   * existing routes are unchanged until they explicitly opt in.
   */
  enforceDepartmentScope?: boolean;
  /**
   * Disables department filtering entirely (for tables with no
   * `departmentId` column). Default behaviour already emits no department
   * predicate unless `enforceDepartmentScope` is set or `departmentIds` is
   * passed, so this is only needed to hard-guarantee no predicate.
   */
  disableDepartmentScope?: boolean;
  /**
   * Opt-in soft-delete filter. When set, appends an
   * `AND <softDeleteColumn> IS NULL` predicate to the generated WHERE so
   * list endpoints automatically hide soft-deleted rows. Pass the fully
   * qualified, quoted column expression that matches your FROM/alias —
   * e.g. `'"deletedAt"'` for an unaliased table or `'b."deletedAt"'` when
   * the table is aliased as `b`. Routes that historically appended this
   * predicate by hand can be migrated to use this option instead.
   */
  softDeleteColumn?: string;
}

const BRANCH_SCOPE_EXEMPT_ROLES = new Set(OWNER_GM_ROLES);
// Department scoping is role-aware ("حسب نظام الأدوار الوظيفية"): company-level
// roles (owner/GM + HR/admin/finance managers) span all departments and are
// NEVER restricted to a department, even if they happen to carry a department
// assignment. Only lower-tier roles (e.g. a department/team head) get scoped to
// the departments they are assigned to — and a manager assigned to several
// departments sees ALL of them via the allowedDepartments set.
const DEPT_SCOPE_EXEMPT_ROLES = new Set<string>([
  ...OWNER_GM_ROLES, ...ADMIN_ROLES, ...HR_ROLES, ...FINANCE_ROLES,
]);

export function buildScopedWhere(
  scope: RequestScope,
  filters: ScopeFilters = {},
  options: ScopedQueryOptions = {},
  startParamIndex = 1
): { where: string; params: unknown[]; nextParamIndex: number } {
  const companyCol = options.companyColumn || '"companyId"';
  const branchCol = options.branchColumn || '"branchId"';

  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIdx = startParamIndex;

  const companyIds = filters.companyIds?.length
    ? filters.companyIds.filter((id) => scope.allowedCompanies.includes(id))
    : scope.allowedCompanies;

  if (companyIds.length === 1) {
    conditions.push(`${companyCol} = $${paramIdx}`);
    params.push(companyIds[0]);
    paramIdx++;
  } else if (companyIds.length > 1) {
    conditions.push(`${companyCol} = ANY($${paramIdx})`);
    params.push(companyIds);
    paramIdx++;
  }

  if (!options.disableBranchScope) {
    const requestedBranchIds = filters.branchIds?.length ? filters.branchIds : [];
    let branchIds: number[] = requestedBranchIds.length > 0
      ? requestedBranchIds.filter((id) => scope.allowedBranches.includes(id))
      : [];

    // Cascade enforcement: when no explicit branch filter is provided and the
    // caller opted in, apply the user's allowed branches so branch_managers
    // and other scoped roles can't see data from branches they aren't
    // assigned to. Owners and general_managers bypass this.
    if (
      branchIds.length === 0 &&
      options.enforceBranchScope &&
      !scope.isOwner &&
      !BRANCH_SCOPE_EXEMPT_ROLES.has(scope.role) &&
      scope.allowedBranches.length > 0
    ) {
      branchIds = scope.allowedBranches;
    }

    // When includeNullBranch is set, NULL-branch (company-level) rows
    // survive the predicate alongside the scoped branch ids.
    //
    // Owners / general_managers have company-wide visibility by definition:
    // under "all branches" they already see every row, NULL-branch ones
    // included. When they narrow to a single branch via the header picker
    // (the default is a single branch, not "all"), a plain `branchId = $x`
    // predicate would silently drop every company-level (NULL-branch) row —
    // the exact "الصفحة ما تطلع الا لما أختار كل الفروع" symptom. Since these
    // rows are not branch-private and the owner/GM is already entitled to
    // them, always keep NULL-branch rows visible for company-wide roles.
    // This exposes nothing new (it is a strict subset of their "all
    // branches" view) and only affects rows with no branch assignment.
    const isCompanyWideRole = scope.isOwner || BRANCH_SCOPE_EXEMPT_ROLES.has(scope.role);
    const nullClause =
      options.includeNullBranch || isCompanyWideRole ? `${branchCol} IS NULL OR ` : "";
    if (branchIds.length === 1) {
      conditions.push(`(${nullClause}${branchCol} = $${paramIdx})`);
      params.push(branchIds[0]);
      paramIdx++;
    } else if (branchIds.length > 1) {
      conditions.push(`(${nullClause}${branchCol} = ANY($${paramIdx}))`);
      params.push(branchIds);
      paramIdx++;
    }
  }

  // Department-level scoping — additive, opt-in, and never enabled by default.
  // Mirrors the branch cascade: when a route opts in via enforceDepartmentScope
  // and the user is neither owner/GM nor department-unbounded, restrict to the
  // user's assigned departments. An explicit ?departmentIds filter narrows
  // within the allowed set. Owners/GMs and users with no department assignment
  // (empty allowedDepartments) get NO department predicate (full visibility).
  if (!options.disableDepartmentScope) {
    const deptCol = options.departmentColumn || '"departmentId"';
    const allowedDepartments = scope.allowedDepartments ?? [];
    let departmentIds: number[] = filters.departmentIds?.length
      ? filters.departmentIds.filter((id) => allowedDepartments.includes(id))
      : [];
    if (
      departmentIds.length === 0 &&
      options.enforceDepartmentScope &&
      !scope.isOwner &&
      !DEPT_SCOPE_EXEMPT_ROLES.has(scope.role) &&
      allowedDepartments.length > 0
    ) {
      departmentIds = allowedDepartments;
    }
    if (departmentIds.length === 1) {
      conditions.push(`${deptCol} = $${paramIdx}`);
      params.push(departmentIds[0]);
      paramIdx++;
    } else if (departmentIds.length > 1) {
      conditions.push(`${deptCol} = ANY($${paramIdx})`);
      params.push(departmentIds);
      paramIdx++;
    }
  }

  if (filters.search && filters.searchColumns?.length) {
    const searchConds = filters.searchColumns.map(
      (col) => `${col} ILIKE $${paramIdx}`
    );
    conditions.push(`(${searchConds.join(" OR ")})`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }

  if (options.extraConditions) {
    for (const cond of options.extraConditions) {
      conditions.push(cond);
    }
  }
  if (options.extraParams) {
    params.push(...options.extraParams);
    paramIdx += options.extraParams.length;
  }

  if (options.softDeleteColumn) {
    conditions.push(`${options.softDeleteColumn} IS NULL`);
  }

  const where = conditions.length > 0 ? conditions.join(" AND ") : "1=1";
  return { where, params, nextParamIndex: paramIdx };
}

export async function scopedQuery<T = any>(
  baseSQL: string,
  scope: RequestScope,
  filters: ScopeFilters = {},
  options: ScopedQueryOptions = {}
): Promise<T[]> {
  const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, options);

  let sql = baseSQL.includes("{{WHERE}}")
    ? baseSQL.replace("{{WHERE}}", where)
    : `${baseSQL} WHERE ${where}`;

  if (options.orderBy) {
    sql += ` ORDER BY ${options.orderBy}`;
  }

  let paramIdx = nextParamIndex;
  if (options.limit !== undefined) {
    sql += ` LIMIT $${paramIdx}`;
    params.push(options.limit);
    paramIdx++;
  }
  if (options.offset !== undefined) {
    sql += ` OFFSET $${paramIdx}`;
    params.push(options.offset);
    paramIdx++;
  }

  return rawQuery<T>(sql, params);
}

export async function scopedCount(
  baseCountSQL: string,
  scope: RequestScope,
  filters: ScopeFilters = {},
  options: ScopedQueryOptions = {}
): Promise<number> {
  const { where, params } = buildScopedWhere(scope, filters, options);

  const sql = baseCountSQL.includes("{{WHERE}}")
    ? baseCountSQL.replace("{{WHERE}}", where)
    : `${baseCountSQL} WHERE ${where}`;

  const rows = await rawQuery<{ total: string }>(sql, params);
  return Number(rows[0]?.total ?? 0);
}
