import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the operational enrichment of `GET /umrah/groups`. The list view
 * pre-PR returned only structural columns (agentName / subAgentName /
 * seasonTitle). An umrah ops lead needed to open every group detail to
 * know the financial + compliance state — a competitive blocker.
 *
 * The route now joins or sub-selects:
 *   - nuskInvoiceCount + nuskCostTotal   (AP we owe NUSK for this group)
 *   - salesInvoiceRef + salesInvoiceTotal + salesInvoiceStatus + salesOutstanding
 *     (AR from sub-agent for this group)
 *   - pilgrimsInside + pilgrimsOverstayed
 *     (operational picture per group)
 *   - visaAtRisk (visa expiring within 7 days for pilgrims still in KSA)
 *
 * The UI surfaces each enriched column with a compact badge so the row
 * stays scannable.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);
const UI = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/groups.tsx"),
  "utf8",
);

describe("umrah /groups list — enriched operational columns", () => {
  it("NUSK aggregates: invoice count + cost total are correlated subqueries scoped per group", () => {
    expect(ROUTE).toMatch(/COUNT\(\*\) FROM umrah_nusk_invoices ni[\s\S]{1,400}AS\s+"nuskInvoiceCount"/);
    expect(ROUTE).toMatch(/SUM\(ni\."totalAmount"\) FROM umrah_nusk_invoices ni[\s\S]{1,400}AS\s+"nuskCostTotal"/);
  });

  it("excludes cancelled NUSK invoices from the aggregates", () => {
    expect(ROUTE).toMatch(/ni\."nuskStatus" != 'cancelled'/);
  });

  it("sales invoice fields ride on a LEFT JOIN against the group's salesInvoiceId", () => {
    expect(ROUTE).toMatch(/LEFT JOIN umrah_sales_invoices si ON si\.id = g\."salesInvoiceId"/);
    expect(ROUTE).toMatch(/si\.ref AS "salesInvoiceRef"/);
    expect(ROUTE).toMatch(/si\.total AS "salesInvoiceTotal"/);
    expect(ROUTE).toMatch(/si\.status AS "salesInvoiceStatus"/);
  });

  it("salesOutstanding clamps to >= 0 (over-payments don't go negative)", () => {
    expect(ROUTE).toMatch(/GREATEST\(COALESCE\(si\.total, 0\) - COALESCE\(si\."paidAmount", 0\), 0\) AS "salesOutstanding"/);
  });

  it("pilgrimsInside counts arrived/active/overstayed (excludes departed)", () => {
    expect(ROUTE).toMatch(/p\.status IN \('arrived','active','overstayed'\)[\s\S]{1,200}AS\s+"pilgrimsInside"/);
  });

  it("pilgrimsOverstayed isolates the at-risk subset", () => {
    expect(ROUTE).toMatch(/p\.status = 'overstayed'[\s\S]{1,200}AS\s+"pilgrimsOverstayed"/);
  });

  it("visaAtRisk uses the same 7-day Saudi compliance window as the dashboard", () => {
    expect(ROUTE).toMatch(/p\."visaExpiry" < CURRENT_DATE \+ INTERVAL '7 days'/);
    expect(ROUTE).toMatch(/p\.status NOT IN \('departed','cancelled','deceased','visa_rejected'\)/);
    expect(ROUTE).toMatch(/AS\s+"visaAtRisk"/);
  });

  it("Group's correlated subqueries match by both groupId AND companyId (defence-in-depth)", () => {
    // Mirror PR #1391: every LEFT JOIN clients/employees also matches
    // companyId. The umrah_pilgrims and umrah_nusk_invoices subqueries
    // here apply the same defence — a cross-tenant id collision would
    // otherwise leak rows into the count.
    const inv = ROUTE.indexOf('SUM(ni."totalAmount") FROM umrah_nusk_invoices');
    expect(inv).toBeGreaterThan(0);
    expect(ROUTE.slice(inv, inv + 500)).toMatch(/ni\."companyId" = g\."companyId"/);
    const pil = ROUTE.indexOf('"pilgrimsInside"');
    expect(pil).toBeGreaterThan(0);
    expect(ROUTE.slice(pil - 600, pil)).toMatch(/p\."companyId" = g\."companyId"/);
  });
});

describe("umrah /groups UI — operator-grade table columns", () => {
  it("renders the new subAgentName column (falls back to agentName)", () => {
    expect(UI).toMatch(/header:\s*"الوكيل الفرعي"[\s\S]{1,200}g\.subAgentName \?\? g\.agentName/);
  });

  it("معتمرون column surfaces داخل + متأخر badges from the aggregates", () => {
    expect(UI).toMatch(/g\.pilgrimsInside[\s\S]{1,300}داخل/);
    expect(UI).toMatch(/g\.pilgrimsOverstayed[\s\S]{1,200}متأخر/);
  });

  it("تكلفة نسك column formats nuskCostTotal as currency + shows invoice count", () => {
    expect(UI).toMatch(/formatCurrency\(Number\(g\.nuskCostTotal[^)]+\)\)/);
    expect(UI).toMatch(/g\.nuskInvoiceCount[\s\S]{1,200}فاتورة/);
  });

  it("فاتورة المبيعات column renders ref + total + outstanding badge", () => {
    expect(UI).toContain("فاتورة المبيعات");
    expect(UI).toContain("غير مفوترة");
    expect(UI).toMatch(/g\.salesOutstanding[\s\S]{1,200}باق/);
  });

  it("التأشيرات column renders an عاجل badge when visaAtRisk > 0", () => {
    expect(UI).toMatch(/g\.visaAtRisk[\s\S]{1,400}عاجل/);
  });

  it("preserves the existing actions column (split / merge / delete unchanged)", () => {
    expect(UI).toMatch(/key:\s*"actions" as any/);
  });
});
