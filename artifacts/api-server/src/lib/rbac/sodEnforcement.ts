/**
 * sodEnforcement — runtime Segregation of Duties enforcement.
 *
 * The SoD report (admin UI) detects roles that hold conflicting
 * grant pairs but does not stop the user at request time. This
 * module closes that gap: when a user attempts an action that
 * matches the second side of an SoD rule, and they also hold the
 * first side, AND they themselves performed the first action on the
 * specific record, the request is blocked.
 *
 * Concrete example — the seeded `finance_journal_create_approve`
 * rule says `finance.journal:create ↔ finance.journal:approve` are
 * conflicting:
 *
 *   1. User A creates an expense  (feature.journal:create)
 *      → expenses.createdBy = userA
 *   2. User A tries to approve it (feature.journal:approve)
 *      → checkAccess() finds:
 *           - user has both grants
 *           - rule (create ↔ approve) on feature.journal
 *           - record.createdBy === scope.userId
 *      → SOD_SELF_APPROVAL block (HTTP 403)
 *
 * The detection-only SoD report still flags the *role* that holds
 * both grants for the auditor; this module additionally blocks the
 * dangerous *action* at runtime.
 *
 * Owner / general_manager bypass: SoD applies to roles below the
 * platform-admin tier. Owners can act on any record by definition;
 * blocking them would lock the company out.
 */

import { rawQuery } from "../rawdb.js";
import { onInvalidation, publishInvalidation } from "./distributedCache.js";

interface SodRuleRow {
  rule_key: string;
  label_ar: string;
  feature_a: string;
  action_a: string;
  feature_b: string;
  action_b: string;
  severity: string;
  is_active: boolean;
}

interface SodCheckCtx {
  userId: number;
  companyId: number;
  feature: string;
  action: string;
  /** Pre-loaded grants for the user — saves one query per request. */
  grants: Array<{ feature_key: string; actions: string[] }>;
  /** Resource record if the route resolved one — `createdBy` is the
   *  field we compare against to determine self-approval. */
  record?: { createdBy?: number | null } | null;
}

export interface SodCheckResult {
  blocked: boolean;
  rule?: { ruleKey: string; labelAr: string; severity: string };
  reasonAr?: string;
}

// In-process cache of active rules per company. SoD rules change
// rarely; admin mutations call invalidateSodCache(). A 60s TTL is a
// reasonable safety net.
const sodCache = new Map<number, { rules: SodRuleRow[]; expiresAt: number }>();
const TTL_MS = 60_000;

async function loadActiveRules(companyId: number): Promise<SodRuleRow[]> {
  const cached = sodCache.get(companyId);
  if (cached && cached.expiresAt > Date.now()) return cached.rules;
  const rules = await rawQuery<SodRuleRow>(
    `SELECT rule_key, label_ar, feature_a, action_a, feature_b, action_b, severity, is_active
       FROM rbac_sod_rules
      WHERE is_active = TRUE AND ("companyId" IS NULL OR "companyId" = $1)`,
    [companyId]
  ).catch(() => [] as SodRuleRow[]);
  sodCache.set(companyId, { rules, expiresAt: Date.now() + TTL_MS });
  return rules;
}

export function invalidateSodCache(companyId?: number): void {
  if (companyId) {
    sodCache.delete(companyId);
    // Notify other replicas to drop their copies too.
    void publishInvalidation(companyId, "sod");
  } else {
    sodCache.clear();
  }
}

// Subscribe once: when another replica publishes an SoD invalidation,
// drop our local entry for that company.
onInvalidation((event) => {
  if (event.kind === "sod" || event.kind === "all" || !event.kind) {
    sodCache.delete(event.companyId);
  }
});

/**
 * Checks whether the action the user is about to take collides with
 * an SoD rule given the user's other grants and the record they're
 * acting on.
 *
 * Returns blocked=true when:
 *   - an active SoD rule pairs the requested (feature, action) with
 *     another (feature_a, action_a)
 *   - AND the user has a grant covering that paired action
 *   - AND the record's createdBy is the same user (self-approval)
 *
 * The createdBy check is what turns this from "you have conflicting
 * permissions on paper" (which the admin SoD report already flags)
 * into "you are actively performing both halves of the conflict".
 */
export async function enforceSoD(ctx: SodCheckCtx): Promise<SodCheckResult> {
  if (!ctx.record || ctx.record.createdBy == null) {
    // No record OR createdBy unknown → can't make a self-approval
    // determination. Detection-only mode applies.
    return { blocked: false };
  }
  if (ctx.record.createdBy !== ctx.userId) {
    // The dangerous case is "approve what you created". If someone
    // else created the record, this user is acting as the second
    // independent reviewer, which is what SoD wants.
    return { blocked: false };
  }

  const rules = await loadActiveRules(ctx.companyId);
  if (rules.length === 0) return { blocked: false };

  // Find any rule where the second side matches what the user is
  // doing now AND the user holds the first-side grant.
  for (const r of rules) {
    let firstSide: { feature: string; action: string } | null = null;
    if (r.feature_b === ctx.feature && r.action_b === ctx.action) {
      firstSide = { feature: r.feature_a, action: r.action_a };
    } else if (r.feature_a === ctx.feature && r.action_a === ctx.action) {
      firstSide = { feature: r.feature_b, action: r.action_b };
    }
    if (!firstSide) continue;

    const hasFirst = ctx.grants.some(
      (g) => g.feature_key === firstSide!.feature && g.actions.includes(firstSide!.action)
    );
    if (hasFirst) {
      return {
        blocked: true,
        rule: { ruleKey: r.rule_key, labelAr: r.label_ar, severity: r.severity },
        reasonAr: `قاعدة فصل المهام (${r.label_ar}) تمنع نفس الشخص من ${firstSide.action} و${ctx.action} على نفس السجل`,
      };
    }
  }

  return { blocked: false };
}
