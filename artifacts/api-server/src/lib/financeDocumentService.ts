/**
 * financeDocumentService — م١-ب: post a unified financial document (قبض/صرف).
 * Reference: docs/finance-audit/25 §٢/§٦/§١١ ; issue #2994.
 *
 * Reuses the APPROVED single posting path (financialEngine.postJournalEntry —
 * constitution: ledger-posting-single-path) and adds the structured persistence
 * (financial_document_lines + financial_line_allocations + financial_attachments,
 * migration 419). The document's parent IS its journal_entry: documentId =
 * journalId (the create flow produces journal_entries, not the vouchers/expenses
 * tables). deferBalances=true keeps it a draft until approval (FIN-007 / دورة
 * الحياة §٦: المسودة لا تُرحّل قيدًا).
 *
 * The balanced multi-leg journal + the line/allocation rows come from the pure,
 * unit-tested builders in financeDocumentJournal.ts; the assertion test on the
 * resulting journal_lines lives in tests/integration/financeDocumentPost.dynamic.test.ts
 * (constitution rule 3).
 */
import { rawQuery, withTransaction } from "./rawdb.js";
import { logger } from "./logger.js";
import type { JournalEntryLine } from "./businessHelpers.js";
import {
  buildDocumentPersistencePlan,
  type RawDocLine,
  type DocJournalHeader,
  type JournalLeg,
} from "./financeDocumentJournal.js";

export type DocumentAttachmentInput = {
  url: string;
  fileName?: string | null;
  mimeType?: string | null;
  documentType?: string | null;
  serialNo?: string | null;
  status?: "linked" | "needs_replace" | "pending";
  /** when set, ties the attachment to that line (financial_line); else document-level */
  lineNo?: number | null;
};

export type FinancialDocumentInput = {
  companyId: number;
  branchId: number | null;
  createdBy: number;
  documentKind: "voucher" | "expense";
  direction: "receipt" | "payment";
  cashAccountCode: string;
  vatAccountCode?: string | null;
  /** ج-٤ — أبعاد ساق المال/الطرف (مثل { vendorId } للشراء الآجل على ذمة المورّد). */
  cashAccountDims?: Record<string, unknown> | null;
  ref: string;
  description: string;
  /** idempotency key (replay returns the existing journal without re-inserting) */
  sourceKey: string;
  postingDate?: string;
  rawLines: RawDocLine[];
  attachments?: DocumentAttachmentInput[];
  /** header metadata applied by the engine (relatedEntity / attachment / operationType…) */
  headerMeta?: Record<string, unknown>;
};

export type PostFinancialDocumentResult = {
  journalId: number;
  alreadyExists: boolean;
  documentLineIds: number[];
};

/** Map an allocation's entityType to the canonical journal_lines dimension column. */
const ENTITY_DIM_COLUMN: Record<string, keyof JournalEntryLine> = {
  vehicle: "vehicleId",
  employee: "employeeId",
  property: "propertyId",
  unit: "unitId",
  project: "projectId",
  contract: "contractId",
  client: "clientId",
  customer: "clientId",
  vendor: "vendorId",
  supplier: "vendorId",
  driver: "driverId",
  asset: "assetId",
};

/** Known JournalEntryLine dimension keys we forward straight from leg.dims. */
const FORWARDED_DIM_KEYS: (keyof JournalEntryLine)[] = [
  "costCenter", "costCenterId", "departmentId", "projectId", "employeeId",
  "vehicleId", "propertyId", "contractId", "productId", "clientId",
  "vendorId", "driverId", "unitId", "assetId", "umrahSeasonId", "umrahAgentId",
  "activityType",
];

/** Convert one balanced leg into the engine's JournalEntryLine (dims + costBearer bag). */
function legToJournalLine(leg: JournalLeg): JournalEntryLine {
  const line: JournalEntryLine = {
    accountCode: leg.accountCode,
    debit: leg.debit,
    credit: leg.credit,
  };
  const dims = leg.dims ?? {};
  for (const k of FORWARDED_DIM_KEYS) {
    const v = (dims as Record<string, unknown>)[k as string];
    if (v != null && v !== "") (line as unknown as Record<string, unknown>)[k as string] = v;
  }
  if (leg.entityRef) {
    const col = ENTITY_DIM_COLUMN[leg.entityRef.entityType];
    if (col) (line as unknown as Record<string, unknown>)[col as string] = leg.entityRef.entityId;
  }
  // costBearer has no dedicated journal_lines column → carry it in the dim bag.
  if (dims["costBearer"]) line.dimensionJson = { costBearer: dims["costBearer"] };
  return line;
}

/**
 * Post a unified financial document: derive + post the balanced journal (draft,
 * deferred balances), then persist the structured lines/allocations/attachments
 * linked to that journal. Idempotent via sourceKey.
 */
// م٥ — تفريع costBearer: لكل نوع متحمِّل (≠ الشركة) عمليةُ نية + حساب ذمة احتياطي
// (يطابق seed الهجرة 422). يحلّها المحرّك لحساب قابل للترحيل لكل شركة.
const COST_BEARER_RECEIVABLE: Record<string, { op: string; fallback: string }> = {
  driver:      { op: "cost_bearer_receivable_driver",      fallback: "1143" },
  employee:    { op: "cost_bearer_receivable_employee",    fallback: "1143" },
  tenant:      { op: "cost_bearer_receivable_tenant",      fallback: "1131" },
  customer:    { op: "cost_bearer_receivable_customer",    fallback: "1131" },
  supplier:    { op: "cost_bearer_receivable_supplier",    fallback: "1190" },
  insurance:   { op: "cost_bearer_receivable_insurance",   fallback: "1191" },
  third_party: { op: "cost_bearer_receivable_third_party", fallback: "1192" },
};

/**
 * م٥ — لكل توزيع متحمِّله ≠ الشركة: حُلّ حساب ذمة الطرف المدين (DB) واضبط
 * overrideAccountCode فيَجُبّ حساب المصروف لتلك الشريحة عند بناء القيد (§١٠).
 * متحمِّل غير معروف يبقى على حساب البند (لا تحويل، لا fallback صامت لحساب خاطئ).
 */
async function resolveCostBearerAccounts(
  companyId: number,
  rawLines: RawDocLine[],
  engine: { resolveAccountCode: (c: number, op: string, side: "debit" | "credit", fb: string) => Promise<string> },
): Promise<void> {
  for (const line of rawLines) {
    for (const a of line.allocations ?? []) {
      const cb = a.costBearer;
      if (!cb || cb === "company") continue;
      const m = COST_BEARER_RECEIVABLE[cb];
      if (!m) continue;
      a.overrideAccountCode = await engine.resolveAccountCode(companyId, m.op, "debit", m.fallback);
    }
  }
}

/**
 * ج-١ — مُعرِّف بُعد الطرف لكل نوع متحمِّل يحمل طرفًا محدَّدًا (سائق/موظف). الباقي
 * (insurance/customer/tenant/third_party/supplier) أطرافٌ خارجية تُتابَع على كيان
 * التوزيع نفسه (لا مُعرِّف طرف داخلي في الأبعاد).
 */
const COST_BEARER_PARTY_DIM: Record<string, string> = {
  driver: "driverId",
  employee: "employeeId",
};

/**
 * ج-١ — حُلّ الطرف الذي تُربط به مطالبة الاسترداد. حين يحمل التوزيع مُعرِّف الطرف
 * المطابق لنوع المتحمِّل (سائق→driverId، موظف→employeeId) نربط الالتزام بذلك الطرف
 * **بعينه** (لا بكيان التوزيع العام، مثلاً المركبة). وإلا نسقط لكيان التوزيع — أدقّ
 * مرجع متاح، وهو السلوك السابق. دالة نقية — مُصدَّرة للاختبار.
 */
export function resolveObligationParty(
  costBearer: string,
  allocation: { entityType: string; entityId: number; dims?: Record<string, unknown> | null },
): { entityType: string; entityId: number } {
  const dimKey = COST_BEARER_PARTY_DIM[costBearer];
  if (dimKey) {
    const raw = (allocation.dims ?? {})[dimKey];
    const id = typeof raw === "number" && Number.isInteger(raw) && raw > 0 ? raw : null;
    if (id) return { entityType: costBearer, entityId: id };
  }
  return { entityType: allocation.entityType, entityId: allocation.entityId };
}

/**
 * م٥-ب — لكل توزيع متحمِّله ≠ الشركة: سجّل **التزامًا متابَعًا** (مطالبة استرداد)
 * عبر obligationsEngine (docs/25 §١٠ «متابعة حتى التسوية»). يُربط بالطرف المحدّد
 * (سائق/موظف عبر resolveObligationParty — ج-١) وإلا بكيان التوزيع. أفضل-جهد بعد
 * ترحيل القيد (لا يُفشِل المستند المُرحَّل)، وidempotent عبر dedupeKey.
 */
async function registerCostBearerObligations(input: FinancialDocumentInput, journalId: number): Promise<void> {
  const parties = input.rawLines.flatMap((line) =>
    (line.allocations ?? [])
      .filter((a) => a.costBearer && a.costBearer !== "company")
      .map((a) => ({ line, a })),
  );
  if (parties.length === 0) return;
  const { registerObligation } = await import("./obligationsEngine.js");
  const due = input.postingDate ? new Date(input.postingDate) : new Date();
  due.setDate(due.getDate() + 30); // متابعة بعد ٣٠ يومًا
  const dueAt = due.toISOString().slice(0, 10);
  for (const { line, a } of parties) {
    // ج-١ — اربط الالتزام بالطرف المحدّد (سائق/موظف) حين يحمله التوزيع، لا بكيان التوزيع
    // العام؛ ويبقى كيان التوزيع موثّقًا في metadata.allocationEntity للتتبّع.
    const party = resolveObligationParty(a.costBearer as string, a);
    await registerObligation({
      companyId: input.companyId,
      branchId: input.branchId,
      entityType: party.entityType,
      entityId: party.entityId,
      obligationType: "follow_up",
      title: `مطالبة استرداد (${a.costBearer}) على ${party.entityType}#${party.entityId} — ${input.ref}`,
      dueAt,
      dedupeKey: `costbearer:${input.sourceKey}:${line.lineNo}:${party.entityType}:${party.entityId}:${a.costBearer}`,
      metadata: { journalId, costBearer: a.costBearer, ref: input.ref, reason: a.reason ?? null, documentKind: input.documentKind, allocationEntity: { type: a.entityType, id: a.entityId } },
    }).catch((e) => logger.error(e, "م٥ obligation registration failed for one allocation"));
  }
}

export async function postFinancialDocument(
  input: FinancialDocumentInput,
): Promise<PostFinancialDocumentResult> {
  const header: DocJournalHeader = {
    direction: input.direction,
    cashAccountCode: input.cashAccountCode,
    vatAccountCode: input.vatAccountCode ?? null,
    cashAccountDims: input.cashAccountDims ?? null,
  };
  const { financialEngine } = await import("./engines/index.js");
  // م٥ — حُلّ حساب ذمة الطرف لكل توزيع متحمِّله ≠ الشركة قبل بناء الخطة (§١٠).
  await resolveCostBearerAccounts(input.companyId, input.rawLines, financialEngine);

  // pure + unit-tested: throws on an unbalanced journal or bad allocation split.
  const plan = buildDocumentPersistencePlan(header, input.rawLines);

  const result = await withTransaction(async () => {
    const posted = await financialEngine.postJournalEntry({
      companyId: input.companyId,
      branchId: input.branchId ?? 0,
      createdBy: input.createdBy,
      ref: input.ref,
      description: input.description,
      sourceType: input.documentKind,
      sourceId: 0,
      sourceKey: input.sourceKey,
      lines: plan.journalLegs.map(legToJournalLine),
      deferBalances: true, // draft — balances apply on approval (FIN-007)
      postingDate: input.postingDate,
      headerMeta: input.headerMeta as never,
    });

    // Idempotent replay: the journal already exists → the document rows were
    // inserted by the original call; do not duplicate them.
    if (posted.alreadyExists) {
      const existing = await rawQuery<{ id: number }>(
        `SELECT id FROM financial_document_lines
          WHERE "companyId" = $1 AND "documentKind" = $2 AND "documentId" = $3
          ORDER BY "lineNo" ASC`,
        [input.companyId, input.documentKind, posted.journalId],
      );
      return { journalId: posted.journalId, alreadyExists: true, documentLineIds: existing.map((r) => r.id) };
    }

    // 1) document lines (documentId = the journal entry id)
    const lineIdByNo = new Map<number, number>();
    const documentLineIds: number[] = [];
    for (const row of plan.lineRows) {
      const [inserted] = await rawQuery<{ id: number }>(
        `INSERT INTO financial_document_lines
           ("companyId","branchId","documentKind","documentId","lineNo","itemId","itemName",
            "description","quantity","unit","unitPrice","taxCodeId","taxAmount","lineTotal",
            "accountCode","costCenter")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         RETURNING id`,
        [
          input.companyId, input.branchId, input.documentKind, posted.journalId, row.lineNo,
          row.itemId, row.itemName, row.description, row.quantity, row.unit, row.unitPrice,
          row.taxCodeId, row.taxAmount, row.lineTotal, row.accountCode, row.costCenter,
        ],
      );
      lineIdByNo.set(row.lineNo, inserted.id);
      documentLineIds.push(inserted.id);
    }

    // 2) line allocations (split across entities) — companyId matches the line (composite FK)
    for (const a of plan.allocationRows) {
      const lineId = lineIdByNo.get(a.lineNo);
      if (lineId == null) continue;
      await rawQuery(
        `INSERT INTO financial_line_allocations
           ("companyId","branchId","lineId","entityType","entityId","allocationType",
            "amount","percent","quantity","costBearer","reason")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          input.companyId, input.branchId, lineId, a.entityType, a.entityId, a.allocationType,
          a.amount, a.percent, a.quantity, a.costBearer, a.reason,
        ],
      );
    }

    // 3) attachments (document-level when lineNo is null; else line-level via lineId)
    for (const att of input.attachments ?? []) {
      const lineId = att.lineNo != null ? lineIdByNo.get(att.lineNo) ?? null : null;
      await rawQuery(
        `INSERT INTO financial_attachments
           ("companyId","branchId","documentKind","documentId","lineId","url","fileName",
            "mimeType","documentType","serialNo","status")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          input.companyId, input.branchId, input.documentKind, posted.journalId, lineId,
          att.url, att.fileName ?? null, att.mimeType ?? null, att.documentType ?? null,
          att.serialNo ?? null, att.status ?? "linked",
        ],
      );
    }

    return { journalId: posted.journalId, alreadyExists: false, documentLineIds };
  });

  // م٥-ب — سجّل التزامات المتابعة بعد نجاح الترحيل (أفضل-جهد، لا يُكرَّر عند الإعادة).
  if (!result.alreadyExists) {
    await registerCostBearerObligations(input, result.journalId).catch((e) =>
      logger.error(e, "م٥ obligation registration failed"),
    );
  }
  return result;
}
