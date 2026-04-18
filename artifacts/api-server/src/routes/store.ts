import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError } from "../lib/errorHandler.js";
import {
  createJournalEntry,
  getAccountCodeFromMapping,
  emitEvent,
  createAuditLog,
} from "../lib/businessHelpers.js";

const router = Router();
router.use(authMiddleware);

router.get("/products", requirePermission("store:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM store_products WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "List store products"); }
});

router.post("/products", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, description, sku, price, costPrice, quantity, category, status, imageUrl } = req.body;
    const r = await rawExecute(
      `INSERT INTO store_products (name, description, sku, price, "costPrice", quantity, category, status, "imageUrl", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [name, description, sku, price || 0, costPrice || 0, quantity || 0, category, status || "active", imageUrl, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "store_products", entityId: r.insertId, after: { name, sku, price, category, status: status || "active" } }).catch(console.error);
    res.status(201).json({ id: r.insertId });
  } catch (err) { handleRouteError(err, res, "Create store product"); }
});

router.get("/products/:id", requirePermission("store:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM store_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "المنتج غير موجود" }); return; }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get store product"); }
});

router.patch("/products/:id", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM store_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المنتج غير موجود" }); return; }
    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.sku !== undefined) { params.push(b.sku); sets.push(`sku=$${params.length}`); }
    if (b.price !== undefined) { params.push(b.price); sets.push(`price=$${params.length}`); }
    if (b.costPrice !== undefined) { params.push(b.costPrice); sets.push(`"costPrice"=$${params.length}`); }
    if (b.quantity !== undefined) { params.push(b.quantity); sets.push(`quantity=$${params.length}`); }
    if (b.category !== undefined) { params.push(b.category); sets.push(`category=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.imageUrl !== undefined) { params.push(b.imageUrl); sets.push(`"imageUrl"=$${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE store_products SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM store_products WHERE id=$1 AND "deletedAt" IS NULL`, [id]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "store_products", entityId: id, after: b }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update store product"); }
});

router.delete("/products/:id", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT * FROM store_products WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المنتج غير موجود" }); return; }
    await rawExecute(`UPDATE store_products SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "store_products", entityId: id, before: existing }).catch(console.error);
    res.json({ message: "تم حذف المنتج بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete store product"); }
});

router.get("/orders", requirePermission("store:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { productId, status } = req.query as any;
    let where = `o."companyId"=$1 AND o."deletedAt" IS NULL`;
    const params: any[] = [scope.companyId];
    if (productId) {
      params.push(Number(productId));
      where += ` AND o.id IN (SELECT "orderId" FROM store_order_items WHERE "productId"=$${params.length})`;
    }
    if (status) {
      params.push(status);
      where += ` AND o.status=$${params.length}`;
    }
    const rows = await rawQuery(`SELECT o.* FROM store_orders o WHERE ${where} ORDER BY o."createdAt" DESC`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "List store orders"); }
});

router.post("/orders", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { orderNumber, customerName, customerPhone, status, totalAmount, items, notes, branchId } = req.body;
    const r = await rawExecute(
      `INSERT INTO store_orders ("orderNumber", "customerName", "customerPhone", status, "totalAmount", items, notes, "companyId", "branchId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [orderNumber || `ORD-${Date.now()}`, customerName, customerPhone, status || "pending", totalAmount || 0, items ? JSON.stringify(items) : '[]', notes, scope.companyId, branchId || scope.branchId || null]
    );
    const orderId = r.insertId;
    if (Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        const unitPrice = Number(item.unitPrice || item.price || 0);
        const qty = Number(item.quantity || 1);
        await rawExecute(
          `INSERT INTO store_order_items ("orderId","productId","productName",quantity,"unitPrice",total,notes) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [orderId, item.productId || null, item.productName || item.name || null, qty, unitPrice, unitPrice * qty, item.notes || null]
        );
      }
    }
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "store_orders", entityId: orderId, after: { orderNumber: orderNumber || `ORD-${Date.now()}`, customerName, status: status || "pending", totalAmount } }).catch(console.error);
    res.status(201).json({ id: orderId });
  } catch (err) { handleRouteError(err, res, "Create store order"); }
});

router.get("/orders/:id", requirePermission("store:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(
      `SELECT o.*,
              b.name AS "branchName", b."nameEn" AS "branchNameEn", b."logoUrl" AS "branchLogoUrl",
              b.address AS "branchAddress", b.phone AS "branchPhone", b.email AS "branchEmail",
              b.website AS "branchWebsite", b."taxNumber" AS "branchTaxNumber", b."crNumber" AS "branchCrNumber",
              b."footerText" AS "branchFooterText", b.city AS "branchCity"
       FROM store_orders o
       LEFT JOIN branches b ON b.id = o."branchId"
       WHERE o.id=$1 AND o."companyId"=$2 AND o."deletedAt" IS NULL`,
      [Number(req.params.id), scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    const orderItems = await rawQuery<any>(`SELECT oi.*, sp.name AS "productNameFromCatalog" FROM store_order_items oi LEFT JOIN store_products sp ON sp.id = oi."productId" WHERE oi."orderId" = $1 ORDER BY oi.id`, [row.id]);
    let parsedItems: any[] = [];
    try { parsedItems = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []); } catch {}
    row.items = orderItems.length > 0 ? orderItems : parsedItems;
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get store order"); }
});

router.patch("/orders/:id", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM store_orders WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    const b = req.body;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.customerName !== undefined) { params.push(b.customerName); sets.push(`"customerName"=$${params.length}`); }
    if (b.customerPhone !== undefined) { params.push(b.customerPhone); sets.push(`"customerPhone"=$${params.length}`); }
    if (b.totalAmount !== undefined) { params.push(b.totalAmount); sets.push(`"totalAmount"=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }
    if (sets.length === 0) { res.json(existing); return; }
    params.push(id); params.push(scope.companyId);
    await rawExecute(`UPDATE store_orders SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM store_orders WHERE id=$1`, [id]);

    if (b.status === "completed" && existing.status !== "completed") {
      try {
        await postStoreOrderGl(scope, row);
      } catch (glErr) {
        console.error("[store] GL posting failed for order", id, glErr);
      }
    }

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "store_orders", entityId: id, after: b }).catch(console.error);
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update store order"); }
});

router.delete("/orders/:id", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT * FROM store_orders WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    await rawExecute(`UPDATE store_orders SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "store_orders", entityId: id, before: existing }).catch(console.error);
    res.json({ message: "تم حذف الطلب بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete store order"); }
});

router.get("/stats", requirePermission("store:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [products] = await rawQuery(`SELECT COUNT(*) as count FROM store_products WHERE status='active' AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [orders] = await rawQuery(`SELECT COUNT(*) as count FROM store_orders WHERE "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [pendingOrders] = await rawQuery(`SELECT COUNT(*) as count FROM store_orders WHERE status='pending' AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    const [revenue] = await rawQuery(`SELECT COALESCE(SUM("totalAmount"),0) as total FROM store_orders WHERE status='completed' AND "companyId"=$1 AND "deletedAt" IS NULL`, [cid]);
    res.json({
      activeProducts: Number(products.count),
      totalOrders: Number(orders.count),
      pendingOrders: Number(pendingOrders.count),
      totalRevenue: Number(revenue.total),
    });
  } catch (err) { handleRouteError(err, res, "Get store stats"); }
});

async function postStoreOrderGl(scope: any, order: any) {
  const totalAmount = Number(order.totalAmount || 0);
  if (totalAmount <= 0) return;

  const orderItems = await rawQuery<any>(
    `SELECT oi."productId", oi.quantity, oi."unitPrice", sp."costPrice"
     FROM store_order_items oi
     LEFT JOIN store_products sp ON sp.id = oi."productId"
     WHERE oi."orderId" = $1`,
    [order.id]
  );

  const revenueCode = await getAccountCodeFromMapping(scope.companyId, "store_revenue", "credit", "4100");
  const cashCode = await getAccountCodeFromMapping(scope.companyId, "store_cash", "debit", "1100");
  const cogsCode = await getAccountCodeFromMapping(scope.companyId, "store_cogs", "debit", "5100");
  const inventoryCode = await getAccountCodeFromMapping(scope.companyId, "store_inventory", "credit", "1300");

  const lines: any[] = [
    { accountCode: cashCode, debit: totalAmount, credit: 0, description: `مبيعات طلب ${order.orderNumber}` },
    { accountCode: revenueCode, debit: 0, credit: totalAmount, description: `إيراد طلب ${order.orderNumber}` },
  ];

  let totalCogs = 0;
  for (const item of orderItems) {
    const cost = Number(item.costPrice || 0) * Number(item.quantity || 0);
    if (cost > 0) totalCogs += cost;
  }

  if (totalCogs > 0) {
    lines.push(
      { accountCode: cogsCode, debit: totalCogs, credit: 0, description: `تكلفة مبيعات طلب ${order.orderNumber}` },
      { accountCode: inventoryCode, debit: 0, credit: totalCogs, description: `خصم مخزون طلب ${order.orderNumber}` },
    );
  }

  const journalId = await createJournalEntry({
    companyId: scope.companyId,
    branchId: order.branchId || scope.branchId || 0,
    createdBy: scope.userId,
    ref: `STORE-${order.orderNumber}`,
    description: `قيد مبيعات متجر — طلب ${order.orderNumber}`,
    sourceType: "store_order",
    sourceId: order.id,
    lines,
  });

  await rawExecute(
    `UPDATE store_orders SET "journalEntryId"=$1 WHERE id=$2`,
    [journalId, order.id]
  ).catch(() => {});

  emitEvent({
    companyId: scope.companyId,
    branchId: order.branchId || scope.branchId,
    userId: scope.userId,
    action: "store.order.gl_posted",
    entity: "store_orders",
    entityId: order.id,
    details: JSON.stringify({ journalId, totalAmount, totalCogs }),
  }).catch(console.error);
}

export default router;
