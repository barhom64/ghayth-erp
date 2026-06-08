/**
 * Employees list endpoint — N+1 fix static guard.
 *
 * The original `GET /employees` query carried a correlated scalar
 * subquery in its SELECT list:
 *
 *     (SELECT COUNT(*) FROM gov_integration_links gl
 *      WHERE gl."entityType" = 'employee' AND gl."entityId" = e.id
 *        AND gl."companyId" = ea."companyId") AS "govLinkCount"
 *
 * Postgres planned that subquery once per returned row, so at the
 * route's 500-row page limit a single list call fired 501 index
 * lookups. Pages with hundreds of employees observed several-second
 * latencies under load.
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates the
 * counts once (one scan + hash aggregate) and joins the per-employee
 * result back via a LEFT JOIN. This test pins the new shape so the
 * regression can't sneak back in via a "simpler" refactor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);

describe("GET /employees — gov_integration_links N+1 fix", () => {
  // Slice out the GET / handler block once; every assertion runs
  // against the same window so the indexOf calls stay cheap.
  const handlerIdx = SRC.indexOf('router.get("/", authorize({ feature: "hr.employees"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 5000);

  it("handler is anchored at GET / with hr.employees:list", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar subquery on gov_integration_links", () => {
    // The old N+1 pattern was a `(SELECT COUNT(*) FROM
    // gov_integration_links` literally inside the SELECT list. The CTE
    // version moves COUNT(*) into a WITH clause. Catch both flavors of
    // the regression — bare table reference inside an inline subquery.
    expect(handler).not.toMatch(
      /SELECT\s+COUNT\(\*\)\s+FROM\s+gov_integration_links/,
    );
  });

  it("uses a CTE (WITH gov_counts AS) to pre-aggregate counts once", () => {
    expect(handler).toContain("WITH gov_counts AS");
    expect(handler).toContain('SELECT "entityId", COUNT(*) AS "govLinkCount"');
    expect(handler).toContain('FROM gov_integration_links');
    expect(handler).toContain('GROUP BY "entityId"');
  });

  it("joins gov_counts back to employees by entityId", () => {
    expect(handler).toMatch(
      /LEFT JOIN gov_counts gc ON gc\."entityId" = e\.id/,
    );
  });

  it("COALESCEs the count so employees with no links return 0 (not NULL)", () => {
    expect(handler).toContain('COALESCE(gc."govLinkCount", 0)::int');
  });

  it("uses a dedicated $N parameter binding for the CTE's companyId", () => {
    // The CTE binds companyId to a freshly-pushed param at the end of
    // the params array (govCompanyIdx) so it doesn't accidentally line
    // up with an array-valued $1 from buildScopedWhere on multi-company
    // scopes.
    expect(handler).toContain("const govCompanyIdx = paramIdx++");
    expect(handler).toContain("params.push(scope.companyId)");
    expect(handler).toContain('"companyId" = $${govCompanyIdx}');
  });

  it("countParams excludes the 3 trailing params (limit, offset, govCompanyId)", () => {
    expect(handler).toContain("params.slice(0, params.length - 3)");
  });
});
