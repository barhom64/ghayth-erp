import { handleRouteError, validationError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import {
  emitEvent,
  createAuditLog,
  createJournalEntry,
  initiateApprovalChain,
} from "../lib/businessHelpers.js";
import { submitWorkflow } from "../lib/workflowEngine.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

export const purchaseRouter = Router();
purchaseRouter.use(authMiddleware);

const PROCUREMENT_ROLES = ["procurement", "finance_manager", "general_manager", "owner"];
const FINANCE_ROLES = ["finance_manager", "general_manager", "owner"];

function requireRole(scope: any, allowedRoles: string[], res: any): boolean {
  if (!allowedRoles.includes(scope.role)) {
    res.status(403).json({ error: "ليس لديك الصلاحية للقيام بهذا الإجراء", requiredRoles: allowedRoles, yourRole: scope.role });
    return false;
  }
  return true;
}

purchaseRouter.get("/purchase-requests", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'pr."companyId"', branchColumn: 'pr."branchId"', enforceBranchScope: true });
    const { status: filterStatus, page = "1", limit: lim = "20" } = req.query as any;

    let extraWhere = "";
    let paramIdx = nextParamIndex;
    if (filterStatus) { params.push(filterStatus); extraWhere += ` AND pr.status = $${paramIdx++}`; }

    const offset = (Math.max(Number(page), 1) - 1) * Number(lim);
    params.push(Number(lim));
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;

    const rows = await rawQuery<any>(
      `SELECT pr.id, pr.ref, pr.status, pr."totalAmount", pr."createdAt", pr.notes, pr."requestedBy", pr."supplierId",
              s.name AS "supplierName", e.name AS "requestedByName",
              json_agg(pri.*) FILTER (WHERE pri.id IS NOT NULL) AS items
       FROM purchase_requests pr
       LEFT JOIN suppliers s ON s.id = pr."supplierId"
       LEFT JOIN employee_assignments ea ON ea.id = pr."requestedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       LEFT JOIN purchase_request_items pri ON pri."requestId" = pr.id
       WHERE ${where}${extraWhere}
       GROUP BY pr.id, pr.ref, pr.status, pr."totalAmount", pr."createdAt", pr.notes, pr."requestedBy", pr."supplierId", s.name, e.name
       ORDER BY pr."createdAt" DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<any>(`SELECT COUNT(*) AS total FROM purchase_requests pr WHERE ${where}${extraWhere}`, countParams);

    res.json({ data: rows, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) });
  } catch (err) {
    handleRouteError(err, res, "List purchase requests error:");
  }
});

purchaseRouter.post("/purchase-requests", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PROCUREMENT_ROLES, res)) return;
    // The frontend create-form (purchase-orders-create.tsx) sends
    // `expectedDelivery` + items with `productId`, while the API
    // historically accepted `expectedDate` + items with `itemName`.
    // Accept BOTH conventions so the frontend is not silently saving
    // lines named "بند" and losing the delivery date.
    const { items, supplierId, notes } = req.body as any;
    const expectedDate = req.body?.expectedDate ?? req.body?.expectedDelivery ?? null;

    if (!items || !Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "عناصر طلب الشراء مطلوبة" }); return; }

    const totalAmount = items.reduce((sum: number, i: any) => sum + Number(i.quantity ?? 1) * Number(i.unitPrice ?? 0), 0);
    if (totalAmount <= 0) { res.status(400).json({ error: "إجمالي الطلب يجب أن يكون أكبر من صفر" }); return; }

    // Resolve product names in bulk for any items that only sent a
    // productId so purchase_request_items.itemName reflects the actual
    // product the buyer picked instead of the fallback placeholder.
    const productIds = Array.from(
      new Set(
        items
          .map((i: any) => Number(i.productId))
          .filter((id: number) => Number.isFinite(id) && id > 0)
      )
    );
    const productNameById = new Map<number, string>();
    if (productIds.length > 0) {
      const productRows = await rawQuery<{ id: number; name: string }>(
        `SELECT id, name FROM products WHERE id = ANY($1) AND "companyId" = $2`,
        [productIds, scope.companyId]
      ).catch(() => [] as { id: number; name: string }[]);
      for (const p of productRows) productNameById.set(Number(p.id), p.name);
    }

    const [seqRow] = await rawQuery<any>(`SELECT nextval('pr_number_seq') AS seq`).catch(() => [{ seq: Date.now() }]);
    const ref = `PR-${new Date().getFullYear()}-${String(seqRow.seq).padStart(5, "0")}`;

    const { insertId } = await rawExecute(
      `INSERT INTO purchase_requests ("companyId","branchId","requestedBy",ref,status,"totalAmount","supplierId",notes,"expectedDate")
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8)`,
      [scope.companyId, scope.branchId, scope.activeAssignmentId, ref, totalAmount, supplierId ?? null, notes ?? null, expectedDate ?? null]
    );

    if (Array.isArray(items) && items.length > 0) {
      const valuesSql: string[] = [];
      const params: any[] = [];
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
        `INSERT INTO purchase_request_items ("requestId","itemName",quantity,"unitPrice","lineTotal",notes)
         VALUES ${valuesSql.join(",")}`,
        params
      );
    }

    const approvalResult = await initiateApprovalChain({ companyId: scope.companyId, branchId: scope.branchId, chainType: "procurement", refType: "purchase_request", refId: insertId, amount: totalAmount });
    if (approvalResult.requiresApproval) { await rawExecute(`UPDATE purchase_requests SET status = 'pending' WHERE id = $1`, [insertId]); }

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "purchase_request.created", entity: "purchase_requests", entityId: insertId, details: JSON.stringify({ ref, totalAmount, supplierId }) }).catch(console.error);

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
    }).catch(console.error);

    res.status(201).json({ id: insertId, ref, totalAmount, supplierId, notes, expectedDate, items, approval: approvalResult });
  } catch (err) {
    handleRouteError(err, res, "Create purchase request error:");
  }
});

purchaseRouter.patch("/purchase-requests/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;
    const { approved, notes } = req.body as any;

    const [pr] = await rawQuery<any>(`SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2`, [Number(id), scope.companyId]);
    if (!pr) { res.status(404).json({ error: "طلب الشراء غير موجود" }); return; }

    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    if ((newStatus === "rejected" || newStatus === "returned") && !notes) { res.status(400).json({ error: newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع" }); return; }

    await rawExecute(`UPDATE purchase_requests SET status = $1, notes = COALESCE($2, notes) WHERE id = $3`, [newStatus, notes ?? null, Number(id)]);
    try { await rawExecute(`INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('purchase_request',$1,$2,$3,$4,$5)`, [Number(id), newStatus, notes || null, scope.userId, scope.companyId]); } catch (e) { console.error(e); }

    // Bus emission — the dead listeners in eventListeners.ts:193/326
    // (purchase_request.approved / purchase_request.rejected) now fire.
    // Approvals were silent on the bus before this patch.
    if (newStatus === "approved" || newStatus === "rejected") {
      await emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: newStatus === "approved" ? "purchase_request.approved" : "purchase_request.rejected",
        entity: "purchase_request",
        entityId: Number(id),
        before: { status: pr.status },
        after: { status: newStatus, notes: notes ?? null },
      });
    }

    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({ message: labels[newStatus] || newStatus, status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

purchaseRouter.post("/purchase-requests/:id/convert", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PROCUREMENT_ROLES, res)) return;
    const { id } = req.params;

    const [pr] = await rawQuery<any>(`SELECT * FROM purchase_requests WHERE id = $1 AND "companyId" = $2`, [Number(id), scope.companyId]);
    if (!pr) { res.status(404).json({ error: "طلب الشراء غير موجود" }); return; }
    if (pr.status !== "approved") { res.status(400).json({ error: "يمكن تحويل الطلبات المعتمدة فقط" }); return; }

    const items = await rawQuery<any>(`SELECT * FROM purchase_request_items WHERE "requestId" = $1`, [Number(id)]);
    const subtotal = Number(pr.totalAmount);
    const vatRate = Number(pr.vatRate ?? 15);
    const vatAmount = Math.round(subtotal * (vatRate / 100) * 100) / 100;
    const totalAmount = subtotal + vatAmount;

    const [seqRow] = await rawQuery<any>(`SELECT nextval('po_number_seq') AS seq`).catch(() => [{ seq: Date.now() }]);
    const poRef = `PO-${new Date().getFullYear()}-${String(seqRow.seq).padStart(5, "0")}`;

    const { insertId: poId } = await rawExecute(
      `INSERT INTO purchase_orders ("companyId","branchId",ref,status,"totalAmount","vatAmount","supplierId",notes,"requestedBy")
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8)`,
      [scope.companyId, scope.branchId, poRef, totalAmount, vatAmount, pr.supplierId ?? null, pr.notes ?? null, scope.activeAssignmentId]
    );

    if (Array.isArray(items) && items.length > 0) {
      const valuesSql: string[] = [];
      const params: any[] = [];
      for (const item of items) {
        const base = params.length;
        valuesSql.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
        params.push(poId, item.itemName, item.quantity, item.unitPrice, item.lineTotal);
      }
      await rawExecute(
        `INSERT INTO purchase_order_items ("orderId","itemName",quantity,"unitPrice","lineTotal")
         VALUES ${valuesSql.join(",")}`,
        params
      ).catch(() => {});
    }

    await rawExecute(`UPDATE purchase_requests SET status = 'converted' WHERE id = $1`, [Number(id)]);
    res.status(201).json({ message: "تم تحويل طلب الشراء إلى أمر شراء", purchaseOrderId: poId, poRef, totalAmount });
  } catch (err) {
    handleRouteError(err, res, "Convert purchase request error:");
  }
});

purchaseRouter.get("/purchase-orders", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'po."companyId"', branchColumn: 'po."branchId"', enforceBranchScope: true });
    const { status: filterStatus, page = "1", limit: lim = "20" } = req.query as any;

    let extraWhere = "";
    let paramIdx = nextParamIndex;
    if (filterStatus) { params.push(filterStatus); extraWhere += ` AND po.status = $${paramIdx++}`; }

    const offset = (Math.max(Number(page), 1) - 1) * Number(lim);
    params.push(Number(lim));
    const limitIdx = paramIdx++;
    params.push(offset);
    const offsetIdx = paramIdx++;

    const rows = await rawQuery<any>(
      `SELECT po.id, po.ref, po.status, po."totalAmount", po."createdAt",
              po."expectedDelivery", po.notes, s.name AS "supplierName"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId"
       WHERE ${where}${extraWhere}
       ORDER BY po."createdAt" DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const [countRow] = await rawQuery<any>(`SELECT COUNT(*) AS total FROM purchase_orders po WHERE ${where}${extraWhere}`, countParams);
    res.json({ data: rows, total: Number(countRow?.total ?? 0), page: Number(page), pageSize: Number(lim) });
  } catch (err) {
    handleRouteError(err, res, "List purchase orders error:");
  }
});

purchaseRouter.post("/purchase-orders", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PROCUREMENT_ROLES, res)) return;
    const { supplierId, totalAmount, vatAmount, notes, expectedDelivery, items } = req.body as any;

    if (!supplierId) { res.status(400).json({ error: "المورد مطلوب" }); return; }
    if (!totalAmount || Number(totalAmount) <= 0) { res.status(400).json({ error: "المبلغ الإجمالي مطلوب" }); return; }

    const [seqRow] = await rawQuery<any>(`SELECT nextval('po_number_seq') AS seq`).catch(() => [{ seq: Date.now() }]);
    const ref = `PO-${new Date().getFullYear()}-${String(seqRow.seq).padStart(5, "0")}`;

    const { insertId } = await rawExecute(
      `INSERT INTO purchase_orders ("companyId","branchId",ref,status,"totalAmount","vatAmount","supplierId",notes,"expectedDelivery","requestedBy")
       VALUES ($1,$2,$3,'pending',$4,$5,$6,$7,$8,$9)`,
      [scope.companyId, scope.branchId, ref, Number(totalAmount), Number(vatAmount ?? 0), supplierId, notes ?? null, expectedDelivery ?? null, scope.activeAssignmentId]
    );

    if (Array.isArray(items) && items.length > 0) {
      const valuesSql: string[] = [];
      const params: any[] = [];
      for (const item of items) {
        const base = params.length;
        valuesSql.push(`($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5})`);
        params.push(insertId, item.itemName || "بند", Number(item.quantity ?? 1), Number(item.unitPrice ?? 0), Number(item.lineTotal ?? 0));
      }
      await rawExecute(
        `INSERT INTO purchase_order_items ("orderId","itemName",quantity,"unitPrice","lineTotal") VALUES ${valuesSql.join(",")}`,
        params
      ).catch(() => {});
    }

    const approvalResult = await initiateApprovalChain({ companyId: scope.companyId, branchId: scope.branchId, chainType: "procurement", refType: "purchase_order", refId: insertId, amount: Number(totalAmount) });
    if (approvalResult.requiresApproval) { await rawExecute(`UPDATE purchase_orders SET status = 'pending_approval' WHERE id = $1`, [insertId]); }

    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "purchase_order.created", entity: "purchase_orders", entityId: insertId, details: JSON.stringify({ ref, totalAmount, supplierId }) }).catch(console.error);
    res.status(201).json({ id: insertId, ref, totalAmount, vatAmount, supplierId, notes, expectedDelivery, approval: approvalResult });
  } catch (err) {
    handleRouteError(err, res, "Create purchase order error:");
  }
});

purchaseRouter.patch("/purchase-orders/:id/approve", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, FINANCE_ROLES, res)) return;
    const { id } = req.params;
    const { approved, notes } = req.body as any;

    const [po] = await rawQuery<any>(`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`, [Number(id), scope.companyId]);
    if (!po) { res.status(404).json({ error: "أمر الشراء غير موجود" }); return; }

    const newStatus = approved === "returned" ? "returned" : approved ? "approved" : "rejected";
    if ((newStatus === "rejected" || newStatus === "returned") && !notes) { res.status(400).json({ error: newStatus === "rejected" ? "يجب ذكر سبب الرفض" : "يجب ذكر سبب الإرجاع" }); return; }

    await rawExecute(`UPDATE purchase_orders SET status = $1, notes = COALESCE($2, notes) WHERE id = $3`, [newStatus, notes ?? null, Number(id)]);
    try { await rawExecute(`INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('purchase_order',$1,$2,$3,$4,$5)`, [Number(id), newStatus, notes || null, scope.userId, scope.companyId]); } catch (e) { console.error(e); }

    // Emit a lifecycle event so downstream listeners (audit, procurement
    // notification, vendor confirmation workflow) can react. Without this
    // the approval silently mutates status and no one is told.
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: `purchase_order.${newStatus}`,
      entity: "purchase_orders",
      entityId: Number(id),
      before: { status: po.status },
      after: { status: newStatus, notes: notes ?? null },
    }).catch(console.error);

    const labels: Record<string, string> = { approved: "تمت الموافقة", rejected: "تم الرفض", returned: "تم الإرجاع" };
    res.json({ message: labels[newStatus] || newStatus, status: newStatus });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

purchaseRouter.patch("/purchase-orders/:id/receive", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PROCUREMENT_ROLES, res)) return;
    const { id } = req.params;
    const { receivedDate, qualityNotes } = req.body as any;

    const [po] = await rawQuery<any>(`SELECT * FROM purchase_orders WHERE id = $1 AND "companyId" = $2`, [Number(id), scope.companyId]);
    if (!po) { res.status(404).json({ error: "أمر الشراء غير موجود" }); return; }
    if (po.status !== "approved") { res.status(400).json({ error: "يمكن استلام الطلبات المعتمدة فقط" }); return; }

    await rawExecute(`UPDATE purchase_orders SET status = 'received', "receivedAt" = $1, notes = COALESCE($2, notes) WHERE id = $3`, [receivedDate ?? new Date().toISOString(), qualityNotes ?? null, Number(id)]);

    createJournalEntry({ companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.activeAssignmentId, ref: `GRN-${po.ref}`, description: `استلام ${po.ref}`, lines: [{ accountCode: "1600", debit: Number(po.totalAmount) - Number(po.vatAmount ?? 0), credit: 0 }, { accountCode: "1400", debit: Number(po.vatAmount ?? 0), credit: 0 }, { accountCode: "2100", debit: 0, credit: Number(po.totalAmount) }] }).catch(console.error);

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "purchase_order.received",
      entity: "purchase_orders",
      entityId: Number(id),
      before: { status: po.status, receivedAt: po.receivedAt ?? null },
      after: { status: "received", receivedAt: receivedDate ?? new Date().toISOString(), qualityNotes: qualityNotes ?? null },
    }).catch(console.error);

    res.json({ message: "تم تسجيل استلام البضاعة", status: "received" });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

purchaseRouter.get("/vendors", async (req, res) => {
  try {
    const scope = (req as any).scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);
    const rows = await rawQuery<any>(`SELECT * FROM suppliers WHERE ${where} AND "deletedAt" IS NULL ORDER BY name`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

purchaseRouter.post("/vendors", async (req, res) => {
  try {
    const scope = (req as any).scope!;
    const { name, contactPerson, phone, email, taxNumber, address, paymentTerms } = req.body as any;
    if (!name) { res.status(400).json({ error: "اسم المورد مطلوب" }); return; }
    const { insertId } = await rawExecute(`INSERT INTO suppliers ("companyId", name, "contactPerson", phone, email, "taxNumber", address, "paymentTerms") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [scope.companyId, name, contactPerson || null, phone || null, email || null, taxNumber || null, address || null, paymentTerms || null]);
    res.status(201).json({ id: insertId, ...req.body });
  } catch (err) {
    handleRouteError(err, res, "Create vendor error:");
  }
});

purchaseRouter.post("/vendors/create", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, PROCUREMENT_ROLES, res)) return;
    const { name, contactPerson, phone, email, taxNumber, address, paymentTerms } = req.body as any;
    if (!name) { res.status(400).json({ error: "اسم المورد مطلوب" }); return; }
    const { insertId } = await rawExecute(`INSERT INTO suppliers ("companyId", name, "contactPerson", phone, email, "taxNumber", address, "paymentTerms") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [scope.companyId, name, contactPerson || null, phone || null, email || null, taxNumber || null, address || null, paymentTerms || null]);
    emitEvent({ companyId: scope.companyId, userId: scope.userId, action: "vendor.created", entity: "suppliers", entityId: insertId, details: JSON.stringify({ name }) }).catch(console.error);
    res.status(201).json({ id: insertId, name, contactPerson, phone, email, taxNumber });
  } catch (err) {
    handleRouteError(err, res, "Create vendor error:");
  }
});

purchaseRouter.patch("/vendors/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, contactPerson, phone, email, taxNumber, category } = req.body as any;
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (name) { sets.push(`name = $${idx++}`); params.push(name); }
    if (contactPerson !== undefined) { sets.push(`"contactPerson" = $${idx++}`); params.push(contactPerson); }
    if (phone !== undefined) { sets.push(`phone = $${idx++}`); params.push(phone); }
    if (email !== undefined) { sets.push(`email = $${idx++}`); params.push(email); }
    if (taxNumber !== undefined) { sets.push(`"taxNumber" = $${idx++}`); params.push(taxNumber); }
    if (category !== undefined) { sets.push(`category = $${idx++}`); params.push(category); }
    if (sets.length === 0) { res.status(400).json({ error: "لا توجد بيانات للتحديث" }); return; }
    params.push(Number(req.params.id), scope.companyId);
    const [row] = await rawQuery<any>(`UPDATE suppliers SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`, params);
    if (!row) { res.status(404).json({ error: "المورد غير موجود" }); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

purchaseRouter.delete("/vendors/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`UPDATE suppliers SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "المورد غير موجود" }); return; }
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

purchaseRouter.get("/commitments", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT po.id, po.ref, po."totalAmount" AS amount, po.status, po."expectedDelivery" AS "dueDate", po."createdAt", s.name AS "vendorName" FROM purchase_orders po LEFT JOIN suppliers s ON s.id = po."supplierId" WHERE po."companyId" = $1 AND po.status NOT IN ('cancelled','paid','completed') ORDER BY po."expectedDelivery" ASC NULLS LAST`, [scope.companyId]);
    const totalCommitments = rows.reduce((s: number, r: any) => s + Number(r.amount), 0);
    res.json({ data: rows, summary: { totalCommitments, count: rows.length } });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

purchaseRouter.get("/budget", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { companyColumn: 'b."companyId"', branchColumn: 'b."branchId"' });
    const rows = await rawQuery<any>(`SELECT b.*, coa.name AS "accountName" FROM budgets b LEFT JOIN chart_of_accounts coa ON coa.code = b."accountCode" AND coa."companyId" = b."companyId" WHERE ${where} ORDER BY b.period DESC, b."accountCode"`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) {
    handleRouteError(err, res, "List budgets error:");
  }
});

purchaseRouter.post("/budget", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const b = req.body;
    const r = await rawExecute(`INSERT INTO budgets ("companyId","branchId","accountCode",period,amount,used) VALUES ($1,$2,$3,$4,$5,0)`, [scope.companyId, scope.branchId, b.accountCode, b.period, Number(b.amount)]);
    res.status(201).json({ id: r.insertId, ...b, used: 0 });
  } catch (err) {
    handleRouteError(err, res, "Create budget error:");
  }
});

purchaseRouter.patch("/budget/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const id = Number(req.params.id);
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("accountCode", b.accountCode); addField("period", b.period); addField("amount", b.amount);
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE budgets SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
    if (rows.length === 0) { res.status(404).json({ error: "الميزانية غير موجودة" }); return; }
    res.json(rows[0]);
  } catch (err) {
    handleRouteError(err, res, "Update budget error:");
  }
});

purchaseRouter.delete("/budget/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    if (!requireRole(scope, ["general_manager", "owner"], res)) return;
    const rows = await rawQuery<any>(`DELETE FROM budgets WHERE id = $1 AND "companyId" = $2 RETURNING id`, [Number(req.params.id), scope.companyId]);
    if (rows.length === 0) { res.status(404).json({ error: "الميزانية غير موجودة" }); return; }
    res.json({ message: "تم حذف الميزانية" });
  } catch (err) {
    handleRouteError(err, res, "Delete budget error:");
  }
});
