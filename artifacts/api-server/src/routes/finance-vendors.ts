import { Router } from "express";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { emitEvent, createAuditLog } from "../lib/businessHelpers.js";
import { applyTransition } from "../lib/lifecycleEngine.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { pushToDLQ } from "../lib/eventBus.js";
import { logger } from "../lib/logger.js";
import { z } from "zod";
import type { SupplierRow } from "../lib/dbTypes.js";

// Extend SupplierRow with the columns that exist in schema but aren't in
// the early Drizzle definition (rating, status, category etc).
type VendorRow = SupplierRow & {
  status?: string | null;
  rating?: number | string | null;
  totalSpent?: number | string | null;
  onTimeRate?: number | string | null;
};

interface CountRow { count: string | number }
interface VendorStatsRow {
  totalOrders: number | string;
  totalSpent: number | string;
  onTimeOrders: number | string;
  lateOrders: number | string;
}
interface PurchaseOrderJoinedRow {
  id: number;
  ref?: string | null;
  orderDate?: string | null;
  total: number | string;
  status: string;
  vendorName?: string | null;
}
interface VendorPaymentRow {
  id: number;
  vendorId: number;
  amount: number | string;
  paymentDate: string;
  reference?: string | null;
  status?: string | null;
}

// ── Zod schemas ──────────────────────────────────────────────────────────────
const createVendorSchema = z.object({
  name: z.string().min(1, "اسم المورد مطلوب"),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  taxNumber: z.string().optional(),
  address: z.string().optional(),
  paymentTerms: z.string().optional(),
  category: z.string().optional(),
});

const updateVendorSchema = z.object({
  name: z.string().optional(),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  taxNumber: z.string().optional(),
  category: z.string().optional(),
});

const approvalSchema = z.object({
  approved: z.union([z.boolean(), z.literal("returned")]),
  notes: z.string().optional(),
});

export const vendorsRouter = Router();
vendorsRouter.use(authMiddleware);

// RBAC v2: vendors carry sensitive fields (bankAccount, taxNumber).
// finance.vendors field policies will mask them per role; the engine
// applies maskFields() over the response automatically.
vendorsRouter.get("/vendors", authorize({ feature: "finance.vendors", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters, { softDeleteColumn: '"deletedAt"' });
    const rows = await rawQuery<VendorRow>(
      `SELECT * FROM suppliers WHERE ${where} ORDER BY name LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (_e) { logger.error(_e, "vendors list query failed");
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

vendorsRouter.post("/vendors", authorize({ feature: "finance.vendors", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, contactPerson, phone, email, taxNumber, address, paymentTerms, category } = zodParse(createVendorSchema.safeParse(req.body ?? {}));
    const { insertId } = await rawExecute(
      `INSERT INTO suppliers ("companyId", name, "contactPerson", phone, email, "taxNumber", address, "paymentTerms", category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [scope.companyId, name, contactPerson || null, phone || null, email || null, taxNumber || null, address || null, paymentTerms || null, category || null]
    );
    assertInsert(insertId, "suppliers");

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "vendor.created",
      entity: "suppliers",
      entityId: insertId,
      details: JSON.stringify({ name }),
    }).catch((err) => pushToDLQ("event", { action: "vendor.created", entityId: insertId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "create",
      entity: "suppliers",
      entityId: insertId,
      after: { name },
    }).catch((err) => logger.error(err, "[audit] vendor.created:"));

    const [row] = await rawQuery<VendorRow>(`SELECT * FROM suppliers WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    res.status(201).json(row || { id: insertId, name, contactPerson, phone, email, taxNumber, category });
  } catch (err) {
    handleRouteError(err, res, "Create vendor error:");
  }
});

vendorsRouter.patch("/vendors/:id", authorize({ feature: "finance.vendors", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const vendorId = parseId(req.params.id, "id");
    const { name, contactPerson, phone, email, taxNumber, category } = zodParse(updateVendorSchema.safeParse(req.body ?? {}));
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (name) { sets.push(`name = $${idx++}`); params.push(name); }
    if (contactPerson !== undefined) { sets.push(`"contactPerson" = $${idx++}`); params.push(contactPerson); }
    if (phone !== undefined) { sets.push(`phone = $${idx++}`); params.push(phone); }
    if (email !== undefined) { sets.push(`email = $${idx++}`); params.push(email); }
    if (taxNumber !== undefined) { sets.push(`"taxNumber" = $${idx++}`); params.push(taxNumber); }
    if (category !== undefined) { sets.push(`category = $${idx++}`); params.push(category); }
    if (sets.length === 0) {
      throw new ValidationError("لا توجد بيانات للتحديث", {
        field: "body",
        fix: "أرسل حقلاً واحداً على الأقل لتحديثه",
      });
    }
    params.push(vendorId, scope.companyId);
    const [row] = await rawQuery<VendorRow>(
      `UPDATE suppliers SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} AND "deletedAt" IS NULL RETURNING *`,
      params
    );
    if (!row) throw new NotFoundError("المورد غير موجود");

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "vendor.updated",
      entity: "suppliers",
      entityId: vendorId,
      details: JSON.stringify({ fields: Object.keys(req.body || {}) }),
    }).catch((err) => pushToDLQ("event", { action: "vendor.updated", entityId: vendorId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "update",
      entity: "suppliers",
      entityId: vendorId,
      after: { fields: Object.keys(req.body || {}) },
    }).catch((err) => logger.error(err, "[audit] vendor.updated:"));

    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "Update vendor error:");
  }
});

vendorsRouter.delete("/vendors/:id", authorize({ feature: "finance.vendors", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;

    const vendorId = parseId(req.params.id, "id");

    const [existing] = await rawQuery<{ id: number; name: string }>(
      `SELECT id, name FROM suppliers WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
      [vendorId, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المورد غير موجود");

    const [openOrders] = await rawQuery<{ cnt: string | number }>(
      `SELECT COUNT(*) AS cnt FROM purchase_orders WHERE "supplierId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL AND status NOT IN ('cancelled','received','completed')`,
      [vendorId, scope.companyId]
    );
    const [openRequests] = await rawQuery<{ cnt: string | number }>(
      `SELECT COUNT(*) AS cnt FROM purchase_requests WHERE "supplierId" = $1 AND "companyId" = $2 AND status NOT IN ('cancelled','rejected','completed')`,
      [vendorId, scope.companyId]
    );

    const blockers: string[] = [];
    if (Number(openOrders?.cnt ?? 0) > 0) blockers.push(`يوجد ${openOrders.cnt} أمر شراء مفتوح مرتبط بهذا المورد`);
    if (Number(openRequests?.cnt ?? 0) > 0) blockers.push(`يوجد ${openRequests.cnt} طلب شراء مفتوح مرتبط بهذا المورد`);
    if (blockers.length > 0) {
      throw new ConflictError(
        "لا يمكن حذف المورد — يوجد طلبات/أوامر مفتوحة مرتبطة به",
        {
          field: "vendorId",
          fix: "أغلق الطلبات وأوامر الشراء المفتوحة قبل حذف المورد",
          meta: { blockers },
        },
      );
    }

    const [row] = await rawQuery<{ id: number }>(
      `UPDATE suppliers SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [vendorId, scope.companyId]
    );
    if (!row) throw new NotFoundError("المورد غير موجود");

    emitEvent({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "vendor.deleted",
      entity: "suppliers",
      entityId: vendorId,
      details: JSON.stringify({ name: existing.name }),
    }).catch((err) => pushToDLQ("event", { action: "vendor.deleted", entityId: vendorId }, err, scope.companyId));

    createAuditLog({
      companyId: scope.companyId,
      userId: scope.userId,
      action: "delete",
      entity: "suppliers",
      entityId: vendorId,
      after: { name: existing.name, softDelete: true },
    }).catch((err) => logger.error(err, "[audit] vendor.deleted:"));

    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "Delete vendor error:");
  }
});

vendorsRouter.get("/receivables", authorize({ feature: "finance.vendors", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    interface ReceivableRow {
      id: number;
      ref?: string | null;
      total: number | string;
      paidAmount: number | string;
      dueDate?: string | null;
      status: string;
      remainingAmount: number | string;
      clientName?: string | null;
    }
    const rows = await rawQuery<ReceivableRow>(
      `SELECT i.id, i.ref, i.total, i."paidAmount", i."dueDate", i.status,
              (i.total - COALESCE(i."paidAmount", 0)) AS "remainingAmount",
              c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
       WHERE i."companyId" = $1 AND i."deletedAt" IS NULL
         AND i.status IN ('sent','partial','overdue')
       ORDER BY i."dueDate" ASC LIMIT 100`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// Payables view — AP equivalent of /receivables. Umrah ERP doesn't carry
// a dedicated `purchase_invoices` table; the AP narrative for the NUSK
// pipeline lives on `umrah_nusk_invoices` (one row per voucher, with the
// service breakdown already split into ground/electronic/visa/hotel/
// transport buckets). This endpoint surfaces every non-cancelled NUSK
// invoice as an AP entry alongside agent/treasury context so the finance
// module can show what the company owes upstream without a separate
// import step. Gap #1 from docs/umrah-import-gaps-fix-plan.md.
vendorsRouter.get("/payables", authorize({ feature: "finance.vendors", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { agentId: agentFilter, status: statusFilter } = req.query as { agentId?: string; status?: string };
    const params: unknown[] = [scope.companyId];
    let extraWhere = "";
    if (agentFilter && agentFilter.trim()) {
      params.push(Number(agentFilter));
      extraWhere += ` AND ni."agentId" = $${params.length}`;
    }
    if (statusFilter && statusFilter.trim()) {
      params.push(statusFilter.trim());
      extraWhere += ` AND ni."nuskStatus" = $${params.length}`;
    }

    interface PayableRow {
      id: number;
      source: string;
      nuskInvoiceNumber: string;
      issueDate: string | null;
      expiryDate: string | null;
      mutamerCount: number;
      totalAmount: number | string;
      refundAmount: number | string;
      netCost: number | string;
      outstandingAmount: number | string;
      nuskStatus: string;
      agentId: number | null;
      agentName: string | null;
      subAgentId: number | null;
      subAgentName: string | null;
      treasuryId: number | null;
      treasuryCode: string | null;
      treasuryName: string | null;
    }

    const rows = await rawQuery<PayableRow>(
      `SELECT
         ni.id,
         'umrah_nusk' AS source,
         ni."nuskInvoiceNumber",
         ni."issueDate", ni."expiryDate",
         ni."mutamerCount",
         ni."totalAmount", ni."refundAmount", ni."netCost",
         (COALESCE(ni."totalAmount",0) - COALESCE(ni."refundAmount",0)) AS "outstandingAmount",
         ni."nuskStatus",
         ni."agentId",
         a.name AS "agentName",
         ni."subAgentId",
         sa.name AS "subAgentName",
         ni."treasuryId",
         t.code AS "treasuryCode",
         t.name AS "treasuryName"
       FROM umrah_nusk_invoices ni
       LEFT JOIN umrah_agents      a  ON a.id = ni."agentId"    AND a."deletedAt"  IS NULL
       LEFT JOIN umrah_sub_agents  sa ON sa.id = ni."subAgentId" AND sa."deletedAt" IS NULL
       LEFT JOIN chart_of_accounts t  ON t.id = ni."treasuryId"  AND t."deletedAt"  IS NULL
       WHERE ni."companyId" = $1
         AND ni."deletedAt" IS NULL
         AND ni."nuskStatus" != 'cancelled'
         ${extraWhere}
       ORDER BY ni."issueDate" DESC NULLS LAST, ni.id DESC
       LIMIT 200`,
      params
    );

    const summary = rows.reduce(
      (acc, r) => {
        acc.totalAmount += Number(r.totalAmount ?? 0);
        acc.refundAmount += Number(r.refundAmount ?? 0);
        acc.outstandingAmount += Number(r.outstandingAmount ?? 0);
        return acc;
      },
      { totalAmount: 0, refundAmount: 0, outstandingAmount: 0 },
    );

    res.json(maskFields(req, { data: rows, total: rows.length, summary }));
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

vendorsRouter.get("/receivables/:id", authorize({ feature: "finance.vendors", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    interface ReceivableDetailRow extends Record<string, unknown> { clientName?: string | null }
    const [row] = await rawQuery<ReceivableDetailRow>(
      `SELECT i.*, c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId" AND c."deletedAt" IS NULL
       WHERE i.id = $1 AND i."companyId" = $2 AND i."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المستحق غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Receivable detail error:"); }
});

vendorsRouter.get("/payments", authorize({ feature: "finance.vendors", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    interface PaymentRow {
      id: number;
      ref?: string | null;
      description?: string | null;
      createdAt: string;
      amount: number | string;
    }
    const rows = await rawQuery<PaymentRow>(
      `SELECT je.id, je.ref, je.description, je."createdAt",
              COALESCE(SUM(jl.credit), 0) AS amount
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" LIKE '1%'
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
         AND je.status = 'posted'
         AND (je.ref LIKE 'PV%' OR je.ref LIKE 'PAY%')
       GROUP BY je.id, je.ref, je.description, je."createdAt"
       ORDER BY je."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

vendorsRouter.get("/commitments", authorize({ feature: "finance.vendors", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    interface CommitmentRow {
      id: number;
      ref?: string | null;
      totalAmount: number | string;
      amount: number | string;
      status: string;
      createdAt: string;
      dueDate?: string | null;
      supplierName?: string | null;
      vendorName?: string | null;
    }
    const rows = await rawQuery<CommitmentRow>(
      `SELECT po.id, po.ref, po."totalAmount", po."totalAmount" AS amount,
              po.status, po."createdAt", po."expectedDelivery" AS "dueDate",
              s.name AS "supplierName", s.name AS "vendorName"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId" AND s."deletedAt" IS NULL
       WHERE po."companyId" = $1 AND po.status NOT IN ('cancelled','completed','received') AND po."deletedAt" IS NULL
       ORDER BY po."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

vendorsRouter.get("/commitments/:id", authorize({ feature: "finance.vendors", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    interface CommitmentDetailRow extends Record<string, unknown> { supplierName?: string | null }
    const [row] = await rawQuery<CommitmentDetailRow>(
      `SELECT po.*, s.name AS "supplierName"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId" AND s."deletedAt" IS NULL
       WHERE po.id = $1 AND po."companyId" = $2 AND po."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الالتزام غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Commitment detail error:"); }
});

vendorsRouter.get("/financial-requests/:id", authorize({ feature: "finance.vendors", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    interface FinancialRequestRow extends Record<string, unknown> { submittedByName?: string | null }
    const [row] = await rawQuery<FinancialRequestRow>(
      `SELECT wr.*, e.name AS "submittedByName"
       FROM workflow_requests wr
       LEFT JOIN employee_assignments ea ON ea.id = wr."requestedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId" AND e."deletedAt" IS NULL
       WHERE wr.id = $1 AND wr."companyId" = $2 AND wr."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الطلب المالي غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Financial request detail error:"); }
});

vendorsRouter.get("/financial-requests", authorize({ feature: "finance.vendors", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    interface FinancialRequestListRow {
      id: number;
      workflowType?: string | null;
      entityType: string;
      status: string;
      notes?: string | null;
      createdAt: string;
      submittedByName?: string | null;
    }
    const rows = await rawQuery<FinancialRequestListRow>(
      `SELECT wr.id, wr."workflowType", wr."entityType", wr.status, wr.notes, wr."createdAt",
              e.name AS "submittedByName"
       FROM workflow_requests wr
       LEFT JOIN employee_assignments ea ON ea.id = wr."requestedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId" AND e."deletedAt" IS NULL
       WHERE wr."companyId" = $1 AND wr."deletedAt" IS NULL AND wr."entityType" IN ('expense','salary_advance','custody','purchase_order')
       ORDER BY wr."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7.1 — migrated from finance.ts (canonical ownership consolidation)
// ─────────────────────────────────────────────────────────────────────────────

vendorsRouter.get("/vendors/:id", authorize({ feature: "finance.vendors", action: "view" }), async (req, res) => {
  try {
    // as-any-reason: justified-external - Express Request augmentation; scope is injected by authMiddleware but not in Request types here
    const scope = (req as any).scope!;
    const id = parseId(req.params.id, "id");
    if (!id || isNaN(id)) { throw new ValidationError("معرف غير صالح"); return; }
    // NB: the SUM aggregate uses "totalAmount" — the purchase_orders table
    // has no `total` column. This was broken in the original finance.ts
    // handler but was never exercised at runtime; fixed during Phase 7.1
    // migration after a fresh smoke test caught the column-not-found error.
    type VendorDetailRow = VendorRow & {
      totalPurchases: number | string;
      activeOrders: number;
      lastOrderAt?: string | null;
    };
    const [vendor] = await rawQuery<VendorDetailRow>(
      `SELECT s.*,
              COALESCE((SELECT SUM("totalAmount") FROM purchase_orders po WHERE po."supplierId" = s.id AND po."deletedAt" IS NULL), 0)::numeric AS "totalPurchases",
              COALESCE((SELECT COUNT(*) FROM purchase_orders po WHERE po."supplierId" = s.id AND po."deletedAt" IS NULL AND po.status IN ('pending','approved','sent')), 0)::int AS "activeOrders",
              (SELECT MAX(po."createdAt") FROM purchase_orders po WHERE po."supplierId" = s.id AND po."deletedAt" IS NULL) AS "lastOrderAt"
       FROM suppliers s
       WHERE s.id = $1 AND s."companyId" = ANY($2) AND s."deletedAt" IS NULL`,
      [id, scope.allowedCompanies]
    );
    if (!vendor) throw new NotFoundError("المورد غير موجود");
    res.json(maskFields(req, vendor));
  } catch (err) {
    handleRouteError(err, res, "Get vendor error:");
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// APPROVAL ENDPOINTS — commitments, receivables, vouchers, financial-requests, budgets
// ─────────────────────────────────────────────────────────────────────────────

vendorsRouter.patch("/commitments/:id/approve", authorize({ feature: "finance.vendors", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(approvalSchema.safeParse(req.body ?? {}));
    const newStatus = approved === "returned" ? "returned" : approved === true ? "approved" : "rejected";
    if (newStatus === "rejected" && !notes) throw new ValidationError("يجب ذكر سبب الرفض");
    const updated = await applyTransition<Record<string, unknown>>({
      entity: "purchase_orders",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `commitment.${newStatus}`,
      fromStates: ["draft", "pending_approval", "returned"],
      toState: newStatus,
      reason: notes ?? undefined,
      extraWhere: `"deletedAt" IS NULL`,
      onApply: async (_row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('commitment',$1,$2,$3,$4,$5)`,
          [id, newStatus, notes || null, scope.userId, scope.companyId]
        );
      },
    });
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "Commitment approval error:"); }
});

vendorsRouter.patch("/receivables/:id/approve", authorize({ feature: "finance.vendors", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(approvalSchema.safeParse(req.body ?? {}));
    const newStatus = approved === "returned" ? "returned" : approved === true ? "approved" : "rejected";
    if (newStatus === "rejected" && !notes) throw new ValidationError("يجب ذكر سبب الرفض");
    const updated = await applyTransition<Record<string, unknown>>({
      entity: "invoices",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `receivable.${newStatus}`,
      fromStates: ["draft", "pending_approval", "returned"],
      toState: newStatus,
      reason: notes ?? undefined,
      extraWhere: `"deletedAt" IS NULL`,
      onApply: async (_row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('receivable',$1,$2,$3,$4,$5)`,
          [id, newStatus, notes || null, scope.userId, scope.companyId]
        );
      },
    });
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "Receivable approval error:"); }
});

vendorsRouter.patch("/vouchers/:id/approve", authorize({ feature: "finance.vendors", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(approvalSchema.safeParse(req.body ?? {}));
    const newStatus = approved === "returned" ? "returned" : approved === true ? "approved" : "rejected";
    if (newStatus === "rejected" && !notes) throw new ValidationError("يجب ذكر سبب الرفض");
    const updated = await applyTransition<Record<string, unknown>>({
      entity: "journal_entries",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `voucher.${newStatus}`,
      fromStates: ["draft", "pending_approval", "returned"],
      toState: newStatus,
      reason: notes ?? undefined,
      extraWhere: `"deletedAt" IS NULL AND ref LIKE 'VOUCHER%'`,
      onApply: async (_row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('voucher',$1,$2,$3,$4,$5)`,
          [id, newStatus, notes || null, scope.userId, scope.companyId]
        );
      },
    });
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "Voucher approval error:"); }
});

vendorsRouter.patch("/financial-requests/:id/approve", authorize({ feature: "finance.vendors", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(approvalSchema.safeParse(req.body ?? {}));
    const newStatus = approved === "returned" ? "returned" : approved === true ? "approved" : "rejected";
    if (newStatus === "rejected" && !notes) throw new ValidationError("يجب ذكر سبب الرفض");
    const updated = await applyTransition<Record<string, unknown>>({
      entity: "workflow_instances",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `financial_request.${newStatus}`,
      fromStates: ["pending", "draft", "pending_approval", "returned"],
      toState: newStatus,
      reason: notes ?? undefined,
      onApply: async (_row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('financial_request',$1,$2,$3,$4,$5)`,
          [id, newStatus, notes || null, scope.userId, scope.companyId]
        );
      },
    });
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "Financial request approval error:"); }
});

vendorsRouter.patch("/budgets/:id/approve", authorize({ feature: "finance.vendors", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const { approved, notes } = zodParse(approvalSchema.safeParse(req.body ?? {}));
    const newStatus = approved === "returned" ? "returned" : approved === true ? "approved" : "rejected";
    if (newStatus === "rejected" && !notes) throw new ValidationError("يجب ذكر سبب الرفض");
    const updated = await applyTransition<Record<string, unknown>>({
      entity: "budgets",
      id,
      scope: { companyId: scope.companyId, branchId: scope.branchId ?? null, userId: scope.userId },
      action: `budget.${newStatus}`,
      fromStates: ["draft", "pending_approval", "returned"],
      toState: newStatus,
      reason: notes ?? undefined,
      onApply: async (_row, client) => {
        await client.query(
          `INSERT INTO approval_actions ("entityType", "entityId", action, notes, "actionBy", "companyId") VALUES ('budget',$1,$2,$3,$4,$5)`,
          [id, newStatus, notes || null, scope.userId, scope.companyId]
        );
      },
    });
    res.json(updated);
  } catch (err) { handleRouteError(err, res, "Budget approval error:"); }
});

