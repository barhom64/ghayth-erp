// Cost center auto-creation — same philosophy as
// umrahAccountsAutoCreate.ts but for the cost-centre dimension.
//
// Operator's request: «مركز تكلفة تلقائي لكل فرع يتم فتحه ومراكز تكلفة
//   فرعية تلقائية لكل مهمة او معاملة ... بحيث يكون النظام المالي
//   متأصل في اصل النظام».
//
// What the system used to do: cost centers were either (1) seeded by
// migration 135 (7 generic departments per company) or (2) created
// manually via POST /finance/cost-centers. Branches and projects had
// NO automatic cost-centre representation, so per-branch P&L and
// per-project profitability required the operator to remember to
// hand-craft a CC and link it after every entity insert.
//
// What this helper does: on entity create, mint a cost_centers row
// that mirrors the entity, using:
//   - `relatedEntityType` + `relatedEntityId` (legacy column pair)
//     AND `linkedEntityType` + `linkedEntityId` (newer pair) so BOTH
//     resolvers (finance-reports.ts + accountingAllocation.ts) pick
//     it up — same dual-write rationale as the manual POST path.
//   - `parentId` set to the parent entity's cost centre when applicable
//     (project → branch's cost centre), so the cost-centre tree
//     reflects the org chart end-to-end.
//   - `autoCreatedBy` + `autoCreatedReason` filled — these were added
//     by migration 203 specifically for traceability of auto-created
//     rows. Operators can filter for "auto-created" vs "manual" in
//     audit views without guessing.
//
// IDEMPOTENT:
//   - ON CONFLICT ("companyId", code) DO NOTHING — re-runs are a
//     no-op when a cost centre with the computed code already exists.
//   - A pre-existing manual cost centre with a matching code is
//     reused (we don't overwrite the operator's manual choices).
//
// Fire-and-forget at call sites: a failed CC insert MUST NOT block
// the branch/project create. The catch+log shape mirrors the
// umrahAccountsAutoCreate helper for consistency.

import type { PoolClient } from "pg";
import { rawQuery, withTransaction } from "./rawdb.js";
import { logger } from "./logger.js";

export type CostCenterEntityType =
  | "branch"
  | "project"
  | "contract"
  | "vehicle"
  | "department"
  | "property"
  | "unit"
  | "umrah_agent"
  | "umrah_season"
  | "trip";

interface AutoCreateOptions {
  /**
   * For nested entities (e.g. project under a branch), the id of the
   * PARENT entity whose cost centre should be the new row's parent.
   * Ignored for top-level entities (branch).
   *
   * Example: createCostCenterForEntity(scope, "project", 42, "بناء برج",
   *            { parentEntityType: "branch", parentEntityId: 7 })
   *          → looks up the branch #7 cost centre, nests project #42's
   *            new cost centre under it.
   */
  parentEntityType?: CostCenterEntityType | null;
  parentEntityId?: number | null;
  /**
   * Optional cost-centre type override. Defaults are reasonable per
   * entityType ('branch' → 'branch', 'project' → 'project', etc.).
   */
  ccType?: string;
  /** Optional actor id for traceability — written to autoCreatedBy. */
  actorUserId?: number | null;
  /**
   * Initial budget allocation (e.g. the project budget) — written to
   * cost_centers.allocatedAmount so budget-variance reporting (allocated
   * vs used) works from day one. Later budget changes go through
   * syncEntityCostCenterAllocation.
   */
  allocatedAmount?: number | null;
}

export interface AutoCreatedCostCenter {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  entityType: CostCenterEntityType;
  entityId: number;
}

// Shorthand prefixes per entity type. Combined with a 4-digit
// padded id to form a stable, scannable code:
//   BR-0007       branch #7
//   BR-0007-P0042 project #42 (when it nests under branch #7)
//   P-0042        project #42 (orphan — no branch parent resolved)
const PREFIX_BY_TYPE: Record<CostCenterEntityType, string> = {
  branch:     "BR",
  project:    "P",
  contract:   "CT",
  vehicle:    "V",
  department: "D",
  property:   "PR",
  unit:       "UN",
  umrah_agent: "UA",
  umrah_season: "US",
  // Transport trip — a SUB-cost-center nested under the vehicle CC, so
  // revenue is tracked per-trip and rolls up to the vehicle via parentId.
  trip:        "TR",
};

const REASON_BY_TYPE: Record<CostCenterEntityType, string> = {
  branch:     "auto-created on branch insert",
  project:    "auto-created on project insert",
  contract:   "auto-created on contract insert",
  vehicle:    "auto-created on vehicle insert",
  department: "auto-created on department insert",
  property:   "auto-created on property insert",
  unit:       "auto-created on unit insert",
  umrah_agent: "auto-created on umrah agent insert",
  umrah_season: "auto-created on umrah season insert",
  trip:        "auto-created on transport trip invoicing",
};

/**
 * Mint or reuse a cost_centers row for the given entity. Returns the
 * row (created or existing) — callers can include its id in subsequent
 * journal lines for immediate per-entity drill-down.
 */
export async function createCostCenterForEntity(
  companyId: number,
  entityType: CostCenterEntityType,
  entityId: number,
  entityName: string,
  options: AutoCreateOptions = {},
): Promise<AutoCreatedCostCenter | null> {
  try {
    // Resolve the parent cost-centre id (if any). For a project under
    // a branch, we look up the branch's auto-created cost centre and
    // nest the project's new CC under it. If the branch has no CC yet
    // (e.g. project created before branch backfill ran), the project
    // CC is created at top level — the operator can re-parent later.
    let parentId: number | null = null;
    let parentCode: string | null = null;
    if (options.parentEntityType && options.parentEntityId) {
      const [parentCC] = await rawQuery<{ id: number; code: string }>(
        `SELECT id, code FROM cost_centers
          WHERE "companyId" = $1
            AND "relatedEntityType" = $2
            AND "relatedEntityId" = $3
            AND ("deletedAt" IS NULL)
            AND status != 'deleted'
          ORDER BY id ASC LIMIT 1`,
        [companyId, options.parentEntityType, options.parentEntityId],
      );
      if (parentCC) {
        parentId = parentCC.id;
        parentCode = parentCC.code;
      }
    }

    const prefix = PREFIX_BY_TYPE[entityType];
    const paddedId = String(entityId).padStart(4, "0");
    // When nested under a parent CC, the code reflects the hierarchy:
    // BR-0007-P0042. When standalone, just P-0042. The cost_centers.code
    // column is varchar(50) so we have plenty of headroom for deeper
    // nesting in future entity types.
    const code = parentCode
      ? `${parentCode}-${prefix}${paddedId}`
      : `${prefix}-${paddedId}`;
    const ccType = options.ccType ?? entityType;
    const reason = REASON_BY_TYPE[entityType];

    let row: AutoCreatedCostCenter | null = null;
    await withTransaction(async (client) => {
      row = await upsertCostCenter(
        client,
        companyId,
        entityType,
        entityId,
        entityName,
        code,
        ccType,
        parentId,
        reason,
        options.actorUserId ?? null,
        options.allocatedAmount != null && Number(options.allocatedAmount) > 0 ? Number(options.allocatedAmount) : 0,
      );
    });
    return row;
  } catch (err) {
    logger.error(err, `[costCenterAutoCreate] failed for ${entityType}#${entityId}`);
    return null;
  }
}

async function upsertCostCenter(
  client: PoolClient,
  companyId: number,
  entityType: CostCenterEntityType,
  entityId: number,
  entityName: string,
  code: string,
  ccType: string,
  parentId: number | null,
  reason: string,
  actorUserId: number | null,
  allocatedAmount = 0,
): Promise<AutoCreatedCostCenter | null> {
  // Two-stage idempotency:
  // 1. Look up by (entityType, entityId) — if a CC already represents
  //    this entity, reuse it. This catches the case where a manual
  //    operator-created CC predates the auto-create.
  // 2. Fall through to ON CONFLICT (companyId, code) so concurrent
  //    auto-creates under load collapse to a single row.
  const { rows: byEntity } = await client.query(
    `SELECT id, code, name, "parentId" FROM cost_centers
      WHERE "companyId" = $1
        AND "relatedEntityType" = $2
        AND "relatedEntityId" = $3
        AND ("deletedAt" IS NULL)
        AND status != 'deleted'
      ORDER BY id ASC LIMIT 1`,
    [companyId, entityType, entityId],
  );
  if (byEntity[0]) {
    return {
      id: byEntity[0].id,
      code: byEntity[0].code,
      name: byEntity[0].name,
      parentId: byEntity[0].parentId,
      entityType,
      entityId,
    };
  }

  const { rows: inserted } = await client.query(
    `INSERT INTO cost_centers (
       "companyId", code, name, type, "parentId",
       "relatedEntityType", "relatedEntityId",
       "linkedEntityType",  "linkedEntityId",
       status, "isActive", "autoCreatedBy", "autoCreatedReason", "allocatedAmount"
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $6, $7, 'active', true, $8, $9, $10)
     ON CONFLICT ("companyId", code) DO NOTHING
     RETURNING id, code, name, "parentId"`,
    [companyId, code, entityName, ccType, parentId, entityType, entityId, actorUserId, reason, allocatedAmount],
  );
  if (inserted[0]) {
    return {
      id: inserted[0].id,
      code: inserted[0].code,
      name: inserted[0].name,
      parentId: inserted[0].parentId,
      entityType,
      entityId,
    };
  }

  // ON CONFLICT DO NOTHING returned no row — a CC with the same code
  // already exists. Read it back and link it to this entity if it's
  // unlinked, so the auto-create still produces a working mapping.
  const { rows: byCode } = await client.query(
    `SELECT id, code, name, "parentId", "relatedEntityId"
       FROM cost_centers
      WHERE "companyId" = $1 AND code = $2 AND ("deletedAt" IS NULL)`,
    [companyId, code],
  );
  if (!byCode[0]) return null;
  if (byCode[0].relatedEntityId == null) {
    await client.query(
      `UPDATE cost_centers
          SET "relatedEntityType" = $1, "relatedEntityId" = $2,
              "linkedEntityType"  = $1, "linkedEntityId"  = $2
        WHERE id = $3 AND "companyId" = $4`,
      [entityType, entityId, byCode[0].id, companyId],
    );
  }
  return {
    id: byCode[0].id,
    code: byCode[0].code,
    name: byCode[0].name,
    parentId: byCode[0].parentId,
    entityType,
    entityId,
  };
}

/**
 * Keep the linked cost centre's allocatedAmount in step with the entity's
 * budget (e.g. when a project's budget is edited). No-op when the entity has
 * no auto-created cost centre yet. Variance reporting reads
 * allocatedAmount − usedAmount, so a stale allocation hides overruns.
 */
export async function syncEntityCostCenterAllocation(
  companyId: number,
  entityType: CostCenterEntityType,
  entityId: number,
  allocatedAmount: number,
): Promise<void> {
  try {
    await rawQuery(
      `UPDATE cost_centers
          SET "allocatedAmount" = $1, "updatedAt" = NOW()
        WHERE "companyId" = $2
          AND "linkedEntityType" = $3
          AND "linkedEntityId" = $4
          AND ("deletedAt" IS NULL)`,
      [Number(allocatedAmount) || 0, companyId, entityType, entityId],
    );
  } catch (err) {
    logger.error(err, `[costCenterAutoCreate] allocation sync failed for ${entityType} #${entityId}`);
  }
}
