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
  checkFinancialPeriodOpen,
  computeVat,
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
import { markIdempotencyReplay } from "../lib/requestIdempotency.js";
import { z } from "zod";

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
    unitPrice: z.coerce.number().optional(),
    productId: z.coerce.number().optional(),
    ...purchaseLineDimsSchema,
  })).min(1, "يجب إضافة بند واحد على الأقل"),
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
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'pr."companyId"', branchColumn: 'pr."branchId"', enforceBranchScope: true });
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
       LEFT JOIN employees e ON e.id = ea."employeeId" AND e."deletedAt" IS NULL
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
           VALUES ($1,$2,$3,'pending',$4,$5,$6,$7) RETURNING id`,
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

    const [po] = await rawQuery<Record<string, unknown>>(`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`, [poId, scope.companyId]);
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
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'po."companyId"', branchColumn: 'po."branchId"', enforceBranchScope: true, softDeleteColumn: 'po."deletedAt"' });
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
         VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8)`,
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
    const [po] = await rawQuery<Record<string, unknown>>(`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`, [insertId, effectiveCompanyId]);
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

    // Compute totals for this GRN
    let subtotal = 0;
    for (const l of inputLines) {
      const item = poItemMap.get(l.poItemId)!;
      subtotal += l.receivedQty * Number(item.unitPrice);
    }
    subtotal = roundTo2(subtotal);
    const poTotal = Number(po.totalAmount);
    const defaultVatRate = 0.15;
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
    let grnId: number | undefined;
    let grnRef!: string;
    {
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
            `INSERT INTO goods_receipts ("companyId","branchId","poId",ref,"receivedAt","receivedBy",notes)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [scope.companyId, scope.branchId, id, grnRef, receiptDate, scope.activeAssignmentId, qualityNotes ?? null]
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
    const [vatAccount, grniAccount] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "purchase_grn_vat", "debit", "1180"),
      financialEngine.resolveAccountCode(scope.companyId, "purchase_grni", "credit", "2115"),
    ]);

    // Resolve a default account code per lineTreatment. Tenants that
    // haven't mapped these purposes yet inherit the seed defaults
    // (1250 inventory etc) — same fallback shape as
    // resolveAccountCode uses elsewhere.
    const TREATMENT_PURPOSE: Record<string, { purpose: string; side: "debit"; defaultCode: string }> = {
      inventory:            { purpose: "inventory_receipt",            side: "debit", defaultCode: "1250" },
      expense:              { purpose: "general_expense",              side: "debit", defaultCode: "6900" },
      fixed_asset:          { purpose: "fixed_asset_purchase",         side: "debit", defaultCode: "1500" },
      project_cost:         { purpose: "project_cost",                 side: "debit", defaultCode: "6800" },
      vehicle_cost:         { purpose: "vehicle_expense",              side: "debit", defaultCode: "6500" },
      property_maintenance: { purpose: "property_maintenance_expense", side: "debit", defaultCode: "6600" },
      custody:              { purpose: "employee_custody",             side: "debit", defaultCode: "1130" },
      prepayment:           { purpose: "supplier_prepayment",          side: "debit", defaultCode: "1340" },
      service:              { purpose: "service_expense",              side: "debit", defaultCode: "6920" },
    };

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
      scope.companyId, "inventory_receipt", "debit", "1250"
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
      assetId: number | null;
    };
    const buckets = new Map<string, DrBucket>();
    let postedNet = 0;
    for (let i = 0; i < receiptLineRows.length; i++) {
      const ln = receiptLineRows[i];
      const res = lineResolutions[i];

      // Account resolution chain:
      //   1. Resolver picked an account (rule match or manual override)
      //   2. Fall back to TREATMENT_PURPOSE map (Phase 4.2)
      //   3. Fall back to defaultInvAccount (legacy)
      let acct = res.resolvedAccountCode;
      if (!acct) {
        const map = ln.lineTreatment ? TREATMENT_PURPOSE[ln.lineTreatment] : null;
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
        dims.assetId ?? "",
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
          assetId: dims.assetId,
        });
      }
    }

    // Rounding-difference correction lands on the default inventory
    // account so the entry always balances against the GRNI credit.
    const diff = roundTo2(subtotal - postedNet);
    if (Math.abs(diff) >= 0.005) {
      const fallbackKey = `${defaultInvAccount}|||||||||||`;
      const prev = buckets.get(fallbackKey);
      if (prev) prev.amount = roundTo2(prev.amount + diff);
      else buckets.set(fallbackKey, {
        accountCode: defaultInvAccount, amount: diff,
        vendorId: po.supplierId as number | undefined,
        costCenter: null, activityType: null, projectId: null,
        vehicleId: null, propertyId: null, employeeId: null,
        driverId: null, contractId: null, productId: null, assetId: null,
      });
    }

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
        assetId: b.assetId ?? undefined,
      }));

    let journalId: number | null = null;
    const grnJournalResult = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
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
      financialEngine.resolveAccountCode(scope.companyId, "purchase_vendor_ap", "debit", "2100"),
      financialEngine.resolveAccountCode(scope.companyId, "payroll_bank_payout", "credit", "1100"),
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
      scope.companyId, "wht_payable", "credit", "2330",
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
    await withTransaction(async (client: any) => {
      try {
        const ins = await client.query(
          `INSERT INTO payment_runs ("companyId","branchId",ref,"paymentDate",method,"bankAccount","totalAmount","poCount","createdBy",status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'executed') RETURNING id`,
          [scope.companyId, scope.branchId, runRef, payDate, method, bankAccount ?? null, totalPayment, pos.length, scope.activeAssignmentId]
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
            `INSERT INTO payment_runs ("companyId","branchId",ref,"paymentDate",method,"bankAccount","totalAmount","poCount","createdBy",status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'executed') RETURNING id`,
            [scope.companyId, scope.branchId, runRef, payDate, method, bankAccount ?? null, totalPayment, pos.length, scope.activeAssignmentId]
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

    // Mark each PO as paid via the lifecycle engine (outside the
    // payment_runs transaction so each gets its own audit/event trail).
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
    for (const po of pos) {
      lines.push({ accountCode: apAccount, debit: Number(po.totalAmount), credit: 0, vendorId: po.supplierId });
    }
    for (const [code, amount] of whtCreditByAccount) {
      lines.push({ accountCode: code, debit: 0, credit: amount });
    }
    lines.push({ accountCode: cashAccount, debit: 0, credit: netCashOut });
    const paymentRunJournalResult = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
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
             VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9) RETURNING id`,
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

    let receivedTotal = poTotal;
    const grMovements = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(SUM(quantity * "unitCost"), 0) AS total
       FROM warehouse_movements
       WHERE "companyId" = $1 AND reference = $2 AND type = 'in'`,
      [scope.companyId, `GR-${po.ref}`]
    );
    if (grMovements[0]?.total) receivedTotal = Number(grMovements[0].total);

    const poVariance = Math.abs(poTotal - invAmount);
    const poVariancePct = poTotal > 0 ? (poVariance / poTotal) * 100 : 0;
    const prVariance = Math.abs(prTotal - invAmount);
    const prVariancePct = prTotal > 0 ? (prVariance / prTotal) * 100 : 0;
    const grVariance = Math.abs(receivedTotal - invAmount);
    const grVariancePct = receivedTotal > 0 ? (grVariance / receivedTotal) * 100 : 0;

    const isMatched = poVariancePct <= 5 && prVariancePct <= 5 && grVariancePct <= 5;

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

    // FIN-001: on a successful three-way match, clear the GRNI suspense
    // account into Accounts Payable. The GRN booked DR Inventory(+VAT) /
    // CR GRNI; matching the supplier invoice recognises the payable —
    // DR GRNI / CR AP — for exactly the amount this PO's goods receipts
    // credited to GRNI, so GRNI fully clears. Invoice-vs-receipt deltas
    // inside the 5% tolerance are settled later via credit/debit memos
    // (owner decision, option A). A mismatch posts nothing — the invoice
    // is disputed and GRNI stays open. The entry posts before the status
    // transition so a GL failure leaves the PO un-transitioned.
    if (isMatched) {
      const { financialEngine } = await import("../lib/engines/index.js");
      const [matchGrniCode, matchApCode] = await Promise.all([
        financialEngine.resolveAccountCode(scope.companyId, "purchase_grni", "debit", "2115"),
        financialEngine.resolveAccountCode(scope.companyId, "purchase_vendor_ap", "credit", "2100"),
      ]);
      const [grniRow] = await rawQuery<{ grni: string }>(
        `SELECT COALESCE(SUM(jl.credit), 0) AS grni
           FROM goods_receipts gr
           JOIN journal_lines jl ON jl."journalId" = gr."journalId"
           JOIN chart_of_accounts coa ON coa.id = jl."accountId"
          WHERE gr."poId" = $1 AND gr."companyId" = $2 AND gr."deletedAt" IS NULL
            AND coa.code = $3 AND coa."deletedAt" IS NULL AND jl.credit > 0`,
        [id, scope.companyId, matchGrniCode]
      );
      const grniBalance = roundTo2(Number(grniRow?.grni ?? 0));
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
        });
        markIdempotencyReplay(req, res, matchResult.alreadyExists);
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
    });

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

    const { financialEngine } = await import("../lib/engines/index.js");
    const schedApCode = await financialEngine.resolveAccountCode(scope.companyId, "purchase_vendor_ap", "debit", "2100");
    const schedCashCode = await financialEngine.resolveAccountCode(scope.companyId, "payroll_bank_payout", "credit", "1100");
    const schedResult = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: `SCHED-PAY-${po.ref}`,
      description: `دفعة مجدولة لأمر الشراء ${po.ref} بتاريخ ${paymentDate}`,
      sourceType: "purchase_order_payment",
      sourceId: id,
      sourceKey: `finance:sched_payment:${id}:${paymentDate}`,
      lines: [
        { accountCode: schedApCode, debit: Number(amount), credit: 0, vendorId: po.supplierId as number | undefined },
        { accountCode: schedCashCode, debit: 0, credit: Number(amount), vendorId: po.supplierId as number | undefined },
      ],
    });
    markIdempotencyReplay(req, res, schedResult.alreadyExists);

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
    });

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

