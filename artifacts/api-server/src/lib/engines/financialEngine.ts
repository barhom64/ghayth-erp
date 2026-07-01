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
  assertPostableAccount,
  validateBudget,
  updateBudgetUsed,
  todayISO,
  type JournalEntryLine,
} from "../businessHelpers.js";
import { eventBus } from "../eventBus.js";
import { rawQuery, rawExecute, withTransaction } from "../rawdb.js";
import type { DomainEngine, GLPostingRequest } from "./domainEngineBase.js";
import { logger } from "../logger.js";
import { issueNumber } from "../numberingService.js";
import { computeTaxFromTaxCode } from "../taxCodes.js";

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

// ─── FIN-P4-SLICE-A — postSalesInvoice façade contract ────────────────────
//
// FIN-P4-CONTRACT (#2257) §3 / §4 — a single high-level entry-point so a
// caller (umrah, properties, fleet, ...) sends its OPERATIONAL data and
// gets back the FINANCIAL outputs without touching numbering/tax/AR/JE
// individually.
//
// This slice (SLICE-A) ships the request + response interfaces only.
// The implementation is a stub that throws — the actual engine wiring
// of numbering + tax + account resolution + GL posting + AR landing is
// SLICE-B (separate PR), and the umrah-side swap from
// `createGuardedJournalEntry` direct to this façade is SLICE-C.
//
// The stub is intentional: shipping the contract early lets U-05-P3
// smoke + the spec doc reference the canonical shape from one source.
// Owner ratified the full §11 architecture rule on 2026-06-14 02:49
// (see #2257 §9 owner decision); the stub keeps the gate while making
// the contract visible.

/** Per-line input to the postSalesInvoice façade. */
export interface SalesInvoiceLineInput {
  description: string;
  quantity: number;
  unitPriceExclTax: number;
  isTaxable: boolean;
  /** Tax code from the catalog (e.g. "VAT_STANDARD", "VAT_ZERO"). */
  taxCode: string;
  productId?: number;
  serviceCode?: string;
  /** Source attribution carried onto the resulting JE dims. */
  sourceRefs?: {
    groupId?: number;
    nuskInvoiceId?: number;
    pilgrimId?: number;
  };
}

/** Sales-invoice request envelope — the OPERATIONAL data only. */
export interface SalesInvoiceRequest {
  companyId: number;
  branchId: number;
  createdBy: number;
  /** Module identifier for numbering service (e.g. "umrah", "crm"). */
  moduleKey: string;
  /** Entity identifier within the module (e.g. "sales_invoice"). */
  entityKey: string;
  /** Counterparty client id — the AR account is resolved from this. */
  clientId: number;
  invoiceDate?: string;
  dueDate?: string;
  currency?: string;
  /** Module-side ids surfacing on the JE dimensions. */
  dimensions?: {
    agentId?: number;
    subAgentId?: number;
    seasonId?: number;
    groupId?: number;
    sourceNuskInvoiceId?: number;
  };
  /** Source attribution for idempotency keying. */
  sourceRefs: {
    sourceType: string;
    sourceId: number;
    sourceKey: string;
  };
  lines: SalesInvoiceLineInput[];
  notes?: string;
}

/** Sales-invoice response — the FINANCIAL outputs only. */
export interface SalesInvoiceResponse {
  invoiceNumber: string;
  invoiceId: number;
  journalEntryId: number | null;
  journalEntryNumber: string | null;
  arAccountCode: string;
  /** Revenue account per line (same order as request.lines). */
  revenueAccountCode: string[];
  taxAccountCode: string | null;
  period: string;
  postingStatus: "posted" | "deferred" | "failed";
  failureReason: string | null;
  /** Per-line tax breakdown (same order as request.lines). */
  lineBreakdown: Array<{
    description: string;
    quantity: number;
    unitPriceExclTax: number;
    taxCode: string;
    taxRate: number;
    taxAmount: number;
    lineTotalExclTax: number;
    lineTotalInclTax: number;
    revenueAccountCode: string;
  }>;
  /** Totals from the line breakdown. */
  totals: {
    subtotalExclTax: number;
    taxTotal: number;
    grandTotal: number;
  };
}

// ─── FIN-P4-SLICE-B — prepared invoice payload passed to the caller's
// row-insert callback. The callback INSERTs the operational row (umrah_
// sales_invoices / invoices / etc.) using its module-specific schema and
// returns the new row id. The engine then uses that id to anchor the
// guarded JE.
export interface PreparedSalesInvoiceForInsert {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string | null;
  currency: string;
  subtotalExclTax: number;
  taxTotal: number;
  grandTotal: number;
  arAccountCode: string;
  revenueAccountCode: string[];
  taxAccountCode: string | null;
  lineBreakdown: SalesInvoiceResponse["lineBreakdown"];
  period: string;
}

/**
 * The caller-supplied INSERT function. The engine prepares numbering +
 * tax + accounts + period gate, hands the prepared payload to this fn,
 * and expects it to INSERT the module-specific row (umrah_sales_invoices
 * etc.) inside the same client/transaction the engine opened.
 */
export type InsertSalesInvoiceFn = (
  prepared: PreparedSalesInvoiceForInsert,
  client: import("pg").PoolClient,
) => Promise<{ invoiceId: number }>;

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

    // skipPeriodCheck is an escape hatch reserved for year-end closing
    // entries (type='closing'). The whole point of YE close is to post a
    // dated 12/31 entry into a period that has already been closed — by
    // definition, all 12 monthly periods of the year are closed before
    // YE close can proceed (see /fiscal-periods/:period/year-end-close
    // in finance-journal.ts). For every other domain post the gate is
    // mandatory: a non-closing entry that wants to bypass it is almost
    // certainly a bug. Guard runs BEFORE the sourceKey rawQuery so a
    // misuse fails fast without hitting the DB.
    if (request.skipPeriodCheck && request.type !== "closing") {
      throw new Error(
        `[FinancialEngine] skipPeriodCheck is reserved for closing entries (type='closing'); ` +
          `received type='${request.type ?? "general"}'`
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

    if (!request.skipPeriodCheck) {
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
      // Both `date` (ledger/accounting date — drives the period gate, H2,
      // H4, and the date-range filter on financial statements) AND
      // `createdAt` (the column financial reports actually range-filter
      // on per C2) must reflect the postingDate. `createJournalEntry`
      // doesn't accept a date parameter today, so it INSERTs with the
      // schema default (CURRENT_DATE); without this UPDATE the engine
      // would leave `date` = today even when the caller back-dated the
      // entry, breaking year-end close (#987) and any other back-dated
      // posting (FX revaluation, inventory writeoff with a custom date,
      // etc.). Path B (lib/gl/posting.ts) already writes both columns
      // via `COALESCE($6::date, CURRENT_DATE)` at insert time — this is
      // the Path-A mirror.
      updates.push(`date = $${paramIdx++}`);
      params.push(request.postingDate);
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

    const [je] = await rawQuery<{ id: number; balancesApplied: boolean }>(
      `SELECT id, "balancesApplied" FROM journal_entries WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [params.journalEntryId, params.companyId]
    );
    if (!je) {
      throw new Error("القيد اليومي غير موجود أو لا يتبع هذه الشركة");
    }

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO journal_lines ("journalId","accountCode",debit,credit,description)
         VALUES ($1,'9999',$2,$3,$4)`,
        [
          params.journalEntryId,
          diff > 0 ? diff : 0,
          diff < 0 ? Math.abs(diff) : 0,
          params.description ?? "فرق تقريب تلقائي",
        ]
      );
      // H3 — keep currentBalance in step with the rounding line. If the
      // entry's balances are already applied, account 9999 must move too
      // or journal_lines and currentBalance diverge by `diff`. If the entry
      // is still deferred, applyJournalEntryBalances picks the line up
      // later — applying here would double-count.
      if (je.balancesApplied) {
        await client.query(
          `UPDATE chart_of_accounts SET "currentBalance" = "currentBalance" + $1
           WHERE "companyId" = $2 AND code = '9999'`,
          [diff, params.companyId]
        );
      }
    });
    return { applied: diff };
  }

  async resolveAccountCode(
    companyId: number,
    operationType: string,
    side: "debit" | "credit",
    fallbackCode?: string
  ): Promise<string> {
    const code = await getAccountCodeFromMapping(companyId, operationType, side, fallbackCode);
    // Second-layer guard: even if getAccountCodeFromMapping succeeded, verify
    // the returned code is postable before it leaves the engine. This catches
    // any code-path that bypasses getAccountCodeFromMapping (e.g. a caller
    // passing a raw fallback string directly) and acts as defence-in-depth
    // against future regressions.
    await assertPostableAccount(companyId, code, { operationType, side });
    return code;
  }

  async resolveAccountCodes(
    companyId: number,
    mappings: AccountMapping[]
  ): Promise<Record<string, string>> {
    const results: Record<string, string> = {};
    await Promise.all(
      mappings.map(async (m) => {
        const key = `${m.operationType}_${m.side}`;
        const code = await getAccountCodeFromMapping(
          companyId,
          m.operationType,
          m.side,
          m.fallbackCode
        );
        await assertPostableAccount(companyId, code, { operationType: m.operationType, side: m.side });
        results[key] = code;
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

  // ─── FIN-P4-SLICE-A — postSalesInvoice façade (contract surface) ────────
  //
  // High-level entry point: callers send OPERATIONAL data; the engine
  // returns FINANCIAL outputs (invoice number, JE id, AR/revenue/tax
  // account codes, period, status). The actual implementation chain
  //   numberingService.issueNumber → computeTaxFromTaxCode (per line) →
  //   revenueAccountResolver.resolveRevenueAccount (per line) →
  //   getAccountCodeFromMapping (AR/tax/penalty) → checkFinancialPeriodOpen
  //   → createGuardedJournalEntry → emit event
  // ships in SLICE-B (separate PR). SLICE-A pins the contract.
  //
  // The stub throws so anyone trying to call this before SLICE-B lands
  // fails loudly with the correct error pointing at the next gate. The
  // umrah-side swap from `createGuardedJournalEntry` direct to this
  // façade is SLICE-C.
  async postSalesInvoice(
    request: SalesInvoiceRequest,
    insertInvoice: InsertSalesInvoiceFn,
  ): Promise<SalesInvoiceResponse> {
    // FIN-P4-SLICE-B — full engine wiring:
    //   1) Issue invoice number via the central numbering service.
    //   2) Compute per-line tax via computeTaxFromTaxCode.
    //   3) Resolve AR / revenue / VAT accounts via getAccountCodeFromMapping.
    //   4) Gate on checkFinancialPeriodOpen against invoiceDate.
    //   5) Inside one transaction: let caller INSERT the operational row
    //      (its module-specific table; the engine doesn't know which one),
    //      then post the guarded JE referencing the new row id.
    //   6) Return the SalesInvoiceResponse with all financial outputs.
    //
    // The 2-argument signature (request + insertInvoice callback) is
    // deliberate: the engine owns numbering/tax/accounts/GL ceremony, the
    // caller owns the operational-row INSERT (because the engine doesn't
    // know which table to target — umrah_sales_invoices, invoices, etc.).

    if (!request.lines || request.lines.length === 0) {
      throw new Error(
        "[FinancialEngine.postSalesInvoice] empty lines — invoice must carry at least one line",
      );
    }
    if (!request.sourceRefs?.sourceKey) {
      throw new Error(
        "[FinancialEngine.postSalesInvoice] sourceRefs.sourceKey is required for JE idempotency",
      );
    }

    const invoiceDate = request.invoiceDate ?? todayISO();
    const currency = request.currency ?? "SAR";

    // ── Step 1: number (centralised via numberingService)
    // expectedTiming is a CONSISTENCY ASSERTION, not a behavioural switch —
    // the number is issued the moment issueNumber() runs regardless of its
    // value. The route-level creation paths for the same entities
    // (finance/sales_invoice in routes/finance-invoices.ts + transport-pricing.ts,
    // umrah/umrah_agent_invoice in routes/umrah.ts) all declare 'on_draft'.
    // Keeping this engine at 'on_posting' made one scheme unable to satisfy
    // both paths → a guaranteed 422 timing-mismatch on whichever side didn't
    // match the seeded scheme. Unified to 'on_draft' so every issuance path
    // for these entities passes the guard (migration 441 sets the matching
    // scheme timing). No change to WHEN the number is allocated.
    const numbering = await issueNumber({
      moduleKey: request.moduleKey,
      entityKey: request.entityKey,
      companyId: request.companyId,
      branchId: request.branchId,
      entityTable: request.sourceRefs.sourceType,
      actorId: request.createdBy,
      expectedTiming: "on_draft",
    });

    // ── Step 2: per-line tax + revenue account
    const lineBreakdown: SalesInvoiceResponse["lineBreakdown"] = [];
    const revenueAccountCodes: string[] = [];
    let subtotalExclTax = 0;
    let taxTotal = 0;
    for (const line of request.lines) {
      const lineTotalExclTax = Number((line.unitPriceExclTax * line.quantity).toFixed(2));
      const tax = line.isTaxable
        ? await computeTaxFromTaxCode({
            companyId: request.companyId,
            amount: lineTotalExclTax,
            taxInclusive: false,
            taxCode: line.taxCode,
          })
        : { net: lineTotalExclTax, tax: 0, gross: lineTotalExclTax, taxCode: line.taxCode, rate: 0 };
      // Revenue account per line — module-specific operation key the caller
      // is responsible for mapping. Default fallback: `<moduleKey>_revenue`
      // (e.g. `umrah_revenue`). For now we use a single mapping key per
      // module; per-product mapping is a future enhancement.
      const revOperation = `${request.moduleKey}_revenue`;
      const revAccount = await getAccountCodeFromMapping(
        request.companyId,
        revOperation,
        "credit",
        "4110", // generic revenue fallback
      );
      lineBreakdown.push({
        description: line.description,
        quantity: line.quantity,
        unitPriceExclTax: line.unitPriceExclTax,
        taxCode: line.taxCode,
        taxRate: tax.rate,
        taxAmount: tax.tax,
        lineTotalExclTax,
        lineTotalInclTax: Number((lineTotalExclTax + tax.tax).toFixed(2)),
        revenueAccountCode: revAccount,
      });
      revenueAccountCodes.push(revAccount);
      subtotalExclTax += lineTotalExclTax;
      taxTotal += tax.tax;
    }
    subtotalExclTax = Number(subtotalExclTax.toFixed(2));
    taxTotal = Number(taxTotal.toFixed(2));
    const grandTotal = Number((subtotalExclTax + taxTotal).toFixed(2));

    // ── Step 3: AR + VAT accounts
    const arOperation = `${request.moduleKey}_ar`;
    const arAccountCode = await getAccountCodeFromMapping(
      request.companyId,
      arOperation,
      "debit",
      "1210", // generic AR fallback
    );
    let taxAccountCode: string | null = null;
    if (taxTotal > 0) {
      taxAccountCode = await getAccountCodeFromMapping(
        request.companyId,
        "vat_output",
        "credit",
        "2310", // generic VAT payable fallback
      );
    }

    // ── Step 4: period gate
    const periodCheck = await checkFinancialPeriodOpen(request.companyId, invoiceDate);
    if (!periodCheck.open) {
      // Surface the prepared totals + accounts so the caller can decide
      // whether to defer (queue for the next period) or surface the error.
      return {
        invoiceNumber: numbering.number,
        invoiceId: 0,
        journalEntryId: null,
        journalEntryNumber: null,
        arAccountCode,
        revenueAccountCode: revenueAccountCodes,
        taxAccountCode,
        period: invoiceDate.slice(0, 7),
        postingStatus: "deferred",
        failureReason: `financial period is closed${periodCheck.periodName ? ` (${periodCheck.periodName})` : ""}`,
        lineBreakdown,
        totals: { subtotalExclTax, taxTotal, grandTotal },
      };
    }

    const period = invoiceDate.slice(0, 7);
    const prepared: PreparedSalesInvoiceForInsert = {
      invoiceNumber: numbering.number,
      invoiceDate,
      dueDate: request.dueDate ?? null,
      currency,
      subtotalExclTax,
      taxTotal,
      grandTotal,
      arAccountCode,
      revenueAccountCode: revenueAccountCodes,
      taxAccountCode,
      lineBreakdown,
      period,
    };

    // ── Step 5: caller INSERT + JE inside one transaction
    return await withTransaction(async (client) => {
      const { invoiceId } = await insertInvoice(prepared, client);
      if (!invoiceId || invoiceId <= 0) {
        throw new Error(
          "[FinancialEngine.postSalesInvoice] insertInvoice callback returned no invoiceId — caller is responsible for inserting the operational row and returning the id",
        );
      }

      // Build JE lines: AR debit, per-line revenue credits, VAT credit.
      const jeLines = [
        {
          accountCode: arAccountCode,
          debit: grandTotal,
          credit: 0,
          description: `AR — ${prepared.invoiceNumber}`,
          umrahSeasonId: request.dimensions?.seasonId,
          umrahAgentId: request.dimensions?.agentId,
        },
        ...lineBreakdown.map((l) => ({
          accountCode: l.revenueAccountCode,
          debit: 0,
          credit: l.lineTotalExclTax,
          description: l.description,
          umrahSeasonId: request.dimensions?.seasonId,
          umrahAgentId: request.dimensions?.agentId,
        })),
      ];
      if (taxAccountCode && taxTotal > 0) {
        jeLines.push({
          accountCode: taxAccountCode,
          debit: 0,
          credit: taxTotal,
          description: `VAT — ${prepared.invoiceNumber}`,
          umrahSeasonId: request.dimensions?.seasonId,
          umrahAgentId: request.dimensions?.agentId,
        });
      }

      // Note: createGuardedJournalEntry is called inside the same engine
      // module; this is the SINGLE allowed entry point per the doctrine
      // §1.1. SLICE-C will swap umrahInvoicingEngine to call this façade
      // instead of createGuardedJournalEntry directly.
      const journalEntryId = await createGuardedJournalEntry(
        {
          companyId: request.companyId,
          branchId: request.branchId,
          createdBy: request.createdBy,
          ref: prepared.invoiceNumber,
          description: `${request.moduleKey} ${request.entityKey} — ${prepared.invoiceNumber}`,
          type: "sale",
          sourceType: request.sourceRefs.sourceType,
          sourceId: invoiceId,
          sourceKey: request.sourceRefs.sourceKey,
          lines: jeLines,
        },
        { table: request.sourceRefs.sourceType, id: invoiceId },
      );

      return {
        invoiceNumber: prepared.invoiceNumber,
        invoiceId,
        journalEntryId: journalEntryId,
        journalEntryNumber: prepared.invoiceNumber, // mirrored from invoice ref
        arAccountCode,
        revenueAccountCode: revenueAccountCodes,
        taxAccountCode,
        period,
        postingStatus: "posted",
        failureReason: null,
        lineBreakdown,
        totals: { subtotalExclTax, taxTotal, grandTotal },
      };
    });
  }
}

export const financialEngine = new FinancialEngineImpl();
