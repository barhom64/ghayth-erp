/**
 * Lot lifecycle finite-state machine.
 *
 * Allowed transitions for a `warehouse_stock_lots.status` row:
 *
 *   active     → quarantine | recalled | expired | disposed
 *   quarantine → active     | rejected → disposed | recalled
 *   recalled   → disposed
 *   expired    → disposed
 *   disposed   → (terminal)
 *   rejected   → disposed
 *
 * (`rejected` is a quality-control end state — the lot fails QC and
 * goes straight to disposed.)
 *
 * Pure: no DB. The DB driver in `lots.ts` reads + writes; this
 * module just decides whether a transition is legal and what the
 * follow-on flags should look like (qualityControlStatus, recall
 * audit fields, etc).
 */
import type {
  LotStatus,
  QualityControlStatus,
} from "./types.js";

/** Per-status, the allowed next states. Closed table — adding a
 *  state is a deliberate code change. */
const TRANSITIONS: Record<LotStatus, readonly LotStatus[]> = {
  active:     ["quarantine", "recalled", "expired", "disposed"],
  quarantine: ["active",     "recalled", "disposed"],
  recalled:   ["disposed"],
  expired:    ["disposed"],
  disposed:   [], // terminal
};

export class IllegalLotTransitionError extends Error {
  constructor(from: LotStatus, to: LotStatus) {
    super(`Illegal lot transition: ${from} → ${to}`);
    this.name = "IllegalLotTransitionError";
  }
}

/**
 * Throw if (from → to) isn't on the allowed-transitions list. Used
 * by every DB driver function to fail fast before it issues an
 * UPDATE that would corrupt the audit trail.
 */
export function assertLotTransition(from: LotStatus, to: LotStatus): void {
  if (from === to) return; // no-op transitions are always fine
  const allowed = TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new IllegalLotTransitionError(from, to);
  }
}

/**
 * Pure: given the QC outcome on a quarantined lot, return the next
 * status. Approve → active; reject → disposed (rejected is the
 * quality-control terminal status that gets immediately disposed).
 */
export function nextStatusAfterQc(
  current: LotStatus,
  outcome: "approve" | "reject",
): { status: LotStatus; qualityControlStatus: QualityControlStatus } {
  if (current !== "quarantine" && current !== "active") {
    throw new IllegalLotTransitionError(current, outcome === "approve" ? "active" : "disposed");
  }
  if (outcome === "approve") {
    return { status: "active", qualityControlStatus: "approved" };
  }
  return { status: "disposed", qualityControlStatus: "rejected" };
}

/**
 * Pure: given today's date and the lot's expiryDate, decide whether
 * the lot is past its sell-by and should be transitioned to
 * `expired` automatically. Lots with no expiry date are excluded.
 */
export function shouldExpire(opts: {
  status: LotStatus;
  expiryDate: string | null | undefined;
  asOfDate: string;
}): boolean {
  if (opts.status !== "active" && opts.status !== "quarantine") return false;
  if (!opts.expiryDate) return false;
  return opts.expiryDate <= opts.asOfDate;
}
