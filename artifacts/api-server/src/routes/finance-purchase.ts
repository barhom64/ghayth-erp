import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  IntegrationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { checkAccess } from "../lib/rbac/authzEngine.js";
import { issueNumber } from "../lib/numberingService.js";
import {
  emitEvent,
  createAuditLog,
  initiateApprovalChain,
  updateBudgetUsed,
  validateBudget,
  checkFinancialPeriodOpen,
  computeVat,
  getCompanyVatRate,
  roundTo2,
  currentYear,
  todayISO,
  toDateISO,
} from "../lib/businessHelpers.js";
import { submitWorkflow } from "../lib/workflowEngine.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { OWNER_GM_ROLES } from "../lib/rbacCatalog.js";
import { registerObligation } from "../lib/obligationsEngine.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { assertNotSelfApproval } from "../lib/rbac/selfApprovalCreators.js";
import { markIdempotencyReplay, requestIdempotencyToken, boundedIdempotencyToken } from "../lib/requestIdempotency.js";
import { assertDocumentBranchAccess } from "../lib/branchResolution.js";
import { z } from "zod";

// عقد قائد/خادم (#2839): إعادة إسناد أوامر الشراء المفتوحة لفرع بديل. مسار
// الإعدادات يُنسّق تعطيل الفرع، لكن **الكتابة** في جدول المالية المملوك
// (purchase_orders) تبقى هنا في المسار القائد (المالية). يعمل ضمن المعاملة
// المحيطة (rawExecute ينضمّ لـ txStore) فتبقى ذرّية مع تعطيل الفرع.
export async function reassignOpenPurchaseOrdersToBranch(
  companyId: number,
  fromBranchId: number,
  toBranchId: number,
): Promise<void> {
  await rawExecute(
    `UPDATE purchase_orders SET "branchId" = $1 WHERE "branchId" = $2 AND status NOT IN ('cancelled','received','completed') AND "companyId" = $3 AND "deletedAt" IS NULL`,
    [toBranchId, fromBranchId, companyId],
  );
}

export const purchaseRouter = Router();
purchaseRouter.use(authMiddleware);

// Phase 4 P1 — purchase lines carry the same dimensional + allocation
// payload as invoice_lines (migration 202). `lineTreatment` decides
// which expense/asset/inventory bucket the GRN posting routes the
// line into; the other fields populate the dimensions that flow
// through to journal_lines for analytical reports.
const PURCHASE_LINE_TREATMENTS = [
  "inventory", "expense", "fixed_asset", "project_cost", "vehicle_cost",
  "property_maintenance", "custody", "prepayment", "service",
] as const;

// #1945 FIN-SUB-01 (#2097) — GRN per-line treatment → default DR account
// purpose. Two literals were wrong on the real SOCPA chart (and the default
// seed, which is identical): `inventory`→1250 is *leasehold improvements* (a
// fixed asset, NOT inventory) and `custody`→1130 is the AR control header.
// Corrected to the real control accounts; the `*_receipt`/`employee_custody`
// intents (in MAPPING_INTENT) resolve the postable leaf on any tenant chart,
// so the literal is only a last-resort fallback. Module scope so the
// pre-flight enforcement and the posting path share ONE source of truth.
const GRN_TREATMENT_PURPOSE: Record<string, { purpose: string; side: "debit"; defaultCode: string }> = {
  inventory:            { purpose: "inventory_receipt",            side: "debit", defaultCode: "1150" },
  expense:              { purpose: "general_expense",              side: "debit", defaultCode: "6900" },
  fixed_asset:          { purpose: "fixed_asset_purchase",         side: "debit", defaultCode: "1280" },
  project_cost:         { purpose: "project_cost",                 side: "debit", defaultCode: "6800" },
  vehicle_cost:         { purpose: "vehicle_expense",              side: "debit", defaultCode: "6500" },
  property_maintenance: { purpose: "property_maintenance_expense", side: "debit", defaultCode: "6600" },
  custody:              { purpose: "employee_custody",             side: "debit", defaultCode: "1142" },
  prepayment:           { purpose: "supplier_prepayment",          side: "debit", defaultCode: "1170" },
  service:              { purpose: "service_expense",              side: "debit", defaultCode: "6920" },
};

// Required chart nature per treatment. Asset-bearing treatments must hit the
// balance sheet; cost treatments the P&L; project_cost may be either (direct
// expense or WIP/CIP capitalisation).
const GRN_TREATMENT_ACCOUNT_NATURE: Record<string, string[]> = {
  inventory:            ["asset"],
  fixed_asset:          ["asset"],
  prepayment:           ["asset"],
  custody:              ["asset"],
  expense:              ["expense"],
  service:              ["expense"],
  vehicle_cost:         ["expense"],
  property_maintenance: ["expense"],
  project_cost:         ["expense", "asset"],
};

/** Resolve the DR account a GRN line will post to — the SAME chain the posting
 *  path uses: allocation rule/manual pin → treatment-purpose map → default
 *  inventory account. Shared so the pre-flight gate can never diverge from the
 *  actual posting. */
async function resolveGrnDrAccount(
  companyId: number,
  line: { lineTreatment: string | null; accountCode: string | null; costCenterId: number | null; dims: Record<string, number | null>; sourceTable: string; sourceLineId: number },
  vendorId: number | null,
  fe: { resolveAccountCode: (c: number, op: string, side: "debit" | "credit", fb: string) => Promise<string> },
  resolveLineAllocation: (typeof import("../lib/accountingAllocation.js"))["resolveLineAllocation"],
  defaultInvAccount: string,
): Promise<string> {
  const res = await resolveLineAllocation({
    companyId, documentType: "grn", lineType: line.lineTreatment ?? undefined, entityType: "vendor",
    accountCode: line.accountCode, costCenterId: line.costCenterId,
    dimensions: { ...line.dims, vendorId } as any,
    sourceTable: line.sourceTable, sourceLineId: line.sourceLineId,
  } as any);
  let acct = res.resolvedAccountCode;
  if (!acct && line.lineTreatment) {
    const map = GRN_TREATMENT_PURPOSE[line.lineTreatment];
    if (map) acct = await fe.resolveAccountCode(companyId, map.purpose, map.side, map.defaultCode);
  }
  return acct ?? defaultInvAccount;
}

/**
 * #1945 FIN-SUB-01 (#2097) — ENFORCE treatment ↔ account nature, BEFORE any
 * write. Each received line's treatment (and the preview the operator saw)
 * must match the chart nature of the account it actually posts to:
 *   inventory / fixed_asset / prepayment / custody → asset (balance sheet)
 *   expense / service / vehicle_cost / property_maintenance → expense (P&L)
 *   project_cost → expense OR asset (expensed or capitalised to WIP/CIP)
 * A mismatch (e.g. a fixed-asset line on an expense account via a stale pin or
 * a misconfigured rule) throws 422 — run as a PRE-FLIGHT before the GRN row,
 * its items, or receivedQty are touched, so a rejection leaves ZERO trace
 * (full success or full rejection). Reads live chart types — no hardcoded codes.
 */
async function assertGrnTreatmentNature(
  companyId: number,
  vendorId: number | null,
  lines: Array<{ label: string; lineTreatment: string | null; accountCode: string | null; costCenterId: number | null; dims: Record<string, number | null>; sourceTable: string; sourceLineId: number }>,
): Promise<void> {
  const constrained = lines.filter((l) => l.lineTreatment && GRN_TREATMENT_ACCOUNT_NATURE[l.lineTreatment]);
  if (constrained.length === 0) return;

  const { financialEngine } = await import("../lib/engines/index.js");
  const { resolveLineAllocation } = await import("../lib/accountingAllocation.js");
  const defaultInvAccount = await financialEngine.resolveAccountCode(companyId, "inventory_receipt", "debit", "1151");

  const resolved = await Promise.all(
    constrained.map(async (l) => ({ line: l, acct: await resolveGrnDrAccount(companyId, l, vendorId, financialEngine, resolveLineAllocation, defaultInvAccount) })),
  );
  const distinctCodes = [...new Set(resolved.map((r) => r.acct))];
  const typeRows = await rawQuery<{ code: string; type: string; name: string }>(
    `SELECT code, type, name FROM chart_of_accounts
      WHERE "companyId" = $1 AND code = ANY($2::text[]) AND "deletedAt" IS NULL`,
    [companyId, distinctCodes],
  );
  const accByCode = new Map(typeRows.map((r) => [r.code, { type: r.type, name: r.name }]));

  const violations = resolved
    .map((r) => {
      const allowed = GRN_TREATMENT_ACCOUNT_NATURE[r.line.lineTreatment!];
      const acc = accByCode.get(r.acct);
      if (!acc) return null; // missing account → createJournalEntry rejects it later with its own message
      if (allowed.includes(acc.type)) return null;
      return { label: r.line.label, treatment: r.line.lineTreatment!, acct: r.acct, accName: acc.name, accType: acc.type, allowed };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);

  if (violations.length > 0) {
    const v = violations[0];
    const natureAr: Record<string, string> = { asset: "أصل/ميزانية", liability: "التزام", equity: "حقوق ملكية", revenue: "إيراد", expense: "مصروف" };
    const treatmentAr: Record<string, string> = {
      inventory: "مخزون", fixed_asset: "أصل ثابت", prepayment: "مدفوع مقدماً", custody: "عهدة",
      expense: "مصروف", service: "خدمة", vehicle_cost: "تكلفة مركبة", property_maintenance: "صيانة عقار", project_cost: "تكلفة مشروع",
    };
    throw new ValidationError(
      `معالجة «${treatmentAr[v.treatment] ?? v.treatment}» للبند «${v.label}» لا يجوز ترحيلها على حساب ${natureAr[v.accType] ?? v.accType} «${v.acct} ${v.accName}» — ` +
      `المتوقَّع حساب ${v.allowed.map((t) => natureAr[t] ?? t).join(" أو ")}.`,
      {
        field: "items",
        fix: "اختر للبند حسابًا من النوع المطابق لمعالجته (مخزون→حساب مخزون، أصل→حساب أصول/ميزانية، مصروف→حساب مصروف) أو صحّح معالجة البند.",
        meta: { violations },
      } as any,
    );
  }
}

const purchaseLineDimsSchema = {
  accountId: z.coerce.number().optional(),
  accountCode: z.string().optional(),
  costCenterId: z.coerce.number().optional(),
  lineTreatment: z.enum(PURCHASE_LINE_TREATMENTS).optional(),
  activityType: z.string().optional(),
  projectId: z.coerce.number().optional(),
  vehicleId: z.coerce.number().optional(),
  propertyId: z.coerce.number().optional(),
  unitId: z.coerce.number().optional(),
  assetId: z.coerce.number().optional(),
  employeeId: z.coerce.number().optional(),
  driverId: z.coerce.number().optional(),
  contractId: z.coerce.number().optional(),
  taxCode: z.string().optional(),
  allocationRuleId: z.coerce.number().optional(),
  dimensionJson: z.record(z.any()).optional(),
  manualOverrideReason: z.string().optional(),
};

const createPurchaseRequestSchema = z.object({
  items: z.array(z.object({
    description: z.string().optional(),
    quantity: z.coerce.number().optional(),
    unitPrice: z.coerce.number().nonnegative().optional(),
    productId: z.coerce.number().optional(),
    ...purchaseLineDimsSchema,
  })).min(1, "يجب إضافة بند واحد على الأقل").max(1000, "عدد بنود الطلب يتجاوز الحدّ المسموح (1000)"),
  supplierId: z.coerce.number().optional(),
  notes: z.string().optional(),
  expectedDate: z.string().optional(),
  expectedDelivery: z.string().optional(),
  costCenter: z.string().optional(),
});

const createPurchaseOrderSchema = z.object({
  supplierId: z.coerce.number({ required_error: "المورد مطلوب" }),
  totalAmount: z.coerce.number().optional(),
  vatAmount: z.coerce.number().optional(),
  notes: z.string().optional(),
  expectedDelivery: z.string().optional(),
  branchId: z.coerce.number().optional().nullable(),
  companyId: z.coerce.number().optional().nullable(),
  items: z.array(z.any()).optional(),
});

const executePaymentRunSchema = z.object({
  poIds: z.array(z.coerce.number()).min(1, "يجب اختيار أمر شراء واحد على الأقل"),
  paymentDate: z.string().optional(),
  method: z.string().optional(),
  reference: z.string().optional(),
  bankAccount: z.string().optional(),
});

const purchaseImpactPreviewSchema = z.object({
  supplierId: z.coerce.number().optional(),
  items: z.array(z.any()).optional(),
  costCenter: z.string().optional(),
});

const prApprovalSchema = z.object({
  approved: z.union([z.boolean(), z.literal("returned"), z.string()]),
  notes: z.string().optional(),
});

const poApprovalNotesSchema = z.object({
  notes: z.string().optional(),
});

const poReceiveSchema = z.object({
  receivedDate: z.string().optional(),
  qualityNotes: z.string().optional(),
  lines: z.array(z.object({
    poItemId: z.coerce.number(),
    receivedQty: z.coerce.number().optional(),
    notes: z.string().optional(),
  })).optional(),
});

const convertToPOSchema = z.object({
  expectedDelivery: z.string().optional(),
  notes: z.string().optional(),
});

const vendorConfirmSchema = z.object({
  confirmedDelivery: z.string().optional(),
  notes: z.string().optional(),
});

const matchInvoiceSchema = z.object({
  supplierInvoiceRef: z.string().min(1, "رقم فاتورة المورد مطلوب"),
  invoicedAmount: z.coerce.number({ required_error: "المبلغ مطلوب" }),
  invoicedDate: z.string().optional(),
});

const schedulePaymentSchema = z.object({
  paymentDate: z.string().min(1, "تاريخ الدفع مطلوب"),
  amount: z.coerce.number({ required_error: "المبلغ مطلوب" }),
  method: z.string().optional(),
  notes: z.string().optional(),
});

// Vendor advance / credit-memo — the AP mirror of customer-advance +
// credit-memo. Previously the only path for a supplier prepayment was
// "create AR invoice with negative amount" (semantically wrong, broke
// AP aging). And vendor returns had to be entered as customer credit
// memos against an AR invoice — corrupting both subledgers.
const createVendorAdvanceSchema = z.object({
  supplierId: z.coerce.number({ required_error: "المورد مطلوب" }),
  amount: z.coerce.number().positive("المبلغ مطلوب"),
  method: z.string().optional(),
  reference: z.string().optional(),
  notes: z.string().optional(),
  paidDate: z.string().optional(),
});

const applyVendorAdvanceSchema = z.object({
  poId: z.coerce.number({ required_error: "أمر الشراء مطلوب" }),
  amount: z.coerce.number().positive("المبلغ مطلوب"),
});

const createVendorCreditSchema = z.object({
  supplierId: z.coerce.number({ required_error: "المورد مطلوب" }),
  poId: z.coerce.number().optional(),
  amount: z.coerce.number().positive("المبلغ مطلوب"),
  reason: z.string().min(3, "سبب الإشعار الدائن مطلوب"),
  memoDate: z.string().optional(),
  vatIncluded: z.boolean().optional(),
});

const applyVendorCreditSchema = z.object({
  poId: z.coerce.number({ required_error: "أمر الشراء مطلوب" }),
  amount: z.coerce.number().positive("المبلغ مطلوب"),
});

// Impact preview — shows what will happen when the purchase request is created
purchaseRouter.post("/purchase-requests/impact-preview", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(purchaseImpactPreviewSchema.safeParse(req.body ?? {}));
    // as-any-reason: justified-pragmatic - zodParse inferred type is widened so subsequent destructure/index accesses do not require explicit per-field generics; behavior unchanged
    const { supplierId, items = [], costCenter } = b as any;

    let supplierName = "";
    let outstanding = 0;
    if (supplierId) {
      const [supplier] = await rawQuery<Record<string, unknown>>(
        `SELECT name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [Number(supplierId), scope.companyId]
      );
      supplierName = (supplier?.name as string | undefined) || "";
      const [row] = await rawQuery<Record<string, unknown>>(
        `SELECT COALESCE(SUM("totalAmount"),0)::numeric AS outstanding
         FROM purchase_orders
         WHERE "supplierId" = $1 AND "companyId" = $2
           AND "deletedAt" IS NULL
           AND status NOT IN ('paid','cancelled','completed')`,
        [Number(supplierId), scope.companyId]
      );
      outstanding = Number(row?.outstanding || 0);
    }

    const totalAmount = (Array.isArray(items) ? items : []).reduce(
      (sum: number, l: any) => sum + Number(l?.quantity || 0) * Number(l?.unitPrice || 0),
      0
    );

    const impactItems: Array<{ category: string; label: string; value: string; severity: "info" | "warning" | "danger" | "success" }> = [];

    impactItems.push({
      category: "مالي",
      label: "الالتزام المالي",
      value: `${totalAmount.toLocaleString("ar-SA")} ر.س${supplierName ? ` للمورد ${supplierName}` : ""}`,
      severity: "info",
    });

    impactItems.push({
      category: "مسار الاعتماد",
      label: "الموافقات المطلوبة",
      value: totalAmount >= 50000
        ? "اعتماد مالي + مدير عام (مبلغ كبير)"
        : totalAmount >= 5000
        ? "اعتماد مالي"
        : "اعتماد مباشر من المدير",
      severity: totalAmount >= 50000 ? "warning" : "info",
    });

    if (outstanding > 0) {
      impactItems.push({
        category: "المورد",
        label: "التزامات قائمة",
        value: `${outstanding.toLocaleString("ar-SA")} ر.س مستحق للمورد قبل هذا الطلب`,
        severity: outstanding > totalAmount * 5 ? "warning" : "info",
      });
    }

    if (costCenter) {
      impactItems.push({
        category: "الميزانية",
        label: "مركز التكلفة",
        value: `سيتم خصم المبلغ من ميزانية ${costCenter}`,
        severity: "info",
      });
    }

    impactItems.push({
      category: "ما بعد الاعتماد",
      label: "أمر شراء",
      value: "سيتم إنشاء أمر شراء تلقائياً بعد اعتماد الطلب",
      severity: "info",
    });

    res.json({
      actionType: "create_purchase_request",
      employeeId: 0,
      employeeName: supplierName,
      items: impactItems,
      summary: `طلب شراء بقيمة ${totalAmount.toLocaleString("ar-SA")} ر.س جاهز للتقديم`,
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ في معاينة أثر الطلب");
  }
});

purchaseRouter.get("/purchase-requests", authorize({ feature: "finance.purchase", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'pr."companyId"', branchColumn: 'pr."branchId"', enforceBranchScope: true, includeNullBranch: true });
    const { status: filterStatus, page = "1", limit: lim = "20" } = req.query as Record<string, string | undefined>;
    const safeLimPR = Math.min(Number(lim) || 50, 500);

    let extraWhere = "";
    let paramIdx = nextParamIndex;
    if (filterStatus) { params.push(filterStatus); extraWhere += ` AND pr.status = $${paramIdx++}`; }

    const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLimPR;
    params.push(safeLimPR);
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT pr.id, pr.ref, pr.status, pr."totalAmount", pr."createdAt", pr.notes, pr."requestedBy", pr."supplierId",
              s.name AS "supplierName", e.name AS "requestedByName",
              json_agg(pri.*) FILTER (WHERE pri.id IS NOT NULL) AS items
       FROM purchase_requests pr
       LEFT JOIN suppliers s ON s.id = pr."supplierId" AND s."deletedAt" IS NULL
       LEFT JOIN employee_assignments ea ON ea.id = pr."requestedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId" AND e."companyId" = ea."companyId" AND e."deletedAt" IS NULL
       LEFT JOIN purchase_request_items pri ON pri."requestId" = pr.id
       WHERE ${where}${extraWhere}
       GROUP BY pr.id, pr.ref, pr.status, pr."totalAmount", pr."createdAt", pr.notes, pr."requestedBy", pr."supplierId", s.name, e.name
       ORDER BY pr."createdAt" DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) AS total FROM purchase_requests pr WHERE ${where}${extraWhere}`, countParams);

    res.json(maskFields(req, { data: rows, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) }));
  } catch (err) {
    handleRouteError(err, res, "List purchase requests error:");
  }
});

purchaseRouter.post("/purchase-requests", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;


    // as-any-reason: justified-pragmatic - zodParse inferred type is widened so subsequent destructure/index accesses do not require explicit per-field generics; behavior unchanged
    const b = zodParse(createPurchaseRequestSchema.safeParse(req.body)) as any;

    // The frontend create-form (purchase-orders-create.tsx) sends
    // `expectedDelivery` + items with `productId`, while the API
    // historically accepted `expectedDate` + items with `itemName`.
    // Accept BOTH conventions so the frontend is not silently saving
    // lines named "بند" and losing the delivery date.
    const { items, supplierId, notes, costCenter } = b;
    const expectedDate = b.expectedDate ?? b.expectedDelivery ?? null;

    const totalAmount = items.reduce((sum: number, i: any) => sum + Number(i.quantity ?? 1) * Number(i.unitPrice ?? 0), 0);
    if (totalAmount <= 0) { throw new ValidationError("إجمالي الطلب يجب أن يكون أكبر من صفر"); return; }

    // Resolve product names in bulk for any items that only sent a
    // productId so purchase_request_items.itemName reflects the actual
    // product the buyer picked instead of the fallback placeholder.
    const productIds = Array.from(
      new Set(
        items
          .map((i: { productId?: unknown }) => Number(i.productId))
          .filter((id: number) => Number.isFinite(id) && id > 0)
      )
    );
    const productNameById = new Map<number, string>();
    if (productIds.length > 0) {
      const productRows = await rawQuery<{ id: number; name: string }>(
        `SELECT id, name FROM store_products WHERE id = ANY($1) AND "companyId" = $2`,
        [productIds, scope.companyId]
      ).catch((e) => { logger.error(e, "finance purchase query failed"); return [] as { id: number; name: string }[]; });
      for (const p of productRows) productNameById.set(Number(p.id), p.name);
    }

    if (supplierId) {
      const [sup] = await rawQuery<{ id: number }>(`SELECT id FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`, [supplierId, scope.companyId]);
      if (!sup) throw new ValidationError("المورد غير موجود", { field: "supplierId", fix: "اختر مورداً من قائمة الموردين." });
    }

    // Numbering center (Issue #1141) — atomic issue + INSERT + linkback.
    // Scheme: `purchase.purchase_request`.
    const atomic = await withTransaction(async () => {
      const issued = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "purchase",
        entityKey: "purchase_request",
        entityTable: "purchase_requests",
        actorId: scope.userId,
        expectedTiming: "on_draft",
      });
      const result = await rawExecute(
        `INSERT INTO purchase_requests ("companyId","branchId","requestedBy",ref,status,"totalAmount","supplierId",notes,"expectedDelivery","costCenter")
         VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9)`,
        [scope.companyId, scope.branchId, scope.activeAssignmentId, issued.number, totalAmount, supplierId ?? null, notes ?? null, expectedDate ?? null, costCenter ?? null]
      );
      assertInsert(result.insertId, "purchase_requests");
      await rawExecute(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [result.insertId, issued.assignmentId]
      );
      return { insertId: result.insertId, ref: issued.number };
    });
    const insertId = atomic.insertId;
    const ref = atomic.ref;

    if (Array.isArray(items) && items.length > 0) {
      // Phase 4 P1 — carry the full dimensional + lineTreatment payload
      // so the eventual GRN posting can route each line to the right
      // expense/asset bucket. 23 columns including the 17 new fields
      // from migration 202. Lines without lineTreatment land
      // allocationStatus='unmapped' and need operator action before
      // GRN approval (Phase 4.2).
      const COLS_PER_ROW = 23;
      const valuesSql: string[] = [];
      const params: unknown[] = [];
      for (const item of items) {
        const base = params.length;
        valuesSql.push(
          `(${Array.from({ length: COLS_PER_ROW }, (_, i) => `$${base + i + 1}`).join(",")})`
        );
        const resolvedName =
          item.itemName ||
          item.description ||
          (item.productId ? productNameById.get(Number(item.productId)) : undefined) ||
          "بند";
        const hasAllocation = item.accountCode || item.accountId || item.lineTreatment;
        params.push(
          insertId,
          resolvedName,
          Number(item.quantity ?? 1),
          Number(item.unitPrice ?? 0),
          Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0),
          item.notes ?? null,
          item.productId ?? null,
          item.accountId ?? null,
          item.accountCode ?? null,
          item.costCenterId ?? null,
          item.lineTreatment ?? null,
          item.activityType ?? null,
          item.projectId ?? null,
          item.vehicleId ?? null,
          item.propertyId ?? null,
          item.unitId ?? null,
          item.assetId ?? null,
          item.employeeId ?? null,
          item.driverId ?? null,
          item.contractId ?? null,
          item.taxCode ?? null,
          item.allocationRuleId ?? null,
          hasAllocation ? "resolved" : "unmapped",
        );
      }
      await rawExecute(
        `INSERT INTO purchase_request_items (
           "requestId",name,quantity,"unitPrice","totalPrice",notes,
           "productId","accountId","accountCode","costCenterId","lineTreatment","activityType",
           "projectId","vehicleId","propertyId","unitId","assetId",
           "employeeId","driverId","contractId","taxCode","allocationRuleId","allocationStatus"
         )
         VALUES ${valuesSql.join(",")}`,
        params
      );
    }

    const approvalResult = await initiateApprovalChain({ companyId: scope.companyId, branchId: scope.branchId, chainType: "procurement", refType: "purchase_request", refId: insertId, amount: totalAmount });
    if (approvalResult.requiresApproval) {
      await applyTransition({
        entity: "purchase_requests",
        id: insertId,
        scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
        action: "purchase_request.submitted",
        fromStates: ["draft"],
        toState: "pending",
      });
    }

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "purchase_request.created", entity: "purchase_requests", entityId: insertId, details: JSON.stringify({ ref, totalAmount, supplierId }) }).catch((e) => logger.error(e, "finance-purchase background task failed"));

    submitWorkflow({
      companyId: scope.companyId,
      branchId: scope.branchId,
      requestType: "purchase_request",
      refTable: "purchase_requests",
      refId: insertId,
      title: `طلب شراء ${ref} — ${totalAmount.toLocaleString("ar-SA")} ريال`,
      submittedBy: scope.activeAssignmentId,
      submittedByName: scope.userName,
      data: { ref, totalAmount, supplierId, items: items.length },
    }).catch((e) => logger.error(e, "finance-purchase background task failed"));

    const [pr] = await rawQuery<Record<string, unknown>>(`SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2`, [insertId, scope.companyId]);
    res.status(201).json({ ...pr, items, approval: approvalResult });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Create purchase request error:");
  }
});

// M3 fix: explicit submit endpoint so a draft can be moved to pending
// independent of the create handler's auto-submit (which only fires when
// initiateApprovalChain returns requiresApproval=true). Pairs with the
// SM tightening in lifecycleEngine.ts (draft→approved no longer allowed).
purchaseRouter.patch("/purchase-requests/:id/submit", authorize({ feature: "finance.purchase", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [pr] = await rawQuery<{ id: number; status: string }>(
      `SELECT id, status FROM purchase_requests WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!pr) throw new NotFoundError("طلب الشراء غير موجود");
    await applyTransition({
      entity: "purchase_requests",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "purchase_request.submitted",
      fromStates: ["draft"],
      toState: "pending",
    });
    res.json({ message: "تم إرسال الطلب للاعتماد", status: "pending" });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Submit purchase request error:");
  }
});

purchaseRouter.patch("/purchase-requests/:id/approve", authorize({ feature: "finance.purchase", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    // as-any-reason: justified-pragmatic - zodParse inferred type is widened so subsequent destructure/index accesses do not require explicit per-field generics; behavior unchanged
    const { approved, notes } = zodParse(prApprovalSchema.safeParse(req.body ?? {})) as any;

    const [pr] = await rawQuery<Record<string, unknown>>(`SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    if (!pr) throw new NotFoundError("طلب الشراء غير موجود");

    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    if ((newStatus === "rejected" || newStatus === "returned") && (!notes || !String(notes).trim())) {
      throw new ValidationError(
        newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع",
        { field: "notes", fix: "أدخل سبب القرار في حقل الملاحظات" }
      );
    }

    const prNotifications: Array<{ assignmentId: number; type: string; title: string; body: string; priority?: string; refType?: string; refId?: number; actionUrl?: string }> = [];
    if ((newStatus === "rejected" || newStatus === "returned") && pr.requestedBy) {
      prNotifications.push({
        assignmentId: Number(pr.requestedBy),
        type: newStatus === "rejected" ? "purchase_request_rejected" : "purchase_request_returned",
        title: newStatus === "rejected" ? "تم رفض طلب الشراء" : "تم إرجاع طلب الشراء",
        body: `طلب الشراء ${pr.ref ?? "#" + id} — ${
          newStatus === "rejected" ? "مرفوض" : "مُرجع للتعديل"
        }. السبب: ${notes}`,
        priority: "high",
        refType: "purchase_request",
        refId: id,
        actionUrl: `/finance/purchase-orders/${id}`,
      });
    }

    await applyTransition({
      entity: "purchase_requests",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: `purchase_request.${newStatus}`,
      toState: newStatus,
      reason: notes ?? undefined,
      setExtras: notes ? { notes: notes } : undefined,
      after: { status: newStatus, notes: notes ?? null },
      notifications: prNotifications.length > 0 ? prNotifications : undefined,
    });

    try { await rawExecute(`INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('purchase_request',$1,$2,$3,$4,$5)`, [id, newStatus, notes || null, scope.userId, scope.companyId]); } catch (e) { logger.error(e, "finance-purchase error"); }

    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({ message: labels[newStatus] || newStatus, status: newStatus });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Finance purchase error:");
  }
});

purchaseRouter.post("/purchase-requests/:id/convert", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");

    const [pr] = await rawQuery<Record<string, unknown>>(`SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2`, [id, scope.companyId]);
    if (!pr) throw new NotFoundError("طلب الشراء غير موجود");
    if (pr.status !== "approved") { throw new ValidationError("يمكن تحويل الطلبات المعتمدة فقط"); return; }

    const items = await rawQuery<Record<string, unknown>>(`SELECT * FROM purchase_request_items WHERE "requestId" = $1 LIMIT 500`, [id]);
    const subtotal = Number(pr.totalAmount);
    const vatRate = 15;
    const vatAmount = computeVat(subtotal, vatRate);
    const totalAmount = subtotal + vatAmount;

    // Numbering center (Issue #1141) — atomic issue + INSERT + linkback.
    let poId!: number;
    let poRef!: string;
    await withTransaction(async () => {
      const issuedPo = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "purchase",
        entityKey: "purchase_order",
        entityTable: "purchase_orders",
        actorId: scope.userId,
        metadata: { fromPurchaseRequestId: id },
        expectedTiming: "on_draft",
      });
      poRef = issuedPo.number;

      await applyTransition({
      entity: "purchase_requests",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "purchase_request.converted",
      fromStates: ["approved"],
      toState: "converted",
      after: { status: "converted", poRef, totalAmount },
      onApply: async (_row: any, client: any) => {
        const poRes = await client.query(
          `INSERT INTO purchase_orders ("companyId","branchId",ref,status,"totalAmount","supplierId",notes,"createdBy")
           VALUES ($1,$2,$3,'pending_approval',$4,$5,$6,$7) RETURNING id`,
          [scope.companyId, scope.branchId, poRef, totalAmount, pr.supplierId ?? null, pr.notes ?? null, scope.activeAssignmentId]
        );
        poId = poRes.rows[0].id;

        if (Array.isArray(items) && items.length > 0) {
          // Phase 4 P1 — carry the full allocation payload from PR to PO.
          // Without this, every dimension + lineTreatment the operator
          // set at PR time gets silently dropped when the PR is
          // converted, leaving the PO blank again and forcing rework
          // at GRN time.
          const COLS_PER_ROW = 22;
          const valuesSql: string[] = [];
          const params: unknown[] = [];
          for (const item of items) {
            const base = params.length;
            valuesSql.push(
              `(${Array.from({ length: COLS_PER_ROW }, (_, i) => `$${base + i + 1}`).join(",")})`
            );
            params.push(
              poId, item.name, item.quantity, item.unitPrice, item.totalPrice,
              item.productId ?? null,
              item.accountId ?? null,
              item.accountCode ?? null,
              item.costCenterId ?? null,
              item.lineTreatment ?? null,
              item.activityType ?? null,
              item.projectId ?? null,
              item.vehicleId ?? null,
              item.propertyId ?? null,
              item.unitId ?? null,
              item.assetId ?? null,
              item.employeeId ?? null,
              item.driverId ?? null,
              item.contractId ?? null,
              item.taxCode ?? null,
              item.allocationRuleId ?? null,
              item.allocationStatus ?? "unmapped",
            );
          }
          await client.query(
            `INSERT INTO purchase_order_items (
               "orderId","itemName",quantity,"unitPrice","lineTotal",
               "productId","accountId","accountCode","costCenterId","lineTreatment","activityType",
               "projectId","vehicleId","propertyId","unitId","assetId",
               "employeeId","driverId","contractId","taxCode","allocationRuleId","allocationStatus"
             )
             VALUES ${valuesSql.join(",")}`,
            params
          );
        }
      },
    });

      await rawExecute(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [poId, issuedPo.assignmentId]
      );
    });

    // Record the PR→PO conversion explicitly so the chain audit/events
    // can follow "who turned which PR into which PO" without having to
    // cross-reference timestamps by ref prefix.
    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      entity: "purchase_request",
      entityId: id,
      action: "purchase_request.converted",
      after: { status: "converted", purchaseOrderId: poId, poRef, totalAmount },
    }).catch((e) => logger.error(e, "finance-purchase background task failed"));

    const [po] = await rawQuery<Record<string, unknown>>(`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [poId, scope.companyId]);
    res.status(201).json({ message: "تم تحويل طلب الشراء إلى أمر شراء", ...(po || { purchaseOrderId: poId, poRef, totalAmount }) });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Convert purchase request error:");
  }
});

purchaseRouter.get("/purchase-orders", authorize({ feature: "finance.purchase", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'po."companyId"', branchColumn: 'po."branchId"', enforceBranchScope: true, includeNullBranch: true, softDeleteColumn: 'po."deletedAt"' });
    const { status: filterStatus, page = "1", limit: lim = "20" } = req.query as Record<string, string | undefined>;
    const safeLim = Math.min(Number(lim) || 50, 500);

    let extraWhere = "";
    let paramIdx = nextParamIndex;
    if (filterStatus) { params.push(filterStatus); extraWhere += ` AND po.status = $${paramIdx++}`; }
    const { productId } = req.query as Record<string, string | undefined>;
    // productId filter disabled: purchase_order_items has no productId column

    const offset = (Math.max(Number(page) || 1, 1) - 1) * safeLim;
    params.push(safeLim);
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT po.id, po.ref, po.status, po."totalAmount", po."createdAt",
              po."expectedDelivery", po.notes, s.name AS "supplierName"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId" AND s."deletedAt" IS NULL
       WHERE ${where}${extraWhere}
       ORDER BY po."createdAt" DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<Record<string, unknown>>(`SELECT COUNT(*) AS total FROM purchase_orders po WHERE ${where}${extraWhere}`, countParams);
    res.json(maskFields(req, { data: rows, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) }));
  } catch (err) {
    handleRouteError(err, res, "List purchase orders error:");
  }
});

purchaseRouter.post("/purchase-orders", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;


    // as-any-reason: justified-pragmatic - zodParse inferred type is widened so subsequent destructure/index accesses do not require explicit per-field generics; behavior unchanged
    const { supplierId, totalAmount, vatAmount, notes, expectedDelivery, branchId, companyId: bodyCompanyId, items } = zodParse(createPurchaseOrderSchema.safeParse(req.body)) as any;

    if (!totalAmount || Number(totalAmount) <= 0) { throw new ValidationError("المبلغ الإجمالي مطلوب"); return; }
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies?.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;
    const effectiveBranchId = branchId ?? scope.branchId;

    if (branchId != null &&
        !scope.isOwner && !OWNER_GM_ROLES.includes(scope.role) &&
        scope.allowedBranches.length > 0 && !scope.allowedBranches.includes(Number(branchId))) {
      throw new ForbiddenError("لا تملك صلاحية إنشاء أوامر شراء في هذا الفرع", { field: "branchId" });
    }

    if (supplierId) {
      const [sup] = await rawQuery<{ id: number }>(`SELECT id FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`, [supplierId, effectiveCompanyId]);
      if (!sup) throw new ValidationError("المورد غير موجود", { field: "supplierId", fix: "اختر مورداً من قائمة الموردين." });
    }

    // Numbering center (Issue #1141) — atomic issue + INSERT + linkback.
    // Scheme: purchase.purchase_order.
    const atomic = await withTransaction(async () => {
      const issued = await issueNumber({
        companyId: effectiveCompanyId,
        branchId: effectiveBranchId ?? null,
        moduleKey: "purchase",
        entityKey: "purchase_order",
        entityTable: "purchase_orders",
        actorId: scope.userId,
        expectedTiming: "on_draft",
      });
      const result = await rawExecute(
        `INSERT INTO purchase_orders ("companyId","branchId",ref,status,"totalAmount","supplierId",notes,"expectedDelivery","createdBy")
         VALUES ($1,$2,$3,'pending_approval',$4,$5,$6,$7,$8)`,
        [effectiveCompanyId, effectiveBranchId, issued.number, Number(totalAmount), supplierId, notes ?? null, expectedDelivery ?? null, scope.userId]
      );
      assertInsert(result.insertId, "purchase_orders");
      await rawExecute(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [result.insertId, issued.assignmentId]
      );
      return { insertId: result.insertId, ref: issued.number };
    });
    const insertId = atomic.insertId;
    const ref = atomic.ref;

    if (Array.isArray(items) && items.length > 0) {
      // Phase 4 P1 — direct PO creation (no PR upstream) also carries
      // the dimensional + lineTreatment payload. Keeps the line shape
      // identical regardless of whether the PO came from a converted
      // PR or was created directly.
      const COLS_PER_ROW = 22;
      const valuesSql: string[] = [];
      const params: unknown[] = [];
      for (const item of items) {
        const base = params.length;
        valuesSql.push(
          `(${Array.from({ length: COLS_PER_ROW }, (_, i) => `$${base + i + 1}`).join(",")})`
        );
        const hasAllocation = item.accountCode || item.accountId || item.lineTreatment;
        params.push(
          insertId, item.itemName || "بند",
          Number(item.quantity ?? 1), Number(item.unitPrice ?? 0), Number(item.lineTotal ?? 0),
          item.productId ?? null,
          item.accountId ?? null,
          item.accountCode ?? null,
          item.costCenterId ?? null,
          item.lineTreatment ?? null,
          item.activityType ?? null,
          item.projectId ?? null,
          item.vehicleId ?? null,
          item.propertyId ?? null,
          item.unitId ?? null,
          item.assetId ?? null,
          item.employeeId ?? null,
          item.driverId ?? null,
          item.contractId ?? null,
          item.taxCode ?? null,
          item.allocationRuleId ?? null,
          hasAllocation ? "resolved" : "unmapped",
        );
      }
      await rawExecute(
        `INSERT INTO purchase_order_items (
           "orderId","itemName",quantity,"unitPrice","lineTotal",
           "productId","accountId","accountCode","costCenterId","lineTreatment","activityType",
           "projectId","vehicleId","propertyId","unitId","assetId",
           "employeeId","driverId","contractId","taxCode","allocationRuleId","allocationStatus"
         )
         VALUES ${valuesSql.join(",")}`,
        params
      ).catch((e) => logger.error(e, "finance-purchase background task failed"));
    }

    const approvalResult = await initiateApprovalChain({ companyId: scope.companyId, branchId: scope.branchId, chainType: "procurement", refType: "purchase_order", refId: insertId, amount: Number(totalAmount) });
    if (approvalResult.requiresApproval) {
      await applyTransition({
        entity: "purchase_orders",
        id: insertId,
        scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
        action: "purchase_order.submitted_for_approval",
        fromStates: ["pending"],
        toState: "pending_approval",
      });
    }

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "purchase_order.created", entity: "purchase_orders", entityId: insertId, details: JSON.stringify({ ref, totalAmount, supplierId }) }).catch((e) => logger.error(e, "finance-purchase background task failed"));
    const [po] = await rawQuery<Record<string, unknown>>(`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [insertId, effectiveCompanyId]);
    res.status(201).json({ ...po, approval: approvalResult });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Create purchase order error:");
  }
});

async function poApprovalAction(req: any, res: any, newStatus: "approved" | "rejected" | "returned") {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const { notes } = zodParse(poApprovalNotesSchema.safeParse(req.body ?? {}));

    const [po] = await rawQuery<Record<string, unknown>>(`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!po) throw new NotFoundError("أمر الشراء غير موجود");

    if ((newStatus === "rejected" || newStatus === "returned") && (!notes || !String(notes).trim())) {
      throw new ValidationError(
        newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع",
        { field: "notes", fix: "أدخل سبب القرار في حقل الملاحظات" }
      );
    }

    // #2296 — budget enforcement at PO approval (the commitment point).
    // A purchase order is a spend commitment; approving it is where the
    // money is effectively earmarked, so this is where the same role-aware
    // 80/100/110% gate the vendor-invoice path applies belongs. Without it
    // an over-budget PO sails through approval and only trips the gate
    // later at invoice time — after the supplier commitment already exists.
    // Lines are aggregated per expense account so the check matches the
    // budget grain (one budgets row per accountCode+period). The PO's own
    // creation month is the budget period; validateBudget falls back to the
    // current period when createdAt is unexpectedly empty.
    if (newStatus === "approved") {
      // Maker-checker: the creator may not APPROVE their own PO (a spend
      // commitment) — the same segregation the unified approval chain
      // enforces. Owners (no employeeId) are exempt.
      await assertNotSelfApproval("purchase_order", id, scope.companyId, scope.employeeId);

      const poPeriod = String((po as Record<string, unknown>).createdAt ?? "").slice(0, 7) || undefined;
      const poLines = await rawQuery<{ accountCode: string; amt: string }>(
        `SELECT "accountCode", SUM("lineTotal")::text AS amt
           FROM purchase_order_items
          WHERE "orderId" = $1 AND "accountCode" IS NOT NULL
          GROUP BY "accountCode"`,
        [id],
      );
      for (const ln of poLines) {
        const amt = Number(ln.amt);
        if (!(amt > 0)) continue;
        const budgetCheck = await validateBudget({
          companyId: scope.companyId, accountCode: String(ln.accountCode), amount: amt, period: poPeriod, role: scope.role,
        });
        if (!budgetCheck.canProceed) {
          const meta = { utilization: budgetCheck.utilization, status: budgetCheck.status, accountCode: ln.accountCode };
          if (budgetCheck.status === "rejected") {
            throw new ConflictError(budgetCheck.message, { field: "amount", fix: "أعد تقييم الميزانية أو قلّل المبلغ", meta });
          }
          throw new ForbiddenError(budgetCheck.message, { fix: `يلزم موافقة ${budgetCheck.approvalLevel === "cfo" ? "المدير المالي" : "المدير العام"}`, meta });
        }
      }
    }

    await applyTransition({
      entity: "purchase_orders",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: `purchase_order.${newStatus}`,
      toState: newStatus,
      reason: notes ?? undefined,
      setExtras: notes ? { notes: notes } : undefined,
      after: { status: newStatus, notes: notes ?? null },
    });

    try { await rawExecute(`INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('purchase_order',$1,$2,$3,$4,$5)`, [id, newStatus, notes || null, scope.userId, scope.companyId]); } catch (e) { logger.error(e, "finance-purchase error"); }

    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({ message: labels[newStatus] || newStatus, status: newStatus });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Finance purchase error:");
  }
}
purchaseRouter.patch("/purchase-orders/:id/approve", authorize({ feature: "finance.purchase", action: "update" }), (req, res) => poApprovalAction(req, res, "approved"));
purchaseRouter.patch("/purchase-orders/:id/reject", authorize({ feature: "finance.purchase", action: "update" }), (req, res) => poApprovalAction(req, res, "rejected"));
purchaseRouter.patch("/purchase-orders/:id/return", authorize({ feature: "finance.purchase", action: "update" }), (req, res) => poApprovalAction(req, res, "returned"));

/**
 * Record goods receipt (GRN) against a purchase order.
 * Accepts per-line received quantities for partial receipts and posts a
 * GRN journal entry debiting inventory and crediting GRNI (goods-received-
 * not-invoiced liability) which is cleared later when the supplier invoice
 * is matched and approved. Three-way match ties PO → GRN → Invoice.
 */
purchaseRouter.patch("/purchase-orders/:id/receive", authorize({ feature: "finance.purchase", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    // as-any-reason: justified-pragmatic - zodParse inferred type is widened so subsequent destructure/index accesses do not require explicit per-field generics; behavior unchanged
    const { receivedDate, qualityNotes, lines } = zodParse(poReceiveSchema.safeParse(req.body ?? {})) as any;

    const [po] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!po) throw new NotFoundError("أمر الشراء غير موجود");
    if (!["approved", "partially_received"].includes(po.status as string)) {
      throw new ValidationError("يمكن استلام الطلبات المعتمدة فقط");
    }

    // GRN lands on the PO's branch, not the operator's working branch.
    // Pre-fix the receipt JE used scope.branchId — a PO created in Branch
    // A but received by a user logged into Branch B silently posted the
    // inventory + GRNI to Branch B, then the 3-way match split GL across
    // branches forever. Assert the operator has access to the PO's branch
    // before proceeding.
    const poBranchId = (po.branchId as number | null) ?? null;
    if (poBranchId != null) {
      assertDocumentBranchAccess(poBranchId, {
        companyId: scope.companyId,
        branchId: scope.branchId,
        allowedBranches: scope.allowedBranches,
      });
    }
    const grnBranchId = poBranchId ?? scope.branchId;

    const receiptDate = receivedDate || new Date().toISOString();
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, receiptDate);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن استلام بضاعة في فترة مُقفلة: ${periodCheck.periodName ?? ""}`);
    }

    const poItems = await rawQuery<Record<string, unknown>>(
      `SELECT id, "itemName", quantity, "unitPrice", "lineTotal",
              COALESCE("receivedQty",0) AS "receivedQty",
              COALESCE("invoicedQty",0) AS "invoicedQty",
              "productId","accountId","accountCode","costCenterId","lineTreatment","activityType",
              "projectId","vehicleId","propertyId","unitId","assetId",
              "employeeId","driverId","contractId","taxCode","allocationRuleId","allocationStatus"
       FROM purchase_order_items WHERE "orderId" = $1`,
      [id]
    );
    if (poItems.length === 0) {
      throw new ValidationError("لا توجد بنود في أمر الشراء");
    }

    // If no per-line input, treat as full receipt of remaining quantities
    const poItemMap = new Map<number, any>(poItems.map((it: any) => [Number(it.id), it]));
    const inputLines: Array<{ poItemId: number; receivedQty: number; notes?: string }> = [];
    if (Array.isArray(lines) && lines.length > 0) {
      for (const l of lines) {
        const poItemId = Number(l.poItemId);
        const qty = Number(l.receivedQty ?? 0);
        const item = poItemMap.get(poItemId);
        if (!item) { throw new ValidationError(`بند غير موجود في أمر الشراء: ${poItemId}`); return; }
        const remaining = Number(item.quantity) - Number(item.receivedQty);
        if (qty <= 0) continue;
        if (qty > remaining + 0.0001) {
          throw new ValidationError(`الكمية المستلمة (${qty}) تتجاوز المتبقي (${remaining}) للبند ${item.itemName}`);
        }
        inputLines.push({ poItemId, receivedQty: qty, notes: l.notes });
      }
    } else {
      for (const item of poItems) {
        const remaining = Number(item.quantity) - Number(item.receivedQty);
        if (remaining > 0) inputLines.push({ poItemId: Number(item.id), receivedQty: remaining });
      }
    }

    if (inputLines.length === 0) {
      throw new ValidationError("لا توجد كميات للاستلام");
    }

    // #1945 FIN-SUB-01 (#2097) — PRE-FLIGHT treatment↔nature gate. Runs BEFORE
    // any permanent write (the GRN row, its items, receivedQty, PO status), so
    // a rejected receipt leaves ZERO operational trace — full success or full
    // rejection. Resolves each line's DR account from the PO item (identical
    // inputs to the post-creation resolution, which copies these verbatim onto
    // the GRN items) and rejects 422 if a treatment lands on a wrong-nature
    // account (e.g. a fixed-asset line on an expense account → asset in P&L).
    await assertGrnTreatmentNature(
      scope.companyId,
      (po.supplierId as number | null) ?? null,
      inputLines.map((l) => {
        const it = poItemMap.get(l.poItemId)!;
        return {
          label: String(it.itemName ?? l.poItemId),
          lineTreatment: it.lineTreatment ?? null,
          accountCode: it.accountCode ?? null,
          costCenterId: it.costCenterId ?? null,
          dims: {
            projectId: it.projectId ?? null, vehicleId: it.vehicleId ?? null, propertyId: it.propertyId ?? null,
            unitId: it.unitId ?? null, assetId: it.assetId ?? null, employeeId: it.employeeId ?? null,
            driverId: it.driverId ?? null, contractId: it.contractId ?? null, productId: it.productId ?? null,
          },
          sourceTable: "purchase_order_items",
          sourceLineId: l.poItemId,
        };
      }),
    );

    // Compute totals for this GRN
    let subtotal = 0;
    for (const l of inputLines) {
      const item = poItemMap.get(l.poItemId)!;
      subtotal += l.receivedQty * Number(item.unitPrice);
    }
    subtotal = roundTo2(subtotal);
    const poTotal = Number(po.totalAmount);
    // Per-company VAT rate via system_settings.vat_rate (default 15%).
    // Pre-fix the GRN VAT-ratio split hardcoded 0.15 → a tenant on 5%
    // VAT would back-derive the wrong VAT-vs-subtotal split on every
    // GRN, then post the wrong amounts to inventory + VAT input.
    const defaultVatRate = (await getCompanyVatRate(scope.companyId)) / 100;
    const poSubtotal = roundTo2(poTotal / (1 + defaultVatRate));
    const poVatAmount = roundTo2(poTotal - poSubtotal);
    const vatRatio = poSubtotal > 0 ? poVatAmount / poSubtotal : 0;
    const vatAmount = roundTo2(subtotal * vatRatio);
    const grnTotal = roundTo2(subtotal + vatAmount);

    // Numbering center (Issue #1141) — atomic issue + INSERT + linkback.
    // Scheme: purchase.goods_receipt. The numberingService runs
    // SELECT … FOR UPDATE inside its own transaction (joining ours via
    // SAVEPOINT) to serialise allocators, so concurrent receipts on the
    // same PO queue on the counter row instead of racing.
    // Pre-INSERT idempotency: hash the receipt date + per-line digest
    // (poItemId × qty) so a retried request from the SAME operator on
    // the SAME PO with the SAME lines collapses into the existing GRN
    // row via the partial UNIQUE index on goods_receipts.sourceKey
    // (migration 231). Different qty / different lines → different
    // hash → new GRN, which is the desired behaviour (a partial
    // top-up receipt). Including X-Idempotency-Token in the hash too
    // lets clients force a new GRN by rotating the token.
    const grnLineDigest = inputLines
      .map((l) => `${l.poItemId}:${l.receivedQty.toFixed(4)}`)
      .sort()
      .join("|");
    const grnIdempotencyToken = requestIdempotencyToken(req);
    const grnSourceKey = `finance:grn:${id}:${receiptDate}:${grnIdempotencyToken}:${grnLineDigest}`;

    // Check for a pre-existing GRN with this sourceKey; if present,
    // short-circuit to the existing row.
    const [existingGrn] = await rawQuery<{ id: number; ref: string }>(
      `SELECT id, ref FROM goods_receipts
        WHERE "companyId" = $1 AND "sourceKey" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [scope.companyId, grnSourceKey]
    );

    let grnId: number | undefined;
    let grnRef!: string;
    if (existingGrn) {
      grnId = existingGrn.id;
      grnRef = existingGrn.ref;
      markIdempotencyReplay(req, res, true);
    } else {
      try {
        grnId = await withTransaction(async (client) => {
          const issuedGrn = await issueNumber({
            companyId: scope.companyId,
            branchId: scope.branchId ?? null,
            moduleKey: "purchase",
            entityKey: "goods_receipt",
            entityTable: "goods_receipts",
            actorId: scope.userId,
            metadata: { fromPurchaseOrderId: id },
            expectedTiming: "on_draft",
          });
          grnRef = issuedGrn.number;
          const grnRes = await client.query(
            `INSERT INTO goods_receipts ("companyId","branchId","poId",ref,"receivedAt","receivedBy",notes,"sourceKey")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [scope.companyId, grnBranchId, id, grnRef, receiptDate, scope.activeAssignmentId, qualityNotes ?? null, grnSourceKey]
          );
          const newGrnId = grnRes.rows[0].id;
          await client.query(
            `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
            [newGrnId, issuedGrn.assignmentId]
          );

          for (const l of inputLines) {
            const item = poItemMap.get(l.poItemId)!;
            const lineTotal = roundTo2(l.receivedQty * Number(item.unitPrice));
            // Phase 4 P1 — propagate the dimensional + lineTreatment
            // payload from the PO item to the GRN item so the GRN-time
            // posting (Phase 4.2) can switch on lineTreatment without
            // joining back. allocationStatus comes from the PO; if the
            // operator updated it after PR conversion, the GRN reflects
            // the latest mapping.
            await client.query(
              `INSERT INTO goods_receipt_items (
                 "grnId","poItemId","itemName","receivedQty","unitPrice","lineTotal",notes,
                 "productId","accountId","accountCode","costCenterId","lineTreatment","activityType",
                 "projectId","vehicleId","propertyId","unitId","assetId",
                 "employeeId","driverId","contractId","taxCode","allocationRuleId","allocationStatus"
               )
               VALUES (
                 $1,$2,$3,$4,$5,$6,$7,
                 $8,$9,$10,$11,$12,$13,
                 $14,$15,$16,$17,$18,
                 $19,$20,$21,$22,$23,$24
               )`,
              [
                newGrnId, l.poItemId, item.itemName, l.receivedQty,
                Number(item.unitPrice), lineTotal, l.notes ?? null,
                item.productId ?? null,
                item.accountId ?? null,
                item.accountCode ?? null,
                item.costCenterId ?? null,
                item.lineTreatment ?? null,
                item.activityType ?? null,
                item.projectId ?? null,
                item.vehicleId ?? null,
                item.propertyId ?? null,
                item.unitId ?? null,
                item.assetId ?? null,
                item.employeeId ?? null,
                item.driverId ?? null,
                item.contractId ?? null,
                item.taxCode ?? null,
                item.allocationRuleId ?? null,
                item.allocationStatus ?? "unmapped",
              ]
            );
            await client.query(
              `UPDATE purchase_order_items SET "receivedQty" = COALESCE("receivedQty",0) + $1 WHERE id = $2`,
              [l.receivedQty, l.poItemId]
            );
          }

          return newGrnId;
        });
      } catch (e) {
        // The numbering center already serialised our slot on the GRN
        // counter, so a duplicate ref shouldn't occur. If it does, it's
        // a real data-integrity bug — surface it instead of looping.
        throw e;
      }
    }
    if (grnId === undefined) {
      throw new Error("تعذّر إنشاء إيصال الاستلام — راجع سجل التدقيق");
    }

    // Post GRN journal.
    //
    // Phase 4.2 — per-line DR routing by `lineTreatment`. The legacy
    // posting collapsed every receipt onto a single DR inventory_receipt
    // line, hiding the fact that some lines should land on fuel /
    // vehicle / property / project / custody / prepayment / asset /
    // service accounts instead. The new flow groups received lines
    // by (treatment-derived account + dimension signature) and emits
    // one DR per bucket. The VAT debit + GRNI credit stay header-level.
    const { financialEngine } = await import("../lib/engines/index.js");
    const { resolveCompanyInputVatAccount } = await import("../lib/taxCodes.js");
    const [vatGeneral, grniAccount] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "purchase_grn_vat", "debit", "1180"),
      financialEngine.resolveAccountCode(scope.companyId, "purchase_grni", "credit", "2150"),
    ]);
    // البند ٤ — ضريبة المدخلات على حساب الرمز القياسي للشركة إن هُيِّئ، وإلا العام.
    const vatAccount = await resolveCompanyInputVatAccount(scope.companyId, vatGeneral);

    // Per-line DR routing uses the module-scope GRN_TREATMENT_PURPOSE map
    // (shared with the pre-flight gate above so they can never diverge).
    // Read the dimensional payload from the receipt lines we just
    // inserted. `unitPrice` × `receivedQty` per line is the per-line
    // subtotal; sum to verify against the header `subtotal` for
    // rounding-difference handling.
    const receiptLineRows = await rawQuery<{
      id: number;
      lineTotal: string;
      accountCode: string | null;
      lineTreatment: string | null;
      costCenterId: number | null;
      activityType: string | null;
      projectId: number | null;
      vehicleId: number | null;
      propertyId: number | null;
      unitId: number | null;
      assetId: number | null;
      employeeId: number | null;
      driverId: number | null;
      contractId: number | null;
      productId: number | null;
    }>(
      `SELECT id, "lineTotal"::text AS "lineTotal",
              "accountCode", "lineTreatment", "costCenterId", "activityType",
              "projectId", "vehicleId", "propertyId", "unitId", "assetId",
              "employeeId", "driverId", "contractId", "productId"
         FROM goods_receipt_items
        WHERE "grnId" = $1
        ORDER BY id`,
      [grnId]
    );

    // Default account for any line whose lineTreatment is NULL or
    // unrecognized — keeps the legacy «one inventory DR» behaviour as
    // a safety net so unclassified receipts still post somewhere
    // sensible until Phase 6 forces every line to carry a treatment.
    const defaultInvAccount = await financialEngine.resolveAccountCode(
      scope.companyId, "inventory_receipt", "debit", "1151"
    );

    // Phase 5.4 — run the allocation resolver on every receipt line.
    // The resolver consults accounting_allocation_rules first; a
    // rule match overrides the static TREATMENT_PURPOSE map below.
    // Tenants that haven't authored any rules behave exactly like
    // Phase 4.2 alone (TREATMENT_PURPOSE → defaultInvAccount).
    const {
      resolveLineAllocation,
      writeAllocationResult,
      validateAllocationCompleteness,
      getEnforceLineAllocation,
      logAllocationOverride,
    } = await import("../lib/accountingAllocation.js");
    const lineResolutions = await Promise.all(
      receiptLineRows.map((ln) =>
        resolveLineAllocation({
          companyId: scope.companyId,
          documentType: "grn",
          lineType: ln.lineTreatment ?? undefined,
          entityType: "vendor",
          accountCode: ln.accountCode,
          costCenterId: ln.costCenterId,
          dimensions: {
            vehicleId: ln.vehicleId,
            propertyId: ln.propertyId,
            unitId: ln.unitId,
            assetId: ln.assetId,
            projectId: ln.projectId,
            employeeId: ln.employeeId,
            driverId: ln.driverId,
            contractId: ln.contractId,
            productId: ln.productId,
            vendorId: po.supplierId as number | null,
          },
          sourceTable: "goods_receipt_items",
          sourceLineId: ln.id,
        })
      )
    );

    // ── Enforce gate (migration 223 / finance.enforce_line_allocation).
    // Same contract as the invoice approve handler: when the company
    // setting is ON, refuse to post a GRN JE that contains any line
    // the resolver flagged 'unmapped'. A user with the
    // finance.allocation.override grant may pass a written
    // req.body.overrideReason (>=10 chars) which is logged to
    // allocation_override_log. With the flag OFF the legacy default-
    // inventory-account fallback below stays in effect.
    const enforce = await getEnforceLineAllocation({ companyId: scope.companyId, branchId: scope.branchId });
    if (enforce) {
      const { ok, blockers } = validateAllocationCompleteness(lineResolutions);
      if (!ok) {
        const overrideReason = String(req.body?.overrideReason ?? "").trim();
        if (overrideReason.length < 10) {
          throw new ValidationError(
            "لا يمكن استلام إيصال يحتوي على بنود بدون تخصيص محاسبي",
            {
              field: "items",
              fix: "حدد الحساب ومركز التكلفة لكل بند، أو زوّد سببًا مكتوبًا (overrideReason ≥ 10 حرف) إن كان لديك صلاحية finance.allocation.override.",
              meta: { blockers, unmappedLineCount: lineResolutions.filter((r) => r.status === "unmapped" || r.status === "failed").length },
            } as any,
          );
        }
        const overrideAllowed = (await checkAccess(scope, {
          feature: "finance.allocation.override",
          action: "create",
        })).allowed;
        if (!overrideAllowed) {
          throw new ForbiddenError(
            "تجاوز تخصيص البنود يحتاج صلاحية finance.allocation.override",
            { fix: "اطلب من المدير المالي اعتماد هذا الاستلام، أو خصّص البنود قبل الاستلام.", meta: { blockers } } as any,
          );
        }
        await logAllocationOverride({
          companyId: scope.companyId,
          branchId: scope.branchId ?? null,
          actorAssignmentId: scope.activeAssignmentId ?? null,
          actorUserId: scope.userId,
          documentType: "grn",
          documentId: grnId,
          sourceTable: "goods_receipt_items",
          blockers,
          overrideReason,
        });
      }
    }

    type DrBucket = {
      accountCode: string;
      amount: number;
      vendorId: number | undefined;
      costCenter: string | null;
      activityType: string | null;
      projectId: number | null;
      vehicleId: number | null;
      propertyId: number | null;
      employeeId: number | null;
      driverId: number | null;
      contractId: number | null;
      productId: number | null;
      unitId: number | null;
      assetId: number | null;
      umrahSeasonId: number | null;
      umrahAgentId: number | null;
    };
    const buckets = new Map<string, DrBucket>();
    // #1945 FIN-SUB-01 (#2097) — collect (treatment → resolved account) per
    // line so we can ENFORCE, before posting, that the actual DR account's
    // nature matches the line's treatment. Without this the GRN routed by
    // treatment but never verified the account, so a `fixed_asset` line whose
    // pinned/rule account was an expense posted an asset straight to P&L
    // (R-005). That nature gate now runs as a PRE-FLIGHT before any write (see
    // assertGrnTreatmentNature above) — the account resolution here is identical
    // (same inputs, copied verbatim onto the GRN items), so the posted account
    // is guaranteed nature-correct.
    let postedNet = 0;
    for (let i = 0; i < receiptLineRows.length; i++) {
      const ln = receiptLineRows[i];
      const res = lineResolutions[i];

      // Account resolution chain (mirrors resolveGrnDrAccount):
      //   1. Resolver picked an account (rule match or manual override)
      //   2. Fall back to GRN_TREATMENT_PURPOSE map (Phase 4.2)
      //   3. Fall back to defaultInvAccount (legacy)
      let acct = res.resolvedAccountCode;
      if (!acct) {
        const map = ln.lineTreatment ? GRN_TREATMENT_PURPOSE[ln.lineTreatment] : null;
        if (map) {
          acct = await financialEngine.resolveAccountCode(
            scope.companyId, map.purpose, map.side, map.defaultCode
          );
        }
      }
      if (!acct) acct = defaultInvAccount;

      // Use resolver-resolved cost-centre + dimensions so an
      // explicit `from_vehicle` strategy in the rule picks up the
      // cost-centre even when the line itself didn't have one.
      const dims = res.dimensions;
      const cc = res.costCenterId ?? ln.costCenterId;

      const key = [
        acct,
        cc ?? "",
        ln.activityType ?? "",
        dims.projectId ?? "",
        dims.vehicleId ?? "",
        dims.propertyId ?? "",
        dims.employeeId ?? "",
        dims.driverId ?? "",
        dims.contractId ?? "",
        dims.productId ?? "",
        dims.unitId ?? "",
        dims.assetId ?? "",
        dims.umrahSeasonId ?? "",
        dims.umrahAgentId ?? "",
      ].join("|");
      const amt = roundTo2(Number(ln.lineTotal));
      postedNet += amt;
      const prev = buckets.get(key);
      if (prev) {
        prev.amount = roundTo2(prev.amount + amt);
      } else {
        buckets.set(key, {
          accountCode: acct,
          amount: amt,
          vendorId: po.supplierId as number | undefined,
          costCenter: cc != null ? String(cc) : null,
          activityType: ln.activityType,
          projectId: dims.projectId,
          vehicleId: dims.vehicleId,
          propertyId: dims.propertyId,
          employeeId: dims.employeeId,
          driverId: dims.driverId,
          contractId: dims.contractId,
          productId: dims.productId,
          unitId: dims.unitId,
          assetId: dims.assetId,
          umrahSeasonId: dims.umrahSeasonId,
          umrahAgentId: dims.umrahAgentId,
        });
      }
    }

    // Rounding-difference correction lands on the default inventory
    // account so the entry always balances against the GRNI credit.
    const diff = roundTo2(subtotal - postedNet);
    if (Math.abs(diff) >= 0.005) {
      // 14 dim slots after acct → 13 pipes for the all-empty fallback key.
      const fallbackKey = `${defaultInvAccount}|||||||||||||`;
      const prev = buckets.get(fallbackKey);
      if (prev) prev.amount = roundTo2(prev.amount + diff);
      else buckets.set(fallbackKey, {
        accountCode: defaultInvAccount, amount: diff,
        vendorId: po.supplierId as number | undefined,
        costCenter: null, activityType: null, projectId: null,
        vehicleId: null, propertyId: null, employeeId: null,
        driverId: null, contractId: null, productId: null,
        unitId: null, assetId: null,
        umrahSeasonId: null, umrahAgentId: null,
      });
    }
    // (treatment↔nature is enforced as a pre-flight before any write — see
    // assertGrnTreatmentNature near the top of the receive handler.)

    const drLines = Array.from(buckets.values())
      .filter((b) => Math.abs(b.amount) >= 0.005)
      .map((b) => ({
        accountCode: b.accountCode,
        debit: b.amount,
        credit: 0,
        vendorId: b.vendorId,
        costCenter: b.costCenter ?? undefined,
        activityType: b.activityType ?? undefined,
        projectId: b.projectId ?? undefined,
        vehicleId: b.vehicleId ?? undefined,
        propertyId: b.propertyId ?? undefined,
        employeeId: b.employeeId ?? undefined,
        driverId: b.driverId ?? undefined,
        contractId: b.contractId ?? undefined,
        productId: b.productId ?? undefined,
        unitId: b.unitId ?? undefined,
        assetId: b.assetId ?? undefined,
        umrahSeasonId: b.umrahSeasonId ?? undefined,
        umrahAgentId: b.umrahAgentId ?? undefined,
      }));

    let journalId: number | null = null;
    const grnJournalResult = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      // GRN JE lands on the PO's branch (grnBranchId), not the operator's
      // working branch. See branch-resolution rationale at the SELECT above.
      branchId: grnBranchId,
      createdBy: scope.activeAssignmentId,
      ref: grnRef,
      description: `استلام بضاعة ${grnRef} - أمر ${po.ref}`,
      sourceType: "goods_receipt",
      sourceId: grnId,
      sourceKey: `finance:grn:${grnId}`,
      lines: [
        ...drLines,
        ...(vatAmount > 0 ? [{ accountCode: vatAccount, debit: vatAmount, credit: 0, vendorId: po.supplierId as number | undefined }] : []),
        { accountCode: grniAccount, debit: 0, credit: grnTotal, vendorId: po.supplierId as number | undefined },
      ],
      guardTable: "goods_receipts",
      guardId: grnId,
    });
    journalId = grnJournalResult.journalId;
    markIdempotencyReplay(req, res, grnJournalResult.alreadyExists);
    if (journalId) {
      await rawExecute(`UPDATE goods_receipts SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`, [journalId, grnId, scope.companyId]);
    }

    // Phase 5.4 — record the per-line allocation outcome so the GL
    // can be drilled back to «which rule moved each receipt line to
    // which account». Runs only when the JE was actually new (not
    // an idempotent replay), and outside the JE-posting transaction
    // so a writeResult failure doesn't roll back the receipt.
    if (!grnJournalResult.alreadyExists) {
      for (let i = 0; i < receiptLineRows.length; i++) {
        const ln = receiptLineRows[i];
        const res = lineResolutions[i];
        await writeAllocationResult(
          {
            companyId: scope.companyId,
            documentType: "grn",
            sourceTable: "goods_receipt_items",
            sourceLineId: ln.id,
          },
          res,
          scope.activeAssignmentId,
        );
      }
    }

    // Update PO header status — partial vs fully received
    const remainingItems = await rawQuery<Record<string, unknown>>(
      `SELECT SUM(quantity - COALESCE("receivedQty",0)) AS remaining
         FROM purchase_order_items WHERE "orderId" = $1`,
      [id]
    );
    const totalRemaining = Number(remainingItems[0]?.remaining ?? 0);
    const newStatus = totalRemaining <= 0.0001 ? "received" : "partially_received";
    await applyTransition({
      entity: "purchase_orders",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "purchase_order.received",
      fromStates: ["approved", "partially_received"],
      toState: newStatus,
      setExtras: { deliveredAt: receiptDate },
      after: { status: newStatus, grnRef, grnTotal },
    });

    // Register obligation to collect + match the vendor invoice (GRNI liability
    // sits on the books until this is done). Default window: 30 days from receipt.
    try {
      const matchDueDate = new Date(receiptDate);
      matchDueDate.setDate(matchDueDate.getDate() + 30);
      await registerObligation({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        entityType: "goods_receipt",
        entityId: grnId,
        obligationType: "follow_up",
        title: `مطابقة فاتورة المورد — ${grnRef} / ${po.ref || ""}`,
        dueAt: matchDueDate.toISOString(),
        metadata: { grnRef, poRef: po.ref, subtotal, vatAmount, total: grnTotal, vendorId: po.supplierId ?? null },
        dedupeKey: `grn-${grnId}-invoice-match`,
        escalationSteps: [
          { hoursAfterDue: 24, notifyRole: "finance_manager" },
          { hoursAfterDue: 120, notifyRole: "general_manager" },
        ],
      });
    } catch (obErr) { logger.error(obErr, "GRN invoice-match obligation failed:"); }

    // Consume budget on receipt so reports reflect committed spend.
    // Phase 4.2: budget is consumed against the default inventory
    // account when the receipt is mixed-treatment, since that's the
    // only single-account aggregate we have. A more precise per-line
    // budget consumption can come in a follow-up once budgets are
    // dimensional too.
    if (subtotal > 0) {
      updateBudgetUsed({
        companyId: scope.companyId,
        accountCode: defaultInvAccount,
        amount: subtotal,
      }).catch((e) => logger.error(e, "finance-purchase background task failed"));
    }

    res.json({
      message: "تم تسجيل استلام البضاعة",
      grnId,
      grnRef,
      journalId,
      status: newStatus,
      subtotal,
      vatAmount,
      total: grnTotal,
    });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "GRN receive error:");
  }
});

/**
 * List GRNs for a purchase order (for three-way match UI & audit).
 */
purchaseRouter.get("/purchase-orders/:id/receipts", authorize({ feature: "finance.purchase", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const poId = parseId(req.params.id, "id");
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT gr.id, gr.ref, gr."receivedAt", gr."journalId", gr.notes,
              COALESCE(SUM(gri."lineTotal"),0) AS "total",
              json_agg(json_build_object(
                'id', gri.id, 'poItemId', gri."poItemId",
                'itemName', gri."itemName", 'receivedQty', gri."receivedQty",
                'unitPrice', gri."unitPrice", 'lineTotal', gri."lineTotal"
              )) AS items
       FROM goods_receipts gr
       LEFT JOIN goods_receipt_items gri ON gri."grnId" = gr.id
       WHERE gr."poId" = $1 AND gr."companyId" = $2 AND gr."deletedAt" IS NULL
       GROUP BY gr.id
       ORDER BY gr."receivedAt" DESC LIMIT 500`,
      [poId, scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) {
    handleRouteError(err, res, "List GRNs error:");
  }
});

/**
 * Three-way match preview for a PO: shows per-line PO qty vs received vs
 * invoiced so an accountant can see what is safe to invoice.
 */
purchaseRouter.get("/purchase-orders/:id/match", authorize({ feature: "finance.purchase", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const poId = parseId(req.params.id, "id");
    const [po] = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, status, "totalAmount", 0 AS "vatAmount", "supplierId"
         FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [poId, scope.companyId]
    );
    if (!po) throw new NotFoundError("أمر الشراء غير موجود");

    const items = await rawQuery<Record<string, unknown>>(
      `SELECT id, "itemName", quantity, "unitPrice", "lineTotal",
              COALESCE("receivedQty",0) AS "receivedQty",
              COALESCE("invoicedQty",0) AS "invoicedQty"
         FROM purchase_order_items WHERE "orderId" = $1 ORDER BY id`,
      [poId]
    );

    let canInvoiceTotal = 0;
    const lines = items.map((it: any) => {
      const canInvoiceQty = Math.max(0, Number(it.receivedQty) - Number(it.invoicedQty));
      const canInvoiceAmount = roundTo2(canInvoiceQty * Number(it.unitPrice));
      canInvoiceTotal += canInvoiceAmount;
      return {
        ...it,
        remainingQty: Number(it.quantity) - Number(it.receivedQty),
        canInvoiceQty,
        canInvoiceAmount,
      };
    });

    res.json(maskFields(req, {
      po,
      lines,
      canInvoiceTotal: roundTo2(canInvoiceTotal),
    }));
  } catch (err) {
    handleRouteError(err, res, "Three-way match error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT RUN — batch settlement of supplier invoices
// Lets finance select multiple approved/matched POs and post a single payment
// run that clears AP for all selected vendors in one batch with a single bank
// outflow per run (or per vendor, depending on settings).
//   Per PO:  DR 2100 AP  /  CR 1100 Cash
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Preview pending payables eligible for a payment run.
 * Returns all POs in status 'invoice_matched' with an outstanding balance,
 * optionally filtered by due date on or before a cutoff.
 */
purchaseRouter.get("/payment-run/pending", authorize({ feature: "finance.purchase", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const { cutoffDate, supplierId } = req.query as Record<string, string | undefined>;
    const params: unknown[] = [scope.companyId];
    let where = `po."companyId" = $1 AND po.status = 'invoice_matched' AND po."deletedAt" IS NULL`;
    if (supplierId) { params.push(Number(supplierId) || 0); where += ` AND po."supplierId" = $${params.length}`; }
    if (cutoffDate) { params.push(cutoffDate); where += ` AND COALESCE(po."expectedDelivery", po."createdAt") <= $${params.length}`; }

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT po.id, po.ref, po."totalAmount", po."createdAt", po."expectedDelivery",
              po."supplierId", s.name AS "supplierName"
         FROM purchase_orders po
         LEFT JOIN suppliers s ON s.id = po."supplierId" AND s."deletedAt" IS NULL
        WHERE ${where}
        ORDER BY po."expectedDelivery" ASC NULLS LAST, po."createdAt" ASC LIMIT 500`,
      params
    );
    const totalDue = rows.reduce((sum: number, r: any) => sum + Number(r.totalAmount), 0);
    const byVendor = new Map<number, { supplierId: number; supplierName: string; amount: number; count: number }>();
    for (const r of rows) {
      const sid = Number(r.supplierId);
      const cur = byVendor.get(sid) ?? { supplierId: sid, supplierName: String(r.supplierName ?? ""), amount: 0, count: 0 };
      cur.amount += Number(r.totalAmount);
      cur.count += 1;
      byVendor.set(sid, cur);
    }
    res.json(maskFields(req, {
      data: rows,
      totalDue: roundTo2(totalDue),
      byVendor: Array.from(byVendor.values()),
    }));
  } catch (err) {
    handleRouteError(err, res, "Payment run pending error:");
  }
});

/**
 * Execute a payment run — post AP clearance journal entries for each selected
 * PO and mark them paid. All GL postings happen in one transaction so partial
 * failures roll back.
 */
purchaseRouter.post("/payment-run/execute", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;


    // as-any-reason: justified-pragmatic - zodParse inferred type is widened so subsequent destructure/index accesses do not require explicit per-field generics; behavior unchanged
    const { poIds, paymentDate, method = "bank_transfer", reference, bankAccount } = zodParse(executePaymentRunSchema.safeParse(req.body)) as any;
    const payDate = paymentDate || todayISO();
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, payDate);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن تنفيذ دفعات في فترة مُقفلة: ${periodCheck.periodName ?? ""}`);
    }

    const poIdNums = poIds.map((x: any) => Number(x)).filter((n: number) => !Number.isNaN(n));
    // Pull each PO with the supplier's residency + WHT defaults in the
    // same hop — the payment-run handler needs them to decide whether
    // the buyer must withhold tax from each PO (Income Tax Law Art. 68).
    const pos = await rawQuery<Record<string, unknown>>(
      `SELECT po.id, po.ref, po."totalAmount", po."supplierId", po."branchId", po.status,
              s."residencyStatus", s."defaultWhtRate", s."whtCategoryDefault"
         FROM purchase_orders po
         LEFT JOIN suppliers s ON s.id = po."supplierId" AND s."deletedAt" IS NULL
        WHERE po.id = ANY($1) AND po."companyId" = $2 AND po."deletedAt" IS NULL`,
      [poIdNums, scope.companyId]
    );
    if (pos.length !== poIdNums.length) {
      throw new NotFoundError("بعض أوامر الشراء غير موجودة");
    }
    const invalid = pos.filter((p) => p.status !== "invoice_matched");
    if (invalid.length > 0) {
      throw new ValidationError(`بعض الأوامر ليست في حالة قابلة للدفع: ${invalid.map((p) => p.ref).join(", ")}`);
    }

    const totalPayment = roundTo2(pos.reduce((sum: number, p: any) => sum + Number(p.totalAmount), 0));

    const { financialEngine } = await import("../lib/engines/index.js");
    const [apAccount, cashAccount] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "purchase_vendor_ap", "debit", "2111"),
      // سداد المورّد يُموَّل من النقد التشغيلي (1111) لا من بنك الرواتب. كان
      // "payroll_bank_payout" (→1121 بنك الرواتب / احتياطي 1124 غير موجود أصلًا)
      // يخلط دفعات الموردين بصرف الرواتب (تصحيح ٢٠٢٦-٠٧-٠١ باعتماد إبراهيم).
      financialEngine.resolveAccountCode(scope.companyId, "vendor_payment_cash", "credit", "1111"),
    ]);

    // ── WHT computation ─────────────────────────────────────────────────
    // For each PO whose supplier is non-resident, withhold the configured
    // rate (treaty / supplier-default / category) and route the held cash
    // to the WHT-payable account so the next ZATCA filing can claim it.
    // Resident suppliers short-circuit inside computeWHT → applies=false.
    const { computeWHT } = await import("../lib/withholdingTax.js");
    interface PoWht {
      poId: number;
      supplierId: number;
      wht: number;
      net: number;
      rate: number;
      category: string | null;
      payableAccountCode: string | null;
    }
    const whtByPo: PoWht[] = [];
    for (const po of pos) {
      const supplierId = Number(po.supplierId);
      if (!supplierId) continue;
      const split = await computeWHT({
        companyId: scope.companyId,
        supplierId,
        grossAmount: Number(po.totalAmount),
      });
      if (split.applies && split.wht > 0) {
        whtByPo.push({
          poId: Number(po.id),
          supplierId,
          wht: split.wht,
          net: split.net,
          rate: split.rate,
          category: split.category,
          payableAccountCode: split.payableAccountCode,
        });
      }
    }
    const totalWht = roundTo2(whtByPo.reduce((s, w) => s + w.wht, 0));
    const netCashOut = roundTo2(totalPayment - totalWht);
    // Bucket the WHT-payable credits by account code so a payment-run
    // paying 50 POs to 30 different non-residents still produces one
    // CR line per ZATCA-payable account (typically just '2330').
    const whtPayableFallback = await financialEngine.resolveAccountCode(
      scope.companyId, "wht_payable", "credit", "2132",
    );
    const whtCreditByAccount = new Map<string, number>();
    for (const w of whtByPo) {
      const code = w.payableAccountCode || whtPayableFallback;
      whtCreditByAccount.set(code, roundTo2((whtCreditByAccount.get(code) ?? 0) + w.wht));
    }

    // Persist a payment_runs header row (create table if missing).
    // G14 fix (Issue #1141 coverage report 2026-05-27 §3 G14) — issue
    // a real payment_run ref through the numbering center (scheme
    // `purchase.payment_run`, seeded by migration 227) instead of the
    // inline Date.now() legacy. The `reference` query-param is still
    // honoured for legacy imports.
    let runId: number | null = null;
    let runRef: string;
    let issuedRun: Awaited<ReturnType<typeof issueNumber>> | null = null;
    if (reference) {
      runRef = reference;
    } else {
      issuedRun = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "purchase",
        entityKey: "payment_run",
        entityTable: "payment_runs",
        actorId: scope.userId,
        expectedTiming: "on_draft",
      });
      runRef = issuedRun.number;
    }

    // Pre-INSERT idempotency for payment_runs (migration 231 adds the
    // sourceKey column + partial unique index). The key is the
    // (idempotency-token, payDate, poIds-sorted-digest), so a retried
    // request with the same token + same selection collapses into the
    // existing run row. Different selection / different date → new
    // sourceKey → new run, which is what the operator wants when
    // genuinely executing a second batch.
    const runIdempotencyToken = requestIdempotencyToken(req);
    const runPoDigest = [...pos].map((p) => p.id).sort().join(",");
    const runSourceKey = `finance:payment_run:${payDate}:${runIdempotencyToken}:${runPoDigest}`;

    const [existingRun] = await rawQuery<{ id: number; ref: string }>(
      `SELECT id, ref FROM payment_runs
        WHERE "companyId" = $1 AND "sourceKey" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [scope.companyId, runSourceKey]
    ).catch(() => [] as { id: number; ref: string }[]);

    if (existingRun) {
      runId = existingRun.id;
      runRef = existingRun.ref;
      markIdempotencyReplay(req, res, true);
    } else {
    await withTransaction(async (client: any) => {
      try {
        const ins = await client.query(
          `INSERT INTO payment_runs ("companyId","branchId",ref,"paymentDate",method,"bankAccount","totalAmount","poCount","createdBy",status,"sourceKey")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'executed',$10) RETURNING id`,
          [scope.companyId, scope.branchId, runRef, payDate, method, bankAccount ?? null, totalPayment, pos.length, scope.activeAssignmentId, runSourceKey]
        );
        runId = ins.rows[0].id;
      } catch (e: any) {
        if (e?.code === "42P01") {
          await client.query(
            `CREATE TABLE IF NOT EXISTS payment_runs (
               id SERIAL PRIMARY KEY,
               "companyId" INTEGER NOT NULL,
               "branchId" INTEGER,
               ref TEXT NOT NULL,
               "paymentDate" DATE NOT NULL,
               method TEXT,
               "bankAccount" TEXT,
               "totalAmount" NUMERIC(18,2) NOT NULL,
               "poCount" INTEGER NOT NULL,
               status TEXT NOT NULL DEFAULT 'executed',
               "journalId" INTEGER,
               "createdBy" INTEGER,
               "createdAt" TIMESTAMP DEFAULT NOW()
             );
             CREATE TABLE IF NOT EXISTS payment_run_items (
               id SERIAL PRIMARY KEY,
               "runId" INTEGER NOT NULL REFERENCES payment_runs(id) ON DELETE CASCADE,
               "poId" INTEGER NOT NULL,
               "supplierId" INTEGER,
               amount NUMERIC(18,2) NOT NULL,
               "journalId" INTEGER
             )`
          );
          const ins2 = await client.query(
            `INSERT INTO payment_runs ("companyId","branchId",ref,"paymentDate",method,"bankAccount","totalAmount","poCount","createdBy",status,"sourceKey")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'executed',$10) RETURNING id`,
            [scope.companyId, scope.branchId, runRef, payDate, method, bankAccount ?? null, totalPayment, pos.length, scope.activeAssignmentId, runSourceKey]
          );
          runId = ins2.rows[0].id;
        } else {
          throw e;
        }
      }
      if (issuedRun && runId) {
        await client.query(
          `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
          [runId, issuedRun.assignmentId]
        );
      }

      for (const po of pos) {
        await client.query(
          `INSERT INTO payment_run_items ("runId","poId","supplierId",amount) VALUES ($1,$2,$3,$4)`,
          [runId, po.id, po.supplierId, Number(po.totalAmount)]
        );
      }
    });
    }

    // F9 (audit, ZATCA-amend follow-on): post the JE BEFORE flipping
    // POs to 'paid'. The original sequence transitioned every PO to
    // paid first and then posted the JE — if the post threw (closed
    // period, balance mismatch, network), POs were already paid in
    // the lifecycle but no AP-clearing GL existed. With the order
    // inverted, a JE failure now leaves POs in 'invoice_matched' and
    // the operator can retry the entire run idempotently (the
    // payment_runs.sourceKey + the engine's guardTable/guardId stop
    // duplicates).

    // Post a single aggregated journal entry for the whole run, with one AP
    // debit per PO so per-vendor subledger still reconciles. The cash credit
    // is REDUCED by the total WHT withheld (the buyer doesn't actually
    // pay it out — it sits in WHT payable until the next ZATCA filing).
    //
    //   DR AP        Σ po.totalAmount       (per-PO, full gross)
    //        CR WHT Payable    Σ wht        (aggregated by payable account)
    //        CR Cash           total − wht
    let journalId: number | null = null;
    const lines: any[] = [];
    // Multi-branch payment run: each per-PO AP debit line carries the
    // PO's own branchId so per-branch AP aging stays accurate even when
    // a single run consolidates POs from multiple branches in the same
    // company. The aggregated WHT + cash CR lines carry the dominant
    // branch (the one with the most POs in this run) so single-branch
    // runs work exactly as before; multi-branch runs leave the credit
    // side on the dominant branch (the per-PO DR lines anchor the
    // per-branch subledger).
    const branchCounts = new Map<number, number>();
    for (const po of pos) {
      const poBranchId = po.branchId as number | null;
      lines.push({
        accountCode: apAccount,
        debit: Number(po.totalAmount),
        credit: 0,
        vendorId: po.supplierId,
        branchId: poBranchId ?? undefined,
      });
      if (poBranchId != null) {
        branchCounts.set(poBranchId, (branchCounts.get(poBranchId) ?? 0) + 1);
      }
    }
    const dominantBranchId = Array.from(branchCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? scope.branchId;
    // When the payment run covers exactly ONE vendor, carry vendorId
    // on the WHT-payable and cash CR lines too so the vendor subledger
    // reconciles cleanly. With multiple vendors the credit side is an
    // aggregate (one line per WHT account / one cash line) so there's
    // no single vendor to attribute — leave NULL in that case (the
    // per-PO DR lines still carry vendorId, so the AP subledger ties).
    const uniqueSupplierIds = Array.from(new Set(pos.map(po => Number(po.supplierId)).filter(Boolean)));
    const singleVendorId = uniqueSupplierIds.length === 1 ? uniqueSupplierIds[0] : undefined;
    for (const [code, amount] of whtCreditByAccount) {
      lines.push({ accountCode: code, debit: 0, credit: amount, vendorId: singleVendorId, branchId: dominantBranchId ?? undefined });
    }
    lines.push({ accountCode: cashAccount, debit: 0, credit: netCashOut, vendorId: singleVendorId, branchId: dominantBranchId ?? undefined });
    const paymentRunJournalResult = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      // Header branch = dominant branch from the PO mix. When the run
      // spans multiple branches, per-line branchId on the AP debits keeps
      // per-branch AR/AP reports accurate; the header just anchors the
      // primary owning branch for permission scoping.
      branchId: dominantBranchId ?? scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: runRef,
      description: totalWht > 0
        ? `دفعة مجمّعة ${runRef}: ${pos.length} أمر شراء، إجمالي ${totalPayment} (نقد ${netCashOut} + استقطاع ${totalWht})`
        : `دفعة مجمّعة ${runRef}: ${pos.length} أمر شراء بإجمالي ${totalPayment}`,
      sourceType: "payment_run",
      sourceId: runId ?? 0,
      sourceKey: `finance:payment_run:${runId}`,
      lines,
      guardTable: "payment_runs",
      guardId: runId ?? 0,
    });
    journalId = paymentRunJournalResult.journalId;
    markIdempotencyReplay(req, res, paymentRunJournalResult.alreadyExists);
    if (journalId && runId) {
      await rawExecute(`UPDATE payment_runs SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3`, [journalId, runId, scope.companyId]);
    }

    // Snapshot per-PO WHT onto supplier_payment_allocations so vendor
    // statements + the next ZATCA WHT filing can reproduce exactly which
    // payment withheld what. Only the PO that actually had WHT applied
    // gets a row — skipping resident-supplier POs keeps the table sparse.
    // Idempotent replay (alreadyExists) skips re-inserts.
    if (journalId && whtByPo.length > 0 && !paymentRunJournalResult.alreadyExists) {
      for (const w of whtByPo) {
        await rawExecute(
          `INSERT INTO supplier_payment_allocations
             ("companyId","branchId","journalEntryId","obligationType","obligationId",
              amount,"whtAmount","whtRate","whtCategory","createdBy")
           VALUES ($1,$2,$3,'purchase_order',$4,$5,$6,$7,$8,$9)`,
          [
            scope.companyId,
            scope.branchId ?? null,
            journalId,
            w.poId,
            w.net,                  // amount actually paid (net)
            w.wht,
            w.rate,
            w.category,
            scope.activeAssignmentId ?? null,
          ]
        );
      }
    }

    // Now that the JE is committed and the WHT allocations snapshotted,
    // it's safe to flip each PO to 'paid'. A failure mid-loop here
    // leaves the GL correct (run can be reconciled manually) — the
    // critical "POs marked paid with no GL" window is closed by the
    // ordering inversion above. Each PO transition gets its own audit
    // trail (the lifecycle engine writes per-row).
    for (const po of pos) {
      await applyTransition({
        entity: "purchase_orders",
        id: po.id as number,
        scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
        action: "purchase_order.paid",
        fromStates: ["invoice_matched"],
        toState: "paid",
        setExtras: { paidAt: payDate },
        after: { paymentRunId: runId, runRef },
      }).catch(async () => {
        // paidAt column may not exist — fall back without setExtras
        await applyTransition({
          entity: "purchase_orders",
          id: po.id as number,
          scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
          action: "purchase_order.paid",
          fromStates: ["invoice_matched"],
          toState: "paid",
          after: { paymentRunId: runId, runRef },
        });
      });
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "payment_run.executed",
      entity: "payment_runs",
      entityId: runId ?? 0,
      details: JSON.stringify({ runRef, poCount: pos.length, totalPayment, journalId }),
    }).catch((e) => logger.error(e, "finance-purchase background task failed"));

    const [run] = await rawQuery<Record<string, unknown>>(`SELECT * FROM payment_runs WHERE id=$1 AND "companyId"=$2`, [runId, scope.companyId]);
    res.status(201).json(run || { runId, runRef, paymentDate: payDate, method, poCount: pos.length, totalPayment, journalId });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Payment run execute error:");
  }
});

purchaseRouter.get("/payment-run", authorize({ feature: "finance.purchase", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;

    let rows: any[] = [];
    try {
      rows = await rawQuery<Record<string, unknown>>(
        `SELECT id, ref, "paymentDate", method, "totalAmount", "poCount", status, "journalId", "createdAt"
           FROM payment_runs WHERE "companyId" = $1 ORDER BY "paymentDate" DESC, id DESC LIMIT 500`,
        [scope.companyId]
      );
    } catch (e) { logger.warn(e, "payment_runs table not created yet"); }
    res.json(maskFields(req, { data: rows }));
  } catch (err) {
    handleRouteError(err, res, "List payment runs error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7.1 — migrated from finance.ts (canonical ownership consolidation)
// ─────────────────────────────────────────────────────────────────────────────

purchaseRouter.post("/purchase-requests/:id/convert-to-po", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const { expectedDelivery, notes } = zodParse(convertToPOSchema.safeParse(req.body ?? {}));

    const [pr] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2`,
      [id, scope.companyId]
    );
    if (!pr) {
      throw new NotFoundError("طلب الشراء غير موجود");
    }
    if (pr.status !== "approved") {
      throw new ValidationError("يجب الموافقة على طلب الشراء أولاً");
    }

    // Numbering center (Issue #1141) — atomic issue + INSERT + linkback.
    let poId!: number;
    let poRef!: string;
    await withTransaction(async () => {
      const issuedPo = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "purchase",
        entityKey: "purchase_order",
        entityTable: "purchase_orders",
        actorId: scope.userId,
        metadata: { fromPurchaseRequestId: id },
        expectedTiming: "on_draft",
      });
      poRef = issuedPo.number;

      await applyTransition({
        entity: "purchase_requests",
        id,
        scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
        action: "purchase_request.converted",
        fromStates: ["approved"],
        toState: "converted",
        after: { poRef },
        onApply: async (_row: any, client: any) => {
          const poRes = await client.query(
            `INSERT INTO purchase_orders ("companyId",ref,"supplierId","requestId",status,"totalAmount","expectedDelivery","createdBy",notes,"branchId")
             VALUES ($1,$2,$3,$4,'pending_approval',$5,$6,$7,$8,$9) RETURNING id`,
            [
              scope.companyId,
              poRef,
              pr.supplierId,
              id,
              Number(pr.totalAmount),
              expectedDelivery ?? null,
              scope.activeAssignmentId,
              notes ?? null,
              scope.branchId || null,
            ]
          );
          poId = poRes.rows[0].id;
        },
      });

      await rawExecute(
        `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
        [poId, issuedPo.assignmentId]
      );
    });

    const approvalResult = await initiateApprovalChain({
      companyId: scope.companyId, branchId: scope.branchId,
      chainType: "purchases", refType: "purchase_order", refId: poId,
      amount: Number(pr.totalAmount),
    });

    if (approvalResult.requiresApproval) {
      await applyTransition({
        entity: "purchase_orders",
        id: poId,
        scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
        action: "purchase_order.submitted_for_approval",
        fromStates: ["pending"],
        toState: "pending_approval",
      });
    }

    if (pr.supplierId) {
      const [supplier] = await rawQuery<Record<string, unknown>>(
        `SELECT name, email, phone FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
        [pr.supplierId, scope.companyId]
      );
      if (supplier?.email) {
        logger.info({ supplierEmail: supplier.email, poRef }, "P2P supplier email notification");
      }
      if (supplier?.phone) {
        logger.info({ supplierPhone: supplier.phone, poRef }, "P2P supplier SMS notification");
      }
    }

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "purchase_order.created",
      entity: "purchase_orders",
      entityId: poId,
      details: JSON.stringify({ poRef, prId: id, approvalRequired: approvalResult.requiresApproval, supplierNotified: !!pr.supplierId }),
    }).catch((e) => logger.error(e, "finance-purchase background task failed"));

    const [po] = await rawQuery<Record<string, unknown>>(
      `SELECT po.*, s.name AS "supplierName", s.email AS "supplierEmail"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId" AND s."deletedAt" IS NULL
       WHERE po.id = $1 AND po."companyId" = $2 AND po."deletedAt" IS NULL`,
      [poId, scope.companyId]
    );

    res.status(201).json({ ...po, approval: approvalResult, supplierNotified: !!pr.supplierId });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Finance error:");
  }
});

// Audit F5 — DOC. Reporting hook used by the GRN-aging job; not driven
// from the UI. Kept for the scheduled task.
purchaseRouter.get("/purchase-orders/pending-grn", authorize({ feature: "finance.purchase", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT po.id, po.ref, po.status, po."totalAmount" AS total, s.name AS "supplierName",
              po."createdAt", po."expectedDelivery"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId" AND s."deletedAt" IS NULL
       WHERE po."companyId" = $1 AND po.status IN ('approved','sent','partially_received')
         AND po."deletedAt" IS NULL
       ORDER BY po."createdAt" DESC LIMIT 500`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "PO pending GRN error:"); }
});

purchaseRouter.get("/purchase-orders/:id", authorize({ feature: "finance.purchase", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [po] = await rawQuery<Record<string, unknown>>(
      `SELECT po.*, s.name AS "supplierName", s.phone AS "supplierPhone", s.email AS "supplierEmail",
              b.name AS "branchName", b."nameEn" AS "branchNameEn", b."logoUrl" AS "branchLogoUrl",
              b.address AS "branchAddress", b.phone AS "branchPhone", b.email AS "branchEmail",
              b.website AS "branchWebsite", b."taxNumber" AS "branchTaxNumber", b."crNumber" AS "branchCrNumber",
              b."footerText" AS "branchFooterText", b.city AS "branchCity"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId" AND s."deletedAt" IS NULL
       LEFT JOIN branches b ON b.id = po."branchId"
       WHERE po.id = $1 AND po."companyId" = $2 AND po."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!po) throw new NotFoundError("أمر الشراء غير موجود");

    let lines: any[] = [];
    try {
      lines = await rawQuery<Record<string, unknown>>(
        `SELECT * FROM purchase_order_items WHERE "orderId" = $1 ORDER BY id`,
        [id]
      );
    } catch (e) { logger.error(e, "PO lines fetch error"); }

    res.json(maskFields(req, { ...po, lines }));
  } catch (err) {
    handleRouteError(err, res, "PO detail error:");
  }
});

purchaseRouter.patch("/purchase-orders/:id/vendor-confirm", authorize({ feature: "finance.purchase", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const { confirmedDelivery, notes } = zodParse(vendorConfirmSchema.safeParse(req.body ?? {}));

    const [po] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!po) {
      throw new NotFoundError("أمر الشراء غير موجود");
    }
    if (!["pending", "sent"].includes(po.status as string)) {
      throw new ValidationError("لا يمكن تأكيد أمر الشراء في هذه الحالة");
    }

    await applyTransition({
      entity: "purchase_orders",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
      action: "purchase_order.vendor_confirmed",
      fromStates: ["pending", "sent"],
      toState: "confirmed",
      setExtras: {
        ...(confirmedDelivery ? { expectedDelivery: confirmedDelivery } : {}),
        ...(notes ? { notes: { raw: `COALESCE(notes,'') || ' ' || '${notes.replace(/'/g, "''")}'` } } : {}),
      },
      after: { confirmedDelivery },
    });

    res.json({ message: "تم تأكيد أمر الشراء من المورد", status: "confirmed" });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Finance error:");
  }
});

purchaseRouter.post("/purchase-orders/:id/match-invoice", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    const { supplierInvoiceRef, invoicedAmount, invoicedDate } = zodParse(matchInvoiceSchema.safeParse(req.body ?? {}));

    const [po] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!po) {
      throw new NotFoundError("أمر الشراء غير موجود");
    }
    if (!["received", "partially_received"].includes(po.status as string)) {
      throw new ValidationError("يجب استلام البضاعة قبل مطابقة الفاتورة");
    }

    const poTotal = Number(po.totalAmount);
    const invAmount = Number(invoicedAmount);

    let prTotal = poTotal;
    if (po.requestId) {
      const [prRow] = await rawQuery<Record<string, unknown>>(
        `SELECT "totalAmount" FROM purchase_requests WHERE id = $1 AND "companyId" = $2`,
        [po.requestId, scope.companyId]
      );
      if (prRow) prTotal = Number(prRow.totalAmount);
    }

    // Read received total from goods_receipts (the source of truth for GRN
    // amounts) instead of warehouse_movements. The previous shape joined
    // by `warehouse_movements.reference = 'GR-' + po.ref`, which silently
    // fell back to poTotal when the WMS hadn't synced — masking the
    // mismatch and letting the 3-way match pass on a stale receipt total.
    // goods_receipts.totalAmount is set inside the same transaction as
    // the GRN JE, so it's always consistent with the GL.
    let receivedTotal = poTotal;
    const grnRows = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM("totalAmount"), 0) AS total
         FROM goods_receipts
        WHERE "companyId" = $1 AND "poId" = $2 AND "deletedAt" IS NULL`,
      [scope.companyId, id]
    );
    if (grnRows[0]?.total && Number(grnRows[0].total) > 0) {
      receivedTotal = Number(grnRows[0].total);
    }

    const poVariance = Math.abs(poTotal - invAmount);
    const poVariancePct = poTotal > 0 ? (poVariance / poTotal) * 100 : 0;
    const prVariance = Math.abs(prTotal - invAmount);
    const prVariancePct = prTotal > 0 ? (prVariance / prTotal) * 100 : 0;
    const grVariance = Math.abs(receivedTotal - invAmount);
    const grVariancePct = receivedTotal > 0 ? (grVariance / receivedTotal) * 100 : 0;

    const isMatched = poVariancePct <= 5 && prVariancePct <= 5 && grVariancePct <= 5;

    // FIN-AUD-08 — 3-way match posts DR GRNI / CR AP when matched, so
    // matching an invoice into a closed period would land AP recognition
    // inside that period. Other AP entry points (GRN receipt, vendor
    // payment, payment run) all gate their post on checkFinancialPeriodOpen;
    // the match handler was the lone gap. Reject the match up front so the
    // PO status doesn't get transitioned to invoice_matched without the GL
    // entry. Note: we always check, even for mismatches, because rejecting
    // the match in a closed period preserves the operator's chance to fix
    // the period and retry once the gate is clean.
    const matchDateForPeriod = (invoicedDate as string | undefined) ?? todayISO();
    const matchPeriodCheck = await checkFinancialPeriodOpen(scope.companyId, matchDateForPeriod);
    if (!matchPeriodCheck.open) {
      throw new ConflictError(
        `لا يمكن مطابقة فاتورة في فترة مُقفلة: ${matchPeriodCheck.periodName ?? ""}`,
        { field: "invoicedDate", meta: { periodName: matchPeriodCheck.periodName } },
      );
    }

    const matchStatus = isMatched ? "invoice_matched" : "invoice_mismatch";
    const matchNote = ` | مطابقة ثلاثية: فاتورة=${invAmount} طلب=${prTotal} أمر=${poTotal} استلام=${receivedTotal}`;
    const mismatchNotifications = !isMatched
      ? [
          {
            assignmentId: scope.activeAssignmentId,
            type: "three_way_mismatch",
            title: `عدم تطابق ثلاثي – ${po.ref}`,
            body: `فاتورة=${invAmount} | طلب=${prTotal} | أمر=${poTotal} | استلام=${receivedTotal}`,
            priority: "high" as const,
            refType: "purchase_orders",
            refId: id,
            actionUrl: `/finance/purchase-orders/${id}`,
          },
        ]
      : undefined;

    // FIN-001 + F7 (audit follow-up): wrap the match JE + the
    // applyTransition in one withTransaction so a JE post that succeeds
    // but a subsequent transition failure can't leave the GRNI cleared
    // with the PO still in 'received' (a retry would double-post the
    // match JE because the engine's sourceKey guard only catches exact
    // payload replays). With guardTable/guardId on the JE post the
    // engine anchor catches dupes deterministically.
    const { financialEngine } = await import("../lib/engines/index.js");

    let matchAlreadyExists = false;
    await withTransaction(async (client: any) => {
      if (isMatched) {
        const [matchGrniCode, matchApCode] = await Promise.all([
          financialEngine.resolveAccountCode(scope.companyId, "purchase_grni", "debit", "2150"),
          financialEngine.resolveAccountCode(scope.companyId, "purchase_vendor_ap", "credit", "2111"),
        ]);
        const grniRowRes = await client.query(
          `SELECT COALESCE(SUM(jl.credit), 0) AS grni
             FROM goods_receipts gr
             JOIN journal_lines jl ON jl."journalId" = gr."journalId"
             JOIN chart_of_accounts coa ON coa.id = jl."accountId"
            WHERE gr."poId" = $1 AND gr."companyId" = $2 AND gr."deletedAt" IS NULL
              AND coa.code = $3 AND coa."deletedAt" IS NULL AND jl.credit > 0`,
          [id, scope.companyId, matchGrniCode]
        );
        const grniBalance = roundTo2(Number(grniRowRes.rows[0]?.grni ?? 0));
        if (grniBalance > 0) {
          const matchResult = await financialEngine.postJournalEntry({
            companyId: scope.companyId,
            branchId: scope.branchId,
            createdBy: scope.activeAssignmentId,
            ref: `MATCH-${po.ref}`,
            description: `مطابقة فاتورة المورّد ${supplierInvoiceRef} - أمر ${po.ref}`,
            sourceType: "purchase_invoice_match",
            sourceId: id,
            sourceKey: `finance:invoice_match:${id}`,
            lines: [
              { accountCode: matchGrniCode, debit: grniBalance, credit: 0, vendorId: po.supplierId as number | undefined },
              { accountCode: matchApCode, debit: 0, credit: grniBalance, vendorId: po.supplierId as number | undefined },
            ],
            guardTable: "purchase_orders",
            guardId: id,
          });
          matchAlreadyExists = matchResult.alreadyExists;
        }
      }

      await applyTransition({
        entity: "purchase_orders",
        id,
        scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
        action: isMatched ? "purchase_order.three_way_matched" : "purchase_order.three_way_mismatch",
        fromStates: ["received", "partially_received"],
        toState: matchStatus,
        setExtras: {
          notes: { raw: `CONCAT(COALESCE(notes,''), '${matchNote.replace(/'/g, "''")}')` },
        },
        after: { supplierInvoiceRef, invoicedAmount: invAmount, poTotal, prTotal, receivedTotal },
        notifications: mismatchNotifications,
        client,
      });
    });
    markIdempotencyReplay(req, res, matchAlreadyExists);

    res.json({
      message: isMatched ? "تمت المطابقة الثلاثية بنجاح" : "عدم تطابق في المطابقة الثلاثية",
      isMatched,
      threeWayMatch: {
        purchaseRequest: prTotal,
        purchaseOrder: poTotal,
        goodsReceipt: receivedTotal,
        supplierInvoice: invAmount,
      },
      variances: {
        poVsInvoice: { amount: poVariance, pct: Math.round(poVariancePct) },
        prVsInvoice: { amount: prVariance, pct: Math.round(prVariancePct) },
        grVsInvoice: { amount: grVariance, pct: Math.round(grVariancePct) },
      },
      status: isMatched ? "invoice_matched" : "invoice_mismatch",
    });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Finance error:");
  }
});

purchaseRouter.post("/purchase-orders/:id/schedule-payment", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
    // as-any-reason: justified-pragmatic - zodParse inferred type is widened so subsequent destructure/index accesses do not require explicit per-field generics; behavior unchanged
    const { paymentDate, amount, method = "bank_transfer", notes } = zodParse(schedulePaymentSchema.safeParse(req.body ?? {})) as any;

    const [po] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!po) {
      throw new NotFoundError("أمر الشراء غير موجود");
    }

    // P02-S3-MED — was missing both the period-open check that every
    // other GL-posting route in this file uses (lines 456, 777) AND
    // the await on the journal entry. The status update happened
    // first, then `createJournalEntry(...).catch((e) => logger.error(e, "finance-purchase background task failed"))`
    // dropped any failure on the floor, so a closed-period rejection
    // (or a missing AP/Cash account) left the PO marked
    // `payment_scheduled` with zero matching journal entries — a
    // ghost scheduled payment invisible to the accountant until
    // month-end reconciliation refused to balance.
    //
    // Now: validate the period first, await the JE post so any
    // failure throws, and only then move the PO to
    // payment_scheduled. If the JE fails, the status stays put and
    // the user sees a typed error.
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, paymentDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن جدولة دفعة في فترة مُقفلة: ${periodCheck.periodName ?? ""}`
      );
    }

    // F8 (audit follow-up): wrap the JE post + paidAmount bump +
    // applyTransition in one withTransaction so a partial failure can't
    // leave the GL posted with the PO still in 'invoice_matched' (the
    // operator would re-run schedule-payment and double-post). The JE
    // also carries guardTable/guardId now, so the engine's idempotency
    // anchor kicks in on retry.
    const { financialEngine } = await import("../lib/engines/index.js");
    const schedApCode = await financialEngine.resolveAccountCode(scope.companyId, "purchase_vendor_ap", "debit", "2111");
    // النقد التشغيلي (1111) لا بنك الرواتب — نفس تصحيح دفعة المورّد (٢٠٢٦-٠٧-٠١).
    const schedCashCode = await financialEngine.resolveAccountCode(scope.companyId, "vendor_payment_cash", "credit", "1111");

    let schedAlreadyExists = false;
    await withTransaction(async (client: any) => {
      const schedResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `SCHED-PAY-${po.ref}`,
        description: `دفعة مجدولة لأمر الشراء ${po.ref} بتاريخ ${paymentDate}`,
        sourceType: "purchase_order_payment",
        sourceId: id,
        sourceKey: `finance:sched_payment:${id}:${paymentDate}:${Number(amount)}`,
        lines: [
          { accountCode: schedApCode, debit: Number(amount), credit: 0, vendorId: po.supplierId as number | undefined },
          { accountCode: schedCashCode, debit: 0, credit: Number(amount), vendorId: po.supplierId as number | undefined },
        ],
        guardTable: "purchase_orders",
        guardId: id,
      });
      schedAlreadyExists = schedResult.alreadyExists;

      // Bump the cumulative paidAmount on the PO so AP aging recognises
      // the scheduled draw — the previous shape only flipped status,
      // leaving paidAmount=0 even after a scheduled-payment run.
      await client.query(
        `UPDATE purchase_orders SET "paidAmount" = COALESCE("paidAmount",0) + $1
         WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
        [Number(amount), id, scope.companyId],
      );

      const schedNote = ` | دفعة مجدولة ${paymentDate}: ${amount} (${method})`;
      await applyTransition({
        entity: "purchase_orders",
        id,
        scope: { companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId },
        action: "purchase_order.payment_scheduled",
        toState: "payment_scheduled",
        setExtras: {
          notes: { raw: `CONCAT(COALESCE(notes,''), '${schedNote.replace(/'/g, "''")}')` },
        },
        after: { paymentDate, amount, method },
        client,
      });
    });
    markIdempotencyReplay(req, res, schedAlreadyExists);

    res.json({
      message: "تم جدولة الدفعة بنجاح",
      paymentDate,
      amount,
      method,
      status: "payment_scheduled",
    });
  } catch (err) {
    const lcErr = lifecycleErrorResponse(err);
    if (lcErr) { res.status(lcErr.status).json(lcErr.body); return; }
    handleRouteError(err, res, "Finance error:");
  }
});



// ═══════════════════════════════════════════════════════════════════════════════
// VENDOR ADVANCES + VENDOR CREDIT MEMOS
// AP mirror of customer-advances / credit-memos. Same shape, same
// idempotency model, same atomic GL+counter update pattern. Without
// these, supplier prepayments had no clean place to land and supplier
// returns corrupted AR by going through the customer credit-memo path.
// ═══════════════════════════════════════════════════════════════════════════════

// POST /vendor-advances — record a prepayment to a supplier.
//   DR Vendor advance receivable (1420)
//        CR Cash (1100)
purchaseRouter.post("/vendor-advances", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createVendorAdvanceSchema.safeParse(req.body));
    const { supplierId, amount, method = "bank_transfer", reference, notes, paidDate } = b;

    const [supplier] = await rawQuery<{ id: number; name: string }>(
      `SELECT id, name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [supplierId, scope.companyId]
    );
    if (!supplier) {
      throw new ValidationError("المورد غير موجود", { field: "supplierId", fix: "اختر مورداً من قائمة الموردين." });
    }

    const recvDate = paidDate || todayISO();
    const advPeriodCheck = await checkFinancialPeriodOpen(scope.companyId, recvDate);
    if (!advPeriodCheck.open) {
      throw new ConflictError(
        `لا يمكن تسجيل دفعة مقدمة لمورد في فترة مُقفلة: ${advPeriodCheck.periodName ?? ""}`,
        { field: "paidDate", meta: { periodName: advPeriodCheck.periodName } },
      );
    }

    const amt = roundTo2(Number(amount));

    // Idempotency separation (#1141): the user-facing number comes ONLY
    // from the central numbering authority and is INDEPENDENT of the
    // idempotency key (neither derives from the other). The stored
    // sourceKey is the STABLE retry tuple (supplierId + date + caller
    // token) — kept stable so the UNIQUE (companyId, sourceKey) index on
    // vendor_advances (migration 232) catches concurrent races, while a
    // sequential retry is short-circuited below BEFORE a number is issued.
    const advIdemToken = requestIdempotencyToken(req);
    const advReplayKey = `finance:vendor_advance:${supplierId}:${recvDate}:${boundedIdempotencyToken(advIdemToken)}`;

    // Idempotency: short-circuit a sequential retry BEFORE issuing, so no
    // fresh number is burned and no duplicate document is created.
    const [existingAdv] = await rawQuery<{ id: number; ref: string }>(
      `SELECT id, ref FROM vendor_advances
        WHERE "companyId" = $1 AND "sourceKey" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [scope.companyId, advReplayKey]
    ).catch(() => [] as { id: number; ref: string }[]);
    if (existingAdv) {
      markIdempotencyReplay(req, res, true);
      res.status(200).json({ advanceId: existingAdv.id, ref: existingAdv.ref, supplierId, amount: amt, replayed: true });
      return;
    }

    // #1141 cleanup — vendor_advance ref through the numbering center
    // (scheme `finance.vendor_advance`, seeded by migration 413). The AP
    // mirror of the customer_advance flow in routes/finance-invoices.ts.
    // The `reference` body field is still honoured for legacy imports.
    let advRef: string;
    let issuedAdv: Awaited<ReturnType<typeof issueNumber>> | null = null;
    if (reference) {
      advRef = reference;
    } else {
      issuedAdv = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "finance",
        entityKey: "vendor_advance",
        entityTable: "vendor_advances",
        actorId: scope.userId,
        metadata: { supplierId },
        expectedTiming: "on_draft",
      });
      advRef = issuedAdv.number;
    }
    // Stored sourceKey = the STABLE retry tuple (backs the UNIQUE index).
    const advSourceKey = advReplayKey;

    // F2 (audit follow-up): JE post + journalId stamp INSIDE the same
    // withTransaction. Same shape as customer-advances fix.
    const { financialEngine } = await import("../lib/engines/index.js");
    const [advReceivableCode, cashCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "vendor_advance_receivable", "debit", "1190"),
      financialEngine.resolveAccountCode(scope.companyId, "vendor_advance_cash", "credit", "1111"),
    ]);

    let advanceId: number | null = null;
    let journalId: number | null = null;
    let vadvAlreadyExists = false;
    await withTransaction(async (client: any) => {
      try {
        const ins = await client.query(
          `INSERT INTO vendor_advances ("companyId","branchId","supplierId",ref,amount,"appliedAmount",method,"paidDate",notes,"createdBy",status,"sourceKey")
           VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,'open',$10) RETURNING id`,
          [scope.companyId, scope.branchId, supplierId, advRef, amt, method, recvDate, notes ?? null, scope.activeAssignmentId, advSourceKey]
        );
        advanceId = ins.rows[0].id;
      } catch (e: any) {
        if (e?.code === "42P01") {
          await client.query(
            `CREATE TABLE IF NOT EXISTS vendor_advances (
               id SERIAL PRIMARY KEY,
               "companyId" INTEGER NOT NULL,
               "branchId" INTEGER,
               "supplierId" INTEGER NOT NULL,
               ref TEXT NOT NULL,
               amount NUMERIC(18,2) NOT NULL,
               "appliedAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
               method TEXT,
               "paidDate" DATE NOT NULL,
               notes TEXT,
               status TEXT NOT NULL DEFAULT 'open',
               "journalId" INTEGER,
               "sourceKey" VARCHAR(128),
               "createdBy" INTEGER,
               "createdAt" TIMESTAMP DEFAULT NOW(),
               "deletedAt" TIMESTAMP
             );
             CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_advances_source_key
               ON vendor_advances ("companyId", "sourceKey")
               WHERE "sourceKey" IS NOT NULL;`
          );
          const ins2 = await client.query(
            `INSERT INTO vendor_advances ("companyId","branchId","supplierId",ref,amount,"appliedAmount",method,"paidDate",notes,"createdBy",status,"sourceKey")
             VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,'open',$10) RETURNING id`,
            [scope.companyId, scope.branchId, supplierId, advRef, amt, method, recvDate, notes ?? null, scope.activeAssignmentId, advSourceKey]
          );
          advanceId = ins2.rows[0].id;
        } else {
          throw e;
        }
      }

      // Numbering link-back (documented exception to the bypass guard):
      // point the reserved/assigned numbering row at the freshly-created
      // vendor_advances row. Mirrors the customer_advance link-back in
      // routes/finance-invoices.ts.
      if (issuedAdv && advanceId) {
        await client.query(
          `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
          [advanceId, issuedAdv.assignmentId],
        );
      }

      const advResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: advRef,
        description: `دفعة مقدمة للمورد ${supplier.name} (#${supplierId}): ${amt}`,
        sourceType: "vendor_advance",
        sourceId: advanceId ?? 0,
        sourceKey: `finance:vendor_advance:${advanceId}`,
        lines: [
          { accountCode: advReceivableCode, debit: amt, credit: 0, vendorId: supplierId },
          { accountCode: cashCode, debit: 0, credit: amt, vendorId: supplierId },
        ],
        guardTable: "vendor_advances",
        guardId: advanceId ?? 0,
      });
      journalId = advResult.journalId;
      vadvAlreadyExists = advResult.alreadyExists;

      if (journalId && advanceId) {
        await client.query(
          `UPDATE vendor_advances SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3`,
          [journalId, advanceId, scope.companyId],
        );
      }
    });
    markIdempotencyReplay(req, res, vadvAlreadyExists);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "finance.vendor_advance.created", entity: "vendor_advances", entityId: advanceId ?? 0,
      after: { ref: advRef, supplierId, amount: amt, journalId },
    }).catch((e) => logger.error(e, "finance-purchase vendor-advance-create audit failed"));

    res.status(201).json({ advanceId, ref: advRef, supplierId, amount: amt, journalId, status: "open" });
  } catch (err) {
    handleRouteError(err, res, "Vendor advance create error:");
  }
});

// POST /vendor-advances/:id/apply — apply a vendor advance against an AP open balance.
//   DR Vendor AP (2100)
//        CR Vendor advance receivable (1420)
purchaseRouter.post("/vendor-advances/:id/apply", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const advanceId = parseId(req.params.id, "id");
    const { poId, amount } = zodParse(applyVendorAdvanceSchema.safeParse(req.body ?? {}));
    const applyAmt = roundTo2(Number(amount));

    // F4 (audit follow-up): typed period gate up front — mirrors the
    // customer-advances/apply fix.
    const vAdvPeriod = await checkFinancialPeriodOpen(scope.companyId, todayISO());
    if (!vAdvPeriod.open) {
      throw new ConflictError(
        `لا يمكن تطبيق دفعة مقدمة للمورد في فترة مُقفلة: ${vAdvPeriod.periodName ?? ""}`,
        { meta: { periodName: vAdvPeriod.periodName } },
      );
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const [apCode, advReceivableCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "purchase_vendor_ap", "debit", "2111"),
      financialEngine.resolveAccountCode(scope.companyId, "vendor_advance_receivable", "credit", "1190"),
    ]);

    let advance: any;
    let po: any;
    let applyResult: { journalId: number; alreadyExists: boolean } | null = null;
    await withTransaction(async (client: any) => {
      const advRes = await client.query(
        `SELECT id, "supplierId", amount, "appliedAmount", "branchId", status
           FROM vendor_advances WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
        [advanceId, scope.companyId]
      );
      advance = advRes.rows[0];
      if (!advance) throw new NotFoundError("الدفعة المقدمة للمورد غير موجودة");
      const remaining = Number(advance.amount) - Number(advance.appliedAmount);
      if (applyAmt > remaining + 0.01) {
        throw new ValidationError(`المبلغ يتجاوز المتبقي من الدفعة المقدمة (${remaining})`);
      }

      const poRes = await client.query(
        `SELECT id, ref, "supplierId", "totalAmount", "paidAmount" FROM purchase_orders
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE`,
        [poId, scope.companyId]
      );
      po = poRes.rows[0];
      if (!po) throw new NotFoundError("أمر الشراء غير موجود");
      if (po.supplierId !== advance.supplierId) {
        throw new ValidationError("المورد في أمر الشراء لا يطابق المورد في الدفعة المقدمة");
      }
      const poOpen = Number(po.totalAmount) - Number(po.paidAmount ?? 0);
      if (applyAmt > poOpen + 0.01) {
        throw new ValidationError(`المبلغ يتجاوز الرصيد المفتوح لأمر الشراء (${poOpen})`);
      }

      await client.query(
        `UPDATE vendor_advances SET "appliedAmount" = COALESCE("appliedAmount",0) + $1,
           status = CASE WHEN COALESCE("appliedAmount",0) + $1 >= amount THEN 'applied' ELSE status END
         WHERE id = $2`,
        [applyAmt, advanceId]
      );
      await client.query(
        `UPDATE purchase_orders SET "paidAmount" = COALESCE("paidAmount",0) + $1
         WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
        [applyAmt, poId, scope.companyId]
      );

      applyResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: advance.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `VENDOR-ADV-APPLY-${advanceId}-${poId}`,
        description: `تطبيق دفعة مقدمة على أمر شراء ${po.ref}`,
        sourceType: "vendor_advance_application",
        sourceId: advanceId,
        sourceKey: `finance:vendor_advance_apply:${advanceId}:${poId}`,
        lines: [
          { accountCode: apCode, debit: applyAmt, credit: 0, vendorId: advance.supplierId },
          { accountCode: advReceivableCode, debit: 0, credit: applyAmt, vendorId: advance.supplierId },
        ],
        guardTable: "vendor_advances",
        guardId: advanceId,
      });
    });

    const journalId = applyResult!.journalId;
    markIdempotencyReplay(req, res, applyResult!.alreadyExists);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "finance.vendor_advance.applied", entity: "vendor_advances", entityId: advanceId,
      after: { poId, amount: applyAmt, journalId },
    }).catch((e) => logger.error(e, "finance-purchase vendor-advance-apply audit failed"));
    res.json({ advanceId, poId, amount: applyAmt, journalId });
  } catch (err) {
    handleRouteError(err, res, "Apply vendor advance error:");
  }
});

// POST /vendor-credits — vendor credit memo (supplier return / pricing
// adjustment in the buyer's favour).
//   DR Vendor AP (2100)             ← amount + VAT
//        CR Sales returns / Inventory (5550 or 1151)
//        CR VAT input reversal (1400)
// Net effect: reduces our payable to the supplier.
purchaseRouter.post("/vendor-credits", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createVendorCreditSchema.safeParse(req.body));
    const { supplierId, poId, amount, reason, memoDate, vatIncluded = true } = b;

    const [supplier] = await rawQuery<{ id: number; name: string }>(
      `SELECT id, name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [supplierId, scope.companyId]
    );
    if (!supplier) {
      throw new ValidationError("المورد غير موجود", { field: "supplierId" });
    }

    const memoDateStr = memoDate || todayISO();
    const creditPeriodCheck = await checkFinancialPeriodOpen(scope.companyId, memoDateStr);
    if (!creditPeriodCheck.open) {
      throw new ConflictError(
        `لا يمكن تسجيل إشعار دائن مورد في فترة مُقفلة: ${creditPeriodCheck.periodName ?? ""}`,
        { field: "memoDate", meta: { periodName: creditPeriodCheck.periodName } },
      );
    }

    const totalAmt = roundTo2(Number(amount));
    // Per-company VAT rate via system_settings (default 15%). Pre-fix
    // vendor credit memo hardcoded 0.15 → tenant on 5% computed the
    // wrong VAT input reversal.
    const vatRate = (await getCompanyVatRate(scope.companyId)) / 100;
    const subtotal = vatIncluded ? roundTo2(totalAmt / (1 + vatRate)) : totalAmt;
    const vatAmount = roundTo2(vatIncluded ? totalAmt - subtotal : totalAmt * vatRate);
    const fullAmount = vatIncluded ? totalAmt : roundTo2(totalAmt + vatAmount);

    // Idempotency separation (#1141, mirrors vendor-advances): the stored
    // sourceKey is the STABLE retry tuple (supplier + date + caller token),
    // kept stable so the UNIQUE (companyId, sourceKey) index on
    // vendor_credit_memos catches concurrent races; a sequential retry is
    // short-circuited here BEFORE a number is issued, so no fresh VCN is
    // burned and no duplicate memo/JE is created. The number comes only
    // from issueNumber and is independent of this key.
    const creditReplayKey = `finance:vendor_credit:${supplierId}:${memoDateStr}:${boundedIdempotencyToken(requestIdempotencyToken(req))}`;
    const [existingMemo] = await rawQuery<{ id: number; ref: string; amount: string; vatAmount: string; totalAmount: string; journalId: number | null; status: string }>(
      `SELECT id, ref, amount::text, "vatAmount"::text, "totalAmount"::text, "journalId", status
         FROM vendor_credit_memos
        WHERE "companyId" = $1 AND "sourceKey" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [scope.companyId, creditReplayKey]
    ).catch(() => [] as { id: number; ref: string; amount: string; vatAmount: string; totalAmount: string; journalId: number | null; status: string }[]);
    if (existingMemo) {
      markIdempotencyReplay(req, res, true);
      res.status(201).json({
        memoId: existingMemo.id, ref: existingMemo.ref, supplierId,
        amount: Number(existingMemo.amount), vatAmount: Number(existingMemo.vatAmount),
        totalAmount: Number(existingMemo.totalAmount), journalId: existingMemo.journalId,
        status: existingMemo.status,
      });
      return;
    }

    // #1141 cleanup — vendor_credit_memo ref through the numbering center
    // (scheme `finance.vendor_credit_memo`, seeded by migration 413). The
    // AP twin of the customer credit_memo issuance in finance-invoices.ts.
    // There is no legacy-import override field on createVendorCreditSchema,
    // so the number is ALWAYS center-issued (the user-facing number comes
    // only from issueNumber, never from a tech ref).
    const issuedMemo = await issueNumber({
      companyId: scope.companyId,
      branchId: scope.branchId ?? null,
      moduleKey: "finance",
      entityKey: "vendor_credit_memo",
      entityTable: "vendor_credit_memos",
      actorId: scope.userId,
      metadata: { supplierId, poId: poId ?? null },
      expectedTiming: "on_draft",
    });
    const creditRef = issuedMemo.number;
    // Stored sourceKey = the STABLE retry tuple (backs the UNIQUE index).
    const creditSourceKey = creditReplayKey;

    // F2 (audit follow-up): JE post + journalId stamp INSIDE the same
    // withTransaction. Same shape as customer-advances fix.
    const { financialEngine } = await import("../lib/engines/index.js");
    const { resolveCompanyInputVatAccount } = await import("../lib/taxCodes.js");
    const [apCode, returnsCode, vatInputGeneral] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "purchase_vendor_ap", "debit", "2111"),
      financialEngine.resolveAccountCode(scope.companyId, "vendor_return_revenue", "credit", "5110"),
      financialEngine.resolveAccountCode(scope.companyId, "vat_input_reversal", "credit", "1180"),
    ]);
    // البند ٤ — يُعكَس على نفس حساب رمز الشركة القياسي الذي حمّلته الفاتورة، وإلا
    // العام؛ فتُغلق تسوية حساب ضريبة المدخلات صفرًا بين الفاتورة وإشعارها.
    const vatInputCode = await resolveCompanyInputVatAccount(scope.companyId, vatInputGeneral);

    let memoId: number | null = null;
    let journalId: number | null = null;
    let vcmAlreadyExists = false;
    await withTransaction(async (client: any) => {
      try {
        const ins = await client.query(
          `INSERT INTO vendor_credit_memos ("companyId","branchId","supplierId","poId",ref,amount,"vatAmount","totalAmount","appliedAmount","memoDate",reason,status,"createdBy","sourceKey")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,'open',$11,$12) RETURNING id`,
          [scope.companyId, scope.branchId, supplierId, poId ?? null, creditRef, subtotal, vatAmount, fullAmount, memoDateStr, reason, scope.activeAssignmentId, creditSourceKey]
        );
        memoId = ins.rows[0].id;
      } catch (e: any) {
        if (e?.code === "42P01") {
          await client.query(
            `CREATE TABLE IF NOT EXISTS vendor_credit_memos (
               id SERIAL PRIMARY KEY,
               "companyId" INTEGER NOT NULL,
               "branchId" INTEGER,
               "supplierId" INTEGER NOT NULL,
               "poId" INTEGER,
               ref TEXT NOT NULL,
               amount NUMERIC(18,2) NOT NULL,
               "vatAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
               "totalAmount" NUMERIC(18,2) NOT NULL,
               "appliedAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
               "memoDate" DATE NOT NULL,
               reason TEXT NOT NULL,
               status TEXT NOT NULL DEFAULT 'open',
               "journalId" INTEGER,
               "sourceKey" VARCHAR(128),
               "createdBy" INTEGER,
               "createdAt" TIMESTAMP DEFAULT NOW(),
               "deletedAt" TIMESTAMP
             );
             CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_credit_memos_source_key
               ON vendor_credit_memos ("companyId", "sourceKey")
               WHERE "sourceKey" IS NOT NULL;`
          );
          const ins2 = await client.query(
            `INSERT INTO vendor_credit_memos ("companyId","branchId","supplierId","poId",ref,amount,"vatAmount","totalAmount","appliedAmount","memoDate",reason,status,"createdBy","sourceKey")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,'open',$11,$12) RETURNING id`,
            [scope.companyId, scope.branchId, supplierId, poId ?? null, creditRef, subtotal, vatAmount, fullAmount, memoDateStr, reason, scope.activeAssignmentId, creditSourceKey]
          );
          memoId = ins2.rows[0].id;
        } else {
          throw e;
        }
      }

      // Numbering link-back (documented exception to the bypass guard):
      // point the assigned numbering row at the freshly-created
      // vendor_credit_memos row. Mirrors the credit_memo link-back in
      // routes/finance-invoices.ts.
      if (memoId) {
        await client.query(
          `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
          [memoId, issuedMemo.assignmentId],
        );
      }

      const memoResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: creditRef,
        description: `إشعار دائن من المورد ${supplier.name}: ${reason}`,
        sourceType: "vendor_credit_memo",
        sourceId: memoId ?? 0,
        sourceKey: `finance:vendor_credit_memo:${memoId}`,
        lines: [
          { accountCode: apCode, debit: fullAmount, credit: 0, vendorId: supplierId, description: `تخفيض ذمم — إشعار دائن` },
          { accountCode: returnsCode, debit: 0, credit: subtotal, vendorId: supplierId, description: `مرتجع/تخفيض مشتريات` },
          ...(vatAmount > 0 ? [{ accountCode: vatInputCode, debit: 0, credit: vatAmount, vendorId: supplierId, description: `عكس ضريبة مدخلات` }] : []),
        ],
        guardTable: "vendor_credit_memos",
        guardId: memoId ?? 0,
      });
      journalId = memoResult.journalId;
      vcmAlreadyExists = memoResult.alreadyExists;

      if (journalId && memoId) {
        await client.query(
          `UPDATE vendor_credit_memos SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3`,
          [journalId, memoId, scope.companyId],
        );
      }
    });
    markIdempotencyReplay(req, res, vcmAlreadyExists);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "finance.vendor_credit.created", entity: "vendor_credit_memos", entityId: memoId ?? 0,
      after: { ref: creditRef, supplierId, amount: subtotal, vatAmount, totalAmount: fullAmount, journalId },
    }).catch((e) => logger.error(e, "finance-purchase vendor-credit-create audit failed"));
    res.status(201).json({ memoId, ref: creditRef, supplierId, amount: subtotal, vatAmount, totalAmount: fullAmount, journalId, status: "open" });
  } catch (err) {
    handleRouteError(err, res, "Vendor credit memo create error:");
  }
});

// POST /vendor-credits/:id/apply — apply a vendor credit memo against
// an open PO. Same shape as advance-apply.
purchaseRouter.post("/vendor-credits/:id/apply", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const memoId = parseId(req.params.id, "id");
    const { poId, amount } = zodParse(applyVendorCreditSchema.safeParse(req.body ?? {}));
    const applyAmt = roundTo2(Number(amount));

    // F4 (audit follow-up): typed period gate up front.
    const vCreditPeriod = await checkFinancialPeriodOpen(scope.companyId, todayISO());
    if (!vCreditPeriod.open) {
      throw new ConflictError(
        `لا يمكن تطبيق إشعار دائن مورد في فترة مُقفلة: ${vCreditPeriod.periodName ?? ""}`,
        { meta: { periodName: vCreditPeriod.periodName } },
      );
    }

    const { financialEngine } = await import("../lib/engines/index.js");
    const [apCode, creditClearingCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "purchase_vendor_ap", "debit", "2111"),
      financialEngine.resolveAccountCode(scope.companyId, "vendor_credit_clearing", "credit", "2111"),
    ]);

    let memo: any;
    let po: any;
    let applyResult: { journalId: number; alreadyExists: boolean } | null = null;
    await withTransaction(async (client: any) => {
      const memoRes = await client.query(
        `SELECT id, "supplierId", "totalAmount", "appliedAmount", "branchId", status
           FROM vendor_credit_memos WHERE id = $1 AND "companyId" = $2 FOR UPDATE`,
        [memoId, scope.companyId]
      );
      memo = memoRes.rows[0];
      if (!memo) throw new NotFoundError("الإشعار الدائن غير موجود");
      const remaining = Number(memo.totalAmount) - Number(memo.appliedAmount);
      if (applyAmt > remaining + 0.01) {
        throw new ValidationError(`المبلغ يتجاوز المتبقي من الإشعار الدائن (${remaining})`);
      }

      const poRes = await client.query(
        `SELECT id, ref, "supplierId", "totalAmount", "paidAmount" FROM purchase_orders
          WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL FOR UPDATE`,
        [poId, scope.companyId]
      );
      po = poRes.rows[0];
      if (!po) throw new NotFoundError("أمر الشراء غير موجود");
      if (po.supplierId !== memo.supplierId) {
        throw new ValidationError("المورد في أمر الشراء لا يطابق المورد في الإشعار الدائن");
      }

      await client.query(
        `UPDATE vendor_credit_memos SET "appliedAmount" = COALESCE("appliedAmount",0) + $1,
           status = CASE WHEN COALESCE("appliedAmount",0) + $1 >= "totalAmount" THEN 'applied' ELSE status END
         WHERE id = $2`,
        [applyAmt, memoId]
      );
      await client.query(
        `UPDATE purchase_orders SET "paidAmount" = COALESCE("paidAmount",0) + $1
         WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
        [applyAmt, poId, scope.companyId]
      );

      applyResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: memo.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `VCM-APPLY-${memoId}-${poId}`,
        description: `تطبيق إشعار دائن على أمر شراء ${po.ref}`,
        sourceType: "vendor_credit_application",
        sourceId: memoId,
        sourceKey: `finance:vendor_credit_apply:${memoId}:${poId}`,
        lines: [
          { accountCode: apCode, debit: applyAmt, credit: 0, vendorId: memo.supplierId },
          { accountCode: creditClearingCode, debit: 0, credit: applyAmt, vendorId: memo.supplierId },
        ],
        guardTable: "vendor_credit_memos",
        guardId: memoId,
      });
    });

    const journalId = applyResult!.journalId;
    markIdempotencyReplay(req, res, applyResult!.alreadyExists);
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "finance.vendor_credit.applied", entity: "vendor_credit_memos", entityId: memoId,
      after: { poId, amount: applyAmt, journalId },
    }).catch((e) => logger.error(e, "finance-purchase vendor-credit-apply audit failed"));
    res.json({ memoId, poId, amount: applyAmt, journalId });
  } catch (err) {
    handleRouteError(err, res, "Apply vendor credit error:");
  }
});

// GET /vendor-advances — list vendor advances for AP module.
purchaseRouter.get("/vendor-advances", authorize({ feature: "finance.purchase", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
    const status = req.query.status as string | undefined;
    const params: any[] = [scope.companyId];
    const conds: string[] = [`va."companyId" = $1`, `va."deletedAt" IS NULL`];
    if (supplierId) { params.push(supplierId); conds.push(`va."supplierId" = $${params.length}`); }
    if (status) { params.push(status); conds.push(`va.status = $${params.length}`); }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT va.*, s.name AS "supplierName"
         FROM vendor_advances va
         LEFT JOIN suppliers s ON s.id = va."supplierId" AND s."deletedAt" IS NULL
        WHERE ${conds.join(" AND ")}
        ORDER BY va.id DESC
        LIMIT 500`,
      params
    ).catch(() => [] as Record<string, unknown>[]);
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List vendor advances error:");
  }
});

// GET /vendor-credits — list vendor credit memos.
purchaseRouter.get("/vendor-credits", authorize({ feature: "finance.purchase", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
    const status = req.query.status as string | undefined;
    const params: any[] = [scope.companyId];
    const conds: string[] = [`vcm."companyId" = $1`, `vcm."deletedAt" IS NULL`];
    if (supplierId) { params.push(supplierId); conds.push(`vcm."supplierId" = $${params.length}`); }
    if (status) { params.push(status); conds.push(`vcm.status = $${params.length}`); }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT vcm.*, s.name AS "supplierName"
         FROM vendor_credit_memos vcm
         LEFT JOIN suppliers s ON s.id = vcm."supplierId" AND s."deletedAt" IS NULL
        WHERE ${conds.join(" AND ")}
        ORDER BY vcm.id DESC
        LIMIT 500`,
      params
    ).catch(() => [] as Record<string, unknown>[]);
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List vendor credits error:");
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// VENDOR INVOICES — supplier-issued invoices entered as AP documents
// Separate from /invoices (AR). vendor_invoices share schema with
// the invoices table conceptually (header + lines) but the entry
// goes through the AP subledger: clientId column unused, supplierId
// is the key. Approval posts DR Expense / DR VAT input / CR AP.
// Without this, supplier invoices had to be entered as AR invoices
// with the vendor's name in a fake "client" record, corrupting both
// subledgers.
// ═══════════════════════════════════════════════════════════════════════════════

const createVendorInvoiceSchema = z.object({
  supplierId: z.coerce.number({ required_error: "المورد مطلوب" }),
  ref: z.string().min(1, "رقم فاتورة المورد مطلوب"),
  invoiceDate: z.string().min(1, "تاريخ الفاتورة مطلوب"),
  dueDate: z.string().optional(),
  poId: z.coerce.number().optional(),
  subtotal: z.coerce.number().nonnegative("المبلغ مطلوب"),
  vatAmount: z.coerce.number().nonnegative().default(0),
  description: z.string().optional(),
  expenseAccountCode: z.string().optional(),
  costCenterId: z.coerce.number().optional(),
  projectId: z.coerce.number().optional(),
  departmentId: z.coerce.number().optional(),
});

// POST /vendor-invoices — create a supplier-issued invoice (AP).
// Posts immediately to the AP subledger; no separate approval cycle
// (mirror customer-advances model). Per-line allocation comes later
// via /vendor-invoices/:id/allocate if needed.
purchaseRouter.post("/vendor-invoices", authorize({ feature: "finance.purchase", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createVendorInvoiceSchema.safeParse(req.body));

    const [supplier] = await rawQuery<{ id: number; name: string }>(
      `SELECT id, name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`,
      [b.supplierId, scope.companyId]
    );
    if (!supplier) throw new ValidationError("المورد غير موجود", { field: "supplierId" });

    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, b.invoiceDate);
    if (!periodCheck.open) {
      throw new ConflictError(
        `لا يمكن تسجيل فاتورة مورد في فترة مُقفلة: ${periodCheck.periodName ?? ""}`,
        { field: "invoiceDate", meta: { periodName: periodCheck.periodName } },
      );
    }

    const subtotal = roundTo2(b.subtotal);
    const vatAmount = roundTo2(b.vatAmount);
    const total = roundTo2(subtotal + vatAmount);
    const sourceKey = `finance:vendor_invoice:${b.supplierId}:${b.ref}:${requestIdempotencyToken(req)}`;

    // Pre-INSERT idempotency: same supplier + same supplier-issued
    // ref + same idempotency token = same invoice.
    const [existingInv] = await rawQuery<{ id: number; ref: string }>(
      `SELECT id, ref FROM vendor_invoices
        WHERE "companyId" = $1 AND "sourceKey" = $2 AND "deletedAt" IS NULL
        LIMIT 1`,
      [scope.companyId, sourceKey]
    ).catch(() => [] as { id: number; ref: string }[]);
    if (existingInv) {
      markIdempotencyReplay(req, res, true);
      res.status(200).json({ invoiceId: existingInv.id, ref: existingInv.ref, supplierId: b.supplierId, total, replayed: true });
      return;
    }

    // F1 + F2 (audit-pass follow-up): pull the JE post + journalId stamp
    // INSIDE the same withTransaction as the INSERT, mirror the
    // customer-advances fix. Also bump the denormalised supplier spend
    // counter + the expense budget bucket so AP dashboards and budget
    // overruns stay accurate.
    const { financialEngine } = await import("../lib/engines/index.js");
    const expenseCode = b.expenseAccountCode
      ?? await financialEngine.resolveAccountCode(scope.companyId, "vendor_invoice_expense", "debit", "5340");
    // ⚠️ مسار مظلَّل (shadowed): معالج POST vendor-invoices في journalRouter
    // (finance-journal:2123) مركَّب قبل purchaseRouter فيلتقط الطلب دائمًا —
    // هذا المعالج لا تصله الواجهة. توصيل دقّة رمز ضريبة الوثيقة على المعالج
    // الحقيقي (resolveVendorInvoicePlan، #3087)؛ لا تربط حساب رمز الضريبة هنا
    // (أُزيل توصيل #3084 الخامل — تنظيف). ملاحظة: لا تُعِد كتابة تعريف مسار
    // كامل (اسمٌ ثم نقطة ثم post) في تعليق هنا — يخدع حارس audit-coverage.
    const [vatInputCode, apCode] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "purchase_vat_input", "debit", "1180"),
      financialEngine.resolveAccountCode(scope.companyId, "purchase_vendor_ap", "credit", "2111"),
    ]);

    let invoiceId: number | null = null;
    let journalId: number | null = null;
    let vinvAlreadyExists = false;
    await withTransaction(async (client: any) => {
      try {
        const ins = await client.query(
          `INSERT INTO vendor_invoices ("companyId","branchId","supplierId",ref,"invoiceDate","dueDate","poId",subtotal,"vatAmount",total,"paidAmount",description,"createdBy",status,"sourceKey")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,'approved',$13) RETURNING id`,
          [scope.companyId, scope.branchId, b.supplierId, b.ref, b.invoiceDate, b.dueDate ?? null,
           b.poId ?? null, subtotal, vatAmount, total, b.description ?? null, scope.activeAssignmentId, sourceKey]
        );
        invoiceId = ins.rows[0].id;
      } catch (e: any) {
        if (e?.code === "42P01") {
          await client.query(
            `CREATE TABLE IF NOT EXISTS vendor_invoices (
               id SERIAL PRIMARY KEY,
               "companyId" INTEGER NOT NULL,
               "branchId" INTEGER,
               "supplierId" INTEGER NOT NULL,
               ref TEXT NOT NULL,
               "invoiceDate" DATE NOT NULL,
               "dueDate" DATE,
               "poId" INTEGER,
               subtotal NUMERIC(18,2) NOT NULL,
               "vatAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
               total NUMERIC(18,2) NOT NULL,
               "paidAmount" NUMERIC(18,2) NOT NULL DEFAULT 0,
               description TEXT,
               status TEXT NOT NULL DEFAULT 'approved',
               "journalId" INTEGER,
               "sourceKey" VARCHAR(128),
               "createdBy" INTEGER,
               "createdAt" TIMESTAMP DEFAULT NOW(),
               "deletedAt" TIMESTAMP
             );
             CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_invoices_source_key
               ON vendor_invoices ("companyId", "sourceKey")
               WHERE "sourceKey" IS NOT NULL;
             CREATE INDEX IF NOT EXISTS idx_vendor_invoices_supplier_status
               ON vendor_invoices ("companyId", "supplierId", status)
               WHERE "deletedAt" IS NULL;`
          );
          const ins2 = await client.query(
            `INSERT INTO vendor_invoices ("companyId","branchId","supplierId",ref,"invoiceDate","dueDate","poId",subtotal,"vatAmount",total,"paidAmount",description,"createdBy",status,"sourceKey")
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,'approved',$13) RETURNING id`,
            [scope.companyId, scope.branchId, b.supplierId, b.ref, b.invoiceDate, b.dueDate ?? null,
             b.poId ?? null, subtotal, vatAmount, total, b.description ?? null, scope.activeAssignmentId, sourceKey]
          );
          invoiceId = ins2.rows[0].id;
        } else {
          throw e;
        }
      }

      // Denormalised supplier-spend counter — symmetric to clients
      // .totalRevenue. Subtotal (not total) so the bump matches the
      // expense recognised, not the VAT input.
      if (subtotal > 0) {
        await client.query(
          `UPDATE suppliers SET "totalSpend" = COALESCE("totalSpend",0) + $1
           WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`,
          [subtotal, b.supplierId, scope.companyId],
        ).catch(() => { /* totalSpend column may not exist yet — non-fatal */ });
      }

      // Budget bucket bump on the expense code for the invoiceDate
      // period — mirrors what the invoice-approval revenue bump does
      // on the sales side.
      if (subtotal > 0) {
        const period = String(b.invoiceDate).slice(0, 7);
        // #2296 — enforce the expense budget on the procurement channel with
        // the same role-aware 80/100/110% gates the manual-expense path applies
        // (finance-journal). validateBudget returns canProceed=false when the
        // caller's role can't authorise the tier, so over-budget vendor bills
        // are blocked (rejected) or require GM/CFO sign-off — instead of being
        // silently consumed and only flagged in a report afterwards.
        const budgetCheck = await validateBudget({
          companyId: scope.companyId, accountCode: expenseCode, amount: subtotal, period, role: scope.role,
        });
        if (!budgetCheck.canProceed) {
          const meta = { utilization: budgetCheck.utilization, status: budgetCheck.status, accountCode: expenseCode };
          if (budgetCheck.status === "rejected") {
            throw new ConflictError(budgetCheck.message, { field: "amount", fix: "أعد تقييم الميزانية أو قلّل المبلغ", meta });
          }
          throw new ForbiddenError(budgetCheck.message, { fix: `يلزم موافقة ${budgetCheck.approvalLevel === "cfo" ? "المدير المالي" : "المدير العام"}`, meta });
        }
        await client.query(
          `UPDATE budgets SET used = COALESCE(used, 0) + $1
           WHERE "companyId" = $2 AND "accountCode" = $3 AND period = $4 AND "deletedAt" IS NULL`,
          [subtotal, scope.companyId, expenseCode, period],
        );
      }

      const invResult = await financialEngine.postJournalEntry({
        companyId: scope.companyId,
        branchId: scope.branchId,
        createdBy: scope.activeAssignmentId,
        ref: `VINV-${invoiceId}`,
        description: `فاتورة مورد ${supplier.name} (${b.ref}): ${b.description ?? ""}`,
        type: "vendor_invoice",
        sourceType: "vendor_invoice",
        sourceId: invoiceId ?? 0,
        sourceKey: `finance:vendor_invoice_je:${invoiceId}`,
        lines: [
          { accountCode: expenseCode, debit: subtotal, credit: 0, vendorId: b.supplierId,
            costCenterId: b.costCenterId, projectId: b.projectId, departmentId: b.departmentId,
            description: `مصروف فاتورة مورد` },
          ...(vatAmount > 0 ? [{ accountCode: vatInputCode, debit: vatAmount, credit: 0, vendorId: b.supplierId, description: `ضريبة مدخلات` }] : []),
          { accountCode: apCode, debit: 0, credit: total, vendorId: b.supplierId, description: `ذمم دائنة — ${supplier.name}` },
        ],
        guardTable: "vendor_invoices",
        guardId: invoiceId ?? 0,
      });
      journalId = invResult.journalId;
      vinvAlreadyExists = invResult.alreadyExists;

      if (journalId && invoiceId) {
        await client.query(
          `UPDATE vendor_invoices SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3`,
          [journalId, invoiceId, scope.companyId],
        );
      }
    });
    markIdempotencyReplay(req, res, vinvAlreadyExists);

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "finance.vendor_invoice.created", entity: "vendor_invoices", entityId: invoiceId ?? 0,
      after: { ref: b.ref, supplierId: b.supplierId, subtotal, vatAmount, total, journalId },
    }).catch((e) => logger.error(e, "finance-purchase vendor-invoice-create audit failed"));

    res.status(201).json({ invoiceId, ref: b.ref, supplierId: b.supplierId, subtotal, vatAmount, total, journalId, status: "approved" });
  } catch (err) {
    handleRouteError(err, res, "Vendor invoice create error:");
  }
});

// GET /vendor-invoices — list with optional supplier / status filter
purchaseRouter.get("/vendor-invoices", authorize({ feature: "finance.purchase", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const supplierId = req.query.supplierId ? Number(req.query.supplierId) : undefined;
    const status = req.query.status as string | undefined;
    const params: any[] = [scope.companyId];
    const conds: string[] = [`vi."companyId" = $1`, `vi."deletedAt" IS NULL`];
    if (supplierId) { params.push(supplierId); conds.push(`vi."supplierId" = $${params.length}`); }
    if (status) { params.push(status); conds.push(`vi.status = $${params.length}`); }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT vi.*, s.name AS "supplierName"
         FROM vendor_invoices vi
         LEFT JOIN suppliers s ON s.id = vi."supplierId" AND s."deletedAt" IS NULL
        WHERE ${conds.join(" AND ")}
        ORDER BY vi.id DESC
        LIMIT 500`,
      params
    ).catch(() => [] as Record<string, unknown>[]);
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List vendor invoices error:");
  }
});

// GET /vendor-invoices/:id — detail
purchaseRouter.get("/vendor-invoices/:id", authorize({ feature: "finance.purchase", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [inv] = await rawQuery<Record<string, unknown>>(
      `SELECT vi.*, s.name AS "supplierName", s.phone AS "supplierPhone", s.email AS "supplierEmail"
         FROM vendor_invoices vi
         LEFT JOIN suppliers s ON s.id = vi."supplierId" AND s."deletedAt" IS NULL
        WHERE vi.id = $1 AND vi."companyId" = $2 AND vi."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!inv) throw new NotFoundError("فاتورة المورد غير موجودة");
    res.json(inv);
  } catch (err) {
    handleRouteError(err, res, "Get vendor invoice error:");
  }
});
