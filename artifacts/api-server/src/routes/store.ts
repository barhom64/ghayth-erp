import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { handleRouteError, ValidationError, NotFoundError, ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import {
  emitEvent,
  createAuditLog,
} from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";

const VALID_ORDER_TRANSITIONS: Record<string, string[]> = {
  pending: ["processing", "cancelled"],
  processing: ["completed", "cancelled"],
  completed: [],
  cancelled: ["pending"],
};

const createStoreProductSchema = z.object({
  name: z.string().min(1, "اسم المنتج مطلوب"),
  description: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  price: z.coerce.number().min(0, "السعر يجب أن يكون 0 أو أكثر").optional().default(0),
  costPrice: z.coerce.number().min(0, "سعر التكلفة يجب أن يكون 0 أو أكثر").optional().default(0),
  quantity: z.coerce.number().int().min(0).optional().default(0),
  category: z.string().optional().nullable(),
  status: z.enum(["active", "inactive", "draft"]).optional().default("active"),
  imageUrl: z.string().url("رابط الصورة غير صالح").optional().nullable(),
});

const createStoreOrderSchema = z.object({
  orderNumber: z.string().optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  status: z.enum(["pending", "processing", "completed", "cancelled"]).optional().default("pending"),
  totalAmount: z.coerce.number().min(0, "المبلغ الإجمالي يجب أن يكون 0 أو أكثر").optional().default(0),
  items: z.array(z.object({
    productId: z.coerce.number().optional().nullable(),
    productName: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    quantity: z.coerce.number().min(1).optional().default(1),
    unitPrice: z.coerce.number().min(0).optional(),
    price: z.coerce.number().min(0).optional(),
    notes: z.string().optional().nullable(),
  })).optional().default([]),
  notes: z.string().optional().nullable(),
  branchId: z.coerce.number().optional().nullable(),
});

const updateStoreProductSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  sku: z.string().optional().nullable(),
  price: z.coerce.number().optional(),
  costPrice: z.coerce.number().optional(),
  quantity: z.coerce.number().int().optional(),
  category: z.string().optional().nullable(),
  status: z.enum(["active", "inactive", "draft"]).optional(),
  imageUrl: z.string().optional().nullable(),
});

const updateStoreOrderSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "cancelled"]).optional(),
  customerName: z.string().optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  totalAmount: z.coerce.number().optional(),
  notes: z.string().optional().nullable(),
});

const router = Router();

router.get("/products", requirePermission("store:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { page = "1", limit: lim = "50" } = req.query as any;
    const offset = (Math.max(Number(page), 1) - 1) * Number(lim);

    const [countRow] = await rawQuery<any>(
      `SELECT COUNT(*) AS total FROM store_products WHERE "companyId"=$1 AND "deletedAt" IS NULL`,
      [scope.companyId]
    );
    const rows = await rawQuery(
      `SELECT * FROM store_products WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT $2 OFFSET $3`,
      [scope.companyId, Number(lim), offset]
    );
    res.json({ data: rows, total: Number(countRow.total), page: Number(page), pageSize: Number(lim) });
  } catch (err) { handleRouteError(err, res, "List store products"); }
});

router.post("/products", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, description, sku, price, costPrice, quantity, category, status, imageUrl } = zodParse(createStoreProductSchema.safeParse(req.body));
    const r = await rawExecute(
      `INSERT INTO store_products (name, description, sku, price, "costPrice", quantity, category, status, "imageUrl", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [name, description, sku, price || 0, costPrice || 0, quantity || 0, category, status || "active", imageUrl, scope.companyId]
    );
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "store_products", entityId: r.insertId, after: { name, sku, price, category, status: status || "active" } }).catch((e) => logger.error(e, "store background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "store.product.created", entity: "store_products", entityId: r.insertId, details: JSON.stringify({ name, sku }) }).catch((e) => logger.error(e, "store background task failed"));
    res.status(201).json({ id: r.insertId });
  } catch (err) { handleRouteError(err, res, "Create store product"); }
});

router.get("/products/:id", requirePermission("store:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(`SELECT sp.*,
      COALESCE((SELECT SUM(soi.quantity) FROM store_order_items soi
        JOIN store_orders so ON so.id = soi."orderId"
        WHERE soi."productId" = sp.id AND so.status IN ('pending','processing')), 0) AS "reservedQuantity"
      FROM store_products sp WHERE sp.id=$1 AND sp."companyId"=$2 AND sp."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("المنتج غير موجود");
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get store product"); }
});

router.patch("/products/:id", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT id FROM store_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("المنتج غير موجود");
    const b = zodParse(updateStoreProductSchema.safeParse(req.body)) as any;
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
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "store_products", entityId: id, after: b }).catch((e) => logger.error(e, "store background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "store.product.updated", entity: "store_products", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "store background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update store product"); }
});

router.delete("/products/:id", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT * FROM store_products WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("المنتج غير موجود");
    await rawExecute(`UPDATE store_products SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "store_products", entityId: id, before: existing }).catch((e) => logger.error(e, "store background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "store.product.deleted", entity: "store_products", entityId: id, details: JSON.stringify({ name: existing.name }) }).catch((e) => logger.error(e, "store background task failed"));
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
    const rows = await rawQuery(`SELECT o.* FROM store_orders o WHERE ${where} ORDER BY o."createdAt" DESC LIMIT 500`, params);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "List store orders"); }
});

router.post("/orders", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { orderNumber, customerName, customerPhone, status, totalAmount, items, notes, branchId } = zodParse(createStoreOrderSchema.safeParse(req.body));
    const r = await rawExecute(
      `INSERT INTO store_orders ("orderNumber", "customerName", "customerPhone", status, "totalAmount", items, notes, "companyId", "branchId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [orderNumber || `ORD-${Date.now()}`, customerName, customerPhone, status, totalAmount, items ? JSON.stringify(items) : '[]', notes, scope.companyId, branchId || scope.branchId || null]
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
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "create", entity: "store_orders", entityId: orderId, after: { orderNumber: orderNumber || `ORD-${Date.now()}`, customerName, status: status || "pending", totalAmount } }).catch((e) => logger.error(e, "store background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "store.order.created", entity: "store_orders", entityId: orderId, details: JSON.stringify({ customerName, totalAmount }) }).catch((e) => logger.error(e, "store background task failed"));
    res.status(201).json({ id: orderId });
  } catch (err) { handleRouteError(err, res, "Create store order"); }
});

router.get("/orders/:id", requirePermission("store:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<any>(
      `SELECT o.*,
              b.name AS "branchName", b."nameEn" AS "branchNameEn", b."logoUrl" AS "branchLogoUrl",
              b.address AS "branchAddress", b.phone AS "branchPhone", b.email AS "branchEmail",
              b.website AS "branchWebsite", b."taxNumber" AS "branchTaxNumber", b."crNumber" AS "branchCrNumber",
              b."footerText" AS "branchFooterText", b.city AS "branchCity"
       FROM store_orders o
       LEFT JOIN branches b ON b.id = o."branchId"
       WHERE o.id=$1 AND o."companyId"=$2 AND o."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الطلب غير موجود");
    const orderItems = await rawQuery<any>(`SELECT oi.*, sp.name AS "productNameFromCatalog" FROM store_order_items oi LEFT JOIN store_products sp ON sp.id = oi."productId" WHERE oi."orderId" = $1 ORDER BY oi.id LIMIT 500`, [row.id]);
    let parsedItems: any[] = [];
    try { parsedItems = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []); } catch {}
    row.items = orderItems.length > 0 ? orderItems : parsedItems;
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get store order"); }
});

router.patch("/orders/:id", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(updateStoreOrderSchema.safeParse(req.body)) as any;
    const sets: string[] = [];
    const params: any[] = [];
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    if (b.customerName !== undefined) { params.push(b.customerName); sets.push(`"customerName"=$${params.length}`); }
    if (b.customerPhone !== undefined) { params.push(b.customerPhone); sets.push(`"customerPhone"=$${params.length}`); }
    if (b.totalAmount !== undefined) { params.push(b.totalAmount); sets.push(`"totalAmount"=$${params.length}`); }
    if (b.notes !== undefined) { params.push(b.notes); sets.push(`notes=$${params.length}`); }

    const row = await withTransaction(async (client) => {
      const lockRes = await client.query(
        `SELECT * FROM store_orders WHERE id=$1 AND "companyId"=$2 FOR UPDATE`,
        [id, scope.companyId]
      );
      const existing = lockRes.rows[0];
      if (!existing) throw new NotFoundError("الطلب غير موجود");
      if (b.status && b.status !== existing.status) {
        const allowed = VALID_ORDER_TRANSITIONS[existing.status];
        if (allowed && !allowed.includes(b.status)) {
          throw new ConflictError(`لا يمكن نقل الطلب من "${existing.status}" إلى "${b.status}"`);
        }
      }
      if (sets.length === 0) return existing;

      params.push(id); params.push(scope.companyId);
      await client.query(
        `UPDATE store_orders SET ${sets.join(",")} WHERE id=$${params.length - 1} AND "companyId"=$${params.length}`,
        params
      );
      const updatedRes = await client.query(`SELECT * FROM store_orders WHERE id=$1`, [id]);
      return { updated: updatedRes.rows[0], previousStatus: existing.status };
    });

    if (b.status === "completed" && row.previousStatus !== "completed") {
      try {
        await postStoreOrderGl(scope, row.updated);
      } catch (glErr) {
        logger.error(glErr, "[store] GL posting failed for order");
      }
    }

    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "update", entity: "store_orders", entityId: id, after: b }).catch((e) => logger.error(e, "store background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "store.order.updated", entity: "store_orders", entityId: id, details: JSON.stringify(b) }).catch((e) => logger.error(e, "store background task failed"));
    res.json(row.updated ?? row);
  } catch (err) { handleRouteError(err, res, "Update store order"); }
});

router.delete("/orders/:id", requirePermission("store:write"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<any>(`SELECT * FROM store_orders WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("الطلب غير موجود");
    await rawExecute(`UPDATE store_orders SET "deletedAt" = NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    createAuditLog({ companyId: scope.companyId, userId: scope.userId, action: "delete", entity: "store_orders", entityId: id, before: existing }).catch((e) => logger.error(e, "store background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "store.order.deleted", entity: "store_orders", entityId: id, details: JSON.stringify({ orderNumber: existing.orderNumber }) }).catch((e) => logger.error(e, "store background task failed"));
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

  let totalCogs = 0;
  for (const item of orderItems) {
    const cost = Number(item.costPrice || 0) * Number(item.quantity || 0);
    if (cost > 0) totalCogs += cost;
  }

  let result: any;
  try {
    const { storeEngine } = await import("../lib/engines/index.js");
    result = await storeEngine.postOrderGL(
      { companyId: scope.companyId, branchId: order.branchId || scope.branchId || 0, createdBy: scope.userId },
      { id: order.id, subtotal: totalAmount, vatAmount: 0, total: totalAmount, cogsAmount: totalCogs }
    );
  } catch (e) {
    logger.error(e, "Store order GL failed");
  }

  if (result) {
    await rawExecute(
      `UPDATE store_orders SET "journalEntryId"=$1 WHERE id=$2 AND "companyId"=$3`,
      [result.journalId, order.id, scope.companyId]
    ).catch((e) => logger.error(e, "store background task failed"));
  }

  emitEvent({
    companyId: scope.companyId,
    branchId: order.branchId || scope.branchId,
    userId: scope.userId,
    action: "store.order.gl_posted",
    entity: "store_orders",
    entityId: order.id,
    details: JSON.stringify({ journalId: result?.journalId, totalAmount, totalCogs }),
  }).catch((e) => logger.error(e, "store background task failed"));
}

export default router;
