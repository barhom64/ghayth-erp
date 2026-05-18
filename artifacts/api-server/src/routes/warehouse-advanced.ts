/**
 * Advanced inventory routes (Task #277).
 *
 * Mounts at `/api/warehouse` alongside the legacy warehouse router.
 * Surface:
 *   - GET  /lots                         list lots (filter by warehouse/product/status/expiry)
 *   - POST /lots                         receive a new lot
 *   - POST /lots/:id/qc-approve          approve a quarantined lot
 *   - POST /lots/:id/qc-reject           reject a quarantined lot
 *   - POST /lots/:id/recall              start a recall on an active lot
 *   - POST /lots/:id/writeoff            post a write-off journal entry
 *   - GET  /serials                      list serial-tracked items
 *   - POST /serials                      register a new serial
 *   - PATCH /serials/:id                 transition serial status
 *   - GET  /cycle-counts                 list cycle-count headers
 *   - POST /cycle-counts                 schedule a cycle count
 *   - GET  /cycle-counts/:id             header + lines
 *   - POST /cycle-counts/:id/record      record counted quantities (variance computed server-side)
 *   - POST /cycle-counts/:id/submit      submit-for-review
 *   - POST /cycle-counts/:id/approve     approve (4-eye control)
 *   - POST /cycle-counts/:id/post        post variance journal entry
 *   - POST /cycle-counts/plans           generate ABC-driven plan
 *   - GET  /abc-classification           latest ABC bucket per product
 *   - GET  /reports/lot-aging            FIFO-aged lots report
 *   - GET  /reports/expiring             lots expiring within window (default 90d)
 *   - GET  /reports/cycle-count-accuracy per-warehouse accuracy %
 */
import { Router } from "express";
import { z } from "zod";
import {
  handleRouteError,
  NotFoundError,
  ValidationError,
  zodParse,
  parseId,
} from "../lib/errorHandler.js";
import { rawQuery, rawExecute } from "../lib/rawdb.js";
import { authorize } from "../lib/rbac/authorize.js";
import { emitEvent } from "../lib/businessHelpers.js";
import {
  receiveLot,
  qcApprove,
  qcReject,
  recallLot,
  scheduleCycleCount,
  recordCount,
  submitForReview,
  approveCycleCount,
  postCycleCountVarianceJournal,
  postLotWriteoffJournal,
  generateCycleCountPlan,
} from "../lib/inventory/index.js";

const router = Router();

// ─── LOTS ─────────────────────────────────────────────────────────────────

router.get(
  "/lots",
  authorize({ feature: "warehouse.inventory", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { warehouseId, productId, status, expiringWithin } = req.query as Record<string, string>;
      const params: unknown[] = [scope.companyId];
      const where: string[] = [`wsl."companyId" = $1`, `wsl."deletedAt" IS NULL`];
      if (warehouseId) { params.push(Number(warehouseId)); where.push(`wsl."warehouseId" = $${params.length}`); }
      if (productId)   { params.push(Number(productId));   where.push(`wsl."productId" = $${params.length}`); }
      if (status)      { params.push(String(status));      where.push(`wsl.status = $${params.length}`); }
      if (expiringWithin) {
        params.push(Number(expiringWithin));
        where.push(`wsl."expiryDate" IS NOT NULL AND wsl."expiryDate" <= (CURRENT_DATE + ($${params.length} || ' days')::interval)`);
      }
      const rows = await rawQuery(
        `SELECT wsl.id, wsl."lotNumber", wsl."productId", wp.name AS "productName",
                wsl."warehouseId", w.name AS "warehouseName",
                wsl.quantity, wsl."originalQuantity", wsl."unitCost", wsl.currency,
                wsl."receivedDate"::text AS "receivedDate",
                wsl."expiryDate"::text AS "expiryDate",
                wsl."manufactureDate"::text AS "manufactureDate",
                wsl.status, wsl."qualityControlStatus",
                wsl."supplierId", wsl."supplierLotRef",
                wsl."recallId", wsl."recallReason"
         FROM warehouse_stock_lots wsl
         LEFT JOIN warehouse_products wp ON wp.id = wsl."productId" AND wp."deletedAt" IS NULL
         LEFT JOIN warehouses w ON w.id = wsl."warehouseId" AND w."deletedAt" IS NULL
         WHERE ${where.join(" AND ")}
         ORDER BY wsl."expiryDate" NULLS LAST, wsl."receivedDate" DESC
         LIMIT 500`,
        params,
      );
      res.json({ data: rows });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

const receiveLotSchema = z.object({
  productId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  lotNumber: z.string().min(1).max(100),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative(),
  currency: z.string().min(3).max(8).optional(),
  receivedDate: z.string().min(1),
  expiryDate: z.string().optional(),
  manufactureDate: z.string().optional(),
  supplierId: z.number().int().positive().optional(),
  supplierLotRef: z.string().max(100).optional(),
  requiresQc: z.boolean().optional(),
});

router.post(
  "/lots",
  authorize({ feature: "warehouse.inventory", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(receiveLotSchema.safeParse(req.body));
      const { lotId } = await receiveLot({ companyId: scope.companyId, ...b });
      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "warehouse.lot.received",
        entity: "warehouse_stock_lots", entityId: lotId,
        productId: b.productId, warehouseId: b.warehouseId, quantity: b.quantity,
      });
      res.status(201).json({ data: { id: lotId } });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

router.post(
  "/lots/:id/qc-approve",
  authorize({ feature: "warehouse.inventory", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const lotId = parseId(req.params.id);
      await qcApprove(lotId, scope.companyId, scope.userId);
      await emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "warehouse.lot.approved", entity: "warehouse_stock_lots", entityId: lotId });
      res.json({ data: { id: lotId, status: "active" } });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

router.post(
  "/lots/:id/qc-reject",
  authorize({ feature: "warehouse.inventory", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const lotId = parseId(req.params.id);
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) throw new ValidationError("سبب الرفض مطلوب");
      await qcReject(lotId, scope.companyId, reason, scope.userId);
      await emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "warehouse.lot.rejected", entity: "warehouse_stock_lots", entityId: lotId, reason });
      res.json({ data: { id: lotId, status: "disposed" } });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

router.post(
  "/lots/:id/recall",
  authorize({ feature: "warehouse.inventory", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const lotId = parseId(req.params.id);
      const reason = String(req.body?.reason ?? "").trim();
      if (!reason) throw new ValidationError("سبب الاستدعاء مطلوب");
      await recallLot({
        lotId, companyId: scope.companyId, reason,
        recallId: req.body?.recallId ? Number(req.body.recallId) : undefined,
        recalledBy: scope.userId,
      });
      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "warehouse.lot.recalled",
        entity: "warehouse_stock_lots", entityId: lotId,
        recallId: req.body?.recallId ?? null, reason,
      });
      res.json({ data: { id: lotId, status: "recalled" } });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

router.post(
  "/lots/:id/writeoff",
  authorize({ feature: "warehouse.inventory", action: "delete" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const lotId = parseId(req.params.id);
      const out = await postLotWriteoffJournal({
        lotId,
        companyId: scope.companyId,
        // as-any-reason: justified-external - activeAssignmentId is injected into scope by authMiddleware/runtime assignment context; cast is read-only for journal actor metadata
        postedBy: (scope as any).activeAssignmentId ?? scope.userId,
      });
      res.json({ data: out });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

// ─── SERIALS ──────────────────────────────────────────────────────────────

router.get(
  "/serials",
  authorize({ feature: "warehouse.inventory", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { productId, status, lotId } = req.query as Record<string, string>;
      const params: unknown[] = [scope.companyId];
      const where: string[] = [`wss."companyId" = $1`, `wss."deletedAt" IS NULL`];
      if (productId) { params.push(Number(productId)); where.push(`wss."productId" = $${params.length}`); }
      if (status)    { params.push(String(status));    where.push(`wss.status = $${params.length}`); }
      if (lotId)     { params.push(Number(lotId));     where.push(`wss."lotId" = $${params.length}`); }
      const rows = await rawQuery(
        `SELECT wss.id, wss."serialNumber", wss."productId", wp.name AS "productName",
                wss."lotId", wss.status, wss."warrantyExpiry"::text AS "warrantyExpiry",
                wss."currentLocation", wss."soldToCustomerId", wss."soldDate"::text AS "soldDate"
         FROM warehouse_stock_serials wss
         LEFT JOIN warehouse_products wp ON wp.id = wss."productId" AND wp."deletedAt" IS NULL
         WHERE ${where.join(" AND ")}
         ORDER BY wss.id DESC LIMIT 500`,
        params,
      );
      res.json({ data: rows });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

const createSerialSchema = z.object({
  productId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  serialNumber: z.string().min(1).max(100),
  lotId: z.number().int().positive().optional(),
  warrantyExpiresAt: z.string().optional(),
  notes: z.string().max(500).optional(),
});

router.post(
  "/serials",
  authorize({ feature: "warehouse.inventory", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createSerialSchema.safeParse(req.body));
      // Validate lot ownership matches the serial product/warehouse if supplied
      if (b.lotId) {
        const [lot] = await rawQuery<{ productId: number; warehouseId: number }>(
          `SELECT "productId", "warehouseId" FROM warehouse_stock_lots
            WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
          [b.lotId, scope.companyId],
        );
        if (!lot) throw new ValidationError("الدفعة المرتبطة غير موجودة");
        if (lot.productId !== b.productId || lot.warehouseId !== b.warehouseId) {
          throw new ValidationError("الدفعة لا تنتمي لنفس المنتج/المستودع");
        }
      }
      const rows = await rawQuery<{ id: number }>(
        `INSERT INTO warehouse_stock_serials
           ("companyId", "productId", "warehouseId", "serialNumber", "lotId", status,
            "warrantyExpiresAt", notes)
         VALUES ($1, $2, $3, $4, $5, 'in_stock', $6::date, $7)
         RETURNING id`,
        [scope.companyId, b.productId, b.warehouseId, b.serialNumber, b.lotId ?? null,
          b.warrantyExpiresAt ?? null, b.notes ?? null],
      );
      const id = rows[0].id;
      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "warehouse.serial.received",
        entity: "warehouse_stock_serials", entityId: id,
        productId: b.productId,
      });
      res.status(201).json({ data: { id } });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

const SERIAL_STATUSES = new Set(["in_stock", "reserved", "sold", "returned", "warranty_repair", "scrapped"]);

router.patch(
  "/serials/:id",
  authorize({ feature: "warehouse.inventory", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      const status = String(req.body?.status ?? "").trim();
      if (!SERIAL_STATUSES.has(status)) throw new ValidationError("حالة العنصر غير صالحة");
      const customerId = req.body?.customerId != null ? Number(req.body.customerId) : null;
      const notes = req.body?.notes != null ? String(req.body.notes) : null;
      const result = await rawExecute(
        `UPDATE warehouse_stock_serials
           SET status      = $1, "updatedAt" = NOW(),
               "customerId"= COALESCE($2, "customerId"),
               notes       = COALESCE($3, notes)
         WHERE id = $4 AND "companyId" = $5 AND "deletedAt" IS NULL`,
        [status, customerId, notes, id, scope.companyId],
      );
      if (result.affectedRows === 0) throw new NotFoundError("العنصر التسلسلي غير موجود");
      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "warehouse.serial.status_changed",
        entity: "warehouse_stock_serials", entityId: id,
        status,
      });
      res.json({ data: { id, status } });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

// ─── CYCLE COUNTS ─────────────────────────────────────────────────────────

router.get(
  "/cycle-counts",
  authorize({ feature: "warehouse.inventory", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { warehouseId, status, planId } = req.query as Record<string, string>;
      const params: unknown[] = [scope.companyId];
      const where: string[] = [`wcc."companyId" = $1`];
      if (warehouseId) { params.push(Number(warehouseId)); where.push(`wcc."warehouseId" = $${params.length}`); }
      if (status)      { params.push(String(status));      where.push(`wcc.status = $${params.length}`); }
      if (planId)      { params.push(Number(planId));      where.push(`wcc."planId" = $${params.length}`); }
      const rows = await rawQuery(
        `SELECT wcc.id, wcc."warehouseId", w.name AS "warehouseName",
                wcc."scheduledDate"::text AS "scheduledDate",
                wcc.status, wcc.notes, wcc."planId",
                wcc."countedBy", wcc."countedAt",
                wcc."reviewedBy", wcc."reviewedAt",
                wcc."approvedBy", wcc."approvedAt",
                (SELECT COUNT(*)::int FROM warehouse_cycle_count_lines wccl
                 WHERE wccl."cycleCountId" = wcc.id) AS "lineCount",
                (SELECT COALESCE(SUM("varianceValue"),0)::text FROM warehouse_cycle_count_lines wccl
                 WHERE wccl."cycleCountId" = wcc.id) AS "netVarianceValue"
         FROM warehouse_cycle_counts wcc
         LEFT JOIN warehouses w ON w.id = wcc."warehouseId" AND w."deletedAt" IS NULL
         WHERE ${where.join(" AND ")}
         ORDER BY wcc."scheduledDate" DESC, wcc.id DESC LIMIT 500`,
        params,
      );
      res.json({ data: rows });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

// NOTE: `/cycle-counts/plans` MUST be registered before `/cycle-counts/:id`,
// otherwise Express matches `:id` first and tries to parse "plans" as integer.
const planSchema = z.object({
  warehouseId: z.number().int().positive(),
  period: z.string().regex(/^\d{4}-\d{2}$/),
  scheduledDate: z.string().optional(),
  caps: z.object({
    a: z.number().int().nonnegative().optional(),
    b: z.number().int().nonnegative().optional(),
    c: z.number().int().nonnegative().optional(),
  }).optional(),
});

router.post(
  "/cycle-counts/plans",
  authorize({ feature: "warehouse.inventory", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(planSchema.safeParse(req.body));
      const out = await generateCycleCountPlan({
        companyId: scope.companyId,
        createdBy: scope.userId,
        ...b,
      });
      res.status(out.reused ? 200 : 201).json({ data: out });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

router.get(
  "/cycle-counts/plans",
  authorize({ feature: "warehouse.inventory", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery(
        `SELECT p.id, p."warehouseId", w.name AS "warehouseName",
                p.period, p."planType", p."scheduledCount", p."createdAt",
                (SELECT COUNT(*)::int FROM warehouse_cycle_counts wcc
                 WHERE wcc."planId" = p.id AND wcc.status = 'approved') AS "approvedCount"
         FROM warehouse_cycle_count_plans p
         LEFT JOIN warehouses w ON w.id = p."warehouseId" AND w."deletedAt" IS NULL
         WHERE p."companyId" = $1
         ORDER BY p."createdAt" DESC LIMIT 200`,
        [scope.companyId],
      );
      res.json({ data: rows });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

router.get(
  "/cycle-counts/:id",
  authorize({ feature: "warehouse.inventory", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      const headers = await rawQuery(
        `SELECT wcc.*, w.name AS "warehouseName"
         FROM warehouse_cycle_counts wcc
         LEFT JOIN warehouses w ON w.id = wcc."warehouseId" AND w."deletedAt" IS NULL
         WHERE wcc.id = $1 AND wcc."companyId" = $2`,
        [id, scope.companyId],
      );
      if (!headers.length) throw new NotFoundError("الجرد غير موجود");
      const lines = await rawQuery(
        `SELECT wccl.*, wp.name AS "productName"
         FROM warehouse_cycle_count_lines wccl
         LEFT JOIN warehouse_products wp ON wp.id = wccl."productId" AND wp."deletedAt" IS NULL
         WHERE wccl."cycleCountId" = $1 ORDER BY wccl.id`,
        [id],
      );
      res.json({ data: { header: headers[0], lines } });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

const scheduleSchema = z.object({
  warehouseId: z.number().int().positive(),
  scheduledDate: z.string().min(1),
  notes: z.string().max(500).optional(),
});

router.post(
  "/cycle-counts",
  authorize({ feature: "warehouse.inventory", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(scheduleSchema.safeParse(req.body));
      const { cycleCountId } = await scheduleCycleCount({ companyId: scope.companyId, ...b });
      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "warehouse.cycle_count.scheduled",
        entity: "warehouse_cycle_counts", entityId: cycleCountId,
        warehouseId: b.warehouseId,
      });
      res.status(201).json({ data: { id: cycleCountId } });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

const recordSchema = z.object({
  inputs: z.array(z.object({
    productId: z.number().int().positive(),
    lotId: z.number().int().positive().nullable().optional(),
    systemQuantity: z.number(),
    countedQuantity: z.number(),
    unitCost: z.number().nonnegative(),
  })).min(1),
});

router.post(
  "/cycle-counts/:id/record",
  authorize({ feature: "warehouse.inventory", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      const b = zodParse(recordSchema.safeParse(req.body));
      const out = await recordCount({
        cycleCountId: id, companyId: scope.companyId,
        countedBy: scope.userId,
        inputs: b.inputs.map((i) => ({ ...i, lotId: i.lotId ?? null })),
      });
      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "warehouse.cycle_count.recorded",
        entity: "warehouse_cycle_counts", entityId: id,
        lineCount: out.lineCount, net: out.net,
      });
      res.json({ data: out });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

router.post(
  "/cycle-counts/:id/submit",
  authorize({ feature: "warehouse.inventory", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      await submitForReview({ cycleCountId: id, companyId: scope.companyId, reviewerId: scope.userId });
      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "warehouse.cycle_count.reviewed",
        entity: "warehouse_cycle_counts", entityId: id,
      });
      res.json({ data: { id, status: "reviewed" } });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

router.post(
  "/cycle-counts/:id/approve",
  authorize({ feature: "warehouse.inventory", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      await approveCycleCount({ cycleCountId: id, companyId: scope.companyId, approverId: scope.userId });
      await emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "warehouse.cycle_count.approved",
        entity: "warehouse_cycle_counts", entityId: id,
      });
      res.json({ data: { id, status: "approved" } });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

router.post(
  "/cycle-counts/:id/post",
  authorize({ feature: "warehouse.inventory", action: "update" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id);
      const out = await postCycleCountVarianceJournal({
        cycleCountId: id,
        companyId: scope.companyId,
        // as-any-reason: justified-external - activeAssignmentId is injected into scope by authMiddleware/runtime assignment context; cast is read-only for journal actor metadata
        postedBy: (scope as any).activeAssignmentId ?? scope.userId,
      });
      res.json({ data: out });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

// ─── ABC CLASSIFICATION ───────────────────────────────────────────────────

router.get(
  "/abc-classification",
  authorize({ feature: "warehouse.inventory", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const { period, category } = req.query as Record<string, string>;
      const params: unknown[] = [scope.companyId];
      const where: string[] = [`pac."companyId" = $1`];
      if (period) {
        params.push(String(period));
        where.push(`pac.period = $${params.length}`);
      } else {
        where.push(`pac.period = (SELECT MAX(period) FROM product_abc_classification WHERE "companyId" = $1)`);
      }
      if (category) { params.push(String(category)); where.push(`pac.category = $${params.length}`); }
      const rows = await rawQuery(
        `SELECT pac."productId", wp.name AS "productName",
                pac.period, pac.category,
                pac."paretoShare", pac."paretoValue",
                pac."reviewedAt"
         FROM product_abc_classification pac
         LEFT JOIN warehouse_products wp ON wp.id = pac."productId" AND wp."deletedAt" IS NULL
         WHERE ${where.join(" AND ")}
         ORDER BY pac."paretoValue" DESC NULLS LAST LIMIT 1000`,
        params,
      );
      res.json({ data: rows });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

// ─── REPORTS ──────────────────────────────────────────────────────────────

router.get(
  "/reports/lot-aging",
  authorize({ feature: "warehouse.inventory", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery(
        `SELECT wsl."warehouseId", w.name AS "warehouseName",
                COUNT(*)::int AS "lotCount",
                SUM(wsl.quantity)::text AS "totalQuantity",
                SUM(wsl.quantity * wsl."unitCost")::text AS "totalValue",
                SUM(CASE WHEN (CURRENT_DATE - wsl."receivedDate") <= 30  THEN wsl.quantity ELSE 0 END)::text AS "qty0_30",
                SUM(CASE WHEN (CURRENT_DATE - wsl."receivedDate") BETWEEN 31  AND 60  THEN wsl.quantity ELSE 0 END)::text AS "qty31_60",
                SUM(CASE WHEN (CURRENT_DATE - wsl."receivedDate") BETWEEN 61  AND 90  THEN wsl.quantity ELSE 0 END)::text AS "qty61_90",
                SUM(CASE WHEN (CURRENT_DATE - wsl."receivedDate") BETWEEN 91  AND 180 THEN wsl.quantity ELSE 0 END)::text AS "qty91_180",
                SUM(CASE WHEN (CURRENT_DATE - wsl."receivedDate") > 180 THEN wsl.quantity ELSE 0 END)::text AS "qtyOver180"
         FROM warehouse_stock_lots wsl
         LEFT JOIN warehouses w ON w.id = wsl."warehouseId" AND w."deletedAt" IS NULL
         WHERE wsl."companyId" = $1 AND wsl."deletedAt" IS NULL AND w."deletedAt" IS NULL AND wsl.status = 'active' AND wsl.quantity > 0
         GROUP BY wsl."warehouseId", w.name
         ORDER BY w.name`,
        [scope.companyId],
      );
      res.json({ data: rows });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

router.get(
  "/reports/expiring",
  authorize({ feature: "warehouse.inventory", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const within = Math.max(1, Math.min(365, Number(req.query.within ?? 90)));
      const rows = await rawQuery(
        `SELECT wsl.id, wsl."lotNumber", wsl."productId", wp.name AS "productName",
                wsl."warehouseId", w.name AS "warehouseName",
                wsl.quantity, wsl."unitCost",
                wsl."expiryDate"::text AS "expiryDate",
                (wsl."expiryDate" - CURRENT_DATE)::int AS "daysUntilExpiry",
                wsl.status
         FROM warehouse_stock_lots wsl
         LEFT JOIN warehouse_products wp ON wp.id = wsl."productId" AND wp."deletedAt" IS NULL
         LEFT JOIN warehouses w ON w.id = wsl."warehouseId" AND w."deletedAt" IS NULL
         WHERE wsl."companyId" = $1 AND wsl."deletedAt" IS NULL
           AND wsl.status IN ('active','quarantine')
           AND wsl.quantity > 0
           AND wsl."expiryDate" IS NOT NULL
           AND wsl."expiryDate" <= (CURRENT_DATE + ($2 || ' days')::interval)
         ORDER BY wsl."expiryDate"`,
        [scope.companyId, within],
      );
      res.json({ data: rows, meta: { within } });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

router.get(
  "/reports/cycle-count-accuracy",
  authorize({ feature: "warehouse.inventory", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery(
        `SELECT wcc."warehouseId", w.name AS "warehouseName",
                COUNT(DISTINCT wcc.id)::int AS "totalCounts",
                SUM(CASE WHEN wccl.variance = 0 THEN 1 ELSE 0 END)::int AS "matchedLines",
                COUNT(wccl.id)::int AS "totalLines",
                CASE WHEN COUNT(wccl.id) > 0
                  THEN ROUND( (SUM(CASE WHEN wccl.variance = 0 THEN 1 ELSE 0 END)::numeric
                              / COUNT(wccl.id)::numeric) * 100, 2)
                  ELSE NULL END AS "accuracyPct",
                COALESCE(SUM(CASE WHEN wccl."varianceValue" > 0 THEN wccl."varianceValue" ELSE 0 END),0)::text AS "totalGain",
                COALESCE(SUM(CASE WHEN wccl."varianceValue" < 0 THEN -wccl."varianceValue" ELSE 0 END),0)::text AS "totalLoss"
         FROM warehouse_cycle_counts wcc
         LEFT JOIN warehouse_cycle_count_lines wccl ON wccl."cycleCountId" = wcc.id
         LEFT JOIN warehouses w ON w.id = wcc."warehouseId" AND w."deletedAt" IS NULL
         WHERE wcc."companyId" = $1 AND wcc.status = 'approved'
         GROUP BY wcc."warehouseId", w.name
         ORDER BY w.name`,
        [scope.companyId],
      );
      res.json({ data: rows });
    } catch (e) { handleRouteError(e, res, "warehouse-advanced error:"); }
  },
);

export default router;
