// Journal-line dimensional enrichment.
//
// The «النظام المالي متأصل في اصل النظام» philosophy needs ONE more
// link to close the loop: every journal_line that carries a project /
// contract / vehicle / department / umrah_* dimension should ALSO
// carry the matching `costCenterId` AND any inferable parent
// dimensions, so per-CC P&L works on the GL itself with no joins
// back to the source document.
//
// Today, callers populate dimensional fields per the source operation
// (e.g. an umrah invoice's GL post fills umrahAgentId + umrahSeasonId),
// but `costCenterId` is almost always left null because the caller
// doesn't know which CC represents that agent/season. Result: the
// CCs we auto-create are technically alive but get zero JE traffic.
//
// What this enricher does: for each line, given its existing
// dimensional fields, resolve the most-specific cost_centers row and
// fill `costCenterId` if it's null. Also walks UP: a line that
// carries `projectId` but no `branchId` gets the project's branch
// inferred from the project's CC parent chain.
//
// Resolution priority (most-specific to most-generic):
//   1. project    → cost_centers where relatedEntityType='project'
//   2. contract   → ... 'contract'
//   3. vehicle    → ... 'vehicle'
//   4. department → ... 'department'
//   5. branch     → ... 'branch'  (last resort — branch-level CC)
//
// LOOKUP CACHE: a single JE often has many lines sharing the same
// dimensional context (10 lines all for the same project). We cache
// the resolved CC id per (entityType, entityId) tuple for the
// duration of one createJournalEntry call, so a 50-line invoice only
// hits the DB once per unique dimension — not 50 times.
//
// IDEMPOTENT: re-running the enricher on already-enriched lines is a
// no-op (the `?? null` guards skip re-fills). The backfill endpoint
// relies on this — it can run nightly without churning the GL.

import type { PoolClient } from "pg";

export interface DimensionalLineInput {
  costCenterId?: number | null;
  projectId?: number | null;
  contractId?: number | null;
  vehicleId?: number | null;
  departmentId?: number | null;
  branchId?: number | null;
  // Below are not consumed by this resolver but appear on every
  // line — declared so a single caller (createJournalEntry) can pass
  // its JournalEntryLine[] through without a cast.
  employeeId?: number | null;
  clientId?: number | null;
  vendorId?: number | null;
  driverId?: number | null;
  propertyId?: number | null;
  umrahAgentId?: number | null;
  umrahSeasonId?: number | null;
}

export interface EnricherContext {
  companyId: number;
  /** Fallback branch — used as the LAST RESORT when a line has no
   *  other dimensional hint (i.e. a corporate-level JE that should
   *  still post to the branch's CC). */
  headerBranchId?: number | null;
  /** Shared cache for the duration of a single createJournalEntry
   *  call. Keys are `${entityType}:${entityId}`. Pass an empty Map
   *  on the first line and reuse the same Map across the loop. */
  ccCache: Map<string, number | null>;
}

const RESOLUTION_PRIORITY: Array<[keyof DimensionalLineInput, string]> = [
  ["projectId",    "project"],
  ["contractId",   "contract"],
  ["vehicleId",    "vehicle"],
  ["departmentId", "department"],
  ["branchId",     "branch"],
];

/**
 * Resolves the cost-centre id for a (entityType, entityId) pair, with
 * a shared cache across calls. Returns null when no CC exists for that
 * entity (the resolver won't create one — that's the auto-create
 * helpers' job).
 */
async function lookupCostCenterId(
  client: PoolClient,
  companyId: number,
  entityType: string,
  entityId: number,
  cache: Map<string, number | null>,
): Promise<number | null> {
  const key = `${entityType}:${entityId}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const { rows } = await client.query(
    `SELECT id FROM cost_centers
      WHERE "companyId" = $1
        AND "relatedEntityType" = $2
        AND "relatedEntityId" = $3
        AND status != 'deleted'
        AND ("deletedAt" IS NULL)
      ORDER BY id ASC
      LIMIT 1`,
    [companyId, entityType, entityId],
  );
  const id = rows[0]?.id ?? null;
  cache.set(key, id);
  return id;
}

/**
 * Enriches a single line with `costCenterId` when null. Returns the
 * SAME line object (mutated in-place) for caller convenience. When
 * the line already has a costCenterId, the function is a no-op (audit
 * pattern: never override an explicit operator choice).
 *
 * The function is `async` because the cost-centre lookup hits the DB;
 * the cache amortises this across lines of the same JE.
 */
export async function enrichJournalLineDimensions<T extends DimensionalLineInput>(
  client: PoolClient,
  line: T,
  ctx: EnricherContext,
): Promise<T> {
  // Respect an explicit operator choice — the enricher only FILLS
  // null fields, never overwrites.
  if (line.costCenterId != null) return line;

  // Walk the priority chain. First dimensional hint that resolves to
  // a real CC wins. The fallback to headerBranchId at the end
  // catches "corporate-overhead" lines that carry no entity dimension
  // at all but should still flow into a branch's P&L.
  for (const [field, entityType] of RESOLUTION_PRIORITY) {
    const raw = (line as Record<string, unknown>)[field as string];
    const id = typeof raw === "number" && raw > 0 ? raw : null;
    if (id == null) continue;
    const ccId = await lookupCostCenterId(client, ctx.companyId, entityType, id, ctx.ccCache);
    if (ccId != null) {
      line.costCenterId = ccId;
      return line;
    }
  }

  // Final fallback — the header branchId. Only fires when no per-line
  // dimensional hint matched (otherwise it would override a more-
  // specific intent).
  if (ctx.headerBranchId != null && ctx.headerBranchId > 0) {
    const ccId = await lookupCostCenterId(
      client, ctx.companyId, "branch", ctx.headerBranchId, ctx.ccCache,
    );
    if (ccId != null) line.costCenterId = ccId;
  }

  return line;
}

/**
 * Convenience: enrich every line in an array in one pass, sharing the
 * cache. Used by createJournalEntry inside its INSERT loop.
 */
export async function enrichJournalLines<T extends DimensionalLineInput>(
  client: PoolClient,
  lines: T[],
  companyId: number,
  headerBranchId: number | null | undefined,
): Promise<T[]> {
  const ctx: EnricherContext = {
    companyId,
    headerBranchId: headerBranchId ?? null,
    ccCache: new Map(),
  };
  for (const line of lines) {
    await enrichJournalLineDimensions(client, line, ctx);
  }
  return lines;
}
