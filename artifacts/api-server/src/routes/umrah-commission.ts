// ─────────────────────────────────────────────────────────────────────────────
// umrah-commission.ts — UMRAH EMPLOYEE COMMISSION PLANS
//
// U-07 Phase 5: the 8 commission-plan / commission-calculation routes carved
// verbatim from umrah-entities.ts into a dedicated sub-router. Mounted via
// `router.use(commissionRouter)` in umrah-entities.ts so the API surface stays
// identical (paths still resolve at /umrah/commission-plans,
// /umrah/commission-plans/:id/simulate, /umrah/commission-calculations…).
//
// Pure code move — handlers, schemas, RBAC, approval-chain hook, event
// emission are carried over VERBATIM from the parent (no behaviour change).
// Audit calls use auditFromRequest per the IGOC ratchet
// (auditIgocContextCoverageRatchet.test.ts) — new route files must not
// use the legacy direct audit helper.
//
// Routes owned here:
//   GET    /commission-plans
//   GET    /commission-plans/:id
//   POST   /commission-plans
//   PATCH  /commission-plans/:id
//   POST   /commission-plans/simulate
//   POST   /commission-plans/:id/simulate
//   POST   /commission-plans/:id/calculate
//   GET    /commission-calculations
//
// Domain notes (verbatim from the parent):
//   Employee commission plans drive the salesperson incentive math: a base
//   salary plus tiered/percentage/fixed bonuses gated on profit/sales
//   conditions. Plan creation routes through the company approval chain
//   (umrah_commission_plan) when one is configured. Simulate is pure
//   what-if math (no DB writes); calculate persists a calculation row.
// ─────────────────────────────────────────────────────────────────────────────
import { Router } from "express";
import { z } from "zod";
import { rawQuery, withTransaction } from "../lib/rawdb.js";
import { authorize, maskFields } from "../lib/rbac/authorize.js";
import {
  handleRouteError,
  NotFoundError,
  parseId,
  zodParse,
} from "../lib/errorHandler.js";
import {
  emitEvent,
  auditFromRequest,
  initiateApprovalChain,
} from "../lib/businessHelpers.js";
import {
  calculateCommissionForPlan,
  simulateCommission,
  simulateCommissionAdHoc,
} from "../lib/umrahCommissionEngine.js";
import { logger } from "../lib/logger.js";

const router = Router();

const commissionTierSchema = z.object({
  fromCount: z.coerce.number(),
  toCount: z.coerce.number().nullable().optional(),
  bonusPerUnit: z.coerce.number(),
  isCumulative: z.boolean().optional(),
});

const createCommissionPlanSchema = z.object({
  employeeId: z.coerce.number({ required_error: "الموظف مطلوب" }),
  seasonId: z.coerce.number({ required_error: "الموسم مطلوب" }),
  planName: z.string().min(1, "اسم الخطة مطلوب"),
  assignmentId: z.coerce.number().optional(),
  baseSalary: z.coerce.number().optional(),
  commissionType: z.string().optional(),
  percentageRate: z.coerce.number().min(0, "النسبة يجب ألا تكون سالبة").max(100, "النسبة يجب ألا تتجاوز 100").nullable().optional(),
  fixedAmount: z.coerce.number().nullable().optional(),
  conditionType: z.string().optional(),
  minProfitPerVisa: z.coerce.number().nullable().optional(),
  minSalesPercent: z.coerce.number().min(0, "النسبة يجب ألا تكون سالبة").max(100, "النسبة يجب ألا تتجاوز 100").nullable().optional(),
  minAvgPrice: z.coerce.number().nullable().optional(),
  excludedMonths: z.array(z.coerce.number()).optional(),
  tierUnit: z.coerce.number().optional(),
  partialTiersAllowed: z.boolean().optional(),
  violationBlocksCommission: z.boolean().optional(),
  notes: z.string().nullable().optional(),
  tiers: z.array(commissionTierSchema).optional(),
});

const updateCommissionPlanSchema = z.object({
  planName: z.string().min(1).optional(),
  baseSalary: z.coerce.number().optional(),
  commissionType: z.string().optional(),
  percentageRate: z.coerce.number().min(0, "النسبة يجب ألا تكون سالبة").max(100, "النسبة يجب ألا تتجاوز 100").nullable().optional(),
  fixedAmount: z.coerce.number().nullable().optional(),
  conditionType: z.string().optional(),
  minProfitPerVisa: z.coerce.number().nullable().optional(),
  minSalesPercent: z.coerce.number().min(0, "النسبة يجب ألا تكون سالبة").max(100, "النسبة يجب ألا تتجاوز 100").nullable().optional(),
  minAvgPrice: z.coerce.number().nullable().optional(),
  excludedMonths: z.array(z.coerce.number()).optional(),
  tierUnit: z.coerce.number().optional(),
  partialTiersAllowed: z.boolean().optional(),
  violationBlocksCommission: z.boolean().optional(),
  status: z.string().optional(),
  notes: z.string().nullable().optional(),
  tiers: z.array(commissionTierSchema).optional(),
});

const simulateCommissionSchema = z.object({
  month: z.coerce.number({ required_error: "الشهر مطلوب" }),
  year: z.coerce.number({ required_error: "السنة مطلوبة" }),
  totalMutamers: z.coerce.number().nonnegative().optional(),
  avgProfitPerVisa: z.coerce.number().nonnegative().optional(),
  avgSalePrice: z.coerce.number().nonnegative().optional(),
  salesPercent: z.coerce.number().min(0).max(100).optional(),
});

const simulatePlanInlineSchema = z.object({
  plan: z.object({
    companyId: z.coerce.number().int().optional(),
    seasonId: z.coerce.number().int(),
    employeeId: z.coerce.number().int(),
    commissionType: z.string(),
    percentageRate: z.coerce.number().min(0, "النسبة يجب ألا تكون سالبة").max(100, "النسبة يجب ألا تتجاوز 100").nullable().optional(),
    fixedAmount: z.coerce.number().nullable().optional(),
    conditionType: z.string().nullable().optional(),
    minProfitPerVisa: z.coerce.number().nullable().optional(),
    minSalesPercent: z.coerce.number().min(0, "النسبة يجب ألا تكون سالبة").max(100, "النسبة يجب ألا تتجاوز 100").nullable().optional(),
    minAvgPrice: z.coerce.number().nullable().optional(),
    excludedMonths: z.array(z.coerce.number().int()).optional(),
    tierUnit: z.string().optional(),
    partialTiersAllowed: z.boolean().optional(),
    assignmentId: z.coerce.number().int().nullable().optional(),
    violationBlocksCommission: z.boolean().optional(),
  }),
  tiers: z.array(z.object({
    fromCount: z.coerce.number().int().nonnegative(),
    toCount: z.union([z.coerce.number().int().nonnegative(), z.null()]).optional(),
    bonusPerUnit: z.coerce.number().nonnegative(),
    isCumulative: z.boolean().optional(),
    tierOrder: z.coerce.number().int().min(1),
  })).default([]),
  month: z.coerce.number(),
  year: z.coerce.number(),
  totalMutamers: z.coerce.number().nonnegative().optional(),
  avgProfitPerVisa: z.coerce.number().nonnegative().optional(),
  avgSalePrice: z.coerce.number().nonnegative().optional(),
  salesPercent: z.coerce.number().min(0).max(100).optional(),
});

router.get("/commission-plans", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    // Pre-aggregate tier counts via CTE — same pattern as the
    // earlier N+1 fixes. Avoids 1 lookup per commission plan
    // through employee_commission_tiers.
    const rows = await rawQuery(
      `WITH tier_counts AS (
         SELECT "planId", COUNT(*) AS "tierCount"
         FROM employee_commission_tiers
         WHERE "deletedAt" IS NULL
         GROUP BY "planId"
       )
       SELECT cp.*,
              s.title AS "seasonTitle",
              COALESCE(tc."tierCount", 0)::int AS "tierCount"
       FROM employee_commission_plans cp
       LEFT JOIN umrah_seasons s ON cp."seasonId" = s.id AND s."deletedAt" IS NULL
       LEFT JOIN tier_counts tc ON tc."planId" = cp.id
       WHERE cp."companyId" = $1 AND cp."deletedAt" IS NULL
       ORDER BY cp."createdAt" DESC`,
      [scope.companyId]
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List commission plans"); }
});

router.get("/commission-plans/:id", authorize({ feature: "umrah", action: "view" }), async (req, res): Promise<void> => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const [[plan], tiers, calculations] = await Promise.all([
      rawQuery(
        `SELECT cp.*, s.title AS "seasonTitle"
         FROM employee_commission_plans cp
         LEFT JOIN umrah_seasons s ON cp."seasonId" = s.id AND s."deletedAt" IS NULL
         WHERE cp.id = $1 AND cp."companyId" = $2 AND cp."deletedAt" IS NULL`,
        [id, scope.companyId]
      ),
      rawQuery(
        `SELECT * FROM employee_commission_tiers WHERE "planId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL ORDER BY "tierOrder"`,
        [id, scope.companyId]
      ),
      rawQuery(
        `SELECT * FROM employee_commission_calculations
         WHERE "planId" = $1 AND "companyId" = $2 AND "deletedAt" IS NULL ORDER BY year DESC, month DESC LIMIT 12`,
        [id, scope.companyId]
      ),
    ]);
    if (!plan) { throw new NotFoundError("الخطة غير موجودة"); }
    res.json(maskFields(req, { ...plan, tiers, calculations }));
  } catch (err) { handleRouteError(err, res, "Get commission plan"); }
});

router.post("/commission-plans", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const parsed = zodParse(createCommissionPlanSchema.safeParse(req.body));
    const b = parsed;

    const result = await withTransaction(async (client) => {
      const planRes = await client.query(
        `INSERT INTO employee_commission_plans
         ("companyId","branchId","employeeId","assignmentId","seasonId","planName","baseSalary",
          "commissionType","percentageRate","fixedAmount","conditionType","minProfitPerVisa","minSalesPercent",
          "minAvgPrice","excludedMonths","tierUnit","partialTiersAllowed","violationBlocksCommission",
          status,notes,"createdBy","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'active',$19,$20,NOW(),NOW())
         RETURNING *`,
        [
          scope.companyId, scope.branchId, b.employeeId, b.assignmentId || b.employeeId,
          b.seasonId, b.planName, b.baseSalary || 0,
          b.commissionType || "tiered", b.percentageRate || null, b.fixedAmount || null,
          b.conditionType || "none", b.minProfitPerVisa || null, b.minSalesPercent || null,
          b.minAvgPrice || null, JSON.stringify(b.excludedMonths ?? []),
          b.tierUnit || 10000, b.partialTiersAllowed ?? false, b.violationBlocksCommission ?? true,
          b.notes || null, scope.userId,
        ]
      );
      const plan = planRes.rows[0];

      if (Array.isArray(b.tiers)) {
        for (let i = 0; i < b.tiers.length; i++) {
          const t = b.tiers[i];
          await client.query(
            `INSERT INTO employee_commission_tiers ("planId","fromCount","toCount","bonusPerUnit","isCumulative","tierOrder")
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [plan.id, t.fromCount, t.toCount ?? null, t.bonusPerUnit, t.isCumulative ?? true, i + 1]
          );
        }
      }
      return plan;
    });

    // Governance hook: route through approval chain when company has
    // a configured chain for `umrah_commission_plan` matching the base
    // salary. If no chain matches, requiresApproval comes back false
    // and the plan is treated as auto-approved (existing behaviour).
    let approval: { requiresApproval: boolean; chainId: number | null; approvalRequestId: number | null; currentStep: number; totalSteps: number } | null = null;
    try {
      approval = await initiateApprovalChain({
        companyId: scope.companyId,
        branchId: scope.branchId || 0,
        // as-any-reason: justified-pragmatic - chainType literal not yet in the shared ApprovalChainType union; runtime value is whitelisted by initiateApprovalChain
        chainType: "umrah_commission_plan" as any,
        refType: "employee_commission_plan",
        refId: result.id,
        amount: Number(b.baseSalary || 0),
      });
    } catch (e) {
      logger.error(e, "umrah commission plan approval chain init failed (non-blocking)");
    }

    auditFromRequest(req, "create", "employee_commission_plans", result.id, { after: { planName: b.planName, approvalRequired: approval?.requiresApproval ?? false } }).catch((e) => logger.error(e, "umrah-commission background task failed"));
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission_plan.created", entity: "employee_commission_plans", entityId: result.id, details: JSON.stringify({ planName: b.planName, approvalChainId: approval?.chainId ?? null }) }).catch((e) => logger.error(e, "umrah-commission background task failed"));
    res.status(201).json({ ...result, approval });
  } catch (err) { handleRouteError(err, res, "Create commission plan"); }
});

router.patch("/commission-plans/:id", authorize({ feature: "umrah", action: "update" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(updateCommissionPlanSchema.safeParse(req.body));
    const b = parsed as Record<string, any>;

    await withTransaction(async (client) => {
      const params: unknown[] = [];
      const sets: string[] = [];
      for (const key of [
        "planName","baseSalary","commissionType","percentageRate","fixedAmount",
        "conditionType","minProfitPerVisa","minSalesPercent","minAvgPrice",
        "tierUnit","partialTiersAllowed","violationBlocksCommission","status","notes",
      ]) {
        if (b[key] !== undefined) { params.push(b[key]); sets.push(`"${key}"=$${params.length}`); }
      }
      if (b.excludedMonths !== undefined) {
        params.push(JSON.stringify(b.excludedMonths));
        sets.push(`"excludedMonths"=$${params.length}`);
      }
      if (sets.length > 0) {
        params.push(scope.userId); sets.push(`"updatedBy"=$${params.length}`);
        sets.push(`"updatedAt"=NOW()`);
        params.push(id); params.push(scope.companyId);
        await client.query(
          `UPDATE employee_commission_plans SET ${sets.join(",")} WHERE id=$${params.length-1} AND "companyId"=$${params.length} AND "deletedAt" IS NULL`,
          params
        );
      }

      if (Array.isArray(b.tiers)) {
        const [owned] = (await client.query(
          `SELECT id FROM employee_commission_plans WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
          [id, scope.companyId]
        )).rows;
        if (!owned) throw new NotFoundError("خطة العمولة غير موجودة");
        await client.query(`DELETE FROM employee_commission_tiers WHERE "planId" = $1 AND "companyId" = $2`, [id, scope.companyId]);
        for (let i = 0; i < b.tiers.length; i++) {
          const t = b.tiers[i];
          await client.query(
            `INSERT INTO employee_commission_tiers ("planId","fromCount","toCount","bonusPerUnit","isCumulative","tierOrder")
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [id, t.fromCount, t.toCount ?? null, t.bonusPerUnit, t.isCumulative ?? true, i + 1]
          );
        }
      }
    });

    const [row] = await rawQuery(
      `SELECT * FROM employee_commission_plans WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
      [id, scope.companyId]
    );
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission_plan.updated", entity: "employee_commission_plans", entityId: id, details: JSON.stringify({ planName: b.planName }) }).catch((e) => logger.error(e, "umrah-commission background task failed"));
    auditFromRequest(req, "update", "umrah_commission_plans", id, { after: { planName: b.planName } }).catch((e) => logger.error(e, "umrah-commission background task failed"));
    res.json(row);
  } catch (err) { handleRouteError(err, res, "Update commission plan"); }
});

// Ad-hoc simulation (no plan id — used by the editor in create mode before save).
// Pure what-if math; no DB writes; no audit row intentional (mirrors the
// description in scripts/audit-coverage-allowlist.txt).
router.post("/commission-plans/simulate", authorize({ feature: "umrah", action: "list" }), async (req, res): Promise<void> => {
  try {
    const parsed = zodParse(simulatePlanInlineSchema.safeParse(req.body));
    const { plan, tiers, month, year, totalMutamers, avgProfitPerVisa, avgSalePrice, salesPercent } = parsed;
    const scope = req.scope!;
    const planForEngine: any = { ...plan, companyId: scope.companyId };
    const tiersForEngine: any = (tiers ?? []).map((t) => ({
      ...t,
      toCount: t.toCount ?? null,
      isCumulative: t.isCumulative ?? false,
    }));
    const result = await simulateCommissionAdHoc(
      planForEngine, tiersForEngine, month, year,
      { totalMutamers, avgProfitPerVisa, avgSalePrice, salesPercent },
    );
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Simulate commission (ad-hoc)"); }
});

router.post("/commission-plans/:id/simulate", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const parsed = zodParse(simulateCommissionSchema.safeParse(req.body));
    const { month, year, totalMutamers, avgProfitPerVisa, avgSalePrice, salesPercent } = parsed;
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const result = await simulateCommission(id, month, year, scope.companyId, {
      totalMutamers, avgProfitPerVisa, avgSalePrice, salesPercent,
    });
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission.simulated", entity: "employee_commission_plans", entityId: id, details: JSON.stringify({ month, year }) }).catch((e) => logger.error(e, "umrah-commission background task failed"));
    auditFromRequest(req, "preview", "umrah_commission_plans", id, { after: { month, year } }).catch((e) => logger.error(e, "umrah-commission background task failed"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Simulate commission"); }
});

router.post("/commission-plans/:id/calculate", authorize({ feature: "umrah", action: "create" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const id = parseId(req.params.id, "id");
    const parsed = zodParse(simulateCommissionSchema.safeParse(req.body));
    const { month, year } = parsed;
    const result = await calculateCommissionForPlan(id, month, year, scope.userId, scope.companyId);
    emitEvent({ companyId: scope.companyId, branchId: scope.branchId, userId: scope.userId, action: "umrah.commission.calculated", entity: "employee_commission_plans", entityId: id, details: JSON.stringify({ month, year }) }).catch((e) => logger.error(e, "umrah-commission background task failed"));
    auditFromRequest(req, "create", "umrah_commissions", id, { after: { month, year } }).catch((e) => logger.error(e, "umrah-commission background task failed"));
    res.json(result);
  } catch (err) { handleRouteError(err, res, "Calculate commission"); }
});

router.get("/commission-calculations", authorize({ feature: "umrah", action: "list" }), async (req, res) => {
  try {
    const scope = req.scope!;
    const { planId, year, month } = req.query as Record<string, string | undefined>;
    let where = `cc."companyId" = $1 AND cc."deletedAt" IS NULL`;
    const params: unknown[] = [scope.companyId];
    if (planId) { params.push(planId); where += ` AND cc."planId" = $${params.length}`; }
    if (year) { params.push(year); where += ` AND cc.year = $${params.length}`; }
    if (month) { params.push(month); where += ` AND cc.month = $${params.length}`; }
    const rows = await rawQuery(
      `SELECT cc.*, cp."planName"
       FROM employee_commission_calculations cc
       LEFT JOIN employee_commission_plans cp ON cc."planId" = cp.id AND cp."deletedAt" IS NULL
       WHERE ${where}
       ORDER BY cc.year DESC, cc.month DESC LIMIT 500`,
      params
    );
    res.json(maskFields(req, { data: rows }));
  } catch (err) { handleRouteError(err, res, "List commission calculations"); }
});

export default router;
