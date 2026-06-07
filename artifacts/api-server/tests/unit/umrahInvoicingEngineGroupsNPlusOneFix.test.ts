/**
 * umrahInvoicingEngine groups loaders — 2× N+1 fix on first-arrival lookup.
 *
 * The invoicing engine has TWO callsites that load umrah_groups
 * alongside the entry-date of their first arriving pilgrim:
 *
 *  1. `previewBatch(sub-agent, groupIds)` — the operator picks N groups
 *     and previews the invoice rolling up to the sub-agent.
 *  2. `suggestUninvoiced(sub-agent[, season])` — sub-agent dashboards
 *     auto-suggest the unbilled groups since last invoice.
 *
 * Both shipped with a correlated MIN("arrivalDate") subquery against
 * `umrah_pilgrims` evaluated per group. For batch-invoice 20-50
 * groups or a sub-agent with 100+ unbilled groups, that's 20-100+
 * lookups against the (large) pilgrims table per call.
 *
 * The fix uses a GROUP BY CTE (`first_arrival`) in each query, scoped
 * to the same sub-agent/group set as the outer loader. Outer query
 * LEFT JOINs the CTE on groupId so groups with no pilgrims yet still
 * surface (with NULL entryDate).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

describe("umrahInvoicingEngine — groups first-arrival N+1 fix", () => {
  it("no correlated MIN subquery on umrah_pilgrims for g.id remains anywhere", () => {
    expect(SRC).not.toMatch(
      /\(SELECT\s+MIN\(p\."arrivalDate"\)\s+FROM\s+umrah_pilgrims\s+p\s+WHERE\s+p\."groupId"\s*=\s*g\.id/,
    );
  });

  it("both group loaders use a first_arrival CTE keyed by groupId", () => {
    const occurrences = SRC.match(/WITH first_arrival AS/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
    const groupBys = SRC.match(/GROUP BY p?"?\.?"?groupId"?/g) ?? [];
    // At least 2 GROUP BY "groupId" in the two CTEs (we don't care about exact spelling)
    expect(groupBys.length).toBeGreaterThanOrEqual(2);
  });

  it("both loaders LEFT JOIN the CTE back via fa.groupId = g.id", () => {
    const occurrences = SRC.match(/LEFT JOIN first_arrival fa ON fa\."groupId" = g\.id/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("both loaders project fa.\"entryDate\" instead of a correlated subquery", () => {
    const occurrences = SRC.match(/fa\."entryDate"/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("targeted-groups loader scopes the CTE via ANY($1) to match the outer WHERE", () => {
    // The previewBatch loader (first callsite) reuses the groupIds
    // ANY filter inside the CTE so the pilgrims scan is pruned.
    expect(SRC).toMatch(/WHERE\s+"groupId"\s*=\s*ANY\(\$1\)/);
  });

  it("uninvoiced-groups loader scopes the CTE via the sub-agent + company gate", () => {
    // The suggestUninvoiced loader (second callsite) joins umrah_groups
    // inside the CTE so the pilgrim scan is pre-filtered to the sub-agent's
    // groups only.
    expect(SRC).toMatch(
      /WHERE\s+g2\."subAgentId" = \$1\s+AND\s+g2\."companyId" = \$2/,
    );
  });
});
