import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §11 stub conversion — group + agent profitability reports.
 *
 * Pins:
 *   1. /umrah/reports/profitability supports both dimensions
 *      (group / agent) and validates the value against a whitelist.
 *   2. SQL uses LEFT JOIN LATERAL so groups/agents with zero of
 *      either side still surface (operator wants to see who hasn't
 *      been invoiced / hasn't received their nusk yet).
 *   3. SQL filters cancelled / soft-deleted rows on both legs.
 *   4. Response includes totals so the FE renders the KPI tiles
 *      without a second round-trip.
 *   5. Two FE pages exist + are registered in umrahRoutes.
 *   6. The shared ProfitabilityReport component honours the
 *      dimension prop (drives both routes).
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-reports.ts"),
  "utf8",
);
const SHARED = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/profitability.tsx"),
  "utf8",
);
const AGENT = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/agent-profitability.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);

describe("API — /umrah/reports/profitability", () => {
  it("declares the route", () => {
    expect(ROUTE).toMatch(/router\.get\("\/reports\/profitability"/);
  });

  it("validates dimension against a whitelist (no string injection)", () => {
    expect(ROUTE).toMatch(/!\["group", "agent"\]\.includes\(dimension\)/);
    expect(ROUTE).toMatch(/البُعد المطلوب: group أو agent/);
  });

  it("group branch uses LEFT JOIN LATERAL so groups without invoices still surface", () => {
    expect(ROUTE).toMatch(/FROM umrah_groups g\s+LEFT JOIN LATERAL/);
  });

  it("agent branch aggregates revenue/cost up via the groups.agentId chain", () => {
    expect(ROUTE).toMatch(/FROM umrah_agents a\s+LEFT JOIN LATERAL[\s\S]{0,2000}WHERE g\."agentId" = a\.id/);
  });

  it("filters cancelled sales invoices + cancelled nusk invoices + soft-deletes", () => {
    expect(ROUTE).toMatch(/inv\.status <> 'cancelled'/);
    expect(ROUTE).toMatch(/inv\."deletedAt" IS NULL/);
    expect(ROUTE).toMatch(/n\."nuskStatus" <> 'cancelled'/);
    expect(ROUTE).toMatch(/n\."deletedAt" IS NULL/);
  });

  it("margin uses 100 - cost/revenue * 100 with NULL guard for zero-revenue rows", () => {
    expect(ROUTE).toMatch(/CASE WHEN COALESCE\(rev\.revenue, 0\) > 0/);
    expect(ROUTE).toMatch(/ELSE NULL/);
  });

  it("ORDER BY netProfit DESC NULLS LAST — operator sees best margins first", () => {
    expect(ROUTE).toMatch(/ORDER BY "netProfit" DESC NULLS LAST/);
  });

  it("response carries totals for the KPI tiles", () => {
    expect(ROUTE).toMatch(/totals = rows\.reduce/);
    // Seed object inside the reducer carries the 3 numeric fields.
    expect(ROUTE).toContain("{ revenue: 0, cost: 0, netProfit: 0 }");
  });

  it("optional seasonId filter scopes both sales + nusk legs", () => {
    expect(ROUTE).toMatch(/salesSeasonClause = ` AND inv\."seasonId" = \$/);
    expect(ROUTE).toMatch(/nuskSeasonClause = ` AND g\."seasonId" = \$/);
  });
});

describe("FE — shared ProfitabilityReport component", () => {
  it("exports ProfitabilityReport as a dimension-driven helper", () => {
    expect(SHARED).toMatch(/export function ProfitabilityReport\(\{ dimension \}/);
  });

  it("calls /umrah/reports/profitability with the dimension + season", () => {
    expect(SHARED).toMatch(/`\/umrah\/reports\/profitability\?dimension=\$\{dimension\}\$\{qs\}`/);
  });

  it("KPI tiles cover revenue / cost / netProfit / margin", () => {
    // The testids are template-literal `${testid}-value` so we pin
    // the base testid prop passed into KpiCard.
    for (const t of ["kpi-revenue", "kpi-cost", "kpi-net-profit", "kpi-margin"]) {
      expect(SHARED).toContain(`testid="${t}"`);
    }
  });

  it("renders a row per group/agent with deterministic testid", () => {
    expect(SHARED).toMatch(/data-testid=\{`profitability-row-\$\{rowKey\}`\}/);
  });

  it("colors negative netProfit red, positive green", () => {
    expect(SHARED).toMatch(/isNeg \? "text-status-error-foreground" : "text-status-success-foreground"/);
  });

  it("renders an empty-state when zero rows (no broken table)", () => {
    expect(SHARED).toMatch(/data-testid="profitability-empty"/);
    expect(SHARED).toMatch(/لا بيانات للموسم المحدد/);
  });

  it("default page export is the GROUP dimension", () => {
    expect(SHARED).toMatch(/export default function GroupProfitabilityPage\(\)[\s\S]{0,100}dimension="group"/);
  });
});

describe("FE — agent-profitability page", () => {
  it("composes the shared component with dimension='agent'", () => {
    expect(AGENT).toMatch(/import \{ ProfitabilityReport \} from "\.\/profitability"/);
    expect(AGENT).toMatch(/dimension="agent"/);
  });
});

describe("FE — route registrations", () => {
  it("/umrah/reports/group-profitability is registered", () => {
    expect(ROUTES).toMatch(/UmrahGroupProfitabilityReport = lazy/);
    expect(ROUTES).toMatch(/path: "\/umrah\/reports\/group-profitability"/);
  });

  it("/umrah/reports/agent-profitability is registered", () => {
    expect(ROUTES).toMatch(/UmrahAgentProfitabilityReport = lazy/);
    expect(ROUTES).toMatch(/path: "\/umrah\/reports\/agent-profitability"/);
  });
});