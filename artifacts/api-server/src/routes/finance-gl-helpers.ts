/**
 * Operator-facing endpoints that drive the 5 deferred GL-integration
 * helpers (#253, #256, #258, #261, #262):
 *
 *   POST /finance/gl-helpers/fx-revaluation/:revaluationLogId
 *   POST /finance/gl-helpers/realized-fx/:invoiceId
 *   POST /finance/gl-helpers/cycle-count/:cycleCountId
 *   POST /finance/gl-helpers/lot-writeoff/:lotId
 *   POST /finance/gl-helpers/mudad-salary/:settlementId
 *
 * Each endpoint:
 *   - authorizes via `finance.journal` (same gate as manual journal
 *     entries — operator must have permission to touch the GL),
 *   - reads `companyId` from `req.scope` (cross-tenant safe),
 *   - accepts `{ asDraft?: boolean, description?: string }` in the
 *     body so operators can route through review before the entry
 *     goes live,
 *   - returns the helper's structured outcome
 *     (`posted | draft | skipped | noop`) — UI shows the operator
 *     exactly what happened,
 *   - logs an audit row + emits an event for observability.
 *
 * The helpers themselves stay agnostic of HTTP — this file is the
 * thin transport layer. No DB logic here.
 */
import { Router } from "express";
import { z } from "zod";

import {
  handleRouteError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { rawQuery } from "../lib/rawdb.js";

import { postFxRevaluationJournal } from "../lib/fx/post-revaluation-journal.js";
import { postRealizedFxJournal } from "../lib/fx/post-realized-journal.js";
import { postCycleCountVarianceJournal } from "../lib/inventory/post-cycle-count-journal.js";
import { postLotWriteoffJournal } from "../lib/inventory/post-lot-writeoff-journal.js";
import { postMudadSalaryJournal } from "../lib/saudi-compliance/mudad/post-salary-journal.js";

export const glHelpersRouter = Router();
glHelpersRouter.use(authMiddleware);

// ─────────────────────────────────────────────────────────────────────
// Shared request body schema
// ─────────────────────────────────────────────────────────────────────

const baseBody = z.object({
  asDraft: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

const realizedFxBody = baseBody.extend({
  settlementRate: z.number().positive().finite(),
  paymentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "paymentDate must be YYYY-MM-DD"),
});

// Audit + event helper so the 5 endpoints stay DRY.
function recordSideEffects(opts: {
  scope: { companyId: number; branchId: number | null; userId: number };
  action: string;
  entity: string;
  entityId: number;
  outcome: { status: string; journalEntryId: number | null };
}) {
  createAuditLog({
    companyId: opts.scope.companyId,
    branchId: opts.scope.branchId ?? undefined,
    userId: opts.scope.userId,
    action: opts.action,
    entity: opts.entity,
    entityId: opts.entityId,
    after: { status: opts.outcome.status, journalEntryId: opts.outcome.journalEntryId },
  }).catch((e) => logger.error(e, "[gl-helpers] createAuditLog failed"));
  emitEvent({
    companyId: opts.scope.companyId,
    userId: opts.scope.userId,
    action: opts.action,
    entity: opts.entity,
    entityId: opts.entityId,
    details: JSON.stringify(opts.outcome),
  }).catch((e) => logger.error(e, "[gl-helpers] emitEvent failed"));
}

// ─────────────────────────────────────────────────────────────────────
// 0) Pending queues — list source rows that need GL posting. Operators
//    use these to decide what to post next from the dashboard.
// ─────────────────────────────────────────────────────────────────────

/** Acknowledged Mudad salary settlements with no journal entry yet. */
glHelpersRouter.get(
  "/gl-helpers/mudad-salary/pending",
  authorize({ feature: "finance.journal", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery<{
        id: number;
        employeeId: number;
        period: string | null;
        amount: string | null;
        status: string;
        submittedAt: string;
        acknowledgedAt: string | null;
      }>(
        `SELECT id, "employeeId", period,
                amount::text         AS amount,
                status,
                "submittedAt"::text   AS "submittedAt",
                "acknowledgedAt"::text AS "acknowledgedAt"
         FROM mudad_settlements
         WHERE "companyId" = $1
           AND type = 'salary'
           AND status = 'acknowledged'
           AND "journalEntryId" IS NULL
         ORDER BY "acknowledgedAt" DESC NULLS LAST, id DESC
         LIMIT 200`,
        [scope.companyId],
      );
      res.json({ data: rows });
    } catch (err) {
      handleRouteError(err, res, "[gl-helpers] mudad-salary pending list error:");
    }
  },
);

/** Lots in recalled / expired / disposed status with no write-off entry. */
glHelpersRouter.get(
  "/gl-helpers/lot-writeoff/pending",
  authorize({ feature: "finance.journal", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery<{
        id: number;
        productId: number;
        warehouseId: number;
        lotNumber: string;
        quantity: string;
        unitCost: string;
        status: string;
        recalledAt: string | null;
        expiryDate: string | null;
      }>(
        `SELECT id, "productId", "warehouseId", "lotNumber",
                quantity::text  AS quantity,
                "unitCost"::text AS "unitCost",
                status,
                "recalledAt"::text AS "recalledAt",
                "expiryDate"::text AS "expiryDate"
         FROM warehouse_stock_lots
         WHERE "companyId" = $1
           AND status IN ('recalled', 'expired', 'disposed')
           AND "writeoffJournalEntryId" IS NULL
           AND "deletedAt" IS NULL
         ORDER BY COALESCE("recalledAt", "updatedAt") DESC
         LIMIT 200`,
        [scope.companyId],
      );
      res.json({ data: rows });
    } catch (err) {
      handleRouteError(err, res, "[gl-helpers] lot-writeoff pending list error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────
// 1) FX revaluation — wire fx_revaluation_log → journal entry
// ─────────────────────────────────────────────────────────────────────
glHelpersRouter.post(
  "/gl-helpers/fx-revaluation/:revaluationLogId",
  authorize({ feature: "finance.journal", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const revaluationLogId = parseId(req.params.revaluationLogId, "revaluationLogId");
      const body = zodParse(baseBody.safeParse(req.body ?? {}));

      const outcome = await postFxRevaluationJournal({
        revaluationLogId,
        companyId: scope.companyId,
        postedBy: scope.userId,
        asDraft: body.asDraft,
        description: body.description,
      });

      recordSideEffects({
        scope,
        action: "fx.revaluation.posted",
        entity: "fx_revaluation_log",
        entityId: revaluationLogId,
        outcome,
      });
      res.json({ data: outcome });
    } catch (err) {
      handleRouteError(err, res, "[gl-helpers] fx-revaluation error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────
// 2) Realised FX — wire invoice settlement → journal entry
// ─────────────────────────────────────────────────────────────────────
glHelpersRouter.post(
  "/gl-helpers/realized-fx/:invoiceId",
  authorize({ feature: "finance.journal", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const invoiceId = parseId(req.params.invoiceId, "invoiceId");
      const body = zodParse(realizedFxBody.safeParse(req.body ?? {}));

      const outcome = await postRealizedFxJournal({
        invoiceId,
        companyId: scope.companyId,
        postedBy: scope.userId,
        settlementRate: body.settlementRate,
        paymentDate: body.paymentDate,
        asDraft: body.asDraft,
        description: body.description,
      });

      recordSideEffects({
        scope,
        action: "fx.realized.posted",
        entity: "invoices",
        entityId: invoiceId,
        outcome,
      });
      res.json({ data: outcome });
    } catch (err) {
      handleRouteError(err, res, "[gl-helpers] realized-fx error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────
// 3) Cycle-count variance — wire approved run → journal entry
// ─────────────────────────────────────────────────────────────────────
glHelpersRouter.post(
  "/gl-helpers/cycle-count/:cycleCountId",
  authorize({ feature: "finance.journal", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const cycleCountId = parseId(req.params.cycleCountId, "cycleCountId");
      const body = zodParse(baseBody.safeParse(req.body ?? {}));

      const outcome = await postCycleCountVarianceJournal({
        cycleCountId,
        companyId: scope.companyId,
        postedBy: scope.userId,
        asDraft: body.asDraft,
        description: body.description,
      });

      recordSideEffects({
        scope,
        action: "inventory.cycle_count.posted",
        entity: "warehouse_cycle_counts",
        entityId: cycleCountId,
        outcome,
      });
      res.json({ data: outcome });
    } catch (err) {
      handleRouteError(err, res, "[gl-helpers] cycle-count error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────
// 4) Lot write-off — wire recalled/expired/disposed lot → journal entry
// ─────────────────────────────────────────────────────────────────────
glHelpersRouter.post(
  "/gl-helpers/lot-writeoff/:lotId",
  authorize({ feature: "finance.journal", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const lotId = parseId(req.params.lotId, "lotId");
      const body = zodParse(baseBody.safeParse(req.body ?? {}));

      const outcome = await postLotWriteoffJournal({
        lotId,
        companyId: scope.companyId,
        postedBy: scope.userId,
        asDraft: body.asDraft,
        description: body.description,
      });

      recordSideEffects({
        scope,
        action: "inventory.lot_writeoff.posted",
        entity: "warehouse_stock_lots",
        entityId: lotId,
        outcome,
      });
      res.json({ data: outcome });
    } catch (err) {
      handleRouteError(err, res, "[gl-helpers] lot-writeoff error:");
    }
  },
);

// ─────────────────────────────────────────────────────────────────────
// 5) Mudad salary booking — wire acknowledged settlement → journal entry
// ─────────────────────────────────────────────────────────────────────
glHelpersRouter.post(
  "/gl-helpers/mudad-salary/:settlementId",
  authorize({ feature: "finance.journal", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const settlementId = parseId(req.params.settlementId, "settlementId");
      const body = zodParse(baseBody.safeParse(req.body ?? {}));

      const outcome = await postMudadSalaryJournal({
        settlementId,
        companyId: scope.companyId,
        postedBy: scope.userId,
        asDraft: body.asDraft,
        description: body.description,
      });

      recordSideEffects({
        scope,
        action: "mudad.salary.posted",
        entity: "mudad_settlements",
        entityId: settlementId,
        outcome,
      });
      res.json({ data: outcome });
    } catch (err) {
      handleRouteError(err, res, "[gl-helpers] mudad-salary error:");
    }
  },
);
