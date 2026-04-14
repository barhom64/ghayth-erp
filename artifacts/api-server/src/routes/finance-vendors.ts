import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { handleRouteError } from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { emitEvent } from "../lib/businessHelpers.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { pushToDLQ } from "../lib/eventBus.js";
import { assertRole } from "../lib/roleGuards.js";

export const vendorsRouter = Router();
vendorsRouter.use(authMiddleware);

const PROCUREMENT_ROLES = ["procurement", "finance", "director", "owner"];

vendorsRouter.get("/vendors", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params } = buildScopedWhere(scope, filters);
    const rows = await rawQuery<any>(
      `SELECT * FROM suppliers WHERE ${where} AND "deletedAt" IS NULL ORDER BY name`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (_e) {
    res.json({ data: [], total: 0, page: 1, pageSize: 0 });
  }
});

vendorsRouter.post("/vendors", async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, contactPerson, phone, email, taxNumber, address, paymentTerms } = req.body as any;
    if (!name) {
      res.status(400).json({ error: "اسم المورد مطلوب" });
      return;
    }
    const { insertId } = await rawExecute(
      `INSERT INTO suppliers ("companyId", name, "contactPerson", phone, email, "taxNumber", address, "paymentTerms")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.companyId, name, contactPerson || null, phone || null, email || null, taxNumber || null, address || null, paymentTerms || null]
    );
    res.status(201).json({ id: insertId, ...req.body });
  } catch (err) {
    handleRouteError(err, res, "Create vendor error:");
  }
});

vendorsRouter.post("/vendors/create", async (req, res) => {
  try {
    const scope = req.scope!;
    assertRole(scope, PROCUREMENT_ROLES);
    const { name, contactPerson, phone, email, taxNumber, address, paymentTerms } = req.body as any;

    if (!name) {
      res.status(400).json({ error: "اسم المورد مطلوب" });
      return;
    }

    const { insertId } = await rawExecute(
      `INSERT INTO suppliers ("companyId", name, "contactPerson", phone, email, "taxNumber", address, "paymentTerms")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.companyId, name, contactPerson || null, phone || null, email || null, taxNumber || null, address || null, paymentTerms || null]
    );

    emitEvent({
      companyId: scope.companyId, userId: scope.userId,
      action: "vendor.created", entity: "suppliers", entityId: insertId,
      details: JSON.stringify({ name }),
    }).catch((err) => pushToDLQ("event", { action: "vendor.created", entityId: insertId }, err, scope.companyId));

    res.status(201).json({ id: insertId, name, contactPerson, phone, email, taxNumber });
  } catch (err) {
    handleRouteError(err, res, "Create vendor error:");
  }
});

vendorsRouter.patch("/vendors/:id", async (req, res) => {
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
    const [row] = await rawQuery<any>(
      `UPDATE suppliers SET ${sets.join(", ")} WHERE id = $${idx++} AND "companyId" = $${idx} RETURNING *`,
      params
    );
    if (!row) { res.status(404).json({ error: "المورد غير موجود" }); return; }
    res.json(row);
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

vendorsRouter.delete("/vendors/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const vendorId = Number(req.params.id);

    const [existing] = await rawQuery<any>(
      `SELECT id FROM suppliers WHERE id = $1 AND "companyId" = $2`,
      [vendorId, scope.companyId]
    );
    if (!existing) { res.status(404).json({ error: "المورد غير موجود" }); return; }

    const [openOrders] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM purchase_orders WHERE "supplierId" = $1 AND "companyId" = $2 AND status NOT IN ('cancelled','received','closed')`,
      [vendorId, scope.companyId]
    );
    const [openRequests] = await rawQuery<any>(
      `SELECT COUNT(*) AS cnt FROM purchase_requests WHERE "supplierId" = $1 AND "companyId" = $2 AND status NOT IN ('cancelled','rejected','completed')`,
      [vendorId, scope.companyId]
    );

    const blockers: string[] = [];
    if (Number(openOrders?.cnt ?? 0) > 0) blockers.push(`يوجد ${openOrders.cnt} أمر شراء مفتوح مرتبط بهذا المورد`);
    if (Number(openRequests?.cnt ?? 0) > 0) blockers.push(`يوجد ${openRequests.cnt} طلب شراء مفتوح مرتبط بهذا المورد`);
    if (blockers.length > 0) {
      res.status(422).json({ error: "لا يمكن حذف المورد — يوجد طلبات/أوامر مفتوحة مرتبطة به", blockers });
      return;
    }

    const [row] = await rawQuery<any>(
      `UPDATE suppliers SET "deletedAt" = NOW() WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL RETURNING id`,
      [vendorId, scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "المورد غير موجود" }); return; }
    res.json({ success: true });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

vendorsRouter.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const filters = parseScopeFilters(req);
    const { where, params, nextParamIndex } = buildScopedWhere(scope, filters);
    const monthStart = new Date().toISOString().slice(0, 7) + "-01";
    params.push(monthStart);

    const [stats] = await rawQuery<any>(
      `SELECT
         COALESCE(SUM("paidAmount"), 0) AS "totalRevenue",
         COALESCE(SUM(total - "paidAmount") FILTER (WHERE status IN ('sent','partial')), 0) AS "pendingAmount",
         COALESCE(SUM(total - "paidAmount") FILTER (WHERE status = 'overdue'), 0) AS "overdueAmount",
         COALESCE(SUM("paidAmount") FILTER (WHERE DATE("createdAt") >= $${nextParamIndex}), 0) AS "paidThisMonth"
       FROM invoices
       WHERE ${where} AND "deletedAt" IS NULL`,
      params
    );

    res.json({
      totalRevenue: Number(stats?.totalRevenue ?? 0),
      pendingAmount: Number(stats?.pendingAmount ?? 0),
      overdueAmount: Number(stats?.overdueAmount ?? 0),
      paidThisMonth: Number(stats?.paidThisMonth ?? 0),
    });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

vendorsRouter.get("/receivables", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT i.id, i.ref, i.total, i."paidAmount", i."dueDate", i.status,
              c.name AS "clientName"
       FROM invoices i
       LEFT JOIN clients c ON c.id = i."clientId"
       WHERE i."companyId" = $1 AND i."deletedAt" IS NULL
         AND i.status IN ('sent','partial','overdue')
       ORDER BY i."dueDate" ASC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

vendorsRouter.get("/payments", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT je.id, je.ref, je.description, je."createdAt",
              COALESCE(SUM(jl.credit), 0) AS amount
       FROM journal_entries je
       JOIN journal_lines jl ON jl."journalId" = je.id AND jl."accountCode" LIKE '1%'
       WHERE je."companyId" = $1 AND je."deletedAt" IS NULL
         AND (je.ref LIKE 'PV%' OR je.ref LIKE 'PAY%')
       GROUP BY je.id, je.ref, je.description, je."createdAt"
       ORDER BY je."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

vendorsRouter.get("/commitments", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT po.id, po.ref, po."totalAmount", po.status, po."createdAt",
              s.name AS "supplierName"
       FROM purchase_orders po
       LEFT JOIN suppliers s ON s.id = po."supplierId"
       WHERE po."companyId" = $1 AND po.status NOT IN ('cancelled','closed','received')
       ORDER BY po."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});

vendorsRouter.get("/financial-requests", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(
      `SELECT wr.id, wr."requestType", wr.title, wr.status, wr."createdAt",
              e.name AS "submittedByName"
       FROM workflow_requests wr
       LEFT JOIN employee_assignments ea ON ea.id = wr."submittedBy"
       LEFT JOIN employees e ON e.id = ea."employeeId"
       WHERE wr."companyId" = $1 AND wr."requestType" IN ('expense','salary_advance','custody','purchase_order')
       ORDER BY wr."createdAt" DESC LIMIT 100`,
      [scope.companyId]
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    handleRouteError(err, res, "خطأ غير متوقع");
  }
});
