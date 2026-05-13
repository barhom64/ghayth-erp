import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { emitEvent, createGuardedJournalEntry, getAccountCodeFromMapping, roundTo2 } from "./businessHelpers.js";
import { NotFoundError } from "./errorHandler.js";
import { logger } from "./logger.js";

type QueryFn = (sql: string, params: unknown[]) => Promise<{ rows: any[] }>;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommissionPlan {
  id: number;
  companyId: number;
  branchId: number;
  employeeId: number;
  assignmentId: number;
  seasonId: number;
  planName: string;
  baseSalary: number;
  commissionType: string;
  percentageRate: number | null;
  fixedAmount: number | null;
  conditionType: string;
  minProfitPerVisa: number | null;
  minSalesPercent: number | null;
  minAvgPrice: number | null;
  excludedMonths: number[];
  tierUnit: number;
  partialTiersAllowed: boolean;
  violationBlocksCommission: boolean;
  status: string;
  version: number;
}

// Only the shaping fields — what actually influences the number.
// Stored as planSnapshot on each calculation row so re-reading a
// historical calc is always reproducible.
function buildPlanSnapshot(plan: CommissionPlan) {
  return {
    planName: plan.planName,
    commissionType: plan.commissionType,
    percentageRate: plan.percentageRate,
    fixedAmount: plan.fixedAmount,
    conditionType: plan.conditionType,
    minProfitPerVisa: plan.minProfitPerVisa,
    minSalesPercent: plan.minSalesPercent,
    minAvgPrice: plan.minAvgPrice,
    excludedMonths: plan.excludedMonths,
    tierUnit: plan.tierUnit,
    partialTiersAllowed: plan.partialTiersAllowed,
    violationBlocksCommission: plan.violationBlocksCommission,
    baseSalary: plan.baseSalary,
  };
}

function buildTiersSnapshot(tiers: CommissionTier[]) {
  return tiers.map((t) => ({
    fromCount: t.fromCount,
    toCount: t.toCount,
    bonusPerUnit: t.bonusPerUnit,
    isCumulative: t.isCumulative,
    tierOrder: t.tierOrder,
  }));
}

interface CommissionTier {
  id: number;
  planId: number;
  fromCount: number;
  toCount: number | null;
  bonusPerUnit: number;
  isCumulative: boolean;
  tierOrder: number;
}

export interface CalculationResult {
  planId: number;
  employeeId: number;
  month: number;
  year: number;
  totalMutamers: number;
  avgProfitPerVisa: number;
  salesPercent: number;
  avgSalePrice: number;
  conditionMet: boolean;
  conditionDetails: string;
  completedTiers: number;
  commissionAmount: number;
  hasViolations: boolean;
  finalAmount: number;
  isExcludedMonth: boolean;
}

// ---------------------------------------------------------------------------
// Calculate commission for a single plan + month
// ---------------------------------------------------------------------------

export async function calculateCommissionForPlan(
  planId: number,
  month: number,
  year: number,
  userId: number,
  companyId?: number,
): Promise<CalculationResult> {
  const [plan] = await rawQuery<CommissionPlan>(
    `SELECT * FROM employee_commission_plans WHERE id = $1 AND "companyId" = $2 AND status = 'active' AND "deletedAt" IS NULL`,
    [planId, companyId ?? 0]
  );
  if (!plan) throw new NotFoundError("الخطة غير موجودة أو غير مفعّلة");

  const tiers = await rawQuery<CommissionTier>(
    `SELECT * FROM employee_commission_tiers WHERE "planId" = $1 ORDER BY "tierOrder"`,
    [planId]
  );

  const planSnapshot = JSON.stringify(buildPlanSnapshot(plan));
  const tiersSnapshot = JSON.stringify(buildTiersSnapshot(tiers));
  const planVersion = plan.version ?? 1;

  return withTransaction(async (client) => {
    const txQuery: QueryFn = (sql, params) => client.query(sql, params);
    const result = await compute(txQuery, plan, tiers, month, year);

    const [existing] = (await client.query(
      `SELECT id FROM employee_commission_calculations
       WHERE "companyId"=$1 AND "planId"=$2 AND year=$3 AND month=$4 AND "deletedAt" IS NULL`,
      [plan.companyId, planId, year, month]
    )).rows;

    if (existing) {
      await client.query(
        `UPDATE employee_commission_calculations SET
         "totalMutamers"=$1, "avgProfitPerVisa"=$2, "salesPercent"=$3, "avgSalePrice"=$4,
         "conditionMet"=$5, "conditionDetails"=$6, "completedTiers"=$7, "commissionAmount"=$8,
         "hasViolations"=$9, "finalAmount"=$10, "isExcludedMonth"=$11, status='calculated',
         "planVersion"=$12, "planSnapshot"=$13::jsonb, "tiersSnapshot"=$14::jsonb,
         "updatedBy"=$15, "updatedAt"=NOW()
         WHERE id=$16 AND "companyId"=$17`,
        [
          result.totalMutamers, result.avgProfitPerVisa, result.salesPercent, result.avgSalePrice,
          result.conditionMet, result.conditionDetails, result.completedTiers, result.commissionAmount,
          result.hasViolations, result.finalAmount, result.isExcludedMonth,
          planVersion, planSnapshot, tiersSnapshot,
          userId, existing.id, plan.companyId,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO employee_commission_calculations
         ("companyId","branchId","planId","employeeId",month,year,
          "totalMutamers","avgProfitPerVisa","salesPercent","avgSalePrice",
          "conditionMet","conditionDetails","completedTiers","commissionAmount",
          "hasViolations","finalAmount","isExcludedMonth",
          "planVersion","planSnapshot","tiersSnapshot",
          status,"createdBy","createdAt","updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20::jsonb,'calculated',$21,NOW(),NOW())`,
        [
          plan.companyId, plan.branchId, planId, plan.employeeId, month, year,
          result.totalMutamers, result.avgProfitPerVisa, result.salesPercent, result.avgSalePrice,
          result.conditionMet, result.conditionDetails, result.completedTiers, result.commissionAmount,
          result.hasViolations, result.finalAmount, result.isExcludedMonth,
          planVersion, planSnapshot, tiersSnapshot,
          userId,
        ]
      );
    }

    emitEvent({
      companyId: plan.companyId, branchId: plan.branchId, userId,
      action: "umrah.commission.calculated", entity: "employee_commission_plans", entityId: planId,
      after: { month, year, finalAmount: result.finalAmount, employeeId: plan.employeeId, assignmentId: plan.assignmentId },
    }).catch((e) => logger.error(e, "umrah commission background task failed"));

    if (result.finalAmount > 0) {
      // GL: Debit Commission Expense, Credit Commission Payable (accrual) — BLOCKING
      const [expenseCode, payableCode] = await Promise.all([
        getAccountCodeFromMapping(plan.companyId, "commission_expense", "debit", "6200"),
        getAccountCodeFromMapping(plan.companyId, "commission_payable", "credit", "2150"),
      ]);
      await createGuardedJournalEntry({
        companyId: plan.companyId,
        branchId: plan.branchId,
        createdBy: userId,
        ref: `JE-COMM-${planId}-${year}${String(month).padStart(2, "0")}`,
        description: `استحقاق عمولة — ${plan.planName} — ${month}/${year} — موظف #${plan.employeeId}`,
        type: "accrual",
        sourceType: "employee_commission_calculations",
        sourceId: planId,
        sourceKey: `commission:${planId}:${year}:${month}`,
        lines: [
          { accountCode: expenseCode, debit: result.finalAmount, credit: 0, description: `مصروف عمولة — ${plan.planName}`, employeeId: plan.employeeId },
          { accountCode: payableCode, debit: 0, credit: result.finalAmount, description: `عمولة مستحقة — موظف #${plan.employeeId}`, employeeId: plan.employeeId },
        ],
      }, { table: "employee_commission_calculations", id: planId });
    }

    return result;
  });
}

// ---------------------------------------------------------------------------
// Simulate — read-only, no writes
// ---------------------------------------------------------------------------

export async function simulateCommission(
  planId: number,
  month: number,
  year: number,
  companyId?: number,
): Promise<CalculationResult> {
  const [plan] = await rawQuery<CommissionPlan>(
    `SELECT * FROM employee_commission_plans WHERE id = $1 AND "companyId" = $2 AND "deletedAt" IS NULL`,
    [planId, companyId ?? 0]
  );
  if (!plan) throw new NotFoundError("الخطة غير موجودة");

  const tiers = await rawQuery<CommissionTier>(
    `SELECT * FROM employee_commission_tiers WHERE "planId" = $1 ORDER BY "tierOrder"`,
    [planId]
  );

  const queryFn: QueryFn = (sql, params) => rawQuery(sql, params).then((rows) => ({ rows }));
  return compute(queryFn, plan, tiers, month, year);
}

// ---------------------------------------------------------------------------
// Core computation
// ---------------------------------------------------------------------------

async function compute(
  queryFn: QueryFn,
  plan: CommissionPlan,
  tiers: CommissionTier[],
  month: number,
  year: number,
): Promise<CalculationResult> {
  const excludedMonths: number[] = Array.isArray(plan.excludedMonths) ? plan.excludedMonths : [];
  const isExcludedMonth = excludedMonths.includes(month);

  const mutamerStats = (await queryFn(
    `SELECT
       COUNT(*)::int AS total,
       COALESCE(AVG(pkg."sellPrice" - pkg."costPrice"), 0)::numeric(10,2) AS avg_profit,
       COALESCE(AVG(pkg."sellPrice"), 0)::numeric(10,2) AS avg_price
     FROM umrah_pilgrims p
     LEFT JOIN umrah_packages pkg ON p."packageId" = pkg.id AND pkg."deletedAt" IS NULL
     WHERE p."companyId" = $1 AND p."seasonId" = $2
       AND EXTRACT(MONTH FROM p."createdAt") = $3
       AND EXTRACT(YEAR FROM p."createdAt") = $4
       AND p."deletedAt" IS NULL
       AND p."createdBy" IN (SELECT u.id FROM users u WHERE u."employeeId" = $5)`,
    [plan.companyId, plan.seasonId, month, year, plan.employeeId]
  )).rows[0] ?? { total: 0, avg_profit: 0, avg_price: 0 };

  const totalMutamers = Number(mutamerStats.total) || 0;
  const avgProfitPerVisa = Number(mutamerStats.avg_profit) || 0;
  const avgSalePrice = Number(mutamerStats.avg_price) || 0;

  const totalSalesRes = (await queryFn(
    `SELECT COALESCE(SUM("totalAmount"), 0)::numeric(12,2) AS total_sales
     FROM umrah_nusk_invoices
     WHERE "companyId" = $1 AND EXTRACT(MONTH FROM "issueDate") = $2 AND EXTRACT(YEAR FROM "issueDate") = $3
       AND "deletedAt" IS NULL`,
    [plan.companyId, month, year]
  )).rows[0];
  const totalCompanySales = Number(totalSalesRes?.total_sales) || 1;

  const employeeSalesRes = (await queryFn(
    `SELECT COALESCE(SUM(ni."totalAmount"), 0)::numeric(12,2) AS emp_sales
     FROM umrah_nusk_invoices ni
     WHERE ni."companyId" = $1 AND EXTRACT(MONTH FROM ni."issueDate") = $2 AND EXTRACT(YEAR FROM ni."issueDate") = $3
       AND ni."deletedAt" IS NULL
       AND ni."createdBy" IN (SELECT u.id FROM users u WHERE u."employeeId" = $4)`,
    [plan.companyId, month, year, plan.employeeId]
  )).rows[0];
  const salesPercent = totalCompanySales > 0
    ? Math.round((Number(employeeSalesRes?.emp_sales) / totalCompanySales) * 10000) / 100
    : 0;

  const { conditionMet, conditionDetails } = checkConditions(plan, avgProfitPerVisa, salesPercent);

  // Per-employee scoping per spec §9 + acceptance #15:
  // Only block this plan's commission if the violation is attributed to
  // the plan-owner's assignment (responsibleAssignmentId match). Rows
  // without the attribution still block (backward-compat with un-tagged
  // legacy violations) so behaviour does not regress.
  const violationRes = (await queryFn(
    `SELECT COUNT(*)::int AS cnt FROM umrah_violations v
     WHERE v."companyId" = $1 AND v.status IN ('detected','open')
       AND v."createdAt" >= DATE_TRUNC('month', MAKE_DATE($2, $3, 1))
       AND v."createdAt" < DATE_TRUNC('month', MAKE_DATE($2, $3, 1)) + INTERVAL '1 month'
       AND v."deletedAt" IS NULL
       AND ( v."responsibleAssignmentId" IS NULL
             OR v."responsibleAssignmentId" = $5 )
       AND EXISTS (
         SELECT 1 FROM umrah_pilgrims p
         WHERE p."companyId" = v."companyId" AND p."seasonId" = $4
           AND (p.id = v."mutamerId" OR p."groupId" = v."groupId")
           AND p."deletedAt" IS NULL
       )`,
    [plan.companyId, year, month, plan.seasonId, plan.assignmentId ?? -1]
  )).rows[0];
  const hasViolations = Number(violationRes?.cnt) > 0;

  let commissionAmount = 0;

  if (isExcludedMonth) {
    commissionAmount = 0;
  } else if (plan.commissionType === "tiered" || plan.commissionType === "mixed") {
    commissionAmount = computeTieredBonus(totalMutamers, tiers, plan.tierUnit, plan.partialTiersAllowed);
    if (plan.commissionType === "mixed") {
      if (plan.percentageRate) commissionAmount += totalMutamers * avgSalePrice * (plan.percentageRate / 100);
      if (plan.fixedAmount) commissionAmount += plan.fixedAmount;
    }
  } else if (plan.commissionType === "percentage") {
    commissionAmount = totalMutamers * avgSalePrice * ((plan.percentageRate ?? 0) / 100);
  } else if (plan.commissionType === "fixed") {
    commissionAmount = plan.fixedAmount ?? 0;
  }

  let finalAmount = commissionAmount;
  if (!conditionMet && plan.conditionType !== "none") finalAmount = 0;
  if (hasViolations && plan.violationBlocksCommission) finalAmount = 0;
  if (isExcludedMonth) finalAmount = 0;

  finalAmount = roundTo2(finalAmount);
  commissionAmount = roundTo2(commissionAmount);

  const completedTiers = plan.partialTiersAllowed
    ? tiers.filter((t) => totalMutamers >= t.fromCount).length
    : tiers.filter((t) => totalMutamers >= (t.toCount ?? Infinity)).length;

  return {
    planId: plan.id,
    employeeId: plan.employeeId,
    month,
    year,
    totalMutamers,
    avgProfitPerVisa,
    salesPercent,
    avgSalePrice,
    conditionMet,
    conditionDetails,
    completedTiers,
    commissionAmount,
    hasViolations,
    finalAmount,
    isExcludedMonth,
  };
}

// ---------------------------------------------------------------------------
// Tiered bonus: floor(total / tierUnit) completed units only
// ---------------------------------------------------------------------------

function computeTieredBonus(
  totalMutamers: number,
  tiers: CommissionTier[],
  tierUnit: number,
  partialAllowed: boolean,
): number {
  if (tiers.length === 0 || totalMutamers === 0) return 0;

  const completedUnits = partialAllowed
    ? totalMutamers / (tierUnit || 1)
    : Math.floor(totalMutamers / (tierUnit || 1));

  if (completedUnits <= 0) return 0;

  let bonus = 0;
  let remaining = completedUnits;

  for (const tier of tiers) {
    const tierFrom = tier.fromCount / (tierUnit || 1);
    const tierTo = tier.toCount != null ? tier.toCount / (tierUnit || 1) : Infinity;
    const tierSpan = tierTo - tierFrom;

    if (remaining <= 0) break;

    const unitsInTier = Math.min(remaining, tierSpan);

    if (tier.isCumulative) {
      bonus += unitsInTier * Number(tier.bonusPerUnit);
    } else {
      bonus = unitsInTier * Number(tier.bonusPerUnit);
    }

    remaining -= unitsInTier;
  }

  return bonus;
}

// ---------------------------------------------------------------------------
// Condition check
// ---------------------------------------------------------------------------

function checkConditions(
  plan: CommissionPlan,
  avgProfit: number,
  salesPercent: number,
): { conditionMet: boolean; conditionDetails: string } {
  if (plan.conditionType === "none" || !plan.conditionType) {
    return { conditionMet: true, conditionDetails: "بدون شرط" };
  }

  const profitOk = plan.minProfitPerVisa == null || avgProfit >= plan.minProfitPerVisa;
  const salesOk = plan.minSalesPercent == null || salesPercent >= plan.minSalesPercent;

  if (plan.conditionType === "profit_avg") {
    return {
      conditionMet: profitOk,
      conditionDetails: profitOk
        ? `متوسط الربح ${avgProfit} >= ${plan.minProfitPerVisa}`
        : `متوسط الربح ${avgProfit} < ${plan.minProfitPerVisa} (لم يتحقق)`,
    };
  }

  if (plan.conditionType === "sales_percent") {
    return {
      conditionMet: salesOk,
      conditionDetails: salesOk
        ? `نسبة المبيعات ${salesPercent}% >= ${plan.minSalesPercent}%`
        : `نسبة المبيعات ${salesPercent}% < ${plan.minSalesPercent}% (لم يتحقق)`,
    };
  }

  if (plan.conditionType === "both_or") {
    const met = profitOk || salesOk;
    return {
      conditionMet: met,
      conditionDetails: met
        ? `أحد الشرطين تحقق: ربح=${profitOk}, مبيعات=${salesOk}`
        : `لم يتحقق أي شرط: ربح=${avgProfit}<${plan.minProfitPerVisa}, مبيعات=${salesPercent}%<${plan.minSalesPercent}%`,
    };
  }

  return { conditionMet: true, conditionDetails: "نوع شرط غير معروف" };
}

// ---------------------------------------------------------------------------
// Bulk calculate: all active plans for a company + month
// ---------------------------------------------------------------------------

export async function calculateAllForCompany(
  companyId: number,
  month: number,
  year: number,
  userId: number,
): Promise<CalculationResult[]> {
  const plans = await rawQuery<{ id: number }>(
    `SELECT id FROM employee_commission_plans WHERE "companyId" = $1 AND status = 'active' AND "deletedAt" IS NULL`,
    [companyId]
  );
  const results: CalculationResult[] = [];
  for (const p of plans) {
    try {
      const r = await calculateCommissionForPlan(p.id, month, year, userId, companyId);
      results.push(r);
    } catch (err) {
      await rawExecute(
        `INSERT INTO financial_posting_failures ("companyId","sourceType","sourceId",error,resolved)
         VALUES ($1,$2,$3,$4,false)`,
        [companyId, "commission_calculation", p.id,
         `فشل حساب عمولة الخطة ${p.id} شهر ${month}/${year}: ${String(err)}`]
      ).catch((e) => logger.error(e, "umrah commission background task failed"));
    }
  }
  return results;
}
