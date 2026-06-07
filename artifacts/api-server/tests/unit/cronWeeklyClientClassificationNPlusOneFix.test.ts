/**
 * cronScheduler.weeklyClientClassification — N+1 fix on lastInvoice lookup.
 *
 * `weeklyClientClassification` in lib/cronScheduler.ts runs once a
 * week to re-classify every client across every company:
 *   vip / premium / regular / prospect / churned.
 *
 * The classification depends on revenue (already on the client row)
 * AND on whether the client has gone 12+ months without an invoice
 * (churn). The previous shape evaluated a correlated MAX("createdAt")
 * subquery against `invoices` once per client.
 *
 * For 500 clients per company × 5 companies, that's 2,500 lookups
 * against the (large) `invoices` table on every weekly run.
 *
 * The fix uses a single GROUP BY CTE (`last_invoice_per_client`)
 * keyed by `invoices."clientId"`, scoped to the current company, then
 * LEFT JOINed back to clients. One scan replaces 500 per company.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/cronScheduler.ts"),
  "utf8",
);

describe("cronScheduler.weeklyClientClassification — N+1 fix", () => {
  const handlerIdx = SRC.indexOf("async function weeklyClientClassification");
  const handler = SRC.slice(handlerIdx, handlerIdx + 3500);

  it("weeklyClientClassification is locatable", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no correlated MAX subquery on invoices for c.id remains", () => {
    expect(handler).not.toMatch(
      /\(SELECT\s+MAX\(i\."createdAt"\)\s+FROM\s+invoices\s+i\s+WHERE\s+i\."clientId"\s*=\s*c\.id\)/,
    );
  });

  it("uses a last_invoice_per_client CTE keyed by clientId", () => {
    expect(handler).toContain("WITH last_invoice_per_client AS");
    expect(handler).toMatch(/GROUP BY "clientId"/);
    expect(handler).toMatch(/MAX\("createdAt"\)\s+AS\s+"lastInvoice"/);
  });

  it("LEFT JOINs the CTE back to clients by clientId", () => {
    expect(handler).toMatch(
      /LEFT JOIN last_invoice_per_client li ON li\."clientId" = c\.id/,
    );
  });

  it('projects li."lastInvoice" instead of a subquery', () => {
    expect(handler).toMatch(/li\."lastInvoice"/);
  });

  it("CTE scopes to the current company via companyId = $1", () => {
    expect(handler).toMatch(/WHERE\s+"companyId"\s*=\s*\$1/);
  });

  it("outer query still scopes clients to company $1", () => {
    expect(handler).toMatch(/c\."companyId"\s*=\s*\$1/);
  });
});
