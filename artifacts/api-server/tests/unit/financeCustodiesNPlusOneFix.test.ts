/**
 * Finance custodies list — 2× N+1 fix on debit-line lookup.
 *
 * GET /api/finance/custodies returned up to 1000 custody journal
 * entries. Each row carried TWO correlated subqueries to find the
 * canonical debit-line accountCode + display name:
 *
 *   (SELECT jl2."accountCode" FROM journal_lines jl2
 *     WHERE jl2."journalId" = je.id AND jl2.debit > 0 LIMIT 1)
 *      AS "custodyAccountCode",
 *   (SELECT ca.name FROM journal_lines jl3 JOIN chart_of_accounts ca
 *      ON ca.code = jl3."accountCode"
 *     WHERE jl3."journalId" = je.id AND jl3.debit > 0 LIMIT 1)
 *      AS "custodyAccountName"
 *
 * With 1000 custody entries that's up to 2000 extra lookups against
 * the (large) journal_lines table per request.
 *
 * The fix uses a single `first_debit_line` CTE keyed by journalId
 * (DISTINCT ON, ORDER BY journalId, id picks the first debit line per
 * journal in one scan), then LEFT JOINs back. The chart_of_accounts
 * name resolves via a normal LEFT JOIN instead of a second correlated
 * subquery.
 *
 * Applied to BOTH the list and the detail handler to keep shapes
 * uniform.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-custodies.ts"),
  "utf8",
);

describe("Finance custodies — 2× N+1 fix on debit-line lookup", () => {
  it("no correlated subquery on journal_lines jl2/jl3 for je.id remains", () => {
    expect(SRC).not.toMatch(
      /\(SELECT\s+jl2\."accountCode"\s+FROM\s+journal_lines\s+jl2\s+WHERE\s+jl2\."journalId"\s*=\s*je\.id/,
    );
    expect(SRC).not.toMatch(
      /\(SELECT\s+ca\.name\s+FROM\s+journal_lines\s+jl3\s+JOIN\s+chart_of_accounts/,
    );
  });

  it("uses a first_debit_line CTE via DISTINCT ON (journalId)", () => {
    expect(SRC).toContain("WITH first_debit_line AS");
    expect(SRC).toMatch(/DISTINCT ON \(jlx\."journalId"\)/);
    expect(SRC).toMatch(/ORDER BY jlx\."journalId", jlx\.id/);
  });

  it("LEFT JOINs the CTE back via journalId on both handlers", () => {
    const occurrences = SRC.match(/LEFT JOIN first_debit_line fdl ON fdl\."journalId" = je\.id/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("resolves account name via a normal LEFT JOIN to chart_of_accounts (no correlated subquery)", () => {
    const occurrences = SRC.match(/LEFT JOIN chart_of_accounts ca ON ca\.code = fdl\."accountCode"/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(2);
  });

  it("preserves the LIMIT 1000 cap on the list endpoint", () => {
    expect(SRC).toMatch(/LIMIT 1000/);
  });

  it("filters debit lines to debit > 0 in the CTE", () => {
    expect(SRC).toContain("WHERE jlx.debit > 0");
  });

  it("still GROUP BYs the new fdl/ca columns so SUM aggregations remain valid", () => {
    expect(SRC).toMatch(/GROUP BY[\s\S]*?fdl\."accountCode",\s*ca\.name/);
  });
});
