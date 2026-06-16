// Canonical Arabic labels for the umrah refund-request workflow states.
// Mirrors REFUND_STATUSES / REFUND_TRANSITIONS in the backend state
// machine (api-server src/lib/umrahRefundWorkflow.ts) — same convention
// as umrah-penalty-status.ts: this list is the textual canonical the
// list page, filters and CSV export all share.
//
//   requested → approved | rejected | cancelled
//   approved  → paid     | cancelled
//   paid      → closed
//   rejected / cancelled / closed → terminal

export interface UmrahRefundStatusOption {
  value: string;
  label: string;
}

export const UMRAH_REFUND_STATUS_OPTIONS: readonly UmrahRefundStatusOption[] = [
  { value: "requested", label: "مقدَّم" },
  { value: "approved",  label: "موافَق عليه" },
  { value: "rejected",  label: "مرفوض" },
  { value: "paid",      label: "مدفوع" },
  { value: "closed",    label: "مغلق" },
  { value: "cancelled", label: "ملغى" },
];

/** Frontend mirror of the backend transition table — drives which
 *  action buttons render per row. The backend re-validates on every
 *  POST (canTransition), so this is a UX courtesy, not the gate. */
export const UMRAH_REFUND_NEXT: Record<string, readonly string[]> = {
  requested: ["approved", "rejected", "cancelled"],
  approved:  ["paid", "cancelled"],
  paid:      ["closed"],
  rejected:  [],
  closed:    [],
  cancelled: [],
};

export function umrahRefundStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const hit = UMRAH_REFUND_STATUS_OPTIONS.find((o) => o.value === status);
  return hit?.label ?? status;
}

/** Badge tone per state — warm while money is still in motion, calm
 *  green once paid, muted for terminals. */
export const UMRAH_REFUND_STATUS_TONE: Record<string, string> = {
  requested: "bg-status-warning-surface text-status-warning-foreground border-yellow-300",
  approved:  "bg-status-info-surface text-status-info-foreground border-blue-300",
  paid:      "bg-emerald-100 text-emerald-700 border-emerald-300",
  closed:    "bg-slate-100 text-slate-600 border-slate-300",
  rejected:  "bg-status-error-surface text-status-error-foreground border-red-300",
  cancelled: "bg-slate-100 text-slate-500 border-slate-300",
};
