import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins gap #1 from docs/umrah-import-gaps-fix-plan.md. The original plan
 * proposed creating a `purchase_invoices` table; investigation showed the
 * system never had one — AP narratives live on source-specific tables
 * (umrah_nusk_invoices for NUSK voucher imports) plus journal_entries.
 *
 * The practical fix: expose those source-specific AP rows through a
 * receivables-shaped endpoint so the finance module can surface "what
 * we owe NUSK" alongside "what clients owe us" — without inventing a
 * parallel table that the rest of the codebase would have to learn.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-vendors.ts"),
  "utf8",
);

describe("finance-vendors — /payables endpoint surfaces umrah_nusk_invoices", () => {
  it("registers GET /payables before the receivables/:id catch-all", () => {
    // Express matches in order, so /payables must come before any path
    // that could shadow it. The receivables/:id route is the obvious
    // collision (`payables` doesn't match `:id`, but the placement is
    // intentional for grouping with other AP semantics).
    const payIdx = ROUTE.indexOf('"/payables"');
    const recvIdx = ROUTE.indexOf('"/receivables/:id"');
    expect(payIdx).toBeGreaterThan(0);
    expect(recvIdx).toBeGreaterThan(payIdx);
  });

  it("requires finance.vendors:list permission", () => {
    expect(ROUTE).toMatch(/"\/payables",\s*authorize\(\{[\s\S]{1,80}feature:\s*"finance\.vendors"[\s\S]{1,40}action:\s*"list"/);
  });

  it("joins umrah_agents, umrah_sub_agents, AND chart_of_accounts for treasury label", () => {
    // The frontend wants names not IDs, so each FK must come back joined
    // (left-joined to keep the row visible even when a join target is
    // soft-deleted).
    expect(ROUTE).toMatch(/LEFT JOIN umrah_agents\s+a\s+ON a\.id = ni\."agentId"/);
    expect(ROUTE).toMatch(/LEFT JOIN umrah_sub_agents\s+sa\s+ON sa\.id = ni\."subAgentId"/);
    expect(ROUTE).toMatch(/LEFT JOIN chart_of_accounts t\s+ON t\.id = ni\."treasuryId"/);
  });

  it("scopes by companyId and excludes soft-deleted + cancelled rows", () => {
    expect(ROUTE).toMatch(/WHERE ni\."companyId" = \$1/);
    expect(ROUTE).toMatch(/AND ni\."deletedAt" IS NULL/);
    expect(ROUTE).toMatch(/AND ni\."nuskStatus" != 'cancelled'/);
  });

  it("supports agentId + status filters via query string", () => {
    expect(ROUTE).toContain("const { agentId: agentFilter, status: statusFilter } = req.query");
    expect(ROUTE).toMatch(/extraWhere \+= ` AND ni\."agentId" = \$\$\{params\.length\}`/);
    expect(ROUTE).toMatch(/extraWhere \+= ` AND ni\."nuskStatus" = \$\$\{params\.length\}`/);
  });

  it("returns outstandingAmount = totalAmount − refundAmount for each row", () => {
    expect(ROUTE).toMatch(/COALESCE\(ni\."totalAmount",0\)\s*-\s*COALESCE\(ni\."refundAmount",0\)\)\s+AS\s+"outstandingAmount"/);
  });

  it("aggregates a summary { totalAmount, refundAmount, outstandingAmount }", () => {
    expect(ROUTE).toContain("totalAmount: 0, refundAmount: 0, outstandingAmount: 0");
    expect(ROUTE).toMatch(/acc\.outstandingAmount \+= Number\(r\.outstandingAmount/);
  });

  it("tags each row with source='umrah_nusk' so the frontend can render the right detail link", () => {
    expect(ROUTE).toContain("'umrah_nusk' AS source");
  });

  it("orders by issueDate DESC NULLS LAST, then id DESC for stable pagination", () => {
    expect(ROUTE).toMatch(/ORDER BY ni\."issueDate" DESC NULLS LAST, ni\.id DESC/);
  });

  it("caps result set at LIMIT 200 (mirrors /receivables' LIMIT 100 family)", () => {
    expect(ROUTE).toMatch(/LIMIT 200/);
  });

  it("masks the response via maskFields for RBAC field-level consistency", () => {
    expect(ROUTE).toMatch(/\/payables"[\s\S]{1,3500}maskFields\(req,\s*\{\s*data:\s*rows,\s*total:\s*rows\.length,\s*summary\s*\}\)/);
  });
});
