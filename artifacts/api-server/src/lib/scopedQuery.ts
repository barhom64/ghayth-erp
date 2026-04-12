import { rawQuery } from "./rawdb.js";
import type { RequestScope } from "../middlewares/authMiddleware.js";
import type { Request } from "express";

export function parseScopeFilters(req: Request): ScopeFilters {
  const scope = req.scope!;
  const companyIds = req.query.companyIds
    ? String(req.query.companyIds).split(",").map(Number).filter((n) => scope.allowedCompanies.includes(n))
    : [];
  const branchIds = req.query.branchIds
    ? String(req.query.branchIds).split(",").map(Number).filter((n) => scope.allowedBranches.includes(n))
    : [];
  const search = req.query.search ? String(req.query.search) : undefined;
  return { companyIds: companyIds.length > 0 ? companyIds : undefined, branchIds: branchIds.length > 0 ? branchIds : undefined, search };
}

export interface ScopeFilters {
  companyIds?: number[];
  branchIds?: number[];
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
}

const BRANCH_SCOPE_EXEMPT_ROLES = new Set(["owner", "general_manager"]);

export function buildScopedWhere(
  scope: RequestScope,
  filters: ScopeFilters = {},
  options: ScopedQueryOptions = {},
  startParamIndex = 1
): { where: string; params: any[]; nextParamIndex: number } {
  const companyCol = options.companyColumn || '"companyId"';
  const branchCol = options.branchColumn || '"branchId"';

  const conditions: string[] = [];
  const params: any[] = [];
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

  if (branchIds.length === 1) {
    conditions.push(`${branchCol} = $${paramIdx}`);
    params.push(branchIds[0]);
    paramIdx++;
  } else if (branchIds.length > 1) {
    conditions.push(`${branchCol} = ANY($${paramIdx})`);
    params.push(branchIds);
    paramIdx++;
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
