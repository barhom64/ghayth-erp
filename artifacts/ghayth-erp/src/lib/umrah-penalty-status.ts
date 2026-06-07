// Canonical Arabic labels for umrah-penalty lifecycle states. Mirrors
// the `umrah_penalty` block in `STATUS_MAP` (page-status-badge.tsx) for
// the penalty-specific states, plus `pending` / `cancelled` which live
// in `shared`. Same rule as `umrah-pilgrim-status.ts`: the badge is the
// visual canonical, this list is the textual canonical, and they agree
// by construction.
//
// Penalty labels are feminine ("معلقة" / "مفوترة" / ...) because
// "الغرامة" is feminine in Arabic — kept separate from pilgrim labels
// which are masculine ("معلق" → "لم يصل" for the pilgrim arrival
// semantic).

export interface UmrahPenaltyStatusOption {
  value: string;
  label: string;
}

export const UMRAH_PENALTY_STATUS_OPTIONS: readonly UmrahPenaltyStatusOption[] = [
  { value: "pending",   label: "معلقة" },
  { value: "invoiced",  label: "مفوترة" },
  { value: "paid",      label: "مدفوعة" },
  { value: "waived",    label: "معفاة" },
  { value: "cancelled", label: "ملغية" },
];

/**
 * Look up the Arabic label for a raw penalty lifecycle status.
 * Nullish input renders as "—"; unknown values fall through to the raw
 * string (forward-compat with future backend states).
 */
export function umrahPenaltyStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  const hit = UMRAH_PENALTY_STATUS_OPTIONS.find((o) => o.value === status);
  return hit?.label ?? status;
}
