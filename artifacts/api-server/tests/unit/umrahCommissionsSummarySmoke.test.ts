import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §11 partial → full conversion — commissions summary report.
 *
 * Pins:
 *   1. /umrah/reports/commissions-summary serves KPIs + 3
 *      breakdowns (by status / month / employee) + recent 100 rows.
 *   2. Filters: seasonId (chained via plan), employeeId, year,
 *      status (direct columns on the calculations table).
 *   3. 5 parallel aggregations via Promise.all.
 *   4. byEmployee joins employees for the display name + sorts by
 *      total payout desc.
 *   5. recent joins both employees AND plans for the display row.
 *   6. FE: 5 KPI tiles + 3 breakdown tabs + recent table with
 *      drill-through to /employees/:id + /umrah/commission-plans/:id/edit.
 *   7. Route registered.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/commissions-summary.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);

describe("API — /umrah/reports/commissions-summary", () => {
  it("declares the route", () => {
    expect(ROUTE).toMatch(/router\.get\("\/reports\/commissions-summary"/);
  });

  it("seasonId chains via employee_commission_plans (calculations has no seasonId)", () => {
    expect(ROUTE).toMatch(/EXISTS \(\s*[\r\n]+\s*SELECT 1 FROM employee_commission_plans cp/);
    expect(ROUTE).toMatch(/WHERE cp\.id = cc\."planId"/);
    expect(ROUTE).toMatch(/AND cp\."seasonId" = \$/);
  });

  it("5 parallel aggregations via Promise.all", () => {
    expect(ROUTE).toMatch(/const \[kpiRow, byStatus, byMonth, byEmployee, recent\] = await Promise\.all/);
  });

  it("KPIs split paid vs pending amounts", () => {
    expect(ROUTE).toMatch(/COALESCE\(SUM\(CASE WHEN cc\.status = 'paid' THEN cc\."finalAmount" ELSE 0 END\), 0\)::text AS "paidAmount"/);
    expect(ROUTE).toMatch(/COALESCE\(SUM\(CASE WHEN cc\.status NOT IN \('paid'\) THEN cc\."finalAmount" ELSE 0 END\), 0\)::text AS "pendingAmount"/);
  });

  it("KPIs count distinct employees", () => {
    expect(ROUTE).toMatch(/COUNT\(DISTINCT cc\."employeeId"\)::text AS "employeesCount"/);
  });

  it("byMonth groups by (year, month) ordered desc with LIMIT 12", () => {
    expect(ROUTE).toMatch(/GROUP BY cc\.year, cc\.month/);
    expect(ROUTE).toMatch(/ORDER BY cc\.year DESC, cc\.month DESC\s+LIMIT 12/);
  });

  it("byEmployee joins employees tenant-safely + sorts by SUM(finalAmount) desc", () => {
    expect(ROUTE).toMatch(/LEFT JOIN employees e ON e\.id = cc\."employeeId"/);
    expect(ROUTE).toMatch(/AND e\."companyId" = cc\."companyId"\s+AND e\."deletedAt" IS NULL/);
    expect(ROUTE).toMatch(/ORDER BY SUM\(cc\."finalAmount"\) DESC NULLS LAST/);
    expect(ROUTE).toMatch(/LIMIT 50/);
  });

  it("recent joins plan + employee for display + LIMIT 100", () => {
    expect(ROUTE).toMatch(/LEFT JOIN employee_commission_plans cp/);
    expect(ROUTE).toMatch(/ORDER BY cc\.year DESC, cc\.month DESC, cc\."finalAmount" DESC/);
    expect(ROUTE).toMatch(/LIMIT 100/);
  });
});

describe("FE — Commissions summary page", () => {
  it("fetches the endpoint with all 4 filters", () => {
    expect(PAGE).toMatch(/`\/umrah\/reports\/commissions-summary\$\{qs\}`/);
    for (const f of ["seasonId", "employeeId", "status", "year"]) {
      expect(PAGE).toContain(`${f}=`);
    }
  });

  it("renders 5 KPI tiles", () => {
    for (const t of [
      "commissions-kpi-total",
      "commissions-kpi-employees",
      "commissions-kpi-calculated",
      "commissions-kpi-paid",
      "commissions-kpi-pending",
    ]) {
      expect(PAGE).toContain(`testid="${t}"`);
    }
  });

  it("renders 3 breakdown tabs (status / month / employee)", () => {
    expect(PAGE).toMatch(/data-testid="commissions-tab-status"/);
    expect(PAGE).toMatch(/data-testid="commissions-tab-month"/);
    expect(PAGE).toMatch(/data-testid="commissions-tab-employee"/);
  });

  it("month breakdown formats keys as 'يناير 2026'", () => {
    expect(PAGE).toMatch(/\$\{MONTH_NAMES_AR\[r\.month - 1\] \?\? r\.month\} \$\{r\.year\}/);
  });

  it("employee breakdown links each row to /employees/:id", () => {
    expect(PAGE).toMatch(/href: `\/employees\/\$\{r\.employeeId\}`/);
  });

  it("recent table drills through to /employees/:id + /umrah/commission-plans/:id/edit", () => {
    expect(PAGE).toMatch(/href=\{`\/employees\/\$\{r\.employeeId\}`\}/);
    expect(PAGE).toMatch(/href=\{`\/umrah\/commission-plans\/\$\{r\.planId\}\/edit`\}/);
  });

  it("status enum has 6 Arabic labels", () => {
    for (const label of ["محتسبة", "مدفوعة", "مرحَّلة", "معتمدة", "بانتظار الاعتماد", "ملغاة"]) {
      expect(PAGE).toContain(label);
    }
  });

  it("empty-state when zero recent rows", () => {
    expect(PAGE).toMatch(/data-testid="commissions-recent-empty"/);
    expect(PAGE).toMatch(/لا احتسابات تطابق الفلاتر/);
  });
});

describe("FE — route registration", () => {
  it("/umrah/reports/commissions-summary is registered", () => {
    expect(ROUTES).toMatch(/UmrahCommissionsSummaryReport = lazy/);
    expect(ROUTES).toMatch(/path: "\/umrah\/reports\/commissions-summary"/);
  });
});