import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the package-detail enrichment — mirrors the season / group /
 * sub-agent pattern. The page already read pilgrim count + season
 * info, but the endpoint never returned status mix or any projection
 * signals → the cards on the page would have shown 0/- with no path
 * to verify whether the package is actually priced correctly.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-package-detail.tsx"),
  "utf8",
);

const HANDLER = (() => {
  const m = ROUTE.match(/router\.get\("\/packages\/:id"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\()/);
  if (!m) throw new Error("packages/:id handler not found");
  return m[0];
})();

describe("GET /umrah/packages/:id — defence-in-depth + aggregate enrichment", () => {
  it("season JOIN carries companyId + deletedAt (tenant-safe)", () => {
    // Before: only sa.companyId was matched indirectly. After:
    // explicit guard so a stale season row from another tenant
    // can't leak a title here.
    expect(HANDLER).toMatch(/LEFT JOIN umrah_seasons s\s+ON p\."seasonId" = s\.id\s+AND s\."companyId" = p\."companyId"\s+AND s\."deletedAt" IS NULL/);
  });

  it("404s when the package is missing (clearer than empty payload)", () => {
    expect(HANDLER).toMatch(/throw new NotFoundError\("الباقة غير موجودة"\)/);
  });

  it("status breakdown + margin signal land in a single Promise.all roundtrip", () => {
    expect(HANDLER).toMatch(/Promise\.all\(\[/);
    expect(HANDLER).toMatch(/statusRows,\s*marginRow/);
    expect(HANDLER).toMatch(/SELECT status, COUNT\(\*\)::text AS count[\s\S]{1,300}GROUP BY status/);
  });

  it("projection multiplies sell/cost × pilgrimCount (signal: 'is the price right?')", () => {
    // The package itself doesn't know about invoices, so we can't
    // sum real revenue here. The projection lets the operator
    // notice "we set sellPrice below costPrice" without opening
    // every invoice. Margin red on negative — same UX signal as
    // the group/season pages.
    expect(HANDLER).toMatch(/projection: \{[\s\S]{0,400}marginPerPilgrim: sell - cost/);
    expect(HANDLER).toMatch(/projectedRevenue: sell \* pilgrimCount/);
    expect(HANDLER).toMatch(/projectedMargin: \(sell - cost\) \* pilgrimCount/);
  });
});

describe("package detail page — new cards consume the enrichment", () => {
  it("status-breakdown chips hidden when no pilgrims (no empty card)", () => {
    // Same anti-empty-card guard we used on the pilgrim timeline.
    expect(PAGE).toMatch(/pkg\?\.statusBreakdown && Object\.keys\(pkg\.statusBreakdown\)\.length > 0/);
    expect(PAGE).toContain('data-testid="package-status-card"');
    expect(PAGE).toContain('data-testid="package-status-breakdown"');
  });

  it("projection card has 6 number tiles + a red-on-negative margin", () => {
    expect(PAGE).toContain('data-testid="package-projection-card"');
    expect(PAGE).toContain('data-testid="package-sell-per-pilgrim"');
    expect(PAGE).toContain('data-testid="package-cost-per-pilgrim"');
    expect(PAGE).toContain('data-testid="package-margin-per-pilgrim"');
    expect(PAGE).toContain('data-testid="package-projected-revenue"');
    expect(PAGE).toContain('data-testid="package-projected-margin"');
    expect(PAGE).toMatch(/marginPerPilgrim \?\? 0\) < 0 \? "text-status-error-foreground"/);
    expect(PAGE).toMatch(/projectedMargin \?\? 0\) < 0 \? "text-status-error-foreground"/);
  });

  it("Arabic status labels (same dictionary as group / season pages)", () => {
    expect(PAGE).toMatch(/overstayed: "متأخر"/);
    expect(PAGE).toMatch(/departed: "غادر"/);
  });
});
