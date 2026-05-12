/**
 * Cycle-count workflow helpers.
 *
 * Pure layer (`computeVarianceLines`, `nextCycleCountStatus`):
 *   pure math + state-machine for the cycle-count header / lines.
 *
 * DB driver (`scheduleCycleCount`, `recordCount`, `submitForReview`,
 * `approveCycleCount`):
 *   thin wrappers around the table writes that go through
 *   withTransaction so a half-applied count doesn't leave the
 *   header in an inconsistent state.
 *
 * The 4-eye control is enforced at the FSM level — `approvedBy`
 * MUST differ from `countedBy` and `reviewedBy`. This is checked
 * in `assertApprovalEligible` before the DB write fires.
 *
 * Variance posting (the journal entry recording the
 * gain/loss against the inventory account) hooks into
 * lib/gl/journal-poster from #224 in a follow-up integration PR.
 * Today the workflow records the variance + variance value in
 * `warehouse_cycle_count_lines` and leaves
 * `adjustmentJournalEntryId` NULL.
 */
import { rawQuery, rawExecute, withTransaction } from "../rawdb.js";
import { logger } from "../logger.js";
import type { CycleCountStatus } from "./types.js";

export interface VarianceInput {
  productId: number;
  lotId: number | null;
  systemQuantity: number;
  countedQuantity: number;
  /** Unit cost the variance is valued at (from valuation_settings). */
  unitCost: number;
}

export interface VarianceLine {
  productId: number;
  lotId: number | null;
  systemQuantity: number;
  countedQuantity: number;
  /** Counted - System. Negative = shrinkage (loss). Positive = overage (gain). */
  variance: number;
  /** variance × unitCost, rounded to 2dp. */
  varianceValue: number;
}

/**
 * Pure: compute the variance + variance value for each input row.
 * Skips lines where counted equals system (no variance to post).
 *
 * Negative variance is shrinkage (likely shrink, theft, or recount
 * error). Positive variance is overage (under-recorded receipt).
 * Both values flow to the same line set; the sign tells the
 * downstream poster whether to debit the adjustment-loss or
 * credit the adjustment-gain account.
 */
export function computeVarianceLines(inputs: VarianceInput[]): VarianceLine[] {
  const out: VarianceLine[] = [];
  for (const r of inputs) {
    if (!Number.isFinite(r.systemQuantity) || !Number.isFinite(r.countedQuantity)) {
      throw new Error(
        `cycle-count: quantities must be finite, got system=${r.systemQuantity} counted=${r.countedQuantity}`,
      );
    }
    if (!Number.isFinite(r.unitCost) || r.unitCost < 0) {
      throw new Error(`cycle-count: unitCost must be a non-negative finite number, got ${r.unitCost}`);
    }
    const variance = r.countedQuantity - r.systemQuantity;
    if (variance === 0) continue; // exact match, no row needed
    const varianceValue = round2dp(variance * r.unitCost);
    out.push({
      productId: r.productId,
      lotId: r.lotId,
      systemQuantity: r.systemQuantity,
      countedQuantity: r.countedQuantity,
      variance,
      varianceValue,
    });
  }
  return out;
}

/**
 * Aggregate the variance set into total positive (gains) +
 * total negative (losses). Used to render the cycle-count
 * dashboard summary without re-querying.
 */
export function summariseVariance(lines: VarianceLine[]): {
  totalGainValue: number;
  totalLossValue: number;
  netValue: number;
} {
  let gain = 0;
  let loss = 0;
  for (const l of lines) {
    if (l.varianceValue >= 0) gain += l.varianceValue;
    else loss += Math.abs(l.varianceValue);
  }
  gain = round2dp(gain);
  loss = round2dp(loss);
  return { totalGainValue: gain, totalLossValue: loss, netValue: round2dp(gain - loss) };
}

// ─────────────────────────────────────────────────────────────────────
// Cycle count state machine
// ─────────────────────────────────────────────────────────────────────

const STATUS_TRANSITIONS: Record<CycleCountStatus, readonly CycleCountStatus[]> = {
  pending:     ["in_progress", "rejected"],
  in_progress: ["reviewed",    "rejected"],
  reviewed:    ["approved",    "rejected"],
  approved:    [], // terminal
  rejected:    [], // terminal
};

export class IllegalCycleCountTransitionError extends Error {
  constructor(from: CycleCountStatus, to: CycleCountStatus) {
    super(`Illegal cycle-count transition: ${from} → ${to}`);
    this.name = "IllegalCycleCountTransitionError";
  }
}

export function nextCycleCountStatus(
  from: CycleCountStatus,
  to: CycleCountStatus,
): CycleCountStatus {
  if (from === to) return to;
  const allowed = STATUS_TRANSITIONS[from];
  if (!allowed.includes(to)) throw new IllegalCycleCountTransitionError(from, to);
  return to;
}

/**
 * Pure: 4-eye control check. Approver MUST differ from the counter
 * AND the reviewer. Throws so the DB driver never persists an
 * approval that violates the control.
 */
export function assertApprovalEligible(opts: {
  countedBy: number | null;
  reviewedBy: number | null;
  approverId: number;
}): void {
  if (opts.approverId === opts.countedBy) {
    throw new Error("4-eye control: approver cannot be the same person as the counter");
  }
  if (opts.approverId === opts.reviewedBy) {
    throw new Error("4-eye control: approver cannot be the same person as the reviewer");
  }
}

// ─────────────────────────────────────────────────────────────────────
// DB driver — schedule, count, review, approve
// ─────────────────────────────────────────────────────────────────────

export interface ScheduleCycleCountInput {
  companyId: number;
  warehouseId: number;
  scheduledDate: string;
  notes?: string;
}

export async function scheduleCycleCount(input: ScheduleCycleCountInput): Promise<{ cycleCountId: number }> {
  const rows = await rawQuery<{ id: number }>(
    `INSERT INTO warehouse_cycle_counts
       ("companyId", "warehouseId", "scheduledDate", status, notes)
     VALUES ($1, $2, $3::date, 'pending', $4)
     RETURNING id`,
    [input.companyId, input.warehouseId, input.scheduledDate, input.notes ?? null],
  );
  return { cycleCountId: rows[0].id };
}

/**
 * Apply variance lines to a cycle count and transition to
 * `in_progress`. Each call replaces any prior lines for the same
 * cycle so the operator can re-submit before review.
 */
export async function recordCount(opts: {
  cycleCountId: number;
  companyId: number;
  countedBy: number;
  inputs: VarianceInput[];
}): Promise<{ lineCount: number; net: number }> {
  return withTransaction(async () => {
    const [header] = await rawQuery<{ status: CycleCountStatus }>(
      `SELECT status FROM warehouse_cycle_counts
       WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
      [opts.cycleCountId, opts.companyId],
    );
    if (!header) throw new Error(`cycle-count: header ${opts.cycleCountId} not found`);

    nextCycleCountStatus(header.status, "in_progress");

    const lines = computeVarianceLines(opts.inputs);
    const summary = summariseVariance(lines);

    // Replace any prior lines (operator re-submission) — the
    // workflow only cares about the most recent count until
    // review is recorded.
    await rawExecute(
      `DELETE FROM warehouse_cycle_count_lines WHERE "cycleCountId" = $1`,
      [opts.cycleCountId],
    );
    for (const line of lines) {
      await rawExecute(
        `INSERT INTO warehouse_cycle_count_lines
           ("cycleCountId", "productId", "lotId",
            "systemQuantity", "countedQuantity", "varianceValue")
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          opts.cycleCountId, line.productId, line.lotId,
          line.systemQuantity, line.countedQuantity, line.varianceValue,
        ],
      );
    }

    await rawExecute(
      `UPDATE warehouse_cycle_counts
         SET status = 'in_progress',
             "countedBy" = $1, "countedAt" = NOW(),
             "updatedAt" = NOW()
       WHERE id = $2 AND "companyId" = $3`,
      [opts.countedBy, opts.cycleCountId, opts.companyId],
    );

    logger.info(
      { cycleCountId: opts.cycleCountId, lineCount: lines.length, net: summary.netValue },
      "[cycle-count] count recorded",
    );

    return { lineCount: lines.length, net: summary.netValue };
  });
}

export async function submitForReview(opts: {
  cycleCountId: number;
  companyId: number;
  reviewerId: number;
}): Promise<void> {
  return withTransaction(async () => {
    const [header] = await rawQuery<{ status: CycleCountStatus; countedBy: number | null }>(
      `SELECT status, "countedBy" FROM warehouse_cycle_counts
       WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
      [opts.cycleCountId, opts.companyId],
    );
    if (!header) throw new Error(`cycle-count: header ${opts.cycleCountId} not found`);
    if (opts.reviewerId === header.countedBy) {
      throw new Error("cycle-count: reviewer cannot be the same person as the counter");
    }

    nextCycleCountStatus(header.status, "reviewed");

    await rawExecute(
      `UPDATE warehouse_cycle_counts
         SET status = 'reviewed', "reviewedBy" = $1, "reviewedAt" = NOW(),
             "updatedAt" = NOW()
       WHERE id = $2 AND "companyId" = $3`,
      [opts.reviewerId, opts.cycleCountId, opts.companyId],
    );
  });
}

export async function approveCycleCount(opts: {
  cycleCountId: number;
  companyId: number;
  approverId: number;
}): Promise<void> {
  return withTransaction(async () => {
    const [header] = await rawQuery<{
      status: CycleCountStatus;
      countedBy: number | null;
      reviewedBy: number | null;
    }>(
      `SELECT status, "countedBy", "reviewedBy" FROM warehouse_cycle_counts
       WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
      [opts.cycleCountId, opts.companyId],
    );
    if (!header) throw new Error(`cycle-count: header ${opts.cycleCountId} not found`);

    assertApprovalEligible({
      countedBy: header.countedBy,
      reviewedBy: header.reviewedBy,
      approverId: opts.approverId,
    });
    nextCycleCountStatus(header.status, "approved");

    await rawExecute(
      `UPDATE warehouse_cycle_counts
         SET status = 'approved', "approvedBy" = $1, "approvedAt" = NOW(),
             "updatedAt" = NOW()
       WHERE id = $2 AND "companyId" = $3`,
      [opts.approverId, opts.cycleCountId, opts.companyId],
    );

    logger.info(
      { cycleCountId: opts.cycleCountId, approver: opts.approverId },
      "[cycle-count] approved (journal posting deferred to gl wiring PR)",
    );
  });
}

function round2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}
