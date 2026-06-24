import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins §6 cost-breakdown drill (Charter #1870):
 *   GET /umrah/groups/:id/cost-breakdown
 *
 * Opens the NUSK cost black-box that the group-detail page summarised
 * as a single "netCost" number. Returns per-category breakdown
 * (visa / transport / hotel / services / ...) + flat invoice list +
 * margin comparison vs the sales-side revenue.
 *
 * Answers: "ما توزيع التكلفة؟ هل المجموعة رابحة؟ هل في فواتير AP ناقصة؟"
 */
// U-07 Phase 23 — GET /groups/:id/cost-breakdown carved into umrah-group-transport.ts.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-group-transport.ts"),
  "utf8",
);
const CARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/components/shared/umrah-group-cost-breakdown-card.tsx"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-group-detail.tsx"),
  "utf8",
);

const HANDLER = (() => {
  const m = ROUTE.match(/router\.get\("\/groups\/:id\/cost-breakdown"[\s\S]*?(?=\nrouter\.(?:get|post|patch|put|delete)\(|\nexport default)/);
  if (!m) throw new Error("cost-breakdown handler not found");
  return m[0];
})();

describe("GET /umrah/groups/:id/cost-breakdown — endpoint contract", () => {
  it("registers under feature: umrah, action: view (read-only drill)", () => {
    expect(HANDLER).toMatch(/authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"view"\s*\}\)/);
  });

  it("verifies group ownership BEFORE the 3 cost reads (404 vs empty result)", () => {
    expect(HANDLER).toMatch(/FROM umrah_groups[\s\S]{0,200}WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NULL/);
    expect(HANDLER).toMatch(/if \(!group\) throw new NotFoundError/);
  });

  it("3 reads run in parallel — categories + invoices + revenue", () => {
    expect(HANDLER).toMatch(/const \[categoryRow, invoices, revenueRow\] = await Promise\.all\(/);
  });

  it("category SUMs cover all 8 NUSK cost columns + refund + total + netCost", () => {
    expect(HANDLER).toMatch(/SUM\("groundServices"\)[\s\S]{0,100}AS "groundServices"/);
    expect(HANDLER).toMatch(/SUM\("electronicFees"\)[\s\S]{0,100}AS "electronicFees"/);
    expect(HANDLER).toMatch(/SUM\("visaFees"\)[\s\S]{0,100}AS "visaFees"/);
    expect(HANDLER).toMatch(/SUM\("insuranceFees"\)[\s\S]{0,100}AS "insuranceFees"/);
    expect(HANDLER).toMatch(/SUM\("enrichmentServices"\)[\s\S]{0,100}AS "enrichmentServices"/);
    expect(HANDLER).toMatch(/SUM\("additionalServices"\)[\s\S]{0,100}AS "additionalServices"/);
    expect(HANDLER).toMatch(/SUM\("transportTotal"\)[\s\S]{0,100}AS "transportTotal"/);
    expect(HANDLER).toMatch(/SUM\("hotelTotal"\)[\s\S]{0,100}AS "hotelTotal"/);
    expect(HANDLER).toMatch(/SUM\("refundAmount"\)[\s\S]{0,100}AS "refundAmount"/);
    expect(HANDLER).toMatch(/SUM\("netCost"\)[\s\S]{0,100}AS "netCost"/);
  });

  it("category aggregation excludes cancelled NUSK invoices (operator doesn't owe void costs)", () => {
    expect(HANDLER).toMatch(/"nuskStatus" <> 'cancelled'/);
  });

  it("invoices list LIMIT 50 + ORDER BY issueDate DESC NULLS LAST for the drill table", () => {
    expect(HANDLER).toMatch(/FROM umrah_nusk_invoices[\s\S]{0,400}ORDER BY "issueDate" DESC NULLS LAST, id DESC[\s\S]{0,100}LIMIT 50/);
  });

  it("revenue side uses SUM(DISTINCT si.total) (same as /reports/group-portfolio for reconciliation)", () => {
    // DISTINCT collapses a multi-group invoice so it isn't double-counted
    expect(HANDLER).toMatch(/SUM\(DISTINCT si\.total\)/);
    expect(HANDLER).toMatch(/SUM\(DISTINCT si\."paidAmount"\)/);
    expect(HANDLER).toMatch(/FROM umrah_sales_invoice_items it/);
    expect(HANDLER).toMatch(/si\.status <> 'cancelled'/);
  });

  it("categories array filters out zero-amount rows + sorts DESC (dominant category first)", () => {
    expect(HANDLER).toMatch(/\.filter\(\(c\) => c\.amount > 0\)/);
    expect(HANDLER).toMatch(/\.sort\(\(a, b\) => b\.amount - a\.amount\)/);
  });

  it("Arabic category labels are present for all 8 cost columns", () => {
    expect(HANDLER).toContain("خدمات أرضية");
    expect(HANDLER).toContain("رسوم إلكترونية");
    expect(HANDLER).toContain("تأشيرات");
    expect(HANDLER).toContain("تأمين");
    expect(HANDLER).toContain("خدمات إثرائية");
    expect(HANDLER).toContain("خدمات إضافية");
    expect(HANDLER).toContain("نقل");
    expect(HANDLER).toContain("فندق");
  });

  it("summary surfaces margin + marginPct + sellingBelowCost flag", () => {
    expect(HANDLER).toMatch(/const margin = revenue - totalCost/);
    expect(HANDLER).toMatch(/marginPct = revenue > 0 \? \(margin \/ revenue\) \* 100 : 0/);
    expect(HANDLER).toMatch(/sellingBelowCost: margin < 0/);
  });

  it("response shape: group + summary + categories + invoices", () => {
    expect(HANDLER).toMatch(/group: \{[\s\S]{0,100}id: group\.id,\s*name: group\.name,\s*nuskGroupNumber/);
    expect(HANDLER).toMatch(/summary:/);
    expect(HANDLER).toMatch(/categories: categoriesArr/);
    expect(HANDLER).toMatch(/invoices,/);
  });
});

describe("UmrahGroupCostBreakdownCard — FE wiring", () => {
  it("queries the cost-breakdown endpoint with the group id in cache key", () => {
    expect(CARD).toContain("/umrah/groups/${groupId}/cost-breakdown");
    expect(CARD).toMatch(/\["umrah-group-cost-breakdown", String\(groupId\)\]/);
  });

  it("4 headline KPIs (revenue / netCost / margin / nuskCount) with testids", () => {
    expect(CARD).toContain('data-testid="umrah-group-cost-revenue"');
    expect(CARD).toContain('data-testid="umrah-group-cost-netcost"');
    expect(CARD).toContain('data-testid="umrah-group-cost-margin"');
    expect(CARD).toContain('data-testid="umrah-group-cost-nuskcount"');
  });

  it("selling-below-cost alert surfaces when margin < 0", () => {
    expect(CARD).toContain('data-testid="umrah-group-cost-selling-below"');
    expect(CARD).toContain("تباع بخسارة");
  });

  it("category bar chart renders per-category amount + share percentage", () => {
    expect(CARD).toContain('data-testid="umrah-group-cost-categories"');
    expect(CARD).toContain("data-testid={`umrah-group-cost-category-${c.key}`}");
  });

  it("NUSK invoices table drills to /finance/purchase-invoices/:id when AP is wired", () => {
    expect(CARD).toContain('data-testid="umrah-group-cost-invoices"');
    expect(CARD).toContain("data-testid={`umrah-group-cost-invoice-${inv.id}`}");
    expect(CARD).toMatch(/href=\{`\/finance\/purchase-invoices\/\$\{inv\.purchaseInvoiceId\}`\}/);
    expect(CARD).toContain("بانتظار AP");
  });

  it("empty state surfaces a clear message instead of an empty bar grid", () => {
    expect(CARD).toContain('data-testid="umrah-group-cost-empty"');
    expect(CARD).toContain("لا فواتير نسك صادرة");
  });
});

describe("Group detail page — cost card wired", () => {
  it("imports the card + renders it for the group id", () => {
    expect(PAGE).toContain('import { UmrahGroupCostBreakdownCard } from "@/components/shared/umrah-group-cost-breakdown-card"');
    expect(PAGE).toContain("<UmrahGroupCostBreakdownCard groupId={id} />");
  });
});
