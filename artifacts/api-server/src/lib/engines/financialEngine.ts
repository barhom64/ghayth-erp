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
import { logger } from "../logger.js";

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
    if (/(?:^|[^0-9])1\d{12}(?:$|[^0-9])/.test(request.sourceKey)) {
      // Defensive guard: a 13-digit number starting with `1` inside the key
      // is a Date.now() millisecond timestamp (range 2001-2286). Volatile
      // suffixes break idempotency — derive sourceKey from a stable
      // identifier (source row id, business key, or a request-scoped UUID
      // / idempotency token).
      throw new Error(
        `[FinancialEngine] sourceKey "${request.sourceKey}" looks volatile (contains a Date.now-style timestamp) — derive it from a stable identifier (ref/sourceId/UUID)`
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

    const periodDate = request.postingDate ?? todayISO();
    const periodCheck = await checkFinancialPeriodOpen(
      request.companyId,
      periodDate
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
      deferBalances: request.deferBalances,
    };

    const journalId = request.guardTable && request.guardId
      ? await createGuardedJournalEntry(entryParams, { table: request.guardTable, id: request.guardId })
      : await createJournalEntry(entryParams);

    await this.applyHeaderOverrides(journalId, request);

    return { journalId, sourceKey: request.sourceKey, alreadyExists: false };
  }

  private async applyHeaderOverrides(
    journalId: number,
    request: GLPostingRequest
  ): Promise<void> {
    const updates: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (request.status && request.status !== "draft") {
      updates.push(`status = $${paramIdx++}`);
      params.push(request.status);
    }
    if (request.postingDate) {
      updates.push(`"createdAt" = $${paramIdx++}`);
      params.push(request.postingDate);
    }
    const meta = request.headerMeta;
    if (meta) {
      const columns: Array<[keyof NonNullable<typeof meta>, string]> = [
        ["costCenter", `"costCenter"`],
        ["departmentId", `"departmentId"`],
        ["relatedEntityType", `"relatedEntityType"`],
        ["relatedEntityId", `"relatedEntityId"`],
        ["paymentMethod", `"paymentMethod"`],
        ["reference", `reference`],
        ["isPaid", `"isPaid"`],
        ["attachmentUrl", `"attachmentUrl"`],
        ["attachmentType", `"attachmentType"`],
        ["expenseType", `"expenseType"`],
        ["operationType", `"operationType"`],
        ["projectId", `"projectId"`],
        ["taxCategory", `"taxCategory"`],
        ["govSyncEnabled", `"govSyncEnabled"`],
        ["govIntegrationId", `"govIntegrationId"`],
        ["govEntityType", `"govEntityType"`],
        ["govEntityId", `"govEntityId"`],
        ["approvalStatus", `"approvalStatus"`],
        ["isManual", `"isManual"`],
      ];
      for (const [key, column] of columns) {
        if (Object.prototype.hasOwnProperty.call(meta, key)) {
          updates.push(`${column} = $${paramIdx++}`);
          params.push(meta[key] ?? null);
        }
      }
    }

    if (updates.length === 0) return;
    const idIdx = paramIdx++;
    const companyIdx = paramIdx;
    params.push(journalId, request.companyId);
    await rawExecute(
      `UPDATE journal_entries SET ${updates.join(", ")} WHERE id = $${idIdx} AND "companyId" = $${companyIdx} AND "deletedAt" IS NULL`,
      params
    );
  }

  /**
   * Append a rounding-difference line (account 9999) to an EXISTING journal
   * entry. Centralised here so routes never INSERT directly into journal_lines.
   * The 0.05 SAR cap mirrors the long-standing business rule.
   */
  async appendRoundingAdjustment(params: {
    companyId: number;
    journalEntryId: number;
    amount: number;
    description?: string;
  }): Promise<{ applied: number }> {
    const diff = Math.round(params.amount * 100) / 100;
    if (Math.abs(diff) === 0) {
      throw new Error("فرق التقريب يجب أن يكون مختلفاً عن الصفر");
    }
    if (Math.abs(diff) > 0.05) {
      throw new Error("فرق التقريب يتجاوز الحد المسموح (0.05 ﷼)");
    }

    const [roundingAcc] = await rawQuery<{ code: string }>(
      `SELECT code FROM chart_of_accounts WHERE "companyId"=$1 AND code='9999' AND "deletedAt" IS NULL LIMIT 1`,
      [params.companyId]
    );
    if (!roundingAcc) {
      throw new Error("يجب إنشاء حساب فروقات التقريب أولاً");
    }

    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [params.journalEntryId, params.companyId]
    );
    if (!je) {
      throw new Error("القيد اليومي غير موجود أو لا يتبع هذه الشركة");
    }

    await rawExecute(
      `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description)
       VALUES ($1,'9999',$2,$3,$4)`,
      [
        params.journalEntryId,
        diff > 0 ? diff : 0,
        diff < 0 ? Math.abs(diff) : 0,
        params.description ?? "فرق تقريب تلقائي",
      ]
    );
    return { applied: diff };
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
    requiredCurrentStatus = "pending_approval",
    companyId?: number
  ): Promise<{ updated: boolean }> {
    const { affectedRows } = await rawExecute(
      companyId != null
        ? `UPDATE journal_entries SET status = $1 WHERE id = $2 AND status = $3 AND "companyId" = $4`
        : `UPDATE journal_entries SET status = $1 WHERE id = $2 AND status = $3`,
      companyId != null
        ? [newStatus, journalId, requiredCurrentStatus, companyId]
        : [newStatus, journalId, requiredCurrentStatus]
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
      `UPDATE invoices SET "paidAmount"=$1, status=$2, "updatedAt"=NOW() WHERE id=$3 AND "companyId"=$4`,
      [newPaid, newStatus, params.invoiceId, params.companyId]
    );
    await rawExecute(
      `INSERT INTO invoice_payments ("invoiceId","companyId","clientId",amount,method,"transactionRef","paidAt",source) VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7) ON CONFLICT DO NOTHING`,
      [params.invoiceId, params.companyId, params.clientId, payAmt, params.method, params.transactionRef, params.source]
    ).catch((e) => logger.error(e, "[financialEngine] background task failed"));

    return { newPaid, newStatus };
  }

  async createPurchaseOrder(params: {
    companyId: number;
    ref: string;
    description: string;
    requestedBy: number;
  }): Promise<{ insertId: number }> {
    const { insertId } = await rawExecute(
      `INSERT INTO purchase_orders ("companyId", ref, notes, status, "createdBy", "createdAt") VALUES ($1, $2, $3, 'draft', $4, NOW())`,
      [params.companyId, params.ref, params.description, params.requestedBy]
    );
    return { insertId };
  }
}

export const financialEngine = new FinancialEngineImpl();
