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
} from "../lib/businessHelpers.js";
import { issueNumber } from "../lib/numberingService.js";
import { internalTechRef } from "../lib/internalRef.js";
import { applyTransition, lifecycleErrorResponse } from "../lib/lifecycleEngine.js";
import { runningWeightedAverageCost } from "../lib/inventory/valuation/running-average.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// WAREHOUSE STATE MACHINES — Phase C.8 Warehouse audit
// ─────────────────────────────────────────────────────────────────────────────
const MOVEMENT_TYPES = ["in", "out", "return", "transfer_in", "transfer_out", "adjustment_in", "adjustment_out"] as const;

// Item types that never carry a stock balance — movements against them are
// rejected. Stockable = product / consumable (NULL defaults to 'product').
const NON_STOCK_ITEM_TYPES = new Set(["service", "digital", "asset"]);

// ─── Controllable warehouse policies ────────────────────────────────────────
// Stored in the cascading `settings` table (system → company), edited from
// the system-controls tab (سياسات المستودع). Defaults preserve the current
// behavior so flipping nothing changes nothing.
interface WarehousePolicies {
  /** W5 — "لا حركة بلا سبب": when true, POST /movements rejects an empty reference. */
  requireMovementReference: boolean;
  /** When false, hitting min-stock does NOT auto-create a purchase request. */
  autoPurchaseRequestOnMinStock: boolean;
  /** F1 — when true, issuing a tracksLots product also REJECTS expired lots
   *  (recalled/quarantine are always rejected regardless). Default off so
   *  enabling lot tracking on a product never silently blocks issues. */
  enforceLotFefo: boolean;
}

function parsePolicyBool(raw: unknown, fallback: boolean): boolean {
  if (raw === undefined || raw === null) return fallback;
  if (typeof raw === "boolean") return raw;
  try { return JSON.parse(String(raw)) === true; } catch { return fallback; }
}

async function getWarehousePolicies(companyId: number, branchId?: number): Promise<WarehousePolicies> {
  const { resolveSettings } = await import("../lib/settings.js");
  const [requireRef, autoPr, lotFefo] = await Promise.all([
    resolveSettings("warehouse.require_movement_reference", companyId, branchId),
    resolveSettings("warehouse.auto_purchase_request_on_min_stock", companyId, branchId),
    resolveSettings("warehouse.enforce_lot_fefo", companyId, branchId),
  ]);
  return {
    requireMovementReference: parsePolicyBool(requireRef, false),
    autoPurchaseRequestOnMinStock: parsePolicyBool(autoPr, true),
    enforceLotFefo: parsePolicyBool(lotFefo, false),
  };
}

/** Default warehouse for the company inside a transaction — creates the
 *  canonical "المستودع الرئيسي" once. Mirrors warehouse-cycle-counts'
 *  resolveWarehouseId but uses the open client (lot receipt is transactional). */
async function resolveDefaultWarehouseId(
  client: import("pg").PoolClient, companyId: number, branchId: number | null
): Promise<number> {
  const existing = await client.query(
    `SELECT id FROM warehouses WHERE "companyId"=$1 AND "deletedAt" IS NULL AND status='active' ORDER BY id ASC LIMIT 1`,
    [companyId]
  );
  if (existing.rows.length) return existing.rows[0].id;
  const created = await client.query(
    `INSERT INTO warehouses ("companyId","branchId",name,code,status) VALUES ($1,$2,'المستودع الرئيسي','MAIN','active') RETURNING id`,
    [companyId, branchId]
  );
  return created.rows[0].id;
}

const NON_ISSUABLE_LOT_STATUSES = new Set(["recalled", "quarantine", "disposed", "expired"]);

/**
 * Lot-aware outbound consumption for a tracksLots product (F1). Runs inside
 * the movement transaction (`client`). Picks lots FEFO (earliest expiry first,
 * NULLs last) or honours an explicit `lotId`; rejects recalled/quarantine/
 * disposed lots always, and expired lots when the company policy is on;
 * deducts `warehouse_stock_lots.quantity`; returns the consumed lots so the
 * movement can stamp its `lotId` (recall trace) and value at lot cost. No GL
 * here — the route posts via warehouseEngine as before.
 */
export async function consumeLotsFefo(
  client: import("pg").PoolClient,
  args: { companyId: number; productId: number; quantity: number; explicitLotId?: number | null; blockExpired: boolean }
): Promise<{ lotId: number; takenQty: number; unitCost: number }[]> {
  const { companyId, productId, quantity, explicitLotId, blockExpired } = args;
  const expiredClause = blockExpired ? `AND ("expiryDate" IS NULL OR "expiryDate" >= CURRENT_DATE)` : "";
  let lots: Array<Record<string, any>>;
  if (explicitLotId) {
    lots = (await client.query(
      `SELECT id, quantity, "unitCost", status, "qualityControlStatus", "expiryDate"
       FROM warehouse_stock_lots
       WHERE id=$1 AND "companyId"=$2 AND "productId"=$3 AND "deletedAt" IS NULL FOR UPDATE`,
      [explicitLotId, companyId, productId]
    )).rows;
    if (!lots.length) throw new ValidationError("الدفعة المحددة غير موجودة لهذا الصنف", { field: "lotId", fix: "اختر دفعة صحيحة" });
    const lot = lots[0];
    if (NON_ISSUABLE_LOT_STATUSES.has(String(lot.status)) || (blockExpired && lot.expiryDate && new Date(lot.expiryDate) < new Date(new Date().toDateString()))) {
      throw new ValidationError(`لا يمكن الصرف من دفعة بحالة "${lot.status}"${lot.expiryDate ? " أو منتهية" : ""}`, { field: "lotId", fix: "اختر دفعة نشطة وغير منتهية" });
    }
    if (String(lot.qualityControlStatus) !== "approved") {
      throw new ValidationError("الدفعة لم تُعتمد في فحص الجودة (QC)", { field: "lotId", fix: "اعتمد الدفعة في QC قبل الصرف" });
    }
  } else {
    lots = (await client.query(
      `SELECT id, quantity, "unitCost", "expiryDate"
       FROM warehouse_stock_lots
       WHERE "companyId"=$1 AND "productId"=$2 AND "deletedAt" IS NULL
         AND status='active' AND "qualityControlStatus"='approved' AND quantity > 0 ${expiredClause}
       ORDER BY "expiryDate" ASC NULLS LAST, id ASC FOR UPDATE`,
      [companyId, productId]
    )).rows;
  }

  const available = lots.reduce((s, l) => s + Number(l.quantity), 0);
  if (available < quantity) {
    throw new ConflictError(
      `الكمية المطلوبة (${quantity}) تتجاوز رصيد الدفعات الصالحة (${available})`,
      { field: "lotId", fix: `رصيد الدفعات الصالح للصرف: ${available}` }
    );
  }

  let remaining = quantity;
  const consumed: { lotId: number; takenQty: number; unitCost: number }[] = [];
  for (const lot of lots) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Number(lot.quantity));
    if (take <= 0) continue;
    remaining -= take;
    await client.query(
      `UPDATE warehouse_stock_lots SET quantity = quantity - $1, "updatedAt"=NOW() WHERE id=$2`,
      [take, lot.id]
    );
    consumed.push({ lotId: lot.id, takenQty: take, unitCost: Number(lot.unitCost ?? 0) });
  }
  return consumed;
}

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
  // Product Accounting Catalog (migration 203 — line-level allocation).
  // These let an admin author once: "this service routes to revenue
  // account X, requires a vehicle, cost center comes from the vehicle"
  // — then every invoice line that picks the product pre-fills.
  itemType: z.enum(["product", "service", "asset", "consumable", "digital"]).optional().nullable(),
  defaultRevenueAccountId: z.coerce.number().int().positive().optional().nullable(),
  defaultExpenseAccountId: z.coerce.number().int().positive().optional().nullable(),
  defaultInventoryAccountId: z.coerce.number().int().positive().optional().nullable(),
  defaultAssetAccountId: z.coerce.number().int().positive().optional().nullable(),
  defaultTaxCode: z.string().optional().nullable(),
  defaultActivityType: z.string().optional().nullable(),
  requiresVehicle: z.coerce.boolean().optional(),
  requiresProperty: z.coerce.boolean().optional(),
  requiresProject: z.coerce.boolean().optional(),
  requiresContract: z.coerce.boolean().optional(),
  requiresUmrahAgent: z.coerce.boolean().optional(),
  requiresUmrahSeason: z.coerce.boolean().optional(),
  defaultCostCenterStrategy: z.enum([
    "from_vehicle", "from_property", "from_unit", "from_project",
    "from_employee", "from_contract", "from_umrah_agent", "from_umrah_season",
    "explicit", "none",
  ]).optional().nullable(),
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
  // Lot tracking (F1): on a tracksLots product, an inbound receipt carries a
  // lotNumber (+optional expiry) to create/augment the lot; an outbound issue
  // may name a specific lotId, else the engine auto-picks FEFO.
  lotId: z.coerce.number().int().positive().optional().nullable(),
  lotNumber: z.string().max(80).optional().nullable(),
  expiryDate: z.string().optional().nullable(),
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
// separate avgCost column. Both this helper and the `POST /movements` route
// derive the new cost from the single shared `runningWeightedAverageCost`
// function, so the formula cannot drift between the two write paths. This
// helper exists for callers outside the movement route (e.g. inventory-count
// approval, transfers-in from other modules).
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
      const newWa = runningWeightedAverageCost(prevQty, prevCost, movQty, movCost);
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
  | "variance_out"
  | "adjustment_in"
  | "adjustment_out";

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

    const trigger = params.trigger as Exclude<InventoryGlTrigger, "transfer">;
    const { warehouseEngine } = await import("../lib/engines/index.js");
    const glResult = await warehouseEngine.postMovementGL(
      { companyId: params.companyId, branchId: params.branchId, createdBy: params.createdBy },
      { id: params.movementId, trigger, totalValue, productName: params.productName, productId: params.productId, ref }
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
    const { search, status, page = "1", limit: lim = "50", dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    // #2713 (تعميم) — سلة المحذوفات: deleted=true يعرض المنتجات المحذوفة فقط.
    const showDeleted = (req.query as Record<string, string | undefined>).deleted === "true";
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Number(lim) || 50, 500);
    const offset = (pageNum - 1) * perPage;
    const filters = parseScopeFilters(req);
    if (search) { filters.search = String(search); filters.searchColumns = ['p.name', 'p.sku']; }
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'p."companyId"', branchColumn: 'p."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (status) { where += ` AND p.status = $${paramIdx}`; params.push(status); paramIdx++; }
    if (dateFrom) { where += ` AND p."createdAt" >= $${paramIdx}::timestamptz`; params.push(dateFrom); paramIdx++; }
    if (dateTo) { where += ` AND p."createdAt" <= ($${paramIdx}::date + INTERVAL '1 day')`; params.push(dateTo); paramIdx++; }
    where += showDeleted ? ` AND p."deletedAt" IS NOT NULL` : ` AND p."deletedAt" IS NULL`;

    const countParams = [...params];
    const [countRow] = await rawQuery<Record<string, unknown>>(
      `SELECT COUNT(*) AS total FROM warehouse_products p WHERE ${where}`,
      countParams
    );

    params.push(perPage);
    const limitParam = paramIdx++;
    params.push(offset);
    const offsetParam = paramIdx++;

    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT p.*, c.name AS "categoryName" FROM warehouse_products p LEFT JOIN warehouse_categories c ON c.id=p."categoryId" AND c."deletedAt" IS NULL WHERE ${where} ORDER BY p.name LIMIT $${limitParam} OFFSET $${offsetParam}`,
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
    const nonStatusTracked = [
      "name","sku","description","categoryId","unit","minStock","maxStock","costPrice","sellPrice","location",
      // Product Accounting Catalog (#1090 line-level allocation P2)
      "itemType","defaultRevenueAccountId","defaultExpenseAccountId","defaultInventoryAccountId",
      "defaultAssetAccountId","defaultTaxCode","defaultActivityType",
      "requiresVehicle","requiresProperty","requiresProject","requiresContract",
      "requiresUmrahAgent","requiresUmrahSeason","defaultCostCenterStrategy",
    ] as const;
    const colMap: Record<string, string> = {
      name: "name", sku: "sku", description: "description", categoryId: '"categoryId"',
      unit: "unit", minStock: '"minStock"', maxStock: '"maxStock"',
      costPrice: '"costPrice"', sellPrice: '"sellPrice"', location: "location",
      itemType: '"itemType"',
      defaultRevenueAccountId: '"defaultRevenueAccountId"',
      defaultExpenseAccountId: '"defaultExpenseAccountId"',
      defaultInventoryAccountId: '"defaultInventoryAccountId"',
      defaultAssetAccountId: '"defaultAssetAccountId"',
      defaultTaxCode: '"defaultTaxCode"',
      defaultActivityType: '"defaultActivityType"',
      requiresVehicle: '"requiresVehicle"',
      requiresProperty: '"requiresProperty"',
      requiresProject: '"requiresProject"',
      requiresContract: '"requiresContract"',
      requiresUmrahAgent: '"requiresUmrahAgent"',
      requiresUmrahSeason: '"requiresUmrahSeason"',
      defaultCostCenterStrategy: '"defaultCostCenterStrategy"',
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

// #2713 (تعميم) — استرجاع منتج محذوف ناعمًا (سلة المحذوفات). عكس الحذف عبر
// آلة الحالة نفسها: inactive (محذوف) → active مع تصفير deletedAt + Audit/Event.
router.post("/products/:id/restore", authorize({ feature: "warehouse.inventory", action: "delete", resource: { table: "warehouse_products", idParam: "id" } }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await applyTransition({
      entity: "warehouse_products",
      id,
      scope,
      action: "warehouse.product.restored",
      fromStates: ["inactive"],
      toState: "active",
      setExtras: {
        deletedAt: { raw: "NULL" },
      },
      extraWhere: `"deletedAt" IS NOT NULL`,
      after: { restored: true },
    });
    res.json({ message: "تم استرجاع المنتج" });
  } catch (err) {
    const mapped = lifecycleErrorResponse(err);
    if (mapped) { res.status(mapped.status).json(mapped.body); return; }
    handleRouteError(err, res, "Restore product error:");
  }
});

router.get("/movements", authorize({ feature: "warehouse.transfers", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { productId, search, status, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(scope, filters, { companyColumn: 'm."companyId"', branchColumn: 'm."branchId"', enforceBranchScope: true });
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (productId) { where += ` AND m."productId" = $${paramIdx}`; params.push(Number(productId)); paramIdx++; }
    if (search) { params.push(`%${search}%`); where += ` AND (p.name ILIKE $${paramIdx} OR m.reference ILIKE $${paramIdx})`; paramIdx++; }
    if (status) { where += ` AND m.type = $${paramIdx}`; params.push(status); paramIdx++; }
    if (dateFrom) { where += ` AND m."createdAt" >= $${paramIdx}::timestamptz`; params.push(dateFrom); paramIdx++; }
    if (dateTo) { where += ` AND m."createdAt" <= ($${paramIdx}::date + INTERVAL '1 day')`; params.push(dateTo); paramIdx++; }
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

// W6 — معاينة الأثر قبل الحفظ. Pure read: computes the stock delta, the
// min-stock alert, the overdraw danger, and an estimated value line, shaped
// for the shared ImpactPreviewButton. Costs here are visible only to roles
// that can already create movements (the form shows unitCost + the context
// card's costPrice to the same audience). Valuation/COGS itself stays in
// finance — this previews quantities and flags, it does not post anything.
router.post("/movements/impact-preview", authorize({ feature: "warehouse.transfers", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createMovementSchema.safeParse(req.body));
    const [product] = await rawQuery<Record<string, any>>(
      `SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.productId, scope.companyId]
    );
    if (!product) throw new NotFoundError("المنتج غير موجود");

    const isOutbound = b.type === "out" || b.type === "transfer_out" || b.type === "adjustment_out";
    const qty = Math.abs(Number(b.quantity));
    const current = Number(product.currentStock ?? 0);
    const minStock = Number(product.minStock ?? 0);
    const newStock = isOutbound ? current - qty : current + qty;
    const unitCost = Number(b.unitCost) > 0 ? Number(b.unitCost) : Number(product.costPrice ?? 0);
    const estValue = roundTo2(qty * unitCost);

    const items: Array<{ category: string; label: string; value: string; severity: "info" | "warning" | "danger" | "success" }> = [
      { category: "المخزون", label: "الرصيد الحالي", value: String(current), severity: "info" },
      { category: "المخزون", label: "الرصيد بعد الحركة", value: String(newStock), severity: newStock < 0 ? "danger" : "success" },
    ];
    if (NON_STOCK_ITEM_TYPES.has(String(product.itemType ?? "product"))) {
      items.push({ category: "تحقق", label: "صنف غير مخزني", value: "سيُرفض الحفظ — الخدمات/الرقمي/الأصول بلا حركات", severity: "danger" });
    }
    if (isOutbound && qty > current) {
      items.push({ category: "تحقق", label: "سحب زائد", value: `الكمية (${qty}) تتجاوز المتاح (${current}) — سيُرفض الحفظ`, severity: "danger" });
    }
    if (newStock >= 0 && newStock <= minStock) {
      const policies = await getWarehousePolicies(scope.companyId, scope.branchId);
      items.push({
        category: "الحد الأدنى",
        label: "تنبيه حد أدنى",
        value: policies.autoPurchaseRequestOnMinStock
          ? `سيهبط الرصيد إلى ${newStock} (الحد: ${minStock}) — سيُنشأ طلب شراء تلقائي`
          : `سيهبط الرصيد إلى ${newStock} (الحد: ${minStock}) — إنشاء طلب الشراء التلقائي معطَّل بالسياسة`,
        severity: "warning",
      });
    }
    if (estValue > 0) {
      items.push({ category: "القيمة", label: "قيمة تقديرية (تُحتسب نهائياً في المالية)", value: `${estValue.toFixed(2)} ر.س`, severity: "info" });
    }

    const hasDanger = items.some((i) => i.severity === "danger");
    res.json(maskFields(req, {
      actionType: "warehouse_movement",
      employeeId: 0,
      employeeName: `${product.name}${product.sku ? ` (${product.sku})` : ""}`,
      items,
      summary: hasDanger
        ? "لا يمكن حفظ هذه الحركة — راجع بنود الخطر أعلاه"
        : `حركة ${isOutbound ? "صرف" : "إدخال"} ${qty} × ${product.name} — الرصيد ${current} ← ${newStock}`,
    }));
  } catch (err) { handleRouteError(err, res, "Movement impact preview error:"); }
});

router.post("/movements", authorize({ feature: "warehouse.transfers", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const b = zodParse(createMovementSchema.safeParse(req.body));
    const policies = await getWarehousePolicies(scope.companyId, scope.branchId);
    // W5 — "لا حركة بلا سبب/مرجع" — enforced only when the company policy
    // (سياسات المستودع في ضوابط النظام) turns it on.
    if (policies.requireMovementReference && !(b.reference && b.reference.trim().length > 0)) {
      throw new ValidationError(
        "المرجع مطلوب لكل حركة مخزون (سياسة الشركة: لا حركة بلا سبب)",
        { field: "reference", fix: "أدخل مرجع الحركة: GRN / أمر صرف / تذكرة صيانة / طلب" }
      );
    }
    const qtyNum = b.quantity;
    // A movement either raises or lowers on-hand stock. `adjustment_in`
    // (stock-up correction) behaves like a receipt; `adjustment_out`
    // (write-down) behaves like an issue.
    const isInbound = b.type === 'in' || b.type === 'return' || b.type === 'transfer_in' || b.type === 'adjustment_in';
    const isOutbound = b.type === 'out' || b.type === 'transfer_out' || b.type === 'adjustment_out';

    let unitCost = b.unitCost || 0;
    let insertId = 0;
    let updatedProduct: any = null;
    let preMovementAvgCost = 0;
    let productRef: any = null;
    let lotForMovement: number | null = null; // F1 — recall-trace link on the movement

    await withTransaction(async (client) => {
      const prodRes = await client.query(
        `SELECT * FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL FOR UPDATE`,
        [b.productId, scope.companyId]
      );
      const product = prodRes.rows[0];
      if (!product) throw new NotFoundError("المنتج غير موجود");

      // Non-stock item types (service / digital / fixed asset) never carry a
      // stock balance, so a warehouse movement against them is meaningless.
      // Stockable = product / consumable (and the legacy NULL default which
      // the DB treats as 'product'). Reject early with a clear Arabic reason.
      if (NON_STOCK_ITEM_TYPES.has(String(product.itemType ?? "product"))) {
        throw new ValidationError(
          "هذا الصنف غير مخزني (خدمة/رقمي/أصل) ولا تُسجَّل له حركة مخزون",
          { field: "productId", fix: "اختر صنفاً مخزنياً (منتج أو مستهلك)" }
        );
      }

      // Prevent overdraw on any stock-lowering movement
      if (isOutbound && Number(product.currentStock) < qtyNum) {
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
      // An adjustment-in is a quantity correction, not a purchase: when no
      // explicit unit cost is given, value the added units at the existing
      // weighted-average cost so the average stays stable.
      if (b.type === 'adjustment_in' && !(Number(b.unitCost) > 0)) {
        unitCost = preMovementAvgCost;
      }

      const tracksLots = product.tracksLots === true;

      if (isOutbound) {
        if (tracksLots) {
          // F1 — lot-aware consumption: FEFO (or explicit lotId), rejecting
          // recalled/quarantine/disposed always and expired when policy on.
          // Value the issue at the weighted lot cost so COGS reflects reality.
          const consumed = await consumeLotsFefo(client, {
            companyId: scope.companyId, productId: b.productId, quantity: Number(b.quantity),
            explicitLotId: b.lotId ?? null, blockExpired: policies.enforceLotFefo,
          });
          lotForMovement = consumed[0]?.lotId ?? null; // recall trace link
          const totalCost = consumed.reduce((s, c) => s + c.takenQty * c.unitCost, 0);
          unitCost = Number(b.quantity) > 0 ? roundTo2(totalCost / Number(b.quantity)) : 0;
        } else {
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
      }

      if (b.type === 'in') {
        if (tracksLots) {
          // F1 — a tracked receipt creates/augments a lot (not a plain batch).
          // The lot starts QC 'approved' here only if explicitly received into
          // an existing approved lot; brand-new lots created via the lots
          // endpoint carry their own QC gate. A receipt requires a lotNumber.
          if (b.lotId) {
            const up = await client.query(
              `UPDATE warehouse_stock_lots SET quantity = quantity + $1, "updatedAt"=NOW()
               WHERE id=$2 AND "companyId"=$3 AND "productId"=$4 AND "deletedAt" IS NULL RETURNING id`,
              [b.quantity, b.lotId, scope.companyId, b.productId]
            );
            if (!up.rows.length) throw new ValidationError("الدفعة المحددة غير موجودة لهذا الصنف", { field: "lotId", fix: "اختر دفعة صحيحة" });
            lotForMovement = b.lotId;
          } else {
            if (!(b.lotNumber && b.lotNumber.trim())) {
              throw new ValidationError("هذا الصنف يتتبّع الدفعات — رقم الدفعة مطلوب عند الاستلام", { field: "lotNumber", fix: "أدخل رقم الدفعة (وتاريخ الصلاحية إن وُجد)" });
            }
            const warehouseId = await resolveDefaultWarehouseId(client, scope.companyId, scope.branchId);
            const lotRes = await client.query(
              `INSERT INTO warehouse_stock_lots
                 ("companyId","productId","warehouseId","lotNumber",quantity,"originalQuantity","unitCost","receivedDate","expiryDate",status,"qualityControlStatus")
               VALUES ($1,$2,$3,$4,$5,$5,$6,CURRENT_DATE,$7,'active','approved')
               ON CONFLICT ("companyId","productId","warehouseId","lotNumber") WHERE "deletedAt" IS NULL
               DO UPDATE SET quantity = warehouse_stock_lots.quantity + EXCLUDED.quantity, "updatedAt"=NOW()
               RETURNING id`,
              [scope.companyId, b.productId, warehouseId, b.lotNumber.trim(), b.quantity, b.unitCost || 0, b.expiryDate ?? null]
            );
            lotForMovement = lotRes.rows[0]?.id ?? null;
          }
        } else {
          // Internal correlation id, NOT a customer-visible doc number
          // (Issue #1141). Stays as a time-based ref by design.
          const batchNum = internalTechRef("BATCH");
          await client.query(
            `INSERT INTO warehouse_stock_batches ("productId","batchNumber",quantity,"unitCost","receivedDate") VALUES ($1,$2,$3,$4,NOW())`,
            [b.productId, batchNum, b.quantity, b.unitCost || 0]
          );
        }
      }

      const sign = isInbound ? 1 : -1;
      const movRes = await client.query(
        `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,notes,"createdBy","branchId","lotId") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [scope.companyId, b.productId, b.type, b.quantity, unitCost, b.reference, b.notes, scope.userId, scope.branchId, lotForMovement]
      );
      insertId = movRes.rows[0]?.id ?? 0;

      const newStock = Number(product.currentStock) + sign * Math.abs(Number(b.quantity));
      await client.query(`UPDATE warehouse_products SET "currentStock" = "currentStock" + $1, "updatedAt" = NOW() WHERE id = $2 AND "companyId" = $3 AND "deletedAt" IS NULL`, [sign * Math.abs(b.quantity), b.productId, scope.companyId]);

      if (isInbound) {
        const incomingQty = Math.abs(Number(b.quantity));
        const prevStock = Math.max(0, Number(product.currentStock));
        const prevCost = Number(product.costPrice ?? 0);
        // An adjustment-in with no explicit cost is valued at the existing
        // average, so re-blending leaves the average unchanged.
        const incomingCost =
          b.type === 'adjustment_in' && !(Number(b.unitCost) > 0)
            ? prevCost
            : Number(b.unitCost ?? 0);
        const newWaCost = runningWeightedAverageCost(prevStock, prevCost, incomingQty, incomingCost);
        await client.query(
          `UPDATE warehouse_products SET "costPrice"=$1, "lastWaCost"=$1, "updatedAt"=NOW() WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
          [newWaCost, b.productId, scope.companyId]
        );
      } else if (isOutbound && newStock <= 0) {
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
      } else if (mvType === "adjustment_in" || mvType === "adjustment_out") {
        // Stock adjustment — post to the inventory-variance account at the
        // movement's recorded unit cost (set above: supplied cost for an
        // adjustment-in, pre-movement weighted-average for an adjustment-out).
        let adjCost = unitCost;
        if (!(adjCost > 0)) adjCost = preMovementAvgCost > 0 ? preMovementAvgCost : productCost;
        if (adjCost > 0) {
          journalEntryId = await postInventoryMovementGl({
            companyId: scope.companyId,
            branchId: scope.branchId,
            // as-any-reason: justified-external - scope.activeAssignmentId is injected by authMiddleware at runtime but not exposed on the Scope type here
            createdBy: (scope as any).activeAssignmentId ?? scope.userId,
            movementId: insertId,
            productId: Number(b.productId),
            productName,
            trigger: mvType === "adjustment_in" ? "adjustment_in" : "adjustment_out",
            quantity: qty,
            unitCost: adjCost,
            reference: b.reference ?? null,
          });
        } else {
          logger.warn(
            `[warehouse-gl] adjustment movement ${insertId} has no unit cost — GL posting skipped`
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
      // Controllable: the auto purchase-request can be switched off from
      // سياسات المستودع; the low-stock alert itself still fires.
      if (policies.autoPurchaseRequestOnMinStock) {
        try {
          autoRequestId = await triggerMinStockPipeline(scope.companyId, updatedProduct, scope.userId, scope.activeAssignmentId);
        } catch (e) {
          logger.error(e, "[MinStock] Pipeline error (non-critical, movement already committed):");
        }
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
  // Numbering center (Issue #1141) — auto-generated PR shares the same
  // numbering scheme as manually-created PRs.
  const issuedPr = await issueNumber({
    companyId,
    branchId: null,
    moduleKey: "purchase",
    entityKey: "purchase_request",
    entityTable: "purchase_requests",
    actorId: userId,
    metadata: { autoReorder: true, productId: product.id },
    expectedTiming: "on_draft",
  });
  const ref = issuedPr.number;

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
    await client.query(
      `UPDATE numbering_assignments SET "entityId" = $1 WHERE id = $2`,
      [prId, issuedPr.assignmentId]
    );
  });
  return prId || null;
}

router.post("/transfers", authorize({ feature: "warehouse.transfers", action: "create" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const b = zodParse(createTransferSchema.safeParse(req.body));

    const qtyNum = b.quantity;

    // Numbering center (Issue #1141) — stock transfer ref. Scheme
    // `warehouse.stock_transfer` was seeded in migration 214.
    const issuedTransfer = await issueNumber({
      companyId: scope.companyId,
      branchId: scope.branchId ?? null,
      moduleKey: "warehouse",
      entityKey: "stock_transfer",
      entityTable: "warehouse_movements",
      actorId: scope.userId,
      expectedTiming: "on_draft",
    });
    const transferRef = issuedTransfer.number;
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
        `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,"fromLocation","toLocation",notes,"createdBy","branchId")
         VALUES ($1,$2,'transfer_out',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [scope.companyId, b.productId, b.quantity, unitCost, transferRef, fromLocation, toLocation, `تحويل من ${fromLocation} إلى ${toLocation}`, scope.userId, scope.branchId]
      );
      outId = outRes.rows[0].id;

      const inRes = await client.query(
        `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,"fromLocation","toLocation",notes,"createdBy","branchId")
         VALUES ($1,$2,'transfer_in',$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [scope.companyId, b.productId, b.quantity, unitCost, transferRef, fromLocation, toLocation, `استلام تحويل من ${fromLocation} في ${toLocation}`, scope.userId, scope.branchId]
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
    const { page = "1", limit: lim = "50", search, status, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Number(lim) || 50, 500);
    const offset = (pageNum - 1) * perPage;

    // warehouse_categories has no branchId column → disable branch scoping.
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(
      scope, filters, { disableBranchScope: true, softDeleteColumn: '"deletedAt"' }
    );
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (search) { params.push(`%${search}%`); where += ` AND name ILIKE $${paramIdx}`; paramIdx++; }
    if (status) { params.push(status); where += ` AND status = $${paramIdx}`; paramIdx++; }
    if (dateFrom) { where += ` AND "createdAt" >= $${paramIdx}::timestamptz`; params.push(dateFrom); paramIdx++; }
    if (dateTo) { where += ` AND "createdAt" <= ($${paramIdx}::date + INTERVAL '1 day')`; params.push(dateTo); paramIdx++; }

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
    const { page = "1", limit: lim = "50", search, status, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
    const pageNum = Math.max(Number(page) || 1, 1);
    const perPage = Math.min(Number(lim) || 50, 500);
    const offset = (pageNum - 1) * perPage;

    // suppliers has no branchId column → disable branch scoping.
    const filters = parseScopeFilters(req);
    const { where: baseWhere, params, nextParamIndex } = buildScopedWhere(
      scope, filters, { disableBranchScope: true, softDeleteColumn: '"deletedAt"' }
    );
    let where = baseWhere;
    let paramIdx = nextParamIndex;
    if (search) { params.push(`%${search}%`); where += ` AND (name ILIKE $${paramIdx} OR "contactPerson" ILIKE $${paramIdx} OR phone ILIKE $${paramIdx})`; paramIdx++; }
    if (status) { params.push(status); where += ` AND status = $${paramIdx}`; paramIdx++; }
    if (dateFrom) { where += ` AND "createdAt" >= $${paramIdx}::timestamptz`; params.push(dateFrom); paramIdx++; }
    if (dateTo) { where += ` AND "createdAt" <= ($${paramIdx}::date + INTERVAL '1 day')`; params.push(dateTo); paramIdx++; }

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

// ── Supplier item memory (FIN-P5-SUPPLIER-ITEMS-MEMORY #2235) ────────────────
// The supplier's usual items + relationship defaults (unit / tax / last price /
// account PURPOSE / allowed scenarios) so the expense flow stops re-typing them.
// Built on the canonical `suppliers.id` (no separate vendor entity, per #2234).
// The item returns `accountPurpose` — NEVER a final accountCode; financialEngine
// resolves the purpose to a real account and preflight verifies it.
router.get("/suppliers/:id/items", authorize({ feature: "warehouse.inventory", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    // Supplier must belong to the caller's company (cross-company → not found).
    const [supplier] = await rawQuery<{ id: number }>(
      `SELECT id FROM suppliers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!supplier) throw new NotFoundError("المورد غير موجود");
    const scenario = typeof req.query.scenario === "string" && req.query.scenario ? req.query.scenario : null;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT id, "supplierId", name, "itemType", "defaultUnit", "defaultTaxCodeId",
              "accountPurpose", "allowedScenarios", "lastPrice", "lastPriceDate", "priceCurrency"
         FROM supplier_items
        WHERE "companyId"=$1 AND "supplierId"=$2 AND "isActive"=true AND "deletedAt" IS NULL
          AND ($3::text IS NULL OR "allowedScenarios" IS NULL OR "allowedScenarios" @> to_jsonb($3::text))
        ORDER BY name ASC`,
      [scope.companyId, id, scenario],
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "Supplier items error:"); }
});

const createSupplierItemSchema = z.object({
  name: z.string().min(1, "اسم البند مطلوب"),
  itemType: z.string().optional(),
  defaultUnit: z.string().optional(),
  defaultTaxCodeId: z.coerce.number().int().positive().optional(),
  accountPurpose: z.string().optional(),
  allowedScenarios: z.array(z.string()).optional(),
  lastPrice: z.coerce.number().optional(),
  priceCurrency: z.string().optional(),
});

router.post("/suppliers/:id/items", authorize({ feature: "warehouse.inventory", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [supplier] = await rawQuery<{ id: number }>(
      `SELECT id FROM suppliers WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId],
    );
    if (!supplier) throw new NotFoundError("المورد غير موجود");
    const b = zodParse(createSupplierItemSchema.safeParse(req.body));
    const { insertId } = await rawExecute(
      `INSERT INTO supplier_items
         ("companyId","supplierId",name,"itemType","defaultUnit","defaultTaxCodeId",
          "accountPurpose","allowedScenarios","lastPrice","lastPriceDate","priceCurrency")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11)`,
      [
        scope.companyId, id, b.name.trim(), b.itemType ?? null, b.defaultUnit ?? null,
        b.defaultTaxCodeId ?? null, b.accountPurpose ?? null,
        b.allowedScenarios ? JSON.stringify(b.allowedScenarios) : null,
        b.lastPrice ?? null, b.lastPrice != null ? todayISO() : null,
        b.priceCurrency ?? "SAR",
      ],
    );
    assertInsert(insertId, "supplier_items");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM supplier_items WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [insertId, scope.companyId],
    );
    createAuditLog({
      companyId: scope.companyId, userId: scope.userId,
      action: "warehouse.supplier_item.created", entity: "supplier_items", entityId: insertId,
      after: { supplierId: id, name: b.name.trim(), itemType: b.itemType ?? null },
    }).catch(() => undefined);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Create supplier item error:"); }
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
    // Link to the Party master (migration 249) at creation so a supplier who
    // is also a client/employee resolves to ONE party immediately — no
    // duplicate master data, no waiting for the operator-triggered backfill.
    // Non-fatal: a party-link failure must not block supplier creation.
    try {
      const { registerEntityParty } = await import("../lib/partyService.js");
      await registerEntityParty(scope.companyId, "suppliers", insertId, "supplier", {
        displayName: b.name.trim(),
        phone: b.phone ?? null,
        email: b.email ?? null,
        kind: "organization",
      });
    } catch (e) {
      logger.error(e, "[warehouse] supplier→party link failed (non-fatal)");
    }
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

    // Atomic upsert via the (countId, productId) unique constraint
    // (migration 197). The previous SELECT-then-INSERT-or-UPDATE pattern
    // had a race: two concurrent POSTs for the same product in the same
    // count both saw "no existing row" and both INSERTed, leaving two
    // rows that approval then applied to stock twice. `ON CONFLICT DO
    // UPDATE` collapses that into one statement; `systemStock` is only
    // set on first insert so the originally-recorded basis is preserved
    // when an edit comes in later.
    await rawExecute(
      `INSERT INTO inventory_count_items ("countId","productId","systemStock","physicalCount",variance,notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("countId","productId") DO UPDATE
         SET "physicalCount" = EXCLUDED."physicalCount",
             variance        = EXCLUDED.variance,
             notes           = EXCLUDED.notes`,
      [countId, b.productId, systemStock, physicalCount, variance, b.notes || null]
    );
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
      `SELECT ici.*, wp."currentStock" FROM inventory_count_items ici JOIN warehouse_products wp ON wp.id=ici."productId" WHERE ici."countId"=$1 AND wp."companyId"=$2 LIMIT 10000`,
      [countId, scope.companyId]
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
      // inventory_counts has no "updatedAt" column (verified against
      // information_schema). The default `"updatedAt" = NOW()` clause
      // the lifecycle engine appends would throw 42703 and 500 the
      // approve endpoint — same blast radius as #646 (route declares a
      // transition the engine then rejects/explodes on). Same workaround
      // already used in properties.ts:3886, finance-invoices.ts:541, and
      // 3 spots in umrah.ts.
      skipUpdatedAt: true,
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
            `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,notes,"createdBy","branchId")
             VALUES ($1,$2,$3,$4,$5,'INV-COUNT-' || $6,$7,$8,$9) RETURNING id`,
            [scope.companyId, item.productId, movType, qty, preCost, countId,
             variance > 0 ? `فائض جرد — ${qty} وحدة` : `عجز جرد — ${qty} وحدة`,
             scope.userId, scope.branchId]
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
