import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the agent-statement enrichment of GET /umrah/agents/:id:
 *
 *   - Three aggregate queries run in parallel via Promise.all so the
 *     latency stays close to the previous single-query detail fetch.
 *
 *   - Returns totalInvoiced, totalPaid, totalOutstanding so the
 *     operator answers a sub-agent's "what do I owe?" call without
 *     a second round-trip.
 *
 *   - Returns statusBreakdown as a dict keyed by pilgrim status so
 *     the UI can render specific chips (pending: N, arrived: N) in
 *     any order without sorting.
 *
 *   - Cancelled invoices are excluded from totalInvoiced — operators
 *     don't include voided rows in the "owed" number.
 *
 *   - The agent detail page surfaces a statement card with stable
 *     data-testids so e2e can assert on each financial line.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/details/umrah-agent-detail.tsx"),
  "utf8",
);

describe("GET /umrah/agents/:id — statement enrichment", () => {
  it("runs the 3 aggregate queries in parallel via Promise.all", () => {
    expect(ROUTE).toMatch(/Promise\.all\(\[[\s\S]{0,200}rawQuery[\s\S]{0,1500}rawQuery[\s\S]{0,1500}rawQuery/);
  });

  it("computes status breakdown via GROUP BY status", () => {
    // Scope to JUST the GET /agents/:id handler so other GROUP BYs
    // in the file don't satisfy the assertion.
    const m = ROUTE.match(/router\.get\("\/agents\/:id"[\s\S]*?(?=router\.(?:get|post|patch|put|delete)\()/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/SELECT status, COUNT\(\*\)::int AS c[\s\S]{1,500}GROUP BY status/);
  });

  it("totalInvoiced excludes cancelled invoices ('owed' shouldn't include voids)", () => {
    expect(ROUTE).toMatch(/SUM\(total\) FILTER \(WHERE status <> 'cancelled'\)/);
  });

  it("totalPaid uses status = 'paid'", () => {
    expect(ROUTE).toMatch(/SUM\(total\) FILTER \(WHERE status = 'paid'\)/);
  });

  it("response shape carries the new aggregates without breaking existing fields", () => {
    expect(ROUTE).toMatch(/totalInvoiced,\s*\n[\s\S]{0,100}totalPaid,\s*\n[\s\S]{0,200}totalOutstanding: Math\.max\(0, totalInvoiced - totalPaid\)/);
    expect(ROUTE).toMatch(/statusBreakdown,/);
    // Existing fields still present.
    expect(ROUTE).toMatch(/"pilgrimCount"/);
    expect(ROUTE).toMatch(/"overstayedCount"/);
  });

  it("statusBreakdown is shipped as a dict keyed by status (not an array)", () => {
    // Two-pin check is more robust than one mega-regex: the shape
    // call exists, and the map produces [status, count] tuples.
    expect(ROUTE).toContain("Object.fromEntries(");
    expect(ROUTE).toMatch(/\.map\(\(r\) => \[r\.status, Number\(r\.c\)\]\)/);
  });
});

describe("agent detail page — statement card", () => {
  it("renders the statement card with stable data-testids", () => {
    expect(PAGE).toContain('data-testid="agent-statement-card"');
    expect(PAGE).toContain('data-testid="agent-outstanding"');
    expect(PAGE).toContain('data-testid="agent-invoiced"');
    expect(PAGE).toContain('data-testid="agent-paid"');
  });

  it("outstanding goes RED when > 0 (visual cue for the operator)", () => {
    expect(PAGE).toMatch(/Number\(agent\?\.totalOutstanding \?\? 0\) > 0 \? "text-status-error-foreground" : "text-status-success-foreground"/);
  });

  it("status breakdown renders only when present (no empty section noise)", () => {
    expect(PAGE).toMatch(/agent\?\.statusBreakdown && Object\.keys\(agent\.statusBreakdown\)\.length > 0/);
    expect(PAGE).toContain('data-testid="agent-status-breakdown"');
  });

  it("status chips use the pilgrim-status Arabic labels (not raw values)", () => {
    expect(PAGE).toMatch(/PILGRIM_STATUS_LABELS\s*:\s*Record<string, string>/);
    expect(PAGE).toMatch(/pending:\s*"لم يصل"/);
    expect(PAGE).toMatch(/arrived:\s*"وصل"/);
    expect(PAGE).toMatch(/PILGRIM_STATUS_LABELS\[status\] \|\| status/);
  });

  it("pilgrim count card uses the new pilgrimCount field (drops legacy alias guessing)", () => {
    expect(PAGE).toContain('data-testid="agent-pilgrim-count"');
    expect(PAGE).toMatch(/agent\?\.pilgrimCount \?\? 0/);
  });
});
