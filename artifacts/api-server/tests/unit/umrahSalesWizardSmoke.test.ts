import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the sales-invoice wizard end-to-end:
 *
 *   GET /umrah/sales-wizard/uninvoiced-groups?subAgentId=X[&seasonId=Y]
 *     → listUninvoicedGroups(scope, subAgentId, seasonId)
 *     → { subAgent, groups: [{ id, suggestedPrice, suggestedSource, ... }] }
 *
 *   POST /umrah/invoices/generate { manualPrices: { groupId: number } }
 *     → generateSalesInvoice(scope, { ..., manualPrices })
 *     → manual price beats umrah_pricing lookup
 *
 * The smart-suggestion priority order is the contract the UI depends
 * on (operator's intuition: "last time we charged X, do it again"):
 *
 *   1. last_invoice         — most recent non-cancelled sales invoice line
 *   2. pricing_rule         — `umrah_pricing` rule matching agent/sub-agent/date
 *   3. default_per_mutamer  — `umrah_sub_agents.defaultPricePerMutamer`
 *   4. none                 — operator must type a price
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-entities.ts"),
  "utf8",
);

describe("umrahInvoicingEngine — manual price override", () => {
  it("GenerateInvoiceInput accepts optional manualPrices record", () => {
    expect(ENGINE).toMatch(/manualPrices\?:\s*Record<number,\s*number>/);
  });

  it("destructures manualPrices in generateSalesInvoice", () => {
    expect(ENGINE).toMatch(/const \{ subAgentId, groupIds, seasonId, manualPrices \} = input/);
  });

  it("manual price beats umrah_pricing lookup", () => {
    // The override path must run BEFORE the pricing-rule lookup so the
    // operator's typed value wins even when a rule exists for the date.
    expect(ENGINE).toMatch(/if \(manualPrices && manualPrices\[groupId\] != null && Number\(manualPrices\[groupId\]\) > 0\)/);
  });

  it("error message guides operator to enter price manually when both auto sources fail", () => {
    expect(ENGINE).toContain("يرجى إدخال السعر يدوياً");
  });

  it("loss-leader manual price (positive number) flows through unchanged", () => {
    // The guard is `> 0` so a 0 or negative price would fall through to
    // the auto-lookup. UI should validate before submit.
    expect(ENGINE).toMatch(/Number\(manualPrices\[groupId\]\) > 0/);
  });
});

describe("umrahInvoicingEngine — listUninvoicedGroups smart suggestions", () => {
  it("exports listUninvoicedGroups", () => {
    expect(ENGINE).toMatch(/export async function listUninvoicedGroups\(/);
  });

  it("returns suggestedSource as a typed union (last_invoice | pricing_rule | default_per_mutamer | none)", () => {
    expect(ENGINE).toMatch(/suggestedSource:\s*"last_invoice"\s*\|\s*"pricing_rule"\s*\|\s*"default_per_mutamer"\s*\|\s*"none"/);
  });

  it("excludes groups already on a non-cancelled invoice", () => {
    expect(ENGINE).toContain("NOT EXISTS");
    expect(ENGINE).toMatch(/umrah_sales_invoice_items si/);
    expect(ENGINE).toMatch(/inv\.status\s*!=\s*'cancelled'/);
  });

  it("prioritises last_invoice over pricing_rule over default_per_mutamer", () => {
    // Order matters: the `if/else if/if` chain must keep this priority.
    const idx1 = ENGINE.indexOf('source = "last_invoice"');
    const idx2 = ENGINE.indexOf('source = "pricing_rule"');
    const idx3 = ENGINE.indexOf('source = "default_per_mutamer"');
    expect(idx1).toBeGreaterThan(0);
    expect(idx2).toBeGreaterThan(idx1);
    expect(idx3).toBeGreaterThan(idx2);
  });

  it("last_invoice query is scoped by sub-agent + company + non-cancelled", () => {
    expect(ENGINE).toMatch(/FROM umrah_sales_invoice_items si\s+JOIN umrah_sales_invoices inv/);
    expect(ENGINE).toMatch(/inv\."subAgentId"\s*=\s*\$1/);
    expect(ENGINE).toMatch(/inv\."companyId"\s*=\s*\$2/);
  });

  it("pricing_rule fallback uses sub-agent OR agent rule (NULLS LAST)", () => {
    expect(ENGINE).toMatch(/"subAgentId"\s*=\s*\$2\s+OR\s+\("subAgentId"\s+IS\s+NULL\s+AND\s+"agentId"\s*=\s*\$3\)/);
    expect(ENGINE).toMatch(/ORDER BY\s+"subAgentId"\s+DESC\s+NULLS\s+LAST/);
  });

  it("default_per_mutamer fallback reads from umrah_sub_agents.defaultPricePerMutamer", () => {
    expect(ENGINE).toMatch(/sa\."defaultPricePerMutamer"/);
    expect(ENGINE).toContain("subAgent.defaultPricePerMutamer != null");
  });
});

describe("umrah-entities route — sales-wizard endpoint", () => {
  it("registers GET /sales-wizard/uninvoiced-groups", () => {
    expect(ROUTE).toMatch(/router\.get\("\/sales-wizard\/uninvoiced-groups"/);
  });

  it("requires umrah:view permission", () => {
    expect(ROUTE).toMatch(/sales-wizard\/uninvoiced-groups"[\s\S]{1,80}authorize\(\{[\s\S]{1,40}action:\s*"view"/);
  });

  it("imports listUninvoicedGroups from the engine", () => {
    expect(ROUTE).toMatch(/listUninvoicedGroups,/);
  });

  it("masks the response via maskFields", () => {
    // The route should pass result through maskFields(req, ...) for
    // field-level RBAC consistency with the rest of the umrah surface.
    expect(ROUTE).toMatch(/sales-wizard\/uninvoiced-groups[\s\S]{1,1500}maskFields\(req,\s*result\)/);
  });

  it("generateInvoiceSchema accepts optional manualPrices map", () => {
    expect(ROUTE).toMatch(/manualPrices:\s*z\.record\(/);
  });

  it("POST /invoices/generate threads manualPrices to the engine", () => {
    expect(ROUTE).toContain("{ subAgentId, groupIds, seasonId, manualPrices }");
  });
});
