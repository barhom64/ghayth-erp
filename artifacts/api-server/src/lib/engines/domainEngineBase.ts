import type { JournalEntryLine } from "../businessHelpers.js";

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
}

export interface DomainEngine {
  readonly domainId: string;
  readonly label: string;
}
