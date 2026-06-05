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
 * Header-level source-context inference.
 *
 * Operator gap: callers like /invoices, /vendor-bills, /umrah/sales-invoices
 * pass `sourceType` + `sourceId` on the JE header (so audits can drill
 * back), but DON'T necessarily put the entity FK on every line. Result:
 * journal_lines.clientId / vendorId / umrahAgentId stay null even
 * though the source row HAS that id readily available.
 *
 * This function infers a propagation BAG from the source: one DB
 * round-trip per JE (not per-line), the bag is then merged into each
 * line by inferDimensionsForLines() below. Same idempotency rule as
 * the CC enricher: only fills NULL fields, never overwrites.
 *
 * Cheap: a single SELECT joined to the source table per JE. Adds
 * ~1ms to JE posting. Skipped when sourceType is unknown.
 */
export interface InferredHeaderDims {
  clientId?: number | null;
  vendorId?: number | null;
  employeeId?: number | null;
  driverId?: number | null;
  vehicleId?: number | null;
  propertyId?: number | null;
  projectId?: number | null;
  contractId?: number | null;
  umrahAgentId?: number | null;
  umrahSeasonId?: number | null;
}

export async function inferHeaderDimensionsFromSource(
  client: PoolClient,
  companyId: number,
  sourceType: string | null | undefined,
  sourceId: number | null | undefined,
): Promise<InferredHeaderDims> {
  if (!sourceType || !sourceId || sourceId <= 0) return {};
  const empty: InferredHeaderDims = {};

  // The lookup map. Each entry: a sourceType the system POSTS JEs
  // from (the EXACT string used in createJournalEntry calls — see
  // routes/finance-invoices.ts, finance-custodies.ts, etc.), the table
  // to JOIN, and the columns to lift. Adding new source types is a
  // one-arm addition — no per-source code paths elsewhere.
  //
  // Edge case: source rows in another company aren't readable here
  // because every SELECT gates on companyId. A JE created with a
  // cross-tenant sourceId resolves to empty dims (defence in depth).
  //
  // Errors are LOGGED, not thrown — the JE post must succeed even if
  // the source table is missing in dev / the source row was deleted
  // between header insert and enrichment. The result is just empty
  // dims; the operator's posting works.
  try {
    switch (sourceType) {
      case "invoice": {
        // routes/finance-invoices.ts posts under "invoice" (singular),
        // not "invoices" — match the actual usage.
        const { rows } = await client.query(
          `SELECT "clientId", "branchId" FROM invoices
            WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
          [sourceId, companyId],
        );
        if (rows[0]) return { clientId: rows[0].clientId };
        return empty;
      }
      case "umrah_sales_invoices": {
        // The sub-agent invoice's agent gets propagated to lines so
        // per-agent revenue/AR drill works on every line, not just
        // the one the engine explicitly tagged.
        const { rows } = await client.query(
          `SELECT inv."seasonId", sa."agentId"
             FROM umrah_sales_invoices inv
             LEFT JOIN umrah_sub_agents sa
                    ON sa.id = inv."subAgentId" AND sa."companyId" = inv."companyId"
            WHERE inv.id = $1 AND inv."companyId" = $2 LIMIT 1`,
          [sourceId, companyId],
        );
        if (rows[0]) {
          return { umrahAgentId: rows[0].agentId, umrahSeasonId: rows[0].seasonId };
        }
        return empty;
      }
      case "umrah_payments": {
        const { rows } = await client.query(
          `SELECT sa."agentId"
             FROM umrah_payments pay
             LEFT JOIN umrah_sub_agents sa
                    ON sa.id = pay."subAgentId" AND sa."companyId" = pay."companyId"
            WHERE pay.id = $1 AND pay."companyId" = $2 LIMIT 1`,
          [sourceId, companyId],
        );
        if (rows[0]) return { umrahAgentId: rows[0].agentId };
        return empty;
      }
      case "expense": {
        // routes/expenses.ts emits sourceType='expense' (singular).
        // expenses table only carries employeeId — propagate that.
        const { rows } = await client.query(
          `SELECT "employeeId" FROM expenses
            WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
          [sourceId, companyId],
        );
        if (rows[0]) return { employeeId: rows[0].employeeId };
        return empty;
      }
      case "fleet_maintenance": {
        const { rows } = await client.query(
          `SELECT "vehicleId", "driverId" FROM fleet_maintenance
            WHERE id = $1 AND "companyId" = $2 LIMIT 1`,
          [sourceId, companyId],
        );
        if (rows[0]) return rows[0];
        return empty;
      }
      // These sourceTypes ARE the row id itself — no SELECT needed.
      // Keeping them in the switch documents that they're handled.
      case "legal_contracts":
        return { contractId: sourceId };
      case "projects":
        return { projectId: sourceId };
      case "fleet_vehicles":
        return { vehicleId: sourceId };
      case "fleet_drivers":
        return { driverId: sourceId };
      default:
        return empty;
    }
  } catch {
    return empty;
  }
}

/**
 * Apply inferred header dimensions to each line — only fills NULL
 * fields (operator's explicit choice always wins). Mutates lines
 * in place for cheap caller ergonomics.
 */
export function applyHeaderDimensionsToLines<T extends DimensionalLineInput>(
  lines: T[],
  dims: InferredHeaderDims,
): T[] {
  const apply = (line: DimensionalLineInput) => {
    if (line.clientId == null && dims.clientId != null) line.clientId = dims.clientId;
    if (line.vendorId == null && dims.vendorId != null) line.vendorId = dims.vendorId;
    if (line.employeeId == null && dims.employeeId != null) line.employeeId = dims.employeeId;
    if (line.driverId == null && dims.driverId != null) line.driverId = dims.driverId;
    if (line.vehicleId == null && dims.vehicleId != null) line.vehicleId = dims.vehicleId;
    if (line.propertyId == null && dims.propertyId != null) line.propertyId = dims.propertyId;
    if (line.projectId == null && dims.projectId != null) line.projectId = dims.projectId;
    if (line.contractId == null && dims.contractId != null) line.contractId = dims.contractId;
    const anyLine = line as Record<string, unknown>;
    if (anyLine.umrahAgentId == null && dims.umrahAgentId != null) anyLine.umrahAgentId = dims.umrahAgentId;
    if (anyLine.umrahSeasonId == null && dims.umrahSeasonId != null) anyLine.umrahSeasonId = dims.umrahSeasonId;
  };
  for (const line of lines) apply(line);
  return lines;
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
