// ─── Financial Engine — محرك المالية ────────────────────────────────────
// Central gateway for ALL General Ledger operations across the system.
// Every domain that needs to post a journal entry MUST go through this
// engine — no direct calls to createJournalEntry from route files.
//
// Responsibilities:
//  1. Financial period validation (mandatory, no skip)
//  2. Account code resolution via accounting_mappings
//  3. sourceKey idempotency (mandatory for all domain postings)
//  4. GL posting via createGuardedJournalEntry
//  5. Budget validation for expense postings
//  6. Cross-domain event emission after successful GL posting

import {
  createJournalEntry,
  createGuardedJournalEntry,
  checkFinancialPeriodOpen,
  getAccountCodeFromMapping,
  validateBudget,
  updateBudgetUsed,
  todayISO,
  type JournalEntryLine,
} from "../businessHelpers.js";
import { eventBus } from "../eventBus.js";
import { rawQuery, rawExecute } from "../rawdb.js";
import type { DomainEngine, GLPostingRequest } from "./domainEngineBase.js";

export interface GLPostingResult {
  journalId: number;
  sourceKey: string;
  alreadyExists: boolean;
}

export interface AccountMapping {
  operationType: string;
  side: "debit" | "credit";
  fallbackCode: string;
}

export interface InvoiceCreationRequest {
  companyId: number;
  branchId: number;
  createdBy: number;
  clientId?: number;
  type: string;
  ref?: string;
  description?: string;
  subtotal: number;
  vatAmount: number;
  totalAmount: number;
  dueDate?: string;
  sourceType: string;
  sourceId: number;
  items?: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
    vatAmount?: number;
  }>;
}

class FinancialEngineImpl implements DomainEngine {
  readonly domainId = "finance";
  readonly label = "المالية والمحاسبة";

  async postJournalEntry(request: GLPostingRequest): Promise<GLPostingResult> {
    if (!request.sourceKey) {
      throw new Error(
        `[FinancialEngine] sourceKey is required for GL posting — ${request.sourceType}#${request.sourceId}`
      );
    }

    const existing = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL LIMIT 1`,
      [request.companyId, request.sourceKey]
    );
    if (existing.length > 0) {
      return {
        journalId: existing[0].id,
        sourceKey: request.sourceKey,
        alreadyExists: true,
      };
    }

    const periodCheck = await checkFinancialPeriodOpen(
      request.companyId,
      todayISO()
    );
    if (!periodCheck.open) {
      throw new Error(
        `الفترة المالية "${periodCheck.periodName}" مغلقة — لا يمكن ترحيل قيود`
      );
    }

    const entryParams = {
      companyId: request.companyId,
      branchId: request.branchId,
      createdBy: request.createdBy,
      ref: request.ref,
      description: request.description,
      type: request.type ?? "general",
      sourceType: request.sourceType,
      sourceId: request.sourceId,
      sourceKey: request.sourceKey,
      lines: request.lines,
      skipPeriodCheck: true,
    };

    const journalId = request.guardTable && request.guardId
      ? await createGuardedJournalEntry(entryParams, { table: request.guardTable, id: request.guardId })
      : await createJournalEntry(entryParams);

    return { journalId, sourceKey: request.sourceKey, alreadyExists: false };
  }

  async resolveAccountCode(
    companyId: number,
    operationType: string,
    side: "debit" | "credit",
    fallbackCode: string
  ): Promise<string> {
    return getAccountCodeFromMapping(companyId, operationType, side, fallbackCode);
  }

  async resolveAccountCodes(
    companyId: number,
    mappings: AccountMapping[]
  ): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    await Promise.all(
      mappings.map(async (m) => {
        const key = `${m.operationType}_${m.side}`;
        results[key] = await getAccountCodeFromMapping(
          companyId,
          m.operationType,
          m.side,
          m.fallbackCode
        );
      })
    );
    return results;
  }

  async checkPeriodOpen(
    companyId: number,
    date?: string
  ): Promise<{ open: boolean; periodName?: string }> {
    const targetDate = date ?? todayISO();
    return checkFinancialPeriodOpen(companyId, targetDate);
  }

  async checkBudget(params: {
    companyId: number;
    accountCode: string;
    amount: number;
    period?: string;
    role: string;
  }) {
    return validateBudget(params);
  }

  async recordBudgetUsage(params: {
    companyId: number;
    accountCode: string;
    amount: number;
    period?: string;
  }) {
    return updateBudgetUsed(params);
  }

  async updateJournalStatus(
    journalId: number,
    newStatus: "posted" | "rejected",
    requiredCurrentStatus = "pending_approval"
  ): Promise<{ updated: boolean }> {
    const { affectedRows } = await rawExecute(
      `UPDATE journal_entries SET status = $1 WHERE id = $2 AND status = $3`,
      [newStatus, journalId, requiredCurrentStatus]
    );
    return { updated: affectedRows > 0 };
  }

  async recordInvoicePayment(params: {
    invoiceId: number;
    companyId: number;
    clientId: number;
    amount: number;
    method: string;
    transactionRef: string;
    source: string;
  }): Promise<{ newPaid: number; newStatus: string }> {
    const rows = await rawQuery<{ total: number; paidAmount: number }>(
      `SELECT total, "paidAmount" FROM invoices WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [params.invoiceId, params.companyId]
    );
    if (!rows.length) throw new Error("الفاتورة غير موجودة");

    const payAmt = Math.min(params.amount, Number(rows[0].total) - Number(rows[0].paidAmount));
    const newPaid = Number(rows[0].paidAmount) + payAmt;
    const newStatus = newPaid >= Number(rows[0].total) ? "paid" : "partial";

    await rawExecute(
      `UPDATE invoices SET "paidAmount"=$1, status=$2, "updatedAt"=NOW() WHERE id=$3`,
      [newPaid, newStatus, params.invoiceId]
    );
    await rawExecute(
      `INSERT INTO invoice_payments ("invoiceId","companyId","clientId",amount,method,"transactionRef","paidAt",source) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7) ON CONFLICT DO NOTHING`,
      [params.invoiceId, params.companyId, params.clientId, payAmt, params.method, params.transactionRef, params.source]
    ).catch(console.error);

    return { newPaid, newStatus };
  }

  async createPurchaseOrder(params: {
    companyId: number;
    ref: string;
    description: string;
    requestedBy: number;
  }): Promise<{ insertId: number }> {
    const { insertId } = await rawExecute(
      `INSERT INTO purchase_orders ("companyId", ref, description, status, "requestedBy", "createdAt") VALUES ($1, $2, $3, 'draft', $4, NOW())`,
      [params.companyId, params.ref, params.description, params.requestedBy]
    );
    return { insertId };
  }
}

export const financialEngine = new FinancialEngineImpl();
