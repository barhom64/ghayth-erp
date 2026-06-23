import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §11 partial → full conversion — Violations summary report.
 *
 * Pins:
 *   1. /umrah/reports/violations-summary serves KPI counts +
 *      3 breakdowns (by status / type / month) + recent list.
 *   2. Filters: seasonId (chained via mutamerId → pilgrim's
 *      seasonId, since umrah_violations has no seasonId column),
 *      agentId, date range on detectedAt.
 *   3. Date filter is YYYY-MM-DD validated.
 *   4. byMonth bucketing uses TO_CHAR + 12-month cap so the FE
 *      can render a sparkline without trimming.
 *   5. recent rows join through to pilgrim + agent names for
 *      one-trip rendering.
 *   6. FE page renders 5 KPI tiles + 3 group-by tabs + recent
 *      table with drill-through to /umrah/violations/:id +
 *      /umrah/pilgrims/:id + /umrah/agents/:id.
 *   7. Route registered.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/violations-summary.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);

describe("API — /umrah/reports/violations-summary", () => {
  it("declares the route", () => {
    expect(ROUTE).toMatch(/router\.get\("\/reports\/violations-summary"/);
  });

  it("seasonId chains through umrah_pilgrims (the table has no seasonId column)", () => {
    expect(ROUTE).toMatch(/EXISTS \(\s*[\r\n]+\s*SELECT 1 FROM umrah_pilgrims p/);
    expect(ROUTE).toMatch(/WHERE p\.id = v\."mutamerId"/);
    expect(ROUTE).toMatch(/AND p\."seasonId" = \$/);
  });

  it("date filters validate YYYY-MM-DD before binding", () => {
    expect(ROUTE).toMatch(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(fromStr\)/);
    expect(ROUTE).toMatch(/\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(toStr\)/);
  });

  it("4 parallel aggregations via Promise.all", () => {
    expect(ROUTE).toMatch(/const \[kpiRow, byStatus, byType, byMonth, recent\] = await Promise\.all/);
  });

  it("KPI row splits open vs closed against the violation status enum", () => {
    expect(ROUTE).toMatch(/SUM\(CASE WHEN v\.status IN \('detected','open','invoiced','disputed'\) THEN 1 ELSE 0 END\)/);
    expect(ROUTE).toMatch(/SUM\(CASE WHEN v\.status IN \('paid','closed'\) THEN 1 ELSE 0 END\)/);
  });

  it("pendingPenalty excludes paid + closed", () => {
    expect(ROUTE).toMatch(/SUM\(CASE WHEN v\.status NOT IN \('paid','closed'\) THEN v\."penaltyAmount" ELSE 0 END\)/);
  });

  it("byMonth uses TO_CHAR(YYYY-MM) + LIMIT 12 (12-month sparkline window)", () => {
    expect(ROUTE).toMatch(/TO_CHAR\(v\."detectedAt", 'YYYY-MM'\) AS month/);
    expect(ROUTE).toMatch(/LIMIT 12/);
  });

  it("recent joins to pilgrim + agent names tenant-safely", () => {
    expect(ROUTE).toMatch(/LEFT JOIN umrah_pilgrims p ON p\.id = v\."mutamerId" AND p\."companyId" = v\."companyId" AND p\."deletedAt" IS NULL/);
    expect(ROUTE).toMatch(/LEFT JOIN umrah_agents a\s+ON a\.id = v\."agentId"\s+AND a\."companyId" = v\."companyId" AND a\."deletedAt" IS NULL/);
  });

  it("recent capped at 100 + ordered detectedAt desc", () => {
    expect(ROUTE).toMatch(/ORDER BY v\."detectedAt" DESC, v\.id DESC\s+LIMIT 100/);
  });
});

describe("FE — Violations summary page", () => {
  it("fetches the report endpoint with all 4 filters", () => {
    expect(PAGE).toMatch(/`\/umrah\/reports\/violations-summary\$\{qs\}`/);
    for (const f of ["seasonId", "agentId", "from", "to"]) {
      expect(PAGE).toContain(`${f}=`);
    }
  });

  it("renders 5 KPI tiles", () => {
    for (const t of [
      "violations-kpi-total",
      "violations-kpi-open",
      "violations-kpi-closed",
      "violations-kpi-total-penalty",
      "violations-kpi-pending-penalty",
    ]) {
      expect(PAGE).toContain(`testid="${t}"`);
    }
  });

  it("renders 3 breakdown tabs (status / type / month)", () => {
    expect(PAGE).toMatch(/data-testid="violations-tab-status"/);
    expect(PAGE).toMatch(/data-testid="violations-tab-type"/);
    expect(PAGE).toMatch(/data-testid="violations-tab-month"/);
  });

  it("STATUS_LABEL_AR covers the 6 statuses from the violation enum", () => {
    for (const label of ["مرصودة", "مفتوحة", "مفوترة", "مدفوعة", "محل اعتراض", "مغلقة"]) {
      expect(PAGE).toContain(label);
    }
  });

  it("recent rows drill through to /umrah/violations/:id + /umrah/pilgrims/:id + /umrah/agents/:id", () => {
    expect(PAGE).toMatch(/href=\{`\/umrah\/violations\/\$\{r\.id\}`\}/);
    expect(PAGE).toMatch(/href=\{`\/umrah\/pilgrims\/\$\{r\.mutamerId\}`\}/);
    expect(PAGE).toMatch(/href=\{`\/umrah\/agents\/\$\{r\.agentId\}`\}/);
  });

  it("renders an empty-state when zero rows (no broken table)", () => {
    expect(PAGE).toMatch(/data-testid="violations-recent-empty"/);
    expect(PAGE).toMatch(/لا مخالفات تطابق الفلاتر/);
  });

  it("BreakdownTable shows count + total + percentage per row", () => {
    expect(PAGE).toMatch(/totalCount > 0 \? Math\.round\(\(r\.count \/ totalCount\) \* 100\) : 0/);
  });
});

describe("FE — route registration", () => {
  it("/umrah/reports/violations-summary is registered", () => {
    expect(ROUTES).toMatch(/UmrahViolationsSummaryReport = lazy/);
    expect(ROUTES).toMatch(/path: "\/umrah\/reports\/violations-summary"/);
  });
});