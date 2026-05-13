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
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { logger } from "../lib/logger.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  emitEvent,
  createAuditLog,
  initiateApprovalChain,
  updateBudgetUsed,
  checkFinancialPeriodOpen,
  computeVat,
  roundTo2,
  currentYear,
  generateRef,
  todayISO,
  toDateISO,
} from "../lib/businessHelpers.js";
import { submitWorkflow } from "../lib/workflowEngine.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { registerObligation } from "../lib/obligationsEngine.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { z } from "zod";

export const purchaseRouter = Router();
purchaseRouter.use(authMiddleware);

const createPurchaseRequestSchema = z.object({
  items: z.array(z.object({
    description: z.string().optional(),
    quantity: z.coerce.number().optional(),
    unitPrice: z.coerce.number().optional(),
    accountCode: z.string().optional(),
    productId: z.coerce.number().optional(),
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
    const { status: filterStatus, page = "1", limit: lim = "20" } = req.query as any;
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

    const [seqRow] = await rawQuery<{ seq: string | number }>(`SELECT nextval('pr_number_seq') AS seq`).catch((e) => { logger.error(e, "finance purchase query failed"); return [{ seq: Math.floor(Math.random() * 900000 + 100000) }]; });
    const ref = generateRef("PR", seqRow.seq, 5);

    if (supplierId) {
      const [sup] = await rawQuery<{ id: number }>(`SELECT id FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`, [supplierId, scope.companyId]);
      if (!sup) throw new ValidationError("المورد غير موجود", { field: "supplierId", fix: "اختر مورداً من قائمة الموردين." });
    }

    const { insertId } = await rawExecute(
      `INSERT INTO purchase_requests ("companyId","branchId","requestedBy",ref,status,"totalAmount","supplierId",notes,"expectedDelivery","costCenter")
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9)`,
      [scope.companyId, scope.branchId, scope.activeAssignmentId, ref, totalAmount, supplierId ?? null, notes ?? null, expectedDate ?? null, costCenter ?? null]
    );

    if (Array.isArray(items) && items.length > 0) {
      const valuesSql: string[] = [];
      const params: unknown[] = [];
      for (const item of items) {
        const base = params.length;
        valuesSql.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6})`);
        const resolvedName =
          item.itemName ||
          item.description ||
          (item.productId ? productNameById.get(Number(item.productId)) : undefined) ||
          "بند";
        params.push(
          insertId,
          resolvedName,
          Number(item.quantity ?? 1),
          Number(item.unitPrice ?? 0),
          Number(item.quantity ?? 1) * Number(item.unitPrice ?? 0),
          item.notes ?? null
        );
      }
      await rawExecute(
        `INSERT INTO purchase_request_items ("requestId",name,quantity,"unitPrice","totalPrice",notes)
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

purchaseRouter.patch("/purchase-requests/:id/approve", authorize({ feature: "finance.purchase", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const id = parseId(req.params.id, "id");
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

    const [seqRow] = await rawQuery<{ seq: string | number }>(`SELECT nextval('po_number_seq') AS seq`).catch((e) => { logger.error(e, "finance purchase query failed"); return [{ seq: Math.floor(Math.random() * 900000 + 100000) }]; });
    const poRef = generateRef("PO", seqRow.seq, 5);

    let poId!: number;
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
          const valuesSql: string[] = [];
          const params: unknown[] = [];
          for (const item of items) {
            const base = params.length;
            valuesSql.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
            params.push(poId, item.name, item.quantity, item.unitPrice, item.totalPrice);
          }
          await client.query(
            `INSERT INTO purchase_order_items ("orderId","itemName",quantity,"unitPrice","lineTotal")
             VALUES ${valuesSql.join(",")}`,
            params
          );
        }
      },
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
    const { status: filterStatus, page = "1", limit: lim = "20" } = req.query as any;
    const safeLim = Math.min(Number(lim) || 50, 500);

    let extraWhere = "";
    let paramIdx = nextParamIndex;
    if (filterStatus) { params.push(filterStatus); extraWhere += ` AND po.status = $${paramIdx++}`; }
    const { productId } = req.query as any;
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


    const { supplierId, totalAmount, vatAmount, notes, expectedDelivery, branchId, companyId: bodyCompanyId, items } = zodParse(createPurchaseOrderSchema.safeParse(req.body)) as any;

    if (!totalAmount || Number(totalAmount) <= 0) { throw new ValidationError("المبلغ الإجمالي مطلوب"); return; }
    const effectiveCompanyId = bodyCompanyId && scope.allowedCompanies?.includes(Number(bodyCompanyId)) ? Number(bodyCompanyId) : scope.companyId;
    const effectiveBranchId = branchId ?? scope.branchId;

    if (supplierId) {
      const [sup] = await rawQuery<{ id: number }>(`SELECT id FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL LIMIT 1`, [supplierId, effectiveCompanyId]);
      if (!sup) throw new ValidationError("المورد غير موجود", { field: "supplierId", fix: "اختر مورداً من قائمة الموردين." });
    }

    const [seqRow] = await rawQuery<{ seq: string | number }>(`SELECT nextval('po_number_seq') AS seq`).catch((e) => { logger.error(e, "finance purchase query failed"); return [{ seq: Math.floor(Math.random() * 900000 + 100000) }]; });
    const ref = generateRef("PO", seqRow.seq, 5);

    const { insertId } = await rawExecute(
      `INSERT INTO purchase_orders ("companyId","branchId",ref,status,"totalAmount","supplierId",notes,"expectedDelivery","createdBy")
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8)`,
      [effectiveCompanyId, effectiveBranchId, ref, Number(totalAmount), supplierId, notes ?? null, expectedDelivery ?? null, scope.userId]
    );

    if (Array.isArray(items) && items.length > 0) {
      const valuesSql: string[] = [];
      const params: unknown[] = [];
      for (const item of items) {
        const base = params.length;
        valuesSql.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
        params.push(insertId, item.itemName || "بند", Number(item.quantity ?? 1), Number(item.unitPrice ?? 0), Number(item.lineTotal ?? 0));
      }
      await rawExecute(
        `INSERT INTO purchase_order_items ("orderId","itemName",quantity,"unitPrice","lineTotal") VALUES ${valuesSql.join(",")}`,
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
              COALESCE("invoicedQty",0) AS "invoicedQty"
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

    // Create GRN header + lines + update PO items atomically
    const [grnSeq] = await rawQuery<Record<string, unknown>>(
      `SELECT COALESCE(MAX(id),0)+1 AS seq FROM goods_receipts WHERE "companyId" = $1`,
      [scope.companyId]
    );
    const grnRef = generateRef("GRN", (grnSeq?.seq as string | number | undefined) ?? Date.now(), 5);

    const grnId = await withTransaction(async (client) => {
      const grnRes = await client.query(
        `INSERT INTO goods_receipts ("companyId","branchId","poId",ref,"receivedAt","receivedBy",notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [scope.companyId, scope.branchId, id, grnRef, receiptDate, scope.activeAssignmentId, qualityNotes ?? null]
      );
      const newGrnId = grnRes.rows[0].id;

      for (const l of inputLines) {
        const item = poItemMap.get(l.poItemId)!;
        const lineTotal = roundTo2(l.receivedQty * Number(item.unitPrice));
        await client.query(
          `INSERT INTO goods_receipt_items ("grnId","poItemId","itemName","receivedQty","unitPrice","lineTotal",notes)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [newGrnId, l.poItemId, item.itemName, l.receivedQty, Number(item.unitPrice), lineTotal, l.notes ?? null]
        );
        await client.query(
          `UPDATE purchase_order_items SET "receivedQty" = COALESCE("receivedQty",0) + $1 WHERE id = $2`,
          [l.receivedQty, l.poItemId]
        );
      }

      return newGrnId;
    });

    // Post GRN journal: DR inventory (ex-VAT) + DR VAT receivable, CR GRNI
    const { financialEngine } = await import("../lib/engines/index.js");
    const [invAccount, vatAccount, grniAccount] = await Promise.all([
      financialEngine.resolveAccountCode(scope.companyId, "inventory_receipt", "debit", "1250"),
      financialEngine.resolveAccountCode(scope.companyId, "purchase_grn_vat", "debit", "1180"),
      financialEngine.resolveAccountCode(scope.companyId, "purchase_grni", "credit", "2115"),
    ]);

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
        { accountCode: invAccount, debit: subtotal, credit: 0, vendorId: po.supplierId as number | undefined },
        ...(vatAmount > 0 ? [{ accountCode: vatAccount, debit: vatAmount, credit: 0, vendorId: po.supplierId as number | undefined }] : []),
        { accountCode: grniAccount, debit: 0, credit: grnTotal, vendorId: po.supplierId as number | undefined },
      ],
      guardTable: "goods_receipts",
      guardId: grnId,
    });
    journalId = grnJournalResult.journalId;
    if (journalId) {
      await rawExecute(`UPDATE goods_receipts SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`, [journalId, grnId, scope.companyId]);
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

    // Consume budget on receipt so reports reflect committed spend. We
    // consume against the inventory account that was just debited so the
    // budgeted line matches the GL line.
    if (subtotal > 0) {
      updateBudgetUsed({
        companyId: scope.companyId,
        accountCode: invAccount,
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

    const { cutoffDate, supplierId } = req.query as any;
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


    const { poIds, paymentDate, method = "bank_transfer", reference, bankAccount } = zodParse(executePaymentRunSchema.safeParse(req.body)) as any;
    const payDate = paymentDate || todayISO();
    const periodCheck = await checkFinancialPeriodOpen(scope.companyId, payDate);
    if (!periodCheck.open) {
      throw new ConflictError(`لا يمكن تنفيذ دفعات في فترة مُقفلة: ${periodCheck.periodName ?? ""}`);
    }

    const poIdNums = poIds.map((x: any) => Number(x)).filter((n: number) => !Number.isNaN(n));
    const pos = await rawQuery<Record<string, unknown>>(
      `SELECT id, ref, "totalAmount", "supplierId", "branchId", status
         FROM purchase_orders
        WHERE id = ANY($1) AND "companyId" = $2 AND "deletedAt" IS NULL`,
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

    // Persist a payment_runs header row (create table if missing)
    let runId: number | null = null;
    const runRef = reference || `PR-${Date.now()}`;
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
    // debit per PO so per-vendor subledger still reconciles.
    let journalId: number | null = null;
    const lines: any[] = [];
    for (const po of pos) {
      lines.push({ accountCode: apAccount, debit: Number(po.totalAmount), credit: 0, vendorId: po.supplierId });
    }
    lines.push({ accountCode: cashAccount, debit: 0, credit: totalPayment });
    const paymentRunJournalResult = await financialEngine.postJournalEntry({
      companyId: scope.companyId,
      branchId: scope.branchId,
      createdBy: scope.activeAssignmentId,
      ref: runRef,
      description: `دفعة مجمّعة ${runRef}: ${pos.length} أمر شراء بإجمالي ${totalPayment}`,
      sourceType: "payment_run",
      sourceId: runId ?? 0,
      sourceKey: `finance:payment_run:${runId}`,
      lines,
      guardTable: "payment_runs",
      guardId: runId ?? 0,
    });
    journalId = paymentRunJournalResult.journalId;
    if (journalId && runId) {
      await rawExecute(`UPDATE payment_runs SET "journalId" = $1 WHERE id = $2 AND "companyId" = $3`, [journalId, runId, scope.companyId]);
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

    // Auto-generate PO ref using DB sequence (race-safe)
    const [poSeqRow] = await rawQuery<Record<string, unknown>>(`SELECT nextval('po_number_seq') AS seq`);
    const poRef = generateRef("PO", Number(poSeqRow.seq));

    let poId!: number;
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
    await financialEngine.postJournalEntry({
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

