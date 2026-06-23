/**
 * Umrah group-portfolio actuals — N+1 fix static guard.
 *
 * The group-portfolio query in umrah-entities.ts carried a
 * correlated scalar COUNT subquery on umrah_pilgrims for the
 * `actualPilgrims` column:
 *
 *     (SELECT COUNT(*)::int FROM umrah_pilgrims p
 *      WHERE p."groupId" = g.id
 *        AND p."companyId" = g."companyId"
 *        AND p."deletedAt" IS NULL) AS "actualPilgrims"
 *
 * Postgres planned that once per returned group, so a portfolio
 * call with N groups fired N+1 lookups through umrah_pilgrims.
 * Same N+1 shape as the earlier 20 N+1 sites already fixed
 * (employees, fleet, workflows, admin, my-space, tasks, CIP,
 * supplier statement, nusk-invoices, action-center, hr-loans,
 * cycle-counts, property-owners, unit-detail-contracts,
 * numbering-schemes, umrah-groups, umrah-recon, room-blocks, ...).
 *
 * The fix swaps the scalar subquery for a CTE that pre-aggregates
 * actual counts once and joins them back via LEFT JOIN keyed by
 * (groupId, companyId) so the tenant boundary is preserved.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
// U-07 Phase 11: the group-portfolio query was carved into umrah-reports.ts.
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-reports.ts"),
  "utf8",
);

describe("Umrah group-portfolio — actualPilgrims N+1 fix", () => {
  const blockIdx = SRC.indexOf("WITH pilgrim_actuals AS");
  const block = SRC.slice(blockIdx, blockIdx + 2500);

  it("the group-portfolio block is locatable", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no longer carries a correlated scalar COUNT subquery on umrah_pilgrims for actualPilgrims", () => {
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)::int\s+FROM\s+umrah_pilgrims\s+p\s+WHERE\s+p\."groupId"\s*=\s*g\.id[\s\S]*?AS\s+"actualPilgrims"/,
    );
  });

  it("uses a pilgrim_actuals CTE to pre-aggregate counts once", () => {
    expect(block).toContain("WITH pilgrim_actuals AS");
    expect(block).toContain('SELECT "groupId", "companyId", COUNT(*) AS "actualPilgrims"');
    expect(block).toContain("FROM umrah_pilgrims");
    expect(block).toContain('"deletedAt" IS NULL');
    expect(block).toContain('GROUP BY "groupId", "companyId"');
  });

  it("LEFT JOINs pilgrim_actuals back to umrah_groups by (groupId, companyId)", () => {
    expect(block).toMatch(
      /LEFT JOIN pilgrim_actuals pa\s+ON pa\."groupId" = g\.id AND pa\."companyId" = g\."companyId"/,
    );
  });

  it("COALESCEs actualPilgrims so groups with no pilgrims yet return 0::int", () => {
    expect(block).toContain('COALESCE(pa."actualPilgrims", 0)::int AS "actualPilgrims"');
  });
});
