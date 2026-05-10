#!/usr/bin/env node
/**
 * Smoke test for umrahCommissionEngine.
 *
 * Three scenarios mirror the spec's §9.3 examples:
 *   (1) Ibrahim @ 37,000 mutamers + 28 SAR profit + 22% sales + 155 SAR avg
 *       → 3 completed tiers × 500 SAR = 1,500 SAR (+ 3,500 base = 5,000)
 *   (2) Same Ibrahim in Hijri month 11 (Dhu al-Qa'da) → excluded → 0 SAR
 *   (3) Same Ibrahim with profit 18 SAR + sales 15% → conditions fail → 0 SAR
 *
 * Then a real-data calculate flow against a synthetic plan + tiers
 * inserted into the live tables, verifying UPSERT behaviour + status
 * preservation + the listEmployeeCommissionHistory helper.
 */
process.env.DATABASE_URL ??= "postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp";

import { pool, rawQuery, rawExecute } from "../src/lib/rawdb.ts";
import {
  simulateCommission,
  calculateCommissionForEmployee,
  calculateCommissionsForMonth,
  listEmployeeCommissionHistory,
  transitionPlanForAssignment,
  computeTieredAmount,
} from "../src/lib/umrahCommissionEngine.ts";

function assert(cond, msg) {
  if (!cond) {
    console.error("✗", msg);
    process.exit(1);
  }
  console.log("  ✓", msg);
}

const IBRAHIM_PLAN = {
  id: 0, // overwritten after insert
  employeeId: 1,
  assignmentId: null,
  seasonId: null,
  baseSalary: 3500,
  commissionType: "tiered",
  conditionType: "both_or",
  minProfitPerVisa: 25,
  minSalesPercent: 20,
  minAvgPrice: 140,
  excludedMonths: [11, 12],
  tierUnit: 10000,
  partialTiersAllowed: false,
  violationBlocksCommission: true,
  status: "active",
};

const IBRAHIM_TIERS = [
  { fromCount: 0, toCount: 50000, bonusPerUnit: 500, isCumulative: true },
  { fromCount: 50001, toCount: null, bonusPerUnit: 1000, isCumulative: true },
];

async function reset() {
  await rawExecute(`DELETE FROM employee_commission_calculations WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM employee_commission_tiers WHERE "companyId"=1`);
  await rawExecute(`DELETE FROM employee_commission_plans WHERE "companyId"=1`);
}

async function main() {
  await reset();

  console.log("\n[1] Spec example #1 — Ibrahim @ 37,000 (Muharram, conditions OK)");
  const sim1 = simulateCommission(IBRAHIM_PLAN, IBRAHIM_TIERS, {
    totalMutamers: 37000,
    avgProfitPerVisa: 28,
    salesPercent: 22,
    avgSalePrice: 155,
    isExcludedMonth: false,
    hasViolations: false,
  });
  assert(sim1.conditionMet === true, "condition met");
  assert(sim1.completedTiers === 3, `3 completed tiers (got ${sim1.completedTiers})`);
  assert(sim1.commissionAmount === 1500, `commission = 1500 (got ${sim1.commissionAmount})`);
  assert(sim1.finalAmount === 1500, `finalAmount = 1500 (got ${sim1.finalAmount})`);
  assert(sim1.payrollTotal === 5000, `payrollTotal = 5000 (got ${sim1.payrollTotal})`);

  console.log("\n[2] Spec example #2 — same Ibrahim, Dhu al-Qa'da (Hijri month 11) → 0");
  const sim2 = simulateCommission(IBRAHIM_PLAN, IBRAHIM_TIERS, {
    totalMutamers: 45000,
    avgProfitPerVisa: 30,
    salesPercent: 25,
    avgSalePrice: 160,
    isExcludedMonth: true,
    hasViolations: false,
  });
  assert(sim2.commissionAmount === 2000, `commission still computed = 2000 (got ${sim2.commissionAmount})`);
  assert(sim2.finalAmount === 0, `finalAmount = 0 (excluded month) (got ${sim2.finalAmount})`);
  assert(sim2.payrollTotal === 3500, `payrollTotal = 3500 (base only) (got ${sim2.payrollTotal})`);
  assert(sim2.conditionDetails.includes("الشهر مستثنى"), "details mention excluded month");

  console.log("\n[3] Spec example #3 — Ibrahim with low profit 18 SAR + 15% → conditions fail → 0");
  const sim3 = simulateCommission(IBRAHIM_PLAN, IBRAHIM_TIERS, {
    totalMutamers: 40000,
    avgProfitPerVisa: 18,
    salesPercent: 15,
    avgSalePrice: 130,
    isExcludedMonth: false,
    hasViolations: false,
  });
  assert(sim3.conditionMet === false, "condition NOT met");
  assert(sim3.finalAmount === 0, `finalAmount = 0 (got ${sim3.finalAmount})`);
  assert(sim3.payrollTotal === 3500, `payrollTotal = 3500 (got ${sim3.payrollTotal})`);

  console.log("\n[4] Operational violation blocks commission");
  const sim4 = simulateCommission(IBRAHIM_PLAN, IBRAHIM_TIERS, {
    totalMutamers: 37000,
    avgProfitPerVisa: 28,
    salesPercent: 22,
    avgSalePrice: 155,
    isExcludedMonth: false,
    hasViolations: true,
  });
  assert(sim4.commissionAmount === 1500, "commission still computed = 1500 (pre-block)");
  assert(sim4.finalAmount === 0, `finalAmount = 0 (violation blocks) (got ${sim4.finalAmount})`);
  assert(sim4.conditionDetails.includes("مخالفات تشغيلية"), "details mention violations");

  console.log("\n[5] Tier ladder edge cases");
  const ladder = computeTieredAmount(IBRAHIM_TIERS, 10000, 10000, false);
  assert(ladder.amount === 500 && ladder.completedTiers === 1, "exactly 10,000 = 1 tier × 500");
  const ladder2 = computeTieredAmount(IBRAHIM_TIERS, 9999, 10000, false);
  assert(ladder2.amount === 0 && ladder2.completedTiers === 0, "9,999 = 0 tiers (no partial)");
  const ladder3 = computeTieredAmount(IBRAHIM_TIERS, 60000, 10000, false);
  assert(ladder3.amount === 3500 && ladder3.completedTiers === 6,
    `60,000 = 5×500 + 1×1000 = 3500 (got ${ladder3.amount})`);
  const ladderPartial = computeTieredAmount(IBRAHIM_TIERS, 9999, 10000, true);
  assert(ladderPartial.amount > 0,
    "partial allowed: 9,999 produces partial tier amount > 0");

  // -------- DB scenarios: insert plan + tiers + calculate ----------
  console.log("\n[6] DB scenario — calculate against live tables (no mutamer data)");
  const ins = await rawQuery(
    `INSERT INTO employee_commission_plans
       ("companyId","branchId","employeeId","planName","baseSalary","commissionType",
        "conditionType","minProfitPerVisa","minSalesPercent","minAvgPrice",
        "excludedMonths","tierUnit","partialTiersAllowed","violationBlocksCommission",
        status,"createdBy","updatedBy")
     VALUES (1,1,1,'خطة إبراهيم 1447',3500,'tiered','both_or',25,20,140,
             '[11,12]'::jsonb,10000,false,true,'active',1,1)
     RETURNING id`
  );
  const planId = ins[0].id;
  await rawExecute(
    `INSERT INTO employee_commission_tiers
       ("companyId","branchId","planId","fromCount","toCount","bonusPerUnit","isCumulative",
        "createdBy","updatedBy")
     VALUES (1,1,$1,0,50000,500,true,1,1),
            (1,1,$1,50001,NULL,1000,true,1,1)`,
    [planId]
  );

  const period = {
    hijriMonth: 1, hijriYear: 1447,
    gregorianStart: "2026-01-01", gregorianEnd: "2026-01-31",
  };
  const scope = { companyId: 1, branchId: 1, userId: 1 };

  const calc1 = await calculateCommissionForEmployee(scope, planId, period);
  assert(calc1.calculationId > 0, `calculation row created (id=${calc1.calculationId})`);
  assert(calc1.inserted === true, "first run = inserted");
  assert(calc1.simulation.isExcludedMonth === false, "Muharram is not excluded");
  // Without mutamer data, totalMutamers will be 0, condition can still pass via 'none' logic — but conditionType is both_or so it fails.
  console.log("    stats:", calc1.stats);

  // Re-run → updated, not new row
  const calc2 = await calculateCommissionForEmployee(scope, planId, period);
  assert(calc2.calculationId === calc1.calculationId, "re-run uses same row");
  assert(calc2.inserted === false, "second run = updated");

  // Move row to 'reviewed' → re-run is preserved
  await rawExecute(
    `UPDATE employee_commission_calculations SET status='reviewed' WHERE id=$1`,
    [calc1.calculationId]
  );
  const calc3 = await calculateCommissionForEmployee(scope, planId, period);
  assert(calc3.preserved === true, "reviewed row is preserved");
  assert(calc3.status === "reviewed", "status remains 'reviewed'");

  console.log("\n[7] Excluded month — Dhu al-Qa'da (11)");
  const period11 = {
    hijriMonth: 11, hijriYear: 1447,
    gregorianStart: "2026-05-01", gregorianEnd: "2026-05-31",
  };
  const calc11 = await calculateCommissionForEmployee(scope, planId, period11);
  assert(calc11.simulation.isExcludedMonth === true, "month 11 is excluded");
  assert(calc11.simulation.finalAmount === 0, `finalAmount = 0 (got ${calc11.simulation.finalAmount})`);

  console.log("\n[8] Monthly sweep — calculateCommissionsForMonth");
  const sweep = await calculateCommissionsForMonth(scope, period);
  assert(sweep.length >= 1, `swept at least 1 plan (got ${sweep.length})`);

  console.log("\n[9] History helper");
  const history = await listEmployeeCommissionHistory(scope, 1, 10);
  assert(history.length >= 1, `history returned ${history.length} row(s)`);
  assert(history[0].planName.includes("إبراهيم"), "planName preserved through join");

  console.log("\n[10] transitionPlanForAssignment — placeholder (no assignmentId on this plan)");
  const t = await transitionPlanForAssignment(scope, 99999, "moved");
  assert(t.updated === 0, "no rows match unknown assignmentId");

  // Cleanup
  await reset();

  console.log("\n✅ All commission-engine smoke checks passed.\n");
  await pool.end();
}

main().catch((err) => {
  console.error("\n✗ Smoke test failed:", err);
  pool.end().finally(() => process.exit(1));
});
