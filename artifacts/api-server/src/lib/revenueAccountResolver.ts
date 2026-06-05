// Revenue Account Resolver — hierarchical per-dimension routing.
//
// Operator question: «هل يمكن ربط الوكيل بحساب مبيعات مخصص؟
//                     مبيعات العمرة موسم 1447 ضمنها وكيل أساسي ثم
//                     وكيل فرعي، مع عدم تعارض ربطها بحساب الوكيل».
//
// Answer: yes — the resolver below walks a priority chain through
// `subsidiary_accounts`, looking up overrides in order of specificity.
// The first hit wins; if nothing matches, the caller's `defaultCode`
// is returned (= product-level / company-level default, unchanged).
//
// Hierarchy (most-specific to most-generic):
//   1. umrah_sub_agent — overrides everything for the matching sub-agent
//   2. umrah_agent     — overrides season + default for the matching agent
//   3. umrah_season    — season-wide override (e.g. all 1447 sales to a
//                        dedicated sub-ledger)
//   4. property_unit   — for the property side: per-unit override
//   5. property        — building-level override
//   6. caller default  — product.defaultRevenueAccountId or company
//                        default (existing behaviour)
//
// Why a hierarchy: a single agent can have a custom revenue account
// without disturbing other agents in the same season, and a season-
// wide override still applies to agents that don't carry their own
// override. The COA itself is hierarchical, so totals roll up
// automatically — adding sub-accounts under "مبيعات العمرة" gives
// you both granular reports AND the consolidated parent total.
//
// Lookup cost: at most 4 indexed lookups per invoice line via the
// partial index added in migration 250. Each is a primary-key-shape
// query (companyId, entityType, entityId, accountType) — O(1).

import { rawQuery } from "./rawdb.js";

export interface RevenueResolverHint {
  /** Sub-agent id, if the invoice is sub-agent scoped (most common). */
  subAgentId?: number | null;
  /** Main agent id — derived from the sub-agent or directly on the line. */
  agentId?: number | null;
  /** Season the invoice belongs to. */
  seasonId?: number | null;
  /** Property unit (for the property side; ignored on the umrah side). */
  propertyUnitId?: number | null;
  /** Property building (parent of unit). */
  propertyId?: number | null;
}

export interface SubsidiaryHit {
  entityType: string;
  entityId: number;
  accountId: number;
  accountCode: string;
  accountName: string;
}

/**
 * Resolve the revenue account for a given hint context.
 *
 * Returns the most-specific matching subsidiary account, or `null` if
 * no override is configured. Callers fall through to their existing
 * default when null comes back — so the resolver is purely additive:
 * a company with no overrides keeps the exact behaviour it had before
 * this helper landed.
 *
 * `accountType` is the column on `subsidiary_accounts` that carries
 * the semantic (e.g. "revenue", "ar", "ap"). We restrict the lookup
 * to a single semantic so an entity that has both an AR and a revenue
 * override doesn't accidentally cross-wire them.
 */
export async function resolveRevenueAccount(
  companyId: number,
  hint: RevenueResolverHint,
  accountType: string = "revenue",
): Promise<SubsidiaryHit | null> {
  // Priority chain — most-specific first. Each tuple is the
  // (entityType, entityId) pair we look up.
  const chain: Array<[string, number | null | undefined]> = [
    ["umrah_sub_agent", hint.subAgentId],
    ["umrah_agent",     hint.agentId],
    ["umrah_season",    hint.seasonId],
    ["property_unit",   hint.propertyUnitId],
    ["property",        hint.propertyId],
  ];

  // Build the dynamic IN clause once with a parameter pair per filled
  // hint — fewer params than running 5 separate queries, but still
  // hits the (entityType, entityId) partial index because we use a
  // simple OR of equality pairs.
  type Tuple = { entityType: string; entityId: number };
  const tuples: Tuple[] = chain
    .filter(([, id]) => typeof id === "number" && id != null && id > 0)
    .map(([t, id]) => ({ entityType: t, entityId: id as number }));

  if (tuples.length === 0) return null;

  // OR-of-pairs: (entityType=$2 AND entityId=$3) OR (entityType=$4 AND entityId=$5) ...
  const params: unknown[] = [companyId, accountType];
  const orClauses: string[] = [];
  for (const t of tuples) {
    params.push(t.entityType, t.entityId);
    orClauses.push(`(sa."entityType" = $${params.length - 1} AND sa."entityId" = $${params.length})`);
  }

  // The ORDER BY uses CASE to enforce the priority chain on the SQL
  // side — Postgres can't natively rank a free-form IN list, so the
  // CASE assigns each entityType a rank matching the chain order.
  const rows = await rawQuery<SubsidiaryHit & { _rank: number }>(
    `SELECT sa."entityType", sa."entityId", sa."accountId",
            coa.code AS "accountCode", coa.name AS "accountName",
            CASE sa."entityType"
              WHEN 'umrah_sub_agent' THEN 1
              WHEN 'umrah_agent'     THEN 2
              WHEN 'umrah_season'    THEN 3
              WHEN 'property_unit'   THEN 4
              WHEN 'property'        THEN 5
              ELSE 99
            END AS _rank
       FROM subsidiary_accounts sa
       JOIN chart_of_accounts coa
         ON coa.id = sa."accountId"
        AND coa."companyId" = sa."companyId"
      WHERE sa."companyId" = $1
        AND sa."accountType" = $2
        AND sa."isActive" = true
        AND sa."deletedAt" IS NULL
        AND (${orClauses.join(" OR ")})
      ORDER BY _rank ASC
      LIMIT 1`,
    params,
  );

  if (rows.length === 0) return null;
  const { entityType, entityId, accountId, accountCode, accountName } = rows[0];
  return { entityType, entityId, accountId, accountCode, accountName };
}
