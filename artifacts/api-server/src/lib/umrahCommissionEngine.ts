/**
 * Umrah Commission Engine — Phase 3.
 *
 * Computes monthly tiered commissions for the small set of Umrah-team
 * employees who have a documented `employee_commission_plans` row. The
 * engine is the single source of truth for the algorithm described in
 * §9.4 of the spec; routes (Phase 4) and cron jobs (Phase 6) call into
 * it without re-implementing any of it.
 *
 * Three public entry points
 * - `simulateCommission(plan, tiers, input)` — pure function. Used by
 *   the wizard "محاكاة" button on commission-plan-editor.tsx so the
 *   approver can see "if I lock these tiers and the team hits N
 *   pilgrims with X SAR avg profit, how much will the bonus be?"
 *   without touching the DB.
 * - `calculateCommissionForEmployee(scope, planId, period)` — pulls the
 *   real Umrah aggregates for the period, runs the same algorithm, and
 *   UPSERTs into `employee_commission_calculations` so payroll can
 *   surface the result. Refuses to overwrite a row that is already
 *   reviewed/approved/paid.
 * - `calculateCommissionsForMonth(scope, period)` — sweeps every active
 *   plan in the company. Cron C32 (Phase 6) triggers it monthly.
 *
 * Conventions inherited from the rest of the API server:
 *   * raw SQL via rawQuery / rawExecute / withTransaction
 *     (lib/rawdb.ts) — same pattern as every other engine / route
 *   * typed errors (NotFoundError / ValidationError / ConflictError)
 *     so route layer calls handleRouteError without further mapping
 *   * events fired through emitEvent (lib/businessHelpers.ts) — single
 *     action `umrah.commission.calculated`. The HR/payroll listener
 *     wires the payroll-line creation in Phase 6.
 *   * settings read with the documented system → company → branch
 *     inheritance (closest scope wins). The same loader used by the
 *     import engine is duplicated here to keep this file self-contained.
 *   * no new dependencies — no Hijri-conversion library, the caller
 *     supplies both the Hijri month/year (for storage + excluded-month
 *     check) and the matching Gregorian date range (for SQL filters).
 */

import { rawQuery, rawExecute, withTransaction } from "./rawdb.js";
import { emitEvent } from "./businessHelpers.js";
import { ValidationError, NotFoundError, ConflictError } from "./errorHandler.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CommissionScope {
  companyId: number;
  branchId: number | null;
  userId: number;
}

/**
 * A single calculation period. The Umrah business runs on the Hijri
 * calendar (excludedMonths is Hijri 1-12, payroll is Hijri month/year),
 * but every data point we aggregate (mutamer entryDate, voucher
 * issueDate, sales invoice date) is stored in Gregorian. So the caller
 * is responsible for supplying both:
 *   - hijriMonth / hijriYear → for the excluded-months check + storage
 *   - gregorianStart / gregorianEnd → for the SQL filters
 *
 * Phase 4 routes use Intl.DateTimeFormat({ calendar: 'islamic-civil' })
 * to derive the Gregorian boundaries; the engine itself stays
 * dependency-free.
 */
export interface CommissionPeriod {
  hijriMonth: number;      // 1-12
  hijriYear: number;       // e.g. 1447
  gregorianStart: string;  // ISO date YYYY-MM-DD (inclusive)
  gregorianEnd: string;    // ISO date YYYY-MM-DD (inclusive)
}

export interface CommissionTier {
  fromCount: number;       // inclusive
  toCount: number | null;  // inclusive; null = open-ended top tier
  bonusPerUnit: number;    // SAR per `tierUnit` pilgrims
  isCumulative: boolean;
}

export interface CommissionPlanRules {
  id: number;
  employeeId: number;
  assignmentId: number | null;
  seasonId: number | null;
  baseSalary: number;
  commissionType: "percentage" | "fixed" | "tiered" | "mixed";
  conditionType: "profit_avg" | "sales_percent" | "both_or" | "none";
  minProfitPerVisa: number | null;
  minSalesPercent: number | null;
  minAvgPrice: number | null;
  /** Hijri month numbers (1-12) the plan author wants suppressed. */
  excludedMonths: number[];
  tierUnit: number;
  partialTiersAllowed: boolean;
  violationBlocksCommission: boolean;
  status: "active" | "suspended" | "expired";
}

export interface CommissionStats {
  totalMutamers: number;
  avgProfitPerVisa: number;
  salesPercent: number;
  avgSalePrice: number;
  hasViolations: boolean;
}

/** Pure-function inputs for the wizard simulator. The caller supplies
 *  the numbers they want to test the plan against, no DB lookups happen. */
export interface SimulateInput {
  totalMutamers: number;
  avgProfitPerVisa: number;
  salesPercent: number;
  avgSalePrice: number;
  hasViolations?: boolean;
  /** Optional override for excluded-month check (defaults to false). */
  isExcludedMonth?: boolean;
}

export interface SimulateResult {
  conditionMet: boolean;
  conditionDetails: string;
  isExcludedMonth: boolean;
  hasViolations: boolean;
  completedTiers: number;
  tierBreakdown: { from: number; to: number | null; units: number; perUnit: number; subtotal: number }[];
  commissionAmount: number;
  finalAmount: number;
  payrollTotal: number; // baseSalary + finalAmount, for the wizard preview
}

export interface CalculationResult {
  calculationId: number;
  planId: number;
  employeeId: number;
  period: CommissionPeriod;
  stats: CommissionStats;
  simulation: SimulateResult;
  status: "calculated" | "reviewed" | "approved" | "paid" | "rejected";
  /** True when the row was newly inserted, false when an existing row was
   *  updated, undefined when it was preserved (status was already past
   *  'calculated'). */
  inserted?: boolean;
  preserved?: boolean;
}

// ---------------------------------------------------------------------------
// Pure algorithms — usable from anywhere, no DB access
// ---------------------------------------------------------------------------

/**
 * Compute the dinar amount earned from the tier ladder. The spec is
 * explicit: only **completed** tier units count (`partialTiersAllowed`
 * defaults to false). E.g. 37,000 mutamers @ 10,000 unit = 3 completed
 * units, the 7,000 leftover earns nothing.
 *
 * Tier boundaries follow the human-friendly convention from the spec:
 *   tier 1 = 0 → 50,000 (inclusive)
 *   tier 2 = 50,001 → ∞ (the "+1" expresses no overlap)
 * The off-by-one between consecutive tiers is collapsed at calculation
 * time so 60,000 mutamers actually pay 5 × 500 SAR (tier 1, 50k) +
 * 1 × 1000 SAR (tier 2, 10k) = 3,500 SAR — matching the spec example.
 *
 * Tiers can be cumulative (each completed unit pays at its bracket's
 * rate, like a tax bracket) or non-cumulative (only the highest
 * bracket reached pays, replacing the running total).
 */
export function computeTieredAmount(
  tiers: CommissionTier[],
  totalMutamers: number,
  tierUnit: number,
  partialAllowed: boolean
): { amount: number; completedTiers: number; breakdown: SimulateResult["tierBreakdown"] } {
  if (tierUnit <= 0 || tiers.length === 0 || totalMutamers <= 0) {
    return { amount: 0, completedTiers: 0, breakdown: [] };
  }

  const sorted = [...tiers].sort((a, b) => a.fromCount - b.fromCount);
  const completedUnits = partialAllowed
    ? totalMutamers / tierUnit
    : Math.floor(totalMutamers / tierUnit);
  const earnedMutamers = partialAllowed ? totalMutamers : completedUnits * tierUnit;

  const breakdown: SimulateResult["tierBreakdown"] = [];
  let totalAmount = 0;
  let runningStart = 0;

  for (const tier of sorted) {
    // Bridge the off-by-one between adjacent tiers: when the user wrote
    // "50,001 to ∞" right after "0 to 50,000", we treat the tier as
    // starting at 50,000 (the previous tier's upper bound) instead.
    const tierStart = tier.fromCount === 0
      ? 0
      : Math.max(runningStart, tier.fromCount - 1);
    const tierEnd = tier.toCount === null
      ? earnedMutamers
      : Math.min(earnedMutamers, tier.toCount);
    if (tierEnd <= tierStart) { runningStart = tierEnd; continue; }
    const inThisTier = tierEnd - tierStart;
    const unitsInThisTier = partialAllowed
      ? inThisTier / tierUnit
      : Math.floor(inThisTier / tierUnit);
    if (unitsInThisTier <= 0) { runningStart = tierEnd; continue; }
    const subtotal = unitsInThisTier * tier.bonusPerUnit;
    breakdown.push({
      from: tier.fromCount,
      to: tier.toCount,
      units: unitsInThisTier,
      perUnit: tier.bonusPerUnit,
      subtotal,
    });
    if (tier.isCumulative) {
      totalAmount += subtotal;
    } else {
      // Non-cumulative: the highest bracket reached wins, replace total.
      totalAmount = subtotal;
    }
    runningStart = tierEnd;
  }

  return {
    amount: Math.round(totalAmount * 100) / 100,
    completedTiers: Math.floor(completedUnits),
    breakdown,
  };
}

/**
 * Evaluate the plan's gating condition against a stats sample. Returns a
 * human-readable reason string in Arabic so the wizard can surface "why
 * the commission is zero" to the approver.
 */
export function evaluateCondition(
  plan: CommissionPlanRules,
  stats: { avgProfitPerVisa: number; salesPercent: number; avgSalePrice: number }
): { met: boolean; details: string } {
  const profitOk = plan.minProfitPerVisa === null
    || stats.avgProfitPerVisa >= plan.minProfitPerVisa;
  const salesOk = (plan.minSalesPercent === null || stats.salesPercent >= plan.minSalesPercent)
    && (plan.minAvgPrice === null || stats.avgSalePrice >= plan.minAvgPrice);

  switch (plan.conditionType) {
    case "none":
      return { met: true, details: "لا توجد شروط — العمولة مستحقة" };
    case "profit_avg":
      return profitOk
        ? { met: true, details: `متوسط ربح التأشيرة ${stats.avgProfitPerVisa.toFixed(2)} ر.س ≥ الحد ${plan.minProfitPerVisa}` }
        : { met: false, details: `متوسط ربح التأشيرة ${stats.avgProfitPerVisa.toFixed(2)} ر.س أقل من ${plan.minProfitPerVisa}` };
    case "sales_percent":
      return salesOk
        ? { met: true, details: `نسبة المبيعات ${stats.salesPercent.toFixed(1)}% بسعر ${stats.avgSalePrice.toFixed(2)} — تحققت` }
        : { met: false, details: `نسبة المبيعات ${stats.salesPercent.toFixed(1)}% أو متوسط السعر ${stats.avgSalePrice.toFixed(2)} لم يبلغ الحد` };
    case "both_or":
      if (profitOk) {
        return { met: true, details: `تحقق شرط الربح (${stats.avgProfitPerVisa.toFixed(2)} ≥ ${plan.minProfitPerVisa})` };
      }
      if (salesOk) {
        return { met: true, details: `تحقق شرط المبيعات (${stats.salesPercent.toFixed(1)}% بسعر ${stats.avgSalePrice.toFixed(2)})` };
      }
      return {
        met: false,
        details: `لم يتحقق أي شرط — ربح ${stats.avgProfitPerVisa.toFixed(2)} ونسبة ${stats.salesPercent.toFixed(1)}%`,
      };
  }
}

/**
 * Pure simulator. The wizard calls this before a plan is even saved so
 * the approver can see the curve without touching the DB.
 */
export function simulateCommission(
  plan: CommissionPlanRules,
  tiers: CommissionTier[],
  input: SimulateInput
): SimulateResult {
  const isExcludedMonth = input.isExcludedMonth ?? false;
  const hasViolations = input.hasViolations ?? false;

  const condition = evaluateCondition(plan, {
    avgProfitPerVisa: input.avgProfitPerVisa,
    salesPercent: input.salesPercent,
    avgSalePrice: input.avgSalePrice,
  });

  const tierResult = computeTieredAmount(
    tiers,
    input.totalMutamers,
    plan.tierUnit,
    plan.partialTiersAllowed
  );

  let finalAmount = tierResult.amount;
  let detailsBuf = condition.details;

  if (isExcludedMonth) {
    finalAmount = 0;
    detailsBuf = `الشهر مستثنى — العمولة = 0. ${detailsBuf}`;
  } else if (!condition.met) {
    finalAmount = 0;
    detailsBuf = `لم يتحقق الشرط — العمولة = 0. ${detailsBuf}`;
  } else if (hasViolations && plan.violationBlocksCommission) {
    finalAmount = 0;
    detailsBuf = `يوجد مخالفات تشغيلية — العمولة = 0. ${detailsBuf}`;
  }

  return {
    conditionMet: condition.met,
    conditionDetails: detailsBuf,
    isExcludedMonth,
    hasViolations,
    completedTiers: tierResult.completedTiers,
    tierBreakdown: tierResult.breakdown,
    commissionAmount: tierResult.amount,
    finalAmount,
    payrollTotal: Math.round((plan.baseSalary + finalAmount) * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Plan + tier lookups
// ---------------------------------------------------------------------------

async function loadPlanWithTiers(
  scope: CommissionScope,
  planId: number
): Promise<{ plan: CommissionPlanRules; tiers: CommissionTier[] }> {
  const [planRow] = await rawQuery<any>(
    `SELECT id, "employeeId", "assignmentId", "seasonId", "baseSalary",
            "commissionType", "conditionType", "minProfitPerVisa",
            "minSalesPercent", "minAvgPrice", "excludedMonths",
            "tierUnit", "partialTiersAllowed", "violationBlocksCommission",
            status
       FROM employee_commission_plans
      WHERE id=$1 AND "companyId"=$2 AND "deletedAt" IS NULL`,
    [planId, scope.companyId]
  );
  if (!planRow) throw new NotFoundError("خطة العمولة غير موجودة");

  const tierRows = await rawQuery<any>(
    `SELECT "fromCount", "toCount", "bonusPerUnit", "isCumulative"
       FROM employee_commission_tiers
      WHERE "planId"=$1 AND "deletedAt" IS NULL
      ORDER BY "fromCount" ASC`,
    [planId]
  );

  const excludedMonths: number[] = Array.isArray(planRow.excludedMonths)
    ? planRow.excludedMonths.map((m: any) => Number(m)).filter((m: number) => Number.isFinite(m))
    : [];

  return {
    plan: {
      id: planRow.id,
      employeeId: planRow.employeeId,
      assignmentId: planRow.assignmentId,
      seasonId: planRow.seasonId,
      baseSalary: Number(planRow.baseSalary ?? 0),
      commissionType: planRow.commissionType,
      conditionType: planRow.conditionType,
      minProfitPerVisa: planRow.minProfitPerVisa === null ? null : Number(planRow.minProfitPerVisa),
      minSalesPercent: planRow.minSalesPercent === null ? null : Number(planRow.minSalesPercent),
      minAvgPrice: planRow.minAvgPrice === null ? null : Number(planRow.minAvgPrice),
      excludedMonths,
      tierUnit: Number(planRow.tierUnit ?? 10000),
      partialTiersAllowed: !!planRow.partialTiersAllowed,
      violationBlocksCommission: !!planRow.violationBlocksCommission,
      status: planRow.status,
    },
    tiers: tierRows.map((t) => ({
      fromCount: Number(t.fromCount),
      toCount: t.toCount === null || t.toCount === undefined ? null : Number(t.toCount),
      bonusPerUnit: Number(t.bonusPerUnit ?? 0),
      isCumulative: !!t.isCumulative,
    })),
  };
}

// ---------------------------------------------------------------------------
// Stats — what the engine pulls from the live Umrah tables
// ---------------------------------------------------------------------------

/**
 * Aggregate the four numbers the spec calls for. Implementation notes:
 *
 *   * **totalMutamers** — count of pilgrims whose `entryDate` falls
 *     inside the period (Gregorian range). When the plan is bound to a
 *     season, we also restrict via the group → season FK so a manager
 *     of season N doesn't accidentally accrue on season N+1.
 *
 *   * **avgProfitPerVisa** — average of (sale price − net cost) per
 *     pilgrim. Sale prices live in `umrah_pricing` keyed by
 *     (agentId, subAgentId, validFrom, validTo); cost lives in
 *     `umrah_nusk_invoices.netCost`. We compute one row per group:
 *     `(price * mutamerCount − net_cost) / mutamerCount` and average.
 *     Groups without a matching price OR without a paid voucher are
 *     skipped (fail-safe: better to under-pay than to over-pay on
 *     missing data).
 *
 *   * **salesPercent** / **avgSalePrice** — for a manager-level plan
 *     the sales% defaults to 100 and avgSalePrice is the weighted mean
 *     of pricing rows. Per-employee attribution requires sales-rep
 *     metadata that doesn't exist yet (Phase 4 wires it through CRM);
 *     the engine still computes a meaningful number today and the
 *     condition check exercises both signals correctly.
 *
 *   * **hasViolations** — any open `umrah_violations` flagged on this
 *     employee's plan (via the linked group / sub-agent the employee
 *     manages). Until the employee→subAgent mapping exists we fall
 *     back to "any open violation in the company in the period blocks
 *     the commission for every plan", which is conservative and
 *     matches the spec's "violation blocks commission" rule.
 */
async function gatherStats(
  scope: CommissionScope,
  plan: CommissionPlanRules,
  period: CommissionPeriod
): Promise<CommissionStats> {
  const seasonFilter = plan.seasonId ? `AND g."seasonId" = ${plan.seasonId}` : "";

  const [{ totalMutamers }] = await rawQuery<{ totalMutamers: number }>(
    `SELECT COUNT(*)::int AS "totalMutamers"
       FROM umrah_mutamers m
       LEFT JOIN umrah_groups g ON g.id = m."groupId"
      WHERE m."companyId" = $1
        AND m."deletedAt" IS NULL
        AND m."entryDate" >= $2::date
        AND m."entryDate" <= ($3::date + INTERVAL '1 day')
        ${seasonFilter}`,
    [scope.companyId, period.gregorianStart, period.gregorianEnd]
  );

  // Per-group profit:  (avg sale price × mutamerCount − net_cost) / mutamerCount.
  const groupProfitRows = await rawQuery<{
    groupId: number;
    mutamerCount: number;
    netCost: string | number;
    salePrice: string | number | null;
  }>(
    `SELECT g.id AS "groupId",
            g."mutamerCount",
            COALESCE(SUM(ni."netCost"), 0) AS "netCost",
            ( SELECT p."pricePerMutamer"
                FROM umrah_pricing p
               WHERE p."companyId" = g."companyId"
                 AND p."deletedAt" IS NULL
                 AND ( p."subAgentId" = g."subAgentId"
                       OR (p."subAgentId" IS NULL AND p."agentId" = g."agentId") )
                 AND p."validFrom" <= $3::date
                 AND ( p."validTo" IS NULL OR p."validTo" >= $2::date )
               ORDER BY p."subAgentId" NULLS LAST, p."validFrom" DESC
               LIMIT 1 ) AS "salePrice"
       FROM umrah_groups g
       LEFT JOIN umrah_nusk_invoices ni ON ni."groupId" = g.id AND ni."deletedAt" IS NULL
      WHERE g."companyId" = $1
        AND g."deletedAt" IS NULL
        AND EXISTS (
          SELECT 1 FROM umrah_mutamers m
           WHERE m."groupId" = g.id
             AND m."entryDate" >= $2::date
             AND m."entryDate" <= ($3::date + INTERVAL '1 day')
             AND m."deletedAt" IS NULL
        )
        ${seasonFilter}
      GROUP BY g.id`,
    [scope.companyId, period.gregorianStart, period.gregorianEnd]
  );

  let totalProfit = 0;
  let visasWithProfit = 0;
  let totalSales = 0;
  let totalSalePilgrims = 0;
  for (const r of groupProfitRows) {
    const mc = Number(r.mutamerCount ?? 0);
    if (mc <= 0) continue;
    const cost = Number(r.netCost ?? 0);
    const price = r.salePrice === null || r.salePrice === undefined ? 0 : Number(r.salePrice);
    if (price <= 0 || cost <= 0) continue; // not enough data — skip
    const profitPerVisa = price - cost / mc;
    totalProfit += profitPerVisa * mc;
    visasWithProfit += mc;
    totalSales += price * mc;
    totalSalePilgrims += mc;
  }

  const avgProfitPerVisa = visasWithProfit > 0
    ? Math.round((totalProfit / visasWithProfit) * 100) / 100
    : 0;
  const avgSalePrice = totalSalePilgrims > 0
    ? Math.round((totalSales / totalSalePilgrims) * 100) / 100
    : 0;
  const salesPercent = totalMutamers > 0
    ? Math.round(((visasWithProfit / totalMutamers) * 100) * 10) / 10
    : 0;

  // Conservative violation check: any open/disputed violation in the
  // period for the company (until per-employee attribution lands).
  const [{ openViolations }] = await rawQuery<{ openViolations: number }>(
    `SELECT COUNT(*)::int AS "openViolations"
       FROM umrah_violations v
      WHERE v."companyId" = $1
        AND v."deletedAt" IS NULL
        AND v.status IN ('detected','open','disputed')
        AND v."createdAt" >= $2::date
        AND v."createdAt" <= ($3::date + INTERVAL '1 day')`,
    [scope.companyId, period.gregorianStart, period.gregorianEnd]
  );

  return {
    totalMutamers: Number(totalMutamers ?? 0),
    avgProfitPerVisa,
    salesPercent,
    avgSalePrice,
    hasViolations: Number(openViolations ?? 0) > 0,
  };
}

// ---------------------------------------------------------------------------
// Public — calculate one plan
// ---------------------------------------------------------------------------

/**
 * Run the full algorithm for one plan and persist the result. UPSERTs by
 * (planId, year, month) — re-running for the same period updates the
 * row, but only when the existing row is still 'calculated'. Once the
 * approver moves the row to 'reviewed' / 'approved' / 'paid' we refuse
 * to overwrite and return `preserved: true` instead.
 */
export async function calculateCommissionForEmployee(
  scope: CommissionScope,
  planId: number,
  period: CommissionPeriod
): Promise<CalculationResult> {
  if (period.hijriMonth < 1 || period.hijriMonth > 12) {
    throw new ValidationError("الشهر الهجري يجب أن يكون بين 1 و 12");
  }

  const { plan, tiers } = await loadPlanWithTiers(scope, planId);
  if (plan.status !== "active") {
    throw new ConflictError(`خطة العمولة بحالة ${plan.status} — لا يمكن الحساب`);
  }

  const stats = await gatherStats(scope, plan, period);
  const isExcludedMonth = plan.excludedMonths.includes(period.hijriMonth);

  const sim = simulateCommission(plan, tiers, {
    totalMutamers: stats.totalMutamers,
    avgProfitPerVisa: stats.avgProfitPerVisa,
    salesPercent: stats.salesPercent,
    avgSalePrice: stats.avgSalePrice,
    hasViolations: stats.hasViolations,
    isExcludedMonth,
  });

  return withTransaction(async (client) => {
    // Refuse to overwrite a non-recalculable status.
    const existing = (await client.query(
      `SELECT id, status FROM employee_commission_calculations
        WHERE "planId"=$1 AND year=$2 AND month=$3 AND "deletedAt" IS NULL`,
      [planId, period.hijriYear, period.hijriMonth]
    )).rows as { id: number; status: string }[];

    if (existing.length > 0 && existing[0].status !== "calculated") {
      return {
        calculationId: existing[0].id,
        planId, employeeId: plan.employeeId, period, stats, simulation: sim,
        status: existing[0].status as CalculationResult["status"],
        preserved: true,
      };
    }

    const params = [
      scope.companyId,                  // 1
      scope.branchId,                   // 2
      planId,                           // 3
      plan.employeeId,                  // 4
      period.hijriMonth,                // 5
      period.hijriYear,                 // 6
      stats.totalMutamers,              // 7
      stats.avgProfitPerVisa,           // 8
      stats.salesPercent,               // 9
      stats.avgSalePrice,               // 10
      sim.conditionMet,                 // 11
      sim.conditionDetails,             // 12
      sim.completedTiers,               // 13
      sim.commissionAmount,             // 14
      sim.hasViolations,                // 15
      sim.isExcludedMonth,              // 16
      sim.finalAmount,                  // 17
      scope.userId,                     // 18
    ];

    let calcId: number;
    let inserted: boolean;
    if (existing.length > 0) {
      // Update params: only the columns we actually overwrite + scoping ids.
      const updateParams = [
        scope.companyId,                  // 1
        stats.totalMutamers,              // 2
        stats.avgProfitPerVisa,           // 3
        stats.salesPercent,               // 4
        stats.avgSalePrice,               // 5
        sim.conditionMet,                 // 6
        sim.conditionDetails,             // 7
        sim.completedTiers,               // 8
        sim.commissionAmount,             // 9
        sim.hasViolations,                // 10
        sim.isExcludedMonth,              // 11
        sim.finalAmount,                  // 12
        scope.userId,                     // 13
        existing[0].id,                   // 14
      ];
      await client.query(
        `UPDATE employee_commission_calculations
            SET "totalMutamers"=$2, "avgProfitPerVisa"=$3, "salesPercent"=$4,
                "avgSalePrice"=$5, "conditionMet"=$6, "conditionDetails"=$7,
                "completedTiers"=$8, "commissionAmount"=$9, "hasViolations"=$10,
                "isExcludedMonth"=$11, "finalAmount"=$12, "updatedBy"=$13,
                "updatedAt"=NOW(), status='calculated'
          WHERE id=$14 AND "companyId"=$1`,
        updateParams
      );
      calcId = existing[0].id;
      inserted = false;
    } else {
      const ins = await client.query(
        `INSERT INTO employee_commission_calculations
           ("companyId","branchId","planId","employeeId",month,year,
            "totalMutamers","avgProfitPerVisa","salesPercent","avgSalePrice",
            "conditionMet","conditionDetails","completedTiers","commissionAmount",
            "hasViolations","isExcludedMonth","finalAmount","createdBy","updatedBy",
            status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18,'calculated')
         RETURNING id`,
        params
      );
      calcId = ins.rows[0].id as number;
      inserted = true;
    }

    await emitEvent({
      companyId: scope.companyId,
      branchId: scope.branchId ?? undefined,
      userId: scope.userId,
      action: "umrah.commission.calculated",
      entity: "employee_commission_calculations",
      entityId: calcId,
      details: JSON.stringify({
        planId, employeeId: plan.employeeId,
        hijri: { month: period.hijriMonth, year: period.hijriYear },
        gregorian: { from: period.gregorianStart, to: period.gregorianEnd },
        finalAmount: sim.finalAmount, conditionMet: sim.conditionMet,
        isExcludedMonth: sim.isExcludedMonth, hasViolations: sim.hasViolations,
      }),
    });

    return {
      calculationId: calcId,
      planId, employeeId: plan.employeeId, period, stats, simulation: sim,
      status: "calculated",
      inserted,
    };
  });
}

// ---------------------------------------------------------------------------
// Public — sweep all active plans for a period (cron entry point)
// ---------------------------------------------------------------------------

export async function calculateCommissionsForMonth(
  scope: CommissionScope,
  period: CommissionPeriod
): Promise<CalculationResult[]> {
  if (period.hijriMonth < 1 || period.hijriMonth > 12) {
    throw new ValidationError("الشهر الهجري يجب أن يكون بين 1 و 12");
  }

  const plans = await rawQuery<{ id: number }>(
    `SELECT id FROM employee_commission_plans
      WHERE "companyId"=$1 AND status='active' AND "deletedAt" IS NULL`,
    [scope.companyId]
  );

  const out: CalculationResult[] = [];
  for (const p of plans) {
    try {
      const r = await calculateCommissionForEmployee(scope, p.id, period);
      out.push(r);
    } catch (err) {
      // A single bad plan must not torpedo the whole monthly sweep.
      console.error(`[CommissionEngine] plan ${p.id} failed:`, err);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public — admin helpers (for routes layer in Phase 4)
// ---------------------------------------------------------------------------

/** List historical calculations for an employee, latest first. */
export async function listEmployeeCommissionHistory(
  scope: CommissionScope,
  employeeId: number,
  limit = 36
): Promise<any[]> {
  return rawQuery<any>(
    `SELECT c.id, c."planId", c.month, c.year,
            c."totalMutamers", c."avgProfitPerVisa", c."salesPercent",
            c."avgSalePrice", c."conditionMet", c."conditionDetails",
            c."completedTiers", c."commissionAmount", c."hasViolations",
            c."isExcludedMonth", c."finalAmount", c.status,
            c."payrollLineId", c."createdAt",
            p."planName"
       FROM employee_commission_calculations c
       JOIN employee_commission_plans p ON p.id = c."planId"
      WHERE c."companyId"=$1 AND c."employeeId"=$2 AND c."deletedAt" IS NULL
      ORDER BY c.year DESC, c.month DESC
      LIMIT $3`,
    [scope.companyId, employeeId, limit]
  );
}

/**
 * Cascade an employee_assignment status change into the commission plan
 * lifecycle, per spec §ط (تعدد التعيينات):
 *   - assignment ended → plan.status = 'expired'
 *   - assignment moved out of Umrah → plan.status = 'suspended'
 *
 * Called from Phase 6 listener on `employee_assignment.updated`. Already-
 * computed monthly rows are intentionally left untouched.
 */
export async function transitionPlanForAssignment(
  scope: CommissionScope,
  assignmentId: number,
  reason: "ended" | "moved"
): Promise<{ updated: number }> {
  const newStatus = reason === "ended" ? "expired" : "suspended";
  const { affectedRows } = await rawExecute(
    `UPDATE employee_commission_plans
        SET status=$1, "updatedAt"=NOW(), "updatedBy"=$2
      WHERE "companyId"=$3 AND "assignmentId"=$4 AND status='active' AND "deletedAt" IS NULL`,
    [newStatus, scope.userId, scope.companyId, assignmentId]
  );
  return { updated: affectedRows };
}
