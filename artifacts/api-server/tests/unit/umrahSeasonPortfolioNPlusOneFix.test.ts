/**
 * Umrah season-portfolio — 2×N+1 fix static guard.
 *
 * The season-portfolio query had TWO correlated scalar COUNT
 * subqueries per row:
 *
 *   1. (SELECT COUNT(*) FROM umrah_pilgrims WHERE "seasonId"=s.id ...)
 *        AS "pilgrimsCount"
 *   2. (SELECT COUNT(*) FROM umrah_groups WHERE "seasonId"=s.id ...)
 *        AS "groupsCount"
 *
 * At LIMIT 200, that's ~400 redundant lookups. Same N+1 shape as
 * the earlier fixes — this is the twenty-second site.
 *
 * The fix uses TWO sibling CTEs (season_pilgrim_counts +
 * season_group_counts) keyed by (seasonId, companyId) so the
 * tenant boundary is preserved.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
// U-07 Phase 11: the season-portfolio query was carved into umrah-reports.ts.
const SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/umrah-reports.ts"),
  "utf8",
);

describe("Umrah season-portfolio — 2×N+1 fix", () => {
  // Anchor on the season_pilgrim_counts CTE — unique to this fix.
  const blockIdx = SRC.indexOf("WITH season_pilgrim_counts AS");
  const block = SRC.slice(blockIdx, blockIdx + 3000);

  it("the season-portfolio block is locatable", () => {
    expect(blockIdx).toBeGreaterThan(0);
  });

  it("no correlated scalar COUNT subquery on umrah_pilgrims for seasonId = s.id remains", () => {
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)::int\s+FROM\s+umrah_pilgrims\s+p\s+WHERE\s+p\."seasonId"\s*=\s*s\.id/,
    );
  });

  it("no correlated scalar COUNT subquery on umrah_groups for seasonId = s.id remains", () => {
    expect(block).not.toMatch(
      /\(SELECT\s+COUNT\(\*\)::int\s+FROM\s+umrah_groups\s+g\s+WHERE\s+g\."seasonId"\s*=\s*s\.id/,
    );
  });

  it("uses two sibling CTEs (season_pilgrim_counts + season_group_counts)", () => {
    expect(block).toContain("WITH season_pilgrim_counts AS");
    expect(block).toContain("season_group_counts AS");
    expect(block).toContain('SELECT "seasonId", "companyId", COUNT(*) AS "pilgrimsCount"');
    expect(block).toContain('SELECT "seasonId", "companyId", COUNT(*) AS "groupsCount"');
  });

  it("both CTEs aggregate by (seasonId, companyId) and skip soft-deleted rows", () => {
    const pilgrimBlock = block.slice(0, block.indexOf("season_group_counts AS"));
    expect(pilgrimBlock).toContain("FROM umrah_pilgrims");
    expect(pilgrimBlock).toContain('"deletedAt" IS NULL');
    expect(pilgrimBlock).toContain('GROUP BY "seasonId", "companyId"');

    const groupBlock = block.slice(block.indexOf("season_group_counts AS"));
    expect(groupBlock).toContain("FROM umrah_groups");
    expect(groupBlock).toContain('"deletedAt" IS NULL');
    expect(groupBlock).toContain('GROUP BY "seasonId", "companyId"');
  });

  it("LEFT JOINs both CTEs back to umrah_seasons on (seasonId, companyId)", () => {
    expect(block).toMatch(
      /LEFT JOIN season_pilgrim_counts spc\s+ON spc\."seasonId" = s\.id AND spc\."companyId" = s\."companyId"/,
    );
    expect(block).toMatch(
      /LEFT JOIN season_group_counts sgc\s+ON sgc\."seasonId" = s\.id AND sgc\."companyId" = s\."companyId"/,
    );
  });

  it("both counters COALESCE to 0::int for seasons with no pilgrims/groups yet", () => {
    expect(block).toContain('COALESCE(spc."pilgrimsCount", 0)::int AS "pilgrimsCount"');
    expect(block).toContain('COALESCE(sgc."groupsCount", 0)::int AS "groupsCount"');
  });
});
