/**
 * Wire the FX revaluation log into a balanced journal entry via
 * the GL helpers shipped in #224 (account purposes + journal
 * builder) and #252 (postJournalEntry DB driver).
 *
 * Pure layer (`buildRevaluationEntryInput`):
 *   takes a list of revaluation lines (with side: asset|liability,
 *   gainLoss: positive=gain, negative=loss) plus the four resolved
 *   accounts and returns the BuildEntryInput shape ready for
 *   `gl/buildEntry`. No DB. Easy to unit-test all four
 *   asset/liability × gain/loss combinations.
 *
 * DB driver (`postFxRevaluationJournal`):
 *   reads the existing fx_revaluation_log row + its lines, calls
 *   the pure builder, posts the entry via `postJournalEntry`,
 *   stamps the new journalEntryId back on the log row. Idempotent:
 *   a row that already has journalEntryId set is skipped (the
 *   operator can re-trigger a posting after editing the rate, but
 *   the existing entry stays put — they reverse + repost manually
 *   if needed).
 *
 * The driver does NOT modify `runPeriodEndRevaluation` or any
 * other working code. It's a separate function that route
 * handlers + the operator UI call when they're ready to actually
 * post the entry. The revaluation runner keeps writing the log
 * row + lines as it does today; this helper translates that into
 * a journal entry.
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

export interface RevaluationLineForJournal {
  entityType: string;
  entityId: number;
  gainLoss: number;
  /** "asset" for invoices/AR/cash, "liability" for purchase orders/AP. */
  side: "asset" | "liability";
}

export interface ResolvedAccountSet {
  arAsset: AccountResolution;
  apLiability: AccountResolution;
  fxGain: AccountResolution;
  fxLoss: AccountResolution;
}

/**
 * Aggregate the per-line gains/losses by (side × sign). Used by the
 * pure builder to know how many of the four account-pair branches
 * actually need a journal line.
 */
export interface RevaluationTotals {
  assetGain: number;
  assetLoss: number;
  liabilityGain: number;
  liabilityLoss: number;
}

/**
 * Pure: walk the lines and aggregate by (side × sign).
 */
export function aggregateRevaluation(lines: RevaluationLineForJournal[]): RevaluationTotals {
  let assetGain = 0;
  let assetLoss = 0;
  let liabilityGain = 0;
  let liabilityLoss = 0;
  for (const l of lines) {
    if (l.gainLoss === 0) continue;
    if (l.side === "asset") {
      if (l.gainLoss > 0) assetGain += l.gainLoss;
      else assetLoss += -l.gainLoss;
    } else {
      if (l.gainLoss > 0) liabilityGain += l.gainLoss;
      else liabilityLoss += -l.gainLoss;
    }
  }
  return {
    assetGain: round2dp(assetGain),
    assetLoss: round2dp(assetLoss),
    liabilityGain: round2dp(liabilityGain),
    liabilityLoss: round2dp(liabilityLoss),
  };
}

/**
 * Pure: build the BuildEntryInput payload for a revaluation. The
 * resulting entry is balanced because every gain on an asset is
 * accompanied by a credit to the FX gain account (and vice versa
 * for losses + the FX loss account), and same for liabilities.
 *
 * Asset gain   → DR AR_asset        / CR FX_gain
 * Asset loss   → DR FX_loss         / CR AR_asset
 * Liab gain    → DR AP_liability    / CR FX_gain  (AP balance went down → gain)
 * Liab loss    → DR FX_loss         / CR AP_liability  (AP balance went up → loss)
 *
 * Lines with zero amounts are skipped so the resulting entry has
 * only the lines that actually carry value — `gl/buildEntry` then
 * does its own zero-skipping as a safety net.
 */
export function buildRevaluationEntryInput(opts: {
  description: string;
  totals: RevaluationTotals;
  accounts: ResolvedAccountSet;
  sourceType?: string;
  sourceId?: number;
}): BuildEntryInput {
  const { totals, accounts } = opts;
  const lines: BuildEntryInput["lines"] = [];

  // Asset gain: DR AR / CR Gain
  if (totals.assetGain > 0) {
    lines.push({
      accountId: accounts.arAsset.accountId,
      amount: totals.assetGain,
      description: `FX gain on AR (${accounts.arAsset.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
    lines.push({
      accountId: accounts.fxGain.accountId,
      amount: -totals.assetGain,
      description: `FX gain (${accounts.fxGain.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
  }

  // Asset loss: DR Loss / CR AR
  if (totals.assetLoss > 0) {
    lines.push({
      accountId: accounts.fxLoss.accountId,
      amount: totals.assetLoss,
      description: `FX loss (${accounts.fxLoss.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
    lines.push({
      accountId: accounts.arAsset.accountId,
      amount: -totals.assetLoss,
      description: `FX loss on AR (${accounts.arAsset.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
  }

  // Liability gain: DR AP / CR Gain
  if (totals.liabilityGain > 0) {
    lines.push({
      accountId: accounts.apLiability.accountId,
      amount: totals.liabilityGain,
      description: `FX gain on AP (${accounts.apLiability.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
    lines.push({
      accountId: accounts.fxGain.accountId,
      amount: -totals.liabilityGain,
      description: `FX gain (${accounts.fxGain.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
  }

  // Liability loss: DR Loss / CR AP
  if (totals.liabilityLoss > 0) {
    lines.push({
      accountId: accounts.fxLoss.accountId,
      amount: totals.liabilityLoss,
      description: `FX loss (${accounts.fxLoss.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
    lines.push({
      accountId: accounts.apLiability.accountId,
      amount: -totals.liabilityLoss,
      description: `FX loss on AP (${accounts.apLiability.accountCode})`,
      referenceType: opts.sourceType,
      referenceId: opts.sourceId,
    });
  }

  return { description: opts.description, lines };
}

// ─────────────────────────────────────────────────────────────────────
// DB driver
// ─────────────────────────────────────────────────────────────────────

export interface PostRevaluationOpts {
  revaluationLogId: number;
  companyId: number;
  /** Operator who triggered the posting (audit trail). */
  postedBy?: number;
  /** Override the description on the journal-entries row. */
  description?: string;
  /** Pass the journal entry as `draft` so the operator reviews
   *  before it goes live. Defaults to `posted`. */
  asDraft?: boolean;
}

export interface PostRevaluationOutcome {
  status: "posted" | "draft" | "skipped" | "noop";
  journalEntryId: number | null;
  reason?: string;
}

/**
 * Read the revaluation log + lines, post the journal entry, stamp
 * the new journalEntryId on the log row.
 *
 * Idempotency: returns `skipped` (with the existing journalEntryId)
 * if the log row already has one. The operator who wants to repost
 * after correcting a rate has to reverse the existing entry first
 * (or call this helper with a fresh revaluation run).
 */
export async function postFxRevaluationJournal(opts: PostRevaluationOpts): Promise<PostRevaluationOutcome> {
  return withTransaction(async () => {
    const [log] = await rawQuery<{
      id: number;
      asOfDate: string;
      functionalCurrency: string;
      totalGain: string;
      totalLoss: string;
      journalEntryId: number | null;
    }>(
      `SELECT id,
              "asOfDate"::text AS "asOfDate",
              "functionalCurrency",
              "totalGain"::text AS "totalGain",
              "totalLoss"::text AS "totalLoss",
              "journalEntryId"
       FROM fx_revaluation_log
       WHERE id = $1 AND "companyId" = $2
       FOR UPDATE`,
      [opts.revaluationLogId, opts.companyId],
    );
    if (!log) {
      throw new Error(`postFxRevaluationJournal: log row ${opts.revaluationLogId} not found`);
    }
    if (log.journalEntryId !== null) {
      return {
        status: "skipped",
        journalEntryId: log.journalEntryId,
        reason: "log row already has journalEntryId; reverse before reposting",
      };
    }

    const lines = await rawQuery<{
      entityType: string;
      entityId: number;
      gainLoss: string;
    }>(
      `SELECT "entityType",
              "entityId",
              "gainLoss"::text AS "gainLoss"
       FROM fx_revaluation_lines
       WHERE "revaluationLogId" = $1`,
      [opts.revaluationLogId],
    );

    if (lines.length === 0) {
      return { status: "noop", journalEntryId: null, reason: "no revaluation lines to post" };
    }

    const inputLines: RevaluationLineForJournal[] = lines.map((l) => ({
      entityType: l.entityType,
      entityId: l.entityId,
      gainLoss: Number(l.gainLoss),
      // entity-type heuristic — invoice/cash/bank are AR-side
      // assets; purchase_order/expense are AP-side liabilities.
      side: isAssetEntity(l.entityType) ? "asset" : "liability",
    }));

    const totals = aggregateRevaluation(inputLines);
    if (totals.assetGain + totals.assetLoss + totals.liabilityGain + totals.liabilityLoss === 0) {
      return { status: "noop", journalEntryId: null, reason: "all lines net to zero" };
    }

    // Resolve the four accounts.
    const [arAsset, apLiability, fxGain, fxLoss] = await Promise.all([
      getAccountForPurpose(opts.companyId, "fx_revaluation_ar", "debit"),
      getAccountForPurpose(opts.companyId, "fx_revaluation_ap", "credit"),
      getAccountForPurpose(opts.companyId, "fx_revaluation_gain", "credit"),
      getAccountForPurpose(opts.companyId, "fx_revaluation_loss", "debit"),
    ]);
    if (!arAsset || !apLiability || !fxGain || !fxLoss) {
      throw new Error(
        "postFxRevaluationJournal: one or more FX accounts could not be resolved " +
          "(check accounting_mappings + chart_of_accounts seed)",
      );
    }

    const description = opts.description ?? `FX revaluation as of ${log.asOfDate}`;
    const buildInput = buildRevaluationEntryInput({
      description,
      totals,
      accounts: { arAsset, apLiability, fxGain, fxLoss },
      sourceType: "fx_revaluation_log",
      sourceId: opts.revaluationLogId,
    });

    if (buildInput.lines.length === 0) {
      return { status: "noop", journalEntryId: null, reason: "build produced no lines" };
    }

    const payload = buildEntry(buildInput);

    // PD-6 — sourceKey is tied to the log row (not just the date) so a re-fire
    // for the same revaluation run idempotently hits the existing journal
    // entry. The log-row-level guard above (`log.journalEntryId !== null`)
    // already prevents repost through this path; this is defence-in-depth for
    // a future caller that builds the ctx by hand.
    const ctx: EntryContext = {
      companyId: opts.companyId,
      createdBy: opts.postedBy,
      ref: `FX-REV-${log.asOfDate}`,
      sourceKey: `FX-REV-LOG-${opts.revaluationLogId}`,
      type: "fx_revaluation",
      sourceType: "fx_revaluation_log",
      sourceId: opts.revaluationLogId,
      date: log.asOfDate,
      status: opts.asDraft ? "draft" : "posted",
    };
    const posted = await postJournalEntry(payload, ctx);

    await rawExecute(
      `UPDATE fx_revaluation_log SET "journalEntryId" = $1 WHERE id = $2`,
      [posted.journalEntryId, opts.revaluationLogId],
    );

    logger.info(
      {
        revaluationLogId: opts.revaluationLogId,
        journalEntryId: posted.journalEntryId,
        status: posted.status,
        ...totals,
      },
      "[fx-revaluation] journal entry posted",
    );

    return {
      status: posted.status,
      journalEntryId: posted.journalEntryId,
    };
  });
}

/** Asset side of the balance sheet — exposed for testability. */
export function isAssetEntity(entityType: string): boolean {
  return (
    entityType === "invoice" ||
    entityType === "bank_account" ||
    entityType === "cash"
  );
}

function round2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}
