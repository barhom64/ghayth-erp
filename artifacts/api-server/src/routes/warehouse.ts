import { handleRouteError } from "../lib/errorHandler.js";
import { Router } from "express";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { requirePermission } from "../middlewares/permissionMiddleware.js";
import { movingAverage } from "../lib/algorithms.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";

const router = Router();
router.use(authMiddleware);

router.get("/products", requirePermission("warehouse:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search, status } = req.query as any;
    const filters = parseScopeFilters(req);
    if (search) { filters.search = String(search); filters.searchColumns = ['p.name', 'p.sku']; }
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'p."companyId"', branchColumn: 'p."branchId"' });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (status) { where += ` AND p.status = $${paramIdx}`; params.push(status); paramIdx++; }
    const rows = await rawQuery<any>(
      `SELECT p.*, c.name AS "categoryName" FROM warehouse_products p LEFT JOIN warehouse_categories c ON c.id=p."categoryId" WHERE ${where} AND p."deletedAt" IS NULL ORDER BY p.name`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Warehouse products error:"); }
});

router.post("/products", requirePermission("warehouse:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const costPrice = Number(b.costPrice) || 0;
    const sellPrice = Number(b.sellPrice) || 0;
    const sellPriceWarning = sellPrice > 0 && sellPrice < costPrice;
    const { insertId } = await rawExecute(
      `INSERT INTO warehouse_products ("companyId",sku,name,description,"categoryId",unit,"minStock","maxStock","currentStock","costPrice","sellPrice",location,"branchId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [scope.companyId, b.sku, b.name, b.description, b.categoryId, b.unit || 'piece', b.minStock || 0, b.maxStock || 99999, b.currentStock || 0, costPrice, sellPrice, b.location, b.branchId || scope.branchId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM warehouse_products WHERE id=$1`, [insertId]);
    res.status(201).json({ ...row, sellPriceWarning: sellPriceWarning ? "سعر البيع أقل من سعر التكلفة" : null });
  } catch (err) { handleRouteError(err, res, "Create product error:"); }
});

router.get("/products/:id", requirePermission("warehouse:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const [row] = await rawQuery<any>(`SELECT p.*, c.name AS "categoryName" FROM warehouse_products p LEFT JOIN warehouse_categories c ON c.id=p."categoryId" WHERE p.id=$1 AND p."companyId"=$2`, [Number(req.params.id), scope.companyId]);
    if (!row) { res.status(404).json({ error: "المنتج غير موجود" }); return; }
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Get product error:"); }
});

router.patch("/products/:id", requirePermission("warehouse:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id, "costPrice", "sellPrice" FROM warehouse_products WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المنتج غير موجود" }); return; }
    const b = req.body;
    const effectiveCost = b.costPrice !== undefined ? Number(b.costPrice) : Number(existing.costPrice);
    const effectiveSell = b.sellPrice !== undefined ? Number(b.sellPrice) : Number(existing.sellPrice);
    const sellPriceWarning = effectiveSell > 0 && effectiveSell < effectiveCost;
    const sets: string[] = [`"updatedAt"=NOW()`];
    const params: any[] = [];
    if (b.name !== undefined) { params.push(b.name); sets.push(`name=$${params.length}`); }
    if (b.sku !== undefined) { params.push(b.sku); sets.push(`sku=$${params.length}`); }
    if (b.description !== undefined) { params.push(b.description); sets.push(`description=$${params.length}`); }
    if (b.categoryId !== undefined) { params.push(b.categoryId); sets.push(`"categoryId"=$${params.length}`); }
    if (b.unit !== undefined) { params.push(b.unit); sets.push(`unit=$${params.length}`); }
    if (b.minStock !== undefined) { params.push(b.minStock); sets.push(`"minStock"=$${params.length}`); }
    if (b.maxStock !== undefined) { params.push(b.maxStock); sets.push(`"maxStock"=$${params.length}`); }
    if (b.costPrice !== undefined) { params.push(b.costPrice); sets.push(`"costPrice"=$${params.length}`); }
    if (b.sellPrice !== undefined) { params.push(b.sellPrice); sets.push(`"sellPrice"=$${params.length}`); }
    if (b.location !== undefined) { params.push(b.location); sets.push(`location=$${params.length}`); }
    if (b.status !== undefined) { params.push(b.status); sets.push(`status=$${params.length}`); }
    params.push(id);
    await rawExecute(`UPDATE warehouse_products SET ${sets.join(",")} WHERE id=$${params.length}`, params);
    const [row] = await rawQuery<any>(`SELECT * FROM warehouse_products WHERE id=$1`, [id]);
    res.json({ ...row, sellPriceWarning: sellPriceWarning ? "سعر البيع أقل من سعر التكلفة" : null });
  } catch (err) { handleRouteError(err, res, "Update product error:"); }
});

router.delete("/products/:id", requirePermission("warehouse:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المنتج غير موجود" }); return; }
    await rawExecute(`UPDATE warehouse_products SET "deletedAt"=NOW(), status='inactive' WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف المنتج بنجاح" });
  } catch (err) { handleRouteError(err, res, "Delete product error:"); }
});

router.get("/movements", requirePermission("warehouse:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { productId } = req.query as any;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'm."companyId"', branchColumn: 'm."branchId"' });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (productId) { where += ` AND m."productId" = $${paramIdx}`; params.push(Number(productId)); paramIdx++; }
    const rows = await rawQuery<any>(
      `SELECT m.*, p.name AS "productName", p.sku FROM warehouse_movements m LEFT JOIN warehouse_products p ON p.id=m."productId" WHERE ${where} ORDER BY m.id DESC`,
      params
    );
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Warehouse movements error:"); }
});

router.post("/movements", requirePermission("warehouse:create"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const b = req.body;

    let unitCost = b.unitCost || 0;
    let insertId = 0;
    let updatedProduct: any = null;

    await withTransaction(async (client) => {
      const prodRes = await client.query(
        `SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 FOR UPDATE`,
        [b.productId, scope.companyId]
      );
      const product = prodRes.rows[0];
      if (!product) throw Object.assign(new Error("المنتج غير موجود"), { status: 404 });

      if (b.type === 'out' || b.type === 'transfer_out') {
        const batchRes = await client.query(
          `SELECT id, quantity, "unitCost", "receivedDate" FROM warehouse_stock_batches WHERE "productId"=$1 AND quantity > 0 ORDER BY "receivedDate" ASC`,
          [b.productId]
        );
        const batches = batchRes.rows;
        let remaining = Number(b.quantity);
        const updates: { id: number; newQty: number }[] = [];
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, Number(batch.quantity));
          remaining -= take;
          updates.push({ id: batch.id, newQty: Math.max(Number(batch.quantity) - take, 0) });
        }
        if (updates.length > 0) {
          // Single UPDATE ... FROM (VALUES ...) instead of one round-trip per batch.
          const valuesSql: string[] = [];
          const params: any[] = [];
          for (const u of updates) {
            const base = params.length;
            valuesSql.push(`($${base + 1}::int, $${base + 2}::numeric)`);
            params.push(u.id, u.newQty);
          }
          await client.query(
            `UPDATE warehouse_stock_batches AS wsb
             SET quantity = v.new_qty
             FROM (VALUES ${valuesSql.join(",")}) AS v(id, new_qty)
             WHERE wsb.id = v.id`,
            params
          );
        }
        unitCost = Number(product.costPrice ?? 0);
      }

      if (b.type === 'in') {
        const batchNum = `BATCH-${Date.now().toString(36).toUpperCase()}`;
        await client.query(
          `INSERT INTO warehouse_stock_batches ("productId","batchNumber",quantity,"unitCost","receivedDate") VALUES ($1,$2,$3,$4,NOW())`,
          [b.productId, batchNum, b.quantity, b.unitCost || 0]
        );
      }

      const sign = (b.type === 'in' || b.type === 'return' || b.type === 'transfer_in') ? 1 : -1;
      const movRes = await client.query(
        `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,notes,"createdBy") VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [scope.companyId, b.productId, b.type, b.quantity, unitCost, b.reference, b.notes, scope.userId]
      );
      insertId = movRes.rows[0]?.id ?? 0;

      const newStock = Number(product.currentStock) + sign * Math.abs(Number(b.quantity));
      await client.query(`UPDATE warehouse_products SET "currentStock" = "currentStock" + $1, "updatedAt" = NOW() WHERE id = $2`, [sign * Math.abs(b.quantity), b.productId]);

      if (b.type === 'in' || b.type === 'return' || b.type === 'transfer_in') {
        const incomingQty = Math.abs(Number(b.quantity));
        const incomingCost = Number(b.unitCost ?? 0);
        const prevStock = Math.max(0, Number(product.currentStock));
        const prevCost = Number(product.costPrice ?? 0);
        const newTotalValue = prevStock * prevCost + incomingQty * incomingCost;
        const newTotalQty = prevStock + incomingQty;
        const newWaCost = newTotalQty > 0 ? Math.round((newTotalValue / newTotalQty) * 10000) / 10000 : incomingCost;
        await client.query(
          `UPDATE warehouse_products SET "costPrice"=$1, "lastWaCost"=$1, "updatedAt"=NOW() WHERE id=$2`,
          [newWaCost, b.productId]
        );
      } else if ((b.type === 'out' || b.type === 'transfer_out') && newStock <= 0) {
        await client.query(
          `UPDATE warehouse_products SET "lastWaCost"="costPrice", "updatedAt"=NOW() WHERE id=$1`,
          [b.productId]
        );
      }

      const updatedProdRes = await client.query(`SELECT * FROM warehouse_products WHERE id=$1`, [b.productId]);
      updatedProduct = updatedProdRes.rows[0] ?? null;
    });

    const [row] = await rawQuery<any>(`SELECT * FROM warehouse_movements WHERE id=$1`, [insertId]);
    if (updatedProduct && Number(updatedProduct.currentStock) <= Number(updatedProduct.minStock)) {
      let autoRequestId: number | null = null;
      try {
        autoRequestId = await triggerMinStockPipeline(scope.companyId, updatedProduct, scope.userId);
      } catch (e) {
        console.error("[MinStock] Pipeline error (non-critical, movement already committed):", e);
      }
      res.status(201).json({ ...row, autoRequestId, lowStockAlert: true });
      return;
    }

    res.status(201).json(row);
  } catch (err: any) {
    if (err.status === 404) { res.status(404).json({ error: err.message }); return; }
    handleRouteError(err, res, "Create movement error:");
  }
});

async function triggerMinStockPipeline(companyId: number, product: any, userId: number): Promise<number | null> {
  const lastOrders = await rawQuery<any>(
    `SELECT pri."unitPrice" AS "unitCost" FROM purchase_request_items pri JOIN purchase_requests pr ON pr.id=pri."requestId" WHERE pri."productId"=$1 AND pr."companyId"=$2 ORDER BY pr."createdAt" DESC LIMIT 3`,
    [product.id, companyId]
  );
  const prices = lastOrders.map((r: any) => Number(r.unitCost)).filter((v: number) => v > 0);
  const estimatedUnitCost = prices.length > 0 ? movingAverage(prices) : Number(product.costPrice) || 0;
  const reorderQty = Math.max(Number(product.maxStock) - Number(product.currentStock), Number(product.minStock) * 2, 1);

  const preferredSupplier = await rawQuery<any>(
    `SELECT s.* FROM suppliers s JOIN purchase_requests pr ON pr."supplierId"=s.id WHERE pr."companyId"=$1 ORDER BY pr."createdAt" DESC LIMIT 1`,
    [companyId]
  );
  const supplierId = preferredSupplier[0]?.id || null;
  const estimatedTotal = reorderQty * estimatedUnitCost;
  const ref = `PR-AUTO-${Date.now().toString(36).toUpperCase()}`;

  const { insertId: prId } = await rawExecute(
    `INSERT INTO purchase_requests ("companyId","supplierId",ref,status,"totalAmount","requestedBy",notes) VALUES ($1,$2,$3,'pending_approval',$4,$5,$6)`,
    [companyId, supplierId, ref, estimatedTotal, userId, `طلب شراء تلقائي - مخزون منخفض: ${product.name}`]
  );
  if (prId) {
    await rawExecute(
      `INSERT INTO purchase_request_items ("requestId","productId",quantity,"unitPrice","totalPrice") VALUES ($1,$2,$3,$4,$5)`,
      [prId, product.id, reorderQty, estimatedUnitCost, estimatedTotal]
    );
  }
  return prId || null;
}

router.post("/transfers", requirePermission("warehouse:create"), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const b = req.body;

    const transferRef = `TRANSFER-${Date.now().toString(36).toUpperCase()}`;
    const fromLocation = b.fromLocation || b.fromWarehouseId ? `مستودع-${b.fromWarehouseId}` : 'المستودع الرئيسي';
    const toLocation = b.toLocation || b.toWarehouseId ? `مستودع-${b.toWarehouseId}` : 'المستودع الفرعي';

    let outId = 0;
    let inId = 0;
    let unitCost = 0;

    await withTransaction(async (client) => {
      const prodRes = await client.query(
        `SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 FOR UPDATE`,
        [b.productId, scope.companyId]
      );
      const product = prodRes.rows[0];
      if (!product) throw Object.assign(new Error("المنتج غير موجود"), { status: 404 });
      if (Number(product.currentStock) < Number(b.quantity)) {
        throw Object.assign(new Error("الكمية المطلوبة تتجاوز المخزون الحالي"), { status: 400 });
      }

      unitCost = Number(product.costPrice) || 0;

      const outRes = await client.query(
        `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,"fromLocation","toLocation",notes,"createdBy")
         VALUES ($1,$2,'transfer_out',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [scope.companyId, b.productId, b.quantity, unitCost, transferRef, fromLocation, toLocation, `تحويل من ${fromLocation} إلى ${toLocation}`, scope.userId]
      );
      outId = outRes.rows[0].id;

      const inRes = await client.query(
        `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,"fromLocation","toLocation",notes,"createdBy")
         VALUES ($1,$2,'transfer_in',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [scope.companyId, b.productId, b.quantity, unitCost, transferRef, fromLocation, toLocation, `استلام تحويل من ${fromLocation} في ${toLocation}`, scope.userId]
      );
      inId = inRes.rows[0].id;
    });

    res.status(201).json({
      transferRef,
      outMovementId: outId,
      inMovementId: inId,
      fromLocation,
      toLocation,
      quantity: b.quantity,
      unitCost,
      totalValue: Number(b.quantity) * unitCost,
      status: 'completed',
    });
  } catch (err: any) {
    if (err.status === 404) { res.status(404).json({ error: err.message }); return; }
    if (err.status === 400) { res.status(400).json({ error: err.message }); return; }
    handleRouteError(err, res, "Transfer error:");
  }
});

router.get("/categories", requirePermission("warehouse:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM warehouse_categories WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY name`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Warehouse categories error:"); }
});

router.post("/categories", requirePermission("warehouse:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { insertId } = await rawExecute(
      `INSERT INTO warehouse_categories ("companyId",name,"parentId") VALUES ($1,$2,$3)`,
      [scope.companyId, req.body.name, req.body.parentId]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM warehouse_categories WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create category error:"); }
});

router.get("/suppliers", requirePermission("warehouse:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<any>(`SELECT * FROM suppliers WHERE "companyId"=$1 AND "deletedAt" IS NULL ORDER BY name`, [scope.companyId]);
    res.json({ data: rows, total: rows.length, page: 1, pageSize: rows.length });
  } catch (err) { handleRouteError(err, res, "Suppliers error:"); }
});

router.post("/suppliers", requirePermission("warehouse:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const { insertId } = await rawExecute(
      `INSERT INTO suppliers ("companyId",name,"contactPerson",phone,email,address,"taxNumber","paymentTerms") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.companyId, b.name, b.contactPerson, b.phone, b.email, b.address, b.taxNumber, b.paymentTerms || 30]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM suppliers WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create supplier error:"); }
});

router.patch("/categories/:id", requirePermission("warehouse:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    if (b.name !== undefined) { params.push(b.name); fields.push(`name = $${params.length}`); }
    if (b.parentId !== undefined) { params.push(b.parentId); fields.push(`"parentId" = $${params.length}`); }
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE warehouse_categories SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
    if (rows.length === 0) { res.status(404).json({ error: "الفئة غير موجودة" }); return; }
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update category error:"); }
});

router.delete("/categories/:id", requirePermission("warehouse:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM warehouse_categories WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "الفئة غير موجودة" }); return; }
    await rawExecute(`UPDATE warehouse_categories SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف الفئة" });
  } catch (err) { handleRouteError(err, res, "Delete category error:"); }
});

router.patch("/suppliers/:id", requirePermission("warehouse:update"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const b = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    const addField = (col: string, val: any) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("name", b.name);
    addField("contactPerson", b.contactPerson);
    addField("phone", b.phone);
    addField("email", b.email);
    addField("address", b.address);
    addField("taxNumber", b.taxNumber);
    addField("paymentTerms", b.paymentTerms);
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<any>(`UPDATE suppliers SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} RETURNING *`, params);
    if (rows.length === 0) { res.status(404).json({ error: "المورد غير موجود" }); return; }
    res.json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Update supplier error:"); }
});

router.delete("/suppliers/:id", requirePermission("warehouse:delete"), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = Number(req.params.id);
    const [existing] = await rawQuery<any>(`SELECT id FROM suppliers WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    if (!existing) { res.status(404).json({ error: "المورد غير موجود" }); return; }
    await rawExecute(`UPDATE suppliers SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    res.json({ message: "تم حذف المورد" });
  } catch (err) { handleRouteError(err, res, "Delete supplier error:"); }
});

router.get("/stats", requirePermission("warehouse:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [products] = await rawQuery<any>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE "currentStock" <= "minStock") as "lowStock" FROM warehouse_products WHERE "companyId"=$1 AND status='active'`, [cid]);
    const [value] = await rawQuery<any>(`SELECT COALESCE(SUM("currentStock" * "costPrice"),0) as "totalValue" FROM warehouse_products WHERE "companyId"=$1 AND status='active'`, [cid]);
    const [movements] = await rawQuery<any>(`SELECT COUNT(*) as "todayMovements" FROM warehouse_movements WHERE "companyId"=$1 AND "createdAt"::date = CURRENT_DATE`, [cid]);
    res.json({ totalProducts: Number(products.total), lowStock: Number(products.lowStock), totalValue: Number(value.totalValue), todayMovements: Number(movements.todayMovements) });
  } catch (err) { handleRouteError(err, res, "Warehouse stats error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY COUNT — جرد المخزن
// ─────────────────────────────────────────────────────────────────────────────

router.get("/inventory-counts", requirePermission("warehouse:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as any;
    const conditions = [`ic."companyId"=$1`];
    const params: any[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`ic.status=$${params.length}`); }
    const rows = await rawQuery<any>(
      `SELECT ic.*, e.name AS "conductedByName"
       FROM inventory_counts ic
       LEFT JOIN employees e ON e.id=ic."conductedBy"
       WHERE ${conditions.join(" AND ")}
       ORDER BY ic."countDate" DESC`,
      params
    );
    res.json({ data: rows, total: rows.length });
  } catch (err) { handleRouteError(err, res, "Inventory counts error:"); }
});

router.post("/inventory-counts", requirePermission("warehouse:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = req.body;
    const { insertId } = await rawExecute(
      `INSERT INTO inventory_counts ("companyId","countDate","conductedBy",status,notes,"warehouseLocation")
       VALUES ($1,$2,$3,'draft',$4,$5)`,
      [scope.companyId,
       b.countDate || new Date().toISOString().split('T')[0],
       scope.employeeId || null,
       b.notes || null, b.warehouseLocation || null]
    );
    const [row] = await rawQuery<any>(`SELECT * FROM inventory_counts WHERE id=$1`, [insertId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create count error:"); }
});

router.get("/inventory-counts/:id/items", requirePermission("warehouse:read"), async (req, res) => {
  try {
    const scope = req.scope!;
    const countId = Number(req.params.id);
    const items = await rawQuery<any>(
      `SELECT ici.*, wp.name AS "productName", wp.sku, wp."currentStock" AS "systemStock"
       FROM inventory_count_items ici
       JOIN warehouse_products wp ON wp.id=ici."productId"
       WHERE ici."countId"=$1 AND wp."companyId"=$2
       ORDER BY wp.name`,
      [countId, scope.companyId]
    );

    // Attach batch/lot details for each product to support lot-level counting
    for (const item of items) {
      const batches = await rawQuery<any>(
        `SELECT id, "batchNumber", quantity, "unitCost", "receivedDate"
         FROM warehouse_stock_batches
         WHERE "productId"=$1 AND quantity > 0
         ORDER BY "receivedDate" ASC`,
        [item.productId]
      );
      item.batches = batches;
    }

    res.json({ data: items, total: items.length });
  } catch (err) { handleRouteError(err, res, "Count items error:"); }
});

router.post("/inventory-counts/:id/items", requirePermission("warehouse:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const countId = Number(req.params.id);
    const b = req.body;
    // Ensure count exists and is in draft
    const [count] = await rawQuery<any>(`SELECT * FROM inventory_counts WHERE id=$1 AND "companyId"=$2`, [countId, scope.companyId]);
    if (!count) { res.status(404).json({ error: "الجرد غير موجود" }); return; }
    if (count.status === 'approved') { res.status(400).json({ error: "لا يمكن تعديل جرد معتمد" }); return; }

    const [product] = await rawQuery<any>(
      `SELECT id, "currentStock" FROM warehouse_products WHERE id=$1 AND "companyId"=$2`,
      [b.productId, scope.companyId]
    );
    if (!product) { res.status(404).json({ error: "المنتج غير موجود" }); return; }

    const physicalCount = Number(b.physicalCount || 0);
    const systemStock = Number(product.currentStock || 0);
    const variance = physicalCount - systemStock;

    // Upsert count item
    const [existing] = await rawQuery<any>(
      `SELECT id FROM inventory_count_items WHERE "countId"=$1 AND "productId"=$2`,
      [countId, b.productId]
    );
    if (existing) {
      await rawExecute(
        `UPDATE inventory_count_items SET "physicalCount"=$1, variance=$2, notes=$3 WHERE id=$4`,
        [physicalCount, variance, b.notes || null, existing.id]
      );
    } else {
      await rawExecute(
        `INSERT INTO inventory_count_items ("countId","productId","systemStock","physicalCount",variance,notes)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [countId, b.productId, systemStock, physicalCount, variance, b.notes || null]
      );
    }
    res.json({ productId: b.productId, systemStock, physicalCount, variance });
  } catch (err) { handleRouteError(err, res, "Count item error:"); }
});

router.post("/inventory-counts/:id/approve", requirePermission("warehouse:create"), async (req, res) => {
  try {
    const scope = req.scope!;
    const countId = Number(req.params.id);
    const [count] = await rawQuery<any>(
      `SELECT * FROM inventory_counts WHERE id=$1 AND "companyId"=$2 AND status='draft'`,
      [countId, scope.companyId]
    );
    if (!count) { res.status(404).json({ error: "الجرد غير موجود أو تمت معالجته" }); return; }

    const items = await rawQuery<any>(
      `SELECT ici.*, wp."currentStock" FROM inventory_count_items ici JOIN warehouse_products wp ON wp.id=ici."productId" WHERE ici."countId"=$1`,
      [countId]
    );

    // Apply adjustments for items with variance
    for (const item of items) {
      const variance = Number(item.variance);
      if (variance !== 0) {
        const movType = variance > 0 ? 'in' : 'out';
        const qty = Math.abs(variance);
        await rawExecute(
          `UPDATE warehouse_products SET "currentStock"="currentStock"+$1, "updatedAt"=NOW() WHERE id=$2`,
          [variance, item.productId]
        );
        await rawExecute(
          `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,notes,"createdBy")
           VALUES ($1,$2,$3,$4,0,'INV-COUNT-' || $5,$6,$7)`,
          [scope.companyId, item.productId, movType, qty, countId,
           variance > 0 ? `فائض جرد — ${qty} وحدة` : `عجز جرد — ${qty} وحدة`,
           scope.userId]
        );
      }
    }

    await rawExecute(
      `UPDATE inventory_counts SET status='approved', "approvedAt"=NOW(), "approvedBy"=$1 WHERE id=$2`,
      [scope.employeeId || null, countId]
    );

    res.json({ message: "تم اعتماد الجرد وتحديث المخزون", itemsAdjusted: items.filter((i: any) => Number(i.variance) !== 0).length });
  } catch (err) { handleRouteError(err, res, "Approve count error:"); }
});

export default router;
