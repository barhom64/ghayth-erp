/**
 * delegationService — the runtime side of the delegation system.
 *
 * A delegation lets a delegator (e.g. a department manager going on leave)
 * hand SPECIFIC features to a delegate for a bounded window. Historically the
 * `delegations` table was written by the UI but read by NOTHING, so a
 * delegation had zero effect. This module makes it real: authzEngine.checkAccess
 * loads the acting user's active delegations and inherits the delegator's grants
 * on the delegated features (see getDelegatedFeatureGrants in authzEngine).
 *
 * Design goals (per the operating requirements):
 *   • Granular   — `features` is an array of feature keys (["*"] = everything).
 *   • Bounded    — only `status='active'` rows whose [startDate,endDate] window
 *                  contains today count. Outside the window → no authority.
 *   • Controllable — a manager can revoke at any time; the cache TTL is short
 *                  and create/revoke call invalidateDelegationCache().
 *   • Audited    — every delegated authorisation is logged (auditDelegatedUse)
 *                  so there is a clear trail of "who acted on whose behalf".
 */

import { rawQuery, rawExecute } from "../rawdb.js";
import { logger } from "../logger.js";

export interface ActiveDelegation {
  delegatorId: number;            // delegator employee id
  delegatorUserId: number | null; // delegator login (needed to load their grants)
  features: string[];             // delegated feature keys; ["*"] = all
}

// Short-lived cache keyed by `${companyId}:${delegateEmployeeId}`. Delegations
// change rarely; create/revoke invalidate explicitly, and the 30s TTL bounds
// staleness for the (revoke) case where another replica mutated the row.
const cache = new Map<string, { rows: ActiveDelegation[]; expiresAt: number }>();
const TTL_MS = 30_000;

/**
 * Active delegations granted TO `delegateEmployeeId` right now (today inside the
 * [startDate, endDate] window, status='active'). Empty for the common case of a
 * user with no delegations.
 */
export async function getActiveDelegationsFor(
  companyId: number,
  delegateEmployeeId: number | null | undefined,
): Promise<ActiveDelegation[]> {
  if (!delegateEmployeeId) return [];
  const key = `${companyId}:${delegateEmployeeId}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;

  const rows = await rawQuery<{ delegatorId: number; features: unknown; delegatorUserId: number | null }>(
    `SELECT d."delegatorId", d.features, du.id AS "delegatorUserId"
       FROM delegations d
       LEFT JOIN users du ON du."employeeId" = d."delegatorId"
      WHERE d."companyId" = $1 AND d."delegateId" = $2 AND d.status = 'active'
        AND (d."startDate" IS NULL OR d."startDate" <= CURRENT_DATE)
        AND (d."endDate"   IS NULL OR d."endDate"   >= CURRENT_DATE)`,
    [companyId, delegateEmployeeId],
  ).catch((e) => { logger.error(e, "[delegation] active-delegation load failed"); return [] as never[]; });

  const out: ActiveDelegation[] = rows.map((r) => ({
    delegatorId: r.delegatorId,
    delegatorUserId: r.delegatorUserId,
    features: Array.isArray(r.features) ? (r.features as string[]) : [],
  }));
  cache.set(key, { rows: out, expiresAt: Date.now() + TTL_MS });
  return out;
}

/** Drop cached delegations — called on create/revoke so changes take effect now. */
export function invalidateDelegationCache(companyId?: number, delegateEmployeeId?: number): void {
  if (companyId && delegateEmployeeId) {
    cache.delete(`${companyId}:${delegateEmployeeId}`);
  } else {
    cache.clear();
  }
}

/**
 * Does a delegation's feature list cover the requested feature? Supports the
 * same wildcard shapes the grant matcher uses: exact key, `${module}.*`, the
 * bare module key, or "*" (all).
 */
export function delegationCoversFeature(features: string[], feature: string, moduleKey: string): boolean {
  return (
    features.includes("*") ||
    features.includes(feature) ||
    features.includes(`${moduleKey}.*`) ||
    features.includes(moduleKey)
  );
}

/**
 * Audit a delegated authorisation — the "علم وقوع" trail. Records that
 * `delegateUserId` performed `feature:action` on behalf of `delegatorId`.
 * Fire-and-forget; never blocks the request.
 */
export function auditDelegatedUse(params: {
  companyId: number;
  delegateUserId: number;
  delegatorId: number;
  feature: string;
  action: string;
}): void {
  logger.info(
    `[delegation] user=${params.delegateUserId} acted on ${params.feature}:${params.action} on behalf of employee=${params.delegatorId} (company=${params.companyId})`,
  );
  void rawExecute(
    `INSERT INTO security_log ("userId","companyId",role,path,method,"requiredPerms",reason,ip,"createdAt")
     VALUES ($1,$2,'delegate',$3,'DELEGATED',$4,$5,NULL,NOW())`,
    [
      params.delegateUserId,
      params.companyId,
      `${params.feature}:${params.action}`,
      JSON.stringify([`${params.feature}:${params.action}`]),
      `delegated_from_employee:${params.delegatorId}`,
    ],
  ).catch(() => undefined);
}
