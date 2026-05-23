/**
 * Wire an approved cycle-count run into a balanced journal entry,
 * via the GL helpers from #224 + #252.
 *
 * Third of the deferred GL-integration helpers — same pattern as
 * #253 (FX revaluation) and #256 (realised FX). Pure aggregator
 * + DB driver, no behaviour change to `approveCycleCount` itself.
 *
 * Cycle-count variances post to:
 *
 *   Overage   → DR inventory_asset / CR cycle_count_variance_gain
 *   Shrinkage → DR cycle_count_variance_loss / CR inventory_asset
 *
 * A single run can produce both branches (some products counted
 * over, others under) so the entry can have up to 4 lines.
 */
import { rawQuery, rawExecute, withTransaction } from "../rawdb.js";
import { logger } from "../logger.js";
import {
  buildEntry,
  postJournalEntry,
  getAccountForPurpose,
  type AccountResolution,
  type BuildEntryInput,
  type EntryContext,
} from "../gl/index.js";

export interface CycleCountLineForJournal {
  productId: number;
  /** counted - system, in qty (informational; the journal works
   *  off varianceValue). */
  variance: number;
  /** variance × unitCost. Positive = overage (gain),
   *  negative = shrinkage (loss). */
  varianceValue: number;
}

export interface CycleCountTotals {
  /** Sum of positive varianceValue across lines. */
  totalGainValue: number;
  /** Sum of |negative varianceValue| across lines. */
  totalLossValue: number;
}

export interface CycleCountAccounts {
  inventory: AccountResolution;
  gain: AccountResolution;
  loss: AccountResolution;
}

/**
 * Pure: aggregate per-line variance values into gain + loss totals.
 * Skips zero-variance lines, 2dp-rounds the totals.
 */
export function aggregateCycleCount(lines: CycleCountLineForJournal[]): CycleCountTotals {
  let gain = 0;
  let loss = 0;
  for (const l of lines) {
    if (l.varianceValue === 0) continue;
    if (l.varianceValue > 0) gain += l.varianceValue;
    else loss += -l.varianceValue;
  }
  return {
    totalGainValue: round2dp(gain),
    totalLossValue: round2dp(loss),
  };
}

/**
 * Pure: build the BuildEntryInput payload for one cycle-count run.
 * Empty buckets emit no lines; an all-zero totals returns an empty
 * `lines` array so the caller can short-circuit to `noop`.
 */
export function buildCycleCountEntryInput(opts: {
  description: string;
  totals: CycleCountTotals;
  accounts: CycleCountAccounts;
  cycleCountId: number;
}): BuildEntryInput {
  const lines: BuildEntryInput["lines"] = [];

  // Overage: DR inventory / CR gain.
  if (opts.totals.totalGainValue > 0) {
    lines.push({
      accountId: opts.accounts.inventory.accountId,
      amount: opts.totals.totalGainValue,
      description: `Cycle-count overage (${opts.accounts.inventory.accountCode})`,
      referenceType: "warehouse_cycle_counts",
      referenceId: opts.cycleCountId,
    });
    lines.push({
      accountId: opts.accounts.gain.accountId,
      amount: -opts.totals.totalGainValue,
      description: `Cycle-count gain (${opts.accounts.gain.accountCode})`,
      referenceType: "warehouse_cycle_counts",
      referenceId: opts.cycleCountId,
    });
  }

  // Shrinkage: DR loss / CR inventory.
  if (opts.totals.totalLossValue > 0) {
    lines.push({
      accountId: opts.accounts.loss.accountId,
      amount: opts.totals.totalLossValue,
      description: `Cycle-count loss (${opts.accounts.loss.accountCode})`,
      referenceType: "warehouse_cycle_counts",
      referenceId: opts.cycleCountId,
    });
    lines.push({
      accountId: opts.accounts.inventory.accountId,
      amount: -opts.totals.totalLossValue,
      description: `Cycle-count shrinkage (${opts.accounts.inventory.accountCode})`,
      referenceType: "warehouse_cycle_counts",
      referenceId: opts.cycleCountId,
    });
  }

  return { description: opts.description, lines };
}

// ─────────────────────────────────────────────────────────────────────
// DB driver
// ─────────────────────────────────────────────────────────────────────

export interface PostCycleCountOpts {
  cycleCountId: number;
  companyId: number;
  postedBy?: number;
  description?: string;
  asDraft?: boolean;
}

export interface PostCycleCountOutcome {
  status: "posted" | "draft" | "skipped" | "noop";
  journalEntryId: number | null;
  totals: CycleCountTotals;
  reason?: string;
}

/**
 * Read the cycle-count header + lines, post the journal entry,
 * stamp the new journalEntryId back on each line. Idempotency: if
 * EVERY line in the run already has an adjustmentJournalEntryId, we
 * return `skipped` (the run has been posted). If only SOME lines
 * have it, we throw — that's a partial-posting bug the operator
 * needs to investigate.
 */
export async function postCycleCountVarianceJournal(
  opts: PostCycleCountOpts,
): Promise<PostCycleCountOutcome> {
  return withTransaction(async () => {
    const [header] = await rawQuery<{
      status: string;
      warehouseId: number;
      scheduledDate: string;
    }>(
      `SELECT status, "warehouseId", "scheduledDate"::text AS "scheduledDate"
       FROM warehouse_cycle_counts
       WHERE id = $1 AND "companyId" = $2
       FOR UPDATE`,
      [opts.cycleCountId, opts.companyId],
    );
    if (!header) {
      throw new Error(`postCycleCountVarianceJournal: cycle count ${opts.cycleCountId} not found`);
    }
    if (header.status !== "approved") {
      throw new Error(
        `postCycleCountVarianceJournal: cycle count ${opts.cycleCountId} is ${header.status}; ` +
          `posting requires 'approved'`,
      );
    }

    const lines = await rawQuery<{
      id: number;
      productId: number;
      variance: string;
      varianceValue: string | null;
      adjustmentJournalEntryId: number | null;
    }>(
      `SELECT id, "productId",
              variance::text AS variance,
              "varianceValue"::text AS "varianceValue",
              "adjustmentJournalEntryId"
       FROM warehouse_cycle_count_lines
       WHERE "cycleCountId" = $1`,
      [opts.cycleCountId],
    );

    if (lines.length === 0) {
      return {
        status: "noop",
        journalEntryId: null,
        totals: { totalGainValue: 0, totalLossValue: 0 },
        reason: "no lines in cycle count",
      };
    }

    // Idempotency: all-already-posted = skip; partial = inconsistency.
    const postedLines = lines.filter((l) => l.adjustmentJournalEntryId !== null);
    if (postedLines.length === lines.length) {
      return {
        status: "skipped",
        journalEntryId: postedLines[0].adjustmentJournalEntryId,
        totals: { totalGainValue: 0, totalLossValue: 0 },
        reason: "every line already carries adjustmentJournalEntryId; reverse before reposting",
      };
    }
    if (postedLines.length > 0) {
      throw new Error(
        `postCycleCountVarianceJournal: ${postedLines.length}/${lines.length} lines ` +
          `already have adjustmentJournalEntryId — partial posting; investigate`,
      );
    }

    const inputLines: CycleCountLineForJournal[] = lines.map((l) => ({
      productId: l.productId,
      variance: Number(l.variance),
      varianceValue: l.varianceValue == null ? 0 : Number(l.varianceValue),
    }));

    const totals = aggregateCycleCount(inputLines);
    if (totals.totalGainValue + totals.totalLossValue === 0) {
      return {
        status: "noop",
        journalEntryId: null,
        totals,
        reason: "all variance values net to zero",
      };
    }

    const [inventory, gain, loss] = await Promise.all([
      getAccountForPurpose(opts.companyId, "inventory_asset", "debit"),
      getAccountForPurpose(opts.companyId, "cycle_count_variance_gain", "credit"),
      getAccountForPurpose(opts.companyId, "cycle_count_variance_loss", "debit"),
    ]);
    if (!inventory || !gain || !loss) {
      throw new Error(
        "postCycleCountVarianceJournal: one or more accounts could not be resolved " +
          "(check accounting_mappings + chart_of_accounts seed)",
      );
    }

    const description =
      opts.description ?? `Cycle-count variance #${opts.cycleCountId} (${header.scheduledDate})`;

    const buildInput = buildCycleCountEntryInput({
      description,
      totals,
      accounts: { inventory, gain, loss },
      cycleCountId: opts.cycleCountId,
    });

    if (buildInput.lines.length === 0) {
      return {
        status: "noop",
        journalEntryId: null,
        totals,
        reason: "build produced no lines",
      };
    }

    const payload = buildEntry(buildInput);

    // PD-6 — stable economic-event key. A retried cycle-count post (network
    // blip, manual retry) for the same cycle-count run returns the existing
    // entry instead of double-posting. Tied to the cycle-count row id.
    const ref = `CC-${opts.cycleCountId}-${header.scheduledDate}`;
    const ctx: EntryContext = {
      companyId: opts.companyId,
      createdBy: opts.postedBy,
      ref,
      sourceKey: `CC-${opts.cycleCountId}`,
      type: "cycle_count_variance",
      sourceType: "warehouse_cycle_counts",
      sourceId: opts.cycleCountId,
      date: header.scheduledDate,
      status: opts.asDraft ? "draft" : "posted",
    };
    const posted = await postJournalEntry(payload, ctx);

    // Stamp adjustmentJournalEntryId on every line of the run so
    // the next call detects "already posted" cleanly.
    await rawExecute(
      `UPDATE warehouse_cycle_count_lines
         SET "adjustmentJournalEntryId" = $1
       WHERE "cycleCountId" = $2`,
      [posted.journalEntryId, opts.cycleCountId],
    );

    logger.info(
      {
        cycleCountId: opts.cycleCountId,
        journalEntryId: posted.journalEntryId,
        status: posted.status,
        ...totals,
      },
      "[cycle-count] variance journal entry posted",
    );

    return {
      status: posted.status,
      journalEntryId: posted.journalEntryId,
      totals,
    };
  });
}

function round2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}
