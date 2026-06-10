import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §11 partial → full conversion — nusk invoices summary report.
 *
 * Pins:
 *   1. /umrah/reports/nusk-invoices-summary serves KPIs + 3
 *      breakdowns (by status / month / agent) + recent 100 rows.
 *   2. Filters: seasonId (chained via group), agentId, nuskStatus,
 *      date range on issueDate.
 *   3. KPIs surface AP-posting state via purchaseInvoiceId: posted
 *      count + pending count (pending excludes cancelled + zero-
 *      amount rows so the operator sees ACTIONABLE missing AP).
 *   4. byAgent excludes NULL-agent rows (operator can't drill).
 *   5. FE: 7 KPI tiles + 3 breakdown tabs + recent table with
 *      per-row AP-posted indicator + drill-through.
 *   6. Route registered.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/nusk-invoices-summary.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);

describe("API — /umrah/reports/nusk-invoices-summary", () => {
  it("declares the route", () => {
    expect(ROUTE).toMatch(/router\.get\("\/reports\/nusk-invoices-summary"/);
  });

  it("seasonId chains through umrah_groups (nusk table has no seasonId)", () => {
    expect(ROUTE).toMatch(/EXISTS \(\s*[\r\n]+\s*SELECT 1 FROM umrah_groups g\s*[\r\n]+\s*WHERE g\.id = n\."groupId"/);
  });

  it("5 parallel aggregations via Promise.all", () => {
    expect(ROUTE).toMatch(/const \[kpiRow, byStatus, byMonth, byAgent, recent\] = await Promise\.all/);
  });

  it("KPIs surface AP-posting state via purchaseInvoiceId", () => {
    expect(ROUTE).toMatch(/SUM\(CASE WHEN n\."purchaseInvoiceId" IS NOT NULL THEN 1 ELSE 0 END\)::text AS "apPostedCount"/);
    expect(ROUTE).toMatch(/SUM\(CASE WHEN n\."purchaseInvoiceId" IS NULL AND COALESCE\(n\."totalAmount",0\) > 0 AND n\."nuskStatus" <> 'cancelled' THEN 1 ELSE 0 END\)::text AS "apPendingCount"/);
  });

  it("byMonth bucketed via TO_CHAR + LIMIT 12 + excludes NULL issue dates", () => {
    expect(ROUTE).toMatch(/TO_CHAR\(n\."issueDate", 'YYYY-MM'\) AS month/);
    expect(ROUTE).toMatch(/AND n\."issueDate" IS NOT NULL/);
    expect(ROUTE).toMatch(/LIMIT 12/);
  });

  it("byAgent excludes NULL-agent rows + joins agents tenant-safely", () => {
    expect(ROUTE).toMatch(/AND n\."agentId" IS NOT NULL\s+GROUP BY n\."agentId"/);
    expect(ROUTE).toMatch(/LEFT JOIN umrah_agents a ON a\.id = n\."agentId"\s+AND a\."companyId" = n\."companyId"\s+AND a\."deletedAt" IS NULL/);
  });

  it("recent joins agent + group tenant-safely", () => {
    expect(ROUTE).toMatch(/LEFT JOIN umrah_groups g\s+ON g\.id = n\."groupId" AND g\."companyId" = n\."companyId" AND g\."deletedAt" IS NULL/);
    expect(ROUTE).toMatch(/ORDER BY n\."issueDate" DESC NULLS LAST, n\.id DESC/);
    expect(ROUTE).toMatch(/LIMIT 100/);
  });
});

describe("FE — Nusk summary page", () => {
  it("fetches the report endpoint with 5 filters", () => {
    expect(PAGE).toMatch(/`\/umrah\/reports\/nusk-invoices-summary\$\{qs\}`/);
    for (const f of ["seasonId", "agentId", "status", "from", "to"]) {
      expect(PAGE).toContain(`${f}=`);
    }
  });

  it("renders 7 KPI tiles incl. AP-state pair", () => {
    for (const t of [
      "nusk-kpi-total",
      "nusk-kpi-total-amount",
      "nusk-kpi-net-cost",
      "nusk-kpi-refunded",
      "nusk-kpi-mutamers",
      "nusk-kpi-ap-posted",
      "nusk-kpi-ap-pending",
    ]) {
      expect(PAGE).toContain(`testid="${t}"`);
    }
  });

  it("renders 3 breakdown tabs (status / month / agent)", () => {
    expect(PAGE).toMatch(/data-testid="nusk-tab-status"/);
    expect(PAGE).toMatch(/data-testid="nusk-tab-month"/);
    expect(PAGE).toMatch(/data-testid="nusk-tab-agent"/);
  });

  it("STATUS_LABEL_AR covers the 6 nusk-status enum values", () => {
    for (const label of ["معلقة", "مدفوعة", "قيد التنفيذ", "منتهية", "مستردة", "ملغاة"]) {
      expect(PAGE).toContain(label);
    }
  });

  it("agent breakdown drills to /umrah/agents/:id", () => {
    expect(PAGE).toMatch(/href: `\/umrah\/agents\/\$\{r\.agentId\}`/);
  });

  it("recent rows drill to /umrah/groups/:id + /umrah/agents/:id", () => {
    expect(PAGE).toMatch(/href=\{`\/umrah\/groups\/\$\{r\.groupId\}`\}/);
    expect(PAGE).toMatch(/href=\{`\/umrah\/agents\/\$\{r\.agentId\}`\}/);
  });

  it("recent table shows the per-row AP-posted state", () => {
    // Without this badge the operator can't see which rows are
    // missing AP from a glance at the report.
    expect(PAGE).toMatch(/r\.purchaseInvoiceId \?/);
    expect(PAGE).toContain("✓ مرحَّل");
    expect(PAGE).toContain("بانتظار");
  });

  it("empty-state when zero recent rows", () => {
    expect(PAGE).toMatch(/data-testid="nusk-recent-empty"/);
    expect(PAGE).toMatch(/لا فواتير تطابق الفلاتر/);
  });
});

describe("FE — route registration", () => {
  it("/umrah/reports/nusk-invoices-summary is registered", () => {
    expect(ROUTES).toMatch(/UmrahNuskInvoicesSummaryReport = lazy/);
    expect(ROUTES).toMatch(/path: "\/umrah\/reports\/nusk-invoices-summary"/);
  });
});