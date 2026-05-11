/**
 * WPS run orchestrator.
 *
 * Connects the pieces that landed in earlier weeks:
 *   week-1: WPS file builder (generic + per-bank adapters via #248)
 *   week-1: ack parser
 *   week-2: payroll-source aggregation (operator UI later)
 *
 * Workflow:
 *   1. createWpsRun(...)         → row in wps_runs with status='draft'
 *   2. buildAndPersist(runId)    → reads the payroll source, calls
 *                                   buildWpsFile, writes fileBytes +
 *                                   wps_run_lines, totals.
 *   3. submitWpsRun(runId)       → status='draft' → 'submitted'
 *                                   (records submittedAt + submittedBy).
 *                                   Operator then downloads + uploads
 *                                   to the bank manually OR via the
 *                                   bank's API.
 *   4. applyAck(runId, ackText)  → parses the bank ack, matches lines
 *                                   by (iqamaOrId, iban), updates
 *                                   per-line status + bankRefNumber,
 *                                   transitions header status based
 *                                   on aggregate outcome.
 *
 * All four functions wrap their writes in `withTransaction` so a
 * half-applied run rolls back. The state machine (`assertWpsTransition`)
 * is enforced before each DB write.
 */
import { rawQuery, rawExecute, withTransaction } from "../../rawdb.js";
import { logger } from "../../logger.js";
import { buildWpsFile } from "./builder.js";
import { parseAckFile } from "./parser.js";
import type {
  WpsRunStatus,
  WpsLineStatus,
  WpsPayrollEntry,
  WpsFormat,
} from "../types.js";

// ─────────────────────────────────────────────────────────────────────
// FSM
// ─────────────────────────────────────────────────────────────────────

const WPS_TRANSITIONS: Record<WpsRunStatus, readonly WpsRunStatus[]> = {
  draft:        ["submitted", "rejected"],
  submitted:    ["acknowledged", "partial", "rejected"],
  acknowledged: [], // terminal (success)
  partial:      ["acknowledged", "rejected"], // operator can resolve partial
  rejected:     [], // terminal (failure)
};

export class IllegalWpsTransitionError extends Error {
  constructor(from: WpsRunStatus, to: WpsRunStatus) {
    super(`Illegal WPS run transition: ${from} → ${to}`);
    this.name = "IllegalWpsTransitionError";
  }
}

export function assertWpsTransition(from: WpsRunStatus, to: WpsRunStatus): void {
  if (from === to) return;
  const allowed = WPS_TRANSITIONS[from];
  if (!allowed.includes(to)) throw new IllegalWpsTransitionError(from, to);
}

// ─────────────────────────────────────────────────────────────────────
// Aggregate outcome from per-line statuses
// ─────────────────────────────────────────────────────────────────────

export interface AckOutcome {
  paid: number;
  failed: number;
  held: number;
  rejected: number;
  /** unmatched bank-side rows (iqamaOrId/iban not in our run) — surfaced
   *  for the operator to investigate. */
  unmatched: number;
}

/**
 * Pure: pick the header status from per-line counts.
 *   all paid          → acknowledged
 *   all rejected      → rejected
 *   mixed paid + fail → partial
 *   no resolved rows  → submitted (no change)
 */
export function deriveHeaderStatus(prior: WpsRunStatus, outcome: AckOutcome): WpsRunStatus {
  const resolved = outcome.paid + outcome.failed + outcome.held + outcome.rejected;
  if (resolved === 0) return prior; // ack was empty / nothing matched
  const allPaid = outcome.paid > 0 && outcome.failed === 0 && outcome.rejected === 0 && outcome.held === 0;
  const allBad = outcome.paid === 0 && (outcome.failed > 0 || outcome.rejected > 0);
  if (allPaid) return "acknowledged";
  if (allBad) return "rejected";
  return "partial";
}

// ─────────────────────────────────────────────────────────────────────
// 1. Create a run header
// ─────────────────────────────────────────────────────────────────────

export interface CreateWpsRunInput {
  companyId: number;
  period: string;     // YYYY-MM
  bankCode: string;   // matches wps_runs.bankCode + ADAPTERS key
  fileName?: string;
}

export async function createWpsRun(input: CreateWpsRunInput): Promise<{ wpsRunId: number }> {
  const rows = await rawQuery<{ id: number }>(
    `INSERT INTO wps_runs ("companyId", period, "bankCode", "fileName", status)
     VALUES ($1, $2, $3, $4, 'draft')
     ON CONFLICT ("companyId", period, "bankCode") DO UPDATE
       SET status = 'draft', "updatedAt" = NOW()
     RETURNING id`,
    [
      input.companyId,
      input.period,
      input.bankCode,
      input.fileName ?? `WPS_${input.companyId}_${input.period}.csv`,
    ],
  );
  return { wpsRunId: rows[0].id };
}

// ─────────────────────────────────────────────────────────────────────
// 2. Build the file body + persist lines
// ─────────────────────────────────────────────────────────────────────

export interface BuildAndPersistInput {
  wpsRunId: number;
  companyId: number;
  entries: WpsPayrollEntry[];
  format?: WpsFormat;
  /** Optional override for the company info that goes in the header. */
  vatNumber?: string;
  crNumber?: string;
  companyIban?: string;
}

export interface BuildAndPersistOutcome {
  recordCount: number;
  totalAmount: number;
}

export async function buildAndPersist(input: BuildAndPersistInput): Promise<BuildAndPersistOutcome> {
  return withTransaction(async () => {
    // Lock the header row + validate it's still in draft.
    const [run] = await rawQuery<{
      status: WpsRunStatus;
      bankCode: string;
      period: string;
    }>(
      `SELECT status, "bankCode", period FROM wps_runs
       WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
      [input.wpsRunId, input.companyId],
    );
    if (!run) throw new Error(`WPS run ${input.wpsRunId} not found`);
    if (run.status !== "draft") {
      throw new Error(`WPS run ${input.wpsRunId} is ${run.status}; can only build on 'draft'`);
    }

    const result = buildWpsFile({
      summary: {
        companyId: input.companyId,
        period: run.period,
        bankCode: run.bankCode,
        vatNumber: input.vatNumber,
        crNumber: input.crNumber,
        companyIban: input.companyIban,
      },
      entries: input.entries,
      format: input.format,
    });

    await rawExecute(
      `UPDATE wps_runs
         SET "fileBytes" = $1, "totalAmount" = $2, "recordCount" = $3,
             "updatedAt" = NOW()
       WHERE id = $4`,
      [result.fileBytes, result.totalAmount, result.recordCount, input.wpsRunId],
    );

    // Replace any prior lines (operator re-built before submitting).
    await rawExecute(`DELETE FROM wps_run_lines WHERE "wpsRunId" = $1`, [input.wpsRunId]);
    for (const e of input.entries) {
      await rawExecute(
        `INSERT INTO wps_run_lines (
           "wpsRunId", "employeeId", "iqamaOrId", iban, amount,
           "basicSalary", "housingAllowance", "otherAllowances",
           deductions, remark
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          input.wpsRunId, e.employeeId, e.iqamaOrId, e.iban, e.amount,
          e.basicSalary, e.housingAllowance, e.otherAllowances,
          e.deductions, e.remark ?? null,
        ],
      );
    }

    logger.info(
      { wpsRunId: input.wpsRunId, recordCount: result.recordCount, totalAmount: result.totalAmount },
      "[wps] run built + persisted",
    );
    return { recordCount: result.recordCount, totalAmount: result.totalAmount };
  });
}

// ─────────────────────────────────────────────────────────────────────
// 3. Submit (operator presses "submit" after downloading)
// ─────────────────────────────────────────────────────────────────────

export async function submitWpsRun(opts: {
  wpsRunId: number;
  companyId: number;
  submittedBy: number;
}): Promise<void> {
  return withTransaction(async () => {
    const [run] = await rawQuery<{ status: WpsRunStatus; recordCount: number }>(
      `SELECT status, "recordCount" FROM wps_runs
       WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
      [opts.wpsRunId, opts.companyId],
    );
    if (!run) throw new Error(`WPS run ${opts.wpsRunId} not found`);
    if (run.recordCount === 0) {
      throw new Error(`WPS run ${opts.wpsRunId} has no records; cannot submit`);
    }
    assertWpsTransition(run.status, "submitted");

    await rawExecute(
      `UPDATE wps_runs
         SET status = 'submitted', "submittedBy" = $1, "submittedAt" = NOW(),
             "updatedAt" = NOW()
       WHERE id = $2`,
      [opts.submittedBy, opts.wpsRunId],
    );
  });
}

// ─────────────────────────────────────────────────────────────────────
// 4. Apply ack
// ─────────────────────────────────────────────────────────────────────

export interface ApplyAckOutcome extends AckOutcome {
  finalStatus: WpsRunStatus;
}

export async function applyAck(opts: {
  wpsRunId: number;
  companyId: number;
  ackText: string;
}): Promise<ApplyAckOutcome> {
  return withTransaction(async () => {
    const [run] = await rawQuery<{ status: WpsRunStatus }>(
      `SELECT status FROM wps_runs
       WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
      [opts.wpsRunId, opts.companyId],
    );
    if (!run) throw new Error(`WPS run ${opts.wpsRunId} not found`);
    if (run.status !== "submitted" && run.status !== "partial") {
      throw new Error(`WPS run ${opts.wpsRunId} is ${run.status}; ack only valid on 'submitted' / 'partial'`);
    }

    const parsed = parseAckFile(opts.ackText);

    // Load the run's lines into a (iqamaOrId, iban) → id map so we
    // can match the ack rows.
    const lines = await rawQuery<{ id: number; iqamaOrId: string; iban: string }>(
      `SELECT id, "iqamaOrId", iban FROM wps_run_lines WHERE "wpsRunId" = $1`,
      [opts.wpsRunId],
    );
    const lineMap = new Map<string, number>();
    for (const l of lines) lineMap.set(`${l.iqamaOrId}|${l.iban.toUpperCase()}`, l.id);

    const outcome: AckOutcome = { paid: 0, failed: 0, held: 0, rejected: 0, unmatched: 0 };

    for (const ackLine of parsed.lines) {
      const key = `${ackLine.iqamaOrId}|${ackLine.iban.toUpperCase()}`;
      const lineId = lineMap.get(key);
      if (lineId === undefined) {
        outcome.unmatched += 1;
        continue;
      }
      await rawExecute(
        `UPDATE wps_run_lines
           SET status = $1, "bankRefNumber" = $2, "errorMessage" = $3
         WHERE id = $4`,
        [ackLine.status, ackLine.bankRefNumber, ackLine.errorMessage, lineId],
      );
      countOutcome(outcome, ackLine.status);
    }

    const newStatus = deriveHeaderStatus(run.status, outcome);
    if (newStatus !== run.status) {
      assertWpsTransition(run.status, newStatus);
      await rawExecute(
        `UPDATE wps_runs
           SET status = $1, "acknowledgedAt" = NOW(),
               "ackFileBytes" = $2, "updatedAt" = NOW()
         WHERE id = $3`,
        [newStatus, opts.ackText.slice(0, 50_000), opts.wpsRunId],
      );
    }

    logger.info(
      { wpsRunId: opts.wpsRunId, ...outcome, finalStatus: newStatus },
      "[wps] ack applied",
    );

    return { ...outcome, finalStatus: newStatus };
  });
}

function countOutcome(out: AckOutcome, status: WpsLineStatus): void {
  if (status === "paid") out.paid += 1;
  else if (status === "failed") out.failed += 1;
  else if (status === "held") out.held += 1;
  else if (status === "rejected") out.rejected += 1;
}
