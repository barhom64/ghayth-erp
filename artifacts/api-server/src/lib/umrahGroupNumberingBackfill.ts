// umrahGroupNumberingBackfill — mint internalRef for historical umrah
// split-off groups that predate the numbering-centre wiring.
//
// Context (Issue #1141 follow-up): POST /umrah/groups/:id/split historically
// created a split-off group WITHOUT issuing an `internalRef` — fixed forward in
// #2956, so every NEW split now mints a number like the create path. Rows
// created BEFORE that fix carry `internalRef IS NULL`.
//
// Why the existing register-based backfill does NOT cover them: backfillScheme
// (numberingBackfill.ts) inventories rows that already HAVE a legacy ref but no
// numbering_assignments row — its scan filters `refCol IS NOT NULL`. Split
// groups have NULL internalRef, so they are skipped by design. They need a
// number MINTED, not a pre-existing ref registered.
//
// Boundary: this module is umrah-owned (it knows the `split_from_<id>` status
// shape and that a split-off inherits the SOURCE season). Issuance stays with
// the numbering centre via issueNumber() — the same service contract the
// create/split routes use. We never touch numbering_counters /
// numbering_assignments directly.

import { rawQuery, rawExecute } from "./rawdb.js";
import { issueNumber } from "./numberingService.js";
import { logger } from "./logger.js";

const MODULE_KEY = "umrah";
const ENTITY_KEY = "umrah_group";
const ENTITY_TABLE = "umrah_groups";

// Split-off groups are stamped `status = 'split_from_' || <sourceId>` by the
// split route (sourceId is always a positive integer). Match that shape exactly
// with a regex so an unrelated status can never be picked up. `_` is literal in
// POSIX regex, so no escaping pitfalls (unlike a LIKE pattern).
const SPLIT_STATUS_REGEX = "^split_from_[0-9]+$";

export interface SplitBackfillPreview {
  companyId: number;
  /** NULL-internalRef split groups WITH a seasonId — eligible to mint. */
  eligible: number;
  /** NULL-internalRef split groups WITHOUT a seasonId — cannot mint (the
   *  umrah_group scheme is season-scoped; issueNumber refuses a null season). */
  blockedNoSeason: number;
}

/**
 * Read-only: how many historical split groups would be minted, and how many are
 * blocked because they have no season. Writes nothing — the preview step the
 * admin sees before pressing the button.
 */
export async function previewSplitGroupNumberingBackfill(params: {
  companyId: number;
}): Promise<SplitBackfillPreview> {
  const [row] = await rawQuery<{ eligible: string; blocked: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE "seasonId" IS NOT NULL)::text AS eligible,
       COUNT(*) FILTER (WHERE "seasonId" IS NULL)::text     AS blocked
       FROM umrah_groups
      WHERE "companyId" = $1
        AND "internalRef" IS NULL
        AND "deletedAt" IS NULL
        AND status ~ $2`,
    [params.companyId, SPLIT_STATUS_REGEX],
  );
  return {
    companyId: params.companyId,
    eligible: Number(row?.eligible ?? 0),
    blockedNoSeason: Number(row?.blocked ?? 0),
  };
}

export interface SplitBackfillResult {
  companyId: number;
  /** Rows that received a freshly-minted internalRef this run. */
  minted: number;
  /** NULL-internalRef split groups left untouched for lack of a season. */
  skippedNoSeason: number;
  /** Rows whose issuance/update threw (logged, not fatal to the batch). */
  failed: number;
}

/**
 * Mint an internalRef through the numbering centre for every eligible historical
 * split group, then write it onto the group row.
 *
 * Idempotent: the scan filters `internalRef IS NULL`, so a re-run only touches
 * rows still missing a ref; the UPDATE is itself guarded with `internalRef IS
 * NULL`. Per-row failures are logged and counted, never abort the batch — one
 * bad row (e.g. a closed-season issuance refusal) must not strand the rest.
 *
 * NB on the numbering boundary: issueNumber() consumes a counter value and
 * writes the assignment row (with entityId linked atomically). The counter is
 * monotonic and tolerates gaps by design, so a per-row failure after issuance
 * is acceptable — identical to the create/split write paths.
 */
export async function backfillSplitGroupNumbering(params: {
  companyId: number;
  actorId: number | null;
  /** Hard cap on rows minted in one pass. */
  limit?: number;
}): Promise<SplitBackfillResult> {
  const limit = Math.min(params.limit ?? 5_000, 20_000);

  const rows = await rawQuery<{ id: number; branchId: number | null; seasonId: number }>(
    `SELECT id, "branchId", "seasonId"
       FROM umrah_groups
      WHERE "companyId" = $1
        AND "internalRef" IS NULL
        AND "deletedAt" IS NULL
        AND "seasonId" IS NOT NULL
        AND status ~ $2
      ORDER BY id ASC
      LIMIT $3`,
    [params.companyId, SPLIT_STATUS_REGEX, limit],
  );

  // Count season-blocked rows so the caller can report what was left behind.
  const [{ blocked }] = await rawQuery<{ blocked: string }>(
    `SELECT COUNT(*)::text AS blocked
       FROM umrah_groups
      WHERE "companyId" = $1
        AND "internalRef" IS NULL
        AND "deletedAt" IS NULL
        AND "seasonId" IS NULL
        AND status ~ $2`,
    [params.companyId, SPLIT_STATUS_REGEX],
  );

  let minted = 0;
  let failed = 0;

  for (const g of rows) {
    try {
      const issued = await issueNumber({
        companyId: params.companyId,
        branchId: g.branchId ?? null,
        moduleKey: MODULE_KEY,
        entityKey: ENTITY_KEY,
        entityTable: ENTITY_TABLE,
        entityId: g.id, // links the assignment row to the group atomically
        seasonId: g.seasonId,
        actorId: params.actorId,
        expectedTiming: "on_draft",
        metadata: { backfill: "split_group_numbering" },
      });
      // Guard with internalRef IS NULL so a concurrent run can't double-write.
      const upd = await rawExecute(
        `UPDATE umrah_groups
            SET "internalRef" = $1, "updatedAt" = NOW()
          WHERE id = $2 AND "companyId" = $3 AND "internalRef" IS NULL`,
        [issued.number, g.id, params.companyId],
      );
      if (upd.affectedRows > 0) {
        minted += 1;
      } else {
        // Rare race: another run set internalRef between our SELECT and UPDATE.
        // The number we just issued is now an orphan gap — acceptable for a
        // monotonic counter; log so it's visible.
        logger.warn(
          { companyId: params.companyId, groupId: g.id, issued: issued.number },
          "[umrah] split-group backfill: internalRef already set by a concurrent run; minted number left as a gap",
        );
      }
    } catch (err) {
      failed += 1;
      logger.error(err, `[umrah] split-group numbering backfill failed for group ${g.id}`);
    }
  }

  const result: SplitBackfillResult = {
    companyId: params.companyId,
    minted,
    skippedNoSeason: Number(blocked),
    failed,
  };
  logger.info(result, "[umrah] split-group numbering backfill complete");
  return result;
}
