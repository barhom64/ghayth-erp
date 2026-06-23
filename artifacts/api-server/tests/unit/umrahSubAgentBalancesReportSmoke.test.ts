import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Sub-agent balances — companion to /reports/agent-balances but more
 * operationally important: umrah_payments lives at the sub-agent
 * level, and umrah_sales_invoices.paidAmount is a real numeric column
 * (not a status approximation). The bookkeeper's "did this sub-agent
 * pay?" query is what closes the umrah financial loop.
 */
// U-07 Phase 13 — subagent-balances report carved into umrah-reports.ts.
const ROUTE_ENT = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/subagent-balances.tsx"),
  "utf8",
);
const HUB_PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/index.tsx"),
  "utf8",
);
const ROUTES_TSX = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);

const HANDLER = (() => {
  const m = ROUTE_ENT.match(/router\.get\("\/reports\/subagent-balances"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/);
  if (!m) throw new Error("/reports/subagent-balances handler not found");
  return m[0];
})();

describe("GET /umrah/reports/subagent-balances — endpoint contract", () => {
  it("registers under feature: umrah, action: list", () => {
    expect(HANDLER).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"list"\s*\}\)/);
  });

  it("uses real paidAmount column (not a status approximation like agent-balances)", () => {
    // The whole reason this report exists separately: paidAmount is
    // a real numeric column on umrah_sales_invoices. Pinning the
    // SUM call so a future refactor that "consolidates" the two
    // reports must keep this column-level precision.
    expect(HANDLER).toMatch(/SUM\(inv\."paidAmount"\)\s+AS total_paid_on_inv/);
    expect(HANDLER).toMatch(/SUM\(inv\.total - COALESCE\(inv\."paidAmount", 0\)\)/);
  });

  it("payments LATERAL is independent of invoice LATERAL (two separate aggregations)", () => {
    // The bookkeeper needs both: paid-on-invoices (closes the
    // matching loop) vs total-received (raw cash in). They should
    // reconcile but the report must show both side by side so a
    // mismatch is visible.
    const lateralCount = HANDLER.match(/LEFT JOIN LATERAL/g);
    expect(lateralCount?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(HANDLER).toMatch(/FROM umrah_payments pay\s+WHERE pay\."subAgentId" = sa\.id/);
    expect(HANDLER).toMatch(/SUM\(pay\."sarAmount"\)\s+AS total_received/);
  });

  it("payments LATERAL surfaces last payment date + ref for the operator", () => {
    expect(HANDLER).toMatch(/MAX\(pay\."paymentDate"\)\s+AS last_payment_at/);
    expect(HANDLER).toMatch(/ARRAY_AGG\(pay\.ref ORDER BY pay\."paymentDate" DESC, pay\.id DESC\)/);
  });

  it("pilgrimCount reaches pilgrims via umrah_groups.subAgentId (the linking table)", () => {
    // Pilgrims have no direct subAgentId — they belong to a group,
    // and the group has a subAgentId. JOIN through.
    expect(HANDLER).toMatch(/JOIN umrah_groups g ON g\.id = p\."groupId"/);
    expect(HANDLER).toMatch(/g\."subAgentId" = sa\.id/);
  });

  it("agent JOIN is tenant-safe (companyId + deletedAt)", () => {
    expect(HANDLER).toMatch(/LEFT JOIN umrah_agents a\s+ON a\.id = sa\."agentId"\s+AND a\."companyId" = sa\."companyId"\s+AND a\."deletedAt" IS NULL/);
  });

  it("ORDER BY outstanding DESC — bookkeeper sees worst debtor first", () => {
    expect(HANDLER).toMatch(/ORDER BY COALESCE\(inv_agg\.outstanding, 0\) DESC, sa\.name/);
    expect(HANDLER).toMatch(/LIMIT 500/);
  });

  it("?isActive filter accepts true/false strings cleanly", () => {
    expect(HANDLER).toMatch(/isActive === "true"[\s\S]{0,200}sa\."isActive" = true/);
    expect(HANDLER).toMatch(/isActive === "false"[\s\S]{0,200}sa\."isActive" = false/);
  });

  it("?hasOutstanding=true filter applied JS-side after SQL", () => {
    expect(HANDLER).toMatch(/hasOutstanding === "true"[\s\S]{1,300}rows\.filter\(/);
  });

  it("totals reducer is strongly typed (5 numeric fields)", () => {
    // The 5-field tenant totals: subAgents + invoiced + paid-on-inv
    // + received-as-payment + outstanding. Pin the generic so a
    // refactor that drops a field fails this assertion not tsc.
    expect(HANDLER).toMatch(/filtered\.reduce<\{[\s\S]{1,400}subAgents: number;[\s\S]{0,300}totalInvoiced: number;[\s\S]{0,300}totalPaidOnInvoices: number;[\s\S]{0,300}totalReceived: number;[\s\S]{0,300}outstanding: number;[\s\S]{0,100}\}>/);
  });
});

describe("UmrahSubAgentBalances page — UX", () => {
  it("registered under /umrah/reports/subagent-balances", () => {
    expect(ROUTES_TSX).toMatch(/UmrahSubAgentBalancesReport = lazy/);
    expect(ROUTES_TSX).toMatch(/path: "\/umrah\/reports\/subagent-balances"/);
  });

  it("listed in the §11 reports catalog (read by the hub via /reports/catalog)", () => {
    // The hub used to inline the tile; with §11 it now reads the
    // server catalog. Pin both the destination route and the report
    // id there — the smoke test for the catalog itself
    // (umrahReportsCatalogSmoke.test.ts) asserts coverage of all 17.
    const CATALOG = readFileSync(
      join(import.meta.dirname!, "../../src/lib/umrahReportsCatalog.ts"),
      "utf8",
    );
    expect(CATALOG).toContain("/umrah/reports/subagent-balances");
    expect(CATALOG).toContain('id: "subagent_report"');
  });

  it("4 filters + 4 KPIs + table with stable testids", () => {
    for (const id of [
      "subagent-balances-filter-season",
      "subagent-balances-filter-active",
      "subagent-balances-filter-outstanding",
      "subagent-balances-search",
      "subagent-balances-table",
    ]) {
      expect(PAGE).toContain(`data-testid="${id}"`);
    }
    expect(PAGE).toContain("data-testid={`subagent-balances-row-${r.id}`}");
    expect(PAGE).toContain("data-testid={`subagent-balances-outstanding-${r.id}`}");
  });

  it("KPI tiles cover sub-agents / invoiced / received / outstanding", () => {
    for (const label of [
      "عدد الوكلاء الفرعيين",
      "إجمالي المُفوتر",
      "إجمالي المُحصَّل (دفعات)",
      "الرصيد المستحق",
    ]) {
      expect(PAGE).toContain(label);
    }
  });

  it("outstanding > 0 highlights in red (matches agent-balances signal)", () => {
    expect(PAGE).toMatch(/outstanding > 0 \? "text-status-error-foreground" : ""/);
  });

  it("renders BOTH totalReceived (cash in) AND totalPaidOnInvoices (matched) — bookkeeper sees both numbers", () => {
    // The discrepancy between the two is the operationally
    // important signal — if cash-in > paid-on-invoices, some
    // payments aren't matched to invoices yet.
    expect(PAGE).toMatch(/totalReceived/);
    expect(PAGE).toMatch(/totalPaidOnInvoices/);
    expect(PAGE).toContain("فاتورة:");
  });

  it("links to /umrah/sub-agents/:id + /umrah/agents/:id (drill-down to source of truth)", () => {
    expect(PAGE).toMatch(/href=\{`\/umrah\/sub-agents\/\$\{r\.id\}`\}/);
    expect(PAGE).toMatch(/href=\{`\/umrah\/agents\/\$\{r\.agentId\}`\}/);
  });

  it("paymentTerms shown as Arabic badge (مقدم / آجل)", () => {
    expect(PAGE).toContain("مقدم");
    expect(PAGE).toContain("آجل");
  });

  it("CSV export via unified helper (audit + letterhead)", () => {
    expect(PAGE).toContain('data-testid="subagent-balances-export-csv"');
    expect(PAGE).toContain("exportRowsToCsv");
    expect(PAGE).toMatch(/entityType: "report_umrah_subagent_balances"/);
  });
});
