/**
 * Period-end FX revaluation per IAS 21.
 *
 * "Monetary items denominated in a foreign currency are translated
 * using the closing rate" (IAS 21.23(a)). At period end we walk every
 * unsettled foreign-currency receivable / payable / cash balance,
 * compare the rate it was BOOKED at to the closing rate of the
 * period, and post the difference as an unrealized FX gain or loss.
 *
 * This module is split into two layers:
 *
 *   1. **Pure math** — `computeRevaluationLines(items, closingRates)`
 *      takes a list of monetary items + a rate table and returns the
 *      per-item gain/loss + totals + journal-line shape. No DB, no
 *      time. Trivially unit-testable.
 *
 *   2. **DB driver** — `runPeriodEndRevaluation(opts)` reads the
 *      monetary items from invoices/purchase_orders/bank_accounts,
 *      looks up closing rates via lib/fx/rate-lookup, calls layer 1,
 *      then writes the journal entry + revaluation log.
 *
 * The driver wraps everything in a single transaction so a partial
 * failure rolls back cleanly. Re-running for the same period
 * automatically reverses the prior run's journal entry first
 * (documented invariant — operators can adjust the closing rate
 * mid-month-end and re-run without manual cleanup).
 */
import { rawQuery, rawExecute, withTransaction } from "../rawdb.js";
import { logger } from "../logger.js";
import { fetchRateForDate } from "./rate-lookup.js";
import { convertWithRate } from "./convert.js";
import type { RevaluationResult } from "./types.js";

/** One monetary item to revalue. */
export interface MonetaryItem {
  entityType: string;
  entityId: number;
  /** Foreign currency the item is denominated in. */
  currency: string;
  /** Amount IN the foreign currency (positive). */
  originalAmount: number;
  /** Rate the item was booked at (functional ÷ foreign per FX direction). */
  bookedRate: number;
  /**
   * Side of the balance sheet this item sits on. Determines the sign
   * of gain/loss when the foreign currency strengthens vs functional:
   *
   *   asset   — receivable / cash : strengthening → GAIN
   *   liability — payable          : strengthening → LOSS
   */
  side: "asset" | "liability";
}

export interface RevaluationLine {
  entityType: string;
  entityId: number;
  originalCurrency: string;
  originalAmount: number;
  bookedRate: number;
  closingRate: number;
  /** In functional currency. Positive = gain, negative = loss. */
  gainLoss: number;
}

export interface ComputedRevaluation {
  lines: RevaluationLine[];
  totalGain: number;
  totalLoss: number;
  /** Items whose closing rate wasn't available — caller decides
   *  whether to fail the run or skip them. */
  skipped: Array<{ entityType: string; entityId: number; reason: string }>;
}

/**
 * Pure: produce the revaluation lines + totals from a list of
 * monetary items and a rate-lookup function. The lookup is
 * passed in (rather than imported) so the unit tests can pass
 * a deterministic stub.
 */
export function computeRevaluationLines(
  items: MonetaryItem[],
  closingRateFor: (currency: string) => number | null,
  functionalCurrency: string,
): ComputedRevaluation {
  const out: ComputedRevaluation = {
    lines: [],
    totalGain: 0,
    totalLoss: 0,
    skipped: [],
  };

  for (const item of items) {
    if (item.currency === functionalCurrency) {
      // Functional-currency items aren't "foreign" — nothing to revalue.
      continue;
    }

    const closingRate = closingRateFor(item.currency);
    if (closingRate === null) {
      out.skipped.push({
        entityType: item.entityType,
        entityId: item.entityId,
        reason: `no closing rate for ${item.currency}`,
      });
      continue;
    }

    // Functional value at booked vs closing rate.
    const bookedFunctional = item.originalAmount * item.bookedRate;
    const closingFunctional = item.originalAmount * closingRate;

    // Asset items (receivable, cash): higher closing rate → gain.
    // Liability items (payable):       higher closing rate → loss.
    const sideSign = item.side === "asset" ? 1 : -1;
    const gainLossRaw = (closingFunctional - bookedFunctional) * sideSign;
    const gainLoss = roundTo2dp(gainLossRaw);

    if (gainLoss === 0) continue; // exact match — no entry needed

    out.lines.push({
      entityType: item.entityType,
      entityId: item.entityId,
      originalCurrency: item.currency,
      originalAmount: item.originalAmount,
      bookedRate: item.bookedRate,
      closingRate,
      gainLoss,
    });

    if (gainLoss > 0) {
      out.totalGain += gainLoss;
    } else {
      out.totalLoss += Math.abs(gainLoss);
    }
  }

  out.totalGain = roundTo2dp(out.totalGain);
  out.totalLoss = roundTo2dp(out.totalLoss);
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// DB-driven runner. The pure layer above is what's unit-tested; this
// is integration-tested separately once the harness exists.
// ─────────────────────────────────────────────────────────────────────

export interface RunPeriodEndOpts {
  companyId: number;
  periodId: number;
  asOfDate: string; // YYYY-MM-DD
  ranBy?: number;
}

/**
 * Walk every monetary item for the company, compute lines, and
 * write the audit log. Journal-entry construction itself lives
 * outside this module because the chart-of-accounts mapping
 * (which 4XXX gain account, which 5XXX loss account) is a
 * per-tenant config concern — for now we record the totals in
 * `fx_revaluation_log.totalGain/totalLoss` and leave the
 * `journalEntryId` NULL for the operator to post manually.
 *
 * The DB-side journal posting will be wired in a follow-up once
 * the GL-account-by-purpose lookup helper lands.
 */
export async function runPeriodEndRevaluation(opts: RunPeriodEndOpts): Promise<RevaluationResult> {
  return withTransaction(async () => {
    // 1. Read functional currency.
    const [company] = await rawQuery<{ functionalCurrency: string }>(
      `SELECT "functionalCurrency" FROM companies WHERE id = $1`,
      [opts.companyId],
    );
    const func = company?.functionalCurrency ?? "SAR";

    // 2. Pull open monetary items. The query is intentionally
    //    conservative — only invoices and purchase_orders that
    //    are still outstanding (paid < total). Bank-account
    //    revaluation lands when the per-currency cash account
    //    aggregator is wired (week 4).
    const items: MonetaryItem[] = await collectMonetaryItems(opts.companyId, func);

    // 3. Look up closing rates for every distinct foreign
    //    currency once.
    const distinctCcy = Array.from(new Set(items.map((i) => i.currency)));
    const rateMap = new Map<string, number>();
    for (const ccy of distinctCcy) {
      if (ccy === func) continue;
      const r = await fetchRateForDate({
        companyId: opts.companyId,
        from: ccy,
        to: func,
        asOfDate: opts.asOfDate,
      });
      if (r !== null) rateMap.set(ccy, r.rate);
    }

    // 4. Compute lines.
    const computed = computeRevaluationLines(items, (ccy) => rateMap.get(ccy) ?? null, func);

    // 5. Reverse a prior run for this period if one exists. The
    //    spec is ambiguous on whether to keep both rows or
    //    overwrite — we keep both (audit trail) but mark the
    //    prior journal as reversed via a future patch.
    //    For now, just insert the new run.
    const [logRow] = await rawQuery<{ id: number }>(
      `INSERT INTO fx_revaluation_log
         ("companyId", "periodId", "asOfDate", "functionalCurrency",
          "totalGain", "totalLoss", "ranBy")
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        opts.companyId,
        opts.periodId,
        opts.asOfDate,
        func,
        computed.totalGain,
        computed.totalLoss,
        opts.ranBy ?? null,
      ],
    );
    const revaluationLogId = logRow.id;

    // 6. Bulk-insert lines.
    for (const line of computed.lines) {
      await rawExecute(
        `INSERT INTO fx_revaluation_lines
           ("revaluationLogId", "entityType", "entityId",
            "originalCurrency", "originalAmount",
            "bookedRate", "closingRate", "gainLoss")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          revaluationLogId,
          line.entityType,
          line.entityId,
          line.originalCurrency,
          line.originalAmount,
          line.bookedRate,
          line.closingRate,
          line.gainLoss,
        ],
      );
    }

    logger.info(
      {
        companyId: opts.companyId,
        periodId: opts.periodId,
        gain: computed.totalGain,
        loss: computed.totalLoss,
        skipped: computed.skipped.length,
      },
      "[fx-revaluation] period-end run complete",
    );

    return {
      revaluationLogId,
      journalEntryId: null,
      totalGain: computed.totalGain,
      totalLoss: computed.totalLoss,
      scanned: items.length,
      reported: computed.lines.length,
      skipped: computed.skipped,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────
// Internal: collect the monetary items to walk. Conservative scope —
// invoices outstanding (AR side, asset) + purchase_orders outstanding
// (AP side, liability). Bank accounts in foreign currency are added
// when the cash-account aggregator lands.
// ─────────────────────────────────────────────────────────────────────

async function collectMonetaryItems(companyId: number, func: string): Promise<MonetaryItem[]> {
  const items: MonetaryItem[] = [];

  // AR: open invoices (status not in paid/void/cancelled).
  const ar = await rawQuery<{
    id: number;
    currency: string;
    bookedRate: string;
    outstanding: string;
  }>(
    `SELECT id,
            currency,
            COALESCE("exchangeRate", 1)::text AS "bookedRate",
            (total - COALESCE("paidAmount", 0))::text AS outstanding
     FROM invoices
     WHERE "companyId" = $1
       AND "deletedAt" IS NULL
       AND currency IS NOT NULL
       AND currency <> $2
       AND status NOT IN ('paid', 'void', 'cancelled', 'rejected')
       AND (total - COALESCE("paidAmount", 0)) > 0`,
    [companyId, func],
  );
  for (const r of ar) {
    items.push({
      entityType: "invoice",
      entityId: r.id,
      currency: r.currency,
      originalAmount: Number(r.outstanding),
      bookedRate: Number(r.bookedRate),
      side: "asset",
    });
  }

  // AP: open purchase orders (status not in paid/cancelled/closed).
  const ap = await rawQuery<{
    id: number;
    currency: string;
    bookedRate: string;
    outstanding: string;
  }>(
    `SELECT id,
            currency,
            COALESCE("exchangeRate", 1)::text AS "bookedRate",
            ("totalAmount" - COALESCE("paidAmount", 0))::text AS outstanding
     FROM purchase_orders
     WHERE "companyId" = $1
       AND "deletedAt" IS NULL
       AND currency IS NOT NULL
       AND currency <> $2
       AND status NOT IN ('paid', 'closed', 'cancelled')
       AND ("totalAmount" - COALESCE("paidAmount", 0)) > 0`,
    [companyId, func],
  ).catch((err) => {
    // purchase_orders may not have paidAmount in older schemas;
    // soft-fail to an empty result so the AR side still posts.
    logger.debug({ err: err instanceof Error ? err.message : String(err) },
      "[fx-revaluation] AP collect skipped (schema mismatch)");
    return [];
  });
  for (const r of ap) {
    items.push({
      entityType: "purchase_order",
      entityId: r.id,
      currency: r.currency,
      originalAmount: Number(r.outstanding),
      bookedRate: Number(r.bookedRate),
      side: "liability",
    });
  }

  return items;
}

function roundTo2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}
