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
// U-07 Phase 22 — GET /umrah/groups (enriched list) carved into umrah-groups.ts.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-groups.ts"),
  "utf8",
);
const UI = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/groups.tsx"),
  "utf8",
);

describe("umrah /groups list — enriched operational columns", () => {
  it("NUSK aggregates: invoice count + cost total live inside a nusk_stats CTE (N+1 fix)", () => {
    // After the N+1 fix the two NUSK aggregates were lifted out of
    // per-row correlated subqueries into a single GROUP BY scan.
    expect(ROUTE).toContain("WITH nusk_stats AS");
    expect(ROUTE).toContain('COUNT(*) AS "nuskInvoiceCount"');
    expect(ROUTE).toContain('COALESCE(SUM("totalAmount"), 0) AS "nuskCostTotal"');
  });

  it("excludes cancelled NUSK invoices from the aggregates", () => {
    expect(ROUTE).toContain(`"nuskStatus" != 'cancelled'`);
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

  it("pilgrimsInside counts arrived/active/overstayed via COUNT(*) FILTER inside pilgrim_stats CTE", () => {
    expect(ROUTE).toContain("pilgrim_stats AS");
    expect(ROUTE).toMatch(
      /COUNT\(\*\) FILTER \(WHERE status IN \('arrived','active','overstayed'\)\) AS "pilgrimsInside"/,
    );
  });

  it("pilgrimsOverstayed isolates the at-risk subset via FILTER inside the same CTE", () => {
    expect(ROUTE).toMatch(
      /COUNT\(\*\) FILTER \(WHERE status = 'overstayed'\) AS "pilgrimsOverstayed"/,
    );
  });

  it("visaAtRisk uses the same 7-day Saudi compliance window via FILTER", () => {
    expect(ROUTE).toContain(`"visaExpiry" < CURRENT_DATE + INTERVAL '7 days'`);
    expect(ROUTE).toContain(`status NOT IN ('departed','cancelled','deceased','visa_rejected')`);
    expect(ROUTE).toContain(`AS "visaAtRisk"`);
  });

  it("Group's CTE joins still match by both groupId AND companyId (defence-in-depth)", () => {
    // The original correlated subqueries enforced AND
    // ni/p."companyId" = g."companyId" defensively. The CTEs carry
    // companyId through into the LEFT JOIN ON clause so that
    // boundary is preserved.
    expect(ROUTE).toMatch(
      /LEFT JOIN nusk_stats ns ON ns\."groupId" = g\.id AND ns\."companyId" = g\."companyId"/,
    );
    expect(ROUTE).toMatch(
      /LEFT JOIN pilgrim_stats ps ON ps\."groupId" = g\.id AND ps\."companyId" = g\."companyId"/,
    );
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
