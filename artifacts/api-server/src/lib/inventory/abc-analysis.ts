/**
 * ABC analysis (Pareto / 80-15-5 classification).
 *
 * Classic inventory technique: rank products by their period value
 * (qty issued × unit cost), then split into three buckets:
 *
 *   A — top 80% of cumulative value
 *   B — next 15%
 *   C — bottom 5%
 *
 * The category names + thresholds are configurable per call so a
 * tenant with different operational priorities (e.g. 70/20/10)
 * can use the same classifier.
 *
 * Pure layer (`classifyAbc`):
 *   takes an array of (productId, periodValue) and returns the
 *   classification per product, sorted highest-value first.
 *   Stable on ties (same productId always lands in the same
 *   category for the same input). No DB, no time.
 *
 * DB driver (`runAbcAnalysis`):
 *   walks every active company, computes the prior-period value
 *   from `invoice_lines` × `unit_price`, calls the pure layer,
 *   and upserts into `product_abc_classification`. Idempotent
 *   on (companyId, productId, period).
 */
import { rawQuery, rawExecute } from "../rawdb.js";
import { logger } from "../logger.js";
import { todayISO } from "../businessHelpers.js";

export interface AbcInput {
  productId: number;
  /** Period value in functional currency: qty × unit cost. */
  periodValue: number;
}

export interface AbcLine {
  productId: number;
  periodValue: number;
  /** Per-product share of total value (0.0000 — 1.0000). */
  paretoShare: number;
  /** Cumulative share up to and INCLUDING this product. */
  cumulativeShare: number;
  category: "A" | "B" | "C";
}

export interface AbcThresholds {
  /** Cumulative share boundary between A and B. Default 0.80. */
  a: number;
  /** Cumulative share boundary between B and C. Default 0.95. */
  b: number;
}

export const DEFAULT_ABC_THRESHOLDS: AbcThresholds = { a: 0.80, b: 0.95 };

/**
 * Pure: classify products by Pareto cumulative share. Returns the
 * lines sorted DESCENDING by periodValue, with the cumulative share
 * up to + including each row. The classifier is deterministic for
 * the same input — if two products tie on value, the lower
 * productId wins the higher rank.
 */
export function classifyAbc(
  inputs: AbcInput[],
  thresholds: AbcThresholds = DEFAULT_ABC_THRESHOLDS,
): AbcLine[] {
  if (thresholds.a <= 0 || thresholds.a >= thresholds.b || thresholds.b >= 1) {
    throw new Error(
      `ABC: invalid thresholds {a: ${thresholds.a}, b: ${thresholds.b}}; need 0 < a < b < 1`,
    );
  }
  for (const r of inputs) {
    if (!Number.isFinite(r.periodValue) || r.periodValue < 0) {
      throw new Error(
        `ABC: periodValue must be a non-negative finite number, got ${r.periodValue} for productId=${r.productId}`,
      );
    }
  }

  if (inputs.length === 0) return [];

  // Sort highest value first; ties broken by ascending productId so
  // the same input always produces the same output.
  const sorted = [...inputs].sort((a, b) => {
    if (a.periodValue !== b.periodValue) return b.periodValue - a.periodValue;
    return a.productId - b.productId;
  });

  const total = sorted.reduce((sum, r) => sum + r.periodValue, 0);

  if (total === 0) {
    // Every item has zero value — classify them all as C (the
    // dashboard treats this as "no signal"; no item is bucketed
    // into A or B without value contribution).
    return sorted.map((r) => ({
      productId: r.productId,
      periodValue: r.periodValue,
      paretoShare: 0,
      cumulativeShare: 0,
      category: "C" as const,
    }));
  }

  const out: AbcLine[] = [];
  let cumulative = 0;
  for (const r of sorted) {
    const share = r.periodValue / total;
    cumulative += share;
    let category: "A" | "B" | "C";
    // Use cumulative-after-this-row to decide. A row's category is
    // based on where its CONTRIBUTION sits in the running total.
    // Tolerance of 1e-9 absorbs IEEE-754 drift from accumulating
    // many shares (Number.EPSILON ≈ 2.2e-16 is too tight at scale —
    // 20 × 0.04 lands at ~0.8 + 4e-16 which overshoots).
    const TOL = 1e-9;
    if (cumulative <= thresholds.a + TOL) category = "A";
    else if (cumulative <= thresholds.b + TOL) category = "B";
    else category = "C";

    out.push({
      productId: r.productId,
      periodValue: r.periodValue,
      paretoShare: round4dp(share),
      cumulativeShare: round4dp(cumulative),
      category,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────
// DB driver — monthly cron handler
// ─────────────────────────────────────────────────────────────────────

export interface AbcRunOutcome {
  scanned: number;
  written: number;
  errors: string[];
}

export async function runAbcAnalysis(asOfDate?: string): Promise<AbcRunOutcome> {
  const today = asOfDate ?? todayISO();
  const period = today.slice(0, 7); // YYYY-MM
  const out: AbcRunOutcome = { scanned: 0, written: 0, errors: [] };

  const companies = await rawQuery<{ id: number }>(
    `SELECT id FROM companies WHERE status = 'active' AND "deletedAt" IS NULL`,
  );
  out.scanned = companies.length;

  for (const company of companies) {
    try {
      // Pull per-product value for the period from invoice lines.
      // The query uses invoice_lines as the canonical sales source
      // so the analysis reflects what the customer actually bought.
      const inputs = await rawQuery<{ productId: number; periodValue: string }>(
        `SELECT il."productId" AS "productId",
                COALESCE(SUM(il.quantity * il."unitPrice"), 0)::text AS "periodValue"
         FROM invoice_lines il
         JOIN invoices i ON i.id = il."invoiceId"
         WHERE i."companyId" = $1
           AND i."deletedAt" IS NULL
           AND il."productId" IS NOT NULL
           AND TO_CHAR(i."createdAt", 'YYYY-MM') = $2
         GROUP BY il."productId"`,
        [company.id, period],
      );

      const lines = classifyAbc(
        inputs.map((r) => ({ productId: r.productId, periodValue: Number(r.periodValue) })),
      );

      for (const line of lines) {
        await rawExecute(
          `INSERT INTO product_abc_classification
             ("companyId", "productId", period, category,
              "paretoShare", "paretoValue", "reviewedAt")
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT ("companyId", "productId", period) DO UPDATE
             SET category      = EXCLUDED.category,
                 "paretoShare" = EXCLUDED."paretoShare",
                 "paretoValue" = EXCLUDED."paretoValue",
                 "reviewedAt"  = NOW()`,
          [
            company.id, line.productId, period, line.category,
            line.paretoShare, line.periodValue,
          ],
        );
        out.written += 1;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push(`company=${company.id}: ${msg}`);
      logger.error({ companyId: company.id, err: msg }, "[abc-analysis] failed");
    }
  }

  return out;
}

/** Cron-compatible wrapper: returns one-line summary for cron_logs. */
export async function abcMonthlyClassificationCron(): Promise<string> {
  const out = await runAbcAnalysis();
  if (out.scanned === 0) return "no active companies";
  return `scanned=${out.scanned} written=${out.written} errors=${out.errors.length}`;
}

function round4dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 10000 + Number.EPSILON) / 10000;
}
