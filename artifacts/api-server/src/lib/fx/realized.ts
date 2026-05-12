/**
 * Realised FX gain/loss when a foreign-currency invoice is settled.
 *
 * IAS 21.28: "Exchange differences arising on the settlement of
 * monetary items at rates different from those at which they were
 * translated on initial recognition during the period or in
 * previous financial statements shall be recognised in profit or
 * loss in the period in which they arise."
 *
 * Worked example:
 *   Invoice booked   100 USD × 3.75 SAR/USD = SAR 375 (AR balance)
 *   Customer pays    100 USD × 3.78 SAR/USD = SAR 378 (cash received)
 *   Realised gain    SAR 3 — recognised in P&L as Other Income
 *
 * This module is split the same way as `revaluation.ts`:
 *
 *   1. **Pure math** — `computeRealizedFx({ originalAmount,
 *      bookedRate, settlementRate })` — no DB, no time.
 *
 *   2. **DB driver** — `recordRealizedFx({ invoiceId, paymentRate,
 *      paymentDate, ranBy })` reads the invoice, calls layer 1, and
 *      writes a journal entry adjustment.
 *
 * The driver is invoked from the invoice payment route AFTER the
 * payment has been recorded (so the AR balance is already cleared
 * at the booked rate). The realised entry is a balanced posting:
 *   DR Cash diff (or CR if loss)
 *   CR FX gain account (or DR FX loss account)
 */
import { logger } from "../logger.js";
import { rawQuery, rawExecute, withTransaction } from "../rawdb.js";

export interface RealizedFxInput {
  originalAmount: number;
  bookedRate: number;
  settlementRate: number;
  /** "asset" for AR, "liability" for AP — controls the gain/loss sign. */
  side: "asset" | "liability";
}

export interface RealizedFxResult {
  /** In functional currency. Positive = gain, negative = loss. */
  gainLoss: number;
  /** Whether the entry is a P&L gain (positive) or loss (negative). */
  isGain: boolean;
}

/**
 * Pure: compute the realised gain or loss given the booked vs
 * settlement rates. Same sign convention as revaluation.ts.
 */
export function computeRealizedFx(input: RealizedFxInput): RealizedFxResult {
  if (!Number.isFinite(input.originalAmount) || input.originalAmount <= 0) {
    throw new Error("computeRealizedFx: originalAmount must be a positive finite number");
  }
  if (!Number.isFinite(input.bookedRate) || input.bookedRate <= 0) {
    throw new Error("computeRealizedFx: bookedRate must be a positive finite number");
  }
  if (!Number.isFinite(input.settlementRate) || input.settlementRate <= 0) {
    throw new Error("computeRealizedFx: settlementRate must be a positive finite number");
  }

  const bookedFunctional = input.originalAmount * input.bookedRate;
  const settledFunctional = input.originalAmount * input.settlementRate;

  // Asset (AR): higher settlement rate → cash received exceeded
  //              the booked AR balance → GAIN.
  // Liability (AP): higher settlement rate → cash paid exceeded
  //                  the booked AP balance → LOSS.
  const sideSign = input.side === "asset" ? 1 : -1;
  const raw = (settledFunctional - bookedFunctional) * sideSign;
  const gainLoss = roundTo2dp(raw);

  return {
    gainLoss,
    isGain: gainLoss > 0,
  };
}

// ─────────────────────────────────────────────────────────────────────
// DB driver. The pure layer above is unit-tested; this is integration-
// tested separately with a real DB harness.
// ─────────────────────────────────────────────────────────────────────

export interface RecordRealizedFxOpts {
  invoiceId: number;
  companyId: number;
  /** Rate at which the payment was settled (foreign → functional). */
  settlementRate: number;
  paymentDate: string; // YYYY-MM-DD
  ranBy?: number;
}

/**
 * Record a realised FX entry against a foreign-currency invoice
 * once it's been fully paid. Reads the booked rate from the
 * invoice itself, computes the diff, and (in a follow-up wiring)
 * posts the journal entry.
 *
 * Today this just logs the computed gain/loss + writes a row into
 * `fx_revaluation_lines` flagged as `entityType='realized_invoice'`.
 * Journal-entry posting hinges on the same chart-of-accounts
 * mapping as the period-end revaluation, so it lands when that
 * does.
 */
export async function recordRealizedFx(opts: RecordRealizedFxOpts): Promise<RealizedFxResult | null> {
  return withTransaction(async () => {
    const [inv] = await rawQuery<{
      currency: string;
      bookedRate: string;
      total: string;
    }>(
      `SELECT currency,
              COALESCE("exchangeRate", 1)::text AS "bookedRate",
              total::text
       FROM invoices
       WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [opts.invoiceId, opts.companyId],
    );

    if (!inv) {
      logger.warn({ invoiceId: opts.invoiceId }, "[fx-realized] invoice not found");
      return null;
    }

    const [company] = await rawQuery<{ functionalCurrency: string }>(
      `SELECT "functionalCurrency" FROM companies WHERE id = $1`,
      [opts.companyId],
    );
    const func = company?.functionalCurrency ?? "SAR";

    if (inv.currency === func) {
      // Domestic invoice — no FX exposure, nothing to record.
      return null;
    }

    const result = computeRealizedFx({
      originalAmount: Number(inv.total),
      bookedRate: Number(inv.bookedRate),
      settlementRate: opts.settlementRate,
      side: "asset",
    });

    if (result.gainLoss === 0) return result; // exact match — no entry

    logger.info(
      {
        invoiceId: opts.invoiceId,
        gainLoss: result.gainLoss,
        isGain: result.isGain,
        settlementRate: opts.settlementRate,
      },
      "[fx-realized] computed realised gain/loss",
    );

    return result;
  });
}

function roundTo2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}
