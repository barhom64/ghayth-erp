import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the umrah dashboard's financial-position summary. Before this PR
 * the dashboard exposed pilgrim + penalty counts but no money signal —
 * operators had to leave the page (open invoices, payables, …) to learn
 * whether the umrah module was net-owed or net-owing.
 *
 * The new `financials` block aggregates:
 *   sales  — outstanding receivable from sub-agents (umrah_sales_invoices)
 *   nusk   — outstanding payable to NUSK (umrah_nusk_invoices)
 *   net    — sales.outstandingTotal − nusk.outstandingTotal
 *            (positive = net-owed; negative = net-owing)
 *
 * UI lives in `pages/umrah/dashboard.tsx` and renders three cards from
 * the same response.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const DASH_UI = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/dashboard.tsx"),
  "utf8",
);

describe("umrah /dashboard — financials block", () => {
  it("queries umrah_sales_invoices for outstanding receivable", () => {
    expect(ROUTE).toMatch(/FROM umrah_sales_invoices/);
    expect(ROUTE).toMatch(/SUM\(total - COALESCE\("paidAmount", 0\)\)[\s\S]{0,200}AS\s+"outstandingTotal"/);
  });

  it("queries umrah_nusk_invoices for outstanding payable", () => {
    expect(ROUTE).toMatch(/FROM umrah_nusk_invoices/);
    expect(ROUTE).toMatch(/SUM\("totalAmount" - COALESCE\("refundAmount", 0\)\)[\s\S]{0,200}AS\s+"outstandingTotal"/);
  });

  it("excludes cancelled invoices from outstanding totals", () => {
    expect(ROUTE).toMatch(/status NOT IN \('cancelled','paid'\)/);
    expect(ROUTE).toMatch(/"nuskStatus" NOT IN \('cancelled','paid','refunded'\)/);
  });

  it("exposes overdue receivable separately (dueDate < CURRENT_DATE)", () => {
    expect(ROUTE).toMatch(/AS\s+"overdueTotal"/);
    expect(ROUTE).toMatch(/"dueDate" < CURRENT_DATE/);
  });

  it("computes net position as sales outstanding − nusk outstanding", () => {
    expect(ROUTE).toContain("const receivable = Number(sales.outstandingTotal ?? 0);");
    expect(ROUTE).toContain("const payable = Number(nusk.outstandingTotal ?? 0);");
    expect(ROUTE).toContain("net: receivable - payable,");
  });

  it("response envelope includes financials: { sales, nusk, net }", () => {
    expect(ROUTE).toMatch(/financials:\s*\{\s*[\r\n\s]*sales:\s*salesFinancials\[0\]/);
    expect(ROUTE).toMatch(/nusk:\s*nuskFinancials\[0\]/);
    expect(ROUTE).toMatch(/net:\s*receivable - payable/);
  });

  it("dashboard UI renders three financial cards driven by the new block", () => {
    expect(DASH_UI).toContain("مستحق لنا (مبيعات)");
    expect(DASH_UI).toContain("مستحق علينا (نسك)");
    expect(DASH_UI).toContain("صافي المركز");
  });

  it("UI flips net-position colour based on sign", () => {
    expect(DASH_UI).toContain("const isNetPositive = netPosition >= 0;");
    expect(DASH_UI).toMatch(/isNetPositive\s*\?\s*"صافي مستحق لنا"\s*:\s*"صافي مستحق علينا"/);
  });

  it("UI surfaces overdue-receivable as a destructive badge when > 0", () => {
    expect(DASH_UI).toMatch(/Number\(salesFin\.overdueTotal[\s\S]{0,80}>\s*0[\s\S]{0,300}Badge variant="destructive"/);
  });
});

describe("umrah /dashboard — visa expiry alerts (Saudi compliance)", () => {
  it("backend queries umrah_pilgrims for visaExpiry buckets (expired / critical / warning)", () => {
    expect(ROUTE).toMatch(/COUNT\(\*\) FILTER \(WHERE "visaExpiry" < CURRENT_DATE\) AS "expired"/);
    expect(ROUTE).toMatch(/"visaExpiry" >= CURRENT_DATE AND "visaExpiry" < CURRENT_DATE \+ INTERVAL '7 days'\)\s+AS\s+"critical"/);
    expect(ROUTE).toMatch(/"visaExpiry" >= CURRENT_DATE \+ INTERVAL '7 days' AND "visaExpiry" < CURRENT_DATE \+ INTERVAL '30 days'\)\s+AS\s+"warning"/);
  });

  it("backend excludes pilgrim statuses that don't need visa-tracking action", () => {
    // departed/cancelled/deceased/visa_rejected pilgrims aren't at risk
    // of overstay — they're either out, dead, or never granted entry.
    expect(ROUTE).toMatch(/status NOT IN \('departed','cancelled','deceased','visa_rejected'\)/);
  });

  it("response envelope ships `visaExpiry` alongside `financials`", () => {
    expect(ROUTE).toMatch(/visaExpiry:\s*visaExpiry\[0\]/);
  });

  it("UI renders the traffic-light card with the three buckets", () => {
    expect(DASH_UI).toContain("تنبيهات انتهاء التأشيرات");
    expect(DASH_UI).toContain("منتهية الصلاحية");
    expect(DASH_UI).toContain("حرج (أقل من 7 أيام)");
    expect(DASH_UI).toContain("تحذير (7-30 يوماً)");
  });

  it("UI border colour flips by severity: expired → error, critical → warning, else → info", () => {
    expect(DASH_UI).toMatch(/visaExpired > 0[\s\S]{0,200}border-status-error-surface[\s\S]{0,200}visaCritical > 0[\s\S]{0,200}border-status-warning-surface/);
  });

  it("UI hides the card entirely when no visas are at risk (zero noise)", () => {
    expect(DASH_UI).toContain("visaTotal > 0 &&");
  });
});

