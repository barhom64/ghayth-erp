/**
 * DB-driven helpers for the lot lifecycle.
 *
 * Each function:
 *   - validates the requested transition through `lots-fsm.ts`
 *   - reads the current row inside the caller's transaction
 *   - writes the new state + audit fields atomically
 *
 * No journal-entry posting yet — the inventory write-off entries
 * (recalled / expired / disposed) hook into the GL helpers from
 * #224 in a follow-up integration PR.
 */
import { rawQuery, rawExecute, withTransaction } from "../rawdb.js";
import { logger } from "../logger.js";
import type { LotStatus, QualityControlStatus } from "./types.js";
import {
  assertLotTransition,
  nextStatusAfterQc,
  shouldExpire,
} from "./lots-fsm.js";
import { todayISO } from "../businessHelpers.js";

interface LotRow {
  id: number;
  status: LotStatus;
  qualityControlStatus: QualityControlStatus;
  expiryDate: string | null;
  productId: number;
  warehouseId: number;
  companyId: number;
}

async function readLot(lotId: number, companyId: number): Promise<LotRow | null> {
  const rows = await rawQuery<LotRow>(
    `SELECT id, status, "qualityControlStatus", "expiryDate"::text AS "expiryDate",
            "productId", "warehouseId", "companyId"
     FROM warehouse_stock_lots
     WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL
     FOR UPDATE`,
    [lotId, companyId],
  );
  return rows.length ? rows[0] : null;
}

export interface ReceiveLotInput {
  companyId: number;
  productId: number;
  warehouseId: number;
  lotNumber: string;
  quantity: number;
  unitCost: number;
  currency?: string;
  receivedDate: string;
  expiryDate?: string;
  manufactureDate?: string;
  supplierId?: number;
  supplierLotRef?: string;
  /** When true, lot enters `quarantine` until a QC approval lands.
   *  Defaults to true for tenants that haven't yet configured the
   *  per-product QC flag — operators can pass false explicitly to
   *  bypass when receiving from a trusted supplier. */
  requiresQc?: boolean;
}

/**
 * Insert a new lot. Status starts as `quarantine` if `requiresQc`
 * is true (the default), otherwise `active`.
 */
export async function receiveLot(input: ReceiveLotInput): Promise<{ lotId: number }> {
  const requiresQc = input.requiresQc ?? true;
  const status: LotStatus = requiresQc ? "quarantine" : "active";
  const qcStatus: QualityControlStatus = requiresQc ? "pending" : "approved";

  const rows = await rawQuery<{ id: number }>(
    `INSERT INTO warehouse_stock_lots (
       "companyId", "productId", "warehouseId", "lotNumber",
       quantity, "originalQuantity", "unitCost", currency,
       "receivedDate", "expiryDate", "manufactureDate",
       "supplierId", "supplierLotRef",
       status, "qualityControlStatus"
     ) VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8::date,$9::date,$10::date,$11,$12,$13,$14)
     RETURNING id`,
    [
      input.companyId, input.productId, input.warehouseId, input.lotNumber,
      input.quantity, input.unitCost, input.currency ?? "SAR",
      input.receivedDate,
      input.expiryDate ?? null,
      input.manufactureDate ?? null,
      input.supplierId ?? null, input.supplierLotRef ?? null,
      status, qcStatus,
    ],
  );
  return { lotId: rows[0].id };
}

/**
 * Mark a quarantined lot as approved → active. Idempotent: calling
 * on an already-active lot is a no-op.
 */
export async function qcApprove(lotId: number, companyId: number, reviewerId?: number): Promise<void> {
  return withTransaction(async () => {
    const lot = await readLot(lotId, companyId);
    if (!lot) throw new Error(`QC approve: lot ${lotId} not found`);
    if (lot.status === "active" && lot.qualityControlStatus === "approved") return;

    const next = nextStatusAfterQc(lot.status, "approve");
    assertLotTransition(lot.status, next.status);

    await rawExecute(
      `UPDATE warehouse_stock_lots
         SET status = $1, "qualityControlStatus" = $2, "updatedAt" = NOW()
       WHERE id = $3 AND "companyId" = $4`,
      [next.status, next.qualityControlStatus, lotId, companyId],
    );
    logger.info({ lotId, by: reviewerId }, "[inventory.lots] QC approved");
  });
}

/**
 * Mark a quarantined lot as rejected → disposed. The lot is
 * physically reserved for return-to-supplier or disposal — the
 * inventory adjustment journal entry hooks into `gl/journal-poster`
 * in a future integration PR.
 */
export async function qcReject(
  lotId: number,
  companyId: number,
  reason: string,
  reviewerId?: number,
): Promise<void> {
  return withTransaction(async () => {
    const lot = await readLot(lotId, companyId);
    if (!lot) throw new Error(`QC reject: lot ${lotId} not found`);
    if (lot.status === "disposed") return;

    const next = nextStatusAfterQc(lot.status, "reject");
    assertLotTransition(lot.status, next.status);

    await rawExecute(
      `UPDATE warehouse_stock_lots
         SET status = $1, "qualityControlStatus" = $2,
             "recallReason" = $3, "updatedAt" = NOW()
       WHERE id = $4 AND "companyId" = $5`,
      [next.status, next.qualityControlStatus, reason.slice(0, 500), lotId, companyId],
    );
    logger.warn({ lotId, by: reviewerId, reason }, "[inventory.lots] QC rejected");
  });
}

/**
 * Initiate a recall on an active lot. Affected sales lines (linked
 * via `lotId`) are flagged in a follow-up — this function just
 * transitions the lot itself.
 */
export async function recallLot(opts: {
  lotId: number;
  companyId: number;
  recallId?: number;
  reason: string;
  recalledBy?: number;
}): Promise<void> {
  return withTransaction(async () => {
    const lot = await readLot(opts.lotId, opts.companyId);
    if (!lot) throw new Error(`Recall: lot ${opts.lotId} not found`);
    if (lot.status === "recalled") return;

    assertLotTransition(lot.status, "recalled");

    await rawExecute(
      `UPDATE warehouse_stock_lots
         SET status = 'recalled', "recallId" = $1, "recalledAt" = NOW(),
             "recalledBy" = $2, "recallReason" = $3, "updatedAt" = NOW()
       WHERE id = $4 AND "companyId" = $5`,
      [opts.recallId ?? null, opts.recalledBy ?? null, opts.reason.slice(0, 1000), opts.lotId, opts.companyId],
    );
    logger.warn({ lotId: opts.lotId, recallId: opts.recallId }, "[inventory.lots] recalled");
  });
}

export interface ExpireScanOutcome {
  scanned: number;
  expired: number;
  errors: string[];
}

/**
 * Scan every active/quarantined lot whose expiry has passed and
 * transition them to `expired`. Idempotent: lots already in
 * `expired` or beyond are skipped.
 *
 * Returns a structured summary suitable for cron_logs.
 */
export async function expireDueLots(asOfDate?: string): Promise<ExpireScanOutcome> {
  const today = asOfDate ?? todayISO();
  const out: ExpireScanOutcome = { scanned: 0, expired: 0, errors: [] };

  const due = await rawQuery<{ id: number; status: LotStatus; companyId: number; expiryDate: string }>(
    `SELECT id, status, "companyId", "expiryDate"::text AS "expiryDate"
     FROM warehouse_stock_lots
     WHERE status IN ('active','quarantine')
       AND "expiryDate" IS NOT NULL
       AND "expiryDate" <= $1::date
       AND "deletedAt" IS NULL`,
    [today],
  );
  out.scanned = due.length;

  for (const lot of due) {
    if (!shouldExpire({ status: lot.status, expiryDate: lot.expiryDate, asOfDate: today })) {
      continue;
    }
    try {
      assertLotTransition(lot.status, "expired");
      await rawExecute(
        `UPDATE warehouse_stock_lots
           SET status = 'expired', "updatedAt" = NOW()
         WHERE id = $1 AND status = $2`,
        [lot.id, lot.status],
      );
      out.expired += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      out.errors.push(`lot#${lot.id}: ${msg}`);
    }
  }

  return out;
}

/** Cron-compatible wrapper: returns one-line summary string. */
export async function lotExpiryScanCron(): Promise<string> {
  const out = await expireDueLots();
  if (out.scanned === 0) return "no due lots";
  return `scanned=${out.scanned} expired=${out.expired} errors=${out.errors.length}`;
}
