/**
 * Pre-expiry warning cron.
 *
 * Companion to `lots.lotExpiryScanCron`. That one transitions lots to
 * `expired` on or after the expiry date — too late for the warehouse
 * manager to do anything except dispose of stock. This cron runs the
 * same daily window but fires notifications 30 / 60 / 90 days BEFORE
 * expiry so the team can mark down, return-to-supplier, or move the
 * stock to a faster-turning branch.
 *
 * Thresholds are per-warehouse via `warehouses.expiryAlertDays`
 * (jsonb int array, default `[30,60,90]`). An operator can disable the
 * cron for a single warehouse by setting that to `[]` — useful for
 * raw materials with no real expiry.
 *
 * Idempotency: one row per (lotId, thresholdDays) in
 * `lot_expiry_alerts`. Re-running the cron the same day is a no-op;
 * the next day, only newly-crossed thresholds fire. Day boundary is
 * computed from `expiryDate - currentDate`.
 *
 * Notification target: warehouse manager assignment for the warehouse
 * branch (falls back to company manager). The recipient query mirrors
 * the existing `iqama-cron.ts` pattern.
 */
import { rawQuery, rawExecute } from "../rawdb.js";
import { logger } from "../logger.js";
import {
  createNotification,
  emitEvent,
  getManagerAssignmentId,
  todayISO,
} from "../businessHelpers.js";

export interface ExpiryWarningOutcome {
  scanned: number;
  alerted: number;
  errors: string[];
}

interface DueLot {
  id: number;
  companyId: number;
  warehouseId: number;
  productId: number;
  productName: string | null;
  lotNumber: string;
  expiryDate: string;
  daysUntilExpiry: number;
  thresholdDays: number;
  warehouseName: string | null;
  branchId: number | null;
}

/**
 * Pure: pick the smallest threshold that this lot has CROSSED today
 * (days remaining ≤ threshold). Returns null when no threshold has
 * been crossed yet.
 */
export function pickAlertThreshold(
  daysUntilExpiry: number,
  thresholds: readonly number[],
): number | null {
  if (!Number.isFinite(daysUntilExpiry) || daysUntilExpiry < 0) return null;
  // Iterate ascending — smallest matching threshold wins so we get
  // the most-urgent reminder per pass (90→60→30 escalation).
  const sorted = [...thresholds].sort((a, b) => a - b);
  for (const t of sorted) {
    if (daysUntilExpiry <= t) return t;
  }
  return null;
}

export async function runExpiryWarnings(asOfDate?: string): Promise<ExpiryWarningOutcome> {
  const today = asOfDate ?? todayISO();
  const out: ExpiryWarningOutcome = { scanned: 0, alerted: 0, errors: [] };

  // Pull every active/quarantine lot with an expiry within the widest
  // configured window across all warehouses (cap at 365d to stay sane).
  const lots = await rawQuery<DueLot>(
    `SELECT wsl.id,
            wsl."companyId",
            wsl."warehouseId",
            wsl."productId",
            wp.name AS "productName",
            wsl."lotNumber",
            wsl."expiryDate"::text AS "expiryDate",
            (wsl."expiryDate" - $1::date) AS "daysUntilExpiry",
            0 AS "thresholdDays",
            w.name AS "warehouseName",
            w."branchId" AS "branchId"
     FROM warehouse_stock_lots wsl
     JOIN warehouses w ON w.id = wsl."warehouseId"
     LEFT JOIN warehouse_products wp ON wp.id = wsl."productId"
     WHERE wsl.status IN ('active','quarantine')
       AND wsl."expiryDate" IS NOT NULL
       AND wsl."deletedAt" IS NULL
       AND wsl.quantity > 0
       AND wsl."expiryDate" > $1::date
       AND wsl."expiryDate" <= ($1::date + INTERVAL '365 days')`,
    [today],
  );
  out.scanned = lots.length;

  for (const lot of lots) {
    try {
      // Per-warehouse thresholds (default [30,60,90] is in the schema
      // default; null-safe in case the migration ran before the FE pushed
      // the empty default to an existing warehouse row).
      const cfg = await rawQuery<{ days: number[] | null }>(
        `SELECT "expiryAlertDays" AS days FROM warehouses WHERE id = $1`,
        [lot.warehouseId],
      );
      const thresholds = (cfg[0]?.days ?? [30, 60, 90]) as number[];
      if (!Array.isArray(thresholds) || thresholds.length === 0) continue;

      const threshold = pickAlertThreshold(Number(lot.daysUntilExpiry), thresholds);
      if (threshold == null) continue;

      // Idempotency: one (lotId, threshold) row total.
      const ins = await rawExecute(
        `INSERT INTO lot_expiry_alerts ("companyId", "lotId", "thresholdDays", "expiryDate")
         VALUES ($1, $2, $3, $4::date)
         ON CONFLICT ("lotId", "thresholdDays") DO NOTHING`,
        [lot.companyId, lot.id, threshold, lot.expiryDate],
      );
      if (ins.affectedRows === 0) continue; // already alerted at this threshold

      const managerAssignmentId = lot.branchId
        ? await getManagerAssignmentId(lot.companyId, lot.branchId).catch(() => null)
        : null;

      if (managerAssignmentId) {
        await createNotification({
          companyId: lot.companyId,
          assignmentId: managerAssignmentId,
          type: "warehouse_expiry_warning",
          title: `تنبيه قرب انتهاء صلاحية دفعة (${threshold} يوم)`,
          body:
            `الدفعة ${lot.lotNumber} للمنتج ${lot.productName ?? "#" + lot.productId} ` +
            `في المخزن ${lot.warehouseName ?? "#" + lot.warehouseId} ` +
            `ستنتهي صلاحيتها بتاريخ ${lot.expiryDate} ` +
            `(${lot.daysUntilExpiry} يوم متبقية).`,
          priority: threshold <= 30 ? "high" : "normal",
          refType: "warehouse_stock_lots",
          refId: lot.id,
          actionUrl: `/warehouse/lots`,
        });
      }

      await emitEvent({
        companyId: lot.companyId,
        userId: null,
        action: "warehouse.lot.expiring",
        entity: "warehouse_stock_lots",
        entityId: lot.id,
        productId: lot.productId,
        warehouseId: lot.warehouseId,
        thresholdDays: threshold,
        daysUntilExpiry: Number(lot.daysUntilExpiry),
        expiryDate: lot.expiryDate,
      });

      out.alerted += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push(`lot#${lot.id}: ${msg}`);
      logger.error({ lotId: lot.id, err: msg }, "[inventory.expiry-warning] failed");
    }
  }

  return out;
}

/** Cron-compatible wrapper. */
export async function lotExpiryWarningCron(): Promise<string> {
  const out = await runExpiryWarnings();
  if (out.scanned === 0) return "no upcoming expiries";
  return `scanned=${out.scanned} alerted=${out.alerted} errors=${out.errors.length}`;
}
