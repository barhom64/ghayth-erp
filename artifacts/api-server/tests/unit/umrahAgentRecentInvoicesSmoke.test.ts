import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the agent-recent-invoices endpoint + UI table — makes the
 * statement card from PR #1438 actionable. Operator can spot WHICH
 * invoice is unpaid instead of just an abstract balance.
 *
 *   - GET /umrah/agents/:id/invoices clamps limit to [1, 100] so a
 *     bad query string can't pull the season.
 *
 *   - Returns 404 when the agent id doesn't exist (instead of
 *     `data: []` which operators have misread as "no invoices").
 *
 *   - The detail page renders a table BELOW the statement card. The
 *     table is hidden when zero rows (no empty noise — the zero
 *     totals above already convey "nothing here").
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-agent-detail.tsx"),
  "utf8",
);

describe("GET /umrah/agents/:id/invoices", () => {
  it("registers under feature: umrah, action: view (read-only, not create)", () => {
    expect(ROUTE).toMatch(/router\.get\("\/agents\/:id\/invoices",\s*authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"view"\s*\}\)/);
  });

  it("clamps limit to [1, 100] so a wrong query string can't pull the season", () => {
    expect(ROUTE).toMatch(/const limit = Math\.max\(1,\s*Math\.min\(100,\s*Number\(req\.query\.limit\) \|\| 10\)\)/);
  });

  it("returns 404 when the agent doesn't exist (instead of empty data)", () => {
    // Pre-existence-check pattern — without this, a wrong agent id
    // surfaces `data: []` which operators have misread as "nothing
    // invoiced" on other endpoints.
    const m = ROUTE.match(/router\.get\("\/agents\/:id\/invoices"[\s\S]*?(?=router\.(?:get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    const handler = m![0];
    expect(handler).toMatch(/SELECT id FROM umrah_agents WHERE id=\$1 AND "companyId"=\$2[\s\S]{0,200}LIMIT 1/);
    expect(handler).toMatch(/if \(!agent\) throw new NotFoundError\("الوكيل غير موجود"\)/);
  });

  it("selects the columns the UI table actually renders (no SELECT *)", () => {
    expect(ROUTE).toMatch(/SELECT id, ref, type, "pilgrimCount", total, status, "dueDate", "createdAt"\s+FROM umrah_agent_invoices/);
  });

  it("scopes the list to (agentId, companyId) AND soft-delete guard", () => {
    expect(ROUTE).toMatch(/"agentId" = \$1 AND "companyId" = \$2 AND "deletedAt" IS NULL/);
  });

  it("orders DESC by createdAt so newest invoices are first", () => {
    expect(ROUTE).toMatch(/ORDER BY "createdAt" DESC[\s\S]{0,100}LIMIT \$3/);
  });
});

describe("agent detail page — recent invoices table", () => {
  it("renders the table via a dedicated component with a stable testid", () => {
    expect(PAGE).toContain("function AgentRecentInvoicesCard");
    expect(PAGE).toContain('data-testid="agent-recent-invoices-card"');
  });

  it("renders nothing when there are zero invoices (no empty noise)", () => {
    // The statement card already shows zeroes; an empty table beneath
    // is pure noise. Render-nothing is the explicit contract.
    expect(PAGE).toMatch(/if \(rows\.length === 0\) \{[\s\S]{0,400}return null;/);
  });

  it("each row has a stable testid so e2e can assert on specific invoices", () => {
    expect(PAGE).toContain('data-testid={`agent-invoice-row-${r.id}`}');
  });

  it("status + type both render Arabic labels (not raw enum values)", () => {
    expect(PAGE).toMatch(/INVOICE_STATUS_LABELS\s*:\s*Record<string, string>/);
    expect(PAGE).toMatch(/INVOICE_TYPE_LABELS\s*:\s*Record<string, string>/);
    expect(PAGE).toMatch(/draft:\s*"مسودّة"/);
    expect(PAGE).toMatch(/paid:\s*"مدفوعة"/);
    expect(PAGE).toMatch(/sales:\s*"مبيعات"/);
  });

  it("falls back to '#id' when ref is null (some imports leave ref blank)", () => {
    expect(PAGE).toMatch(/r\.ref \|\| `#\$\{r\.id\}`/);
  });

  it("hits the new endpoint with limit=10 and the right cache key", () => {
    expect(PAGE).toMatch(/\["umrah-agent-invoices", String\(agentId\)\]/);
    expect(PAGE).toMatch(/`\/umrah\/agents\/\$\{agentId\}\/invoices\?limit=10`/);
  });
});
