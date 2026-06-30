import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the §11 sales-invoices summary report (Charter #1870):
 *   GET /umrah/reports/sales-invoices-summary
 *
 * Answers "كم فاتورة بيع أصدرنا؟ كم محصَّل؟ كم متبقي؟ من المتأخّر؟"
 * via five parallel aggregations (kpis + byStatus + byMonth + bySubAgent +
 * recent). Mirrors the violations-summary / commissions-summary /
 * nusk-invoices-summary pattern so the operator's mental model is unified
 * across the §11 catalog.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/sales-invoices-summary.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);

const HANDLER = (() => {
  const m = ROUTE.match(/router\.get\("\/reports\/sales-invoices-summary"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/);
  if (!m) throw new Error("sales-invoices-summary handler not found");
  return m[0];
})();

describe("GET /umrah/reports/sales-invoices-summary — endpoint contract", () => {
  it("registers under feature: umrah, action: list (read view for the CFO/operator)", () => {
    expect(HANDLER).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
  });

  it("tenant-scopes on companyId + filters out deleted invoices", () => {
    expect(HANDLER).toMatch(/inv\."companyId" = \$1 AND inv\."deletedAt" IS NULL/);
  });

  it("supports seasonId / subAgentId / clientId / status filters via parameterised pushes", () => {
    expect(HANDLER).toMatch(/if \(seasonId\)\s*\{[\s\S]{0,200}inv\."seasonId"\s*=\s*\$/);
    expect(HANDLER).toMatch(/if \(subAgentId\)\s*\{[\s\S]{0,200}inv\."subAgentId"\s*=\s*\$/);
    expect(HANDLER).toMatch(/if \(clientId\)\s*\{[\s\S]{0,200}inv\."clientId"\s*=\s*\$/);
    expect(HANDLER).toMatch(/if \(status\)\s*\{[\s\S]{0,200}inv\.status\s*=\s*\$/);
  });

  it("date filters from/to validated as YYYY-MM-DD before reaching SQL", () => {
    expect(HANDLER).toContain("const dateRe = /^\\d{4}-\\d{2}-\\d{2}$/");
    expect(HANDLER).toMatch(/if \(from && !dateRe\.test\(from\)\)/);
    expect(HANDLER).toMatch(/if \(to\s+&& !dateRe\.test\(to\)\)/);
    expect(HANDLER).toMatch(/inv\."invoiceDate" >= \$/);
    expect(HANDLER).toMatch(/inv\."invoiceDate" <= \$/);
  });

  it("runs five aggregations in parallel — no serial RTT", () => {
    expect(HANDLER).toMatch(/const \[kpiRowArr, byStatus, byMonth, bySubAgent, recent\] = await Promise\.all\(/);
  });

  it("kpis row carries totals + paid + outstanding + pilgrims + overdueCount + subAgentsCount", () => {
    expect(HANDLER).toMatch(/COUNT\(\*\)::int\s+AS "total"/);
    expect(HANDLER).toMatch(/SUM\(inv\.total\)[\s\S]{0,200}AS "totalAmount"/);
    expect(HANDLER).toMatch(/SUM\(inv\."paidAmount"\)[\s\S]{0,200}AS "paidAmount"/);
    expect(HANDLER).toMatch(/AS "outstandingAmount"/);
    expect(HANDLER).toMatch(/AS "pilgrimsCount"/);
    expect(HANDLER).toMatch(/AS "overdueCount"/);
    expect(HANDLER).toMatch(/AS "subAgentsCount"/);
  });

  it("overdue uses status + dueDate < CURRENT_DATE + outstanding > 0 (not status alone)", () => {
    // status='overdue' alone is unreliable — many sites don't run a
    // scheduler to flip it. The dueDate-based check is the truth.
    expect(HANDLER).toMatch(/inv\.status IN \('approved','sent','partially_paid','overdue'\)/);
    expect(HANDLER).toMatch(/inv\."dueDate" < CURRENT_DATE/);
    expect(HANDLER).toMatch(/\(inv\.total - COALESCE\(inv\."paidAmount", 0\)\) > 0/);
  });

  it("outstanding excludes cancelled invoices (operators don't owe on voids)", () => {
    expect(HANDLER).toMatch(/FILTER \(WHERE inv\.status <> 'cancelled'\)/);
  });

  it("byMonth uses TO_CHAR(invoiceDate, 'YYYY-MM') + skips NULL + LIMIT 12", () => {
    expect(HANDLER).toMatch(/TO_CHAR\(inv\."invoiceDate", 'YYYY-MM'\)\s+AS "month"/);
    expect(HANDLER).toMatch(/inv\."invoiceDate" IS NOT NULL/);
    expect(HANDLER).toMatch(/LIMIT 12/);
  });

  it("bySubAgent LEFT JOINs umrah_sub_agents (tenant-safe) and ranks by total amount LIMIT 50", () => {
    expect(HANDLER).toMatch(/LEFT JOIN umrah_sub_agents sa[\s\S]{0,200}AND sa\."companyId" = inv\."companyId"[\s\S]{0,200}AND sa\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/ORDER BY COALESCE\(SUM\(inv\.total\), 0\) DESC[\s\S]{0,200}LIMIT 50/);
  });

  it("recent joins sub-agent + client + season (tenant-safe), drives the bottom table — LIMIT 100", () => {
    expect(HANDLER).toMatch(/LEFT JOIN clients c[\s\S]{0,200}AND c\."companyId" = inv\."companyId"[\s\S]{0,200}AND c\."deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/LEFT JOIN umrah_seasons se[\s\S]{0,200}AND se\."companyId" = inv\."companyId"/);
    expect(HANDLER).toMatch(/ORDER BY inv\."invoiceDate" DESC NULLS LAST, inv\.id DESC[\s\S]{0,200}LIMIT 100/);
  });

  it("response shape exposes kpis + 3 breakdowns + recent for the FE", () => {
    expect(HANDLER).toMatch(/kpis: kpiRow/);
    expect(HANDLER).toMatch(/byStatus,/);
    expect(HANDLER).toMatch(/byMonth,/);
    expect(HANDLER).toMatch(/bySubAgent,/);
    expect(HANDLER).toMatch(/recent,/);
  });
});

describe("UmrahSalesInvoicesSummaryReport page — registration + UX", () => {
  it("registered at /umrah/reports/sales-invoices-summary", () => {
    expect(ROUTES).toMatch(/UmrahSalesInvoicesSummaryReport = lazy\(\(\) => import\("@\/pages\/umrah\/reports\/sales-invoices-summary"\)\)/);
    expect(ROUTES).toMatch(/path: "\/umrah\/reports\/sales-invoices-summary", component: UmrahSalesInvoicesSummaryReport/);
  });

  it("queries the summary endpoint with the filter querystring", () => {
    expect(PAGE).toContain("/umrah/reports/sales-invoices-summary${qs}");
  });

  it("renders 7 KPI tiles with stable testids", () => {
    // The page holds testids in a tiles[] array (testid field), then
    // renders <p data-testid={k.testid}>. Pin the source strings.
    expect(PAGE).toContain('"sales-invoices-kpi-total"');
    expect(PAGE).toContain('"sales-invoices-kpi-total-amount"');
    expect(PAGE).toContain('"sales-invoices-kpi-paid"');
    expect(PAGE).toContain('"sales-invoices-kpi-outstanding"');
    expect(PAGE).toContain('"sales-invoices-kpi-pilgrims"');
    expect(PAGE).toContain('"sales-invoices-kpi-overdue"');
    expect(PAGE).toContain('"sales-invoices-kpi-subagents"');
    expect(PAGE).toContain("data-testid={k.testid}");
  });

  it("filter card carries season + subagent + status + from/to with testids", () => {
    expect(PAGE).toContain('data-testid="sales-invoices-filter-season"');
    expect(PAGE).toContain('data-testid="sales-invoices-filter-subagent"');
    expect(PAGE).toContain('data-testid="sales-invoices-filter-status"');
    expect(PAGE).toContain('data-testid="sales-invoices-filter-from"');
    expect(PAGE).toContain('data-testid="sales-invoices-filter-to"');
  });

  it("3 breakdown tabs (status / month / subagent) + tab body testids", () => {
    expect(PAGE).toContain('data-testid="sales-invoices-tab-status"');
    expect(PAGE).toContain('data-testid="sales-invoices-tab-month"');
    expect(PAGE).toContain('data-testid="sales-invoices-tab-subagent"');
    expect(PAGE).toContain('testid="sales-invoices-breakdown-status"');
    expect(PAGE).toContain('testid="sales-invoices-breakdown-month"');
    expect(PAGE).toContain('testid="sales-invoices-breakdown-subagent"');
  });

  it("recent table drills to /umrah/invoices/:id + /umrah/sub-agents/:id (single source of truth)", () => {
    expect(PAGE).toMatch(/href=\{`\/umrah\/invoices\/\$\{r\.id\}`\}/);
    expect(PAGE).toMatch(/href=\{`\/umrah\/sub-agents\/\$\{r\.subAgentId\}`\}/);
    expect(PAGE).toContain('data-testid="sales-invoices-recent-table"');
    expect(PAGE).toContain("data-testid={`sales-invoices-recent-row-${r.id}`}");
  });

  it("surfaces all 7 invoice states via the canonical status source (domain=invoice)", () => {
    // Post-unification: the Arabic labels come from the single source
    // STATUS_MAP (domain="invoice") via PageStatusBadge / resolveStatus,
    // not local literals. Assert the page wires all 7 schema states
    // through the canonical source + badge. The Arabic label text itself
    // is validated by the frontend page-status-badge test.
    expect(PAGE).toContain('domain="invoice"');
    for (const k of ["draft", "approved", "sent", "partially_paid", "paid", "overdue", "cancelled"]) {
      expect(PAGE).toContain(`"${k}"`);
    }
  });

  it("CSV export uses the unified export helper (audit + letterhead path)", () => {
    expect(PAGE).toContain('data-testid="sales-invoices-export-csv"');
    expect(PAGE).toContain("exportRowsToCsv");
    expect(PAGE).toMatch(/disabled=\{recent\.length === 0\}/);
  });

  it("journal-entry badge surfaces posted vs not-posted (finance closes the loop)", () => {
    // §6 deep finance integration — operator sees at a glance whether
    // GL has caught up.
    expect(PAGE).toMatch(/r\.journalEntryId/);
    expect(PAGE).toContain("بدون قيد");
  });

  it("UmrahTabsNav surfaces consistent sibling navigation", () => {
    expect(PAGE).toContain("<UmrahTabsNav />");
  });
});
