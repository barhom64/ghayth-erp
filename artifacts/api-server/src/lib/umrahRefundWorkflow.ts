// Umrah refund workflow state machine (#7 of the maturity gap report).
//
// A refund follows a multi-step approval cycle because money flows
// between treasury and either the pilgrim or the agent (or both):
//
//   requested  → approved | rejected | cancelled
//   approved   → paid     | cancelled
//   paid       → closed
//   rejected   → terminal
//   cancelled  → terminal
//   closed     → terminal
//
// `requested` is the initial state when the operator files the
// request. Only an authorised approver can flip to `approved`; only
// the finance side can flip to `paid` (with a treasury + reference);
// `closed` is the audit-final state once the credit memo is recorded.

export const REFUND_STATUSES = [
  "requested", "approved", "rejected", "paid", "closed", "cancelled",
] as const;

export type RefundStatus = typeof REFUND_STATUSES[number];

export const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved:  ["paid", "cancelled"],
  rejected:  [],
  paid:      ["closed"],
  closed:    [],
  cancelled: [],
};

export const REFUND_STATUS_LABELS_AR: Record<RefundStatus, string> = {
  requested: "مقدّم",
  approved:  "موافَق عليه",
  rejected:  "مرفوض",
  paid:      "مدفوع",
  closed:    "مُغلق",
  cancelled: "ملغى",
};

export function canTransition(from: string, to: string): boolean {
  if (!REFUND_STATUSES.includes(from as RefundStatus)) return false;
  if (!REFUND_STATUSES.includes(to as RefundStatus)) return false;
  return REFUND_TRANSITIONS[from as RefundStatus].includes(to as RefundStatus);
}
