/**
 * financeDocumentJournal — م١-ب core: derive a balanced multi-leg journal from
 * a unified financial document's lines (قبض/صرف). Reference: docs/finance-audit/25
 * §٢ + §١١.١ ; issue #2994 (الخيار ب — financial_document_lines +
 * financial_line_allocations).
 *
 * This module is PURE + deterministic so it is unit-testable WITHOUT a database
 * (constitution rule 3: any ledger change carries a journal-line assertion test —
 * see tests/unit/financeDocumentJournal.test.ts). Account RESOLUTION (which
 * expense/revenue account, VAT codes, cash account) stays in the existing
 * financial engine / voucher route; this module only expands already-resolved
 * lines + per-line entity allocations into balanced debit/credit legs.
 *
 * Posting shape:
 *   payment (صرف): DR counter(expense) per line/allocation + DR VAT(input) + CR cash(gross)
 *   receipt (قبض): CR counter(revenue) per line/allocation + CR VAT(output) + DR cash(gross)
 *
 * The cascade (journal + balances + budget + collection) fires at TRANSACTION
 * POST — never on draft save (docs/25 §٦ دورة الحياة). This builder is the
 * posting step only; callers must not run it for drafts.
 */

export type LineAllocationInput = {
  entityType: string;
  entityId: number;
  /** resolved absolute amount for this slice (Σ over a line must equal the line net) */
  amount: number;
  costBearer?: string | null;
  dims?: Record<string, unknown>;
};

export type ResolvedDocLine = {
  lineNo: number;
  /** net (qty × unitPrice), tax-exclusive */
  net: number;
  /** VAT amount for this line (0 if none) */
  vat: number;
  /** resolved counter account: expense (payment) or revenue (receipt) */
  counterAccountCode: string;
  /** base line dimensions (vehicleId, propertyId, …) */
  dims?: Record<string, unknown>;
  /** optional split of the line across operational entities; Σamount must equal net */
  allocations?: LineAllocationInput[];
};

export type DocJournalHeader = {
  direction: "receipt" | "payment";
  /** cash/bank account the money moves through */
  cashAccountCode: string;
  /** VAT account: input (payment) or output (receipt). Required only when VAT > 0. */
  vatAccountCode?: string | null;
};

export type JournalLeg = {
  accountCode: string;
  debit: number;
  credit: number;
  dims?: Record<string, unknown>;
  /** source line (for traceability — صدق الأثر, docs/25 §٠٠ مبدأ ٧) */
  lineNo?: number;
  /** the operational entity this slice is charged to, when split */
  entityRef?: { entityType: string; entityId: number } | null;
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export class DocumentJournalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentJournalError";
  }
}

/**
 * Expand resolved document lines into a balanced set of journal legs.
 * Throws DocumentJournalError on an unbalanced result or a line whose
 * allocations do not sum to its net (defensive — the route also asserts).
 */
export function buildDocumentJournalLegs(
  header: DocJournalHeader,
  lines: ResolvedDocLine[],
): JournalLeg[] {
  if (!lines || lines.length === 0) {
    throw new DocumentJournalError("لا بنود للمستند — لا يمكن اشتقاق قيد");
  }
  const isReceipt = header.direction === "receipt";
  const legs: JournalLeg[] = [];

  let totalNet = 0;
  let totalVat = 0;

  for (const line of lines) {
    const net = round2(line.net);
    if (net < 0) throw new DocumentJournalError(`صافي البند ${line.lineNo} سالب`);
    totalNet = round2(totalNet + net);
    totalVat = round2(totalVat + round2(line.vat || 0));

    // counter slices: one per allocation (validated to sum to net), else the whole line.
    const slices =
      line.allocations && line.allocations.length > 0
        ? line.allocations.map((a) => ({
            amount: round2(a.amount),
            dims: {
              ...(line.dims ?? {}),
              ...(a.dims ?? {}),
              ...(a.costBearer ? { costBearer: a.costBearer } : {}),
            },
            entityRef: { entityType: a.entityType, entityId: a.entityId },
          }))
        : [{ amount: net, dims: line.dims, entityRef: null as JournalLeg["entityRef"] }];

    if (line.allocations && line.allocations.length > 0) {
      const sliceSum = round2(slices.reduce((s, x) => s + x.amount, 0));
      if (Math.abs(sliceSum - net) > 0.01) {
        throw new DocumentJournalError(
          `توزيع البند ${line.lineNo} (${sliceSum}) لا يساوي صافي البند (${net})`,
        );
      }
    }

    for (const s of slices) {
      legs.push({
        accountCode: line.counterAccountCode,
        debit: isReceipt ? 0 : s.amount,
        credit: isReceipt ? s.amount : 0,
        dims: s.dims && Object.keys(s.dims).length > 0 ? s.dims : undefined,
        lineNo: line.lineNo,
        entityRef: s.entityRef,
      });
    }
  }

  // VAT leg (single, aggregated): payment → input VAT debit; receipt → output VAT credit.
  if (totalVat > 0) {
    if (!header.vatAccountCode) {
      throw new DocumentJournalError("حساب الضريبة مطلوب عند وجود ضريبة على البنود");
    }
    legs.push({
      accountCode: header.vatAccountCode,
      debit: isReceipt ? 0 : totalVat,
      credit: isReceipt ? totalVat : 0,
    });
  }

  // cash leg (single, the gross money movement): payment → cash credit; receipt → cash debit.
  const gross = round2(totalNet + totalVat);
  legs.push({
    accountCode: header.cashAccountCode,
    debit: isReceipt ? gross : 0,
    credit: isReceipt ? 0 : gross,
  });

  // balance assertion (defensive)
  const totalDebit = round2(legs.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(legs.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new DocumentJournalError(`القيد غير متوازن: مدين ${totalDebit} ≠ دائن ${totalCredit}`);
  }

  return legs;
}
