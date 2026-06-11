// #1945 FIN-03 — customer receipt posting service (سند قبض من عميل).
//
// The customer-receipt wizard used to build raw GL lines IN THE BROWSER with
// hardcoded account codes (1200 / 1220 / 2110) and POST them to
// /finance/journal. On the seeded SOCPA chart those codes are respectively a
// non-postable header (الأصول غير المتداولة), the FURNITURE account
// (الأثاث والتجهيزات), and the VENDORS header (الموردون) — i.e. an AR
// settlement either failed postability or silently credited furniture.
// Worse, the wizard never updated invoices.paidAmount nor wrote the
// customer_advances row its own docstring promised.
//
// This service is the single server-side path for a customer receipt:
//   • accounts resolved through the accounting engine
//     (financialEngine.resolveAccountCode → accounting_mappings → intent
//     search), never hardcoded by the caller;
//   • invoice applications validated (FOR UPDATE) and paidAmount/status
//     advanced exactly like /invoices/:id/payment;
//   • leftover recorded as a customer_advances row (the FIN-08 flow) with
//     the advance-liability account resolved the same way;
//   • ONE balanced JE: DR cash/bank total, CR AR per applied invoice
//     (line back-linked via sourceLineTable/sourceLineId and stamped with
//     the invoice's own branchId), CR advance liability for the leftover;
//   • idempotent end-to-end on the caller-supplied receiptKey: a replay
//     returns the same journal and does NOT re-apply invoice payments.
import { rawQuery, withTransaction } from "./rawdb.js";
import {
  roundTo2,
  todayISO,
  checkFinancialPeriodOpen,
} from "./businessHelpers.js";
import { issueNumber } from "./numberingService.js";
import { ValidationError, NotFoundError, ConflictError } from "./errorHandler.js";

export interface CustomerReceiptApplication {
  invoiceId: number;
  amount: number;
}

export interface CustomerReceiptParams {
  companyId: number;
  branchId: number;
  createdBy: number;
  clientId: number;
  amount: number;
  /** cash | bank | transfer | check | bank_transfer — only cash-vs-rest
   *  matters for the engine fallback; the resolved account comes from the
   *  company's accounting_mappings / intent search. */
  method: string;
  /** Caller-stable idempotency key (one per logical receipt, e.g. a UUID
   *  generated once per wizard session). Replays return the same journal. */
  receiptKey: string;
  receivedDate?: string;
  reference?: string | null;
  notes?: string | null;
  applications: CustomerReceiptApplication[];
  /** Operation-context dims (project / cost-center / …) for the cash line. */
  dims?: Record<string, number | string>;
  /** When set, skips the numbering center for the leftover advance ref
   *  (legacy-import path, mirrors POST /customer-advances `reference`). */
  advanceRef?: string | null;
  /** Per-invoice branch access check (route passes the operator scope). */
  assertBranchAccess?: (documentBranchId: number) => void;
}

export interface CustomerReceiptResult {
  journalId: number;
  ref: string;
  alreadyExists: boolean;
  advanceId: number | null;
  advanceRef: string | null;
  applied: Array<{
    invoiceId: number;
    ref: string;
    amount: number;
    newPaidAmount: number;
    newStatus: string;
  }>;
  leftover: number;
}

/** Thrown internally to roll the transaction back when the sourceKey turns
 *  out to already exist (concurrent replay) AFTER invoice rows were touched. */
class ReceiptReplayError extends Error {
  constructor(public readonly journalId: number, public readonly ref: string) {
    super("receipt replay");
  }
}

const LOCKED_INVOICE_STATUSES = ["paid", "closed", "cancelled"];

export async function postCustomerReceipt(p: CustomerReceiptParams): Promise<CustomerReceiptResult> {
  const amt = roundTo2(Number(p.amount));
  if (!(amt > 0)) throw new ValidationError("المبلغ المستلم يجب أن يكون أكبر من صفر", { field: "amount" });
  if (!p.receiptKey || !/^[A-Za-z0-9_-]{8,64}$/.test(p.receiptKey)) {
    throw new ValidationError("receiptKey غير صالح — مفتاح ثابت 8–64 حرفًا", { field: "receiptKey" });
  }

  // De-duplicate + validate applications up front.
  const seen = new Set<number>();
  const apps = (p.applications ?? []).map((a) => {
    const invoiceId = Number(a.invoiceId);
    const amount = roundTo2(Number(a.amount));
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) throw new ValidationError("فاتورة غير صالحة في التطبيقات", { field: "applications" });
    if (!(amount > 0)) throw new ValidationError("مبلغ تطبيق غير صالح (يجب أن يكون موجبًا)", { field: "applications" });
    if (seen.has(invoiceId)) throw new ValidationError("فاتورة مكررة في التطبيقات", { field: "applications" });
    seen.add(invoiceId);
    return { invoiceId, amount };
  });
  const appliedTotal = roundTo2(apps.reduce((s, a) => s + a.amount, 0));
  const leftover = roundTo2(amt - appliedTotal);
  if (leftover < -0.005) {
    throw new ValidationError(
      `إجمالي التطبيق (${appliedTotal.toFixed(2)}) يتجاوز المبلغ المستلم (${amt.toFixed(2)})`,
      { field: "applications", fix: "قلّل مبالغ التطبيق أو ارفع المبلغ المستلم" },
    );
  }

  const recvDate = p.receivedDate || todayISO();
  const periodCheck = await checkFinancialPeriodOpen(p.companyId, recvDate);
  if (!periodCheck.open) {
    throw new ConflictError(`لا يمكن تسجيل سند قبض في فترة مُقفلة: ${periodCheck.periodName ?? ""}`, { field: "date" });
  }

  const [client] = await rawQuery<{ id: number }>(
    `SELECT id FROM clients WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
    [p.clientId, p.companyId],
  );
  if (!client) throw new ValidationError("العميل غير موجود", { field: "clientId" });

  // Accounts via the accounting engine — the whole point of FIN-03. Same
  // keys + fallbacks as /invoices/:id/payment and /customer-advances, so a
  // tenant's mapping configures all customer-money flows in one place.
  const isCash = p.method === "cash";
  const { financialEngine } = await import("./engines/index.js");
  const [cashCode, arCode, advCode] = await Promise.all([
    financialEngine.resolveAccountCode(p.companyId, "invoice_payment_cash", "debit", isCash ? "1100" : "1110"),
    financialEngine.resolveAccountCode(p.companyId, "invoice_payment_ar", "credit", "1200"),
    leftover > 0.005
      ? financialEngine.resolveAccountCode(p.companyId, "customer_advance_liability", "credit", "2400")
      : Promise.resolve(""),
  ]);

  const sourceKey = `finance:customer_receipt:${p.companyId}:${p.receiptKey}`;
  const ref = `REC-${recvDate}-${p.receiptKey.slice(0, 8)}`;

  // Fast path — a replay must not touch the invoices again.
  const [dup] = await rawQuery<{ id: number; ref: string }>(
    `SELECT id, ref FROM journal_entries WHERE "companyId"=$1 AND "sourceKey"=$2 AND "deletedAt" IS NULL LIMIT 1`,
    [p.companyId, sourceKey],
  );
  if (dup) {
    return { journalId: dup.id, ref: dup.ref, alreadyExists: true, advanceId: null, advanceRef: null, applied: [], leftover };
  }

  // Leftover advance ref — through the numbering center unless the caller
  // supplied one (legacy-import path, mirrors POST /customer-advances).
  let advRef: string | null = null;
  let issuedAdv: Awaited<ReturnType<typeof issueNumber>> | null = null;
  if (leftover > 0.005) {
    if (p.advanceRef) {
      advRef = p.advanceRef;
    } else {
      issuedAdv = await issueNumber({
        companyId: p.companyId,
        branchId: p.branchId ?? null,
        moduleKey: "finance",
        entityKey: "customer_advance",
        entityTable: "customer_advances",
        actorId: p.createdBy,
        metadata: { clientId: p.clientId, receiptKey: p.receiptKey },
        expectedTiming: "on_draft",
      });
      advRef = issuedAdv.number;
    }
  }

  let advanceId: number | null = null;
  let journalId = 0;
  const applied: CustomerReceiptResult["applied"] = [];
  // per-invoice branch/ref collected under the row lock, consumed by the AR lines
  const invoiceMeta = new Map<number, { branchId: number | null; ref: string }>();

  try {
    await withTransaction(async (tx: any) => {
      // Apply each invoice under row lock — same validations as the
      // single-invoice payment route.
      for (const a of apps) {
        const invRes = await tx.query(
          `SELECT id, total, "paidAmount", status, ref, "clientId", "branchId" FROM invoices
           WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE`,
          [a.invoiceId, p.companyId],
        );
        const invoice = invRes.rows[0];
        if (!invoice) throw new NotFoundError(`الفاتورة ${a.invoiceId} غير موجودة`);
        if (Number(invoice.clientId) !== Number(p.clientId)) {
          throw new ValidationError(`الفاتورة ${invoice.ref} لا تخص هذا العميل`, { field: "applications" });
        }
        if (LOCKED_INVOICE_STATUSES.includes(invoice.status)) {
          throw new ConflictError(`لا يمكن التطبيق على فاتورة بحالة "${invoice.status}" — الفاتورة مُقفلة`, { field: "applications" });
        }
        const invBranchId = (invoice.branchId as number | null) ?? null;
        if (invBranchId != null && p.assertBranchAccess) p.assertBranchAccess(invBranchId);

        const remaining = roundTo2(Number(invoice.total) - Number(invoice.paidAmount));
        if (a.amount > remaining + 0.01) {
          throw new ValidationError(
            `مبلغ التطبيق (${a.amount.toFixed(2)}) على ${invoice.ref} يتجاوز المتبقي (${remaining.toFixed(2)})`,
            { field: "applications" },
          );
        }

        const newPaid = roundTo2(Number(invoice.paidAmount) + a.amount);
        const newStatus = newPaid >= Number(invoice.total) - 0.01 ? "paid" : "partial";
        if (newStatus === "paid") {
          await tx.query(
            `UPDATE invoices SET "paidAmount"=$1, status=$2, "paidAt"=NOW() WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL`,
            [newPaid, newStatus, a.invoiceId, p.companyId],
          );
        } else {
          await tx.query(
            `UPDATE invoices SET "paidAmount"=$1, status=$2 WHERE id=$3 AND "companyId"=$4 AND "deletedAt" IS NULL`,
            [newPaid, newStatus, a.invoiceId, p.companyId],
          );
        }
        await tx.query(
          `INSERT INTO event_logs ("companyId","userId",action,entity,"entityId",details)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [p.companyId, p.createdBy, "invoice.payment", "invoices", String(a.invoiceId),
           JSON.stringify({ fromStatus: invoice.status, toStatus: newStatus, amount: a.amount, newPaidAmount: newPaid, receiptRef: ref })],
        );
        applied.push({ invoiceId: a.invoiceId, ref: invoice.ref, amount: a.amount, newPaidAmount: newPaid, newStatus });

        // remember the invoice branch/ref for the AR line (split-branch posting)
        invoiceMeta.set(a.invoiceId, { branchId: invBranchId, ref: invoice.ref });
      }

      // Leftover → customer_advances row (the FIN-08 flow).
      if (leftover > 0.005 && advRef) {
        const ins = await tx.query(
          `INSERT INTO customer_advances ("companyId","branchId","clientId",ref,amount,"appliedAmount",method,"receivedDate",notes,"createdBy",status)
           VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,'open') RETURNING id`,
          [p.companyId, p.branchId, p.clientId, advRef, leftover, p.method, recvDate, p.notes ?? null, p.createdBy],
        );
        advanceId = ins.rows[0].id;
        if (issuedAdv && advanceId) {
          // numbering linkback (documented exception to the bypass guard)
          await tx.query(`UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`, [advanceId, issuedAdv.assignmentId]);
        }
      }

      // ONE balanced JE. The engine's withTransaction joins this outer one
      // reentrantly (SAVEPOINT), so a GL failure rolls back the invoice
      // updates + advance row with it — no silent AR overstatement.
      const lines: any[] = [
        { accountCode: cashCode, debit: amt, credit: 0, clientId: p.clientId, description: `استلام من العميل — ${p.reference || recvDate}`, ...(p.dims ?? {}) },
        ...apps.map((a) => {
          const meta = invoiceMeta.get(a.invoiceId);
          return {
            accountCode: arCode, debit: 0, credit: a.amount, clientId: p.clientId,
            description: `تسوية فاتورة ${meta?.ref ?? a.invoiceId}`,
            sourceLineTable: "invoices", sourceLineId: a.invoiceId,
            ...(meta?.branchId != null ? { branchId: meta.branchId } : {}),
          };
        }),
        ...(leftover > 0.005
          ? [{ accountCode: advCode, debit: 0, credit: leftover, clientId: p.clientId, description: "دفعة مقدّمة — متبقي سند القبض" }]
          : []),
      ];

      const result = await financialEngine.postJournalEntry({
        companyId: p.companyId,
        branchId: p.branchId,
        createdBy: p.createdBy,
        ref,
        description: p.notes || `سند قبض من العميل ${p.clientId} — ${amt}`,
        type: "payment",
        sourceType: "customer_receipt",
        sourceId: p.clientId,
        sourceKey,
        lines,
        ...(advanceId != null ? { guardTable: "customer_advances", guardId: advanceId } : {}),
        headerMeta: { paymentMethod: p.method, reference: p.reference ?? null },
      });
      if (result.alreadyExists) {
        // Concurrent replay slipped past the fast path — abort so the
        // invoice updates in THIS transaction roll back.
        throw new ReceiptReplayError(result.journalId, ref);
      }
      journalId = result.journalId;

      if (advanceId != null) {
        await tx.query(`UPDATE customer_advances SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3`, [journalId, advanceId, p.companyId]);
      }
    });
  } catch (e) {
    if (e instanceof ReceiptReplayError) {
      return { journalId: e.journalId, ref: e.ref, alreadyExists: true, advanceId: null, advanceRef: null, applied: [], leftover };
    }
    throw e;
  }

  return { journalId, ref, alreadyExists: false, advanceId, advanceRef: advRef, applied, leftover };
}
