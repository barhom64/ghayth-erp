// ─── Warehouse cycle counts (الجرد الدوري) — real implementation ────────────
// Replaces the 8 wiring-stubs. Lifecycle (chk_cycle_counts_status):
//   pending → in_progress (record) → reviewed (submit) → approved (approve)
// then `post` applies the variances: stock update + a real warehouse_movements
// row per line + variance GL via warehouseEngine.postMovementGL — stamping
// warehouse_cycle_count_lines."adjustmentJournalEntryId" (idempotency marker:
// a stamped line is never re-posted). Quantities change ONLY at post, after
// approval — the financial approval is a request to finance, not a warehouse
// override. The warehouse never values stock; GL goes through the engine.
import { Router } from "express";
import { z } from "zod";
import { rawQuery, rawExecute, withTransaction, assertInsert } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { buildScopedWhere, parseScopeFilters } from "../lib/scopedQuery.js";
import { applyTransition } from "../lib/lifecycleEngine.js";
import { createAuditLog, emitEvent, roundTo2 } from "../lib/businessHelpers.js";
import { handleRouteError, NotFoundError, ValidationError, zodParse, parseId } from "../lib/errorHandler.js";
import { issueNumber } from "../lib/numberingService.js";
import { warehouseEngine } from "../lib/engines/warehouseEngine.js";
import { logger } from "../lib/logger.js";

const router = Router();

const recordSchema = z.object({
  items: z.array(z.object({
    productId: z.coerce.number().int().positive(),
    countedQuantity: z.coerce.number().min(0),
    reason: z.string().max(500).optional().nullable(),
  })).min(1, "أدخل سطراً واحداً على الأقل"),
});

/** Find the company's default warehouse, creating "المستودع الرئيسي" once. */
export async function resolveWarehouseId(companyId: number, branchId: number | null, requested?: number): Promise<number> {
  if (requested) {
    const [w] = await rawQuery<{ id: number }>(
      `SELECT id FROM warehouses WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [requested, companyId]
    );
    if (!w) throw new ValidationError("المستودع غير موجود", { field: "warehouseId", fix: "اختر مستودعاً مسجلاً" });
    return w.id;
  }
  const [existing] = await rawQuery<{ id: number }>(
    `SELECT id FROM warehouses WHERE "companyId"=$1 AND "deletedAt" IS NULL AND status='active' ORDER BY id ASC LIMIT 1`,
    [companyId]
  );
  if (existing) return existing.id;
  const { insertId } = await rawExecute(
    `INSERT INTO warehouses ("companyId","branchId",name,code,status) VALUES ($1,$2,'المستودع الرئيسي','MAIN','active')`,
    [companyId, branchId]
  );
  assertInsert(insertId, "warehouses");
  return insertId;
}

router.get("/cycle-counts", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // warehouse_cycle_counts has no branchId column — company-level cascade only.
    // disableBranchScope (not just enforceBranchScope:false) so an explicit
    // ?branchIds= filter doesn't silently fall through to the joined warehouse's
    // branch (cc has no branch of its own; this is intentionally company-level).
    const { where, params } = buildScopedWhere(scope, parseScopeFilters(req), {
      companyColumn: 'cc."companyId"',
      disableBranchScope: true,
    });
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT cc.*, w.name AS "warehouseName",
              (SELECT COUNT(*)::int FROM warehouse_cycle_count_lines l WHERE l."cycleCountId"=cc.id) AS "lineCount",
              (SELECT COUNT(*)::int FROM warehouse_cycle_count_lines l WHERE l."cycleCountId"=cc.id AND l."countedQuantity" IS NOT NULL) AS "countedLines"
       FROM warehouse_cycle_counts cc
       LEFT JOIN warehouses w ON w.id=cc."warehouseId" AND w."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY cc.id DESC LIMIT 200`,
      params
    );
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Cycle counts list error:"); }
});

// NOTE: declared before "/cycle-counts/:id" so "plans" is not captured as :id.
const PLAN_PERIODS = new Set(["weekly", "monthly", "quarterly"]);

router.get("/cycle-counts/plans", authorize({ feature: "warehouse.inventory", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const rows = await rawQuery<Record<string, unknown>>(
      `SELECT pl.*, w.name AS "warehouseName",
              ('خطة ' || pl."planType" || ' — ' || pl.period) AS name,
              pl.period AS frequency
       FROM warehouse_cycle_count_plans pl
       LEFT JOIN warehouses w ON w.id=pl."warehouseId" AND w."deletedAt" IS NULL
       WHERE pl."companyId"=$1 ORDER BY pl.id DESC LIMIT 100`,
      [scope.companyId]
    ).catch(() => [] as Record<string, unknown>[]);
    res.json(maskFields(req, { data: rows, total: rows.length }));
  } catch (err) { handleRouteError(err, res, "Cycle count plans error:"); }
});

// Replaces the last warehouse wiring-stub: a recurring counting plan. The
// daily cron (warehouse_cycle_count_plan_scan) opens a cycle count per plan
// once per period window.
router.post("/cycle-counts/plans", authorize({ feature: "warehouse.inventory", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const period = String(req.body?.period ?? "monthly").trim();
    if (!PLAN_PERIODS.has(period)) {
      throw new ValidationError("دورية غير صالحة", { field: "period", fix: `الدوريات المتاحة: ${[...PLAN_PERIODS].join(", ")}` });
    }
    const planType = String(req.body?.planType ?? "full").trim().slice(0, 30) || "full";
    const warehouseId = await resolveWarehouseId(
      scope.companyId, scope.branchId,
      req.body?.warehouseId ? Number(req.body.warehouseId) : undefined
    );
    const rows = await rawQuery<Record<string, unknown>>(
      `INSERT INTO warehouse_cycle_count_plans ("companyId","warehouseId",period,"planType","createdBy",notes)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT ("companyId","warehouseId",period,"planType")
       DO UPDATE SET notes=EXCLUDED.notes
       RETURNING *`,
      [scope.companyId, warehouseId, period, planType, scope.employeeId || null, req.body?.notes ?? null]
    );
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "warehouse_cycle_count_plans", entityId: Number(rows[0]?.id ?? 0),
      after: { warehouseId, period, planType },
    }).catch((e) => logger.error(e, "cycle-count background task failed"));
    res.status(201).json(rows[0]);
  } catch (err) { handleRouteError(err, res, "Cycle count plan create error:"); }
});

/** Create a cycle count with a stockable-lines snapshot — shared by the
 *  POST route and the daily plan-scan cron. */
export async function createCycleCountWithSnapshot(
  companyId: number,
  warehouseId: number,
  notes: string | null
): Promise<number> {
  let countId = 0;
  await withTransaction(async (client) => {
    const ccRes = await client.query(
      `INSERT INTO warehouse_cycle_counts ("companyId","warehouseId","scheduledDate",status,notes)
       VALUES ($1,$2,CURRENT_DATE,'pending',$3) RETURNING id`,
      [companyId, warehouseId, notes]
    );
    countId = ccRes.rows[0]?.id ?? 0;
    // Snapshot system quantities NOW — stockable items only (services /
    // digital / assets never carry stock so they are never counted).
    await client.query(
      `INSERT INTO warehouse_cycle_count_lines ("cycleCountId","productId","systemQuantity")
       SELECT $1, p.id, COALESCE(p."currentStock",0)
       FROM warehouse_products p
       WHERE p."companyId"=$2 AND p."deletedAt" IS NULL AND p.status='active'
         AND COALESCE(p."itemType",'product') IN ('product','consumable')
       ORDER BY p.id`,
      [countId, companyId]
    );
  });
  return countId;
}

router.post("/cycle-counts", authorize({ feature: "warehouse.inventory", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const warehouseId = await resolveWarehouseId(
      scope.companyId, scope.branchId,
      req.body?.warehouseId ? Number(req.body.warehouseId) : undefined
    );

    const countId = await createCycleCountWithSnapshot(scope.companyId, warehouseId, req.body?.notes ?? null);
    assertInsert(countId, "warehouse_cycle_counts");

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "create", entity: "warehouse_cycle_counts", entityId: countId,
      after: { warehouseId },
    }).catch((e) => logger.error(e, "cycle-count background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "warehouse.cycle_count.created", entity: "warehouse_cycle_counts", entityId: countId,
      details: `جرد دوري جديد #${countId}`,
    }).catch((e) => logger.error(e, "cycle-count background task failed"));

    const [row] = await rawQuery<Record<string, unknown>>(
      `SELECT * FROM warehouse_cycle_counts WHERE id=$1 AND "companyId"=$2`, [countId, scope.companyId]
    );
    res.status(201).json(row);
  } catch (err) { handleRouteError(err, res, "Cycle count create error:"); }
});

router.get("/cycle-counts/:id", authorize({ feature: "warehouse.inventory", action: "view" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [cc] = await rawQuery<Record<string, unknown>>(
      `SELECT cc.*, w.name AS "warehouseName"
       FROM warehouse_cycle_counts cc
       LEFT JOIN warehouses w ON w.id=cc."warehouseId" AND w."deletedAt" IS NULL
       WHERE cc.id=$1 AND cc."companyId"=$2`,
      [id, scope.companyId]
    );
    if (!cc) throw new NotFoundError("عملية الجرد غير موجودة");
    const items = await rawQuery<Record<string, unknown>>(
      `SELECT l.*, p.name AS "productName", p.sku
       FROM warehouse_cycle_count_lines l
       JOIN warehouse_products p ON p.id=l."productId"
       WHERE l."cycleCountId"=$1 AND p."companyId"=$2 ORDER BY l.id`,
      [id, scope.companyId]
    );
    res.json(maskFields(req, { ...cc, items }));
  } catch (err) { handleRouteError(err, res, "Cycle count detail error:"); }
});

router.post("/cycle-counts/:id/record", authorize({ feature: "warehouse.inventory", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const b = zodParse(recordSchema.safeParse(req.body));
    const [cc] = await rawQuery<{ status: string }>(
      `SELECT status FROM warehouse_cycle_counts WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]
    );
    if (!cc) throw new NotFoundError("عملية الجرد غير موجودة");
    if (!["pending", "in_progress"].includes(cc.status)) {
      throw new ValidationError("لا يمكن تسجيل العدّ بعد التقديم", { field: "status", fix: "العدّ متاح في حالتي pending/in_progress فقط" });
    }
    // Recording all counted lines + flipping the count to in_progress are
    // atomic: a partial save (some lines recorded but the status not
    // flipped, or vice versa) would leave the count inconsistent. rawQuery
    // joins the ambient transaction (txStore). This records physical counts
    // only — no GL posting (variance is posted later in /post).
    const updated = await withTransaction(async () => {
      let n = 0;
      for (const item of b.items) {
        const r = await rawExecute(
          `UPDATE warehouse_cycle_count_lines SET "countedQuantity"=$1, reason=$2
           WHERE "cycleCountId"=$3 AND "productId"=$4`,
          [item.countedQuantity, item.reason ?? null, id, item.productId]
        );
        n += r.affectedRows ?? 0;
      }
      if (cc.status === "pending") {
        await rawExecute(
          `UPDATE warehouse_cycle_counts SET status='in_progress', "countedBy"=$1, "countedAt"=NOW(), "updatedAt"=NOW() WHERE id=$2`,
          [scope.employeeId || null, id]
        );
      }
      return n;
    });
    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "warehouse_cycle_counts", entityId: id,
      after: { recordedLines: updated },
    }).catch((e) => logger.error(e, "cycle-count background task failed"));
    res.json({ id, recordedLines: updated, status: cc.status === "pending" ? "in_progress" : cc.status });
  } catch (err) { handleRouteError(err, res, "Cycle count record error:"); }
});

router.post("/cycle-counts/:id/submit", authorize({ feature: "warehouse.inventory", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [missing] = await rawQuery<{ n: string }>(
      `SELECT COUNT(*) AS n FROM warehouse_cycle_count_lines WHERE "cycleCountId"=$1 AND "countedQuantity" IS NULL`,
      [id]
    );
    if (Number(missing?.n ?? 0) > 0) {
      throw new ValidationError(
        `لا يمكن التقديم: ${missing.n} سطر بلا كمية معدودة`,
        { field: "items", fix: "سجّل العدّ لكل الأسطر أولاً" }
      );
    }
    await applyTransition({
      entity: "warehouse_cycle_counts", id, scope,
      action: "warehouse.cycle_count.submitted",
      fromStates: ["in_progress"], toState: "reviewed",
      setExtras: { reviewedAt: { raw: "NOW()" }, reviewedBy: scope.employeeId || null },
    });
    res.json({ id, status: "reviewed" });
  } catch (err) { handleRouteError(err, res, "Cycle count submit error:"); }
});

router.post("/cycle-counts/:id/approve", authorize({ feature: "warehouse.inventory", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    await applyTransition({
      entity: "warehouse_cycle_counts", id, scope,
      action: "warehouse.cycle_count.approved",
      fromStates: ["reviewed"], toState: "approved",
      setExtras: { approvedAt: { raw: "NOW()" }, approvedBy: scope.employeeId || null },
    });
    res.json({ id, status: "approved" });
  } catch (err) { handleRouteError(err, res, "Cycle count approve error:"); }
});

router.post("/cycle-counts/:id/post", authorize({ feature: "warehouse.inventory", action: "approve" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [cc] = await rawQuery<{ status: string }>(
      `SELECT status FROM warehouse_cycle_counts WHERE id=$1 AND "companyId"=$2`, [id, scope.companyId]
    );
    if (!cc) throw new NotFoundError("عملية الجرد غير موجودة");
    if (cc.status !== "approved") {
      throw new ValidationError("الترحيل متاح بعد الاعتماد فقط", { field: "status", fix: "اعتمد عملية الجرد أولاً" });
    }
    // Un-posted variance lines only — adjustmentJournalEntryId is the
    // idempotency stamp, so a re-post never double-applies.
    const lines = await rawQuery<Record<string, any>>(
      `SELECT l.id, l."productId", l.variance, p.name AS "productName", p."costPrice", p."lastWaCost"
       FROM warehouse_cycle_count_lines l
       JOIN warehouse_products p ON p.id=l."productId"
       WHERE l."cycleCountId"=$1 AND p."companyId"=$2 AND l.variance <> 0 AND l."adjustmentJournalEntryId" IS NULL`,
      [id, scope.companyId]
    );

    const posted: Array<{ lineId: number; movementId: number; journalId: number | null }> = [];
    for (const line of lines) {
      const variance = Number(line.variance);
      const qty = Math.abs(variance);
      const unitCost = Number(line.costPrice ?? 0) > 0 ? Number(line.costPrice) : Number(line.lastWaCost ?? 0);

      // Numbering center (Issue #1141) — adjustment movements share the
      // stock_movement scheme (seeded in migration 216).
      const issued = await issueNumber({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        moduleKey: "warehouse",
        entityKey: "stock_movement",
        entityTable: "warehouse_movements",
        actorId: scope.userId,
        metadata: { cycleCountId: id, productId: Number(line.productId) },
        expectedTiming: "on_draft",
      });

      let movementId = 0;
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE warehouse_products SET "currentStock"="currentStock"+$1, "updatedAt"=NOW()
             WHERE id=$2 AND "companyId"=$3 AND "deletedAt" IS NULL`,
          [variance, line.productId, scope.companyId]
        );
        const mv = await client.query(
          `INSERT INTO warehouse_movements ("companyId","productId",type,quantity,"unitCost",reference,notes,"createdBy","branchId")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [scope.companyId, line.productId, variance > 0 ? "in" : "out", qty, unitCost,
           issued.number, `جرد دوري #${id} — فرق ${variance}`, scope.userId, scope.branchId]
        );
        movementId = mv.rows[0]?.id ?? 0;
      });

      // Variance GL through the engine (after the committed stock change —
      // a failing JE never rolls back physical inventory).
      let journalId: number | null = null;
      const totalValue = roundTo2(qty * unitCost);
      if (totalValue > 0 && movementId) {
        try {
          const gl = await warehouseEngine.postMovementGL(
            { companyId: scope.companyId, branchId: scope.branchId, createdBy: scope.userId },
            {
              id: movementId,
              trigger: variance > 0 ? "variance_in" : "variance_out",
              totalValue,
              productName: line.productName,
              productId: Number(line.productId),
              ref: `CYCLE-${id}-JE-${movementId}`,
            }
          );
          journalId = gl.journalId;
        } catch (glErr) {
          logger.error(glErr, `[cycle-count] variance GL failed for line ${line.id}`);
        }
      }
      await rawExecute(
        `UPDATE warehouse_cycle_count_lines SET "adjustmentJournalEntryId"=$1, "varianceValue"=$2 WHERE id=$3`,
        [journalId, roundTo2(variance * unitCost), line.id]
      );
      posted.push({ lineId: line.id, movementId, journalId });
    }

    createAuditLog({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "update", entity: "warehouse_cycle_counts", entityId: id,
      after: { postedLines: posted.length },
    }).catch((e) => logger.error(e, "cycle-count background task failed"));
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "warehouse.cycle_count.posted", entity: "warehouse_cycle_counts", entityId: id,
      details: `ترحيل فروق الجرد الدوري #${id} (${posted.length} سطر)`,
    }).catch((e) => logger.error(e, "cycle-count background task failed"));

    res.json({ id, postedLines: posted.length, posted });
  } catch (err) { handleRouteError(err, res, "Cycle count post error:"); }
});

export const warehouseCycleCountsRouter = router;
