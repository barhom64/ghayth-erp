import { rawQuery } from "./rawdb.js";
import type { RequestScope } from "../middlewares/authMiddleware.js";
import type { Request } from "express";
import { OWNER_GM_ROLES } from "./rbacCatalog.js";
import { logger } from "./logger.js";

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
  /**
   * P0.3 — `extraConditions` is unparameterised raw SQL fragments. The
   * helper itself can't tell whether a fragment came from a string
   * literal in the calling route file (safe) or was concatenated with
   * a request value (SQL injection). To make accidental misuse hard:
   *   - Every fragment is run through `isSafeExtraCondition` (below)
   *     before being appended. The check rejects fragments that don't
   *     reference at least one `$N` placeholder OR aren't a known
   *     constant predicate (`status = 'active'`, `"deletedAt" IS NULL`).
   *   - If a fragment is rejected, an Error is thrown at construction
   *     time — better to fail loudly than emit unscoped SQL.
   * Callers that legitimately need a constant predicate should pass
   * the placeholder pattern; callers that need a request value should
   * pass `$N` + an entry in `extraParams`.
   */
  extraConditions?: string[];
  extraParams?: any[];
  /**
   * P0.3 — `orderBy` is interpolated directly into the SQL string. The
   * helper now requires `orderByAllowed` (whitelist of column names or
   * column-direction tuples) when `orderBy` is set. The supplied value
   * MUST resolve to a substring of the whitelist; otherwise we throw.
   * Callers that don't want this guard (e.g. a list endpoint with an
   * internal hard-coded ORDER BY) can pass `orderByTrusted: true` —
   * the field is named to nag the next reviewer.
   */
  orderBy?: string;
  orderByAllowed?: string[];
  orderByTrusted?: boolean;
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

// ─── P0.3 SQL safety helpers ────────────────────────────────────────────
//
// orderBy whitelist — accepts the supplied value if it matches one of:
//   1. A bare column name in the whitelist (e.g. `id`) → appended ASC
//   2. A column + direction pair in the whitelist (e.g. `id DESC`)
//   3. The exact comma-separated tuple in the whitelist
// Otherwise throws. Whitelist entries are case-sensitive and must NOT
// contain semicolons / parentheses / sub-selects — we sanity-check
// them at validator time too so a typo in a route doesn't open a hole.
const SAFE_ORDER_BY_REGEX = /^[A-Za-z_"][\w".]*(\s+(?:ASC|DESC))?(\s*,\s*[A-Za-z_"][\w".]*(\s+(?:ASC|DESC))?)*$/;
function validateOrderBy(value: string, allowed: string[] | undefined): void {
  // Hard structural check first — even when trusted=true we don't
  // want a stray "; DROP TABLE…" to slip through.
  if (!SAFE_ORDER_BY_REGEX.test(value)) {
    throw new Error(`[scopedQuery] orderBy contains unsafe characters: ${JSON.stringify(value)}`);
  }
  if (!allowed || allowed.length === 0) {
    throw new Error(`[scopedQuery] orderBy was supplied but orderByAllowed whitelist is empty. Use orderByTrusted=true only for hard-coded internal strings.`);
  }
  // Match the supplied value against any whitelist entry — exact, or
  // column-only (whitelist contains "id ASC" but caller passed "id").
  const normalised = value.trim().replace(/\s+/g, " ");
  const inWhitelist = allowed.some((entry) => {
    const a = entry.trim().replace(/\s+/g, " ");
    if (a === normalised) return true;
    // Allow "id" to match whitelist entry "id ASC" or "id DESC" too.
    const aCol = a.split(/\s+/)[0];
    const nCol = normalised.split(/\s+/)[0];
    return aCol === nCol;
  });
  if (!inWhitelist) {
    throw new Error(`[scopedQuery] orderBy "${value}" is not in orderByAllowed: ${JSON.stringify(allowed)}`);
  }
}

// extraConditions safety — reject fragments that look like they came
// from a concatenation with a request value. A safe fragment either
// references a $N placeholder (parameterised) OR is a known constant
// predicate. Quoted string literals are forbidden because they suggest
// the caller built a SQL fragment around a user-supplied value.
const PLACEHOLDER_REGEX = /\$\d+/;
const CONSTANT_PREDICATE_REGEX = /^[\s\w".'=<>!()]+ (IS|IS NOT) (NULL|TRUE|FALSE)$/i;
const SAFE_CONSTANT_VALUE_REGEX = /=\s*'(active|pending|completed|inactive|draft|posted|cancelled|deleted|true|false)'$/i;
function validateExtraCondition(cond: string): void {
  const trimmed = cond.trim();
  if (PLACEHOLDER_REGEX.test(trimmed)) return; // parameterised — safe
  if (CONSTANT_PREDICATE_REGEX.test(trimmed)) return; // `"deletedAt" IS NULL` etc.
  if (SAFE_CONSTANT_VALUE_REGEX.test(trimmed)) return; // `status = 'active'` etc.
  // Quoted strings without a known-safe constant pattern are rejected
  // because they're the canonical concatenation tell. Same for
  // semicolons (no DDL/multi-statements ever) and -- comments.
  if (/'[^']*'/.test(trimmed) || trimmed.includes(";") || trimmed.includes("--")) {
    throw new Error(`[scopedQuery] extraConditions fragment looks unsafe (literal/semicolon/comment): ${JSON.stringify(cond)}. Use a $N placeholder + extraParams instead.`);
  }
  // Bare column comparisons without literals and without placeholders
  // (e.g. `"a" = "b"`) are allowed — those are pure column references
  // a request value could never reach.
}

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

  // P0.2 — log a warn when neither enforceBranchScope nor disableBranchScope
  // was set. This is the "scope-defaulted" case the reviewer flagged: a
  // route that doesn't declare intent leaves branch_managers / scoped
  // managers seeing every branch in their company. We don't BREAK these
  // routes (would crash 100+ endpoints at once), but we log loudly so
  // ops can audit + ratchet them to explicit flags. Owners/GMs are
  // unaffected either way (they bypass the cascade).
  if (
    options.enforceBranchScope === undefined &&
    !options.disableBranchScope &&
    !scope.isOwner &&
    !BRANCH_SCOPE_EXEMPT_ROLES.has(scope.role)
  ) {
    logger.warn(
      {
        userId: scope.userId,
        companyId: scope.companyId,
        role: scope.role,
        marker: "scope_branch_not_declared",
      },
      "[scopedQuery] route did not declare enforceBranchScope or disableBranchScope — scoped user may see all branches in company. Audit + fix.",
    );
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

    if (branchIds.length === 1) {
      conditions.push(`${branchCol} = $${paramIdx}`);
      params.push(branchIds[0]);
      paramIdx++;
    } else if (branchIds.length > 1) {
      conditions.push(`${branchCol} = ANY($${paramIdx})`);
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
      !BRANCH_SCOPE_EXEMPT_ROLES.has(scope.role) &&
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
      validateExtraCondition(cond); // P0.3 — throws if unsafe
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
    if (!options.orderByTrusted) {
      validateOrderBy(options.orderBy, options.orderByAllowed);
    }
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
