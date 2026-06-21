/**
 * FIN-PROPERTY-MEDICAL-INSURANCE (#2249) — property + medical insurance API.
 *
 * Records an insurance PREMIUM as a prepaid balance AND opens a
 * prepaid_amortization_schedule (#2247) so the EXISTING amortization engine
 * recognizes it monthly. There is NO recognition endpoint here — recognition
 * is driven by /finance/amortization/run (the #2247 route) / the cron. This
 * router only OPENS the premium + its schedule.
 *
 * Endpoints (company-scoped, finance.journal create):
 *   POST /finance/insurance/property  — open a property-insurance premium
 *   POST /finance/insurance/medical   — open a medical-insurance premium
 *   POST /finance/insurance/premium   — generic (kind in body)
 *
 * The expense side is a TEXT `expenseAccountPurpose` stored on the schedule —
 * never a final GL code; financialEngine resolves it at recognition time. The
 * prepaid (asset) side is resolved from `prepaidAccountPurpose` and validated
 * postable before posting. Every query is company-scoped (tenant isolation).
 *
 * Mounted under /finance (see routes/index.ts).
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { handleRouteError, zodParse } from "../lib/errorHandler.js";
import { authorize } from "../lib/rbac/authorize.js";
import { auditFromRequest, emitEvent } from "../lib/businessHelpers.js";
import { logger } from "../lib/logger.js";
import { postInsurancePremium, type InsuranceKind } from "../lib/engines/insuranceEngine.js";

export const financeInsuranceRouter = Router();

const dimsSchema = z
  .object({
    propertyId: z.coerce.number().int().positive().optional(),
    unitId: z.coerce.number().int().positive().optional(),
    employeeId: z.coerce.number().int().positive().optional(),
    departmentId: z.coerce.number().int().positive().optional(),
    projectId: z.coerce.number().int().positive().optional(),
    costCenterId: z.coerce.number().int().positive().optional(),
  })
  .strict()
  .optional();

const premiumSchema = z
  .object({
    insuredEntityType: z.string().min(1),
    insuredEntityId: z.coerce.number().int().positive(),
    policyNumber: z.string().min(1).optional(),
    vendorId: z.coerce.number().int().positive().optional(),
    premiumAmount: z.coerce.number().positive(),
    startDate: z.string().min(8),
    endDate: z.string().min(8),
    prepaidAccountPurpose: z.string().min(1),
    expenseAccountPurpose: z.string().min(1),
    paid: z.coerce.boolean().optional(),
    sourceAccountPurpose: z.string().min(1).optional(),
    branchId: z.coerce.number().int().positive().optional(),
    currency: z.string().optional(),
    dims: dimsSchema,
  })
  .strict();

async function handlePremium(req: Request, res: Response, kind: InsuranceKind) {
  try {
    const scope = req.scope!;
    const b = zodParse(premiumSchema.safeParse(req.body));
    const result = await postInsurancePremium({
      companyId: scope.companyId,
      branchId: b.branchId ?? scope.branchId,
      createdBy: scope.activeAssignmentId ?? 0,
      kind,
      insuredEntityType: b.insuredEntityType,
      insuredEntityId: b.insuredEntityId,
      policyNumber: b.policyNumber,
      vendorId: b.vendorId,
      premiumAmount: b.premiumAmount,
      startDate: b.startDate,
      endDate: b.endDate,
      prepaidAccountPurpose: b.prepaidAccountPurpose,
      expenseAccountPurpose: b.expenseAccountPurpose,
      paid: b.paid,
      sourceAccountPurpose: b.sourceAccountPurpose,
      dims: b.dims,
      currency: b.currency,
    });
    auditFromRequest(req, "finance.insurance.premium_opened", "prepaid_amortization_schedules", result.scheduleId, {
      after: { kind, journalId: result.journalId, premiumAmount: b.premiumAmount, prepaidAccountCode: result.prepaidAccountCode },
    });
    emitEvent({
      companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
      action: "finance.insurance.premium_opened", entity: "prepaid_amortization_schedules", entityId: result.scheduleId,
      journalId: result.journalId, scheduleId: result.scheduleId, premiumAmount: b.premiumAmount,
      details: JSON.stringify({ kind, journalId: result.journalId, scheduleId: result.scheduleId, premiumAmount: b.premiumAmount }),
    }).catch((e) => logger.error(e, "finance-insurance background task failed"));
    res.status(201).json({ data: result });
  } catch (err) {
    handleRouteError(err, res, "Insurance premium error:");
  }
}

financeInsuranceRouter.post(
  "/insurance/property",
  authorize({ feature: "finance.journal", action: "create" }),
  (req, res) => handlePremium(req, res, "property"),
);

financeInsuranceRouter.post(
  "/insurance/medical",
  authorize({ feature: "finance.journal", action: "create" }),
  (req, res) => handlePremium(req, res, "medical"),
);

const genericSchema = premiumSchema.extend({
  kind: z.enum(["property", "medical"]),
});

financeInsuranceRouter.post(
  "/insurance/premium",
  authorize({ feature: "finance.journal", action: "create" }),
  async (req, res) => {
    try {
      const scope = req.scope!;
      const b = zodParse(genericSchema.safeParse(req.body));
      const result = await postInsurancePremium({
        companyId: scope.companyId,
        branchId: b.branchId ?? scope.branchId,
        createdBy: scope.activeAssignmentId ?? 0,
        kind: b.kind,
        insuredEntityType: b.insuredEntityType,
        insuredEntityId: b.insuredEntityId,
        policyNumber: b.policyNumber,
        vendorId: b.vendorId,
        premiumAmount: b.premiumAmount,
        startDate: b.startDate,
        endDate: b.endDate,
        prepaidAccountPurpose: b.prepaidAccountPurpose,
        expenseAccountPurpose: b.expenseAccountPurpose,
        paid: b.paid,
        sourceAccountPurpose: b.sourceAccountPurpose,
        dims: b.dims,
        currency: b.currency,
      });
      auditFromRequest(req, "finance.insurance.premium_opened", "prepaid_amortization_schedules", result.scheduleId, {
        after: { kind: b.kind, journalId: result.journalId, premiumAmount: b.premiumAmount, prepaidAccountCode: result.prepaidAccountCode },
      });
      emitEvent({
        companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId,
        action: "finance.insurance.premium_opened", entity: "prepaid_amortization_schedules", entityId: result.scheduleId,
        journalId: result.journalId, scheduleId: result.scheduleId, premiumAmount: b.premiumAmount,
        details: JSON.stringify({ kind: b.kind, journalId: result.journalId, scheduleId: result.scheduleId, premiumAmount: b.premiumAmount }),
      }).catch((e) => logger.error(e, "finance-insurance background task failed"));
      res.status(201).json({ data: result });
    } catch (err) {
      handleRouteError(err, res, "Insurance premium error:");
    }
  },
);
