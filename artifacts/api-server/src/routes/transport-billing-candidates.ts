/**
 * Accountant-facing routes for the transport-billing handoff (#1733).
 *
 *   GET    /finance/transport-billing-candidates           — queue (filter by status)
 *   GET    /finance/transport-billing-candidates/:id       — single row
 *   POST   /finance/transport-billing-candidates/:id/materialize — post the JE
 *   POST   /finance/transport-billing-candidates/:id/reject      — reject with reason
 *
 * The contract with the transport module: transport ONLY inserts a row
 * (see fleetEngine.createCargoBillingCandidate). Materialising it into a
 * journal entry is an accountant action and lives here. This is the
 * concrete enforcement of "transport drives operations, accountant
 * touches money" — transport never carries the GL-posting capability.
 */

import { Router } from "express";
import { z } from "zod";

import {
  handleRouteError,
  ValidationError,
  NotFoundError,
  ConflictError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { createAuditLog, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { rawQuery, rawExecute, withTransaction } from "../lib/rawdb.js";
import { fleetEngine } from "../lib/engines/fleetEngine.js";

export const transportBillingCandidatesRouter = Router();
transportBillingCandidatesRouter.use(authMiddleware);

const STATUS_VALUES = ["pending", "materialized", "rejected"] as const;
type CandidateStatus = (typeof STATUS_VALUES)[number];

const listQuerySchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const rejectSchema = z.object({
  reason: z.string().min(1, "سبب الرفض مطلوب").max(500),
});

const materializeSchema = z.object({
  // Accountant may override transport's suggested numbers — the operator's
  // freightRevenue / freightCost are just defaults.
  freightRevenue: z.number().nonnegative().optional(),
  freightCost: z.number().nonnegative().optional(),
  // البند ٤ شريحة ٢ — مَن يتحمّل صيانة المركبة (مبدأ إبراهيم ١). المحاسب يقرّره عند
  // المادْيَلة (المالية هي السلطة على المال — حدّ TA-T18). الغياب ⇒ company (شركة).
  // النوع canonical يطابق مخطّط تقييم الحادث في fleet.ts.
  costBearer: z.enum(["company", "driver", "insurance", "warranty", "customer", "tenant", "third_party"]).optional(),
});

// ─── GET /transport-billing-candidates ─────────────────────────────────
transportBillingCandidatesRouter.get(
  "/transport-billing-candidates",
  authorize({ feature: "finance.transport_billing", action: "list" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const q = zodParse(listQuerySchema.safeParse(req.query));
      const params: unknown[] = [scope.companyId];
      let where = `c."companyId" = $1`;
      if (q.status) { params.push(q.status); where += ` AND c.status = $${params.length}`; }
      if (q.customerId) { params.push(q.customerId); where += ` AND c."customerId" = $${params.length}`; }
      if (q.vehicleId) { params.push(q.vehicleId); where += ` AND c."vehicleId" = $${params.length}`; }
      const limit = q.limit ?? 200;
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT c.id, c."sourceType", c."sourceId", c."sourceRef",
                c."customerId", cl.name AS "customerName",
                c."serviceType", c."serviceDate",
                c."routeFrom", c."routeTo",
                c."vehicleId", v."plateNumber" AS "vehiclePlate",
                c."driverId", d.name AS "driverName",
                c.quantity, c."unitOfMeasure",
                c."operationalStatus",
                c."suggestedRevenue", c."suggestedCost", c."costBearer",
                c.status, c."materializedJournalEntryId", c."materializedAt",
                c."rejectionReason", c."rejectedAt",
                c."createdAt"
           FROM transport_billing_candidates c
           LEFT JOIN clients cl ON cl.id = c."customerId" AND cl."companyId" = c."companyId"
           LEFT JOIN fleet_vehicles v ON v.id = c."vehicleId" AND v."companyId" = c."companyId"
           LEFT JOIN fleet_drivers d ON d.id = c."driverId" AND d."companyId" = c."companyId"
          WHERE ${where}
          ORDER BY c."createdAt" DESC
          LIMIT ${limit}`,
        params,
      );
      res.json(maskFields(req, { data: rows, total: rows.length }));
    } catch (err) {
      handleRouteError(err, res, "List transport billing candidates error:");
    }
  },
);

// ─── GET /transport-billing-candidates/:id ─────────────────────────────
transportBillingCandidatesRouter.get(
  "/transport-billing-candidates/:id",
  authorize({ feature: "finance.transport_billing", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const [row] = await rawQuery<Record<string, unknown>>(
        `SELECT c.*, cl.name AS "customerName",
                v."plateNumber" AS "vehiclePlate", d.name AS "driverName"
           FROM transport_billing_candidates c
           LEFT JOIN clients cl ON cl.id = c."customerId" AND cl."companyId" = c."companyId"
           LEFT JOIN fleet_vehicles v ON v.id = c."vehicleId" AND v."companyId" = c."companyId"
           LEFT JOIN fleet_drivers d ON d.id = c."driverId" AND d."companyId" = c."companyId"
          WHERE c.id = $1 AND c."companyId" = $2`,
        [id, scope.companyId],
      );
      if (!row) throw new NotFoundError("الترشيح غير موجود");
      res.json(maskFields(req, { data: row }));
    } catch (err) {
      handleRouteError(err, res, "Get transport billing candidate error:");
    }
  },
);

// ─── POST /transport-billing-candidates/:id/materialize ───────────────
// Calls fleetEngine.postCargoDeliveryGL inside a transaction, then marks
// the candidate `materialized` with the resulting journalEntryId. Idempotent:
// re-materialising a row in `materialized` state is rejected. The
// financialEngine guard (`cargo_manifests`, `id`) is the safety net if a
// concurrent click squeaks through before the row status flips.
transportBillingCandidatesRouter.post(
  "/transport-billing-candidates/:id/materialize",
  authorize({ feature: "finance.transport_billing", action: "approve" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const overrides = zodParse(materializeSchema.safeParse(req.body ?? {}));

      const result = await withTransaction(async (tx) => {
        const lockRes = await tx.query<{
          id: number;
          companyId: number;
          branchId: number | null;
          sourceType: string;
          sourceId: number;
          sourceRef: string | null;
          customerId: number | null;
          vehicleId: number | null;
          driverId: number | null;
          suggestedRevenue: string | null;
          suggestedCost: string | null;
          costBearer: string | null;
          status: CandidateStatus;
        }>(
          `SELECT id, "companyId", "branchId",
                  "sourceType", "sourceId", "sourceRef",
                  "customerId", "vehicleId", "driverId",
                  "suggestedRevenue", "suggestedCost", "costBearer", status
             FROM transport_billing_candidates
            WHERE id = $1 AND "companyId" = $2
            FOR UPDATE`,
          [id, scope.companyId],
        );
        const candidate = lockRes.rows[0];
        if (!candidate) throw new NotFoundError("الترشيح غير موجود");
        if (candidate.status !== "pending") {
          throw new ConflictError(
            candidate.status === "materialized"
              ? "تم ترحيل هذا الترشيح مسبقاً"
              : "هذا الترشيح مرفوض ولا يمكن ترحيله",
          );
        }
        const SUPPORTED_SOURCE_TYPES = ["cargo_manifest", "maintenance", "fuel", "insurance"];
        if (!SUPPORTED_SOURCE_TYPES.includes(candidate.sourceType)) {
          throw new ValidationError(
            `نوع المصدر ${candidate.sourceType} غير مدعوم بعد للترحيل التلقائي`,
          );
        }

        const revenue = overrides.freightRevenue ?? Number(candidate.suggestedRevenue ?? 0) ?? 0;
        const cost = overrides.freightCost ?? Number(candidate.suggestedCost ?? 0) ?? 0;

        const glCtx = {
          companyId: scope.companyId,
          branchId: scope.branchId ?? candidate.branchId ?? 0,
          createdBy: scope.userId,
        };
        // #TA-T18 finance-boundary — the accountant materialises the
        // expense/billing candidate; THIS is where transport GL is posted
        // (never at the operational create/complete step). Each fleet
        // expense type maps to its own ledger posting.
        let journal: unknown;
        if (candidate.sourceType === "maintenance") {
          journal = await fleetEngine.postMaintenanceGL(glCtx, {
            id: candidate.sourceId, vehicleId: candidate.vehicleId ?? 0,
            totalCost: cost, description: candidate.sourceRef ?? undefined,
            costBearer: overrides.costBearer ?? candidate.costBearer ?? undefined, // ج-٥: تجاوز المحاسب ثم اختيار المُكمِل ثم الافتراض
          });
        } else if (candidate.sourceType === "fuel") {
          journal = await fleetEngine.postFuelExpenseGL(glCtx, {
            id: candidate.sourceId, vehicleId: candidate.vehicleId ?? 0,
            amount: cost, description: candidate.sourceRef ?? undefined,
          });
        } else if (candidate.sourceType === "insurance") {
          journal = await fleetEngine.postInsuranceGL(glCtx, {
            id: candidate.sourceId, vehicleId: candidate.vehicleId ?? 0,
            premium: cost, description: candidate.sourceRef ?? undefined,
          });
        } else {
          journal = await fleetEngine.postCargoDeliveryGL(glCtx, {
            id: candidate.sourceId,
            manifestNumber: candidate.sourceRef ?? String(candidate.sourceId),
            freightRevenue: revenue,
            freightCost: cost,
            customerId: candidate.customerId,
            vehicleId: candidate.vehicleId,
            driverId: candidate.driverId,
          });
        }
        const journalEntryId = (journal as { journalId?: number } | null)?.journalId ?? null;

        await tx.query(
          `UPDATE transport_billing_candidates
              SET status = 'materialized',
                  "materializedJournalEntryId" = $1,
                  "materializedBy" = $2,
                  "materializedAt" = NOW(),
                  "updatedAt" = NOW()
            WHERE id = $3 AND "companyId" = $4`,
          [journalEntryId, scope.userId, id, scope.companyId],
        );

        // #1733 Foundation — close the operational loop:
        //   • cargo_manifest: ready_for_invoice → financially_closed
        //     (terminal post-invoice state).
        //   • cargo_manifests.billingStatus: → invoiced.
        //   • transport_service_lines.billingStatus: → invoiced (so the
        //     accountant queue stops showing it).
        if (candidate.sourceType === "cargo_manifest") {
          await tx.query(
            `UPDATE cargo_manifests
                SET status = 'financially_closed',
                    "billingStatus" = 'invoiced',
                    "updatedAt" = NOW()
              WHERE id = $1 AND "companyId" = $2 AND status = 'ready_for_invoice'`,
            [candidate.sourceId, scope.companyId],
          );
          await tx.query(
            `UPDATE transport_service_lines
                SET "billingStatus" = 'invoiced',
                    "invoiceId" = COALESCE("invoiceId", $1),
                    "updatedAt" = NOW()
              WHERE "companyId" = $2
                AND "sourceType" = 'cargo_manifest'
                AND "sourceId" = $3`,
            [journalEntryId, scope.companyId, candidate.sourceId],
          );
        }

        return { journalEntryId };
      });

      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId ?? undefined,
        userId: scope.userId,
        action: "approve",
        entity: "transport_billing_candidates",
        entityId: id,
        after: { journalEntryId: result.journalEntryId },
      }).catch((e) => logger.error(e, "billing candidate audit failed"));
      emitEvent({
        companyId: scope.companyId,
        branchId: scope.branchId ?? null,
        userId: scope.userId,
        action: "finance.transport_billing.materialized",
        entity: "transport_billing_candidates",
        entityId: id,
        details: JSON.stringify({ journalEntryId: result.journalEntryId }),
      }).catch((e) => logger.error(e, "billing candidate event failed"));

      res.json({ ok: true, journalEntryId: result.journalEntryId });
    } catch (err) {
      handleRouteError(err, res, "Materialize transport billing candidate error:");
    }
  },
);

// ─── POST /transport-billing-candidates/:id/reject ────────────────────
transportBillingCandidatesRouter.post(
  "/transport-billing-candidates/:id/reject",
  authorize({ feature: "finance.transport_billing", action: "reject" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const id = parseId(req.params.id, "id");
      const { reason } = zodParse(rejectSchema.safeParse(req.body));
      const { affectedRows } = await rawExecute(
        `UPDATE transport_billing_candidates
            SET status = 'rejected',
                "rejectedBy" = $1,
                "rejectedAt" = NOW(),
                "rejectionReason" = $2,
                "updatedAt" = NOW()
          WHERE id = $3 AND "companyId" = $4 AND status = 'pending'`,
        [scope.userId, reason, id, scope.companyId],
      );
      if (affectedRows === 0) {
        // Either the row doesn't exist, belongs to another tenant, or
        // is already materialized/rejected. Disambiguate with a follow-up
        // read so the error message is precise.
        const [exists] = await rawQuery<{ status: CandidateStatus }>(
          `SELECT status FROM transport_billing_candidates
            WHERE id = $1 AND "companyId" = $2`,
          [id, scope.companyId],
        );
        if (!exists) throw new NotFoundError("الترشيح غير موجود");
        throw new ConflictError(
          exists.status === "materialized"
            ? "تم ترحيل هذا الترشيح ولا يمكن رفضه"
            : "تم رفض هذا الترشيح مسبقاً",
        );
      }
      createAuditLog({
        companyId: scope.companyId,
        branchId: scope.branchId ?? undefined,
        userId: scope.userId,
        action: "reject",
        entity: "transport_billing_candidates",
        entityId: id,
        after: { reason },
      }).catch((e) => logger.error(e, "billing candidate audit failed"));
      res.json({ ok: true });
    } catch (err) {
      handleRouteError(err, res, "Reject transport billing candidate error:");
    }
  },
);

export default transportBillingCandidatesRouter;
