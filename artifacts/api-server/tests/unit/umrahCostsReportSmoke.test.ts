import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * §11 stub conversion — umrah_costs report (final stub).
 *
 * Pins:
 *   1. /umrah/reports/umrah-costs supports three dimensions
 *      (season / group / agent) with a whitelist.
 *   2. SQL aggregates umrah_nusk_invoices broken down by 10 cost
 *      categories (the actual NUSK invoice schema). LEFT JOINs so
 *      groups/agents/seasons with zero invoices still surface.
 *   3. Filters cancelled + soft-deleted nusk invoices.
 *   4. Optional seasonId scopes the join correctly.
 *   5. Response includes totals object so FE renders headline +
 *      the table footer in one round-trip.
 *   6. FE page renders 3 dimension tabs + season filter + cost
 *      table with sticky first-column + footer with totals.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/reports/umrah-costs.tsx"),
  "utf8",
);
const ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/routes/umrahRoutes.tsx"),
  "utf8",
);

const COST_CATEGORIES = [
  "groundServices", "electronicFees", "visaFees", "insuranceFees",
  "enrichmentServices", "additionalServices", "transportTotal",
  "hotelTotal", "netCost", "totalAmount",
] as const;

describe("API — /umrah/reports/umrah-costs", () => {
  it("declares the route", () => {
    expect(ROUTE).toMatch(/router\.get\("\/reports\/umrah-costs"/);
  });

  it("validates dimension against a 3-value whitelist", () => {
    expect(ROUTE).toMatch(/!\["season", "group", "agent"\]\.includes\(dimension\)/);
    expect(ROUTE).toMatch(/البُعد المطلوب: season أو group أو agent/);
  });

  it("aggregates each of the 10 cost categories", () => {
    for (const cat of COST_CATEGORIES) {
      expect(ROUTE).toContain(`SUM(n."${cat}")`);
    }
  });

  it("includes invoiceCount in the per-row projection", () => {
    expect(ROUTE).toMatch(/COUNT\(\*\)::int AS "invoiceCount"/);
  });

  it("filters cancelled + soft-deleted nusk invoices", () => {
    expect(ROUTE).toMatch(/AND n\."deletedAt" IS NULL/);
    expect(ROUTE).toMatch(/AND n\."nuskStatus" <> 'cancelled'/);
  });

  it("LEFT JOINs so groups/agents/seasons with zero invoices still surface", () => {
    expect(ROUTE).toMatch(/LEFT JOIN umrah_nusk_invoices n[\s\S]{0,100}ON n\."groupId" = g\.id/);
  });

  it("season-dimension branch chains seasons → groups → invoices", () => {
    expect(ROUTE).toMatch(/FROM umrah_seasons s/);
    expect(ROUTE).toMatch(/LEFT JOIN umrah_groups g\s+ON g\."seasonId" = s\.id/);
  });

  it("agent-dimension branch chains agents → groups → invoices", () => {
    expect(ROUTE).toMatch(/FROM umrah_agents a/);
    expect(ROUTE).toMatch(/LEFT JOIN umrah_groups g\s+ON g\."agentId" = a\.id/);
  });

  it("ORDER BY totalAmount DESC NULLS LAST", () => {
    expect(ROUTE).toMatch(/ORDER BY "totalAmount" DESC NULLS LAST/);
  });

  it("response includes a totals object summing each category", () => {
    expect(ROUTE).toMatch(/const totals = rows\.reduce/);
    expect(ROUTE).toMatch(/data: rows, dimension, totals/);
  });
});

describe("FE — costs report page", () => {
  it("renders three dimension tabs", () => {
    expect(PAGE).toMatch(/data-testid="costs-dim-season"/);
    expect(PAGE).toMatch(/data-testid="costs-dim-group"/);
    expect(PAGE).toMatch(/data-testid="costs-dim-agent"/);
  });

  it("renders the season filter + per-row testid", () => {
    expect(PAGE).toMatch(/data-testid="costs-filter-season"/);
    expect(PAGE).toMatch(/data-testid=\{`costs-row-\$\{rowKey\}`\}/);
  });

  it("renders the headline total amount", () => {
    expect(PAGE).toMatch(/data-testid="costs-total-amount"/);
  });

  it("calls the endpoint with the selected dimension + season", () => {
    expect(PAGE).toMatch(/`\/umrah\/reports\/umrah-costs\?dimension=\$\{dimension\}\$\{qs\}`/);
  });

  it("COST_COLUMNS pin the 8 visible category columns with Arabic labels", () => {
    expect(PAGE).toContain('label: "خدمات أرضية"');
    expect(PAGE).toContain('label: "رسوم تأشيرة"');
    expect(PAGE).toContain('label: "نقل"');
    expect(PAGE).toContain('label: "فنادق"');
  });

  it("renders an empty-state when zero rows (no broken table)", () => {
    expect(PAGE).toMatch(/data-testid="costs-empty"/);
    expect(PAGE).toMatch(/لا فواتير نُسك تطابق الفلاتر/);
  });

  it("renders a tfoot row that totals every cost category", () => {
    expect(PAGE).toMatch(/<tfoot/);
    expect(PAGE).toMatch(/الإجمالي الكلّي|<td className="p-2 font-bold sticky right-0 bg-muted\/60"/);
  });
});

describe("FE — route registration", () => {
  it("/umrah/reports/umrah-costs is registered", () => {
    expect(ROUTES).toMatch(/UmrahCostsReport = lazy/);
    expect(ROUTES).toMatch(/path: "\/umrah\/reports\/umrah-costs"/);
  });
});