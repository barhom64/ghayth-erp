// ─── Warehouse advanced inventory (lots / serials / ABC / reports) ──────────
// Replaces the last 12 warehouse wiring-stubs with real services over the
// migration-141 tables. Lots carry a QC lifecycle (pending → approved /
// rejected) and a recall flow; serials are per-unit registry rows; the ABC
// classification is computed lazily per calendar month from the last 365
// days of outbound movement value (Pareto 80/15/5) and cached in
// product_abc_classification. Reports are read-only projections. No GL here
// — quantities and registries only; valuation stays in finance.
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, assertInsert } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { createAuditLog, emitEvent, todayISO } from "../lib/businessHelpers.js";
import { handleRouteError, NotFoundError, ValidationError, ConflictError, zodParse, parseId } from "../lib/errorHandler.js";
import { resolveWarehouseId } from "./warehouse-cycle-counts.js";
import { logger } from "../lib/logger.js";

const router = Router();

/* ============================================================
 * Lots (دفعات الإنتاج)
 * ============================================================ */
const createLotSchema = z.object({
  productId: z.coerce.number().int().positive("الصنف مطلوب"),
  lotNumber: z.string().min(1, "رقم الدفعة مطلوب").max(80),
  quantity: z.coerce.number().min(0).default(0),
  warehouseId: z.coerce.number().int().positive().optional(),
  unitCost: z.coerce.number().min(0).optional(),
  expiryDate: z.string().optional().nullable(),
  manufactureDate: z.string().optional().nullable(),
  supplierId: z.coerce.number().int().positive().optional().nullable(),
});

router.get("/lots", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { where, params } = buildScopedWhere(scope, parseScopeFilters(req), {
      companyColumn: 'l."companyId"',
      enforceBranchScope: false,
    });
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT l.*, l."qualityControlStatus" AS "qcStatus", p.name AS "productName", p.sku, w.name AS "warehouseName"
       FROM warehouse_stock_lots l
       JOIN warehouse_products p ON p.id=l."productId"
       LEFT JOIN warehouses w ON w.id=l."warehouseId" AND w."deletedAt" IS NULL
       WHERE ${where} AND l."deletedAt" IS NULL
       ORDER BY l.id DESC LIMIT 200`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Lots list error:"); }
});

router.post("/lots", authorize({ feature: "warehouse.inventory", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createLotSchema.safeParse(req.body));
    const [product] = await rawQuery<Record<string, any>>(
      `SELECT id, name, "itemType" FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.productId, scope.companyId]
    );
    if (!product) throw new NotFoundError("الصنف غير موجود");
    const warehouseId = await resolveWarehouseId(scope.companyId, scope.branchId, b.warehouseId);
    const [dup] = await rawQuery<{ id: number }>(
      `SELECT id FROM warehouse_stock_lots WHERE "companyId"=$1 AND "productId"=$2 AND "warehouseId"=$3 AND "lotNumber"=$4 AND "deletedAt" IS NULL`,
      [scope.companyId, b.productId, warehouseId, b.lotNumber.trim()]
    );
    if (dup) throw new ConflictError("رقم الدفعة مسجل مسبقاً لهذا الصنف في هذا المستودع", { field: "lotNumber", fix: "استخدم رقم دفعة مختلفاً" });

    // New lots start in QC quarantine — the QC approve/reject buttons are the
    // gate that releases them (schema default 'approved' is for backfilled
    // legacy rows, not operator-created ones).
    const { insertId } = await rawExecute(
      `INSERT INTO warehouse_stock_lots
         ("companyId","productId","warehouseId","lotNumber",quantity,"originalQuantity","unitCost","receivedDate","expiryDate","manufactureDate","supplierId",status,"qualityControlStatus")
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,'active','pending')`,
      [scope.companyId, b.productId, warehouseId, b.lotNumber.trim(), b.quantity, b.unitCost ?? 0,
       todayISO(), b.expiryDate ?? null, b.manufactureDate ?? null, b.supplierId ?? null]
    );
    assertInsert(insertId, "warehouse_stock_lots");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "warehouse_stock_lots", entityId: insertId,
      after: { productId: b.productId, lotNumber: b.lotNumber, quantity: b.quantity },
    }).catch((e) => logger.error(e, "warehouse-advanced background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "warehouse.lot.created", entity: "warehouse_stock_lots", entityId: insertId,
      details: `دفعة جديدة ${b.lotNumber} — ${product.name}`,
    }).catch((e) => logger.error(e, "warehouse-advanced background task failed"));
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT l.*, l."qualityControlStatus" AS "qcStatus" FROM warehouse_stock_lots l WHERE l.id=$1 AND l."companyId"=$2 AND l."deletedAt" IS NULL`, [insertId, scope.companyId]
    );
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Lot create error:"); }
});

async function setLotQc(req: any, res: any, to: "approved" | "rejected"): Promise<void> {
  const scope = req.scope!;
  const id = parseId(req.params.id, "id");
  const [lot] = await rawQuery<Record<string, any>>(
    `SELECT id, "qualityControlStatus" FROM warehouse_stock_lots WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
    [id, scope.companyId]
  );
  if (!lot) throw new NotFoundError("الدفعة غير موجودة");
  if (lot.qualityControlStatus !== "pending") {
    throw new ValidationError(`قرار QC مُتخذ مسبقاً (${lot.qualityControlStatus})`, { field: "qualityControlStatus", fix: "قرار QC يصدر مرة واحدة على الدفعات المعلقة" });
  }
  // A rejected lot is quarantined; an approved one keeps its current status.
  if (to === "rejected") {
    await rawExecute(
      `UPDATE warehouse_stock_lots SET "qualityControlStatus"='rejected', status='quarantine', "updatedAt"=NOW() WHERE id=$1`,
      [id]
    );
  } else {
    await rawExecute(
      `UPDATE warehouse_stock_lots SET "qualityControlStatus"='approved', "updatedAt"=NOW() WHERE id=$1`,
      [id]
    );
  }
  createAuditLog({
    companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
    action: "update", entity: "warehouse_stock_lots", entityId: id,
    after: { qualityControlStatus: to },
  }).catch((e) => logger.error(e, "warehouse-advanced background task failed"));
  res.json({ id, qcStatus: to });
}

router.post("/lots/:id/qc-approve", authorize({ feature: "warehouse.inventory", action: "approve" }), async (req, res) => {
  try { await setLotQc(req, res, "approved"); } catch (err) { handleRouteError(err, res, "Lot QC approve error:"); }
});
router.post("/lots/:id/qc-reject", authorize({ feature: "warehouse.inventory", action: "approve" }), async (req, res) => {
  try { await setLotQc(req, res, "rejected"); } catch (err) { handleRouteError(err, res, "Lot QC reject error:"); }
});

router.post("/lots/:id/recall", authorize({ feature: "warehouse.inventory", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const reason = String(req.body?.reason ?? "").trim();
    if (!reason) throw new ValidationError("سبب الاستدعاء مطلوب", { field: "reason", fix: "أدخل سبب الاستدعاء" });
    const [lot] = await rawQuery<Record<string, any>>(
      `SELECT id, status FROM warehouse_stock_lots WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!lot) throw new NotFoundError("الدفعة غير موجودة");
    if (!["active", "quarantine"].includes(String(lot.status))) {
      throw new ValidationError(`لا يمكن استدعاء دفعة بحالة ${lot.status}`, { field: "status", fix: "الاستدعاء متاح للدفعات النشطة/المحجوزة فقط" });
    }
    await rawExecute(
      `UPDATE warehouse_stock_lots SET status='recalled', "recalledAt"=NOW(), "recalledBy"=$1, "recallReason"=$2, "updatedAt"=NOW() WHERE id=$3`,
      [scope.employeeId || null, reason, id]
    );
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "warehouse_stock_lots", entityId: id,
      after: { status: "recalled", recallReason: reason },
    }).catch((e) => logger.error(e, "warehouse-advanced background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "warehouse.lot.recalled", entity: "warehouse_stock_lots", entityId: id,
      details: `استدعاء دفعة #${id}: ${reason}`,
    }).catch((e) => logger.error(e, "warehouse-advanced background task failed"));
    res.json({ id, status: "recalled" });
  } catch (err) { handleRouteError(err, res, "Lot recall error:"); }
});

/* ============================================================
 * Serials (التسلسلات)
 * ============================================================ */
const createSerialSchema = z.object({
  productId: z.coerce.number().int().positive("الصنف مطلوب"),
  serialNumber: z.string().min(1, "رقم التسلسل مطلوب").max(80),
  warehouseId: z.coerce.number().int().positive().optional(),
  lotId: z.coerce.number().int().positive().optional().nullable(),
  warrantyExpiresAt: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

router.get("/serials", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { where, params } = buildScopedWhere(scope, parseScopeFilters(req), {
      companyColumn: 's."companyId"',
      enforceBranchScope: false,
    });
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT s.*, p.name AS "productName", p.sku
       FROM warehouse_stock_serials s
       JOIN warehouse_products p ON p.id=s."productId"
       WHERE ${where} AND s."deletedAt" IS NULL
       ORDER BY s.id DESC LIMIT 200`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Serials list error:"); }
});

router.get("/serials/:id", authorize({ feature: "warehouse.inventory", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT s.*, p.name AS "productName", p.sku
       FROM warehouse_stock_serials s
       JOIN warehouse_products p ON p.id=s."productId"
       WHERE s.id=$1 AND s."companyId"=$2 AND s."deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    if (!row) throw new NotFoundError("التسلسل غير موجود");
    res.json(maskFields(req, row));
  } catch (err) { handleRouteError(err, res, "Serial detail error:"); }
});

router.post("/serials", authorize({ feature: "warehouse.inventory", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const b = zodParse(createSerialSchema.safeParse(req.body));
    const [product] = await rawQuery<Record<string, any>>(
      `SELECT id, name FROM warehouse_products WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [b.productId, scope.companyId]
    );
    if (!product) throw new NotFoundError("الصنف غير موجود");
    const warehouseId = await resolveWarehouseId(scope.companyId, scope.branchId, b.warehouseId);
    const [dup] = await rawQuery<{ id: number }>(
      `SELECT id FROM warehouse_stock_serials WHERE "companyId"=$1 AND "serialNumber"=$2 AND "deletedAt" IS NULL`,
      [scope.companyId, b.serialNumber.trim()]
    );
    if (dup) throw new ConflictError("رقم التسلسل مسجل مسبقاً", { field: "serialNumber", fix: "أرقام التسلسل فريدة على مستوى الشركة" });

    const { insertId } = await rawExecute(
      `INSERT INTO warehouse_stock_serials ("companyId","productId","warehouseId","lotId","serialNumber",status,"warrantyExpiresAt",notes)
       VALUES ($1,$2,$3,$4,$5,'in_stock',$6,$7)`,
      [scope.companyId, b.productId, warehouseId, b.lotId ?? null, b.serialNumber.trim(), b.warrantyExpiresAt ?? null, b.notes ?? null]
    );
    assertInsert(insertId, "warehouse_stock_serials");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "warehouse_stock_serials", entityId: insertId,
      after: { productId: b.productId, serialNumber: b.serialNumber },
    }).catch((e) => logger.error(e, "warehouse-advanced background task failed"));
    const [row] = await rawQuery<Record<string, unknown>>(`SELECT * FROM warehouse_stock_serials WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`, [insertId, scope.companyId]);
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Serial create error:"); }
});

const SERIAL_STATUSES = new Set(["in_stock", "reserved", "sold", "returned", "warranty_repair", "scrapped"]);

router.patch("/serials/:id", authorize({ feature: "warehouse.inventory", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const status = String(req.body?.status ?? "").trim();
    if (!SERIAL_STATUSES.has(status)) {
      throw new ValidationError("حالة غير صالحة", { field: "status", fix: `الحالات المتاحة: ${[...SERIAL_STATUSES].join(", ")}` });
    }
    const updated = await rawQuery<{ id: number }>(
      `UPDATE warehouse_stock_serials SET status=$1, "updatedAt"=NOW()
       WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL RETURNING id`,
      [status, id, scope.companyId]
    );
    if (!updated.length) throw new NotFoundError("التسلسل غير موجود");
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "warehouse_stock_serials", entityId: id,
      after: { status },
    }).catch((e) => logger.error(e, "warehouse-advanced background task failed"));
    res.json({ id, status });
  } catch (err) { handleRouteError(err, res, "Serial update error:"); }
});

/* ============================================================
 * ABC classification — lazy monthly Pareto over outbound value
 * ============================================================ */
router.get("/abc-classification", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const period = todayISO().slice(0, 7); // YYYY-MM
    const cached = await rawQuery<Record<string, unknown>>(
      `SELECT a.*, a.category AS "abcClass", p.name AS "productName", p.sku
       FROM product_abc_classification a JOIN warehouse_products p ON p.id=a."productId"
       WHERE a."companyId"=$1 AND a.period=$2 ORDER BY a."paretoValue" DESC LIMIT 200`,
      [scope.companyId, period]
    );
    if (cached.length > 0) {
      res.json(maskFields(req, { data: cached, total: cached.length, period }));
      return;
    }
    // Compute: outbound consumption value per product over the last 365 days.
    const usage = await rawQuery<{ productId: number; value: string }>(
      `SELECT m."productId", COALESCE(SUM(m.quantity * m."unitCost"),0) AS value
       FROM warehouse_movements m
       WHERE m."companyId"=$1 AND m.type IN ('out','transfer_out')
         AND m."createdAt" > NOW() - INTERVAL '365 days'
       GROUP BY m."productId"
       HAVING COALESCE(SUM(m.quantity * m."unitCost"),0) > 0
       ORDER BY value DESC`,
      [scope.companyId]
    );
    const total = usage.reduce((s, u) => s + Number(u.value), 0);
    if (total <= 0) {
      res.json(maskFields(req, { data: [], total: 0, period }));
      return;
    }
    let cumulative = 0;
    for (const u of usage) {
      const share = Number(u.value) / total;
      // Classify by the cumulative share BEFORE this product: the item that
      // crosses the 80% (or 95%) boundary still belongs to the higher class
      // — otherwise a single dominant product (share=1.0) lands in "C".
      const before = cumulative;
      cumulative += share;
      const category = before < 0.8 ? "A" : before < 0.95 ? "B" : "C";
      await rawExecute(
        `INSERT INTO product_abc_classification ("companyId","productId",period,category,"paretoShare","paretoValue")
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT ("companyId","productId",period)
         DO UPDATE SET category=EXCLUDED.category, "paretoShare"=EXCLUDED."paretoShare", "paretoValue"=EXCLUDED."paretoValue", "reviewedAt"=NOW()`,
        [scope.companyId, u.productId, period, category, share.toFixed(4), Number(u.value).toFixed(2)]
      );
    }
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT a.*, a.category AS "abcClass", p.name AS "productName", p.sku
       FROM product_abc_classification a JOIN warehouse_products p ON p.id=a."productId"
       WHERE a."companyId"=$1 AND a.period=$2 ORDER BY a."paretoValue" DESC LIMIT 200`,
      [scope.companyId, period]
    );
    res.json(maskFields(req, { data: rows, total: rows.length, period }));
  } catch (err) { handleRouteError(err, res, "ABC classification error:"); }
});

/* ============================================================
 * Reports — read-only projections
 * ============================================================ */
router.get("/reports/cycle-count-accuracy", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const [agg] = await rawQuery<Record<string, any>>(
      `SELECT COUNT(DISTINCT cc.id)::int AS "approvedCounts",
              COUNT(l.id)::int AS "countedLines",
              COUNT(l.id) FILTER (WHERE l.variance = 0)::int AS "accurateLines"
       FROM warehouse_cycle_counts cc
       JOIN warehouse_cycle_count_lines l ON l."cycleCountId"=cc.id AND l."countedQuantity" IS NOT NULL
       WHERE cc."companyId"=$1 AND cc.status='approved'`,
      [scope.companyId]
    );
    const counted = Number(agg?.countedLines ?? 0);
    const accurate = Number(agg?.accurateLines ?? 0);
    res.json(maskFields(req, {
      approvedCounts: Number(agg?.approvedCounts ?? 0),
      countedLines: counted,
      accurateLines: accurate,
      accuracyPct: counted > 0 ? Math.round((accurate / counted) * 10000) / 100 : null,
    }));
  } catch (err) { handleRouteError(err, res, "Cycle count accuracy report error:"); }
});

router.get("/reports/expiring", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const days = Math.min(Math.max(Number(req.query.days) || 90, 1), 730);
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT l.id, l."lotNumber", l."expiryDate", l.quantity, p.name AS "productName", p.sku,
              (l."expiryDate" - CURRENT_DATE)::int AS "daysLeft"
       FROM warehouse_stock_lots l JOIN warehouse_products p ON p.id=l."productId"
       WHERE l."companyId"=$1 AND l."deletedAt" IS NULL AND l.status='active'
         AND l."expiryDate" IS NOT NULL AND l."expiryDate" <= CURRENT_DATE + ($2 || ' days')::interval
       ORDER BY l."expiryDate" ASC LIMIT 200`,
      [scope.companyId, days]
    );
    res.json(maskFields(req, { data: rows, total: rows.length, horizonDays: days }));
  } catch (err) { handleRouteError(err, res, "Expiring report error:"); }
});

router.get("/reports/lot-aging", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT l.id, l."lotNumber", l.quantity, l."receivedDate", p.name AS "productName", p.sku,
              (CURRENT_DATE - l."receivedDate")::int AS "ageDays"
       FROM warehouse_stock_lots l JOIN warehouse_products p ON p.id=l."productId"
       WHERE l."companyId"=$1 AND l."deletedAt" IS NULL AND l.status='active' AND l.quantity > 0
       ORDER BY l."receivedDate" ASC LIMIT 200`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Lot aging report error:"); }
});

export const warehouseAdvancedRouter = router;
