import { Router } from "express";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = Router();
router.use(authMiddleware);

router.get("/products", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM store_products WHERE "companyId"=$1 ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/products", async (req, res) => {
  try {
    const scope = req.scope!;
    const { name, description, sku, price, costPrice, quantity, category, status, imageUrl } = req.body;
    const r = await rawExecute(
      `INSERT INTO store_products (name, description, sku, price, "costPrice", quantity, category, status, "imageUrl", "companyId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [name, description, sku, price || 0, costPrice || 0, quantity || 0, category, status || "active", imageUrl, scope.companyId]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/products/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT * FROM store_products WHERE id=$1 AND "companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "المنتج غير موجود" }); return; }
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/products/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM store_products WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
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
    const [row] = await rawQuery<any>(`SELECT * FROM store_products WHERE id=$1`, [id]);
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/products/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM store_products WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المنتج غير موجود" }); return; }
    await rawExecute(`DELETE FROM store_products WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف المنتج بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/orders", async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery(`SELECT * FROM store_orders WHERE "companyId"=$1 ORDER BY "createdAt" DESC`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/orders", async (req, res) => {
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
    res.status(201).json({ id: orderId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/orders/:id", async (req, res) => {
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
       WHERE o.id=$1 AND o."companyId"=$2`,
      [Number(req.params.id), scope.companyId]
    );
    if (!row) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    const orderItems = await rawQuery<any>(`SELECT oi.*, sp.name AS "productNameFromCatalog" FROM store_order_items oi LEFT JOIN store_products sp ON sp.id = oi."productId" WHERE oi."orderId" = $1 ORDER BY oi.id`, [row.id]);
    let parsedItems: any[] = [];
    try { parsedItems = typeof row.items === 'string' ? JSON.parse(row.items) : (row.items || []); } catch {}
    row.items = orderItems.length > 0 ? orderItems : parsedItems;
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.patch("/orders/:id", async (req, res) => {
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
    res.json(row);
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/orders/:id", async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM store_orders WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الطلب غير موجود" }); return; }
    await rawExecute(`DELETE FROM store_orders WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف الطلب بنجاح" });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/stats", async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [products] = await rawQuery(`SELECT COUNT(*) as count FROM store_products WHERE status='active' AND "companyId"=$1`, [cid]);
    const [orders] = await rawQuery(`SELECT COUNT(*) as count FROM store_orders WHERE "companyId"=$1`, [cid]);
    const [pendingOrders] = await rawQuery(`SELECT COUNT(*) as count FROM store_orders WHERE status='pending' AND "companyId"=$1`, [cid]);
    const [revenue] = await rawQuery(`SELECT COALESCE(SUM("totalAmount"),0) as total FROM store_orders WHERE status='completed' AND "companyId"=$1`, [cid]);
    res.json({
      activeProducts: Number(products.count),
      totalOrders: Number(orders.count),
      pendingOrders: Number(pendingOrders.count),
      totalRevenue: Number(revenue.total),
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
