/**
 * Fleet vehicles list endpoint — N+1 fix static guard.
 *
 * The original `GET /fleet/vehicles` query carried TWO correlated
 * scalar subqueries in its SELECT list:
 *
 *     (SELECT COUNT(*) FROM gov_integration_links ...) AS govLinkCount
 *     (SELECT MAX(endDate) FROM fleet_insurance ...) AS insuranceExpiry
 *
 * Postgres planned both as ONE execution per returned row, so at the
 * route's 500-vehicle page limit a single list call fired ~1,000
 * index lookups. Same shape as the employees-list N+1 fix in
 * employeesListNPlusOneFix.test.ts.
 *
 * The fix swaps both scalar subqueries for CTEs that pre-aggregate
 * counts/maximums once (one scan + hash aggregate each) and joins
 * the per-vehicle result back via LEFT JOINs. This test pins the new
 * shape so the regression can't sneak back in via a "simpler"
 * refactor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/fleet.ts"),
  "utf8",
);

describe("GET /fleet/vehicles — gov_integration_links + fleet_insurance N+1 fix", () => {
  // Slice the GET /vehicles handler block once.
  const handlerIdx = SRC.indexOf('router.get("/vehicles"');
  const handler = SRC.slice(handlerIdx, handlerIdx + 6000);

  it("handler is anchored at GET /vehicles", () => {
    expect(handlerIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar subquery on gov_integration_links", () => {
    expect(handler).not.toMatch(
      /SELECT\s+COUNT\(\*\)\s+FROM\s+gov_integration_links/,
    );
  });

  it("no longer carries a correlated scalar subquery on fleet_insurance", () => {
    expect(handler).not.toMatch(
      /SELECT\s+MAX\([^)]+\)\s+FROM\s+fleet_insurance/,
    );
  });

  it("uses a gov_counts CTE to pre-aggregate gov_integration_links once", () => {
    expect(handler).toContain("WITH gov_counts AS");
    expect(handler).toContain('SELECT "entityId", COUNT(*) AS "govLinkCount"');
    expect(handler).toContain('FROM gov_integration_links');
    expect(handler).toContain('"entityType" = \'vehicle\'');
    expect(handler).toContain('GROUP BY "entityId"');
  });

  it("uses an insurance_expiry CTE to pre-aggregate fleet_insurance once", () => {
    expect(handler).toContain("insurance_expiry AS");
    expect(handler).toContain('SELECT "vehicleId", MAX("endDate") AS "insuranceExpiry"');
    expect(handler).toContain('FROM fleet_insurance');
    expect(handler).toContain('GROUP BY "vehicleId"');
  });

  it("joins gov_counts back to vehicles by entityId", () => {
    expect(handler).toMatch(
      /LEFT JOIN gov_counts gc ON gc\."entityId" = v\.id/,
    );
  });

  it("joins insurance_expiry back to vehicles by vehicleId", () => {
    expect(handler).toMatch(
      /LEFT JOIN insurance_expiry ie ON ie\."vehicleId" = v\.id/,
    );
  });

  it("COALESCEs the count so vehicles with no links return 0 (not NULL)", () => {
    expect(handler).toContain('COALESCE(gc."govLinkCount", 0)::int');
  });

  it("uses a dedicated $N parameter binding for the CTEs' companyId", () => {
    // Same pattern as employees-list: a freshly-pushed param at the
    // end of params (govCompanyIdx) so multi-company scopes that pass
    // companyId as an array via = ANY($1) don't break the CTEs.
    expect(handler).toContain("const govCompanyIdx = paramIdx++");
    expect(handler).toContain("params.push(scope.companyId)");
    expect(handler).toContain('"companyId" = $${govCompanyIdx}');
  });
});
