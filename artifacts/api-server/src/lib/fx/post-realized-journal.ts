/**
 * Wire a single realised-FX recognition (settlement of a foreign-
 * currency invoice) into a journal entry, via the GL helpers from
 * #224 + #252.
 *
 * Sister helper to `postFxRevaluationJournal` (#253). The
 * revaluation path posts ONE entry per period covering many lines;
 * realised FX posts ONE entry per settlement (invoice payment) with
 * a single gain or loss leg.
 *
 * Pure layer (`buildRealizedFxEntryInput`):
 *   takes (companyId, side, gainLoss, accounts, invoiceId) and
 *   returns the BuildEntryInput shape with the right DR/CR pair
 *   for a gain or a loss. Easy to unit-test all four
 *   (asset|liability) × (gain|loss) combinations.
 *
 * DB driver (`postRealizedFxJournal`):
 *   reads the invoice (currency, bookedRate, total), reads the
 *   company functional currency, computes realised gain/loss via
 *   computeRealizedFx (shipped in #219), resolves the four
 *   relevant accounts, builds + posts the journal entry. Returns
 *   the new journalEntryId.
 *
 * **Idempotency**: the helper records every successful posting in
 * `fx_realized_postings` (migration 148), keyed on the triple
 * (companyId, invoiceId, paymentDate, settlementRate). A second
 * call with the same triple returns `skipped`. A call with the SAME
 * invoice but a DIFFERENT paymentDate or settlementRate posts a
 * fresh entry — that's the partial-settlement case (an AR invoice
 * paid in tranches at different rates each legitimately needs its
 * own realised FX leg).
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
import { computeRealizedFx } from "./realized.js";

export interface PostRealizedFxOpts {
  companyId: number;
  invoiceId: number;
  /** Rate at which the payment was settled (foreign → functional). */
  settlementRate: number;
  /** YYYY-MM-DD — payment date the journal entry should carry. */
  paymentDate: string;
  /** Foreign-currency amount the customer paid in THIS settlement. The
   *  realised gain/loss is `paymentAmount × (settlementRate − bookedRate)`;
   *  using the full `invoice.total` overstates the gain on every partial
   *  payment and double-posts across multiple partial payments. Defaults
   *  to `invoice.total` for backward compat with full-payment callers —
   *  pass it explicitly whenever the payment may be partial. */
  paymentAmount?: number;
  /** Operator who triggered the posting (audit trail). */
  postedBy?: number;
  /** Override the description on the journal-entries row. */
  description?: string;
  /** Pass the journal entry as `draft` so the operator reviews
   *  before it goes live. Defaults to `posted`. */
  asDraft?: boolean;
}

export interface PostRealizedFxOutcome {
  status: "posted" | "draft" | "skipped" | "noop";
  journalEntryId: number | null;
  gainLoss: number;
  reason?: string;
}

export interface RealizedAccounts {
  arAsset: AccountResolution;
  apLiability: AccountResolution;
  realizedGain: AccountResolution;
  realizedLoss: AccountResolution;
}

/**
 * Pure: build the BuildEntryInput payload for one realised FX leg.
 *
 *   Asset gain   → DR AR_asset      / CR realized_gain
 *   Asset loss   → DR realized_loss / CR AR_asset
 *   Liab gain    → DR AP_liability  / CR realized_gain
 *   Liab loss    → DR realized_loss / CR AP_liability
 *
 * Returns empty `lines` when `gainLoss` rounds to zero so the
 * caller can short-circuit to a `noop` outcome.
 */
export function buildRealizedFxEntryInput(opts: {
  description: string;
  side: "asset" | "liability";
  gainLoss: number;
  accounts: RealizedAccounts;
  invoiceId: number;
}): BuildEntryInput {
  const lines: BuildEntryInput["lines"] = [];
  const abs = Math.abs(round2dp(opts.gainLoss));
  if (abs === 0) return { description: opts.description, lines };

  const isGain = opts.gainLoss > 0;
  const customerSide = opts.side === "asset" ? opts.accounts.arAsset : opts.accounts.apLiability;
  const pnlSide = isGain ? opts.accounts.realizedGain : opts.accounts.realizedLoss;
  const sideLabel = opts.side === "asset" ? "AR" : "AP";

  if ((opts.side === "asset" && isGain) || (opts.side === "liability" && isGain)) {
    // Asset gain: DR AR / CR gain.
    // Liab gain: DR AP / CR gain.
    lines.push({
      accountId: customerSide.accountId,
      amount: abs,
      description: `Realised FX gain on ${sideLabel} (${customerSide.accountCode})`,
      referenceType: "invoice",
      referenceId: opts.invoiceId,
    });
    lines.push({
      accountId: pnlSide.accountId,
      amount: -abs,
      description: `Realised FX gain (${pnlSide.accountCode})`,
      referenceType: "invoice",
      referenceId: opts.invoiceId,
    });
  } else {
    // Asset loss: DR loss / CR AR.
    // Liab loss: DR loss / CR AP.
    lines.push({
      accountId: pnlSide.accountId,
      amount: abs,
      description: `Realised FX loss (${pnlSide.accountCode})`,
      referenceType: "invoice",
      referenceId: opts.invoiceId,
    });
    lines.push({
      accountId: customerSide.accountId,
      amount: -abs,
      description: `Realised FX loss on ${sideLabel} (${customerSide.accountCode})`,
      referenceType: "invoice",
      referenceId: opts.invoiceId,
    });
  }

  return { description: opts.description, lines };
}

// ─────────────────────────────────────────────────────────────────────
// DB driver
// ─────────────────────────────────────────────────────────────────────

export async function postRealizedFxJournal(opts: PostRealizedFxOpts): Promise<PostRealizedFxOutcome> {
  return withTransaction(async () => {
    const [invoice] = await rawQuery<{
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
    if (!invoice) {
      throw new Error(`postRealizedFxJournal: invoice ${opts.invoiceId} not found`);
    }

    // Idempotency: same (invoiceId, paymentDate, settlementRate)
    // triple has already been realised — skip cleanly.
    const [existing] = await rawQuery<{ journalEntryId: number; gainLoss: string }>(
      `SELECT "journalEntryId",
              "gainLoss"::text AS "gainLoss"
       FROM fx_realized_postings
       WHERE "companyId" = $1
         AND "invoiceId" = $2
         AND "paymentDate" = $3::date
         AND "settlementRate" = $4`,
      [opts.companyId, opts.invoiceId, opts.paymentDate, opts.settlementRate],
    );
    if (existing) {
      return {
        status: "skipped",
        journalEntryId: existing.journalEntryId,
        gainLoss: Number(existing.gainLoss),
        reason: "(invoice, paymentDate, settlementRate) already realised; reverse before reposting",
      };
    }

    const [company] = await rawQuery<{ functionalCurrency: string }>(
      `SELECT "functionalCurrency" FROM companies WHERE id = $1`,
      [opts.companyId],
    );
    const func = company?.functionalCurrency ?? "SAR";

    if (invoice.currency === func) {
      return {
        status: "noop",
        journalEntryId: null,
        gainLoss: 0,
        reason: "invoice currency matches functional — no FX exposure",
      };
    }

    const computed = computeRealizedFx({
      // C3 — settled FC amount, not the whole invoice. Falls back to
      // invoice.total only when the caller has not threaded paymentAmount.
      originalAmount: opts.paymentAmount != null ? Number(opts.paymentAmount) : Number(invoice.total),
      bookedRate: Number(invoice.bookedRate),
      settlementRate: opts.settlementRate,
      side: "asset", // AR invoice — see note below for AP path
    });

    if (computed.gainLoss === 0) {
      return { status: "noop", journalEntryId: null, gainLoss: 0, reason: "rates matched exactly" };
    }

    const [arAsset, apLiability, realizedGain, realizedLoss] = await Promise.all([
      getAccountForPurpose(opts.companyId, "fx_revaluation_ar", "debit"),
      getAccountForPurpose(opts.companyId, "fx_revaluation_ap", "credit"),
      getAccountForPurpose(opts.companyId, "realized_fx_gain", "credit"),
      getAccountForPurpose(opts.companyId, "realized_fx_loss", "debit"),
    ]);
    if (!arAsset || !apLiability || !realizedGain || !realizedLoss) {
      throw new Error(
        "postRealizedFxJournal: one or more realised-FX accounts could not be resolved " +
          "(check accounting_mappings + chart_of_accounts seed)",
      );
    }

    const description =
      opts.description ??
      `Realised FX on invoice ${opts.invoiceId} (${invoice.currency} → ${func} @ ${opts.settlementRate})`;

    const buildInput = buildRealizedFxEntryInput({
      description,
      side: "asset",
      gainLoss: computed.gainLoss,
      accounts: { arAsset, apLiability, realizedGain, realizedLoss },
      invoiceId: opts.invoiceId,
    });

    if (buildInput.lines.length === 0) {
      return { status: "noop", journalEntryId: null, gainLoss: 0, reason: "build produced no lines" };
    }

    const payload = buildEntry(buildInput);
    const ctx: EntryContext = {
      companyId: opts.companyId,
      createdBy: opts.postedBy,
      ref: `REAL-FX-${opts.invoiceId}-${opts.paymentDate}`,
      type: "fx_realised",
      sourceType: "invoice",
      sourceId: opts.invoiceId,
      date: opts.paymentDate,
      status: opts.asDraft ? "draft" : "posted",
    };
    const posted = await postJournalEntry(payload, ctx);

    // Record the realisation event for idempotency + audit. The
    // unique index on (companyId, invoiceId, paymentDate, settlementRate)
    // guards against a race where two transactions both pass the
    // pre-check above.
    await rawExecute(
      `INSERT INTO fx_realized_postings
         ("companyId", "invoiceId", "paymentDate", "settlementRate",
          "journalEntryId", "gainLoss", "postedBy")
       VALUES ($1, $2, $3::date, $4, $5, $6, $7)`,
      [
        opts.companyId,
        opts.invoiceId,
        opts.paymentDate,
        opts.settlementRate,
        posted.journalEntryId,
        computed.gainLoss,
        opts.postedBy ?? null,
      ],
    );

    logger.info(
      {
        invoiceId: opts.invoiceId,
        journalEntryId: posted.journalEntryId,
        gainLoss: computed.gainLoss,
        settlementRate: opts.settlementRate,
        status: posted.status,
      },
      "[fx-realised] journal entry posted",
    );

    return {
      status: posted.status,
      journalEntryId: posted.journalEntryId,
      gainLoss: computed.gainLoss,
    };
  });
}

function round2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}
