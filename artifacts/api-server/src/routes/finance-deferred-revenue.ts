/**
 * FIN-DEFERRED-REVENUE (#2248) — deferred-revenue recognition API.
 *
 * The SYMMETRIC counterpart of the prepaid-amortization API (#2247). Schedules
 * that spread a deferred-revenue LIABILITY balance (cash received up front for
 * rent / umrah / service not yet earned) into systematic monthly REVENUE.
 * Endpoints:
 *   GET  /finance/deferred-revenue/schedules    — list (company-scoped)
 *   POST /finance/deferred-revenue/schedules    — create a schedule
 *   POST /finance/deferred-revenue/run          — post all due months as of today
 *
 * The revenue side is stored as a TEXT `revenueAccountPurpose` — never a final
 * GL code; financialEngine resolves it at posting time. The deferred-revenue
 * (liability) side IS a stored code and is validated postable on create. No
 * backfill of past periods on create (recognition is driven by the run
 * endpoint / cron). Every query is company-scoped (tenant isolation).
 *
 * Mounted under /finance (see routes/index.ts).
 */
import { Router } from "express";
import { z } from "zod";
import {
  handleRouteError, ValidationError, zodParse,
} from "../lib/errorHandler.js";
import { rawQuery, assertInsert } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import { assertPostableAccount } from "../lib/businessHelpers.js";
import {
  computeRecognitionSchedule,
  runDueRecognitions,
} from "../lib/engines/deferredRevenueEngine.js";

export const financeDeferredRevenueRouter = Router();

// ── List ─────────────────────────────────────────────────────────────────────
financeDeferredRevenueRouter.get(
  "/deferred-revenue/schedules",
  authorize({ feature: "finance.journal", action: "view" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const rows = await rawQuery<Record<string, unknown>>(
        `SELECT id, "branchId", "sourceType", "sourceId", "deferredRevenueAccountCode",
                "revenueAccountPurpose", "totalAmount", "startDate", "endDate",
                "recognitionMethod", "months", "monthlyAmount", "recognizedAmount",
                "remainingAmount", status,
                "propertyId", "unitId", "contractId",
                "umrahSeasonId", "umrahAgentId", "clientId", "costCenterId",
                "currency", "createdAt"
           FROM deferred_revenue_schedules
          WHERE "companyId"=$1 AND "deletedAt" IS NULL
          ORDER BY id DESC`,
        [scope.companyId],
      );
      res.json(maskFields(req, { data: rows }));
    } catch (err) { handleRouteError(err, res, "Deferred revenue list error:"); }
  },
);

// ── Create ───────────────────────────────────────────────────────────────────
const createScheduleSchema = z.object({
  sourceType: z.enum(["rent", "umrah", "service", "manual"]).optional(),
  sourceId: z.coerce.number().int().positive().optional(),
  deferredRevenueAccountCode: z.string().min(1),
  revenueAccountPurpose: z.string().min(1),
  totalAmount: z.coerce.number().positive(),
  startDate: z.string().min(8),
  endDate: z.string().min(8),
  recognitionMethod: z.enum(["straight_line"]).optional(),
  branchId: z.coerce.number().int().positive().optional(),
  propertyId: z.coerce.number().int().positive().optional(),
  unitId: z.coerce.number().int().positive().optional(),
  contractId: z.coerce.number().int().positive().optional(),
  umrahSeasonId: z.coerce.number().int().positive().optional(),
  umrahAgentId: z.coerce.number().int().positive().optional(),
  clientId: z.coerce.number().int().positive().optional(),
  costCenterId: z.coerce.number().int().positive().optional(),
  currency: z.string().optional(),
}).strict();

financeDeferredRevenueRouter.post(
  "/deferred-revenue/schedules",
  authorize({ feature: "finance.journal", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(createScheduleSchema.safeParse(req.body));

      // deferred-revenue (liability) side must be a real postable account.
      await assertPostableAccount(scope.companyId, b.deferredRevenueAccountCode, {
        field: "deferredRevenueAccountCode",
        side: "debit",
      });

      const { months, monthlyAmount } = computeRecognitionSchedule({
        totalAmount: b.totalAmount,
        startDate: b.startDate,
        endDate: b.endDate,
      });
      if (months <= 0) {
        throw new ValidationError("عدد أشهر تحقّق الإيراد يجب أن يكون أكبر من صفر", {
          field: "endDate",
          fix: "تأكد أن تاريخ النهاية بعد تاريخ البداية",
        });
      }

      const remainingAmount = b.totalAmount;
      const [row] = await rawQuery<{ id: number }>(
        `INSERT INTO deferred_revenue_schedules
           ("companyId","branchId","sourceType","sourceId","deferredRevenueAccountCode",
            "revenueAccountPurpose","totalAmount","startDate","endDate","recognitionMethod",
            "months","monthlyAmount","recognizedAmount","remainingAmount",status,
            "propertyId","unitId","contractId","umrahSeasonId","umrahAgentId","clientId",
            "costCenterId","currency")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,'active',
                 $14,$15,$16,$17,$18,$19,$20,$21)
         RETURNING id`,
        [
          scope.companyId, b.branchId ?? scope.branchId ?? null, b.sourceType ?? "manual",
          b.sourceId ?? null, b.deferredRevenueAccountCode, b.revenueAccountPurpose,
          b.totalAmount, b.startDate, b.endDate, b.recognitionMethod ?? "straight_line",
          months, monthlyAmount, remainingAmount,
          b.propertyId ?? null, b.unitId ?? null, b.contractId ?? null,
          b.umrahSeasonId ?? null, b.umrahAgentId ?? null, b.clientId ?? null,
          b.costCenterId ?? null, b.currency ?? "SAR",
        ],
      );
      assertInsert(row?.id, "deferred_revenue_schedules");
      res.status(201).json({ id: row.id, months, monthlyAmount });
    } catch (err) { handleRouteError(err, res, "Deferred revenue create error:"); }
  },
);

// ── Run due recognitions (as of today) ────────────────────────────────────────
const runSchema = z.object({
  scheduleId: z.coerce.number().int().positive().optional(),
}).strict();

financeDeferredRevenueRouter.post(
  "/deferred-revenue/run",
  authorize({ feature: "finance.journal", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(runSchema.safeParse(req.body ?? {}));
      const result = await runDueRecognitions({
        companyId: scope.companyId,
        createdBy: scope.activeAssignmentId ?? 0,
        scheduleId: b.scheduleId,
      });
      res.json({ data: result });
    } catch (err) { handleRouteError(err, res, "Deferred revenue run error:"); }
  },
);
