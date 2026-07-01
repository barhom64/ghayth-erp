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
  /**
   * م٥ — تفريع costBearer: حساب ذمة الطرف المُحلّ (في الخدمة، DB) حين المتحمِّل ≠
   * الشركة. عند ضبطه يَجُبّ حساب المصروف لهذه الشريحة (مدين ذمة الطرف بدل المصروف،
   * docs/25 §١٠). غيابه = شريحة عادية على حساب البند (المصروف/الإيراد).
   */
  overrideAccountCode?: string | null;
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
  /**
   * ج-٤ — أبعاد تُختَم على ساق المال/الطرف (الدائن في الصرف، المدين في القبض). حين
   * يكون الطرف ذمة مورّد (شراء آجل: cashAccountCode = purchase_vendor_ap) نمرّر
   * `{ vendorId }` فيُربط الالتزام بالمورّد، ويستبدله enricher الأبعاد لاحقًا بالحساب
   * الفرعي للمورّد (الحساب الخاص لكل كيان). غيابه = ساق مال بلا بُعد (السلوك السابق).
   */
  cashAccountDims?: Record<string, unknown> | null;
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
    // م٥: شريحة المتحمِّل ≠ الشركة تحمل overrideAccountCode (ذمة الطرف) فتَجُبّ حساب البند.
    type Slice = { amount: number; accountCode: string; dims?: Record<string, unknown>; entityRef: JournalLeg["entityRef"] };
    const slices: Slice[] =
      line.allocations && line.allocations.length > 0
        ? line.allocations.map((a) => ({
            amount: round2(a.amount),
            accountCode: a.overrideAccountCode || line.counterAccountCode,
            dims: {
              ...(line.dims ?? {}),
              ...(a.dims ?? {}),
              ...(a.costBearer ? { costBearer: a.costBearer } : {}),
            },
            entityRef: { entityType: a.entityType, entityId: a.entityId },
          }))
        : [{ amount: net, accountCode: line.counterAccountCode, dims: line.dims, entityRef: null }];

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
        accountCode: s.accountCode,
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
  // ج-٤: حين يكون الطرف ذمة مورّد (شراء آجل) نختِم cashAccountDims (vendorId) على الساق.
  const gross = round2(totalNet + totalVat);
  legs.push({
    accountCode: header.cashAccountCode,
    debit: isReceipt ? gross : 0,
    credit: isReceipt ? 0 : gross,
    dims:
      header.cashAccountDims && Object.keys(header.cashAccountDims).length > 0
        ? header.cashAccountDims
        : undefined,
  });

  // balance assertion (defensive)
  const totalDebit = round2(legs.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(legs.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new DocumentJournalError(`القيد غير متوازن: مدين ${totalDebit} ≠ دائن ${totalCredit}`);
  }

  return legs;
}

// ───────────────────────────────────────────────────────────────────────────
// Line resolver — raw document input → ResolvedDocLine. Computes net (qty ×
// unitPrice) + VAT (net × rate%), and normalizes each allocation's split type
// (amount / percent / quantity) into an absolute amount. Pure + testable.
// ───────────────────────────────────────────────────────────────────────────

export type RawAllocationInput = {
  entityType: string;
  entityId: number;
  allocationType: "amount" | "percent" | "quantity";
  amount?: number;
  percent?: number;
  quantity?: number;
  costBearer?: string | null;
  reason?: string | null;
  dims?: Record<string, unknown>;
  /** م٥ — حساب ذمة الطرف المُحلّ (تضبطه الخدمة حين costBearer ≠ company). */
  overrideAccountCode?: string | null;
};

export type RawDocLine = {
  lineNo: number;
  quantity: number;
  unitPrice: number;
  /** VAT rate as a percentage (e.g. 15 for 15%); 0/undefined = no VAT */
  taxRatePercent?: number;
  counterAccountCode: string;
  dims?: Record<string, unknown>;
  allocations?: RawAllocationInput[];
  // persistence metadata (financial_document_lines) — not used by the math
  itemId?: number | null;
  itemName?: string | null;
  description?: string | null;
  unit?: string | null;
  taxCodeId?: number | null;
  costCenter?: string | null;
};

/** Resolve one raw line (compute net/VAT, normalize allocation splits to amounts). */
export function resolveDocumentLine(raw: RawDocLine): ResolvedDocLine {
  const qty = Number(raw.quantity) || 0;
  const price = Number(raw.unitPrice) || 0;
  const net = round2(qty * price);
  const vat = round2(net * ((Number(raw.taxRatePercent) || 0) / 100));

  const allocations = raw.allocations?.map((a): LineAllocationInput => {
    let amount: number;
    switch (a.allocationType) {
      case "amount":
        amount = round2(Number(a.amount) || 0);
        break;
      case "percent":
        amount = round2(net * ((Number(a.percent) || 0) / 100));
        break;
      case "quantity":
        amount = round2((Number(a.quantity) || 0) * price);
        break;
      default:
        throw new DocumentJournalError(`نوع توزيع غير معروف للبند ${raw.lineNo}: ${a.allocationType}`);
    }
    return { entityType: a.entityType, entityId: a.entityId, amount, costBearer: a.costBearer, dims: a.dims, overrideAccountCode: a.overrideAccountCode };
  });

  return { lineNo: raw.lineNo, net, vat, counterAccountCode: raw.counterAccountCode, dims: raw.dims, allocations };
}

/** Resolve a whole document's raw lines. */
export function resolveDocumentLines(raws: RawDocLine[]): ResolvedDocLine[] {
  return raws.map(resolveDocumentLine);
}

// ───────────────────────────────────────────────────────────────────────────
// Persistence plan — raw document → the exact rows to INSERT into the three
// migration-418 tables (financial_document_lines, financial_line_allocations)
// plus the balanced journal legs. Pure: the DB executor becomes a thin loop
// over this plan inside one transaction. Reference: migration 418 columns.
// ───────────────────────────────────────────────────────────────────────────

/** A row destined for financial_document_lines (FKs documentId/lineId added at insert). */
export type DocumentLineRow = {
  lineNo: number;
  itemId: number | null;
  itemName: string | null;
  description: string | null;
  quantity: number;
  unit: string | null;
  unitPrice: number;
  taxCodeId: number | null;
  taxAmount: number;
  lineTotal: number;
  accountCode: string;
  costCenter: string | null;
};

/** A row destined for financial_line_allocations (lineId resolved from lineNo at insert). */
export type AllocationRow = {
  lineNo: number;
  entityType: string;
  entityId: number;
  allocationType: "amount" | "percent" | "quantity";
  amount: number | null;
  percent: number | null;
  quantity: number | null;
  costBearer: string | null;
  reason: string | null;
};

export type DocumentPersistencePlan = {
  lineRows: DocumentLineRow[];
  allocationRows: AllocationRow[];
  journalLegs: JournalLeg[];
  totals: { net: number; vat: number; gross: number };
};

/**
 * Build the full persistence plan for a unified financial document: the line
 * rows + allocation rows to store, and the balanced journal legs to post.
 * Throws (via the builders) on an unbalanced journal or a bad allocation split.
 */
export function buildDocumentPersistencePlan(
  header: DocJournalHeader,
  rawLines: RawDocLine[],
): DocumentPersistencePlan {
  const resolved = resolveDocumentLines(rawLines);
  const journalLegs = buildDocumentJournalLegs(header, resolved);

  const lineRows: DocumentLineRow[] = rawLines.map((raw, i) => {
    const r = resolved[i];
    return {
      lineNo: raw.lineNo,
      itemId: raw.itemId ?? null,
      itemName: raw.itemName ?? null,
      description: raw.description ?? null,
      quantity: Number(raw.quantity) || 0,
      unit: raw.unit ?? null,
      unitPrice: Number(raw.unitPrice) || 0,
      taxCodeId: raw.taxCodeId ?? null,
      taxAmount: r.vat,
      lineTotal: round2(r.net + r.vat),
      accountCode: raw.counterAccountCode,
      costCenter: raw.costCenter ?? null,
    };
  });

  const allocationRows: AllocationRow[] = rawLines.flatMap((raw) =>
    (raw.allocations ?? []).map((a) => ({
      lineNo: raw.lineNo,
      entityType: a.entityType,
      entityId: a.entityId,
      allocationType: a.allocationType,
      amount: a.allocationType === "amount" ? Number(a.amount) || 0 : null,
      percent: a.allocationType === "percent" ? Number(a.percent) || 0 : null,
      quantity: a.allocationType === "quantity" ? Number(a.quantity) || 0 : null,
      costBearer: a.costBearer ?? null,
      reason: a.reason ?? null,
    })),
  );

  const net = round2(resolved.reduce((s, l) => s + l.net, 0));
  const vat = round2(resolved.reduce((s, l) => s + l.vat, 0));
  return { lineRows, allocationRows, journalLegs, totals: { net, vat, gross: round2(net + vat) } };
}
