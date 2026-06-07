// Umrah penalty engine — the overstay-detection → fine-creation pipeline.
//
// Previously inlined inside `routes/umrah.ts` POST /run-penalty-engine,
// extracted here so:
//
//   1. The manual route + the new auto-generation cron both run the
//      EXACT same logic (one source of truth for the financial impact).
//   2. The query honours the operator's overstay exemption flag (set
//      via PATCH /umrah/pilgrims/:id in #1482 + migration 242). The old
//      inlined route did not respect this flag; an exempt pilgrim
//      would silently grow a penalty on every run. Bug fixed here.
//   3. The cron can iterate every active company without re-importing
//      the umrahEngine GL posting module dynamically per row.

import type pg from "pg";
import { rawQuery, withTransaction } from "./rawdb.js";
import { logger } from "./logger.js";
import { todayISO } from "./businessHelpers.js";
import { applyTransition } from "./lifecycleEngine.js";
import { umrahEngine } from "./engines/index.js";

export interface PenaltyEngineScope {
  companyId: number;
  branchId: number | null;
  userId: number;
}

export interface PenaltyEngineOpts {
  /** Minimum days overstayed before a penalty is created (default 3). */
  overstayDays: number;
  /** SAR per day of overstay (default 500). */
  dailyRate: number;
  /** Date the engine evaluates "today" against — defaults to todayISO(). */
  todayIso?: string;
}

export interface PenaltyEngineResult {
  /** Total overstayed-non-exempt pilgrims considered. */
  checked: number;
  /** New penalty rows actually inserted. */
  penaltiesCreated: number;
  /** Existing `umrah_violations` rows linked to the new penalty via `linkedPenaltyId`. */
  violationsLinked: number;
  /** Pilgrims skipped because `overstayExempt = true` (audit signal). */
  skippedExempt: number;
}

interface OverstayRow {
  id: number;
  fullName: string;
  passportNumber: string | null;
  agentId: number | null;
  seasonId: number | null;
  departureDate: string;
  daysOver: number;
  overstayExempt: boolean | null;
}

/**
 * Scan the company's overstayed pilgrims, create a penalty row + GL
 * entry for each that crosses the threshold, link the operational
 * `umrah_violations` row to the financial penalty, and transition the
 * pilgrim's status to `violated`.
 *
 * Idempotent: skips pilgrims that already have an open
 * `pending`/`invoiced` penalty of type `overstay`.
 *
 * Respects `umrah_pilgrims.overstayExempt` (migration 242) — exempt
 * rows are counted via `skippedExempt` so the audit log shows they
 * were considered then deliberately ignored.
 */
export async function generateOverstayPenalties(
  scope: PenaltyEngineScope,
  opts: PenaltyEngineOpts,
): Promise<PenaltyEngineResult> {
  const today = opts.todayIso ?? todayISO();
  const overstayed = await rawQuery<OverstayRow>(
    `SELECT p.id,
            p."passportNumber",
            p."fullName",
            p."agentId",
            p."seasonId",
            p."departureDate",
            p."overstayExempt",
            ($1::date - p."departureDate"::date) as "daysOver"
       FROM umrah_pilgrims p
      WHERE p."companyId" = $2
        AND p."deletedAt" IS NULL
        AND p.status = 'overstayed'
        AND p."departureDate" < $1
        AND NOT COALESCE(p."overstayExempt", false)
        AND NOT EXISTS (
          SELECT 1 FROM umrah_penalties pen
           WHERE pen."pilgrimId" = p.id
             AND pen."deletedAt" IS NULL
             AND pen.type = 'overstay'
             AND pen.status IN ('pending', 'invoiced')
        )`,
    [today, scope.companyId],
  );

  // Re-fetch the exempt count for the audit signal. We need this
  // separately because the main query excludes exempt rows up-front
  // (so the financial path is fully short-circuited for them).
  const exemptCount = await rawQuery<{ c: number }>(
    `SELECT COUNT(*)::int AS c
       FROM umrah_pilgrims p
      WHERE p."companyId" = $1
        AND p."deletedAt" IS NULL
        AND p.status = 'overstayed'
        AND p."departureDate" < $2
        AND COALESCE(p."overstayExempt", false) = true`,
    [scope.companyId, today],
  );
  const skippedExempt = Number(exemptCount[0]?.c ?? 0);

  let created = 0;
  let violationsLinked = 0;

  for (const p of overstayed) {
    if (Number(p.daysOver) < opts.overstayDays) continue;
    const amount = Number(p.daysOver) * opts.dailyRate;
    const result = await withTransaction(async (client: pg.PoolClient) => {
      const penRes = await client.query(
        `INSERT INTO umrah_penalties ("companyId","pilgrimId","agentId","seasonId",type,"daysOverstayed",amount,notes)
         VALUES ($1,$2,$3,$4,'overstay',$5,$6,$7) RETURNING id`,
        [
          scope.companyId,
          p.id,
          p.agentId,
          p.seasonId,
          p.daysOver,
          amount,
          `غرامة تأخر ${p.daysOver} يوم — ${p.fullName}`,
        ],
      );
      const penaltyId: number | undefined = penRes.rows[0]?.id;
      let linked = 0;
      if (penaltyId) {
        const upd = await client.query(
          `UPDATE umrah_violations
              SET "linkedPenaltyId" = $1, "updatedAt" = NOW()
            WHERE "mutamerId" = $2 AND type = 'overstay'
              AND "companyId" = $3 AND "linkedPenaltyId" IS NULL
              AND "deletedAt" IS NULL`,
          [penaltyId, p.id, scope.companyId],
        );
        linked = upd.rowCount ?? 0;
      }
      return { penaltyId, linked };
    });

    violationsLinked += result.linked;
    try {
      await applyTransition({
        entity: "umrah_pilgrims",
        id: p.id,
        scope: { companyId: scope.companyId, userId: scope.userId, branchId: scope.branchId },
        action: "umrah.pilgrim.violated",
        fromStates: ["overstayed"],
        toState: "violated",
        extraWhere: `"deletedAt" IS NULL`,
      });
    } catch (e) {
      logger.warn(e, "[umrah penalty engine] violated transition skipped");
    }

    if (result.penaltyId) {
      try {
        await umrahEngine.postPenaltyGL(
          { companyId: scope.companyId, branchId: scope.branchId || 0, createdBy: scope.userId },
          {
            id: result.penaltyId,
            amount,
            pilgrimName: p.fullName,
            agentName: undefined,
            type: "overstay",
            agentId: p.agentId as number | undefined,
            seasonId: p.seasonId as number | undefined,
          },
        );
      } catch (e) {
        logger.error(e, "[umrah penalty engine] GL posting failed (non-blocking)");
      }
    }
    created++;
  }

  return {
    checked: overstayed.length,
    penaltiesCreated: created,
    violationsLinked,
    skippedExempt,
  };
}
