import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §5 of #1870 — pins the three commission-editor bugs reported by
 * the operator:
 *
 *   1. "النظام يطلب الراتب الأساسي يدوياً رغم أن الموظف موجود في HR"
 *      → BaseSalaryField watches assignmentId + auto-fills from
 *        the umrah_employee_assignments.salary value.
 *
 *   2. "صفحة التعديل لا تُعرّض الخطة"
 *      → remountKey switched from `loadQ.data?.data?.id ?? "loading"`
 *        to `planId ?? "loading"`. The URL param is stable across
 *        the query lifecycle so the form no longer remounts when
 *        loadQ re-validates.
 *
 *   3. "المحاكي لا يعمل" + "صفحة التعديل لا تُعرّض الخطة"
 *      → Simulator works in BOTH create AND edit modes.
 *        - planRowId present → existing /commission-plans/:id/simulate
 *        - planRowId absent  → new /commission-plans/simulate (no :id)
 *          that takes plan + tiers inline from the live form.
 *        - What-if overrides (totalMutamers, avgProfitPerVisa,
 *          avgSalePrice, salesPercent) are honoured on BOTH paths;
 *          previously the FE sent them and the engine ignored them.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahCommissionEngine.ts"),
  "utf8",
);
const EDITOR = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/commission-plan-editor.tsx"),
  "utf8",
);

describe("engine — simulator honours what-if overrides", () => {
  it("CommissionSimulationOverrides interface declares the four override fields", () => {
    expect(ENGINE).toMatch(/export interface CommissionSimulationOverrides \{/);
    expect(ENGINE).toMatch(/totalMutamers\?: number;/);
    expect(ENGINE).toMatch(/avgProfitPerVisa\?: number;/);
    expect(ENGINE).toMatch(/avgSalePrice\?: number;/);
    expect(ENGINE).toMatch(/salesPercent\?: number;/);
  });

  it("compute() reads each override with a fallback to the DB-derived actual", () => {
    expect(ENGINE).toMatch(/const totalMutamers = overrides\?\.totalMutamers \?\? \(Number\(mutamerStats\.total\) \|\| 0\)/);
    expect(ENGINE).toMatch(/const avgProfitPerVisa = overrides\?\.avgProfitPerVisa \?\? \(Number\(mutamerStats\.avg_profit\) \|\| 0\)/);
    expect(ENGINE).toMatch(/const avgSalePrice = overrides\?\.avgSalePrice \?\? \(Number\(mutamerStats\.avg_price\) \|\| 0\)/);
    expect(ENGINE).toMatch(/const salesPercent = overrides\?\.salesPercent \?\? \(totalCompanySales > 0/);
  });

  it("simulateCommission threads overrides through to compute()", () => {
    expect(ENGINE).toMatch(/return compute\(queryFn, plan, tiers, month, year, overrides\)/);
  });

  it("exports simulateCommissionAdHoc for the editor's create-mode simulator", () => {
    expect(ENGINE).toMatch(/^export async function simulateCommissionAdHoc\(/m);
  });
});

describe("route — /commission-plans/simulate accepts plan + tiers inline", () => {
  it("simulateCommissionSchema accepts the four override fields", () => {
    // Pin the schema block + each override field separately so the
    // assertion doesn't depend on comment-line counts between fields.
    expect(ROUTE).toMatch(/simulateCommissionSchema = z\.object\(\{/);
    expect(ROUTE).toContain("totalMutamers: z.coerce.number().nonnegative().optional()");
    expect(ROUTE).toContain("avgProfitPerVisa: z.coerce.number().nonnegative().optional()");
    expect(ROUTE).toContain("avgSalePrice: z.coerce.number().nonnegative().optional()");
    expect(ROUTE).toContain("salesPercent: z.coerce.number().min(0).max(100).optional()");
  });

  it("declares the ad-hoc simulatePlanInlineSchema", () => {
    expect(ROUTE).toMatch(/const simulatePlanInlineSchema = z\.object\(\{[\s\S]{0,200}plan: z\.object/);
    expect(ROUTE).toMatch(/tiers: z\.array\(z\.object\(/);
  });

  it("the /commission-plans/simulate route exists (no :id segment)", () => {
    expect(ROUTE).toMatch(/router\.post\("\/commission-plans\/simulate"/);
  });

  it("the ad-hoc handler forces companyId from req.scope (cross-tenant defence)", () => {
    expect(ROUTE).toMatch(/const planForEngine: any = \{ \.\.\.plan, companyId: scope\.companyId \}/);
  });

  it("the persisted simulate handler forwards overrides into simulateCommission", () => {
    expect(ROUTE).toMatch(/await simulateCommission\(id, month, year, scope\.companyId, \{\s*[\r\n]+\s*totalMutamers, avgProfitPerVisa, avgSalePrice, salesPercent,/);
  });
});

describe("editor — Bug 1: baseSalary auto-fills from HR", () => {
  it("the manual <FormNumberField name=\"baseSalary\"> on the basic tab is replaced with <BaseSalaryField />", () => {
    // The standalone field still exists INSIDE BaseSalaryField — we
    // just don't want it sitting in the BasicTab grid raw anymore.
    // Pin via the wrapping component name.
    expect(EDITOR).toMatch(/<BaseSalaryField \/>/);
  });

  it("BaseSalaryField watches assignmentId and reads the assignment's salary", () => {
    expect(EDITOR).toMatch(/function BaseSalaryField\(\)/);
    expect(EDITOR).toMatch(/useWatch<PlanForm, "assignmentId">\(\{ name: "assignmentId" \}\)/);
    expect(EDITOR).toMatch(/selected\.salary/);
  });

  it("auto-fill respects the operator's manual override (dirty flag)", () => {
    // Without this guard, every employee/assignment switch would
    // clobber the operator's typed baseSalary.
    expect(EDITOR).toMatch(/!formState\.dirtyFields\.baseSalary/);
    expect(EDITOR).toMatch(/setValue\("baseSalary", Number\(selected\.salary\), \{ shouldDirty: false \}\)/);
  });

  it("renders an operator-facing hint about the auto-fill source", () => {
    expect(EDITOR).toMatch(/data-testid="base-salary-hint"/);
    expect(EDITOR).toMatch(/مأخوذ تلقائياً من HR/);
  });
});

describe("editor — Bug 2: edit page renders the loaded plan", () => {
  it("remountKey is derived from the stable URL planId, not the volatile loadQ.data", () => {
    // The old `loadQ.data?.data?.id ?? "loading"` blanked the form
    // every time the query re-validated. planId comes from useRoute
    // and never flips back to undefined while we're on the page.
    expect(EDITOR).toMatch(/const remountKey = isEditMode \? \(planId \?\? "loading"\) : "new";/);
  });

  it("planDefaults still hydrates from loadQ.data when edit-mode data arrives", () => {
    expect(EDITOR).toMatch(/if \(isEditMode && loadQ\.data\?\.data\) \{/);
  });
});

describe("editor — Bug 3: simulator works in BOTH create and edit modes", () => {
  it("SimulatorTab component is extracted (reads parent form via useFormContext)", () => {
    expect(EDITOR).toMatch(/function SimulatorTab\(\{/);
    expect(EDITOR).toMatch(/getValues: getPlanValues/);
  });

  it("simulator no longer hard-rejects when planRowId is missing", () => {
    // Old code: `if (!planRowId) { toast({ ...يرجى حفظ الخطة أولاً...
    //                              return; }`. New code branches
    // between persisted and ad-hoc endpoints.
    expect(EDITOR).not.toMatch(/يرجى حفظ الخطة أولاً قبل التشغيل التجريبي/);
  });

  it("create-mode path POSTs to /commission-plans/simulate with the live plan", () => {
    expect(EDITOR).toMatch(/`\/umrah\/commission-plans\/simulate`/);
    expect(EDITOR).toMatch(/const live = getPlanValues\(\)/);
    expect(EDITOR).toMatch(/plan: \{[\s\S]{0,200}commissionType: live\.commissionType/);
    expect(EDITOR).toMatch(/tiers: \(live\.tiers \?\? \[\]\)\.map/);
  });

  it("persisted-mode path stays at the legacy /commission-plans/:id/simulate URL", () => {
    expect(EDITOR).toMatch(/`\/umrah\/commission-plans\/\$\{planRowId\}\/simulate`/);
  });

  it("today's month/year is computed via Riyadh helpers (check:finance-period-drift)", () => {
    // The simulator schedules a JE in the user's month/year. Without
    // the Riyadh-time helpers, a UTC-side clock that's 3h behind shifts
    // the calculation month by a day at month boundaries — the
    // finance-period-drift guard rejects raw new Date().getMonth() here.
    expect(EDITOR).toMatch(/const month = Number\(currentMonthPaddedRiyadh\(\)\)/);
    expect(EDITOR).toMatch(/const year = currentYearRiyadh\(\)/);
    expect(EDITOR).toMatch(/import \{[\s\S]{0,200}currentMonthPaddedRiyadh[\s\S]{0,100}currentYearRiyadh/);
  });

  it("create-mode hint banner replaces the legacy 'save first' warning", () => {
    expect(EDITOR).toMatch(/data-testid="simulator-create-mode-hint"/);
    expect(EDITOR).toMatch(/وضع المحاكاة قبل الحفظ/);
  });

  it("validates that employee + season are picked before ad-hoc simulation", () => {
    // Without these the engine's compute() can't run its
    // per-employee SQL — emit a clear operator-facing error
    // instead of a 500 from the server.
    expect(EDITOR).toMatch(/أكمل المعلومات الأساسية أولاً/);
  });
});
