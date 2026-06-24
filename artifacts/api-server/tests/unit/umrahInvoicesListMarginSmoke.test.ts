import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the GET /umrah/invoices margin surfacing — PR #1457 added
 * costBasis + marginBase to umrah_sales_invoices but the list page
 * never displayed them. This PR closes that gap AND hardens the
 * sub-agents JOIN with the companyId + deletedAt defence-in-depth
 * pattern (same as PR #1425).
 */
// U-07 Phase 21 — GET /umrah/invoices (and its hardened JOINs) carved into
// umrah-invoices.ts; the JOIN/column-shape assertions read it there.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-invoices.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/invoices.tsx"),
  "utf8",
);

describe("GET /umrah/invoices — JOIN hardening + column shape", () => {
  it("umrah_sub_agents JOIN matches companyId AND filters deletedAt (defence-in-depth)", () => {
    // Without these guards a stale FK could surface another tenant's
    // sub-agent name on a list row — same risk PR #1425 closed on
    // GET /umrah/pilgrims/:id.
    const m = ROUTE.match(/router\.get\("\/invoices"[\s\S]*?(?=router\.(?:get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    const handler = m![0];
    expect(handler).toMatch(/LEFT JOIN umrah_sub_agents sa[\s\S]{1,300}sa\."companyId" = si\."companyId"[\s\S]{0,200}sa\."deletedAt" IS NULL/);
  });

  it("clients JOIN keeps its existing defence-in-depth guard", () => {
    expect(ROUTE).toMatch(/LEFT JOIN clients c[\s\S]{1,300}c\."companyId" = si\."companyId"[\s\S]{0,200}c\."deletedAt" IS NULL/);
  });

  it("SELECT shape is si.* so costBasis + marginBase pass through", () => {
    // The engine writes costBasis + marginBase as actual columns on
    // umrah_sales_invoices; si.* surfaces them without an explicit
    // projection. Pin the wildcard so a future "select only
    // displayed columns" refactor can't accidentally drop the
    // margin signal.
    expect(ROUTE).toMatch(/SELECT si\.\*,/);
  });
});

describe("umrah/invoices.tsx — margin column", () => {
  it("renders a الهامش column with a stable testid per row", () => {
    expect(PAGE).toContain("الهامش (ريال)");
    expect(PAGE).toContain('data-testid={`invoice-margin-${r.id}`}');
  });

  it("RED when marginBase is negative (sellingBelowCost = the loss case)", () => {
    // The list MUST visually distinguish loss-making rows — without
    // colour, operators scrolling through 100 invoices won't spot
    // the three that lost money. Matches the engine's
    // sellingBelowCost flag from PR #1457.
    expect(PAGE).toMatch(/m < 0[\s\S]{1,100}text-status-error-foreground/);
  });

  it("GREEN when marginBase is positive (healthy invoice)", () => {
    expect(PAGE).toMatch(/text-status-success-foreground/);
  });

  it("muted '—' when marginBase is null (legacy rows from pre-PR #1457)", () => {
    // Older imports never wrote the column. Show a sane empty state
    // instead of "ر.س 0" which would be operationally misleading
    // (it'd imply a zero-margin invoice).
    expect(PAGE).toMatch(/r\.marginBase == null/);
    expect(PAGE).toMatch(/text-muted-foreground[\s\S]{0,80}—/);
  });

  it("derived percentage shown alongside the SAR amount", () => {
    // Margin % is more useful than the raw figure for cross-invoice
    // comparison ("this one's at 12% but my baseline is 18%"). 1
    // decimal place keeps the column tidy.
    expect(PAGE).toMatch(/pct = t > 0 \? \(m \/ t\) \* 100 : 0/);
    expect(PAGE).toMatch(/pct\.toFixed\(1\)/);
  });
});
