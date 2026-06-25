import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Mirrors PR #1438 (agent statement) for sub-agents:
 *
 *   - GET /umrah/sub-agents/:id runs 3 aggregate queries in parallel
 *     so a sub-agent's "what do I owe / how many of mine arrived?"
 *     call returns from a single round-trip.
 *
 *   - Aggregates: pilgrimCount, statusBreakdown (dict), totalPaid
 *     (SUM sarAmount from umrah_payments — the canonical receipts
 *     ledger for sub-agents).
 *
 *   - Existing JOINs on umrah_agents + clients now match companyId +
 *     deletedAt so a stale FK can't lift another tenant's name into
 *     the response (same defence-in-depth pattern as PR #1425).
 *
 *   - Sub-agent detail page surfaces the statement card with the
 *     same UX as the agent detail page (PR #1438).
 */
// U-07 Phase 6: sub-agent routes live in the dedicated sub-router.
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah-sub-agents.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-sub-agent-detail.tsx"),
  "utf8",
);

describe("GET /umrah/sub-agents/:id — statement enrichment", () => {
  it("hardens both existing JOINs with companyId + deletedAt guards", () => {
    // Scope to JUST the sub-agents/:id handler so unrelated JOINs
    // elsewhere in the file don't pollute the assertion.
    const m = ROUTE.match(/router\.get\("\/sub-agents\/:id"[\s\S]*?(?=router\.(?:get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    const handler = m![0];
    // umrah_agents JOIN must filter by companyId + deletedAt.
    expect(handler).toMatch(/LEFT JOIN umrah_agents[\s\S]{1,400}a\."companyId" = sa\."companyId"[\s\S]{0,200}a\."deletedAt" IS NULL/);
    // clients JOIN was already hardened; confirm it stayed that way.
    expect(handler).toMatch(/LEFT JOIN clients[\s\S]{1,400}c\."companyId" = sa\."companyId"[\s\S]{0,200}c\."deletedAt" IS NULL/);
  });

  it("runs the 3 aggregate queries in parallel via Promise.all", () => {
    expect(ROUTE).toMatch(/Promise\.all\(\[[\s\S]{0,200}rawQuery[\s\S]{0,1500}rawQuery[\s\S]{0,1500}rawQuery/);
  });

  it("totalPaid sums sarAmount from umrah_payments (the receipts ledger)", () => {
    expect(ROUTE).toMatch(/SUM\("sarAmount"\)[\s\S]{0,200}FROM umrah_payments[\s\S]{0,200}"subAgentId" = \$1/);
  });

  it("statusBreakdown groups pilgrims by status (subAgentId scope)", () => {
    const m = ROUTE.match(/router\.get\("\/sub-agents\/:id"[\s\S]*?(?=router\.(?:get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/SELECT status, COUNT\(\*\)::int AS c[\s\S]{1,400}"subAgentId" = \$1[\s\S]{0,200}GROUP BY status/);
  });

  it("response shape adds the new aggregates without breaking existing fields", () => {
    expect(ROUTE).toMatch(/\.\.\.row,[\s\S]{0,100}\.\.\.stats,[\s\S]{0,100}totalPaid,[\s\S]{0,100}statusBreakdown,/);
  });

  it("statusBreakdown is shipped as a dict keyed by status (not an array)", () => {
    expect(ROUTE).toContain("Object.fromEntries(");
    expect(ROUTE).toMatch(/statusBreakdownResult\.map\(\(r\) => \[r\.status, Number\(r\.c\)\]\)/);
  });
});

describe("sub-agent detail page — statement card", () => {
  it("renders the statement card with stable data-testids", () => {
    expect(PAGE).toContain('data-testid="sub-agent-statement-card"');
    expect(PAGE).toContain('data-testid="sub-agent-pilgrim-count"');
    expect(PAGE).toContain('data-testid="sub-agent-paid"');
  });

  it("status breakdown renders only when present (no empty section noise)", () => {
    expect(PAGE).toMatch(/sa\?\.statusBreakdown && Object\.keys\(sa\.statusBreakdown\)\.length > 0/);
    expect(PAGE).toContain('data-testid="sub-agent-status-breakdown"');
  });

  it("status chips use the pilgrim-status Arabic labels (mirrors PR #1438)", () => {
    expect(PAGE).toMatch(/PILGRIM_STATUS_LABELS\s*:\s*Record<string, string>/);
    expect(PAGE).toMatch(/pending:\s*"لم يصل"/);
    expect(PAGE).toMatch(/PILGRIM_STATUS_LABELS\[status\] \|\| status/);
  });

  it("pilgrim count card uses the new pilgrimCount field", () => {
    expect(PAGE).toMatch(/sa\?\.pilgrimCount \?\? 0/);
  });
});
