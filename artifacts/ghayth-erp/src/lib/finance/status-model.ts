// finance/status-model.ts
//
// #1945 — THE separation of the three finance status axes the owner mandated.
//
// The legacy expense form mixed everything into one «الحالة» select
// (draft/pending/posted) plus a standalone «تم الدفع» checkbox — which let a
// draft be "paid", and neither field actually changed the posting. This module
// is the single, tested source of truth that keeps the three axes distinct:
//
//   • documentStatus — where the paperwork is in its lifecycle.
//   • paymentStatus  — whether money actually left.
//   • postingStatus  — whether the GL entry is on the books.
//
// It is pure (no React / no I/O) so the invariants below are unit-tested in CI.

// ── the three axes ──────────────────────────────────────────────────────────
export type DocumentStatus = "draft" | "submitted" | "approved" | "rejected" | "cancelled";
export type PaymentStatus = "unpaid" | "partially_paid" | "paid";
export type PostingStatus = "unposted" | "posted" | "reversed";

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: "مسودة",
  submitted: "مُرسل للاعتماد",
  approved: "معتمد",
  rejected: "مرفوض",
  cancelled: "ملغى",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  unpaid: "غير مدفوع",
  partially_paid: "مدفوع جزئيًا",
  paid: "مدفوع",
};

export const POSTING_STATUS_LABELS: Record<PostingStatus, string> = {
  unposted: "غير مرحّل",
  posted: "مرحّل",
  reversed: "معكوس",
};

// ── invariants ──────────────────────────────────────────────────────────────

/**
 * A document may be paid ONLY once it is approved. A draft or a
 * submitted-but-not-yet-approved expense can never be "paid" — that was the
 * exact conflict the owner flagged (مسودة + تم الدفع). Rejected/cancelled
 * documents cannot be paid either.
 */
export function canBePaid(doc: DocumentStatus): boolean {
  return doc === "approved";
}

/**
 * Validate a (documentStatus, paymentStatus) pair. Returns an Arabic error
 * string when the combination is impossible, or null when it is consistent.
 */
export function validateStatusPair(doc: DocumentStatus, pay: PaymentStatus): string | null {
  if (pay !== "unpaid" && !canBePaid(doc)) {
    return `لا يمكن أن يكون المستند «${PAYMENT_STATUS_LABELS[pay]}» وهو «${DOCUMENT_STATUS_LABELS[doc]}» — الدفع لا يتم إلا بعد الاعتماد.`;
  }
  return null;
}

/**
 * Derive the payment status from the facts of the operation: money is only
 * considered "paid" when an actual money-out effect exists (a money source is
 * credited). "Paid" with no money source is not a real payment — it must have
 * an effect (spec §6: «كل حقل له أثر»).
 */
export function derivePaymentStatus(input: {
  doc: DocumentStatus;
  /** A treasury/bank/cash source is credited (the money-out leg exists). */
  hasMoneySource: boolean;
  /** Amount actually disbursed, when partial settlements are tracked. */
  paidAmount?: number;
  totalAmount?: number;
}): PaymentStatus {
  if (!canBePaid(input.doc) || !input.hasMoneySource) return "unpaid";
  if (
    input.paidAmount != null &&
    input.totalAmount != null &&
    input.paidAmount > 0 &&
    input.paidAmount < input.totalAmount
  ) {
    return "partially_paid";
  }
  return "paid";
}

/**
 * Map a backend `journal_entries.status` string onto the two display axes
 * (document + posting). The backend still stores one column; this keeps the
 * UI's separated view honest until/if the schema splits (see roadmap).
 */
export function mapJournalStatus(raw: string | null | undefined): {
  documentStatus: DocumentStatus;
  postingStatus: PostingStatus;
} {
  switch (raw) {
    case "posted":
      return { documentStatus: "approved", postingStatus: "posted" };
    case "approved":
      return { documentStatus: "approved", postingStatus: "posted" };
    case "pending_approval":
      return { documentStatus: "submitted", postingStatus: "unposted" };
    case "rejected":
      return { documentStatus: "rejected", postingStatus: "unposted" };
    case "returned":
      return { documentStatus: "submitted", postingStatus: "unposted" };
    case "cancelled":
      return { documentStatus: "cancelled", postingStatus: "reversed" };
    case "reversed":
      return { documentStatus: "approved", postingStatus: "reversed" };
    case "draft":
    default:
      return { documentStatus: "draft", postingStatus: "unposted" };
  }
}
