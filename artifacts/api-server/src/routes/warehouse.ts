import {
  handleRouteError,
  NotFoundError,
  ValidationError,
  ConflictError,
  IntegrationError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { movingAverage } from "../lib/algorithms.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import {
  checkFinancialPeriodOpen,
  createAuditLog,
  emitEvent,
  todayISO,
  toDateISO,
  roundTo2,
  roundTo4,
  generateTimeRef,
} from "../lib/businessHelpers.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// WAREHOUSE STATE MACHINES — Phase C.8 Warehouse audit
// ─────────────────────────────────────────────────────────────────────────────
const MOVEMENT_TYPES = ["in", "out", "return", "transfer_in", "transfer_out", "adjustment"] as const;

const createProductSchema = z.object({
  name: z.string().min(1, "اسم المنتج مطلوب"),
  sku: z.string().min(1, "رمز المنتج (SKU) مطلوب"),
  costPrice: z.coerce.number().min(0, "سعر التكلفة غير صالح").optional(),
  sellPrice: z.coerce.number().min(0, "سعر البيع غير صالح").optional(),
  description: z.string().optional().nullable(),
  categoryId: z.coerce.number().optional().nullable(),
  unit: z.string().optional(),
  minStock: z.coerce.number().optional(),
  maxStock: z.coerce.number().optional(),
  currentStock: z.coerce.number().optional(),
  location: z.string().optional().nullable(),
  branchId: z.coerce.number().optional().nullable(),
});

const patchProductSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  categoryId: z.coerce.number().optional().nullable(),
  unit: z.string().optional(),
  minStock: z.coerce.number().optional(),
  maxStock: z.coerce.number().optional(),
  costPrice: z.coerce.number().min(0, "سعر التكلفة غير صالح").optional(),
  sellPrice: z.coerce.number().min(0, "سعر البيع غير صالح").optional(),
  location: z.string().optional().nullable(),
  status: z.string().optional(),
});

const createTransferSchema = z.object({
  productId: z.coerce.number({ required_error: "المنتج مطلوب" }).int().positive(),
  quantity: z.coerce.number({ required_error: "الكمية مطلوبة" }).positive("الكمية يجب أن تكون أكبر من صفر"),
  fromLocation: z.string().optional().nullable(),
  toLocation: z.string().optional().nullable(),
  fromWarehouseId: z.coerce.number().optional().nullable(),
  toWarehouseId: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const createCategorySchema = z.object({
  name: z.string().min(1, "اسم الفئة مطلوب"),
  parentId: z.coerce.number().optional().nullable(),
});

const patchCategorySchema = z.object({
  name: z.string().min(1).optional(),
  parentId: z.coerce.number().optional().nullable(),
});

const createSupplierSchema = z.object({
  name: z.string().min(1, "اسم المورد مطلوب"),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  taxNumber: z.string().optional().nullable(),
  paymentTerms: z.coerce.number().optional(),
});

const patchSupplierSchema = z.object({
  name: z.string().min(1).optional(),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  taxNumber: z.string().optional().nullable(),
  paymentTerms: z.coerce.number().optional(),
});

const createInventoryCountSchema = z.object({
  countDate: z.string().optional(),
  notes: z.string().optional().nullable(),
  warehouseLocation: z.string().optional().nullable(),
});

const createCountItemSchema = z.object({
  productId: z.coerce.number({ required_error: "المنتج مطلوب" }).int().positive(),
  physicalCount: z.coerce.number().optional(),
  notes: z.string().optional().nullable(),
});

const createMovementSchema = z.object({
  productId: z.coerce.number({ required_error: "المنتج مطلوب", invalid_type_error: "معرف المنتج يجب أن يكون رقماً" }).int().positive("معرف المنتج يجب أن يكون رقماً موجباً"),
  type: z.enum(MOVEMENT_TYPES, { errorMap: () => ({ message: `نوع الحركة غير صالح — اختر من: ${MOVEMENT_TYPES.join(", ")}` }) }),
  quantity: z.coerce.number({ required_error: "الكمية مطلوبة", invalid_type_error: "الكمية يجب أن تكون رقماً" }).positive("الكمية يجب أن تكون أكبر من صفر"),
  unitCost: z.coerce.number().min(0, "تكلفة الوحدة يجب أن تكون 0 أو أكثر").optional().nullable(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const PRODUCT_STATUSES = ["active", "inactive", "discontinued"] as const;
const PRODUCT_TRANSITIONS: Record<string, readonly string[]> = {
  active:       ["inactive", "discontinued"],
  inactive:     ["active", "discontinued"],
  discontinued: [],
};
const COUNT_TRANSITIONS: Record<string, readonly string[]> = {
  draft:       ["in_progress", "approved", "cancelled"],
  in_progress: ["approved", "cancelled"],
  approved:    [],
  cancelled:   [],
};

// ─────────────────────────────────────────────────────────────────────────────
// Weighted-average cost maintenance helper.
// The canonical weighted-average cost for a product is stored on
// warehouse_products.costPrice (and mirrored in lastWaCost). There is no
// separate avgCost column. See `POST /movements` for the in-route logic that
// already maintains this; this helper exists so callers outside the movement
// route (e.g. inventory-count approval, transfers-in from other modules) can
// keep the weighted-average in sync without duplicating math.
// ─────────────────────────────────────────────────────────────────────────────
async function updateWeightedAverageCost(
  productId: number,
  companyId: number,
  qty: number,
  unitCost: number,
  direction: "in" | "out"
): Promise<void> {
  try {
    const [product] = await rawQuery<Record<string, unknown>>(
      `SELECT "currentStock", "costPrice" FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [productId, companyId]
    );
    if (!product) return;
    const prevQty = Math.max(0, Number(product.currentStock ?? 0));
    const prevCost = Number(product.costPrice ?? 0);
    const movQty = Math.abs(Number(qty));
    const movCost = Number(unitCost ?? 0);
    if (direction === "in") {
      const newTotalValue = prevQty * prevCost + movQty * movCost;
      const newTotalQty = prevQty + movQty;
      const newWa =
        newTotalQty > 0
          ? roundTo4(newTotalValue / newTotalQty)
          : movCost;
      await rawExecute(
        `UPDATE warehouse_products SET "costPrice"=$1, "lastWaCost"=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
        [newWa, productId, companyId]
      );
    } else {
      await rawExecute(
        `UPDATE warehouse_products SET "lastWaCost"="costPrice", "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [productId, companyId]
      );
    }
  } catch (err) {
    logger.warn(
      `[warehouse] updateWeightedAverageCost failed for product ${productId}: ${err}`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GL posting helper for stock movements. Fire-and-forget from the caller:
// the underlying stock movement MUST NOT be rolled back if GL posting fails
// (matches the pattern used in hr/fleet/properties modules). Respects
// financial period close — if the period is closed the GL posting is
// skipped and a warning is appended to the movement's notes column.
// ─────────────────────────────────────────────────────────────────────────────
type InventoryGlTrigger =
  | "receipt"
  | "issue"
  | "transfer"
  | "variance_in"
  | "variance_out";

async function postInventoryMovementGl(params: {
  companyId: number;
  branchId: number;
  createdBy: number;
  movementId: number;
  productId: number;
  productName?: string;
  trigger: InventoryGlTrigger;
  quantity: number;
  unitCost: number;
  reference?: string | null;
  date?: string;
}): Promise<number | null> {
  try {
    const totalValue =
      roundTo2(Math.abs(params.quantity) * Math.abs(params.unitCost));
    // Transfers are internal — no GL impact.
    if (params.trigger === "transfer") return null;
    if (totalValue <= 0) {
      // Nothing to post (e.g. receipt with zero cost)
      return null;
    }

    const today = (params.date ?? todayISO())
      .toString()
      .slice(0, 10);
    const period = await checkFinancialPeriodOpen(params.companyId, today);
    if (!period.open) {
      try {
        await rawExecute(
          `UPDATE warehouse_movements
             SET notes = COALESCE(notes,'') || $1
           WHERE id = $2`,
          [
            ` [GL skipped: الفترة المالية "${period.periodName ?? ""}" مغلقة]`,
            params.movementId,
          ]
        );
      } catch (noteErr) {
        logger.warn(
          `[warehouse-gl] failed to append closed-period note: ${noteErr}`
        );
      }
      return null;
    }

    const ref =
      params.reference && params.reference.length > 0
        ? `${params.reference}-JE-${params.movementId}`
        : `INV-MV-${params.movementId}`;

    const trigger = params.trigger as "receipt" | "issue" | "variance_in" | "variance_out";
    const { warehouseEngine } = await import("../lib/engines/index.js");
    const glResult = await warehouseEngine.postMovementGL(
      { companyId: params.companyId, branchId: params.branchId, createdBy: params.createdBy },
      { id: params.movementId, trigger, totalValue, productName: params.productName, ref }
    );
    return glResult.journalId;
  } catch (glErr) {
    logger.error(glErr, `[warehouse-gl] journal entry failed for movement ${params.movementId}:`);
    return null;
  }
}

router.get("/products", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { search, status, page = "1", limit: lim = "50" } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Number(lim) || 50, 500);
    const offset = (pageNum - 1) * perPage;
    const filters = parseScopeFilters(req);
    if (search) { filters.search = String(search); filters.searchColumns = ['p.name', 'p.sku']; }
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'p."companyId"', branchColumn: 'p."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (status) { where += ` AND p.status = $${paramIdx}`; params.push(status); paramIdx++; }

    const countParams = [...params];
    const [countRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) AS total FROM warehouse_products p WHERE ${where} AND p."deletedAt" IS NULL`,
      countParams
    );

    params.push(perPage);
    const limitParam = paramIdx++;
    params.push(offset);
    const offsetParam = paramIdx++;

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.*, c.name AS "categoryName" FROM warehouse_products p LEFT JOIN warehouse_categories c ON c.id=p."categoryId" AND c."deletedAt" IS NULL WHERE ${where} AND p."deletedAt" IS NULL ORDER BY p.name LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );
    res.json(maskFields(req, { data: rows, total: Number(countRow.total), page: pageNum, pageSize: perPage }));
  } catch (err) { handleRouteError(err, res, "Warehouse products error:"); }
});

router.post("/products", authorize({ feature: "warehouse.inventory", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createProductSchema.safeParse(req.body));

    const costPrice = Number(b.costPrice) || 0;
    const sellPrice = Number(b.sellPrice) || 0;
    // Duplicate SKU check
    const [dup] = await rawQuery<Record<string, unknown>>(
      `SELECT id FROM warehouse_products WHERE sku=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.sku, scope.companyId]
    );
    if (dup) {
      throw new ConflictError(
        "رمز المنتج (SKU) مستخدم مسبقاً",
        { field: "sku", fix: "اختر رمزاً فريداً لهذا المنتج" }
      );
    }
    // FK check for categoryId
    if (b.categoryId) {
      const [cat] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM warehouse_categories WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.categoryId, scope.companyId]
      );
      if (!cat) {
        throw new ValidationError("الفئة غير موجودة", { field: "categoryId", fix: "اختر فئة مسجلة" });
      }
    }

    const sellPriceWarning = sellPrice > 0 && sellPrice < costPrice;
    const { insertId } = await rawExecute(
      `INSERT INTO warehouse_products ("companyId",sku,name,description,"categoryId",unit,"minStock","maxStock","currentStock","costPrice","sellPrice",location,"branchId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [scope.companyId, b.sku.trim(), b.name.trim(), b.description, b.categoryId || null, b.unit || 'piece', b.minStock || 0, b.maxStock || 99999, b.currentStock || 0, costPrice, sellPrice, b.location, b.branchId || scope.branchId]
    );
    assertInsert(insertId, "warehouse_products");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);

    createAuditLog({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "create",
      entity: "warehouse_products",
      entityId: insertId,
      after: { sku: b.sku, name: b.name, categoryId: b.categoryId, costPrice, sellPrice },
    }).catch((e) => logger.error(e, "warehouse background task failed"));

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "warehouse.product.created",
      entity: "warehouse_products",
      entityId: insertId,
      details: `منتج جديد: ${b.name} (${b.sku})`,
    }).catch((e) => logger.error(e, "warehouse background task failed"));

    res.status(201).json({ ...row, sellPriceWarning: sellPriceWarning ? "سعر البيع أقل من سعر التكلفة" : null });
  } catch (err) { handleRouteError(err, res, "Create product error:"); }
});

// RBAC v2: warehouse.inventory view with branch-scope check.
router.get("/products/:id", authorize({ feature: "warehouse.inventory", action: "view", resource: { table: "warehouse_products", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT p.*, c.name AS "categoryName" FROM warehouse_products p LEFT JOIN warehouse_categories c ON c.id=p."categoryId" AND c."deletedAt" IS NULL WHERE p.id=$1 AND p."companyId"=$2 AND p."deletedAt" IS NULL`, [id, scope.companyId]);
    if (!row) throw new NotFoundError("المنتج غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Get product error:"); }
});

router.patch("/products/:id", authorize({ feature: "warehouse.inventory", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المنتج غير موجود");
    const b = zodParse(patchProductSchema.safeParse(req.body));

    const statusChanging = b.status !== undefined && b.status !== existing.status;

    // Validate status value (applyTransition validates the transition itself)
    // as-any-reason: justified-pragmatic - widening Zod-parsed b.status for readonly tuple .includes() whose generic narrows to the literal union
    if (statusChanging && !PRODUCT_STATUSES.includes(b.status as any)) {
      throw new ValidationError(
        `حالة منتج غير صالحة: ${b.status}`,
        { field: "status", fix: `اختر من: ${PRODUCT_STATUSES.join(", ")}` }
      );
    }
    // Duplicate SKU on rename
    if (b.sku && b.sku !== existing.sku) {
      const [dup] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM warehouse_products WHERE sku=$1 AND "companyId"=$2 AND "deletedAt" IS NULL AND id<>$3`,
        [b.sku, scope.companyId, id]
      );
      if (dup) {
        throw new ConflictError(
          "رمز المنتج (SKU) مستخدم مسبقاً",
          { field: "sku", fix: "اختر رمزاً مختلفاً" }
        );
      }
    }
    const effectiveCost = b.costPrice !== undefined ? Number(b.costPrice) : Number(existing.costPrice);
    const effectiveSell = b.sellPrice !== undefined ? Number(b.sellPrice) : Number(existing.sellPrice);
    const sellPriceWarning = effectiveSell > 0 && effectiveSell < effectiveCost;

    // Build the set of changed non-status fields
    const nonStatusTracked = ["name","sku","description","categoryId","unit","minStock","maxStock","costPrice","sellPrice","location"] as const;
    const colMap: Record<string, string> = {
      name: "name", sku: "sku", description: "description", categoryId: '"categoryId"',
      unit: "unit", minStock: '"minStock"', maxStock: '"maxStock"',
      costPrice: '"costPrice"', sellPrice: '"sellPrice"', location: "location",
    };
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const extraSets: Record<string, string | number | boolean | null> = {};
    for (const f of nonStatusTracked) {
      if (b[f] === undefined) continue;
      if (b[f] === existing[f]) continue;
      before[f] = existing[f];
      after[f] = b[f];
      extraSets[f] = b[f];
    }
    if (statusChanging) {
      before.status = existing.status;
      after.status = b.status;
    }

    if (Object.keys(after).length === 0) {
      res.json(maskFields(req, { ...existing, sellPriceWarning: sellPriceWarning ? "سعر البيع أقل من سعر التكلفة" : null }));
      return;
    }

    let row: any;

    if (statusChanging) {
      // Use lifecycle engine for status transitions — it validates the
      // transition against PRODUCT_TRANSITIONS, sets the status atomically,
      // and writes audit_log + event_log in a single transaction.
      const actionName = b.status === "inactive"
        ? "warehouse.product.deactivated"
        : b.status === "discontinued"
          ? "warehouse.product.discontinued"
          : "warehouse.product.reactivated";
      const fromStates = Object.entries(PRODUCT_TRANSITIONS)
        .filter(([, targets]) => (targets as readonly string[]).includes(b.status!))
        .map(([src]) => src);

      row = await applyTransition({
        entity: "warehouse_products",
        id,
        scope,
        action: actionName,
        fromStates,
        toState: b.status!,
        setExtras: Object.keys(extraSets).length > 0 ? extraSets : undefined,
        extraWhere: `"deletedAt" IS NULL`,
        after,
      });
    } else {
      // No status change — plain field update with manual audit/event.
      const sets: string[] = [`"updatedAt"=NOW()`];
      const params: unknown[] = [];
      for (const f of nonStatusTracked) {
        if (b[f] === undefined) continue;
        if (b[f] === existing[f]) continue;
        params.push(b[f]);
        sets.push(`${colMap[f]}=$${params.length}`);
      }
      params.push(id);
      await rawExecute(`UPDATE warehouse_products SET ${sets.join(",")} WHERE id=$${params.length} AND "companyId"=$${params.length + 1} AND "deletedAt" IS NULL`, [...params, scope.companyId]);
      const [fetched] = await rawQuery<Record<string, unknown>>(`SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
      row = fetched;

      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "update",
        entity: "warehouse_products",
        entityId: id,
        before,
        after,
      }).catch((e) => logger.error(e, "warehouse background task failed"));

      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId,
        userId: scope.userId,
        action: "warehouse.product.updated",
        entity: "warehouse_products",
        entityId: id,
        before,
        after,
      }).catch((e) => logger.error(e, "warehouse background task failed"));
    }

    res.json(maskFields(req, { ...row, sellPriceWarning: sellPriceWarning ? "سعر البيع أقل من سعر التكلفة" : null }));
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Update product error:");
  }
});

router.delete("/products/:id", authorize({ feature: "warehouse.inventory", action: "delete", resource: { table: "warehouse_products", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id, sku, name, "currentStock" FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("المنتج غير موجود");

    // Block delete if there's stock on hand — would orphan inventory
    if (Number(existing.currentStock) > 0) {
      throw new ConflictError(
        `لا يمكن حذف المنتج — يحتوي على ${existing.currentStock} وحدة في المخزون`,
        { field: "currentStock", fix: "قم بصرف أو تعديل المخزون لصفر قبل الحذف" }
      );
    }

    await applyTransition({
      entity: "warehouse_products",
      id,
      scope,
      action: "warehouse.product.deleted",
      fromStates: ["active", "inactive"],
      toState: "inactive",
      setExtras: {
        deletedAt: { raw: "NOW()" },
      },
      extraWhere: `"deletedAt" IS NULL`,
      after: { sku: existing.sku, name: existing.name, deletedAt: new Date().toISOString() },
    });

    res.json({ message: "تم حذف المنتج بنجاح" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Delete product error:");
  }
});

router.get("/movements", authorize({ feature: "warehouse.transfers", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { productId, search, status } = req.query as Record<string, string | undefined>;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'm."companyId"', branchColumn: 'm."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (productId) { where += ` AND m."productId" = $${paramIdx}`; params.push(Number(productId)); paramIdx++; }
    if (search) { params.push(`%${search}%`); where += ` AND (p.name ILIKE $${paramIdx} OR m.reference ILIKE $${paramIdx})`; paramIdx++; }
    if (status) { where += ` AND m.type = $${paramIdx}`; params.push(status); paramIdx++; }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT m.*, p.name AS "productName", p.sku FROM warehouse_movements m LEFT JOIN warehouse_products p ON p.id=m."productId" AND p."deletedAt" IS NULL WHERE ${where} ORDER BY m.id DESC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length, page: 1, pageSize: rows.length }));
  } catch (err) { handleRouteError(err, res, "Warehouse movements error:"); }
});

// RBAC v2: warehouse.transfers view (movements between branches).
router.get("/movements/:id", authorize({ feature: "warehouse.transfers", action: "view", resource: { table: "warehouse_movements", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT m.*, p.name AS "productName", p.sku
       FROM warehouse_movements m
       LEFT JOIN warehouse_products p ON p.id=m."productId" AND p."deletedAt" IS NULL
       WHERE m.id=$1 AND m."companyId"=$2`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("حركة المخزن غير موجودة");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Warehouse movement detail error:"); }
});

router.post("/movements", authorize({ feature: "warehouse.transfers", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const b = zodParse(createMovementSchema.safeParse(req.body));
    const qtyNum = b.quantity;

    let unitCost = b.unitCost || 0;
    let insertId = 0;
    let updatedProduct: any = null;
    let preMovementAvgCost = 0;
    let productRef: any = null;

    await withTransaction(async (client) => {
      const prodRes = await client.query(
        `SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL FOR UPDATE`,
        [b.productId, scope.companyId]
      );
      const product = prodRes.rows[0];
      if (!product) throw new NotFoundError("المنتج غير موجود");

      // Prevent overdraw on out / transfer_out
      if ((b.type === 'out' || b.type === 'transfer_out') && Number(product.currentStock) < qtyNum) {
        throw new ConflictError(
          `الكمية المطلوبة (${qtyNum}) تتجاوز المخزون الحالي (${product.currentStock})`,
          { field: "quantity", fix: `المخزون المتاح: ${product.currentStock}` }
        );
      }
      productRef = product;
      // Snapshot weighted-average cost BEFORE the movement runs so that
      // "out"/issue postings use the pre-movement WA rather than the
      // freshly-recomputed figure.
      const preCost = Number(product.costPrice ?? 0);
      const preLastWa = Number(product.lastWaCost ?? 0);
      preMovementAvgCost = preCost > 0 ? preCost : preLastWa;

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
          const params: unknown[] = [];
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
        const batchNum = generateTimeRef("BATCH");
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
      await client.query(`UPDATE warehouse_products SET "currentStock" = "currentStock" + $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`, [sign * Math.abs(b.quantity), b.productId, scope.companyId]);

      if (b.type === 'in' || b.type === 'return' || b.type === 'transfer_in') {
        const incomingQty = Math.abs(Number(b.quantity));
        const incomingCost = Number(b.unitCost ?? 0);
        const prevStock = Math.max(0, Number(product.currentStock));
        const prevCost = Number(product.costPrice ?? 0);
        const newTotalValue = prevStock * prevCost + incomingQty * incomingCost;
        const newTotalQty = prevStock + incomingQty;
        const newWaCost = newTotalQty > 0 ? roundTo4(newTotalValue / newTotalQty) : incomingCost;
        await client.query(
          `UPDATE warehouse_products SET "costPrice"=$1, "lastWaCost"=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
          [newWaCost, b.productId, scope.companyId]
        );
      } else if ((b.type === 'out' || b.type === 'transfer_out') && newStock <= 0) {
        await client.query(
          `UPDATE warehouse_products SET "lastWaCost"="costPrice", "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
          [b.productId, scope.companyId]
        );
      }

      const updatedProdRes = await client.query(`SELECT * FROM warehouse_products WHERE id=$1`, [b.productId]);
      updatedProduct = updatedProdRes.rows[0] ?? null;
    });

    // ─── GL POSTING ────────────────────────────────────────────────────────
    // Wrapped in try/catch inside postInventoryMovementGl — a failing journal
    // entry must NEVER roll back the already-committed stock movement. This
    // mirrors the pattern used by fleet/properties/hr.
    let journalEntryId: number | null = null;
    try {
      const mvType = String(b.type || "");
      const qty = Math.abs(Number(b.quantity));
      const productName = productRef?.name ?? undefined;
      const productCost = productRef ? Number(productRef.costPrice ?? 0) : 0;
      if (mvType === "in" || mvType === "return") {
        const unitCostIn = Number(b.unitCost ?? 0);
        if (unitCostIn > 0) {
          journalEntryId = await postInventoryMovementGl({
            companyId: scope.companyId,
            branchId: scope.branchId,
            // as-any-reason: justified-external - scope.activeAssignmentId is injected by authMiddleware at runtime but not exposed on the Scope type here
            createdBy: (scope as any).activeAssignmentId ?? scope.userId,
            movementId: insertId,
            productId: Number(b.productId),
            productName,
            trigger: "receipt",
            quantity: qty,
            unitCost: unitCostIn,
            reference: b.reference ?? null,
          });
        } else {
          logger.warn(
            `[warehouse-gl] receipt movement ${insertId} has no unitCost — GL posting skipped`
          );
        }
      } else if (mvType === "out") {
        // Use pre-movement weighted-average cost; fall back to product.cost
        // (costPrice) if avg is missing.
        let issueCost = preMovementAvgCost;
        if (!(issueCost > 0)) {
          issueCost = productCost;
          if (issueCost > 0) {
            logger.warn(
              `[warehouse-gl] issue movement ${insertId}: using product.costPrice fallback (${issueCost}) — weighted-average unavailable`
            );
          }
        }
        if (issueCost > 0) {
          journalEntryId = await postInventoryMovementGl({
            companyId: scope.companyId,
            branchId: scope.branchId,
            // as-any-reason: justified-external - scope.activeAssignmentId is injected by authMiddleware at runtime but not exposed on the Scope type here
            createdBy: (scope as any).activeAssignmentId ?? scope.userId,
            movementId: insertId,
            productId: Number(b.productId),
            productName,
            trigger: "issue",
            quantity: qty,
            unitCost: issueCost,
            reference: b.reference ?? null,
          });
        } else {
          logger.warn(
            `[warehouse-gl] issue movement ${insertId} has no unit cost (WA or fallback) — GL posting skipped`
          );
        }
      }
      // transfer_in / transfer_out: internal movement, no GL impact
    } catch (glOuterErr) {
      logger.error(glOuterErr, `[warehouse-gl] unexpected error posting GL for movement ${insertId}:`);
    }

    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM warehouse_movements WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    // as-any-reason: justified-pragmatic - augmenting SELECT result row with computed journalEntryId field before returning to client; row shape is Record<string, unknown>
    if (row) (row as any).journalEntryId = journalEntryId;

    // Bus emission — closes the dead listener in eventListeners.ts:261 so the
    // rules engine + audit trail see every stock movement, not just products.
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "warehouse.movement.created",
      entity: "warehouse_movements",
      entityId: insertId,
      movementId: insertId,
      type: String(row?.type ?? b.type ?? ""),
      productId: Number(row?.productId ?? b.productId),
      qty: Number(row?.quantity ?? b.quantity),
      details: JSON.stringify({
        productId: row?.productId,
        type: row?.type,
        quantity: row?.quantity,
        unitCost: row?.unitCost,
        reference: row?.reference,
      }),
    }).catch((e) => logger.error(e, "warehouse background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "warehouse_movements", entityId: insertId,
      after: { productId: b.productId, type: b.type, quantity: b.quantity, unitCost, reference: b.reference },
    }).catch((e) => logger.error(e, "warehouse background task failed"));

    if (updatedProduct && Number(updatedProduct.currentStock) <= Number(updatedProduct.minStock)) {
      let autoRequestId: number | null = null;
      try {
        autoRequestId = await triggerMinStockPipeline(scope.companyId, updatedProduct, scope.userId, scope.activeAssignmentId);
      } catch (e) {
        logger.error(e, "[MinStock] Pipeline error (non-critical, movement already committed):");
      }
      res.status(201).json({ ...row, autoRequestId, lowStockAlert: true });
      return;
    }

    res.status(201).json(row);
  } catch (err) {
    handleRouteError(err, res, "Create movement error:");
  }
});

async function triggerMinStockPipeline(companyId: number, product: any, userId: number, assignmentId?: number): Promise<number | null> {
  const lastOrders = await rawQuery<Record<string, unknown>>(
    `SELECT pri."unitPrice" AS "unitCost" FROM purchase_request_items pri JOIN purchase_requests pr ON pr.id=pri."requestId" WHERE pri."productId"=$1 AND pr."companyId"=$2 ORDER BY pr."createdAt" DESC LIMIT 3`,
    [product.id, companyId]
  );
  const prices = lastOrders.map((r: Record<string, unknown>) => Number(r.unitCost)).filter((v: number) => v > 0);
  const estimatedUnitCost = prices.length > 0 ? movingAverage(prices) : Number(product.costPrice) || 0;
  const reorderQty = Math.max(Number(product.maxStock) - Number(product.currentStock), Number(product.minStock) * 2, 1);

  const preferredSupplier = await rawQuery<Record<string, unknown>>(
    `SELECT s.* FROM suppliers s JOIN purchase_requests pr ON pr."supplierId"=s.id WHERE pr."companyId"=$1 AND s."deletedAt" IS NULL ORDER BY pr."createdAt" DESC LIMIT 1`,
    [companyId]
  );
  const supplierId = preferredSupplier[0]?.id || null;
  const estimatedTotal = reorderQty * estimatedUnitCost;
  const ref = generateTimeRef("PR-AUTO");

  let effectiveAssignmentId = assignmentId;
  if (!effectiveAssignmentId) {
    const [asgn] = await rawQuery<Record<string, unknown>>(`SELECT id FROM employee_assignments WHERE "employeeId" = $1 AND "companyId" = $2 AND status = 'active' LIMIT 1`, [userId, companyId]);
    effectiveAssignmentId = (asgn?.id as number | undefined) || userId;
  }
  let prId = 0;
  await withTransaction(async (client) => {
    const result = await client.query(
      `INSERT INTO purchase_requests ("companyId","supplierId",ref,status,"totalAmount","requestedBy",notes) VALUES ($1,$2,$3,'pending',$4,$5,$6) RETURNING id`,
      [companyId, supplierId, ref, estimatedTotal, effectiveAssignmentId, `طلب شراء تلقائي - مخزون منخفض: ${product.name}`]
    );
    prId = result.rows[0].id;
    await client.query(
      `INSERT INTO purchase_request_items ("requestId","productId",quantity,"unitPrice","totalPrice") VALUES ($1,$2,$3,$4,$5)`,
      [prId, product.id, reorderQty, estimatedUnitCost, estimatedTotal]
    );
  });
  return prId || null;
}

router.post("/transfers", authorize({ feature: "warehouse.transfers", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const b = zodParse(createTransferSchema.safeParse(req.body));

    const qtyNum = b.quantity;

    const transferRef = generateTimeRef("TRANSFER");
    const fromLocation = b.fromLocation || b.fromWarehouseId ? `مستودع-${b.fromWarehouseId}` : 'المستودع الرئيسي';
    const toLocation = b.toLocation || b.toWarehouseId ? `مستودع-${b.toWarehouseId}` : 'المستودع الفرعي';

    let outId = 0;
    let inId = 0;
    let unitCost = 0;

    await withTransaction(async (client) => {
      const prodRes = await client.query(
        `SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL FOR UPDATE`,
        [b.productId, scope.companyId]
      );
      const product = prodRes.rows[0];
      if (!product) throw new NotFoundError("المنتج غير موجود");
      if (Number(product.currentStock) < qtyNum) {
        throw new ConflictError(
          `الكمية المطلوبة (${qtyNum}) تتجاوز المخزون الحالي (${product.currentStock})`,
          { field: "quantity", fix: `المخزون المتاح: ${product.currentStock}` }
        );
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

      // C1 fix: warehouse_products.currentStock is the company-wide global
      // counter (no per-warehouse split column on this table). An internal
      // A→B transfer must NOT change it — it's recorded only as the paired
      // transfer_out + transfer_in movement rows above. The previous code
      // decremented currentStock by qty without re-incrementing for the
      // matching transfer_in, causing silent stock loss equal to the
      // transferred quantity on every transfer.
    });

    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "warehouse.transfer.created",
      entity: "warehouse_movements",
      entityId: outId,
      details: JSON.stringify({ transferRef, fromLocation, toLocation, quantity: b.quantity, productId: b.productId }),
    }).catch((e) => logger.error(e, "warehouse background task failed"));

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "warehouse_transfers", entityId: outId,
      after: { transferRef, fromLocation, toLocation, quantity: b.quantity, productId: b.productId, unitCost },
    }).catch((e) => logger.error(e, "warehouse background task failed"));

    const [outRow] = await rawQuery<Record<string, unknown>>(`SELECT * FROM warehouse_movements WHERE id=$1 AND "companyId"=$2`, [outId, scope.companyId]);
    const [inRow] = await rawQuery<Record<string, unknown>>(`SELECT * FROM warehouse_movements WHERE id=$1 AND "companyId"=$2`, [inId, scope.companyId]);
    res.status(201).json({
      transferRef,
      outMovement: outRow || { id: outId },
      inMovement: inRow || { id: inId },
      fromLocation,
      toLocation,
      quantity: b.quantity,
      unitCost,
      totalValue: Number(b.quantity) * unitCost,
      status: 'completed',
    });
  } catch (err) {
    handleRouteError(err, res, "Transfer error:");
  }
});

router.get("/categories", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { page = "1", limit: lim = "50", search, status } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Number(lim) || 50, 500);
    const offset = (pageNum - 1) * perPage;

    const params: unknown[] = [scope.companyId];
    let where = `"companyId"=$1 AND "deletedAt" IS NULL`;
    let paramIdx = 2;
    if (search) { params.push(`%${search}%`); where += ` AND name ILIKE $${paramIdx}`; paramIdx++; }
    if (status) { params.push(status); where += ` AND status = $${paramIdx}`; paramIdx++; }

    const [countRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) AS total FROM warehouse_categories WHERE ${where}`,
      params
    );
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM warehouse_categories WHERE ${where} ORDER BY name LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, perPage, offset]
    );
    res.json(maskFields(req, { data: rows, total: Number(countRow.total), page: pageNum, pageSize: perPage }));
  } catch (err) { handleRouteError(err, res, "Warehouse categories error:"); }
});

router.get("/categories/:id", authorize({ feature: "warehouse.inventory", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM warehouse_categories WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("الفئة غير موجودة");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Warehouse category detail error:"); }
});

router.post("/categories", authorize({ feature: "warehouse.inventory", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createCategorySchema.safeParse(req.body));
    if (b.parentId) {
      const [parent] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM warehouse_categories WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.parentId, scope.companyId]
      );
      if (!parent) {
        throw new ValidationError("الفئة الأب غير موجودة", { field: "parentId", fix: "اختر فئة أب مسجلة أو اتركها فارغة" });
      }
    }
    const { insertId } = await rawExecute(
      `INSERT INTO warehouse_categories ("companyId",name,"parentId") VALUES ($1,$2,$3)`,
      [scope.companyId, b.name.trim(), b.parentId || null]
    );
    assertInsert(insertId, "warehouse_categories");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM warehouse_categories WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "warehouse.category.created",
      entity: "warehouse_categories",
      entityId: insertId,
      details: JSON.stringify({ name: b.name.trim(), parentId: b.parentId || null }),
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "warehouse_categories", entityId: insertId,
      after: { name: b.name.trim(), parentId: b.parentId || null },
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create category error:"); }
});

router.get("/suppliers", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { page = "1", limit: lim = "50", search, status } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Number(lim) || 50, 500);
    const offset = (pageNum - 1) * perPage;

    const params: unknown[] = [scope.companyId];
    let where = `"companyId"=$1 AND "deletedAt" IS NULL`;
    let paramIdx = 2;
    if (search) { params.push(`%${search}%`); where += ` AND (name ILIKE $${paramIdx} OR "contactPerson" ILIKE $${paramIdx} OR phone ILIKE $${paramIdx})`; paramIdx++; }
    if (status) { params.push(status); where += ` AND status = $${paramIdx}`; paramIdx++; }

    const [countRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) AS total FROM suppliers WHERE ${where}`,
      params
    );
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM suppliers WHERE ${where} ORDER BY name LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      [...params, perPage, offset]
    );
    res.json(maskFields(req, { data: rows, total: Number(countRow.total), page: pageNum, pageSize: perPage }));
  } catch (err) { handleRouteError(err, res, "Suppliers error:"); }
});

router.get("/suppliers/:id", authorize({ feature: "warehouse.inventory", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM suppliers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("المورد غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Supplier detail error:"); }
});

router.post("/suppliers", authorize({ feature: "warehouse.inventory", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createSupplierSchema.safeParse(req.body));
    if (b.taxNumber) {
      const [dup] = await rawQuery<Record<string, unknown>>(
        `SELECT id FROM suppliers WHERE "taxNumber"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
        [b.taxNumber, scope.companyId]
      );
      if (dup) {
        throw new ConflictError(
          "الرقم الضريبي مسجل مسبقاً لمورد آخر",
          { field: "taxNumber", fix: "تحقق من صحة الرقم الضريبي" }
        );
      }
    }
    const { insertId } = await rawExecute(
      `INSERT INTO suppliers ("companyId",name,"contactPerson",phone,email,address,"taxNumber","paymentTerms") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [scope.companyId, b.name.trim(), b.contactPerson, b.phone, b.email, b.address, b.taxNumber, b.paymentTerms || 30]
    );
    assertInsert(insertId, "suppliers");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM suppliers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "warehouse.supplier.created",
      entity: "suppliers",
      entityId: insertId,
      details: JSON.stringify({ name: b.name.trim() }),
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "warehouse_suppliers", entityId: insertId,
      after: { name: b.name.trim(), contactPerson: b.contactPerson, phone: b.phone, email: b.email, taxNumber: b.taxNumber },
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create supplier error:"); }
});

router.patch("/categories/:id", authorize({ feature: "warehouse.inventory", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchCategorySchema.safeParse(req.body));
    const fields: string[] = [];
    const params: unknown[] = [];
    if (b.name !== undefined) { params.push(b.name); fields.push(`name = $${params.length}`); }
    if (b.parentId !== undefined) { params.push(b.parentId); fields.push(`"parentId" = $${params.length}`); }
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<Record<string, unknown>>(`UPDATE warehouse_categories SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL RETURNING *`, params);
    if (rows.length === 0) throw new NotFoundError("الفئة غير موجودة");
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "warehouse.category.updated",
      entity: "warehouse_categories",
      entityId: id,
      details: JSON.stringify({ name: b.name, parentId: b.parentId }),
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "warehouse_categories", entityId: id,
      after: { name: b.name, parentId: b.parentId },
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    res.json(maskFields(req, rows[0]));
  } catch (err) { handleRouteError(err, res, "Update category error:"); }
});

router.delete("/categories/:id", authorize({ feature: "warehouse.inventory", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT id, name FROM warehouse_categories WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!existing) throw new NotFoundError("الفئة غير موجودة");

    const [hasProducts] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) AS cnt FROM warehouse_products WHERE "categoryId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (Number(hasProducts?.cnt || 0) > 0) {
      throw new ConflictError(
        `لا يمكن حذف الفئة "${existing.name}" لأنها تحتوي على ${hasProducts.cnt} منتج`,
        { field: "categoryId", fix: "انقل المنتجات لفئة أخرى أو احذفها أولاً" }
      );
    }
    const [hasChildren] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) AS cnt FROM warehouse_categories WHERE "parentId"=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (Number(hasChildren?.cnt || 0) > 0) {
      throw new ConflictError(
        `لا يمكن حذف الفئة "${existing.name}" لأنها تحتوي على ${hasChildren.cnt} فئة فرعية`,
        { field: "categoryId", fix: "احذف الفئات الفرعية أولاً" }
      );
    }

    await rawExecute(`UPDATE warehouse_categories SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]);
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "warehouse.category.deleted",
      entity: "warehouse_categories",
      entityId: id,
      details: JSON.stringify({ name: existing.name }),
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "warehouse_categories", entityId: id,
      after: { name: existing.name },
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    res.json({ message: "تم حذف الفئة" });
  } catch (err) { handleRouteError(err, res, "Delete category error:"); }
});

router.patch("/suppliers/:id", authorize({ feature: "warehouse.inventory", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(patchSupplierSchema.safeParse(req.body));
    const fields: string[] = [];
    const params: unknown[] = [];
    const addField = (col: string, val: unknown) => { if (val !== undefined) { params.push(val); fields.push(`"${col}" = $${params.length}`); } };
    addField("name", b.name);
    addField("contactPerson", b.contactPerson);
    addField("phone", b.phone);
    addField("email", b.email);
    addField("address", b.address);
    addField("taxNumber", b.taxNumber);
    addField("paymentTerms", b.paymentTerms);
    if (fields.length === 0) { res.json({ message: "لا توجد تغييرات" }); return; }
    params.push(id); params.push(scope.companyId);
    const rows = await rawQuery<Record<string, unknown>>(`UPDATE suppliers SET ${fields.join(", ")} WHERE id = $${params.length - 1} AND "companyId" = $${params.length} AND "deletedAt" IS NULL RETURNING *`, params);
    if (rows.length === 0) throw new NotFoundError("المورد غير موجود");
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "warehouse.supplier.updated",
      entity: "suppliers",
      entityId: id,
      details: JSON.stringify({ name: b.name }),
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "warehouse_suppliers", entityId: id,
      after: { name: b.name, contactPerson: b.contactPerson, phone: b.phone, email: b.email, taxNumber: b.taxNumber },
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    res.json(maskFields(req, rows[0]));
  } catch (err) { handleRouteError(err, res, "Update supplier error:"); }
});

router.delete("/suppliers/:id", authorize({ feature: "warehouse.inventory", action: "delete" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [existing] = await rawQuery<Record<string, unknown>>(`SELECT id FROM suppliers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    if (!existing) throw new NotFoundError("المورد غير موجود");
    await rawExecute(`UPDATE suppliers SET "deletedAt"=NOW() WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [id, scope.companyId]);
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "warehouse.supplier.deleted",
      entity: "suppliers",
      entityId: id,
      details: JSON.stringify({ id }),
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "delete", entity: "warehouse_suppliers", entityId: id,
      after: { id },
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    res.json({ message: "تم حذف المورد" });
  } catch (err) { handleRouteError(err, res, "Delete supplier error:"); }
});

router.get("/stats", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const cid = scope.companyId;
    const [[products], [value], [movements]] = await Promise.all([
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE "currentStock" <= "minStock") as "lowStock" FROM warehouse_products WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COALESCE(SUM("currentStock" * "costPrice"),0) as "totalValue" FROM warehouse_products WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL`, [cid]),
      rawQuery<Record<string, unknown>>(`SELECT COUNT(*) as "todayMovements" FROM warehouse_movements WHERE "companyId"=$1 AND "createdAt"::date = CURRENT_DATE`, [cid]),
    ]);
    res.json(maskFields(req, { totalProducts: Number(products.total), lowStock: Number(products.lowStock), totalValue: Number(value.totalValue), todayMovements: Number(movements.todayMovements) }));
  } catch (err) { handleRouteError(err, res, "Warehouse stats error:"); }
});

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY COUNT — جرد المخزن
// ─────────────────────────────────────────────────────────────────────────────

router.get("/inventory-counts", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { status } = req.query as Record<string, string | undefined>;
    const conditions = [`ic."companyId"=$1`];
    const params: unknown[] = [scope.companyId];
    if (status) { params.push(status); conditions.push(`ic.status=$${params.length}`); }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT ic.*, e.name AS "conductedByName"
       FROM inventory_counts ic
       LEFT JOIN employees e ON e.id=ic."conductedBy" AND e."deletedAt" IS NULL
       WHERE ${conditions.join(" AND ")}
       ORDER BY ic."countDate" DESC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Inventory counts error:"); }
});

router.post("/inventory-counts", authorize({ feature: "warehouse.inventory", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createInventoryCountSchema.safeParse(req.body));
    const { insertId } = await rawExecute(
      `INSERT INTO inventory_counts ("companyId","countDate","conductedBy",status,notes,"warehouseLocation")
       VALUES ($1,$2,$3,'draft',$4,$5)`,
      [scope.companyId,
       b.countDate || todayISO(),
       scope.employeeId || null,
       b.notes || null, b.warehouseLocation || null]
    );
    assertInsert(insertId, "inventory_counts");
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM inventory_counts WHERE id=$1 AND "companyId"=$2`, [insertId, scope.companyId]);
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "warehouse.inventory_count.created",
      entity: "inventory_counts",
      entityId: insertId,
      details: JSON.stringify({ countDate: b.countDate, warehouseLocation: b.warehouseLocation }),
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "inventory_counts", entityId: insertId,
      after: { countDate: b.countDate, warehouseLocation: b.warehouseLocation },
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create count error:"); }
});

router.get("/inventory-counts/:id/items", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const countId = parseId(req.params.id, "id");
    const items = await rawQuery<Record<string, unknown>>(
      `SELECT ici.*, wp.name AS "productName", wp.sku, wp."currentStock" AS "systemStock"
       FROM inventory_count_items ici
       JOIN warehouse_products wp ON wp.id=ici."productId"
       WHERE ici."countId"=$1 AND wp."companyId"=$2
       ORDER BY wp.name`,
      [countId, scope.companyId]
    );

    // P02-MED1 — used to fire one batch query per product inside a
    // for-loop, so a count with 100 items did 101 round-trips. Real
    // warehouse counts run in the hundreds; the page would visibly
    // hang while the loop drained the connection pool. Now fetch
    // every relevant batch in a single IN-clause query and group
    // client-side, so the route runs in 2 queries regardless of
    // item count.
    const productIds = items.map((it: any) => Number(it.productId)).filter((id: number) => Number.isFinite(id));
    const batchesByProduct = new Map<number, any[]>();
    if (productIds.length > 0) {
      const placeholders = productIds.map((_, i) => `$${i + 1}`).join(",");
      const allBatches = await rawQuery<Record<string, unknown>>(
        `SELECT id, "productId", "batchNumber", quantity, "unitCost", "receivedDate"
         FROM warehouse_stock_batches
         WHERE "productId" IN (${placeholders}) AND quantity > 0
         ORDER BY "receivedDate" ASC`,
        productIds
      );
      for (const batch of allBatches) {
        const pid = Number(batch.productId);
        if (!batchesByProduct.has(pid)) batchesByProduct.set(pid, []);
        batchesByProduct.get(pid)!.push(batch);
      }
    }
    for (const item of items) {
      item.batches = batchesByProduct.get(Number(item.productId)) ?? [];
    }

    res.json(maskFields(req, { data: items, total: items.length }));
  } catch (err) { handleRouteError(err, res, "Count items error:"); }
});

router.post("/inventory-counts/:id/items", authorize({ feature: "warehouse.inventory", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const countId = parseId(req.params.id, "id");
    const b = zodParse(createCountItemSchema.safeParse(req.body));
    // Ensure count exists and is in draft
    const [count] = await rawQuery<Record<string, unknown>>(`SELECT * FROM inventory_counts WHERE id=$1 AND "companyId"=$2`, [countId, scope.companyId]);
    if (!count) throw new NotFoundError("الجرد غير موجود");
    if (count.status !== "draft" && count.status !== "in_progress") {
      throw new ConflictError(
        `لا يمكن تعديل جرد بحالة "${count.status}"`,
        { field: "status", fix: "الجرد المعتمد أو الملغى لا يمكن تعديله" }
      );
    }

    const [product] = await rawQuery<Record<string, unknown>>(
      `SELECT id, "currentStock" FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.productId, scope.companyId]
    );
    if (!product) throw new NotFoundError("المنتج غير موجود");

    const physicalCount = Number(b.physicalCount || 0);
    const systemStock = Number(product.currentStock || 0);
    const variance = physicalCount - systemStock;

    // Upsert count item
    const [existing] = await rawQuery<Record<string, unknown>>(
      `SELECT ici.id FROM inventory_count_items ici JOIN inventory_counts ic ON ic.id=ici."countId" WHERE ici."countId"=$1 AND ici."productId"=$2 AND ic."companyId"=$3`,
      [countId, b.productId, scope.companyId]
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
    emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId,
      userId: scope.userId,
      action: "warehouse.inventory_count_item.recorded",
      entity: "inventory_count_items",
      entityId: countId,
      details: JSON.stringify({ productId: b.productId, systemStock, physicalCount, variance }),
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "inventory_count_items", entityId: countId,
      after: { productId: b.productId, systemStock, physicalCount, variance },
    }).catch((e) => logger.error(e, "warehouse background task failed"));
    res.json({ productId: b.productId, systemStock, physicalCount, variance });
  } catch (err) { handleRouteError(err, res, "Count item error:"); }
});

router.post("/inventory-counts/:id/approve", authorize({ feature: "warehouse.inventory", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const countId = parseId(req.params.id, "id");

    // Pre-fetch count items so we can use them inside onApply and for
    // GL posting after the transition commits.
    const items = await rawQuery<Record<string, unknown>>(
      `SELECT ici.*, wp."currentStock" FROM inventory_count_items ici JOIN warehouse_products wp ON wp.id=ici."productId" WHERE ici."countId"=$1 LIMIT 10000`,
      [countId]
    );

    // P02-MED2 — GL posting failures used to be swallowed by a bare
    // try/catch + console.error inside the loop. Collect each failure
    // and surface it on the response so the user knows to follow up.
    // GL posting runs AFTER the transition commits — a failing journal
    // entry must never roll back the approved status or the stock
    // adjustments.
    const glPendingItems: Array<{
      movementId: number; productId: number; productName?: string;
      variance: number; qty: number; preCost: number;
    }> = [];
    const glSkipped: Array<{ productId: number; productName?: string; reason: string }> = [];

    const itemsAdjusted = items.filter((i) => Number(i.variance) !== 0).length;

    await applyTransition({
      entity: "inventory_counts",
      id: countId,
      scope,
      action: "warehouse.inventory_count.approved",
      fromStates: ["draft", "in_progress"],
      toState: "approved",
      setExtras: {
        approvedAt: { raw: "NOW()" },
        approvedBy: scope.employeeId || null,
      },
      after: { itemsAdjusted, totalItems: items.length },
      onApply: async (_row, client) => {
        // Apply stock adjustments for items with variance inside the
        // same transaction so the status flip and inventory deltas are
        // atomic.
        for (const item of items) {
          const variance = Number(item.variance);
          if (variance === 0) continue;

          const movType = variance > 0 ? "in" : "out";
          const qty = Math.abs(variance);

          // Snapshot avg cost BEFORE applying the adjustment so the GL
          // entry uses the pre-adjustment weighted-average.
          const prodBeforeRes = await client.query(
            `SELECT id, name, "costPrice", "lastWaCost" FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL FOR UPDATE`,
            [item.productId, scope.companyId]
          );
          const prodBefore = prodBeforeRes.rows[0];
          const preCost = prodBefore
            ? Number(prodBefore.costPrice ?? 0) || Number(prodBefore.lastWaCost ?? 0)
            : 0;

          await client.query(
            `UPDATE warehouse_products SET "currentStock"="currentStock"+$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
            [variance, item.productId, scope.companyId]
          );

          const movRes = await client.query(
            `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,notes,"createdBy")
             VALUES ($1,$2,$3,$4,$5,'INV-COUNT-' || $6,$7,$8) RETURNING id`,
            [scope.companyId, item.productId, movType, qty, preCost, countId,
             variance > 0 ? `فائض جرد — ${qty} وحدة` : `عجز جرد — ${qty} وحدة`,
             scope.userId]
          );
          const movementId = movRes.rows[0]?.id;

          // Collect data for GL posting (runs outside the transaction).
          if (preCost > 0 && movementId) {
            glPendingItems.push({
              movementId,
              productId: Number(item.productId),
              productName: prodBefore?.name ?? undefined,
              variance,
              qty,
              preCost,
            });
          } else if (preCost <= 0) {
            logger.warn(
              `[warehouse-gl] inventory count variance for product ${item.productId}: no unit cost — GL posting skipped`
            );
            glSkipped.push({
              productId: Number(item.productId),
              productName: prodBefore?.name ?? undefined,
              reason: "تكلفة الوحدة غير متوفرة",
            });
          }
        }
      },
    });

    // GL posting runs after the transition committed — failures must
    // never roll back the approval or stock adjustments.
    const glFailures: Array<{ productId: number; productName?: string; reason: string }> = [];
    for (const pending of glPendingItems) {
      try {
        await postInventoryMovementGl({
          companyId: scope.companyId,
          branchId: scope.branchId,
          // as-any-reason: justified-external - scope.activeAssignmentId is injected by authMiddleware at runtime but not exposed on the Scope type here
          createdBy: (scope as any).activeAssignmentId ?? scope.userId,
          movementId: pending.movementId,
          productId: pending.productId,
          productName: pending.productName,
          trigger: pending.variance > 0 ? "variance_in" : "variance_out",
          quantity: pending.qty,
          unitCost: pending.preCost,
          reference: `INV-COUNT-${countId}`,
        });
      } catch (glErr: any) {
        logger.error(glErr, `[warehouse-gl] inventory count variance GL failed for count ${countId}, product ${pending.productId}:`);
        glFailures.push({
          productId: pending.productId,
          productName: pending.productName,
          reason: glErr?.message ?? String(glErr),
        });
      }
    }

    const baseMessage = "تم اعتماد الجرد وتحديث المخزون";
    if (glFailures.length > 0 || glSkipped.length > 0) {
      const parts: string[] = [];
      if (glFailures.length > 0) parts.push(`فشل ترحيل ${glFailures.length} قيد محاسبي`);
      if (glSkipped.length > 0) parts.push(`تم تخطي ${glSkipped.length} قيد لعدم توفر التكلفة`);
      res.json({
        message: baseMessage,
        itemsAdjusted,
        warning: `${parts.join(" — ")}. تحقق من السجل وأكمل الترحيل يدوياً.`,
        glFailures,
        glSkipped,
      });
      return;
    }
    res.json({ message: baseMessage, itemsAdjusted });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Approve count error:");
  }
});

export default router;
