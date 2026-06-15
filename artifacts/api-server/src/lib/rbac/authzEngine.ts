/**
 * authzEngine — the runtime authorisation engine for layered RBAC v2.
 *
 * checkAccess() is the single function every authorize() middleware call
 * funnels through. It evaluates all 5 layers + cross-cutting rules:
 *
 *   1. Module      — does any of the user's roles include this module?
 *   2. Feature     — does any role grant this feature?
 *   3. Action      — does the grant include the requested action?
 *   4. Scope       — does the requested record fall inside the role's
 *                    scope (self / team / department / branch / ...)?
 *   5. Field       — which fields does the user see vs mask vs hide?
 *
 * Cross-cutting:
 *   • approvalLimit  — for approve actions, ensure amount ≤ role limit
 *   • SoD            — block conflicting grants (handled in admin API,
 *                       not at request time)
 *   • employeeFloor  — every employee gets SELF_SERVICE_FEATURES
 *                       regardless of role grants. NEVER deniable.
 *
 * The engine is deny-by-default for the request itself but
 * allow-by-default for self-service. That is the "employee-first"
 * guarantee.
 */

import { rawQuery } from "../rawdb.js";
import type { RequestScope } from "../../middlewares/authMiddleware.js";
import {
  FEATURE_INDEX,
  SELF_SERVICE_FEATURES,
  type Action,
  type Scope,
} from "./featureCatalog.js";
import { evaluateConditions, type AbacConditions } from "./abacConditions.js";
import { enforceSoD } from "./sodEnforcement.js";
import { isOwnRecord } from "./recordOwnership.js";
import { getActiveDelegationsFor, delegationCoversFeature, auditDelegatedUse } from "./delegationService.js";
import { publishInvalidation, onInvalidation } from "./distributedCache.js";
import { config } from "../config.js";

export interface AccessSpec {
  feature: string;
  action: Action;
  /** Optional resource pointer for scope/ownership evaluation. */
  resource?: {
    /** Table to look up the record in (for scope checks). */
    table?: string;
    /** Where the record id lives — req.params[idParam] by default. */
    id?: number | string | null;
    /** Pre-fetched record fields — skips the DB lookup if provided. */
    record?: ResourceRecord;
  };
  /** Currency-bearing actions (approve) — engine validates against approval_limits. */
  amount?: { value: number; currency?: string };
  /**
   * Caller IP, extracted from the request by the authorize() middleware.
   * Required for the `ipPrefixIn` ABAC condition. Without it, that
   * condition silently passes (security gap).
   */
  ipAddress?: string | null;
}

export interface ResourceRecord {
  companyId?: number | null;
  branchId?: number | null;
  departmentId?: number | null;
  createdBy?: number | null;
  employeeId?: number | null;
  assigneeId?: number | null;
  managerId?: number | null;
  amount?: number | null;
}

export interface AccessResult {
  allowed: boolean;
  reasonAr?: string;
  code?: string;
  /** Field-mode map for `applyFieldPolicy(response)` to consume. */
  fieldPolicy?: Record<string, "visible" | "masked" | "hidden" | "readonly">;
  /** SQL filter the handler can splice into a list query. */
  scopeFilter?: { sql: string; params: unknown[] } | null;
  /** Effective approval limit (for approve actions). */
  approvalLimit?: { max: number | null; currency: string; requiresDualControl: boolean } | null;
  /** Diagnostics — populated even on denial so the admin can fix it. */
  diagnostics?: {
    matchedRoleIds: number[];
    grantedActions: Action[];
    grantedScope?: Scope;
    yourCompanyId?: number;
    recordCompanyId?: number | null;
    requiredFix?: string;
    /** Set when access was granted via an active delegation (delegator emp id). */
    delegatedFrom?: number;
  };
}

interface RoleGrantRow {
  role_id: number;
  feature_key: string;
  actions: string[];
  scope: string;
  conditions: any;
  /** Set when this is a virtual grant inherited via an active delegation —
   *  carries the delegator's employee id for the audit trail. role_id is -2. */
  __delegatorId?: number;
}

interface FieldPolicyRow {
  feature_key: string;
  field_name: string;
  mode: string;
}

interface ApprovalLimitRow {
  feature_key: string;
  action: string;
  currency: string;
  max_amount: string | null;
  requires_dual_control: boolean;
}

interface UserGrantRow {
  feature_key: string;
  action: string | null;
  scope: string | null;
  type: "grant" | "revoke";
  expires_at: string | null;
}

// ─── In-process cache ───────────────────────────────────────────────────────
// Keyed by `${userId}:${companyId}:${cacheVersion}`. The cache version is
// bumped (in admin API) on any role mutation, so updates propagate within
// one process without a restart. For multi-process deployments, a Redis
// pub/sub is the next step (out of scope for v2.0).
const grantCache = new Map<string, { grants: RoleGrantRow[]; fields: FieldPolicyRow[]; limits: ApprovalLimitRow[]; userGrants: UserGrantRow[]; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

async function loadEffectiveGrants(userId: number, companyId: number, selectedRoleKey: string | null = null): Promise<{
  grants: RoleGrantRow[];
  fields: FieldPolicyRow[];
  limits: ApprovalLimitRow[];
  userGrants: UserGrantRow[];
}> {
  const versionRow = await rawQuery<{ version: number }>(
    `SELECT version FROM rbac_cache_version WHERE "companyId" = $1`,
    [companyId]
  ).catch(() => [] as { version: number }[]);
  const version = versionRow[0]?.version ?? 0;
  // Cache key must vary by selected role so picking a different role
  // doesn't replay the cached full-union grants from the previous request.
  const cacheKey = `${userId}:${companyId}:${version}:${selectedRoleKey || "*"}`;
  const cached = grantCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached;

  // When the user picked a single role in the header, narrow the
  // recursive role-tree CTE to just that role_key (and its ancestors).
  // Falls back to "all assigned roles" when no key is picked or the key
  // doesn't match any rbac_roles row for this company.
  const roleFilterSql = selectedRoleKey ? `AND r.role_key = $3` : "";
  const queryParams: unknown[] = selectedRoleKey ? [userId, companyId, selectedRoleKey] : [userId, companyId];

  // Role hierarchy walk: a user's grants include not only their directly
  // assigned roles but every ancestor role in the parent_role_id chain.
  // The recursive CTE walks up via rbac_roles.parent_role_id (set in
  // PR #265). With this, granting "Senior Manager" to a role
  // automatically gives every Senior-Manager-derived role the same
  // grants — no need to duplicate.
  const grants = await rawQuery<RoleGrantRow>(
    `WITH RECURSIVE user_role_tree AS (
       SELECT r.id, r.parent_role_id
         FROM rbac_roles r
         JOIN rbac_user_roles ur ON ur.role_id = r.id
        WHERE ur."userId" = $1 AND ur."companyId" = $2
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          ${roleFilterSql}
       UNION
       SELECT pr.id, pr.parent_role_id
         FROM rbac_roles pr
         JOIN user_role_tree urt ON urt.parent_role_id = pr.id
        WHERE pr.is_active = TRUE
     )
     SELECT g.role_id, g.feature_key, g.actions, g.scope, g.conditions
       FROM rbac_role_grants g
       JOIN user_role_tree urt ON urt.id = g.role_id`,
    queryParams
  ).catch(() => [] as RoleGrantRow[]);

  const fields = await rawQuery<FieldPolicyRow>(
    `WITH RECURSIVE user_role_tree AS (
       SELECT r.id, r.parent_role_id
         FROM rbac_roles r
         JOIN rbac_user_roles ur ON ur.role_id = r.id
        WHERE ur."userId" = $1 AND ur."companyId" = $2
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          ${roleFilterSql}
       UNION
       SELECT pr.id, pr.parent_role_id
         FROM rbac_roles pr
         JOIN user_role_tree urt ON urt.parent_role_id = pr.id
        WHERE pr.is_active = TRUE
     )
     SELECT fp.feature_key, fp.field_name, fp.mode
       FROM rbac_field_policies fp
       JOIN user_role_tree urt ON urt.id = fp.role_id`,
    queryParams
  ).catch(() => [] as FieldPolicyRow[]);

  const limits = await rawQuery<ApprovalLimitRow>(
    `WITH RECURSIVE user_role_tree AS (
       SELECT r.id, r.parent_role_id
         FROM rbac_roles r
         JOIN rbac_user_roles ur ON ur.role_id = r.id
        WHERE ur."userId" = $1 AND ur."companyId" = $2
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          ${roleFilterSql}
       UNION
       SELECT pr.id, pr.parent_role_id
         FROM rbac_roles pr
         JOIN user_role_tree urt ON urt.parent_role_id = pr.id
        WHERE pr.is_active = TRUE
     )
     SELECT al.feature_key, al.action, al.currency, al.max_amount, al.requires_dual_control
       FROM rbac_approval_limits al
       JOIN user_role_tree urt ON urt.id = al.role_id`,
    queryParams
  ).catch(() => [] as ApprovalLimitRow[]);

  // Per-user overrides — JIT elevation grants land here. Engine must
  // honor them or the JIT lifecycle is just bookkeeping.
  const userGrants = await rawQuery<UserGrantRow>(
    `SELECT feature_key, action, scope, type, expires_at
       FROM rbac_user_grants
      WHERE "userId" = $1 AND "companyId" = $2
        AND (expires_at IS NULL OR expires_at > NOW())`,
    [userId, companyId]
  ).catch(() => [] as UserGrantRow[]);

  const result = { grants, fields, limits, userGrants };
  grantCache.set(cacheKey, { ...result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

/**
 * Flatten the caller's effective RBAC v2 grants into a Set of both fine
 * `feature:action` and coarse `module:action` keys. Reuses the 30s grant
 * cache keyed identically to authorize(), so once the foundation loads it
 * in buildScope the subsequent authorize() call is a warm hit — near-zero
 * added cost. This is the bridge that lets in-handler authorization read
 * from grants (the single source of truth) instead of hardcoded role
 * lists — closing the HR-REV-1 #1 "parallel role-set" duplication.
 *
 * Never throws: any failure degrades to an empty set, and scopeCan() then
 * falls back to the owner-only check. The auth hot path must not break.
 */
export async function loadFineGrantKeys(scope: RequestScope): Promise<ReadonlySet<string>> {
  const keys = new Set<string>();
  if (!scope?.userId || !scope?.companyId) return keys;
  try {
    const { grants } = await loadEffectiveGrants(scope.userId, scope.companyId, scope.selectedRoleKey ?? null);
    for (const g of grants) {
      const fk = (g.feature_key ?? "").trim();
      if (!fk) continue;
      const mod = fk.split(".")[0];
      for (const raw of g.actions ?? []) {
        const act = String(raw ?? "").trim();
        if (!act) continue;
        keys.add(`${fk}:${act}`);
        if (mod) keys.add(`${mod}:${act}`);
      }
    }
  } catch {
    /* degrade to empty — owner-only fallback in scopeCan() */
  }
  return keys;
}

/**
 * In-handler permission check derived from RBAC v2 grants — replaces the
 * hardcoded `ROLE_SET.includes(scope.role)` pattern. Owners always pass
 * (they hold the `*` wildcard, same as every existing gate). Accepts a
 * fine feature key (`hr.payroll`) or a coarse module (`hr`); both forms
 * are present in the projected set. Returns false when grants haven't been
 * loaded onto the scope (defensive — buildScope always loads them).
 */
export function scopeCan(scope: RequestScope, feature: string, action: string): boolean {
  if (scope?.isOwner) return true;
  return scope?.fineGrants?.has(`${feature}:${action}`) ?? false;
}

// Subscribe once per process: when another replica publishes an
// invalidation, drop our local grant cache for that company so the
// next request re-reads from Postgres.
onInvalidation((event) => {
  if (event.kind === "grants" || event.kind === "all" || !event.kind) {
    for (const key of grantCache.keys()) {
      if (key.includes(`:${event.companyId}:`)) grantCache.delete(key);
    }
  }
});

export async function bumpCacheVersion(companyId: number): Promise<void> {
  await rawQuery(
    `INSERT INTO rbac_cache_version ("companyId", version, "updatedAt")
     VALUES ($1, 1, NOW())
     ON CONFLICT ("companyId") DO UPDATE SET version = rbac_cache_version.version + 1, "updatedAt" = NOW()`,
    [companyId]
  );
  // Drop local cache for this company immediately (don't wait for the
  // next request to notice the version bump — same process should see
  // the change instantly).
  for (const key of grantCache.keys()) {
    if (key.includes(`:${companyId}:`)) grantCache.delete(key);
  }
  // Tell every other replica to drop theirs.
  await publishInvalidation(companyId, "grants");
}

// ─── Scope evaluation ───────────────────────────────────────────────────────

export interface ScopeContext {
  scope: RequestScope;
  /** Current user's department (resolved from employee_assignments). */
  departmentId: number | null;
  /** Departments where current user is the listed manager (team scope). */
  managedDepartmentIds: number[];
  /** Direct reports (employees whose managerId === scope.employeeId). */
  directReportEmployeeIds: number[];
}

async function loadScopeContext(scope: RequestScope): Promise<ScopeContext> {
  if (!scope.employeeId) {
    return { scope, departmentId: null, managedDepartmentIds: [], directReportEmployeeIds: [] };
  }
  const [activeAsg] = await rawQuery<{ departmentId: number | null }>(
    `SELECT "departmentId" FROM employee_assignments WHERE id = $1`,
    [scope.activeAssignmentId]
  ).catch(() => [] as { departmentId: number | null }[]);
  const managedDeps = await rawQuery<{ id: number }>(
    `SELECT id FROM departments WHERE "managerId" = $1 AND "companyId" = $2`,
    [scope.employeeId, scope.companyId]
  ).catch(() => [] as { id: number }[]);
  const reports = await rawQuery<{ id: number }>(
    `SELECT id FROM employees e
       JOIN employee_assignments ea ON ea."employeeId" = e.id
      WHERE ea."managerId" = $1 AND ea."companyId" = $2 AND ea.status = 'active'`,
    [scope.employeeId, scope.companyId]
  ).catch(() => [] as { id: number }[]);
  return {
    scope,
    departmentId: activeAsg?.departmentId ?? null,
    managedDepartmentIds: managedDeps.map((d) => d.id),
    directReportEmployeeIds: reports.map((r) => r.id),
  };
}

export function evaluateScopeForRecord(grant: RoleGrantRow, ctx: ScopeContext, record?: ResourceRecord, table?: string | null): boolean {
  if (!record) return true; // list endpoints with no specific record
  const { scope } = ctx;

  if (record.companyId != null && record.companyId !== scope.companyId) return false;

  switch (grant.scope as Scope) {
    case "all":
      return true;
    case "multi_company":
    case "company":
      return record.companyId == null || record.companyId === scope.companyId;
    case "branches":
      return !record.branchId || scope.allowedBranches.includes(record.branchId);
    case "branch":
      return !record.branchId || record.branchId === scope.branchId;
    case "department_tree":
      // Walk the parent chain: record's department or any descendant of user's
      // department. Implemented as a "managed departments OR own department"
      // check at this layer; deeper recursion is left to scopeFilter SQL.
      return (
        record.departmentId == null ||
        record.departmentId === ctx.departmentId ||
        ctx.managedDepartmentIds.includes(record.departmentId)
      );
    case "department":
      return record.departmentId == null || record.departmentId === ctx.departmentId;
    case "team":
      return (
        (record.managerId === scope.employeeId) ||
        (record.assigneeId != null && (record.assigneeId === scope.employeeId || ctx.directReportEmployeeIds.includes(record.assigneeId))) ||
        (record.employeeId != null && (record.employeeId === scope.employeeId || ctx.directReportEmployeeIds.includes(record.employeeId)))
      );
    case "self":
      // `createdBy` may be a user id OR an assignment id depending on the
      // table (see recordOwnership) — resolve in the correct identity space
      // rather than assuming `createdBy === userId`, which silently fails on
      // every assignment-id table (most of finance).
      return (
        isOwnRecord(table, record.createdBy, {
          userId: scope.userId,
          assignmentIds: scope.allowedAssignments ?? [],
        }) ||
        record.employeeId === scope.employeeId ||
        record.assigneeId === scope.employeeId
      );
    default:
      return false;
  }
}

function buildScopeFilter(grant: RoleGrantRow, ctx: ScopeContext, columns: ScopeColumnMap): { sql: string; params: unknown[] } | null {
  const { scope } = ctx;
  const c = columns;
  switch (grant.scope as Scope) {
    case "all":
      return { sql: "1=1", params: [] };
    case "multi_company":
    case "company":
      return { sql: `${c.companyId} = $1`, params: [scope.companyId] };
    case "branches":
      return scope.allowedBranches.length
        ? { sql: `${c.companyId} = $1 AND ${c.branchId} = ANY($2::int[])`, params: [scope.companyId, scope.allowedBranches] }
        : { sql: `${c.companyId} = $1 AND FALSE`, params: [scope.companyId] };
    case "branch":
      return { sql: `${c.companyId} = $1 AND ${c.branchId} = $2`, params: [scope.companyId, scope.branchId] };
    case "department_tree":
    case "department":
      if (!ctx.departmentId) return { sql: `${c.companyId} = $1 AND FALSE`, params: [scope.companyId] };
      return { sql: `${c.companyId} = $1 AND ${c.departmentId} = $2`, params: [scope.companyId, ctx.departmentId] };
    case "team":
      // Best-effort: created by self OR assigned to self/reports.
      return {
        sql: `${c.companyId} = $1 AND (${c.createdBy} = $2 OR ${c.assigneeId} = ANY($3::int[]) OR ${c.employeeId} = ANY($3::int[]))`,
        params: [scope.companyId, scope.userId, [scope.employeeId, ...ctx.directReportEmployeeIds].filter(Boolean)],
      };
    case "self":
      // NOTE: this scopeFilter SQL is not yet consumed by any handler (lists
      // scope via buildScopedWhere instead). If wired, the `createdBy = userId`
      // predicate must be widened per recordOwnership — on assignment-id tables
      // createdBy never equals userId, so self-scoped lists would show none of
      // the user's own rows. Mirror evaluateScopeForRecord's isOwnRecord logic.
      return {
        sql: `${c.companyId} = $1 AND (${c.createdBy} = $2 OR ${c.employeeId} = $3 OR ${c.assigneeId} = $3)`,
        params: [scope.companyId, scope.userId, scope.employeeId ?? -1],
      };
  }
  return null;
}

interface ScopeColumnMap {
  companyId: string;
  branchId: string;
  departmentId: string;
  createdBy: string;
  employeeId: string;
  assigneeId: string;
}

const DEFAULT_COLUMNS: ScopeColumnMap = {
  companyId: '"companyId"',
  branchId: '"branchId"',
  departmentId: '"departmentId"',
  createdBy: '"createdBy"',
  employeeId: '"employeeId"',
  assigneeId: '"assigneeId"',
};

// ─── Main entry point ───────────────────────────────────────────────────────

export async function checkAccess(scope: RequestScope, spec: AccessSpec, columns: Partial<ScopeColumnMap> = {}): Promise<AccessResult> {
  // Owner → unrestricted (but still annotated for audit).
  if (scope.isOwner || scope.role === "owner") {
    return {
      allowed: true,
      fieldPolicy: {},
      scopeFilter: null,
      diagnostics: { matchedRoleIds: [], grantedActions: ["view", "list", "create", "update", "delete", "approve"], grantedScope: "all" },
    };
  }

  // Validate the spec against the catalog.
  const featureDef = FEATURE_INDEX.get(spec.feature);
  if (!featureDef) {
    return { allowed: false, reasonAr: `الميزة "${spec.feature}" غير معرّفة في النظام`, code: "UNKNOWN_FEATURE" };
  }
  if (!featureDef.availableActions.includes(spec.action)) {
    return { allowed: false, reasonAr: `الإجراء "${spec.action}" غير متاح للميزة`, code: "UNKNOWN_ACTION" };
  }

  // Self-service floor — every employee gets these unconditionally.
  if (featureDef.selfService && SELF_SERVICE_FEATURES.includes(spec.feature)) {
    return { allowed: true, fieldPolicy: {}, scopeFilter: null, diagnostics: { matchedRoleIds: [], grantedActions: [spec.action], grantedScope: "self", requiredFix: "self-service" } };
  }

  const { grants, fields, limits, userGrants } = await loadEffectiveGrants(scope.userId, scope.companyId, scope.selectedRoleKey ?? null);
  const ctx = await loadScopeContext(scope);

  // Per-user revokes — pull rugs out before anything else.
  const isRevoked = userGrants.some((u) =>
    u.type === "revoke" &&
    u.feature_key === spec.feature &&
    (u.action == null || u.action === spec.action)
  );
  if (isRevoked) {
    return {
      allowed: false,
      reasonAr: `صلاحيتك على هذه الميزة مسحوبة على مستوى المستخدم`,
      code: "USER_REVOKED",
      diagnostics: {
        matchedRoleIds: [],
        grantedActions: [],
        requiredFix: "تواصل مع المسؤول لإعادة منح الصلاحية",
      },
    };
  }

  // Per-user grants — JIT elevation lands here. They augment role
  // grants by acting as additional virtual matches with the user-grant's
  // scope (or 'self' if unspecified).
  const userGrantMatches = userGrants
    .filter((u) =>
      u.type === "grant" &&
      u.feature_key === spec.feature &&
      (u.action == null || u.action === spec.action)
    )
    .map((u): RoleGrantRow => ({
      role_id: -1, // sentinel for "from user_grants"
      feature_key: u.feature_key,
      actions: [spec.action],
      scope: u.scope || "self",
      conditions: null,
    }));

  // Find any grant that covers (feature, action). Wildcard via parent feature.
  const matchesFeatureAction = (g: RoleGrantRow): boolean => {
    if (g.feature_key !== spec.feature && g.feature_key !== `${featureDef.moduleKey}.*` && g.feature_key !== "*") return false;
    return g.actions.includes(spec.action) || g.actions.includes("*");
  };
  const roleMatches = grants.filter(matchesFeatureAction);

  // Delegation: if the acting user is an active delegate whose delegation covers
  // this feature, inherit the DELEGATOR's grants on it (never more than the
  // delegator actually has). This is what makes a delegation real — without it
  // the delegations table is decorative. Bounded by the active window + feature
  // list (delegationService), and every use is audited at the allow point below.
  const delegatedMatches: RoleGrantRow[] = [];
  if (scope.employeeId) {
    const delegations = await getActiveDelegationsFor(scope.companyId, scope.employeeId);
    for (const d of delegations) {
      if (!d.delegatorUserId) continue;
      if (!delegationCoversFeature(d.features, spec.feature, featureDef.moduleKey)) continue;
      const delegatorGrants = (await loadEffectiveGrants(d.delegatorUserId, scope.companyId)).grants;
      for (const g of delegatorGrants) {
        if (matchesFeatureAction(g)) {
          delegatedMatches.push({ ...g, role_id: -2, __delegatorId: d.delegatorId });
        }
      }
    }
  }

  const matchingGrants = [...roleMatches, ...userGrantMatches, ...delegatedMatches];

  if (matchingGrants.length === 0) {
    return {
      allowed: false,
      reasonAr: `لا تملك صلاحية ${actionLabel(spec.action)} على ${featureDef.labelAr}`,
      code: "FORBIDDEN",
      diagnostics: {
        matchedRoleIds: [],
        grantedActions: [],
        requiredFix: `اطلب من المسؤول منح دورك صلاحية ${spec.feature}:${spec.action}`,
      },
    };
  }

  // Pick the best (most permissive) grant — highest scope wins.
  const SCOPE_RANK: Record<Scope, number> = {
    self: 1, team: 2, department: 3, department_tree: 4, branch: 5, branches: 6, company: 7, multi_company: 8, all: 9,
  };
  matchingGrants.sort((a, b) => (SCOPE_RANK[b.scope as Scope] || 0) - (SCOPE_RANK[a.scope as Scope] || 0));
  const bestGrant = matchingGrants[0];

  // Scope check on the specific record (if provided).
  const passesScope = evaluateScopeForRecord(bestGrant, ctx, spec.resource?.record, spec.resource?.table);
  if (spec.resource?.record && !passesScope) {
    return {
      allowed: false,
      reasonAr: `هذا السجل خارج نطاق صلاحياتك (${scopeLabel(bestGrant.scope as Scope)})`,
      code: "OUT_OF_SCOPE",
      diagnostics: {
        matchedRoleIds: matchingGrants.map((g) => g.role_id),
        grantedActions: bestGrant.actions as Action[],
        grantedScope: bestGrant.scope as Scope,
        yourCompanyId: scope.companyId,
        recordCompanyId: spec.resource?.record?.companyId ?? null,
      },
    };
  }

  // ABAC conditions: evaluate any JSON conditions attached to the grant.
  // Conditions narrow when the grant applies (status whitelist, amount
  // ceiling/floor, ownership, business hours, day of week, IP prefix).
  // First grant whose conditions PASS wins; otherwise we report the
  // most informative failure.
  let chosenGrant: RoleGrantRow | null = null;
  let lastConditionFailure: { reasonAr?: string; code?: string } | null = null;
  for (const grant of matchingGrants) {
    const condResult = evaluateConditions(grant.conditions as AbacConditions | null, {
      scope: { userId: scope.userId, companyId: scope.companyId, branchId: scope.branchId, employeeId: scope.employeeId },
      record: spec.resource?.record ?? null,
      userDepartmentId: ctx.departmentId,
      // Caller IP comes from the authorize() middleware; without it,
      // the ipPrefixIn condition would silently pass.
      ipAddress: spec.ipAddress ?? null,
      // Emergency mode is read from config (env RBAC_EMERGENCY_MODE) so an
      // ops admin can freeze sensitive operations without needing a deploy.
      // Migration could later move this to a system_settings row.
      emergency: config.rbac.emergencyMode,
    });
    if (condResult.passed) {
      chosenGrant = grant;
      break;
    }
    lastConditionFailure = { reasonAr: condResult.failedReasonAr, code: condResult.failedReason };
  }
  if (!chosenGrant) {
    return {
      allowed: false,
      reasonAr: lastConditionFailure?.reasonAr || "الشروط الإضافية على هذه الصلاحية غير محققة",
      code: lastConditionFailure?.code || "CONDITION_FAILED",
      diagnostics: {
        matchedRoleIds: matchingGrants.map((g) => g.role_id),
        grantedActions: bestGrant.actions as Action[],
        grantedScope: bestGrant.scope as Scope,
      },
    };
  }
  // Use the grant that passed conditions for downstream decisions.
  const winningGrant = chosenGrant;

  // SoD runtime enforcement: block self-approval / maker-checker
  // violations when an active SoD rule pairs this action with one
  // the user already used on the same record. Detection-only SoD
  // (admin report) still flags the role; this layer additionally
  // stops the dangerous request at runtime.
  const sodResult = await enforceSoD({
    userId: scope.userId,
    companyId: scope.companyId,
    feature: spec.feature,
    action: spec.action,
    grants: grants.map((g) => ({ feature_key: g.feature_key, actions: g.actions })),
    record: spec.resource?.record ?? null,
    table: spec.resource?.table ?? null,
    assignmentIds: scope.allowedAssignments ?? [],
  });
  if (sodResult.blocked) {
    return {
      allowed: false,
      reasonAr: sodResult.reasonAr || "هذه العملية تنتهك قاعدة فصل المهام",
      code: "SOD_VIOLATION",
      diagnostics: {
        matchedRoleIds: matchingGrants.map((g) => g.role_id),
        grantedActions: winningGrant.actions as Action[],
        grantedScope: winningGrant.scope as Scope,
        requiredFix: `لا يمكن لمنشئ السجل إجراء "${spec.action}" عليه — اطلب من شخص آخر`,
      },
    };
  }

  // Approval limit (for approve action).
  let limitInfo: AccessResult["approvalLimit"] = null;
  if (spec.action === "approve" && spec.amount) {
    const lim = limits.find((l) => l.feature_key === spec.feature && l.action === "approve" && l.currency === (spec.amount?.currency || "SAR"));
    if (lim) {
      const max = lim.max_amount != null ? Number(lim.max_amount) : null;
      limitInfo = { max, currency: lim.currency, requiresDualControl: lim.requires_dual_control };
      if (max != null && spec.amount.value > max) {
        return {
          allowed: false,
          reasonAr: `المبلغ (${spec.amount.value} ${lim.currency}) يتجاوز سقف اعتمادك (${max} ${lim.currency})`,
          code: "APPROVAL_LIMIT_EXCEEDED",
          approvalLimit: limitInfo,
        };
      }
    }
  }

  // Field policies — merge per-feature policies into a single map.
  const fieldPolicy: Record<string, "visible" | "masked" | "hidden" | "readonly"> = {};
  for (const fp of fields.filter((f) => f.feature_key === spec.feature)) {
    // as-any-reason: justified-pragmatic - internal pragmatic loss of type info; tracked for future tightening
    fieldPolicy[fp.field_name] = fp.mode as any;
  }

  // علم وقوع: if access was granted through a delegation, record it so there is
  // a clear "acted on behalf of" trail and admins can see delegated activity.
  const viaDelegation = winningGrant.role_id === -2 ? winningGrant.__delegatorId ?? null : null;
  if (viaDelegation != null) {
    auditDelegatedUse({
      companyId: scope.companyId,
      delegateUserId: scope.userId,
      delegatorId: viaDelegation,
      feature: spec.feature,
      action: spec.action,
    });
  }

  return {
    allowed: true,
    fieldPolicy,
    scopeFilter: buildScopeFilter(winningGrant, ctx, { ...DEFAULT_COLUMNS, ...columns }),
    approvalLimit: limitInfo,
    diagnostics: {
      matchedRoleIds: matchingGrants.map((g) => g.role_id),
      grantedActions: winningGrant.actions as Action[],
      grantedScope: winningGrant.scope as Scope,
      yourCompanyId: scope.companyId,
      ...(viaDelegation != null ? { delegatedFrom: viaDelegation } : {}),
    },
  };
}

// ─── Field policy application ───────────────────────────────────────────────

/**
 * Walk a response object and apply the field policy: hide/mask/readonly
 * fields the caller isn't allowed to see. Use after the handler builds
 * its response and before sending JSON.
 */
export function applyFieldPolicy<T>(payload: T, policy: AccessResult["fieldPolicy"]): T {
  if (!policy || Object.keys(policy).length === 0) return payload;
  const apply = (obj: any): any => {
    if (Array.isArray(obj)) return obj.map(apply);
    if (obj == null || typeof obj !== "object") return obj;
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      const mode = policy[k];
      if (mode === "hidden") continue;
      if (mode === "masked") {
        out[k] = maskValue(v);
        continue;
      }
      out[k] = typeof v === "object" && v !== null ? apply(v) : v;
    }
    return out;
  };
  return apply(payload);
}

function maskValue(v: any): string {
  if (v == null) return "***";
  const s = String(v);
  if (s.length <= 4) return "****";
  return `${s.slice(0, 2)}${"*".repeat(Math.max(4, s.length - 4))}${s.slice(-2)}`;
}

// ─── Localised labels ───────────────────────────────────────────────────────

function actionLabel(a: Action): string {
  const map: Record<Action, string> = {
    view: "العرض", list: "القراءة", create: "الإنشاء", update: "التعديل", delete: "الحذف",
    approve: "الاعتماد", reject: "الرفض", cancel: "الإلغاء", export: "التصدير", print: "الطباعة",
    share: "المشاركة", submit: "التقديم", reopen: "إعادة الفتح", close: "الإغلاق",
  };
  return map[a] || a;
}

function scopeLabel(s: Scope): string {
  const map: Record<Scope, string> = {
    self: "بياناتك فقط", team: "فريقك", department: "قسمك", department_tree: "قسمك والأقسام التابعة",
    branch: "فرعك", branches: "فروعك المسموحة", company: "شركتك", multi_company: "شركاتك", all: "جميع البيانات",
  };
  return map[s] || s;
}
