/**
 * FIN-TIME-SPREADING (#2247) — prepaid-amortization API.
 *
 * Schedules that spread a prepaid asset balance (insurance / rent / license /
 * subscription paid up front) into systematic monthly expense. Endpoints:
 *   GET  /finance/amortization/schedules        — list (company-scoped)
 *   POST /finance/amortization/schedules        — create a schedule
 *   POST /finance/amortization/run              — post all due months as of today
 *
 * The expense side is stored as a TEXT `expenseAccountPurpose` — never a final
 * GL code; financialEngine resolves it at posting time. The prepaid (asset)
 * side IS a stored code and is validated postable on create. No backfill of
 * past periods on create (recognition is driven by the run endpoint / cron).
 * Every query is company-scoped (tenant isolation).
 *
 * Mounted under /finance (see routes/index.ts).
 */
import { Router } from "express";
import { z } from "zod";
import {
  handleRouteError, ValidationError, parseId, zodParse,
} from "../lib/errorHandler.js";
import { rawQuery, assertInsert } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { assertPostableAccount, auditFromRequest, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import {
  computeMonthlySchedule,
  runDueAmortizations,
} from "../lib/engines/prepaidAmortizationEngine.js";

export const financeAmortizationRouter = Router();

// ── List ─────────────────────────────────────────────────────────────────────
financeAmortizationRouter.get(
  "/amortization/schedules",
  authorize({ feature: "finance.journal", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT id, "branchId", "sourceType", "sourceId", "prepaidAccountCode",
                "expenseAccountPurpose", "totalAmount", "startDate", "endDate",
                "months", "monthlyAmount", "recognizedAmount", status,
                "vehicleId", "propertyId", "employeeId", "projectId", "costCenterId",
                "currency", "createdAt"
           FROM prepaid_amortization_schedules
          WHERE "companyId"=$1 AND "deletedAt" IS NULL
          ORDER BY id DESC`,
        [scope.companyId],
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) { handleRouteError(err, res, "Amortization list error:"); }
  },
);

// ── Create ───────────────────────────────────────────────────────────────────
const createScheduleSchema = z.object({
  sourceType: z.enum(["insurance", "rent", "license", "subscription", "manual"]).optional(),
  sourceId: z.coerce.number().int().positive().optional(),
  prepaidAccountCode: z.string().min(1),
  expenseAccountPurpose: z.string().min(1),
  totalAmount: z.coerce.number().positive(),
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  branchId: z.coerce.number().int().positive().optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  propertyId: z.coerce.number().int().positive().optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  costCenterId: z.coerce.number().int().positive().optional(),
  currency: z.string().optional(),
}).strict();

financeAmortizationRouter.post(
  "/amortization/schedules",
  authorize({ feature: "finance.journal", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createScheduleSchema.safeParse(req.body));

      // prepaid (asset) side must be a real postable account.
      await assertPostableAccount(scope.companyId, b.prepaidAccountCode, {
        field: "prepaidAccountCode",
        side: "credit",
      });

      const { months, monthlyAmount } = computeMonthlySchedule({
        totalAmount: b.totalAmount,
        startDate: b.startDate,
        endDate: b.endDate,
      });
      if (months <= 0) {
        throw new ValidationError("عدد أشهر الإطفاء يجب أن يكون أكبر من صفر", {
          field: "endDate",
          fix: "تأكد أن تاريخ النهاية بعد تاريخ البداية",
        });
      }

      const [row] = await rawQuery<{ id: number }>(
        `INSERT INTO prepaid_amortization_schedules
           ("companyId","branchId","sourceType","sourceId","prepaidAccountCode",
            "expenseAccountPurpose","totalAmount","startDate","endDate","months",
            "monthlyAmount","recognizedAmount",status,
            "vehicleId","propertyId","employeeId","projectId","costCenterId","currency")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,0,'active',$12,$13,$14,$15,$16,$17)
         RETURNING id`,
        [
          scope.companyId, b.branchId ?? scope.branchId ?? null, b.sourceType ?? "manual",
          b.sourceId ?? null, b.prepaidAccountCode, b.expenseAccountPurpose, b.totalAmount,
          b.startDate, b.endDate, months, monthlyAmount,
          b.vehicleId ?? null, b.propertyId ?? null, b.employeeId ?? null,
          b.projectId ?? null, b.costCenterId ?? null, b.currency ?? "SAR",
        ],
      );
      assertInsert(row?.id, "prepaid_amortization_schedules");
      auditFromRequest(req, "finance.amortization.scheduled", "prepaid_amortization_schedules", row.id, {
        after: { totalAmount: b.totalAmount, months, monthlyAmount, prepaidAccountCode: b.prepaidAccountCode },
      });
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "finance.amortization.scheduled", entity: "prepaid_amortization_schedules", entityId: row.id,
        totalAmount: b.totalAmount, months,
        details: JSON.stringify({ totalAmount: b.totalAmount, months, monthlyAmount }),
      }).catch((e) => logger.error(e, "finance-amortization background task failed"));
      res.status(201).json({ id: row.id, months, monthlyAmount });
    } catch (err) { handleRouteError(err, res, "Amortization create error:"); }
  },
);

// ── Run due amortizations (as of today) ───────────────────────────────────────
const runSchema = z.object({
  scheduleId: z.coerce.number().int().positive().optional(),
}).strict();

financeAmortizationRouter.post(
  "/amortization/run",
  authorize({ feature: "finance.journal", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(runSchema.safeParse(req.body ?? {}));
      const result = await runDueAmortizations({
        companyId: scope.companyId,
        createdBy: scope.activeAssignmentId ?? 0,
        scheduleId: b.scheduleId,
      });
      auditFromRequest(req, "finance.amortization.recognized", "prepaid_amortization_schedules", b.scheduleId ?? 0, {
        after: result,
      });
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "finance.amortization.recognized", entity: "prepaid_amortization_schedules", entityId: b.scheduleId ?? 0,
        posted: result.posted, schedulesProcessed: result.schedulesProcessed,
        details: JSON.stringify(result),
      }).catch((e) => logger.error(e, "finance-amortization background task failed"));
      res.json({ data: result });
    } catch (err) { handleRouteError(err, res, "Amortization run error:"); }
  },
);
