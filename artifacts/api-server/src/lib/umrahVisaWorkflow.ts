// Umrah visa application state machine (#6 of the maturity gap report).
//
// The existing schema captures the VISA (number + expiry); this module
// captures the APPLICATION leading up to issuance. The transitions
// mirror what the operations team negotiates with MOFA: submit →
// review → approve → issue → deliver, with rejection/cancellation as
// terminal exits.
//
// The machine is intentionally text-only here — the actual UPDATE
// happens in `routes/umrah.ts` PATCH /pilgrims/:id (this module is
// imported there). Centralising the allowed-transitions table lets a
// future state-history audit table key off the same definitions
// without circular imports.

export const VISA_STATUSES = [
  "not_requested",  // operator hasn't asked yet
  "requested",      // application submitted to MOFA
  "under_review",   // MOFA processing
  "approved",       // MOFA approved (visa not yet assigned a number)
  "issued",         // visa number assigned (visaNumber populated)
  "delivered",      // physical/digital handover complete
  "rejected",       // MOFA rejected (terminal — needs new request)
  "cancelled",      // operator cancelled the application
] as const;

export type VisaStatus = typeof VISA_STATUSES[number];

/**
 * Allowed forward transitions. A → B means PATCH from A to B is
 * accepted; everything else is rejected with `ValidationError`.
 *
 * Terminal states (`delivered`, `rejected`, `cancelled`) intentionally
 * allow no outgoing transitions — re-doing a delivered visa requires
 * either a new pilgrim record (typical) or a corrective action that
 * resets to `not_requested` (rare, audit-trailed).
 */
export const VISA_TRANSITIONS: Record<VisaStatus, readonly VisaStatus[]> = {
  not_requested: ["requested", "cancelled"],
  requested:     ["under_review", "approved", "rejected", "cancelled"],
  under_review:  ["approved", "rejected", "cancelled"],
  approved:      ["issued", "rejected", "cancelled"],
  issued:        ["delivered", "cancelled"],
  delivered:     [],
  rejected:      [],
  cancelled:     [],
};

/**
 * Arabic labels — same canonical-label pattern the pilgrim status
 * module uses (#1755). Used by the UI dropdown + the print payload
 * status cell. Mirrored from a `umrah_visa` block in STATUS_MAP that
 * the frontend PR will land alongside the UI.
 */
export const VISA_STATUS_LABELS_AR: Record<VisaStatus, string> = {
  not_requested: "لم تُطلب",
  requested:     "طُلبت",
  under_review:  "قيد المراجعة",
  approved:      "موافَق عليها",
  issued:        "صدرت",
  delivered:     "سُلّمت",
  rejected:      "مرفوضة",
  cancelled:     "ملغاة",
};

/**
 * Returns true when `from → to` is a legal transition. Same shape as
 * the pilgrim + season transition checks elsewhere in the umrah
 * domain — composes cleanly into a single zod refine step.
 */
export function canTransition(from: string, to: string): boolean {
  if (!VISA_STATUSES.includes(from as VisaStatus)) return false;
  if (!VISA_STATUSES.includes(to as VisaStatus)) return false;
  return VISA_TRANSITIONS[from as VisaStatus].includes(to as VisaStatus);
}

/**
 * Returns the timestamp column that should be set when transitioning
 * INTO `to` — or null when the state has no associated timestamp.
 * Caller composes this into the UPDATE SET clause so the milestone
 * is captured exactly when it happens (vs running an inferred
 * backfill later).
 */
export function timestampColumnFor(to: VisaStatus): string | null {
  switch (to) {
    case "requested":  return "visaRequestedAt";
    case "issued":     return "visaIssuedAt";
    case "rejected":   return "visaRejectedAt";
    default:           return null;
  }
}
