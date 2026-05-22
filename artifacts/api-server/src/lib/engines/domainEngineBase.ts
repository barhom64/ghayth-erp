import type { JournalEntryLine } from "../businessHelpers.js";

export type JournalEntryStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "posted"
  | "rejected"
  | "returned"
  | "cancelled"
  | "reversed";

export interface GLPostingRequest {
  companyId: number;
  branchId: number;
  createdBy: number;
  ref: string;
  description: string;
  type?: string;
  sourceType: string;
  sourceId: number;
  sourceKey: string;
  lines: JournalEntryLine[];
  guardTable?: string;
  guardId?: number;
  skipPeriodCheck?: boolean;
  // FIN-007 — when true the entry is recorded WITHOUT moving
  // chart_of_accounts.currentBalance; the balances are applied later by
  // applyJournalEntryBalances (e.g. when a voucher is approved). Used for
  // documents that must not hit the ledger before approval.
  deferBalances?: boolean;
  // Optional final status for the journal entry — defaults to DB default ('draft').
  // Allows callers (e.g. manual journals posted immediately) to land in 'posted'
  // without doing a follow-up UPDATE from a route.
  status?: JournalEntryStatus;
  // Optional posting date (YYYY-MM-DD). When supplied:
  //   - financial period check uses this date instead of today
  //   - journal_entries.createdAt is overwritten with this date after insert
  postingDate?: string;
  // Optional header-level metadata commonly set by route adapters. These are
  // applied via a post-insert UPDATE so domain code stops touching the
  // journal_entries table directly.
  headerMeta?: Partial<{
    costCenter: string | null;
    departmentId: number | null;
    relatedEntityType: string | null;
    relatedEntityId: number | null;
    paymentMethod: string | null;
    reference: string | null;
    isPaid: boolean | null;
    attachmentUrl: string | null;
    attachmentType: string | null;
    expenseType: string | null;
    operationType: string | null;
    projectId: number | null;
    taxCategory: string | null;
    govSyncEnabled: boolean | null;
    govIntegrationId: number | null;
    govEntityType: string | null;
    govEntityId: number | null;
    approvalStatus: string | null;
    isManual: boolean | null;
  }>;
}

export interface DomainEngine {
  readonly domainId: string;
  readonly label: string;
}
